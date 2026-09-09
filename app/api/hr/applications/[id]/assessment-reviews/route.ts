import {
  assessmentReviewBindingHash,
  type AssessmentGateWaiverOutcome,
  type AssessmentVerificationOutcome,
} from "@/lib/server/assessment-review";
import {
  buildAssessmentReviewTargets,
  buildGateWaiverReviewTargets,
} from "@/lib/server/application-evaluation";
import { getHrSession } from "@/lib/server/auth";
import {
  ApiError,
  createJsonApiRoute,
  expectEnum,
  expectNumber,
  expectObject,
  expectOnlyKeys,
  expectString,
  ValidationError,
} from "@/lib/server/http";
import {
  getTenantApplication,
  getTenantVacancyVersion,
  recordAssessmentReview,
} from "@/lib/server/repository";
import { assertReviewerAuthorized } from "@/lib/server/reviewer-authorization";

const VERIFICATION_OUTCOMES = [
  "verified",
  "not_verified",
] as const satisfies readonly AssessmentVerificationOutcome[];
const GATE_OUTCOMES = [
  "waived",
  "upheld",
] as const satisfies readonly AssessmentGateWaiverOutcome[];
interface ReviewBody {
  targetId: string;
  expectedVersion: number;
  idempotencyKey: string;
  level: 1 | 2 | 3 | 4 | 5 | null;
  verificationOutcome: AssessmentVerificationOutcome | null;
  gateWaiverOutcome: AssessmentGateWaiverOutcome | null;
  evidence: { summary: string; locator: string };
  rationale: string;
  supersedesReviewId: string | null;
}

function nullableEnum<const T extends readonly string[]>(
  value: unknown,
  path: string,
  allowed: T,
): T[number] | null {
  return value === null ? null : expectEnum(value, path, allowed);
}

function nullableString(
  value: unknown,
  path: string,
  options: { min: number; max: number },
): string | null {
  return value === null
    ? null
    : expectString(value, path, options);
}

