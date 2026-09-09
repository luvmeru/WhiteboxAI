import { getCandidateSession } from "@/lib/server/candidate-auth";
import {
  assertArtifactRequestHeaders,
  parseArtifactMultipart,
  storePrivateArtifacts,
  type ArtifactPurpose,
} from "@/lib/server/artifacts";
import {
  ApiError,
  assertSameOriginBrowserRequest,
  getClientKey,
  getRequestId,
} from "@/lib/server/http";
import {
  getCandidateApplication,
} from "@/lib/server/repository";
import {
  consumeRateLimit,
  rateLimitHeaders,
  type RateLimitResult,
} from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function purposeFor(kind: string): ArtifactPurpose | null {
  switch (kind) {
    case "cv_intake":
      return "cv_intake";
    case "doc_verification":
      return "document_check";
    case "work_sample":
      return "work_sample";
    case "coding":
      return "coding";
    case "case_exercise":
      return "case_study";
    case "application_form":
    case "custom":
      return "custom";
    default:
      return null;
  }
}

function blockAcceptsFiles(
  block: NonNullable<
    NonNullable<
      Awaited<ReturnType<typeof getCandidateApplication>>
    >["assessmentPlan"]
  >["blocks"][number],
): boolean {
  const manifest = block.manifest;
  if (manifest.kind === "application_form") {
    return manifest.fields.some((field) => field.type === "file");
  }
  if (
    manifest.kind === "cv_intake" ||
    manifest.kind === "doc_verification" ||
    manifest.kind === "case_exercise"
  ) {
    return true;
  }
  if (manifest.kind === "work_sample") {
    return manifest.deliverables.some(
      (kind) => kind === "file" || kind === "spreadsheet",
    );
  }
  if (manifest.kind === "custom") {
    return manifest.primitives.includes("file");
  }
  return false;
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; blockId: string }>;
  },
) {
  const requestId = getRequestId(request);
  let limiter: RateLimitResult | undefined;
  try {
    assertSameOriginBrowserRequest(request);
    assertArtifactRequestHeaders(request);
    const { id, blockId } = await params;
    const session = await getCandidateSession();
    if (!session || session.applicationId !== id) {
      throw new ApiError(
        401,
        "CANDIDATE_SESSION_REQUIRED",
        "Candidate session is missing or expired.",
      );
    }
    try {
      limiter = await consumeRateLimit(`${getClientKey(request)}:${id}`, {
        namespace: "candidate.assessment.artifact",
        limit: 20,
        windowMs: 10 * 60_000,
      });
    } catch {
      throw new ApiError(
        503,
        "RATE_LIMIT_STORE_UNAVAILABLE",
        "Request protection is temporarily unavailable.",
      );
    }
    if (!limiter.allowed) {
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Too many artifact uploads. Please retry shortly.",
      );
    }

    const application = await getCandidateApplication(id, session.token);
    if (!application) {
      throw new ApiError(404, "NOT_FOUND", "Application not found.");
    }
    if (!application.consentAt) {
      throw new ApiError(
        409,
        "CONSENT_REQUIRED",
        "Accept the published notice before uploading evidence.",
      );
    }
    if (
      !application.assessmentPlan ||
      !application.blockRuns ||
      application.currentBlockIndex === undefined
    ) {
      throw new ApiError(
        409,
        "ASSESSMENT_PLAN_MISSING",
        "This application does not use assessment artifacts.",
      );
    }
    if (application.stage !== "in_progress") {
      throw new ApiError(
        409,
        "APPLICATION_NOT_OPEN",
        "This application is not accepting uploads right now.",
      );
    }
    const block =
      application.assessmentPlan.blocks[application.currentBlockIndex];
    const run = application.blockRuns[application.currentBlockIndex];
    if (
      !block ||
      !run ||
      block.id !== blockId ||
      !["available", "in_progress"].includes(run.status) ||
      !blockAcceptsFiles(block)
    ) {
      throw new ApiError(
        409,
        "BLOCK_NOT_OPEN",
        "The current assessment stage does not accept this upload.",
      );
    }
    const purpose = purposeFor(block.kind);
    if (!purpose) {
      throw new ApiError(
        409,
        "ARTIFACT_PURPOSE_UNAVAILABLE",
        "This stage has no private artifact purpose.",
      );
    }

    const upload = await parseArtifactMultipart(request, {
      blockId: block.id,
      purpose,
    });
    if (upload.expectedVersion !== application.lockVersion) {
      throw new ApiError(
        409,
        "VERSION_CONFLICT",
        "Application state changed. Reload before uploading again.",
      );
    }
    const createdAt = Date.parse(application.createdAt);
    const retentionDeadline = new Date(
      createdAt + application.retentionDays * 86_400_000,
    );
    if (
      !Number.isFinite(createdAt) ||
      !Number.isFinite(retentionDeadline.getTime())
    ) {
      throw new ApiError(
        500,
        "INVALID_RETENTION_POLICY",
        "The artifact could not be accepted.",
        false,
      );
    }
    const stored = await storePrivateArtifacts({
      applicationId: application.id,
      organizationId: application.organizationId,
      applicationVersion: application.lockVersion,
      blockId: block.id,
      purpose,
      idempotencyKey: upload.idempotencyKey,
      files: upload.files,
      retentionDeadline: retentionDeadline.toISOString(),
    });
    const assets = stored.map(({ receipt, reused }) => ({
      uploadId: receipt.reference,
      fileName: receipt.fileName,
      mimeType: receipt.contentType,
      sizeBytes: receipt.byteSize,
      applicationVersion: application.lockVersion,
      reused,
    }));
    return artifactResponse(
      { asset: assets[0], assets, requestId },
      stored.every((item) => item.reused) ? 200 : 201,
      requestId,
      limiter,
    );
  } catch (error) {
    const normalized =
      error instanceof ApiError
        ? {
            status: error.status,
            code: error.code,
            message: error.expose
              ? error.message
              : "The artifact could not be accepted.",
          }
        : {
            status: 500,
            code: "INTERNAL_ERROR",
            message: "The artifact could not be accepted.",
          };
    return artifactResponse(
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

function artifactResponse(
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
    new Headers(extraHeaders).forEach((value, key) =>
      headers.set(key, value),
    );
  }
  return new Response(JSON.stringify(body), { status, headers });
}
