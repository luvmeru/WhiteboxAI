import { getCandidateSession } from "@/lib/server/candidate-auth";
import type {
  InterviewTurn,
  TranscriptProvenance,
} from "@/lib/ai-contracts";
import type { ApplicationStage } from "@/lib/types";
import {
  nextInterviewStep,
  type InterviewProviderResult,
} from "@/lib/server/ai-provider";
import { applicationAiExecutionMode } from "@/lib/server/ai-rollout";
import { completeAssessmentBlock } from "@/lib/server/assessment-orchestrator";
import {
  candidateBlockControls,
  startCandidateBlockRun,
} from "@/lib/server/assessment-controls";
import {
  ApiError,
  createJsonApiRoute,
  expectBoolean,
  expectEnum,
  expectNumber,
  expectObject,
  expectOnlyKeys,
  expectString,
} from "@/lib/server/http";
import {
  attachAnswerAssessment,
  candidateRepairCapabilities,
  eligibleInterviewOptions,
  planInterviewStep,
  resolveInterviewBlock,
} from "@/lib/server/interview-protocol";
import { resolveRecordingReceipt } from "@/lib/server/media";
import {
  buildSubmittedTranscript,
  transcriptForInterviewContinuation,
} from "@/lib/server/transcript-provenance";
import {
  frozenInterviewFollowUpPolicy,
  frozenInterviewQuestions,
  getCandidateApplication,
  getTenantVacancyVersion,
  saveCandidateApplication,
} from "@/lib/server/repository";
import { countNaturalLanguageWords } from "@/lib/word-count";

