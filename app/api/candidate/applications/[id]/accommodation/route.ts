import { getCandidateSession } from "@/lib/server/candidate-auth";
import {
  ApiError,
  createJsonApiRoute,
  expectEnum,
  expectNumber,
  expectObject,
  expectOnlyKeys,
} from "@/lib/server/http";
import {
  getCandidateApplication,
  saveCandidateApplication,
} from "@/lib/server/repository";

function validateMode(value: unknown): {
  mode: "video" | "text_accommodation";
  expectedVersion: number;
} {
  const body = expectObject(value);
  expectOnlyKeys(body, ["mode", "expectedVersion"]);
  return {
    mode: expectEnum(body.mode, "body.mode", [
      "video",
      "text_accommodation",
    ] as const),
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
      routeId: "candidate.application.accommodation",
      access: "public",
      sameOrigin: true,
      maxBodyBytes: 2 * 1024,
      rateLimit: { limit: 10, windowMs: 60_000 },
      validate: validateMode,
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
          "Consent is required before changing interview mode.",
        );
      }
      if (application.stage !== "in_progress") {
        throw new ApiError(
          409,
          "INTERVIEW_COMPLETE",
          "The interview mode cannot be changed after submission.",
        );
      }
      if (application.lockVersion !== body.expectedVersion) {
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "Interview state changed. Reload before changing mode.",
        );
      }
      if ((application.interviewMode ?? "video") === body.mode) {
        return {
          application: {
            id: application.id,
            interviewMode: body.mode,
            lockVersion: application.lockVersion,
          },
        };
      }

      const updated = await saveCandidateApplication(
        { ...application, interviewMode: body.mode },
        application.lockVersion,
        body.mode === "text_accommodation"
          ? "TEXT_ACCOMMODATION_ENABLED"
          : "VIDEO_MODE_ENABLED",
      );
      return {
        application: {
          id: updated.id,
          interviewMode: updated.interviewMode,
          lockVersion: updated.lockVersion,
        },
      };
    },
  );
  return route(request);
}
