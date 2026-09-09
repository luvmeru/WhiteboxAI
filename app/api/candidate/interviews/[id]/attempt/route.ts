import { getCandidateSession } from "@/lib/server/candidate-auth";
import {
  ApiError,
  createJsonApiRoute,
  expectNumber,
  expectObject,
  expectOnlyKeys,
} from "@/lib/server/http";
import {
  getCandidateApplication,
  saveCandidateApplication,
} from "@/lib/server/repository";

function validateAttempt(value: unknown): {
  expectedVersion: number;
  turnNumber: number;
} {
  const body = expectObject(value);
  expectOnlyKeys(body, ["expectedVersion", "turnNumber"]);
  return {
    expectedVersion: expectNumber(
      body.expectedVersion,
      "body.expectedVersion",
      { min: 1, max: 1_000_000, integer: true },
    ),
    turnNumber: expectNumber(body.turnNumber, "body.turnNumber", {
      min: 1,
      max: 2_000,
      integer: true,
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
      routeId: "candidate.interview.recording-attempt",
      access: "public",
      sameOrigin: true,
      maxBodyBytes: 2 * 1024,
      rateLimit: { limit: 20, windowMs: 10 * 60_000 },
      validate: validateAttempt,
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
      if (!application.consentAt) {
        throw new ApiError(
          409,
          "CONSENT_REQUIRED",
          "Consent is required before recording.",
        );
      }
      if (application.interviewMode === "text_accommodation") {
        throw new ApiError(
          409,
          "TEXT_ACCOMMODATION_ACTIVE",
          "Recorded media is disabled while the text accommodation is active.",
        );
      }
      if (application.stage !== "in_progress") {
        throw new ApiError(
          409,
          "INTERVIEW_COMPLETE",
          "This interview is already complete.",
        );
      }
      if (application.lockVersion !== body.expectedVersion) {
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "Interview state changed. Reload before recording.",
        );
      }
      if (application.history.length !== body.turnNumber) {
        throw new ApiError(
          409,
          "TURN_CONFLICT",
          "The recording attempt does not match the current interview turn.",
        );
      }
      const openQuestion = application.history.at(-1);
      if (
        !openQuestion ||
        openQuestion.answer ||
        (application.assessmentPlan &&
          openQuestion.blockId !== application.interviewBlockId)
      ) {
        throw new ApiError(
          409,
          "NO_OPEN_QUESTION",
          "There is no open interview question for this recording.",
        );
      }

      const allowedStarts = 1 + (openQuestion.reRecordAttempts ?? 1);
      const attempts = openQuestion.recordingAttempts ?? 0;
      if (attempts >= allowedStarts) {
        throw new ApiError(
          409,
          "RECORDING_ATTEMPTS_EXHAUSTED",
          "The published recording-attempt limit has been reached. Use the accessibility mode or contact the hiring team.",
        );
      }

      const history = application.history.map((turn, index) =>
        index === application.history.length - 1
          ? { ...turn, recordingAttempts: attempts + 1 }
          : turn,
      );
      const updated = await saveCandidateApplication(
        { ...application, history },
        application.lockVersion,
        "INTERVIEW_RECORDING_ATTEMPT_RESERVED",
      );

      return {
        application: {
          id: updated.id,
          lockVersion: updated.lockVersion,
        },
        attempt: {
          turnNumber: body.turnNumber,
          used: attempts + 1,
          allowed: allowedStarts,
          reRecordsRemaining: Math.max(0, allowedStarts - attempts - 1),
        },
      };
    },
  );
  return route(request);
}
