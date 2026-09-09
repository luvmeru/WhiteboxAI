import { getCandidateSession } from "@/lib/server/candidate-auth";
import {
  resolveArtifactReference,
  type ArtifactPurpose,
} from "@/lib/server/artifacts";
import {
  completeAssessmentBlock,
  evaluateKnockoutSubmission,
} from "@/lib/server/assessment-orchestrator";
import {
  compileCandidateAssessmentPlan,
  validateCandidateSubmission,
} from "@/lib/server/assessment-runtime";
import { candidateBlockControls } from "@/lib/server/assessment-controls";
import {
  ApiError,
  ValidationError,
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
import {
  issueReferenceInvitations,
  type CandidateRefereeContact,
  type IssuedReferenceInvitation,
} from "@/lib/server/reference-checks";
import type {
  PipelineBlock,
  ReferenceCheckSettings,
} from "@/lib/types";

function validateBody(value: unknown): {
  expectedVersion: number;
  payload: unknown;
} {
  const body = expectObject(value);
  expectOnlyKeys(body, ["expectedVersion", "payload"]);
  if (!("payload" in body)) {
    throw new ValidationError("body.payload", "is required");
  }
  return {
    expectedVersion: expectNumber(
      body.expectedVersion,
      "body.expectedVersion",
      { min: 1, max: 1_000_000, integer: true },
    ),
    payload: body.payload,
  };
}

const INTERVIEW_KINDS = new Set([
  "async_interview",
  "live_ai_interview",
  "chat_interview",
]);

function artifactPurposeFor(kind: string): ArtifactPurpose | null {
  switch (kind) {
    case "cv_intake":
      return "cv_intake";
    case "doc_verification":
      return "document_check";
    case "work_sample":
      return "work_sample";
    case "coding":
      return "coding";
    case "case_exercise":
      return "case_study";
    case "application_form":
    case "custom":
      return "custom";
    default:
      return null;
  }
}

interface SubmittedAsset {
  uploadId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  applicationVersion?: number;
}

function collectSubmittedAssets(
  value: unknown,
  assets: SubmittedAsset[] = [],
): SubmittedAsset[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSubmittedAssets(item, assets));
    return assets;
  }
  if (!value || typeof value !== "object") return assets;
  const record = value as Record<string, unknown>;
  if (
    typeof record.uploadId === "string" &&
    typeof record.fileName === "string" &&
    typeof record.mimeType === "string" &&
    typeof record.sizeBytes === "number"
  ) {
    assets.push({
      uploadId: record.uploadId,
      fileName: record.fileName,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      ...(typeof record.applicationVersion === "number"
        ? { applicationVersion: record.applicationVersion }
        : {}),
    });
    return assets;
  }
  Object.values(record).forEach((item) =>
    collectSubmittedAssets(item, assets),
  );
  return assets;
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
      routeId: "candidate.assessment.block.submit",
      access: "public",
      sameOrigin: true,
      maxBodyBytes: 768 * 1024,
      rateLimit: { limit: 40, windowMs: 10 * 60_000 },
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
      if (!application.consentAt) {
        throw new ApiError(
          409,
          "CONSENT_REQUIRED",
          "Accept the published candidate notice before submitting evidence.",
        );
      }
      if (application.lockVersion !== body.expectedVersion) {
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "Application state changed. Reload before submitting this stage.",
        );
      }
      if (application.stage !== "in_progress") {
        throw new ApiError(
          409,
          "APPLICATION_NOT_OPEN",
          "This application is not accepting candidate evidence right now.",
        );
      }

      const block =
        application.assessmentPlan.blocks[application.currentBlockIndex];
      if (!block || block.id !== blockId) {
        throw new ApiError(
          409,
          "BLOCK_NOT_OPEN",
          "This stage is not currently open.",
        );
      }
      if (INTERVIEW_KINDS.has(block.kind)) {
        throw new ApiError(
          409,
          "USE_INTERVIEW_RUNTIME",
          "Interview stages must be completed through the structured interview flow.",
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
      const recompiled = compileCandidateAssessmentPlan(vacancy);
      if (
        recompiled.source.vacancyFingerprint !==
          application.assessmentPlan.source.vacancyFingerprint ||
        recompiled.source.vacancyVersion !==
          application.assessmentPlan.source.vacancyVersion
      ) {
        throw new ApiError(
          409,
          "ASSESSMENT_PLAN_MISMATCH",
          "The stored assessment plan no longer matches its frozen vacancy version.",
        );
      }

      const now = new Date();
      const activeRun = application.blockRuns[application.currentBlockIndex];
      if (!activeRun) {
        throw new ApiError(
          409,
          "BLOCK_RUN_MISSING",
          "The server-owned stage run is unavailable.",
        );
      }
      const controls = candidateBlockControls(
        block,
        activeRun,
        application.createdAt,
        now.toISOString(),
      );
      if (controls.expiredReason) {
        const blockedRuns = application.blockRuns.map((candidate, runIndex) =>
          runIndex === application.currentBlockIndex
            ? {
                ...candidate,
                status: "blocked" as const,
                blockingReasonCode: controls.expiredReason,
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
          controls.expiredReason === "deadline_expired"
            ? "ASSESSMENT_BLOCK_DEADLINE_EXPIRED"
            : "ASSESSMENT_BLOCK_TIMER_EXPIRED",
        );
        throw new ApiError(
          409,
          controls.expiredReason === "deadline_expired"
            ? "BLOCK_DEADLINE_EXPIRED"
            : "BLOCK_TIME_EXPIRED",
          "The published time window has ended. A named reviewer must decide the next step.",
        );
      }
      if (activeRun.status !== "in_progress") {
        throw new ApiError(
          409,
          "BLOCK_NOT_STARTED",
          "Start this stage before submitting evidence. Candidate manifests and submission contracts open only after the server records the attempt start.",
        );
      }

      const validation = validateCandidateSubmission(block, body.payload);
      if (!validation.ok) {
        throw new ApiError(
          422,
          "INVALID_BLOCK_SUBMISSION",
          validation.issues
            .slice(0, 5)
            .map((issue) => `${issue.path}: ${issue.message}`)
            .join(" "),
        );
      }
      const submittedAssets = collectSubmittedAssets(validation.normalized);
      const artifactPurpose = artifactPurposeFor(block.kind);
      if (submittedAssets.length > 0 && !artifactPurpose) {
        throw new ApiError(
          422,
          "UNEXPECTED_ARTIFACT",
          "This assessment stage does not accept private artifacts.",
        );
      }
      for (const asset of submittedAssets) {
        if (
          asset.applicationVersion !== undefined &&
          asset.applicationVersion !== application.lockVersion
        ) {
          throw new ApiError(
            422,
            "INVALID_ARTIFACT_REFERENCE",
            "An uploaded file reference is bound to another application version.",
          );
        }
        const stored = await resolveArtifactReference(asset.uploadId, {
          organizationId: application.organizationId,
          applicationId: application.id,
          applicationVersion: application.lockVersion,
          blockId: block.id,
          purposes: artifactPurpose ? [artifactPurpose] : undefined,
        });
        if (
          !stored ||
          stored.originalFilename !== asset.fileName ||
          stored.contentType !== asset.mimeType ||
          stored.byteSize !== asset.sizeBytes
        ) {
          throw new ApiError(
            422,
            "INVALID_ARTIFACT_REFERENCE",
            "An uploaded file reference is invalid, expired, or belongs to another assessment stage.",
          );
        }
      }

      const publishedBlock = vacancy.pipeline.find(
        (candidate) => candidate.id === block.id,
      );
      if (!publishedBlock || publishedBlock.kind !== block.kind) {
        throw new ApiError(
          409,
          "FROZEN_BLOCK_MISSING",
          "The frozen assessment block is unavailable.",
        );
      }
      const startedAt = activeRun?.startedAt
        ? Date.parse(activeRun.startedAt)
        : now.getTime();
      const elapsedSec = Number.isFinite(startedAt)
        ? Math.max(0, Math.round((now.getTime() - startedAt) / 1_000))
        : 0;
      const knockout =
        publishedBlock.settings.kind === "knockout"
          ? evaluateKnockoutSubmission(
              publishedBlock,
              validation.normalized,
            )
          : undefined;
      const runtime = completeAssessmentBlock(
        application.assessmentPlan,
        {
          blockRuns: application.blockRuns,
          blockResults: application.blockResults,
          currentBlockIndex: application.currentBlockIndex,
          progress: application.progress,
          stage: "in_progress",
        },
        {
          blockId,
          completionState: validation.nextState,
          result: {
            blockId,
            kind: block.kind,
            completedAt: now.toISOString(),
            elapsedSec,
            payload: validation.normalized,
            integrityEvents: [],
          },
          ...(knockout ? { knockout } : {}),
        },
        now.toISOString(),
      );
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
        knockout?.haltCandidate
          ? "KNOCKOUT_REQUIRES_ADJUDICATION"
          : knockout && !knockout.passed
            ? "KNOCKOUT_FAILED_DEFERRED_REVIEW"
          : "ASSESSMENT_BLOCK_SUBMITTED",
      );
      let referenceInvitations: IssuedReferenceInvitation[] = [];
      if (publishedBlock.settings.kind === "reference_check") {
        referenceInvitations = await issueReferenceInvitations({
          scope: {
            organizationId: updated.organizationId,
            applicationId: updated.id,
            vacancyId: updated.vacancyId,
            vacancyVersion: updated.vacancyVersion,
            internalCandidateId: updated.internalCandidateId,
          },
          roleTitle: vacancy.profile.title,
          block: publishedBlock as PipelineBlock & {
            settings: ReferenceCheckSettings;
          },
          referees: (
            validation.normalized as {
              referees: CandidateRefereeContact[];
            }
          ).referees,
          requestUrl: routeRequest.url,
          requestId,
          now,
        });
      }

      return {
        application: {
          id: updated.id,
          stage: updated.stage,
          lockVersion: updated.lockVersion,
          progress: updated.progress,
          currentBlockIndex: updated.currentBlockIndex,
        },
        result: {
          blockId,
          state: validation.nextState,
          ...(referenceInvitations.length > 0
            ? {
                referenceInvitations: referenceInvitations.map(
                  (invitation) => ({
                    refereeOrdinal:
                      invitation.refereeOrdinal,
                    relationship: invitation.relationship,
                    expiresAt: invitation.expiresAt,
                    deliveryUrl: invitation.deliveryUrl,
                  }),
                ),
                deliveryMode: "candidate_manual_delivery",
              }
            : {}),
          ...(knockout
            ? {
                gate: {
                  passed: knockout.passed,
                  requiresHumanAdjudication:
                    knockout.requiresHumanAdjudication,
                  candidateHalted: knockout.haltCandidate,
                },
              }
            : {}),
        },
      };
    },
  );
  return route(request);
}
