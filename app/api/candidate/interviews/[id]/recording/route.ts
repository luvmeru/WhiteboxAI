import { getCandidateSession } from "@/lib/server/candidate-auth";
import {
  transcribeInterviewRecording,
} from "@/lib/server/ai-provider";
import { applicationAiExecutionMode } from "@/lib/server/ai-rollout";
import {
  ApiError,
  assertSameOriginBrowserRequest,
  getClientKey,
  getRequestId,
} from "@/lib/server/http";
import {
  assertRecordingRequestHeaders,
  finalizeRecordingTranscription,
  issueRecordingReceipt,
  parseRecordingMultipart,
  storePrivateRecording,
} from "@/lib/server/media";
import {
  consumeRateLimit,
  rateLimitHeaders,
  type RateLimitResult,
} from "@/lib/server/rate-limit";
import { getCandidateApplication } from "@/lib/server/repository";
import {
  getServerEnv,
  isDevelopmentDemoMode,
} from "@/lib/server/env";
import { verifyVideoRecording } from "@/lib/server/video-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  let limiter: RateLimitResult | undefined;

  try {
    assertSameOriginBrowserRequest(request);
    assertRecordingRequestHeaders(request);

    const { id } = await params;
    if (!id || id.length > 200) {
      throw new ApiError(404, "NOT_FOUND", "Application not found.");
    }
    const session = await getCandidateSession();
    if (!session || session.applicationId !== id) {
      throw new ApiError(
        401,
        "CANDIDATE_SESSION_REQUIRED",
        "Candidate session is missing or expired.",
      );
    }

    // Scope upload pressure to the authenticated application as well as the
    // client. A shared-IP office, accessibility lab, or E2E runner must not let
    // one candidate exhaust every other candidate's recording allowance.
    try {
      limiter = await consumeRateLimit(`${getClientKey(request)}:${id}`, {
        namespace: "candidate.interview.recording",
        limit: 12,
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
      throw new ApiError(429, "RATE_LIMITED", "Too many recording uploads. Please try again later.");
    }

    const application = await getCandidateApplication(id, session.token);
    if (!application) {
      throw new ApiError(404, "NOT_FOUND", "Application not found.");
    }
    if (!application.consentAt) {
      throw new ApiError(409, "CONSENT_REQUIRED", "Consent is required before recording.");
    }
    if (application.interviewMode === "text_accommodation") {
      throw new ApiError(
        409,
        "TEXT_ACCOMMODATION_ACTIVE",
        "Recorded media is disabled while the text accommodation is active.",
      );
    }
    if (application.stage !== "in_progress") {
      throw new ApiError(409, "INTERVIEW_COMPLETE", "This interview is already complete.");
    }
    const openQuestion = application.history.at(-1);
    if (
      !openQuestion ||
      openQuestion.answer ||
      (application.assessmentPlan &&
        openQuestion.blockId !== application.interviewBlockId)
    ) {
      throw new ApiError(
        409,
        "NO_OPEN_QUESTION",
        "There is no open interview question for this recording.",
      );
    }

    const upload = await parseRecordingMultipart(request);
    if (application.lockVersion !== upload.expectedVersion) {
      throw new ApiError(409, "VERSION_CONFLICT", "Interview state changed. Reload before retrying.");
    }
    if (upload.turnNumber !== application.history.length) {
      throw new ApiError(
        409,
        "TURN_CONFLICT",
        "The recording does not match the current interview turn.",
      );
    }
    let verifiedDurationSec: number | undefined;
    if (!isDevelopmentDemoMode()) {
      try {
        const verified = await verifyVideoRecording(
          upload.bytes,
          upload.contentType,
        );
        verifiedDurationSec = verified.durationSec;
        const answerCapSec = Math.min(
          300,
          Math.max(30, openQuestion.answerCapSec ?? 180),
        );
        if (verified.durationSec > answerCapSec + 1) {
          throw new Error("Recording exceeds the published answer cap.");
        }
      } catch {
        throw new ApiError(
          422,
          "INVALID_VIDEO_RECORDING",
          "The answer must be a decodable camera-and-microphone video within the configured duration.",
        );
      }
    }

    const createdAt = Date.parse(application.createdAt);
    const retentionDeadline = new Date(
      createdAt + application.retentionDays * 86_400_000,
    );
    if (
      !Number.isFinite(createdAt) ||
      !Number.isFinite(retentionDeadline.getTime()) ||
      !Number.isSafeInteger(application.retentionDays) ||
      application.retentionDays < 1 ||
      application.retentionDays > 3_650
    ) {
      throw new ApiError(
        500,
        "INVALID_RETENTION_POLICY",
        "The recording could not be accepted.",
        false,
      );
    }

    const storedResult = await storePrivateRecording({
      applicationId: application.id,
      organizationId: application.organizationId,
      applicationVersion: application.lockVersion,
      turnNumber: upload.turnNumber,
      contentType: upload.contentType,
      bytes: upload.bytes,
      retentionDeadline: retentionDeadline.toISOString(),
    });
    let recording = storedResult.recording;
    const reused = storedResult.reused;
    const aiExecutionMode = applicationAiExecutionMode(
      application.aiExecutionMode,
    );
    let transcript = recording.providerTranscript ?? "";
    let transcriptionWarning: string | undefined;
    if (recording.transcriptionStatus === "pending") {
      let provider:
        | Awaited<ReturnType<typeof transcribeInterviewRecording>>
        | undefined;
      try {
        provider = await transcribeInterviewRecording(
          upload.recording,
          aiExecutionMode,
        );
      } catch {
        if (aiExecutionMode === "openai_required") {
          throw new ApiError(
            503,
            "AI_TRANSCRIPTION_UNAVAILABLE",
            "Automatic transcription is temporarily unavailable. The recording was kept private; retry this upload before continuing.",
          );
        }
        provider = undefined;
      }
      if (provider?.text.trim()) {
        recording = await finalizeRecordingTranscription(recording, {
          status: "succeeded",
          transcript: provider.text,
          providerModel: provider.model,
        });
        transcript = recording.providerTranscript ?? "";
      } else {
        if (aiExecutionMode === "openai_required") {
          throw new ApiError(
            503,
            "AI_TRANSCRIPTION_UNAVAILABLE",
            "Automatic transcription returned no usable text. The recording was kept private; retry this upload before continuing.",
          );
        }
        recording = await finalizeRecordingTranscription(recording, {
          status: "unavailable",
          providerModel:
            provider?.model ?? getServerEnv().OPENAI_TRANSCRIBE_MODEL,
        });
        transcriptionWarning =
          "Automatic transcription is unavailable. Enter the answer manually and explain the correction; a human must verify it against the clip before AI evaluation.";
      }
    } else if (recording.transcriptionStatus === "unavailable") {
      transcriptionWarning =
        "Automatic transcription is unavailable. Enter the answer manually and explain the correction; a human must verify it against the clip before AI evaluation.";
    }

    const receipt = await issueRecordingReceipt(recording);

    return recordingResponse(
      {
        recording: {
          id: recording.id,
          turnNumber: recording.turnNumber,
          applicationVersion: recording.applicationVersion,
          contentType: recording.contentType,
          byteSize: recording.byteSize,
          sha256: recording.contentSha256,
          durationSec: verifiedDurationSec,
          reused,
        },
        receipt: receipt.receipt,
        receiptExpiresAt: receipt.expiresAt,
        transcript,
        transcription: {
          status: recording.transcriptionStatus,
          providerModel: recording.providerModel,
          providerTranscriptSha256: recording.providerTranscriptSha256,
        },
        ...(transcriptionWarning ? { warning: transcriptionWarning } : {}),
      },
      reused ? 200 : 201,
      requestId,
      limiter,
    );
  } catch (error) {
    const normalized =
      error instanceof ApiError
        ? {
            status: error.status,
            code: error.code,
            message: error.expose ? error.message : "The recording could not be accepted.",
          }
        : {
            status: 500,
            code: "INTERNAL_ERROR",
            message: "The recording could not be accepted.",
          };
    return recordingResponse(
      {
        error: normalized.message,
        code: normalized.code,
        requestId,
      },
      normalized.status,
      requestId,
      limiter,
      normalized.status === 401
        ? { "WWW-Authenticate": 'Session realm="WhiteBox Candidate"' }
        : undefined,
    );
  }
}

function recordingResponse(
  body: unknown,
  status: number,
  requestId: string,
  limiter?: RateLimitResult,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Content-Type": "application/json; charset=utf-8",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Request-Id": requestId,
  });
  if (limiter) {
    for (const [key, value] of Object.entries(rateLimitHeaders(limiter))) {
      if (value !== undefined) headers.set(key, String(value));
    }
  }
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  }
  return new Response(JSON.stringify(body), { status, headers });
}