function validateReviewBody(value: unknown): ReviewBody {
  const body = expectObject(value);
  expectOnlyKeys(body, [
    "targetId",
    "expectedVersion",
    "idempotencyKey",
    "level",
    "verificationOutcome",
    "gateWaiverOutcome",
    "evidence",
    "rationale",
    "supersedesReviewId",
  ]);
  const level =
    body.level === null
      ? null
      : expectNumber(body.level, "body.level", {
          min: 1,
          max: 5,
          integer: true,
        });
  if (
    level !== null &&
    ![1, 2, 3, 4, 5].includes(level)
  ) {
    throw new ValidationError(
      "body.level",
      "must be an exact published BARS level from 1 to 5",
    );
  }
  const evidence = expectObject(body.evidence, "body.evidence");
  expectOnlyKeys(
    evidence,
    ["summary", "locator"],
    "body.evidence",
  );
  return {
    targetId: expectString(body.targetId, "body.targetId", {
      min: 64,
      max: 64,
    }),
    expectedVersion: expectNumber(
      body.expectedVersion,
      "body.expectedVersion",
      { min: 1, max: 1_000_000, integer: true },
    ),
    idempotencyKey: expectString(
      body.idempotencyKey,
      "body.idempotencyKey",
      { min: 16, max: 200 },
    ),
    level: level as ReviewBody["level"],
    verificationOutcome: nullableEnum(
      body.verificationOutcome,
      "body.verificationOutcome",
      VERIFICATION_OUTCOMES,
    ),
    gateWaiverOutcome: nullableEnum(
      body.gateWaiverOutcome,
      "body.gateWaiverOutcome",
      GATE_OUTCOMES,
    ),
    evidence: {
      summary: expectString(
        evidence.summary,
        "body.evidence.summary",
        { min: 20, max: 2_000 },
      ),
      locator: expectString(
        evidence.locator,
        "body.evidence.locator",
        { min: 3, max: 300 },
      ),
    },
    rationale: expectString(body.rationale, "body.rationale", {
      min: 20,
      max: 2_000,
    }),
    supersedesReviewId: nullableString(
      body.supersedesReviewId,
      "body.supersedesReviewId",
      { min: 1, max: 200 },
    ),
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const route = createJsonApiRoute(
    {
      routeId: "hr.application.assessment-review",
      access: "hr",
      roles: ["Owner", "HiringManager", "TechnicalReviewer"],
      sameOrigin: true,
      maxBodyBytes: 16 * 1024,
      rateLimit: { limit: 40, windowMs: 60_000 },
      validate: validateReviewBody,
    },
    async ({ body, principal, requestId }) => {
      const session = await getHrSession();
      if (!session || !principal?.organizationId) {
        throw new Error("Authenticated session is unavailable.");
      }
      if (
        session.organizationId !== principal.organizationId ||
        session.sub !== principal.subject
      ) {
        throw new ApiError(
          403,
          "SESSION_SCOPE_MISMATCH",
          "The authenticated user does not match the tenant-scoped API principal.",
        );
      }
      const application = await getTenantApplication(
        id,
        principal.organizationId,
      );
      if (!application) {
        throw new ApiError(404, "NOT_FOUND", "Application not found.");
      }
      const vacancy = await getTenantVacancyVersion(
        application.vacancyId,
        application.vacancyVersion,
        principal.organizationId,
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
        capability: "assessment_review",
        evidenceMode: "raw",
      });
      if (!application.blockResults) {
        throw new ApiError(
          409,
          "ASSESSMENT_RUNTIME_MISSING",
          "This application has no frozen multi-block evidence runtime.",
        );
      }
      const reviewContext = {
        organizationId: application.organizationId,
        applicationId: application.id,
        reviews: application.assessmentReviews ?? [],
      };
      const targets = [
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
      ];
      const target = targets.find(
        (candidate) => candidate.targetId === body.targetId,
      );
      if (!target) {
        throw new ApiError(
          409,
          "REVIEW_TARGET_STALE",
          "The review target is not part of the application's exact frozen evidence plan.",
        );
      }
      assertReviewerAuthorized({
        session,
        vacancy,
        application,
        capability: "assessment_review",
        evidenceMode: "raw",
        blindReviewRequired: target.blindReviewRequired,
        deidentifiedEvidenceAvailable: false,
      });
      if (!target.reviewable) {
        throw new ApiError(
          409,
          "TRUSTED_EVIDENCE_PENDING",
          target.unavailableReason ??
            "This target is awaiting a server-owned evidence receipt.",
        );
      }
      if (
        target.binding.kind === "gate_waiver" &&
        session.role !== "Owner" &&
        session.role !== "HiringManager"
      ) {
        throw new ApiError(
          403,
          "ROLE_FORBIDDEN",
          "Only an owner or hiring manager may adjudicate a failed gate.",
        );
      }
      try {
        const recorded = await recordAssessmentReview(
          application,
          vacancy,
          {
            binding: target.binding,
            expectedLockVersion: body.expectedVersion,
            idempotencyKey: body.idempotencyKey,
            level: body.level,
            verificationOutcome: body.verificationOutcome,
            gateWaiverOutcome: body.gateWaiverOutcome,
            evidence: body.evidence,
            rationale: body.rationale,
            supersedesReviewId: body.supersedesReviewId,
          },
          session,
          requestId,
        );
        return {
          created: recorded.created,
          application: {
            id: recorded.application.id,
            stage: recorded.application.stage,
            lockVersion: recorded.application.lockVersion,
          },
          review: {
            id: recorded.review.id,
            targetId: assessmentReviewBindingHash(recorded.review),
            kind: recorded.review.kind,
            reviewerUserId: recorded.review.reviewerUserId,
            createdAt: recorded.review.createdAt,
            supersedesReviewId:
              recorded.review.supersedesReviewId,
          },
        };
      } catch (error) {
        if (error instanceof ApiError) throw error;
        const message =
          error instanceof Error
            ? error.message
            : "The trusted review could not be recorded.";
        if (
          message.includes("Only an owner or hiring manager")
        ) {
          throw new ApiError(403, "ROLE_FORBIDDEN", message);
        }
        throw new ApiError(
          409,
          message.includes("idempotency key")
            ? "IDEMPOTENCY_CONFLICT"
            : message.includes("updated by another request")
              ? "VERSION_CONFLICT"
              : message.includes(
                    "must open the exact server-owned evidence receipt",
                  )
                ? "EVIDENCE_ACCESS_REQUIRED"
              : "ASSESSMENT_REVIEW_CONFLICT",
          message,
        );
      }
    },
  );
  return route(request);
}
