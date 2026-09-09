import { NextResponse } from "next/server";
import { getCandidateSession } from "@/lib/server/candidate-auth";
import {
  candidateAssessmentProgress,
  candidateSafeAssessmentBlockRuns,
  evaluateKnockoutSubmission,
} from "@/lib/server/assessment-orchestrator";
import { candidateBlockControls } from "@/lib/server/assessment-controls";
import { candidateRepairCapabilities } from "@/lib/server/interview-protocol";
import {
  getCandidateApplication,
  getTenantVacancyVersion,
} from "@/lib/server/repository";
import {
  candidateJourneyPlan,
  candidateOpenedAssessmentBlock,
} from "@/lib/candidate-assessment-view";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getCandidateSession();
  if (!session || session.applicationId !== id) {
    return NextResponse.json({ error: "Candidate session is missing or expired." }, { status: 401 });
  }
  const application = await getCandidateApplication(id, session.token);
  if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  const activeAssessmentAttempt =
    application.blockRuns &&
    application.currentBlockIndex !== undefined
      ? Math.max(
          1,
          application.blockRuns[application.currentBlockIndex]?.attempts ?? 1,
        )
      : 1;
  const untaggedBelongsToCurrent =
    Boolean(application.assessmentPlan && application.interviewBlockId) &&
    application.history.every(
      (turn) =>
        !turn.blockId ||
        (turn.blockId === application.interviewBlockId &&
          (turn.assessmentAttempt ?? 1) === activeAssessmentAttempt),
    );
  const activeHistory =
    application.assessmentPlan && application.interviewBlockId
      ? application.history.filter(
          (turn) =>
            (turn.blockId === application.interviewBlockId &&
              (turn.assessmentAttempt ?? 1) === activeAssessmentAttempt) ||
            (!turn.blockId &&
              untaggedBelongsToCurrent &&
              activeAssessmentAttempt === 1),
        )
      : application.history;
  const currentQuestion = activeHistory.at(-1);
  const openQuestion =
    currentQuestion && !currentQuestion.answer ? currentQuestion : null;
  const candidateHistory = activeHistory.map((turn) => {
    if (!turn.transcript) return turn;
    return {
      ...turn,
      transcript: { ...turn.transcript, reviewedBy: undefined },
    };
  });
  const assessment =
    application.assessmentPlan &&
    application.blockRuns &&
    application.blockResults &&
    application.currentBlockIndex !== undefined
      ? candidateAssessmentProgress(application.assessmentPlan, {
          blockRuns: application.blockRuns,
          blockResults: application.blockResults,
          currentBlockIndex: application.currentBlockIndex,
          progress: application.progress,
          stage:
            application.stage === "submitted" ||
            application.stage === "under_review" ||
            application.stage === "needs_adjudication"
              ? application.stage
              : "in_progress",
        })
      : null;
  const candidateBlockRuns = application.blockRuns
    ? candidateSafeAssessmentBlockRuns(application.blockRuns)
    : undefined;
  const openedCurrentBlock =
    assessment && application.assessmentPlan
      ? candidateOpenedAssessmentBlock({
          plan: application.assessmentPlan,
          currentBlockIndex: application.currentBlockIndex!,
          currentRunStatus: assessment.currentRun?.status,
          consentAt: application.consentAt,
        })
      : null;
  const currentControls =
    assessment?.currentBlock && assessment.currentRun
      ? candidateBlockControls(
          assessment.currentBlock,
          assessment.currentRun,
          application.createdAt,
        )
      : undefined;
  const finalRejection =
    application.stage === "not_moving_forward" ||
    application.stage === "knocked_out";
  const frozenVacancy = finalRejection
    ? await getTenantVacancyVersion(
        application.vacancyId,
        application.vacancyVersion,
        application.organizationId,
      )
    : null;
  const candidateRejectionTexts: string[] = [];
  if (frozenVacancy && application.blockResults) {
    const resultsByBlock = new Map(
      application.blockResults.map((result) => [result.blockId, result]),
    );
    for (const block of frozenVacancy.pipeline) {
      if (block.settings.kind !== "knockout") continue;
      const result = resultsByBlock.get(block.id);
      if (
        !result ||
        result.kind !== "knockout" ||
        !result.payload ||
        typeof result.payload !== "object" ||
        Array.isArray(result.payload) ||
        !("answers" in result.payload) ||
        !result.payload.answers ||
        typeof result.payload.answers !== "object" ||
        Array.isArray(result.payload.answers)
      ) {
        continue;
      }
      const outcome = evaluateKnockoutSubmission(
        block,
        result.payload as Record<string, unknown>,
      );
      for (const text of outcome.candidateRejectionTexts) {
        if (!candidateRejectionTexts.includes(text)) {
          candidateRejectionTexts.push(text);
        }
      }
    }
  }
  return NextResponse.json(
    {
      application: {
        id: application.id,
        code: application.code,
        title: application.title,
        stage: application.stage,
        noticeVersion: application.noticeVersion,
        retentionDays: application.retentionDays,
        consentAt: application.consentAt,
        interviewMode: application.interviewMode ?? "video",
        progress: application.progress,
        lockVersion: application.lockVersion,
        history: candidateHistory,
        turnNumber: application.history.length,
        currentTurnNumber: openQuestion ? application.history.length : null,
        currentQuestion: openQuestion,
        ...(candidateRejectionTexts.length > 0
          ? { candidateRejectionTexts }
          : {}),
        ...(openedCurrentBlock &&
        [
          "async_interview",
          "live_ai_interview",
          "chat_interview",
        ].includes(openedCurrentBlock.kind)
          ? {
              interviewControls: currentControls,
              interviewPolicy:
                openedCurrentBlock.manifest.kind === "chat_interview"
                  ? {
                      kind: "chat_interview" as const,
                      minAnswerWords:
                        openedCurrentBlock.manifest.minAnswerWords,
                      maxAnswerWords:
                        openedCurrentBlock.manifest.maxAnswerWords,
                      pastePolicy:
                        openedCurrentBlock.manifest.pastePolicy,
                    }
                  : openedCurrentBlock.manifest.kind === "live_ai_interview"
                    ? {
                        kind: "live_ai_interview" as const,
                        personaName: openedCurrentBlock.manifest.persona.name,
                      }
                  : {
                      kind: "async_interview" as const,
                    },
            }
          : {}),
        ...(assessment
          ? {
              assessment: {
                plan: candidateJourneyPlan(application.assessmentPlan!),
                blockRuns: candidateBlockRuns,
                currentBlockIndex: application.currentBlockIndex,
                currentBlock: openedCurrentBlock,
                currentRun: assessment.currentRun,
                currentControls,
                ...(application.consentAt &&
                assessment.currentBlock?.manifest.kind === "human_stage"
                  ? {
                      currentCoordination: {
                        kind: "human_stage" as const,
                        selfBooking:
                          assessment.currentBlock.manifest.selfBooking,
                        ...(assessment.currentBlock.manifest.bookingUrl
                          ? {
                              bookingUrl:
                                assessment.currentBlock.manifest.bookingUrl,
                            }
                          : {}),
                      },
                    }
                  : {}),
                completed: assessment.completed,
                total: assessment.total,
              },
            }
          : {}),
        repairCapabilities: candidateRepairCapabilities(
          application.questions,
          activeHistory,
          application.followUpPolicy ?? 0,
        ),
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
