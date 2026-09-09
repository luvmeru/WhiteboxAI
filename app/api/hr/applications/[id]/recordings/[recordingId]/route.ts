import { getHrSession } from "@/lib/server/auth";
import {
  ApiError,
  getClientKey,
  getRequestId,
} from "@/lib/server/http";
import {
  findStoredRecordingById,
  readPrivateRecording,
  readPrivateRecordingRange,
} from "@/lib/server/media";
import {
  consumeRateLimit,
  rateLimitHeaders,
  type RateLimitResult,
} from "@/lib/server/rate-limit";
import {
  getTenantApplication,
  getTenantVacancyVersion,
  recordRecordingPlayback,
} from "@/lib/server/repository";
import { assertReviewerAuthorized } from "@/lib/server/reviewer-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; recordingId: string }> },
) {
  const requestId = getRequestId(request);
  let limiter: RateLimitResult | undefined;
  try {
    try {
      limiter = await consumeRateLimit(getClientKey(request), {
        namespace: "hr.recording.playback",
        limit: 120,
        windowMs: 10 * 60_000,
      });
    } catch {
      throw new ApiError(
        503,
        "RATE_LIMIT_STORE_UNAVAILABLE",
        "Request protection is temporarily unavailable. Please retry shortly.",
      );
    }
    if (!limiter.allowed) {
      throw new ApiError(429, "RATE_LIMITED", "Too many recording requests.");
    }
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
      throw new ApiError(403, "CROSS_SITE_REQUEST", "Cross-site recording access is blocked.");
    }

    const session = await getHrSession();
    if (!session) {
      throw new ApiError(401, "HR_SESSION_REQUIRED", "Authentication is required.");
    }
    const { id, recordingId } = await params;
    if (id.length > 200 || recordingId.length > 64) {
      throw new ApiError(404, "NOT_FOUND", "Recording not found.");
    }
    const application = await getTenantApplication(id, session.organizationId);
    if (!application) {
      throw new ApiError(404, "NOT_FOUND", "Recording not found.");
    }
    const matchingTurnNumbers = application.history.flatMap(
      (turn, index) =>
        turn.recordingId === recordingId ? [index + 1] : [],
    );
    if (matchingTurnNumbers.length !== 1) {
      throw new ApiError(404, "NOT_FOUND", "Recording not found.");
    }
    const turnNumber = matchingTurnNumbers[0]!;
    const turn = application.history[turnNumber - 1]!;
    const vacancy = await getTenantVacancyVersion(
      application.vacancyId,
      application.vacancyVersion,
      session.organizationId,
    );
    if (!vacancy) {
      throw new ApiError(404, "NOT_FOUND", "Recording not found.");
    }
    assertReviewerAuthorized({
      session,
      vacancy,
      application,
      capability: "evidence_read",
      evidenceMode: "raw",
    });
    const recording = await findStoredRecordingById({
      id: recordingId,
      applicationId: application.id,
      organizationId: session.organizationId,
    });
    if (!recording) {
      throw new ApiError(404, "NOT_FOUND", "Recording not found.");
    }
    if (
      recording.turnNumber !== turnNumber ||
      turn.transcript?.recordingId !== recording.id ||
      turn.transcript.recordingSha256 !== recording.contentSha256
    ) {
      throw new ApiError(404, "NOT_FOUND", "Recording not found.");
    }
    const range = parseRange(request.headers.get("range"), recording.byteSize);
    const body = range
      ? await readPrivateRecordingRange(recording, range.start, range.end)
      : await readPrivateRecording(recording);
    // The attestation is server-owned and is written only after the exact
    // protected object has been read successfully.
    await recordRecordingPlayback(
      application,
      recording,
      session,
      requestId,
    );
    const headers = playbackHeaders(
      requestId,
      recording.contentType,
      body.byteLength,
      limiter,
    );
    if (range) {
      headers.set(
        "Content-Range",
        `bytes ${range.start}-${range.end}/${recording.byteSize}`,
      );
    }
    return new Response(Uint8Array.from(body), {
      status: range ? 206 : 200,
      headers,
    });
  } catch (error) {
    const normalized =
      error instanceof ApiError
        ? error
        : new ApiError(
            500,
            "INTERNAL_ERROR",
            "The recording could not be loaded.",
            false,
          );
    const headers = playbackHeaders(
      requestId,
      "application/json; charset=utf-8",
      undefined,
      limiter,
    );
    if (normalized.status === 401) {
      headers.set("WWW-Authenticate", 'Session realm="WhiteBox HR"');
    }
    return new Response(
      JSON.stringify({
        error: normalized.expose
          ? normalized.message
          : "The recording could not be loaded.",
        code: normalized.code,
        requestId,
      }),
      { status: normalized.status, headers },
    );
  }
}

function parseRange(
  value: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) {
    throw new ApiError(416, "INVALID_RANGE", "The requested byte range is invalid.");
  }
  const rawStart = match[1];
  const rawEnd = match[2];
  let start: number;
  let end: number;
  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) {
      throw new ApiError(416, "INVALID_RANGE", "The requested byte range is invalid.");
    }
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    throw new ApiError(416, "INVALID_RANGE", "The requested byte range is invalid.");
  }
  return { start, end: Math.min(end, size - 1) };
}

function playbackHeaders(
  requestId: string,
  contentType: string,
  contentLength: number | undefined,
  limiter?: RateLimitResult,
): Headers {
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": "inline",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Content-Type": contentType,
    "Cross-Origin-Resource-Policy": "same-origin",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Request-Id": requestId,
  });
  if (contentLength !== undefined) {
    headers.set("Content-Length", String(contentLength));
  }
  if (limiter) {
    for (const [key, value] of Object.entries(rateLimitHeaders(limiter))) {
      if (value !== undefined) headers.set(key, String(value));
    }
  }
  return headers;
}
