import { getCandidateSession } from "@/lib/server/candidate-auth";
import {
  ApiError,
  createJsonApiRoute,
  expectBoolean,
  expectEnum,
  expectNumber,
  expectObject,
  expectOnlyKeys,
} from "@/lib/server/http";
import { getCandidateApplication, saveCandidateApplication } from "@/lib/server/repository";

function validateConsent(value: unknown): {
  accepted: true;
  noticeVersion: number;
  expectedVersion: number;
  mode: "video" | "text_accommodation";
} {
  const body = expectObject(value);
  expectOnlyKeys(body, ["accepted", "noticeVersion", "expectedVersion", "mode"]);
  if (!expectBoolean(body.accepted, "body.accepted")) {
    throw new ApiError(422, "CONSENT_REQUIRED", "Consent must be explicitly accepted.");
  }
  return {
    accepted: true,
    noticeVersion: expectNumber(body.noticeVersion, "body.noticeVersion", {
      min: 1,
      max: 1_000_000,
      integer: true,
    }),
    expectedVersion: expectNumber(body.expectedVersion, "body.expectedVersion", {
      min: 1,
      max: 1_000_000,
      integer: true,
    }),
    mode: expectEnum(body.mode, "body.mode", [
      "video",
      "text_accommodation",
    ] as const),
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const route = createJsonApiRoute(
    {
      routeId: "candidate.application.consent",
      access: "public",
      sameOrigin: true,
      maxBodyBytes: 2 * 1024,
      rateLimit: { limit: 10, windowMs: 60_000 },
      validate: validateConsent,
    },
    async ({ body }) => {
      const session = await getCandidateSession();
      if (!session || session.applicationId !== id) {
        throw new ApiError(401, "CANDIDATE_SESSION_REQUIRED", "Candidate session is missing or expired.");
      }
      const application = await getCandidateApplication(id, session.token);
      if (!application) throw new ApiError(404, "NOT_FOUND", "Application not found.");
      if (application.noticeVersion !== body.noticeVersion) {
        throw new ApiError(409, "NOTICE_CHANGED", "The notice changed. Reload before consenting.");
      }
      if (application.lockVersion !== body.expectedVersion) {
        throw new ApiError(409, "VERSION_CONFLICT", "Application state changed. Reload and retry.");
      }
      if (application.consentAt) {
        if ((application.interviewMode ?? "video") !== body.mode) {
          throw new ApiError(
            409,
            "CONSENT_ALREADY_RECORDED",
            "Consent is already recorded. Use the accommodation control to change interview mode.",
          );
        }
        return {
          application: {
            id: application.id,
            consentAt: application.consentAt,
            interviewMode: application.interviewMode ?? "video",
            lockVersion: application.lockVersion,
          },
        };
      }

      const updated = await saveCandidateApplication(
        {
          ...application,
          consentAt: new Date().toISOString(),
          interviewMode: body.mode,
        },
        application.lockVersion,
        "CONSENT_ACCEPTED",
      );
      return {
        application: {
          id: updated.id,
          consentAt: updated.consentAt,
          interviewMode: updated.interviewMode,
          lockVersion: updated.lockVersion,
        },
      };
    },
  );
  return route(request);
}
