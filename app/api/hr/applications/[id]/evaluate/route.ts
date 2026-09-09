import { evaluateApplication } from "@/lib/engine";
import type { InterviewTurn } from "@/lib/ai-contracts";
import {
  ApiError,
  createJsonApiRoute,
  expectNumber,
  expectObject,
  expectOnlyKeys,
} from "@/lib/server/http";
import { getHrSession } from "@/lib/server/auth";
import {
  evaluateApplicationWithProvider,
  evaluateInterviewWithProvider,
} from "@/lib/server/ai-provider";
import { vacancyAiExecutionMode } from "@/lib/server/ai-rollout";
import { compileCandidateAssessmentPlan } from "@/lib/server/assessment-runtime";
import {
  groupInterviewAnswersByFrozenQuestion,
  selectInterviewEvidenceForFrozenRun,
} from "@/lib/server/interview-evaluation-mapping";
import { resolveInterviewBlock } from "@/lib/server/interview-protocol";
import {
  getTenantApplication,
  getTenantVacancyVersion,
  saveApplicationEvaluation,
  type StoredCandidateApplication,
} from "@/lib/server/repository";
import type {
  ApplicationRecord,
  BlockRuntimeResult,
  VacancyV2,
} from "@/lib/types";
import {
  selectedTranscriptForEvaluation,
  transcriptReadyForEvaluation,
} from "@/lib/server/transcript-provenance";
import {
  assertReviewerAuthorized,
  authorizeReviewer,
} from "@/lib/server/reviewer-authorization";

function validateBody(value: unknown): { expectedVersion: number } {
  const body = expectObject(value);
  expectOnlyKeys(body, ["expectedVersion"]);
  return {
    expectedVersion: expectNumber(body.expectedVersion, "body.expectedVersion", { min: 1, max: 1_000_000 }),
  };
}

function isInterviewBlock(
  block: VacancyV2["pipeline"][number] | undefined,
): boolean {
  return Boolean(
    block &&
      (block.settings.kind === "async_interview" ||
        block.settings.kind === "live_ai_interview" ||
        block.settings.kind === "chat_interview"),
  );
}

function finalAssessmentAttempt(
  application: StoredCandidateApplication,
  blockId: string,
): number {
  if (!application.blockRuns) return 1;
  const run = application.blockRuns.find(
    (candidate) => candidate.blockId === blockId,
  );
  if (!run || !Number.isSafeInteger(run.attempts) || run.attempts < 1) {
    throw new ApiError(
      409,
      "ASSESSMENT_RUN_MISSING",
      `The final assessment attempt for interview block "${blockId}" is unavailable.`,
    );
  }
  return run.attempts;
}

function allowsSingleLegacyInterviewStream(
  vacancy: VacancyV2,
  application: StoredCandidateApplication,
  blockId: string,
  assessmentAttempt: number,
): boolean {
  if (
    application.assessmentPlan ||
    application.blockRuns ||
    assessmentAttempt !== 1
  ) {
    return false;
  }
  const interviewBlockIds = vacancy.pipeline
    .filter((block) => isInterviewBlock(block))
    .map((block) => block.id);
  return (
    interviewBlockIds.length === 1 &&
    interviewBlockIds[0] === blockId &&
    application.history.every(
      (turn) =>
        (turn.blockId === undefined &&
          turn.assessmentAttempt === undefined) ||
        (turn.blockId === blockId &&
          turn.assessmentAttempt === undefined),
    )
  );
}

function evaluationHistoryForInterviewRun(
  vacancy: VacancyV2,
  application: StoredCandidateApplication,
  blockId: string,
): InterviewTurn[] {
  const assessmentAttempt = finalAssessmentAttempt(application, blockId);
  const scopedHistory = selectInterviewEvidenceForFrozenRun(
    application.history,
    {
      blockId,
      assessmentAttempt,
      allowSingleLegacyBlockAttempt: allowsSingleLegacyInterviewStream(
        vacancy,
        application,
        blockId,
        assessmentAttempt,
      ),
    },
  );
  const unverifiedTurnNumbers = scopedHistory.flatMap((turn) => {
    if (
      !turn.recordingId ||
      transcriptReadyForEvaluation(turn.transcript)
    ) {
      return [];
    }
    const turnIndex = application.history.indexOf(turn);
    return turnIndex < 0 ? [] : [turnIndex + 1];
  });
  if (unverifiedTurnNumbers.length > 0) {
    throw new ApiError(
      409,
      "TRANSCRIPT_REVIEW_REQUIRED",
      `Human verification is required for recorded turn${
        unverifiedTurnNumbers.length === 1 ? "" : "s"
      } ${unverifiedTurnNumbers.join(", ")} before AI evaluation.`,
    );
  }
  return scopedHistory.map((turn) => {
    if (!turn.recordingId) return turn;
    const reviewed = selectedTranscriptForEvaluation(turn.transcript);
    return reviewed ? { ...turn, answer: reviewed } : turn;
  });
}

