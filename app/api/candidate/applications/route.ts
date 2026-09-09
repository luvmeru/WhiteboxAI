import { NextResponse } from "next/server";
import {
  candidateSessionCookie,
  createCandidateSession,
  getCandidateSession,
} from "@/lib/server/candidate-auth";
import {
  ApiError,
  ValidationError,
  createJsonApiRoute,
  expectObject,
  expectOnlyKeys,
  expectString,
} from "@/lib/server/http";
import {
  createCandidateApplication,
  getCandidateApplication,
  resolveCompetition,
} from "@/lib/server/repository";
import { assertOpenAIProviderConfigured } from "@/lib/server/env";
import { CompetitionAdmissionError } from "@/lib/server/competition-admission";

function validateCreateApplication(value: unknown): { code: string } {
  const body = expectObject(value);
  expectOnlyKeys(body, ["code"]);
  const code = expectString(body.code, "body.code", { min: 8, max: 8 }).toUpperCase();
  if (!/^WBX-[A-Z0-9]{4}$/.test(code)) {
    throw new ValidationError("body.code", "must use the WBX-XXXX format");
  }
  return { code };
}

function admissionApiError(error: CompetitionAdmissionError): ApiError {
  switch (error.code) {
    case "COMPETITION_CLOSED":
      return new ApiError(410, error.code, error.message);
    case "COMPETITION_UNAVAILABLE":
      return new ApiError(404, error.code, error.message);
    case "COMPETITION_ADMISSION_UNAVAILABLE":
      return new ApiError(503, error.code, error.message);
    case "COMPETITION_NOT_OPEN":
    case "COMPETITION_CAPACITY_REACHED":
    case "COMPETITION_CHANGED":
    default:
      return new ApiError(409, error.code, error.message);
  }
}

export const POST = createJsonApiRoute(
  {
    routeId: "candidate.application.create",
    access: "public",
    sameOrigin: true,
    maxBodyBytes: 2 * 1024,
    rateLimit: { limit: 12, windowMs: 10 * 60_000 },
    validate: validateCreateApplication,
  },
  async ({ body }) => {
    const competition = await resolveCompetition(body.code);
    if (!competition) {
      throw new ApiError(404, "COMPETITION_UNAVAILABLE", "Competition not found or no longer open.");
    }

    const existingSession = await getCandidateSession();
    if (existingSession) {
      const existing = await getCandidateApplication(
        existingSession.applicationId,
        existingSession.token,
      );
      if (existing?.code === competition.code) {
        return {
          application: {
            id: existing.id,
            code: existing.code,
            title: existing.title,
            stage: existing.stage,
            entry:
              existing.stage === "in_progress"
                ? existing.assessmentPlan
                  ? "assessment"
                  : "interview"
                : "status",
            noticeVersion: existing.noticeVersion,
            lockVersion: existing.lockVersion,
          },
        };
      }
    }

    if (competition.aiExecutionMode === "openai_required") {
      try {
        assertOpenAIProviderConfigured();
      } catch {
        throw new ApiError(
          503,
          "AI_PROVIDER_UNAVAILABLE",
          "This assessment is temporarily unavailable because its required AI provider is not configured.",
        );
      }
    }

    let created;
    try {
      created = await createCandidateApplication(competition);
    } catch (error) {
      if (error instanceof CompetitionAdmissionError) {
        throw admissionApiError(error);
      }
      throw error;
    }
    const { application, token } = created;
    const session = createCandidateSession(application.id, token);
    const response = NextResponse.json(
      {
        application: {
          id: application.id,
          code: application.code,
          title: application.title,
          stage: application.stage,
          entry: competition.entry,
          noticeVersion: application.noticeVersion,
          lockVersion: application.lockVersion,
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(candidateSessionCookie(session));
    return response;
  },
);