function validateTurn(value: unknown): {
  answer?: string;
  recordingReceipt?: string;
  correctionReason?: string;
  candidateRequest?: "rephrase" | "alternate";
  pasteDetected?: boolean;
  pasteAcknowledged?: boolean;
  expectedVersion: number;
} {
  const body = expectObject(value);
  expectOnlyKeys(body, [
    "answer",
    "recordingReceipt",
    "correctionReason",
    "candidateRequest",
    "pasteDetected",
    "pasteAcknowledged",
    "expectedVersion",
  ]);
  return {
    answer:
      body.answer === undefined
        ? undefined
        : expectString(body.answer, "body.answer", { min: 1, max: 12_000 }),
    recordingReceipt:
      body.recordingReceipt === undefined
        ? undefined
        : expectString(body.recordingReceipt, "body.recordingReceipt", {
            min: 16,
            max: 4_096,
          }),
    correctionReason:
      body.correctionReason === undefined
        ? undefined
        : expectString(body.correctionReason, "body.correctionReason", {
            min: 8,
            max: 1_000,
            trim: true,
          }),
    candidateRequest:
      body.candidateRequest === undefined
        ? undefined
        : expectEnum(
            body.candidateRequest,
            "body.candidateRequest",
            ["rephrase", "alternate"] as const,
          ),
    pasteDetected:
      body.pasteDetected === undefined
        ? undefined
        : expectBoolean(body.pasteDetected, "body.pasteDetected"),
    pasteAcknowledged:
      body.pasteAcknowledged === undefined
        ? undefined
        : expectBoolean(
            body.pasteAcknowledged,
            "body.pasteAcknowledged",
          ),
    expectedVersion: expectNumber(body.expectedVersion, "body.expectedVersion", {
      min: 1,
      max: 1_000_000,
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
      routeId: "candidate.interview.turn",
      access: "public",
      sameOrigin: true,
      maxBodyBytes: 32 * 1024,
      rateLimit: { limit: 40, windowMs: 60_000 },
      validate: validateTurn,
    },
    async ({ body }) => {
      const session = await getCandidateSession();
      if (!session || session.applicationId !== id) {
        throw new ApiError(401, "CANDIDATE_SESSION_REQUIRED", "Candidate session is missing or expired.");
      }
      const application = await getCandidateApplication(id, session.token);
      if (!application) throw new ApiError(404, "NOT_FOUND", "Application not found.");
      if (!application.consentAt) {
        throw new ApiError(409, "CONSENT_REQUIRED", "Consent is required before the interview.");
      }
      if (application.lockVersion !== body.expectedVersion) {
        throw new ApiError(409, "VERSION_CONFLICT", "Interview state changed. Reload before retrying.");
      }
      if (application.stage !== "in_progress") {
        throw new ApiError(409, "INTERVIEW_COMPLETE", "This interview is already complete.");
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
          "The immutable published vacancy version is unavailable.",
        );
      }
      const interviewBlock = resolveInterviewBlock(
        vacancy.pipeline,
        application.interviewBlockId,
        application.questions.map((question) => question.id),
      );
      if (!interviewBlock) {
        throw new ApiError(
          409,
          "INTERVIEW_BLOCK_MISSING",
          "The immutable published vacancy version has no matching interview block.",
        );
      }
      const multiBlockRuntime = Boolean(
        application.assessmentPlan &&
          application.blockRuns &&
          application.blockResults &&
          application.currentBlockIndex !== undefined,
      );
      let workingBlockRuns = application.blockRuns;
      let currentAssessmentAttempt = 1;
      if (multiBlockRuntime) {
        const currentBlock =
          application.assessmentPlan!.blocks[
            application.currentBlockIndex!
          ];
        const currentRun =
          application.blockRuns![application.currentBlockIndex!];
        if (
          !currentBlock ||
          !currentRun ||
          currentBlock.id !== interviewBlock.id ||
          ![
            "async_interview",
            "live_ai_interview",
            "chat_interview",
          ].includes(currentBlock.kind)
        ) {
          throw new ApiError(
            409,
            "INTERVIEW_BLOCK_NOT_OPEN",
            "This interview is not the current stage in the frozen assessment plan.",
          );
        }
        const requestAt = new Date().toISOString();
        const controls = candidateBlockControls(
          currentBlock,
          currentRun,
          application.createdAt,
          requestAt,
        );
        if (controls.expiredReason) {
          const blockedRuns = application.blockRuns!.map(
            (candidate, runIndex) =>
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
            "The published interview window has ended. A named reviewer must decide the next step.",
          );
        }
        let activeRun = currentRun;
        if (currentRun.status === "available") {
          try {
            activeRun = startCandidateBlockRun(currentBlock, currentRun, {
              restart: false,
              at: requestAt,
            });
          } catch (error) {
            throw new ApiError(
              409,
              "BLOCK_ATTEMPT_LIMIT",
              error instanceof Error
                ? error.message
                : "This interview cannot be started.",
            );
          }
          workingBlockRuns = application.blockRuns!.map(
            (candidate, runIndex) =>
              runIndex === application.currentBlockIndex
                ? activeRun
                : { ...candidate },
          );
        } else if (currentRun.status !== "in_progress") {
          throw new ApiError(
            409,
            "INTERVIEW_BLOCK_NOT_OPEN",
            "This interview is not accepting another candidate turn.",
          );
        }
        currentAssessmentAttempt = Math.max(1, activeRun.attempts);
      }
      if (
        body.candidateRequest &&
        (body.answer ||
          body.recordingReceipt ||
          body.correctionReason ||
          body.pasteDetected !== undefined ||
          body.pasteAcknowledged !== undefined)
      ) {
        throw new ApiError(
          422,
          "AMBIGUOUS_INTERVIEW_TURN",
          "A question adaptation request cannot include an answer or recording.",
        );
      }

      const untaggedBelongsToCurrent =
        multiBlockRuntime &&
        application.history.every(
          (turn) =>
            !turn.blockId ||
            (turn.blockId === interviewBlock.id &&
              (turn.assessmentAttempt ?? 1) === currentAssessmentAttempt),
        );
      const isCurrentTurn = (turn: (typeof application.history)[number]) =>
        !multiBlockRuntime ||
        (turn.blockId === interviewBlock.id &&
          (turn.assessmentAttempt ?? 1) === currentAssessmentAttempt) ||
        (!turn.blockId &&
          untaggedBelongsToCurrent &&
          currentAssessmentAttempt === 1);
      const priorHistory = multiBlockRuntime
        ? application.history.filter((turn) => !isCurrentTurn(turn))
        : [];
      let history: InterviewTurn[] = application.history
        .filter(isCurrentTurn)
        .map((turn) => ({
          ...turn,
          blockId: interviewBlock.id,
          assessmentAttempt: currentAssessmentAttempt,
        }));
      if (body.candidateRequest) {
        const last = history.at(-1);
        if (!last || last.answer || last.resolution) {
          throw new ApiError(
            409,
            "NO_OPEN_QUESTION",
            "There is no open question that can be adapted.",
          );
        }
        const optionId =
          body.candidateRequest === "rephrase"
            ? "repair:rephrase"
            : "repair:alternate";
        const eligible = eligibleInterviewOptions(
          application.questions,
          history,
          application.followUpPolicy ?? 0,
        ).find((option) => option.id === optionId);
        if (!eligible) {
          throw new ApiError(
            409,
            "QUESTION_ADAPTATION_LIMIT",
            "The standardized adaptation allowance for this question is exhausted.",
          );
        }
        history = history.map((turn, index) =>
          index === history.length - 1
            ? {
                ...turn,
                resolution:
                  body.candidateRequest === "rephrase"
                    ? "candidate_requested_rephrase"
                    : "candidate_requested_alternate",
              }
            : turn,
        );
      } else if (body.answer) {
        const last = history.at(-1);
        if (!last || last.answer) {
          throw new ApiError(409, "NO_OPEN_QUESTION", "There is no open question for this answer.");
        }
        const textAccommodation =
          application.interviewMode === "text_accommodation";
        if (interviewBlock.settings.kind === "chat_interview") {
          const wordCount = countNaturalLanguageWords(
            body.answer,
            interviewBlock.languageOverride ??
              vacancy.profile.languages.primary,
          );
          if (
            wordCount < interviewBlock.settings.minAnswerWords ||
            wordCount > interviewBlock.settings.maxAnswerWords
          ) {
            throw new ApiError(
              422,
              "CHAT_WORD_LIMIT",
              `Answer must contain ${interviewBlock.settings.minAnswerWords}–${interviewBlock.settings.maxAnswerWords} words; received ${wordCount}.`,
            );
          }
          if (body.pasteDetected === undefined) {
            throw new ApiError(
              422,
              "PASTE_EVENT_DISCLOSURE_REQUIRED",
              "The structured text client must report whether a paste event occurred.",
            );
          }
          if (
            body.pasteDetected &&
            interviewBlock.settings.pastePolicy === "block"
          ) {
            throw new ApiError(
              422,
              "PASTE_POLICY_BLOCKED",
              "Pasted text is not accepted under the published response policy.",
            );
          }
          if (
            body.pasteDetected &&
            interviewBlock.settings.pastePolicy === "warn" &&
            body.pasteAcknowledged !== true
          ) {
            throw new ApiError(
              422,
              "PASTE_ACKNOWLEDGEMENT_REQUIRED",
              "Acknowledge the published paste notice before submitting.",
            );
          }
        } else if (
          body.pasteDetected !== undefined ||
          body.pasteAcknowledged !== undefined
        ) {
          throw new ApiError(
            422,
            "UNEXPECTED_PASTE_EVENT",
            "Paste-event fields are accepted only for a published chat interview.",
          );
        }
        if (!textAccommodation && !body.recordingReceipt) {
          throw new ApiError(
            409,
            "RECORDING_REQUIRED",
            "A verified camera-and-microphone recording is required for video mode.",
          );
        }
        const resolvedRecording = body.recordingReceipt
          ? await resolveRecordingReceipt(body.recordingReceipt, {
              organizationId: application.organizationId,
              applicationId: application.id,
              applicationVersion: application.lockVersion,
              turnNumber: application.history.length,
            })
          : null;
        if (body.recordingReceipt && !resolvedRecording) {
          throw new ApiError(
            409,
            "INVALID_RECORDING_RECEIPT",
            "The recording receipt is invalid or expired. Upload the answer again.",
          );
        }
        if (textAccommodation && resolvedRecording) {
          throw new ApiError(
            422,
            "UNEXPECTED_RECORDING",
            "Recorded media is not accepted while the text accommodation is active.",
          );
        }
        if (textAccommodation && body.correctionReason) {
          throw new ApiError(
            422,
            "UNEXPECTED_CORRECTION_REASON",
            "A transcript correction reason is only used for recorded answers.",
          );
        }
        let transcript: TranscriptProvenance | undefined;
        if (resolvedRecording) {
          try {
            transcript = buildSubmittedTranscript(
              resolvedRecording.recording,
              body.answer,
              body.correctionReason,
            );
          } catch (error) {
            throw new ApiError(
              422,
              "TRANSCRIPT_PROVENANCE_INVALID",
              error instanceof Error
                ? error.message
                : "The transcript provenance could not be recorded.",
            );
          }
        }
        history = history.map((turn, index) =>
          index === history.length - 1
            ? {
                ...turn,
                answer: body.answer,
                recordingId: resolvedRecording?.recording.id,
                transcript,
                integrity: undefined,
              }
            : turn,
        );
      } else if (history.length) {
        throw new ApiError(409, "ANSWER_REQUIRED", "An answer is required for the open question.");
      } else if (body.recordingReceipt) {
        throw new ApiError(
          422,
          "UNEXPECTED_RECORDING_RECEIPT",
          "A recording receipt cannot be submitted without an answer.",
        );
      }

      const providerHistory = history.map((turn) =>
        turn.recordingId
          ? {
              ...turn,
              answer:
                transcriptForInterviewContinuation(turn.transcript) ??
                undefined,
            }
          : turn,
      );
      let provider: InterviewProviderResult;
      if (body.candidateRequest) {
        const selectedOptionId =
          body.candidateRequest === "rephrase"
            ? "repair:rephrase"
            : "repair:alternate";
        provider = {
          step: {
            done: false,
            progress: 0,
            selectedOptionId,
            strategy:
              body.candidateRequest === "rephrase"
                ? "clarification"
                : "situational_alternative",
          },
          model: "candidate-controlled-structured-plan",
          promptVersion: "candidate-question-repair-v1",
        };
      } else if (history.length === 0) {
        provider = {
          step: {
            done: false,
            progress: 0,
            selectedOptionId: "plan:next",
            strategy: "published_main",
          },
          model: "published-question-plan",
          promptVersion: "published-question-v2",
        };
      } else {
        const aiExecutionMode = applicationAiExecutionMode(
          application.aiExecutionMode,
        );
        try {
          provider = await nextInterviewStep({
            applicationId: application.id,
            internalCandidateId: application.internalCandidateId,
            vacancyTitle: application.title,
            competencies: application.competencies,
            vacancy,
            interviewBlockId: interviewBlock.id,
            questions: application.questions,
            history: providerHistory,
            followUpPolicy: application.followUpPolicy ?? 0,
            aiExecutionMode,
          });
        } catch (error) {
          if (aiExecutionMode === "openai_required") {
            throw new ApiError(
              503,
              "AI_INTERVIEW_UNAVAILABLE",
              "The AI interviewer is temporarily unavailable. Your saved progress is unchanged; retry this turn shortly.",
            );
          }
          const errorName =
            error instanceof Error ? error.name : "UnknownError";
          console.error(
            `[ai:interview-router] provider unavailable; continuing with the immutable published plan (${errorName})`,
          );
          provider = {
            step: {
              done: false,
              progress: 0,
              selectedOptionId: "plan:next",
              strategy: "published_main",
            },
            model: "published-plan-provider-fallback",
            promptVersion: "provider-unavailable-fallback-v1",
          };
        }
      }

      if (body.answer) {
        history = attachAnswerAssessment(history, provider.assessment).map(
          (turn, index) =>
            index === history.length - 1
              ? {
                  ...turn,
                  engine: {
                    model: provider.model,
                    promptVersion: provider.promptVersion,
                    responseId: provider.responseId,
                  },
                }
              : turn,
        );
      }
      const step = planInterviewStep(
        provider.step,
        application.questions,
        history,
        application.followUpPolicy ?? 0,
        Math.min(
          6,
          Math.max(
            1,
            Math.trunc(
              vacancy.scoring.abstainPolicy.minEvidencePerAttribute || 1,
            ),
          ),
        ),
      );
      if (!step.done) {
        history = [
          ...history,
          {
            blockId: interviewBlock.id,
            ...(multiBlockRuntime
              ? { assessmentAttempt: currentAssessmentAttempt }
              : {}),
            question: step.question!,
            topic: step.topic!,
            kind: step.kind!,
            questionId: step.questionId,
            thinkTimeSec: step.thinkTimeSec,
            answerCapSec: step.answerCapSec,
            modality: step.modality,
            reRecordAttempts: step.reRecordAttempts,
            recordingAttempts: 0,
            notesAllowed: step.notesAllowed,
            strategy: step.strategy,
            engine: {
              model: provider.model,
              promptVersion: provider.promptVersion,
              responseId: provider.responseId,
            },
          },
        ];
      }

      const combinedHistory = multiBlockRuntime
        ? [...priorHistory, ...history]
        : history;
      let nextEntry: "assessment" | "status" =
        multiBlockRuntime ? "assessment" : "status";
      let nextQuestions = application.questions;
      let nextInterviewBlockId: string | undefined = interviewBlock.id;
      let nextFollowUpPolicy = application.followUpPolicy;
      let nextBlockRuns = workingBlockRuns;
      let nextBlockResults = application.blockResults;
      let nextBlockIndex = application.currentBlockIndex;
      let nextStage: ApplicationStage = step.done
        ? "under_review"
        : application.stage;
      let nextProgress = Math.max(application.progress, step.progress);

      if (
        multiBlockRuntime &&
        application.assessmentPlan &&
        workingBlockRuns &&
        application.blockResults &&
        application.currentBlockIndex !== undefined
      ) {
        if (step.done) {
          const completedAt = new Date().toISOString();
          const startedAt =
            workingBlockRuns[application.currentBlockIndex]?.startedAt;
          const startedAtMs = startedAt ? Date.parse(startedAt) : Number.NaN;
          const elapsedSec = Number.isFinite(startedAtMs)
            ? Math.max(
                0,
                Math.round(
                  (Date.parse(completedAt) - startedAtMs) / 1_000,
                ),
              )
            : 0;
          const runtime = completeAssessmentBlock(
            application.assessmentPlan,
            {
              blockRuns: workingBlockRuns,
              blockResults: application.blockResults,
              currentBlockIndex: application.currentBlockIndex,
              progress: application.progress,
              stage: "in_progress",
            },
            {
              blockId: interviewBlock.id,
              completionState: "awaiting_ai_assisted_human_review",
              result: {
                blockId: interviewBlock.id,
                kind: interviewBlock.kind,
                completedAt,
                elapsedSec,
                payload: history
                  .filter((turn) => Boolean(turn.answer))
                  .map((turn) => ({
                    questionId: turn.questionId,
                    answer: turn.answer,
                    strategy: turn.strategy,
                  })),
                transcript: history.flatMap((turn, index) => [
                  {
                    speaker: "ai" as const,
                    text: turn.question,
                    at: `turn-${priorHistory.length + index + 1}:question`,
                    itemId: turn.questionId,
                    kind: turn.kind,
                  },
                  ...(turn.answer
                    ? [
                        {
                          speaker: "candidate" as const,
                          text:
                            transcriptForInterviewContinuation(
                              turn.transcript,
                            ) ??
                            turn.answer,
                          at: `turn-${priorHistory.length + index + 1}`,
                          itemId: turn.questionId,
                          kind: turn.kind,
                        },
                      ]
                    : []),
                ]),
                integrityEvents: history.flatMap(
                  (turn) => turn.integrity ?? [],
                ),
              },
            },
            completedAt,
          );
          nextBlockRuns = runtime.blockRuns;
          nextBlockResults = runtime.blockResults;
          nextBlockIndex = runtime.currentBlockIndex;
          nextStage = runtime.stage;
          nextProgress = runtime.progress;
          const nextBlock =
            application.assessmentPlan.blocks[runtime.currentBlockIndex];
          const nextIsInterview = Boolean(
            nextBlock &&
              [
                "async_interview",
                "live_ai_interview",
                "chat_interview",
              ].includes(nextBlock.kind),
          );
          nextQuestions =
            nextIsInterview && nextBlock
              ? frozenInterviewQuestions(vacancy, nextBlock.id)
              : [];
          nextInterviewBlockId =
            nextIsInterview && nextBlock ? nextBlock.id : undefined;
          nextFollowUpPolicy =
            nextIsInterview && nextBlock
              ? frozenInterviewFollowUpPolicy(vacancy, nextBlock.id)
              : 0;
          nextEntry =
            runtime.stage === "in_progress" ? "assessment" : "status";
        } else {
          const finished = workingBlockRuns.filter((run) =>
            [
              "submitted",
              "awaiting_ai_review",
              "awaiting_human_review",
              "awaiting_verification",
              "awaiting_external_participants",
              "skipped",
            ].includes(run.status),
          ).length;
          nextProgress = Math.min(
            0.99,
            (finished + step.progress) /
              Math.max(1, workingBlockRuns.length),
          );
        }
      }

      const updated = await saveCandidateApplication(
        {
          ...application,
          interviewBlockId: nextInterviewBlockId,
          questions: nextQuestions,
          followUpPolicy: nextFollowUpPolicy,
          history: combinedHistory,
          progress: nextProgress,
          stage: nextStage,
          ...(multiBlockRuntime
            ? {
                blockRuns: nextBlockRuns,
                blockResults: nextBlockResults,
                currentBlockIndex: nextBlockIndex,
              }
            : {}),
        },
        application.lockVersion,
        step.done ? "INTERVIEW_BLOCK_SUBMITTED" : "INTERVIEW_TURN_RECORDED",
      );
      const activeControls =
        !step.done &&
        multiBlockRuntime &&
        application.assessmentPlan &&
        updated.blockRuns &&
        application.currentBlockIndex !== undefined
          ? candidateBlockControls(
              application.assessmentPlan.blocks[
                application.currentBlockIndex
              ]!,
              updated.blockRuns[application.currentBlockIndex]!,
              updated.createdAt,
            )
          : undefined;

      return {
        step,
        application: {
          id: updated.id,
          stage: updated.stage,
          lockVersion: updated.lockVersion,
          currentTurnNumber: step.done ? null : combinedHistory.length,
          nextEntry,
          repairCapabilities: candidateRepairCapabilities(
            application.questions,
            history,
            application.followUpPolicy ?? 0,
          ),
          ...(activeControls
            ? { interviewControls: activeControls }
            : {}),
        },
        engine: {
          model: provider.model,
          promptVersion: provider.promptVersion,
          responseId: provider.responseId,
        },
      };
    },
  );
  return route(request);
}