function frozenInterviewResults(
  vacancy: VacancyV2,
  blockResults: BlockRuntimeResult[],
  evaluationHistoryByBlockId: ReadonlyMap<string, InterviewTurn[]>,
): BlockRuntimeResult[] {
  return blockResults.map((runtime) => {
    const block = vacancy.pipeline.find(
      (candidate) => candidate.id === runtime.blockId,
    );
    if (
      !block ||
      (block.settings.kind !== "async_interview" &&
        block.settings.kind !== "live_ai_interview" &&
        block.settings.kind !== "chat_interview")
    ) {
      return runtime;
    }
    const evaluationHistory =
      evaluationHistoryByBlockId.get(runtime.blockId) ?? [];
    const answerGroups = groupInterviewAnswersByFrozenQuestion(
      block.settings.questions,
      evaluationHistory,
    );
    const candidateTurns = answerGroups.flatMap((group) =>
      group.answers.map((answer) => ({
        speaker: "candidate" as const,
        text: answer.answer,
        at: `turn-${answer.turnNumber}`,
        itemId: group.questionId,
        kind: answer.kind,
      })),
    );
    return {
      ...runtime,
      payload: answerGroups.map((group) => ({
        questionId: group.questionId,
        answer: group.answers
          .map((answer) => answer.answer)
          .join("\n\n"),
      })),
      transcript: candidateTurns,
      integrityEvents: evaluationHistory.flatMap(
        (turn) => turn.integrity ?? [],
      ),
    };
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const route = createJsonApiRoute(
    {
      routeId: "hr.application.evaluate",
      access: "hr",
      roles: ["Owner", "HiringManager", "TechnicalReviewer"],
      maxBodyBytes: 8 * 1024,
      rateLimit: { limit: 20, windowMs: 60_000 },
      validate: validateBody,
    },
    async ({ body, requestId, principal }) => {
      const session = await getHrSession();
      if (!session || !principal?.organizationId) throw new Error("Authenticated session is unavailable.");
      const application = await getTenantApplication(id, principal.organizationId);
      if (!application) throw new ApiError(404, "NOT_FOUND", "Application not found.");
      if (application.lockVersion !== body.expectedVersion) {
        throw new ApiError(409, "VERSION_CONFLICT", "Application changed. Reload before evaluating.");
      }
      if (application.stage === "in_progress") {
        throw new ApiError(409, "NOT_SUBMITTED", "The interview is not submitted yet.");
      }
      const vacancy = await getTenantVacancyVersion(
        application.vacancyId,
        application.vacancyVersion,
        principal.organizationId,
      );
      if (!vacancy) throw new ApiError(409, "VACANCY_VERSION_MISSING", "Published vacancy version is unavailable.");
      assertReviewerAuthorized({
        session,
        vacancy,
        application,
        capability: "evaluation_run",
      });
      const mayReturnSensitiveEvaluation = authorizeReviewer({
        session,
        vacancy,
        application,
        capability: "sensitive_detail",
        evidenceMode: "raw",
      }).allowed;

      const multiBlockApplication = Boolean(
        application.assessmentPlan &&
          application.blockRuns &&
          application.blockResults &&
          application.currentBlockIndex !== undefined,
      );
      if (
        multiBlockApplication &&
        application.assessmentPlan &&
        application.blockRuns &&
        application.blockResults &&
        application.currentBlockIndex !== undefined
      ) {
        const recompiledPlan = compileCandidateAssessmentPlan(vacancy);
        if (
          recompiledPlan.source.vacancyId !==
            application.assessmentPlan.source.vacancyId ||
          recompiledPlan.source.vacancyVersion !==
            application.assessmentPlan.source.vacancyVersion ||
          recompiledPlan.source.vacancyFingerprint !==
            application.assessmentPlan.source.vacancyFingerprint ||
          recompiledPlan.source.blueprintSchemaVersion !==
            application.assessmentPlan.source.blueprintSchemaVersion
        ) {
          throw new ApiError(
            409,
            "ASSESSMENT_PLAN_MISMATCH",
            "The stored assessment plan no longer matches its exact frozen vacancy version.",
          );
        }
        const evaluationHistoryByBlockId = new Map<string, InterviewTurn[]>();
        for (const runtime of application.blockResults) {
          const block = vacancy.pipeline.find(
            (candidate) => candidate.id === runtime.blockId,
          );
          if (!isInterviewBlock(block)) continue;
          evaluationHistoryByBlockId.set(
            runtime.blockId,
            evaluationHistoryForInterviewRun(
              vacancy,
              application,
              runtime.blockId,
            ),
          );
        }
        const evaluationResults = frozenInterviewResults(
          vacancy,
          application.blockResults,
          evaluationHistoryByBlockId,
        );
        const domainApplication: ApplicationRecord = {
          id: application.id,
          vacancyId: application.vacancyId,
          code: application.code,
          candidate: { internalId: application.internalCandidateId },
          stage: application.stage,
          consent: application.consentAt
            ? {
                noticeVersion: application.noticeVersion,
                at: application.consentAt,
              }
            : null,
          blockResults: evaluationResults,
          currentBlockIndex: application.currentBlockIndex,
          createdAt: application.createdAt,
          submittedAt: application.updatedAt,
          audit: [],
        };
        const evaluation =
          vacancyAiExecutionMode(vacancy) === "openai_required"
            ? await evaluateApplicationWithProvider(vacancy, {
                id: application.id,
                organizationId: application.organizationId,
                internalCandidateId: application.internalCandidateId,
                updatedAt: application.updatedAt,
                blockResults: evaluationResults,
                assessmentReviews:
                  application.assessmentReviews ?? [],
              })
            : evaluateApplication(vacancy, domainApplication);
        const saved = await saveApplicationEvaluation(
          application,
          evaluation,
          session,
          requestId,
        );
        return {
          ...(mayReturnSensitiveEvaluation ? { evaluation } : {}),
          application: {
            id: saved.id,
            stage: saved.stage,
            lockVersion: saved.lockVersion,
          },
        };
      }

      const interviewBlock = resolveInterviewBlock(
        vacancy.pipeline,
        application.interviewBlockId,
        application.questions.map((question) => question.id),
      );
      if (!interviewBlock) throw new ApiError(409, "INTERVIEW_BLOCK_MISSING", "Published vacancy has no interview block.");
      const boundApplication = {
        ...application,
        interviewBlockId: interviewBlock.id,
      };
      const evaluationHistory = evaluationHistoryForInterviewRun(
        vacancy,
        application,
        interviewBlock.id,
      );
      const questions =
        interviewBlock.settings.kind === "async_interview" ||
        interviewBlock.settings.kind === "live_ai_interview" ||
        interviewBlock.settings.kind === "chat_interview"
          ? interviewBlock.settings.questions
          : [];
      const answerGroups = groupInterviewAnswersByFrozenQuestion(
        questions,
        evaluationHistory,
      );
      const mappedAnswerTurns = answerGroups
        .flatMap((group) =>
          group.answers.map((answer) => ({
            ...answer,
            questionId: group.questionId,
          })),
        )
        .sort((left, right) => left.turnNumber - right.turnNumber);

      const runtime: BlockRuntimeResult = {
        blockId: interviewBlock.id,
        kind: interviewBlock.kind,
        completedAt: application.updatedAt,
        elapsedSec: 0,
        payload: answerGroups.map((group) => ({
          questionId: group.questionId,
          answer: group.answers.map((answer) => answer.answer).join("\n\n"),
        })),
        transcript: mappedAnswerTurns.map((answer) => ({
          speaker: "candidate" as const,
          text: answer.answer,
          at: `turn-${answer.turnNumber}`,
          itemId: answer.questionId,
          kind: answer.kind,
        })),
        integrityEvents: evaluationHistory.flatMap((turn) => turn.integrity ?? []),
      };

      const domainApplication: ApplicationRecord = {
        id: application.id,
        vacancyId: application.vacancyId,
        code: application.code,
        candidate: { internalId: application.internalCandidateId },
        stage: application.stage,
        consent: application.consentAt
          ? { noticeVersion: application.noticeVersion, at: application.consentAt }
          : null,
        blockResults: [runtime],
        currentBlockIndex: vacancy.pipeline.indexOf(interviewBlock) + 1,
        createdAt: application.createdAt,
        submittedAt: application.updatedAt,
        audit: [],
      };
      const evaluation = vacancyAiExecutionMode(vacancy) === "openai_required"
        ? await evaluateInterviewWithProvider(vacancy, {
            ...boundApplication,
            history: evaluationHistory,
          })
        : evaluateApplication(vacancy, domainApplication);
      const saved = await saveApplicationEvaluation(
        boundApplication,
        evaluation,
        session,
        requestId,
      );
      return {
        ...(mayReturnSensitiveEvaluation ? { evaluation } : {}),
        application: { id: saved.id, stage: saved.stage, lockVersion: saved.lockVersion },
      };
    },
  );
  return route(request);
}
