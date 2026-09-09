import {
  renderFrozenGateEvidence,
  resolvePersistedReviewEvidence,
} from "@/lib/server/assessment-evidence";
import {
  buildAssessmentReviewTargets,
  buildGateWaiverReviewTargets,
} from "@/lib/server/application-evaluation";
import {
  readPrivateArtifact,
  resolveArtifactReference,
  type ArtifactContentType,
} from "@/lib/server/artifacts";
import { getHrSession } from "@/lib/server/auth";
import {
  ApiError,
  assertSameOriginBrowserRequest,
  getClientKey,
  getRequestId,
} from "@/lib/server/http";
import {
  consumeRateLimit,
  rateLimitHeaders,
  type RateLimitResult,
} from "@/lib/server/rate-limit";
import { getHrReferenceResponseEvidence } from "@/lib/server/reference-checks";
import {
  getTenantApplication,
  getTenantVacancyVersion,
  recordAssessmentEvidenceAccess,
} from "@/lib/server/repository";
import { assertReviewerAuthorized } from "@/lib/server/reviewer-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const REVIEW_ROLES = new Set([
  "Owner",
  "HiringManager",
  "TechnicalReviewer",
]);
const TARGET_ID = /^[a-f0-9]{64}$/u;

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      targetId: string;
      receiptIndex: string;
    }>;
  },
) {
  const requestId = getRequestId(request);
  let limiter: RateLimitResult | undefined;
  try {
    assertSameOriginBrowserRequest(request);
    const { id, targetId, receiptIndex: rawReceiptIndex } = await params;
    if (
      id.length < 1 ||
      id.length > 200 ||
      !TARGET_ID.test(targetId) ||
      !/^(?:0|[1-9]\d?)$/u.test(rawReceiptIndex)
    ) {
      throw new ApiError(404, "NOT_FOUND", "Evidence not found.");
    }
    const receiptIndex = Number(rawReceiptIndex);

    try {
      limiter = await consumeRateLimit(`${getClientKey(request)}:${id}`, {
        namespace: "hr.assessment-evidence.read",
        limit: 120,
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
        "Too many evidence requests.",
      );
    }

    const session = await getHrSession();
    if (!session) {
      throw new ApiError(
        401,
        "HR_SESSION_REQUIRED",
        "Authentication is required.",
      );
    }
    if (!REVIEW_ROLES.has(session.role)) {
      throw new ApiError(
        403,
        "ROLE_FORBIDDEN",
        "Your role does not permit assessment evidence review.",
      );
    }
    const application = await getTenantApplication(
      id,
      session.organizationId,
    );
    if (!application?.blockResults) {
      throw new ApiError(404, "NOT_FOUND", "Evidence not found.");
    }
    const vacancy = await getTenantVacancyVersion(
      application.vacancyId,
      application.vacancyVersion,
      session.organizationId,
    );
    if (!vacancy) {
      throw new ApiError(
        409,
        "VACANCY_VERSION_MISSING",
        "The exact published vacancy version is unavailable.",
      );
    }
    assertReviewerAuthorized({
      session,
      vacancy,
      application,
      capability: "evidence_read",
      evidenceMode: "raw",
    });

    const reviewContext = {
      organizationId: application.organizationId,
      applicationId: application.id,
      reviews: application.assessmentReviews ?? [],
    };
    const target = [
      ...buildAssessmentReviewTargets(
        vacancy,
        application.blockResults,
        reviewContext,
      ),
      ...buildGateWaiverReviewTargets(
        vacancy,
        application.evaluation,
        reviewContext,
      ),
    ].find((candidate) => candidate.targetId === targetId);
    if (!target || !target.evidenceReceipts[receiptIndex]) {
      throw new ApiError(404, "NOT_FOUND", "Evidence not found.");
    }
    assertReviewerAuthorized({
      session,
      vacancy,
      application,
      capability: "evidence_read",
      evidenceMode: "raw",
      blindReviewRequired: target.blindReviewRequired,
      deidentifiedEvidenceAvailable: false,
    });

    const receipt = target.evidenceReceipts[receiptIndex];
    const externalQuestionnaire =
      receipt.source === "external_questionnaire"
        ? await referenceResponseText(
            receipt.locator,
            target.binding.sourceItemId,
            {
              organizationId: application.organizationId,
              applicationId: application.id,
              vacancyId: application.vacancyId,
              vacancyVersion: application.vacancyVersion,
              blockId: target.binding.blockId,
            },
          )
        : null;
    const frozenGate =
      receiptIndex === 0
        ? renderFrozenGateEvidence(
            target,
            application.evaluation?.gateResults,
          )
        : null;
    const evidence =
      externalQuestionnaire ??
      frozenGate ??
      resolvePersistedReviewEvidence(
        target,
        application.blockResults,
        receiptIndex,
      );
    if (!evidence) {
      throw new ApiError(
        409,
        "EVIDENCE_UNAVAILABLE",
        "The exact persisted evidence is unavailable or has expired.",
      );
    }
    if (evidence.kind === "text") {
      await recordAssessmentEvidenceAccess(
        application,
        {
          targetId: target.targetId,
          blockId: target.binding.blockId,
          receiptIndex,
          receiptLocator: receipt.locator,
        },
        session,
        requestId,
      );
      return new Response(evidence.text, {
        status: 200,
        headers: evidenceHeaders(
          requestId,
          "text/plain; charset=utf-8",
          new TextEncoder().encode(evidence.text).byteLength,
          "inline",
          limiter,
        ),
      });
    }

    const artifact = await resolveArtifactReference(evidence.reference, {
      organizationId: application.organizationId,
      applicationId: application.id,
      applicationVersion: evidence.applicationVersion,
      blockId: target.binding.blockId,
      purposes: [evidence.purpose],
    });
    if (
      !artifact ||
      artifact.contentType !== evidence.expectedContentType ||
      artifact.byteSize !== evidence.expectedByteSize
    ) {
      throw new ApiError(
        409,
        "EVIDENCE_BINDING_MISMATCH",
        "The persisted artifact no longer matches its immutable submission receipt.",
      );
    }
    const bytes = await readPrivateArtifact(artifact);
    await recordAssessmentEvidenceAccess(
      application,
      {
        targetId: target.targetId,
        blockId: target.binding.blockId,
        receiptIndex,
        receiptLocator: receipt.locator,
      },
      session,
      requestId,
    );
    return new Response(Uint8Array.from(bytes), {
      status: 200,
      headers: evidenceHeaders(
        requestId,
        artifact.contentType,
        bytes.byteLength,
        `attachment; filename="${genericArtifactName(artifact.contentType)}"`,
        limiter,
      ),
    });
  } catch (error) {
    const normalized =
      error instanceof ApiError
        ? error
        : new ApiError(
            500,
            "INTERNAL_ERROR",
            "The evidence could not be loaded.",
            false,
          );
    const headers = evidenceHeaders(
      requestId,
      "application/json; charset=utf-8",
      undefined,
      "inline",
      limiter,
    );
    if (normalized.status === 401) {
      headers.set("WWW-Authenticate", 'Session realm="WhiteBox HR"');
    }
    return new Response(
      JSON.stringify({
        error: normalized.expose
          ? normalized.message
          : "The evidence could not be loaded.",
        code: normalized.code,
        requestId,
      }),
      { status: normalized.status, headers },
    );
  }
}

async function referenceResponseText(
  locator: string,
  sourceItemId: string,
  scope: {
    organizationId: string;
    applicationId: string;
    vacancyId: string;
    vacancyVersion: number;
    blockId: string;
  },
): Promise<{ kind: "text"; label: string; text: string } | null> {
  const prefix = "reference-response:";
  const suffix = `:${sourceItemId}`;
  if (
    !sourceItemId ||
    !locator.startsWith(prefix) ||
    !locator.endsWith(suffix)
  ) {
    return null;
  }
  const receiptId = locator.slice(
    prefix.length,
    locator.length - suffix.length,
  );
  if (!receiptId) return null;
  const evidence = await getHrReferenceResponseEvidence({
    receiptId,
    sourceItemId,
    organizationId: scope.organizationId,
  });
  if (
    !evidence ||
    evidence.receiptId !== receiptId ||
    evidence.applicationId !== scope.applicationId ||
    evidence.vacancyId !== scope.vacancyId ||
    evidence.vacancyVersion !== scope.vacancyVersion ||
    evidence.blockId !== scope.blockId ||
    evidence.question.id !== sourceItemId ||
    evidence.answer.questionId !== sourceItemId
  ) {
    return null;
  }
  const relationship =
    evidence.relationship === "manager"
      ? "Manager"
      : evidence.relationship === "peer"
        ? "Peer"
        : "Direct report";
  const response = evidence.answer.unableToObserve
    ? "Unable to observe"
    : evidence.answer.type === "rating"
      ? `Rating: ${evidence.answer.rating} of 5`
      : `Response: ${evidence.answer.text}`;
  return {
    kind: "text",
    label: "Exact frozen reference response",
    text: [
      `Reference ${evidence.refereeOrdinal} · ${relationship}`,
      `Received at: ${evidence.receivedAt}`,
      "",
      `Question: ${evidence.question.text}`,
      response,
    ].join("\n"),
  };
}

function genericArtifactName(contentType: ArtifactContentType): string {
  const extension: Record<ArtifactContentType, string> = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
    "text/plain": "txt",
    "text/markdown": "md",
    "text/csv": "csv",
    "application/json": "json",
    "application/zip": "zip",
  };
  return `assessment-evidence.${extension[contentType]}`;
}

function evidenceHeaders(
  requestId: string,
  contentType: string,
  contentLength: number | undefined,
  contentDisposition: string,
  limiter?: RateLimitResult,
): Headers {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": contentDisposition,
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Content-Type": contentType,
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
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
