import { getHrSession } from "@/lib/server/auth";
import {
  ApiError,
  createJsonApiRoute,
  expectNumber,
  expectObject,
  expectOnlyKeys,
  expectString,
} from "@/lib/server/http";
import {
  getTenantApplication,
  getTenantVacancyVersion,
  recordHumanDecision,
  type HumanDecisionKind,
} from "@/lib/server/repository";
import {
  assertHumanDecisionEvaluationPolicy,
  HumanDecisionPolicyError,
} from "@/lib/server/human-decision-policy";
import { assertReviewerAuthorized } from "@/lib/server/reviewer-authorization";

const DECISIONS = new Set<HumanDecisionKind>([
  "advance",
  "hold",
  "reject",
  "request_rescore",
]);

function validateDecision(value: unknown): {
  decision: HumanDecisionKind;
  reason: string;
  expectedVersion: number;
} {
  const body = expectObject(value);
  expectOnlyKeys(body, ["decision", "reason", "expectedVersion"]);
  const decision = expectString(body.decision, "body.decision", {
    min: 1,
    max: 40,
  });
  if (!DECISIONS.has(decision as HumanDecisionKind)) {
    throw new ApiError(422, "INVALID_DECISION", "The decision is not supported.");
  }
  return {
    decision: decision as HumanDecisionKind,
    reason: expectString(body.reason, "body.reason", {
      min: 8,
      max: 2_000,
      trim: true,
    }),
    expectedVersion: expectNumber(
      body.expectedVersion,
      "body.expectedVersion",
      { min: 1, max: 1_000_000, integer: true },
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
      routeId: "hr.application.decision",
      access: "hr",
      roles: ["Owner", "HiringManager", "TechnicalReviewer"],
      sameOrigin: true,
      maxBodyBytes: 8 * 1024,
      rateLimit: { limit: 30, windowMs: 60_000 },
      validate: validateDecision,
    },
    async ({ body, principal, requestId }) => {
      const session = await getHrSession();
      if (!session || !principal?.organizationId) {
        throw new Error("Authenticated session is unavailable.");
      }
      if (
        (body.decision === "advance" || body.decision === "reject") &&
        session.role === "TechnicalReviewer"
      ) {
        throw new ApiError(
          403,
          "ROLE_FORBIDDEN",
          "Only an owner or hiring manager can record a final disposition.",
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
      });
      try {
        assertHumanDecisionEvaluationPolicy(
          body.decision,
          application.evaluation,
          {
            evaluationRequired: Boolean(application.assessmentPlan),
          },
        );
      } catch (error) {
        if (error instanceof HumanDecisionPolicyError) {
          throw new ApiError(409, error.code, error.message);
        }
        throw error;
      }
      if (
        [
          "offer",
          "hired",
          "not_moving_forward",
          "knocked_out",
          "withdrawn",
        ].includes(application.stage)
      ) {
        throw new ApiError(
          409,
          "FINAL_STAGE_LOCKED",
          "This application has a terminal outcome. Use a governed override workflow instead of replacing it.",
        );
      }
      const isFinalReview =
        body.decision === "advance" || body.decision === "reject";
      const decisions = application.humanDecisions ?? [];
      const lastRescoreIndex = decisions.findLastIndex(
        (item) => item.decision === "request_rescore",
      );
      const currentReviewRound = decisions.slice(lastRescoreIndex + 1);
      if (
        isFinalReview &&
        currentReviewRound.some(
          (item) =>
            (item.decision === "advance" || item.decision === "reject") &&
            item.actorUserId === session.sub,
        )
      ) {
        throw new ApiError(
          409,
          "INDEPENDENT_REVIEW_REQUIRED",
          "A different reviewer must submit the next independent final review.",
        );
      }
      if (application.lockVersion !== body.expectedVersion) {
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "Application changed. Reload before recording a decision.",
        );
      }
      const updated = await recordHumanDecision(
        application,
        {
          decision: body.decision,
          reason: body.reason,
          expectedLockVersion: body.expectedVersion,
        },
        session,
        requestId,
      );
      const updatedDecisions = updated.humanDecisions ?? [];
      const updatedLastRescoreIndex = updatedDecisions.findLastIndex(
        (item) => item.decision === "request_rescore",
      );
      const finalReviews = updatedDecisions
        .slice(updatedLastRescoreIndex + 1)
        .filter(
          (item) =>
            item.decision === "advance" || item.decision === "reject",
        );
      const latestDecision = updated.humanDecisions?.at(-1);
      return {
        application: {
          id: updated.id,
          stage: updated.stage,
          lockVersion: updated.lockVersion,
        },
        decision: latestDecision,
        review: {
          required: updated.requiredIndependentReviews ?? 1,
          collected: new Set(
            finalReviews
              .filter((item) => item.decision === body.decision)
              .map((item) => item.actorUserId),
          ).size,
          complete:
            isFinalReview &&
            latestDecision?.resultingStage !== "needs_adjudication",
        },
      };
    },
  );
  return route(request);
}
