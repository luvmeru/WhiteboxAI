import { getHrSession } from "@/lib/server/auth";
import {
  ApiError,
  createJsonApiRoute,
  expectNumber,
  expectObject,
  expectOnlyKeys,
  expectString,
} from "@/lib/server/http";
import { findStoredRecordingById } from "@/lib/server/media";
import { RecordingPlaybackAccessRequiredError } from "@/lib/server/recording-playback-access";
import {
  getTenantApplication,
  getTenantVacancyVersion,
  verifyRecordedTranscript,
} from "@/lib/server/repository";
import { assertReviewerAuthorized } from "@/lib/server/reviewer-authorization";

function validateBody(value: unknown): {
  reviewedTranscript: string;
  reason: string;
  expectedVersion: number;
} {
  const body = expectObject(value);
  expectOnlyKeys(body, ["reviewedTranscript", "reason", "expectedVersion"]);
  return {
    reviewedTranscript: expectString(
      body.reviewedTranscript,
      "body.reviewedTranscript",
      { min: 1, max: 50_000, trim: true },
    ),
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
  {
    params,
  }: { params: Promise<{ id: string; turnNumber: string }> },
) {
  const { id, turnNumber: rawTurnNumber } = await params;
  const turnNumber = Number(rawTurnNumber);
  const route = createJsonApiRoute(
    {
      routeId: "hr.application.transcript.verify",
      access: "hr",
      roles: ["Owner", "HiringManager", "TechnicalReviewer"],
      sameOrigin: true,
      maxBodyBytes: 64 * 1024,
      rateLimit: { limit: 30, windowMs: 60_000 },
      validate: validateBody,
    },
    async ({ body, principal, requestId }) => {
      if (!Number.isSafeInteger(turnNumber) || turnNumber < 1) {
        throw new ApiError(404, "NOT_FOUND", "Interview turn not found.");
      }
      const session = await getHrSession();
      if (!session || !principal?.organizationId) {
        throw new Error("Authenticated session is unavailable.");
      }
      const application = await getTenantApplication(
        id,
        principal.organizationId,
      );
      if (!application) {
        throw new ApiError(404, "NOT_FOUND", "Application not found.");
      }
      if (application.lockVersion !== body.expectedVersion) {
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "Application changed. Reload before verifying the transcript.",
        );
      }
      if (application.stage === "in_progress") {
        throw new ApiError(
          409,
          "INTERVIEW_NOT_SUBMITTED",
          "Transcript verification starts after the candidate submits the interview.",
        );
      }
      if (application.evaluation) {
        throw new ApiError(
          409,
          "EVALUATION_ALREADY_EXISTS",
          "A transcript cannot be changed after an evaluation has been recorded.",
        );
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
        capability: "evidence_read",
        evidenceMode: "raw",
      });
      const turn = application.history[turnNumber - 1];
      if (!turn?.recordingId || !turn.transcript) {
        throw new ApiError(
          404,
          "TRANSCRIPT_NOT_FOUND",
          "Recorded transcript provenance is unavailable for this turn.",
        );
      }
      if (
        turn.transcript.reviewStatus !== "candidate_correction_pending" &&
        turn.transcript.reviewStatus !== "provider_unavailable"
      ) {
        throw new ApiError(
          409,
          "TRANSCRIPT_ALREADY_VERIFIED",
          "This transcript is already immutable and eligible for evaluation.",
        );
      }
      const recording = await findStoredRecordingById({
        id: turn.recordingId,
        applicationId: application.id,
        organizationId: principal.organizationId,
      });
      if (
        !recording ||
        recording.turnNumber !== turnNumber ||
        recording.contentSha256 !== turn.transcript.recordingSha256 ||
        turn.transcript.recordingId !== recording.id
      ) {
        throw new ApiError(
          409,
          "RECORDING_PROVENANCE_INVALID",
          "The exact retained recording and transcript receipt could not be matched.",
        );
      }

      const updated = await (async () => {
        try {
          return await verifyRecordedTranscript(
            application,
            {
              turnNumber,
              reviewedTranscript: body.reviewedTranscript,
              reason: body.reason,
              expectedLockVersion: body.expectedVersion,
              recording,
            },
            session,
            requestId,
          );
        } catch (error) {
          if (error instanceof RecordingPlaybackAccessRequiredError) {
            throw new ApiError(
              409,
              "RECORDING_PLAYBACK_REQUIRED",
              "Open this exact recording as the current reviewer, then verify its transcript within 30 minutes.",
            );
          }
          throw error;
        }
      })();
      const updatedTurn = updated.history[turnNumber - 1];
      return {
        application: {
          id: updated.id,
          lockVersion: updated.lockVersion,
          stage: updated.stage,
        },
        transcript: updatedTurn.transcript,
        answer: updatedTurn.answer,
      };
    },
  );
  return route(request);
}
