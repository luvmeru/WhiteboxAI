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
  recordHumanStageObservation,
} from "@/lib/server/repository";
import { assertReviewerAuthorized } from "@/lib/server/reviewer-authorization";

function validateBody(value: unknown): {
  expectedVersion: number;
  notes: string;
} {
  const body = expectObject(value);
  expectOnlyKeys(body, ["expectedVersion", "notes"]);
  return {
    expectedVersion: expectNumber(
      body.expectedVersion,
      "body.expectedVersion",
      { min: 1, max: 1_000_000, integer: true },
    ),
    notes: expectString(body.notes, "body.notes", {
      min: 20,
      max: 20_000,
      trim: true,
    }),
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
      routeId: "hr.application.human_stage.observation",
      access: "hr",
      roles: ["Owner", "HiringManager", "TechnicalReviewer"],
      sameOrigin: true,
      maxBodyBytes: 32 * 1024,
      rateLimit: { limit: 30, windowMs: 60_000 },
      validate: validateBody,
    },
    async ({ body, principal, requestId }) => {
      const session = await getHrSession();
      if (!session || !principal?.organizationId) {
        throw new ApiError(
          401,
          "UNAUTHORIZED",
          "Authentication is required.",
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
      if (application.lockVersion !== body.expectedVersion) {
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "Application changed. Reload before recording an observation.",
        );
      }
      try {
        const result = await recordHumanStageObservation(
          application,
          {
            blockId,
            notes: body.notes,
            expectedLockVersion: body.expectedVersion,
          },
          session,
          requestId,
        );
        return {
          application: {
            id: result.application.id,
            stage: result.application.stage,
            lockVersion: result.application.lockVersion,
          },
          observationId: result.observationId,
        };
      } catch (error) {
        throw new ApiError(
          409,
          "HUMAN_STAGE_NOT_OBSERVABLE",
          error instanceof Error
            ? error.message
            : "The human stage cannot accept an observation.",
        );
      }
    },
  );
  return route(request);
}
