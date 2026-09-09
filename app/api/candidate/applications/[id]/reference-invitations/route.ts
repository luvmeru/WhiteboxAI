import { getCandidateSession } from "@/lib/server/candidate-auth";
import {
  ApiError,
  createJsonApiRoute,
  expectObject,
  expectOnlyKeys,
  expectString,
} from "@/lib/server/http";
import {
  getCandidateApplication,
  getTenantVacancyVersion,
} from "@/lib/server/repository";
import {
  issueReferenceInvitations,
  type CandidateRefereeContact,
} from "@/lib/server/reference-checks";
import type {
  PipelineBlock,
  ReferenceCheckSettings,
} from "@/lib/types";

function validateBody(value: unknown): { blockId: string } {
  const body = expectObject(value);
  expectOnlyKeys(body, ["blockId"]);
  return {
    blockId: expectString(body.blockId, "body.blockId", {
      min: 1,
      max: 200,
    }),
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const route = createJsonApiRoute(
    {
      routeId: "candidate.reference-invitations.reissue",
      access: "public",
      sameOrigin: true,
      maxBodyBytes: 8 * 1024,
      rateLimit: { limit: 6, windowMs: 15 * 60_000 },
      validate: validateBody,
    },
    async ({ body, request: routeRequest, requestId }) => {
      const session = await getCandidateSession();
      if (!session || session.applicationId !== id) {
        throw new ApiError(
          401,
          "CANDIDATE_SESSION_REQUIRED",
          "Candidate session is missing or expired.",
        );
      }
      const application = await getCandidateApplication(
        id,
        session.token,
      );
      if (!application) {
        throw new ApiError(
          404,
          "NOT_FOUND",
          "Application not found.",
        );
      }
      if (
        ![
          "in_progress",
          "submitted",
          "under_review",
          "needs_adjudication",
        ].includes(application.stage)
      ) {
        throw new ApiError(
          409,
          "APPLICATION_NOT_OPEN",
          "Reference invitations cannot be changed after a final outcome.",
        );
      }
      const planBlock = application.assessmentPlan?.blocks.find(
        (block) => block.id === body.blockId,
      );
      const result = application.blockResults?.find(
        (candidate) => candidate.blockId === body.blockId,
      );
      if (
        !planBlock ||
        planBlock.kind !== "reference_check" ||
        !result ||
        result.kind !== "reference_check" ||
        !result.payload ||
        typeof result.payload !== "object" ||
        Array.isArray(result.payload)
      ) {
        throw new ApiError(
          409,
          "REFERENCE_STAGE_NOT_SUBMITTED",
          "The exact frozen reference stage has not been submitted.",
        );
      }
      const vacancy = await getTenantVacancyVersion(
        application.vacancyId,
        application.vacancyVersion,
        application.organizationId,
      );
      const publishedBlock = vacancy?.pipeline.find(
        (block) => block.id === body.blockId,
      );
      if (
        !vacancy ||
        !publishedBlock ||
        publishedBlock.kind !== "reference_check" ||
        publishedBlock.settings.kind !== "reference_check"
      ) {
        throw new ApiError(
          409,
          "FROZEN_BLOCK_MISSING",
          "The exact frozen reference block is unavailable.",
        );
      }
      const referees = (
        result.payload as { referees?: unknown }
      ).referees;
      if (!Array.isArray(referees)) {
        throw new ApiError(
          409,
          "REFERENCE_CONTACTS_MISSING",
          "Stored referee contacts are unavailable.",
        );
      }
      const deliveries = await issueReferenceInvitations({
        scope: {
          organizationId: application.organizationId,
          applicationId: application.id,
          vacancyId: application.vacancyId,
          vacancyVersion: application.vacancyVersion,
          internalCandidateId: application.internalCandidateId,
        },
        roleTitle: vacancy.profile.title,
        block: publishedBlock as PipelineBlock & {
          settings: ReferenceCheckSettings;
        },
        referees: referees as CandidateRefereeContact[],
        requestUrl: routeRequest.url,
        requestId,
      });
      return {
        deliveryMode: "candidate_manual_delivery",
        referenceCollectionComplete: deliveries.length === 0,
        referenceInvitations: deliveries.map(
          (delivery) => ({
            refereeOrdinal: delivery.refereeOrdinal,
            relationship: delivery.relationship,
            expiresAt: delivery.expiresAt,
            deliveryUrl: delivery.deliveryUrl,
          }),
        ),
      };
    },
  );
  return route(request);
}
