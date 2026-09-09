import { getCandidateSession } from "@/lib/server/candidate-auth";
import { skipOptionalAssessmentBlock } from "@/lib/server/assessment-orchestrator";
import {
  ApiError,
  createJsonApiRoute,
  expectNumber,
  expectObject,
  expectOnlyKeys,
} from "@/lib/server/http";
import {
  frozenInterviewFollowUpPolicy,
  frozenInterviewQuestions,
  getCandidateApplication,
  getTenantVacancyVersion,
  saveCandidateApplication,
} from "@/lib/server/repository";

function validateBody(value: unknown): { expectedVersion: number } {
  const body = expectObject(value);
  expectOnlyKeys(body, ["expectedVersion"]);
  return {
    expectedVersion: expectNumber(
      body.expectedVersion,
      "body.expectedVersion",
      { min: 1, max: 1_000_000, integer: true },
    ),
  };
}

const INTERVIEW_KINDS = new Set([
  "async_interview",
  "live_ai_interview",
  "chat_interview",
]);

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
      routeId: "candidate.assessment.block.skip",
      access: "public",
      sameOrigin: true,
      maxBodyBytes: 2 * 1024,
      rateLimit: { limit: 40, windowMs: 10 * 60_000 },
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
        !application.blockResults ||
        application.currentBlockIndex === undefined
      ) {
        throw new ApiError(
          409,
          "ASSESSMENT_PLAN_MISSING",
          "This application uses the legacy interview flow.",
        );
      }
      if (application.lockVersion !== body.expectedVersion) {
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "Application state changed. Reload before skipping this stage.",
        );
      }
      if (application.stage !== "in_progress") {
        throw new ApiError(
          409,
          "APPLICATION_NOT_OPEN",
          "This application is not accepting stage changes right now.",
        );
      }

      let runtime;
      try {
        runtime = skipOptionalAssessmentBlock(
          application.assessmentPlan,
          {
            blockRuns: application.blockRuns,
            blockResults: application.blockResults,
            currentBlockIndex: application.currentBlockIndex,
            progress: application.progress,
            stage: "in_progress",
          },
          blockId,
        );
      } catch {
        throw new ApiError(
          409,
          "BLOCK_NOT_SKIPPABLE",
          "Only the currently open optional stage can be skipped.",
        );
      }

      const vacancy = await getTenantVacancyVersion(
        application.vacancyId,
        application.vacancyVersion,
        application.organizationId,
      );
      if (!vacancy) {
        throw new ApiError(
          409,
          "VACANCY_VERSION_MISSING",
          "The frozen vacancy version is unavailable.",
        );
      }
      const nextBlock =
        application.assessmentPlan.blocks[runtime.currentBlockIndex];
      const nextIsInterview = Boolean(
        nextBlock && INTERVIEW_KINDS.has(nextBlock.kind),
      );
      const updated = await saveCandidateApplication(
        {
          ...application,
          blockRuns: runtime.blockRuns,
          blockResults: runtime.blockResults,
          currentBlockIndex: runtime.currentBlockIndex,
          progress: runtime.progress,
          stage: runtime.stage,
          questions:
            nextIsInterview && nextBlock
              ? frozenInterviewQuestions(vacancy, nextBlock.id)
              : [],
          interviewBlockId:
            nextIsInterview && nextBlock ? nextBlock.id : undefined,
          followUpPolicy:
            nextIsInterview && nextBlock
              ? frozenInterviewFollowUpPolicy(vacancy, nextBlock.id)
              : 0,
        },
        application.lockVersion,
        "OPTIONAL_ASSESSMENT_BLOCK_SKIPPED",
      );

      return {
        application: {
          id: updated.id,
          stage: updated.stage,
          lockVersion: updated.lockVersion,
          progress: updated.progress,
          currentBlockIndex: updated.currentBlockIndex,
        },
      };
    },
  );
  return route(request);
}
