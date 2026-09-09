import { getCandidateSession } from "@/lib/server/candidate-auth";
import {
  candidateBlockControls,
  startCandidateBlockRun,
} from "@/lib/server/assessment-controls";
import {
  ApiError,
  ValidationError,
  createJsonApiRoute,
  expectBoolean,
  expectNumber,
  expectObject,
  expectOnlyKeys,
  expectString,
} from "@/lib/server/http";
import {
  getCandidateApplication,
  saveCandidateApplication,
} from "@/lib/server/repository";

function validateBody(value: unknown): {
  expectedVersion: number;
  restart: boolean;
  reason?: string;
} {
  const body = expectObject(value);
  expectOnlyKeys(body, ["expectedVersion", "restart", "reason"]);
  const restart = expectBoolean(body.restart, "body.restart");
  const reason =
    body.reason === undefined
      ? undefined
      : expectString(body.reason, "body.reason", {
          min: 10,
          max: 1_000,
        });
  if (restart && !reason) {
    throw new ValidationError(
      "body.reason",
      "is required when using a whole-stage retake",
    );
  }
  if (!restart && reason !== undefined) {
    throw new ValidationError(
      "body.reason",
      "is accepted only for a whole-stage retake",
    );
  }
  return {
    expectedVersion: expectNumber(
      body.expectedVersion,
      "body.expectedVersion",
      { min: 1, max: 1_000_000, integer: true },
    ),
    restart,
    ...(reason ? { reason } : {}),
  };
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; blockId: string }>;
  },
) {
  const { id, blockId } = await params;
  const route = createJsonApiRoute(
    {
      routeId: "candidate.assessment.block.start",
      access: "public",
      sameOrigin: true,
      maxBodyBytes: 4 * 1024,
      rateLimit: { limit: 30, windowMs: 10 * 60_000 },
      validate: validateBody,
    },
    async ({ body }) => {
      const session = await getCandidateSession();
      if (!session || session.applicationId !== id) {
        throw new ApiError(
          401,
          "CANDIDATE_SESSION_REQUIRED",
          "Candidate session is missing or expired.",
        );
      }
      const application = await getCandidateApplication(id, session.token);
      if (!application) {
        throw new ApiError(404, "NOT_FOUND", "Application not found.");
      }
      if (
        !application.assessmentPlan ||
        !application.blockRuns ||
        application.currentBlockIndex === undefined
      ) {
        throw new ApiError(
          409,
          "ASSESSMENT_PLAN_MISSING",
          "This application uses the legacy interview flow.",
        );
      }
      if (!application.consentAt) {
        throw new ApiError(
          409,
          "CONSENT_REQUIRED",
          "Accept the published notice before starting this stage.",
        );
      }
      if (application.lockVersion !== body.expectedVersion) {
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "Application state changed. Reload before starting this stage.",
        );
      }
      if (application.stage !== "in_progress") {
        throw new ApiError(
          409,
          "APPLICATION_NOT_OPEN",
          "This application is not accepting candidate evidence right now.",
        );
      }

      const index = application.currentBlockIndex;
      const block = application.assessmentPlan.blocks[index];
      const run = application.blockRuns[index];
      if (!block || !run || block.id !== blockId || run.blockId !== blockId) {
        throw new ApiError(
          409,
          "BLOCK_NOT_OPEN",
          "This stage is not currently open.",
        );
      }
      if (
        block.delivery.availability !== "ready" ||
        ![
          "candidate_input",
          "interview_runtime",
          "candidate_then_external_participants",
        ].includes(
          block.delivery.state,
        )
      ) {
        throw new ApiError(
          409,
          "BLOCK_NOT_CANDIDATE_STARTABLE",
          "This stage cannot be started through the candidate runtime.",
        );
      }

      const now = new Date().toISOString();
      const before = candidateBlockControls(
        block,
        run,
        application.createdAt,
        now,
      );
      if (before.expiredReason) {
        const blockedRuns = application.blockRuns.map((candidate, runIndex) =>
          runIndex === index
            ? {
                ...candidate,
                status: "blocked" as const,
                blockingReasonCode: before.expiredReason,
              }
            : { ...candidate },
        );
        await saveCandidateApplication(
          {
            ...application,
            blockRuns: blockedRuns,
            stage: "needs_adjudication",
          },
          application.lockVersion,
          before.expiredReason === "deadline_expired"
            ? "ASSESSMENT_BLOCK_DEADLINE_EXPIRED"
            : "ASSESSMENT_BLOCK_TIMER_EXPIRED",
        );
        throw new ApiError(
          409,
          before.expiredReason === "deadline_expired"
            ? "BLOCK_DEADLINE_EXPIRED"
            : "BLOCK_TIME_EXPIRED",
          "The published time window has ended. A named reviewer must decide the next step.",
        );
      }

      let nextRun: typeof run;
      try {
        nextRun = startCandidateBlockRun(block, run, {
          restart: body.restart,
          at: now,
        });
      } catch (error) {
        throw new ApiError(
          409,
          "BLOCK_ATTEMPT_LIMIT",
          error instanceof Error
            ? error.message
          : "This stage cannot be started again.",
        );
      }
      if (body.restart) {
        nextRun = {
          ...nextRun,
          retakeHistory: [
            ...(run.retakeHistory ?? []),
            {
              attempt: nextRun.attempts,
              at: now,
              reason: body.reason!,
            },
          ],
        };
      }
      const blockRuns = application.blockRuns.map((candidate, runIndex) =>
        runIndex === index ? nextRun : { ...candidate },
      );
      const updated = await saveCandidateApplication(
        {
          ...application,
          blockRuns,
        },
        application.lockVersion,
        body.restart
          ? "ASSESSMENT_BLOCK_RETAKE_STARTED"
          : "ASSESSMENT_BLOCK_STARTED",
      );
      const updatedRun = updated.blockRuns?.[index];
      return {
        application: {
          id: updated.id,
          lockVersion: updated.lockVersion,
          stage: updated.stage,
        },
        controls:
          updatedRun &&
          candidateBlockControls(
            block,
            updatedRun,
            updated.createdAt,
          ),
      };
    },
  );
  return route(request);
}
