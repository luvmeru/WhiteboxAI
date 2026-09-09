import { getHrSession } from "@/lib/server/auth";
import {
  ApiError,
  createJsonApiRoute,
  expectNumber,
  expectObject,
  expectOnlyKeys,
} from "@/lib/server/http";
import {
  getTenantApplication,
  getTenantVacancyVersion,
  unlockDeferredDocumentStage,
} from "@/lib/server/repository";
import { assertReviewerAuthorized } from "@/lib/server/reviewer-authorization";

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
      routeId: "hr.application.deferred_document.unlock",
      access: "hr",
      roles: ["Owner", "HiringManager", "TechnicalReviewer"],
      sameOrigin: true,
      maxBodyBytes: 4 * 1024,
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
          "Application changed. Reload before opening this stage.",
        );
      }
      try {
        const updated = await unlockDeferredDocumentStage(
          application,
          {
            blockId,
            expectedLockVersion: body.expectedVersion,
          },
          session,
          requestId,
        );
        return {
          application: {
            id: updated.id,
            stage: updated.stage,
            lockVersion: updated.lockVersion,
            currentBlockIndex: updated.currentBlockIndex,
          },
        };
      } catch (error) {
        throw new ApiError(
          409,
          "DEFERRED_STAGE_NOT_OPENABLE",
          error instanceof Error
            ? error.message
            : "The deferred document stage cannot be opened.",
        );
      }
    },
  );
  return route(request);
}
