import type {
  CandidateRepairCapabilities,
  InterviewAnswerAssessment,
  InterviewQuestionStrategy,
  InterviewStepResponse,
  InterviewTurn,
} from "@/lib/ai-contracts";
import type { ServerInterviewQuestion } from "./repository";

const INTERVIEW_KINDS = new Set([
  "async_interview",
  "live_ai_interview",
  "chat_interview",
]);

export interface InterviewBlockLike {
  id?: string;
  order: number;
  required: boolean;
  scored: boolean;
  settings: {
    kind: string;
    questions?: { id: string }[];
  };
}

export function selectInterviewBlock<T extends InterviewBlockLike>(
  blocks: T[],
): T | undefined {
  return [...blocks]
    .filter((block) => INTERVIEW_KINDS.has(block.settings.kind))
    .sort(
      (left, right) =>
        Number(right.required) - Number(left.required) ||
        Number(right.scored) - Number(left.scored) ||
        left.order - right.order ||
        (left.id ?? "").localeCompare(right.id ?? ""),
    )[0];
}

export function resolveInterviewBlock<T extends InterviewBlockLike>(
  blocks: T[],
  boundBlockId: string | undefined,
  questionIds: string[],
): T | undefined {
  const interviewBlocks = blocks.filter((block) =>
    INTERVIEW_KINDS.has(block.settings.kind),
  );
  if (boundBlockId) {
    const bound = interviewBlocks.find((block) => block.id === boundBlockId);
    if (bound) return bound;
  }

  if (questionIds.length > 0) {
    const sameOrderedPlan = selectInterviewBlock(
      interviewBlocks.filter((block) => {
        const ids = block.settings.questions?.map((question) => question.id);
        return (
          ids?.length === questionIds.length &&
          ids.every((id, index) => id === questionIds[index])
        );
      }),
    );
    if (sameOrderedPlan) return sameOrderedPlan;

    const expected = new Set(questionIds);
    const sameQuestionSet = selectInterviewBlock(
      interviewBlocks.filter((block) => {
        const ids = block.settings.questions?.map((question) => question.id);
        return (
          ids?.length === expected.size &&
          ids.every((id) => expected.has(id))
        );
      }),
    );
    if (sameQuestionSet) return sameQuestionSet;
  }

  return selectInterviewBlock(interviewBlocks);
}

export function defaultClarification(
  question: ServerInterviewQuestion,
): string {
  if (question.clarification?.trim()) return question.clarification.trim();
  return `You may use an example from work, study, volunteering, or a personal project. Rephrased: ${question.text}`;
}

export function defaultSituationalAlternative(
  question: ServerInterviewQuestion,
): string {
  if (question.situationalFallback?.trim()) {
    return question.situationalFallback.trim();
  }
  return `If you have not faced this before, treat the same task as a hypothetical work scenario: ${question.text} What options would you consider, what would you personally do, why, and how would you verify the result?`;
}

export interface EligibleInterviewOption {
  id: string;
  action:
    | "rephrase"
    | "alternate"
    | "followup"
    | "next"
    | "complete";
  text: string | null;
  reasonCode:
    | "candidate_requested_rephrase"
    | "candidate_has_no_applicable_example"
    | "missing_context"
    | "missing_personal_action"
    | "missing_decision_basis"
    | "missing_outcome"
    | "missing_reflection"
    | "adequate_evidence"
    | "probe_budget_exhausted"
    | "plan_complete";
}

function activePublishedQuestion(
  questions: ServerInterviewQuestion[],
  history: InterviewTurn[],
): ServerInterviewQuestion | undefined {
  const lastMain = [...history].reverse().find((turn) => turn.kind === "main");
  return (
    questions.find((question) => question.id === lastMain?.questionId) ??
    questions[Math.max(0, history.filter((turn) => turn.kind === "main").length - 1)]
  );
}

function activeRepairQuestion(
  publishedQuestion: ServerInterviewQuestion,
  history: InterviewTurn[],
): ServerInterviewQuestion {
  const currentTurn = history.at(-1);
  if (!currentTurn || currentTurn.kind !== "followup") {
    return publishedQuestion;
  }

  return {
    ...publishedQuestion,
    text: currentTurn.question,
    clarification: undefined,
    situationalFallback: undefined,
  };
}

function adaptiveTurnBudget(
  history: InterviewTurn[],
  followUpPolicy: 0 | 1 | 2,
): { lastMainIndex: number; remaining: number } {
  const lastMainIndex = history.findLastIndex((turn) => turn.kind === "main");
  const used =
    lastMainIndex < 0
      ? 0
      : history
          .slice(lastMainIndex + 1)
          .filter(
            (turn) =>
              turn.kind === "followup" &&
              turn.strategy !== "clarification" &&
              turn.strategy !== "situational_alternative",
          ).length;
  return {
    lastMainIndex,
    remaining: Math.max(0, followUpPolicy - used),
  };
}

export function eligibleInterviewOptions(
  questions: ServerInterviewQuestion[],
  history: InterviewTurn[],
  followUpPolicy: 0 | 1 | 2,
): EligibleInterviewOption[] {
  const mainsAsked = history.filter((turn) => turn.kind === "main").length;
  const nextMain = questions[mainsAsked];
  const active = activePublishedQuestion(questions, history);
  const { lastMainIndex, remaining: remainingAdaptive } = adaptiveTurnBudget(
    history,
    followUpPolicy,
  );
  const options: EligibleInterviewOption[] = [];

  if (active) {
    const activeTurns =
      lastMainIndex < 0 ? [] : history.slice(lastMainIndex + 1);
    const repairQuestion = activeRepairQuestion(active, history);
    const currentStrategy = history.at(-1)?.strategy;
    const currentTurnIsRepair =
      currentStrategy === "clarification" ||
      currentStrategy === "situational_alternative";
    if (!currentTurnIsRepair) {
      options.push({
        id: "repair:rephrase",
        action: "rephrase",
        text: defaultClarification(repairQuestion),
        reasonCode: "candidate_requested_rephrase",
      });
      options.push({
        id: "repair:alternate",
        action: "alternate",
        text: defaultSituationalAlternative(repairQuestion),
        reasonCode: "candidate_has_no_applicable_example",
      });
    }
    if (remainingAdaptive > 0) {
      active.probes.forEach((probe, index) => {
        if (activeTurns.some((turn) => turn.question === probe)) {
          return;
        }
        const reasonCodes: EligibleInterviewOption["reasonCode"][] = [
          "missing_context",
          "missing_personal_action",
          "missing_decision_basis",
          "missing_outcome",
          "missing_reflection",
        ];
        options.push({
          id: `probe:${index}`,
          action: "followup",
          text: probe,
          reasonCode:
            reasonCodes[Math.min(index, reasonCodes.length - 1)] ??
            "missing_outcome",
        });
      });
    }
  }

  if (nextMain) {
    options.push({
      id: "plan:next",
      action: "next",
      text: nextMain.text,
      reasonCode:
        remainingAdaptive > 0
          ? "adequate_evidence"
          : "probe_budget_exhausted",
    });
  } else {
    options.push({
      id: "plan:complete",
      action: "complete",
      text: null,
      reasonCode: "plan_complete",
    });
  }
  return options;
}

export function enforceInterviewEvidenceFloor(
  questions: ServerInterviewQuestion[],
  history: InterviewTurn[],
  options: EligibleInterviewOption[],
  minimumEvidencePerAttribute: number,
): EligibleInterviewOption[] {
  const active = activePublishedQuestion(questions, history);
  if (!active) return options;
  const required = Math.max(
    1,
    Math.trunc(minimumEvidencePerAttribute || 1),
  );
  // Secondary bindings are routing context, not independent evidence.
  const relatedQuestionIds = new Set(
    questions
      .filter((question) => question.attributeId === active.attributeId)
      .map((question) => question.id),
  );
  const mainsAsked = history.filter((turn) => turn.kind === "main").length;
  const futureQuestionMeasuresAttribute = questions
    .slice(mainsAsked)
    .some((question) => question.attributeId === active.attributeId);
  if (futureQuestionMeasuresAttribute) return options;
  const answeredPassages = history.filter(
    (turn) =>
      Boolean(turn.answer?.trim()) &&
      Boolean(turn.questionId && relatedQuestionIds.has(turn.questionId)),
  ).length;
  if (answeredPassages >= required) return options;

  const hasProbe = options.some((option) => option.action === "followup");
  if (!hasProbe) return options;
  return options.filter(
    (option) => option.action !== "next" && option.action !== "complete",
  );
}

function interviewPlanEvidenceFloorSatisfied(
  questions: ServerInterviewQuestion[],
  history: InterviewTurn[],
  minimumEvidencePerAttribute: number,
): boolean {
  const required = Math.max(
    1,
    Math.trunc(minimumEvidencePerAttribute || 1),
  );
  // Only anchored primary bindings may satisfy the published stopping rule.
  const measuredAttributes = new Set(
    questions.map((question) => question.attributeId),
  );
  if (measuredAttributes.size === 0) return false;
  const questionById = new Map(
    questions.map((question) => [question.id, question] as const),
  );
  const evidenceCounts = new Map<string, number>();
  for (const turn of history) {
    if (!turn.answer?.trim() || !turn.questionId) continue;
    if (
      turn.assessment &&
      turn.assessment.evidenceState !== "adequate"
    ) {
      continue;
    }
    const question = questionById.get(turn.questionId);
    if (!question) continue;
    evidenceCounts.set(
      question.attributeId,
      (evidenceCounts.get(question.attributeId) ?? 0) + 1,
    );
  }
  return [...measuredAttributes].every(
    (attributeId) => (evidenceCounts.get(attributeId) ?? 0) >= required,
  );
}

export function adaptiveInterviewOptions(
  questions: ServerInterviewQuestion[],
  history: InterviewTurn[],
  followUpPolicy: 0 | 1 | 2,
  minimumEvidencePerAttribute: number,
): EligibleInterviewOption[] {
  const options = enforceInterviewEvidenceFloor(
    questions,
    history,
    eligibleInterviewOptions(questions, history, followUpPolicy),
    minimumEvidencePerAttribute,
  );
  const hasUnaskedMain =
    history.filter((turn) => turn.kind === "main").length < questions.length;
  if (
    hasUnaskedMain &&
    interviewPlanEvidenceFloorSatisfied(
      questions,
      history,
      minimumEvidencePerAttribute,
    ) &&
    !options.some((option) => option.action === "complete")
  ) {
    return [
      ...options,
      {
        id: "plan:complete",
        action: "complete",
        text: null,
        reasonCode: "adequate_evidence",
      },
    ];
  }
  return options;
}

export function candidateRepairCapabilities(
  questions: ServerInterviewQuestion[],
  history: InterviewTurn[],
  followUpPolicy: 0 | 1 | 2,
): CandidateRepairCapabilities {
  const openQuestion = history.at(-1);
  if (!openQuestion || openQuestion.answer || openQuestion.resolution) {
    return {
      rephrase: false,
      alternate: false,
      repairRemaining: 0,
      blockedReason: "no_open_question",
    };
  }

  const options = eligibleInterviewOptions(
    questions,
    history,
    followUpPolicy,
  );
  const rephrase = options.some((option) => option.id === "repair:rephrase");
  const alternate = options.some((option) => option.id === "repair:alternate");
  const repairRemaining = Number(rephrase) + Number(alternate);
  return {
    rephrase,
    alternate,
    repairRemaining,
    blockedReason: repairRemaining > 0 ? null : "not_available",
  };
}

function mainStep(
  question: ServerInterviewQuestion,
  mainsAsked: number,
  totalQuestions: number,
): InterviewStepResponse {
  return {
    done: false,
    question: question.text,
    topic: question.attributeId,
    kind: "main",
    strategy: "published_main",
    questionId: question.id,
    thinkTimeSec: question.thinkTimeSec,
    answerCapSec: question.answerCapSec,
    modality: question.modality,
    reRecordAttempts: question.reRecordAttempts,
    notesAllowed: question.notesAllowed,
    progress: Math.min(0.95, mainsAsked / Math.max(1, totalQuestions)),
  };
}

export function planInterviewStep(
  providerStep: InterviewStepResponse | undefined,
  questions: ServerInterviewQuestion[],
  history: InterviewTurn[],
  followUpPolicy: 0 | 1 | 2,
  minimumEvidencePerAttribute = 1,
): InterviewStepResponse {
  if (questions.length === 0 && providerStep) return providerStep;

  const mainsAsked = history.filter((turn) => turn.kind === "main").length;
  if (mainsAsked === 0 && questions[0]) {
    return mainStep(questions[0], 0, questions.length);
  }

  const options = adaptiveInterviewOptions(
    questions,
    history,
    followUpPolicy,
    minimumEvidencePerAttribute,
  );
  const selected =
    options.find((option) => option.id === providerStep?.selectedOptionId) ??
    options.find((option) =>
      providerStep?.strategy === "clarification"
        ? option.action === "rephrase"
        : providerStep?.strategy === "situational_alternative"
          ? option.action === "alternate"
          : providerStep?.kind === "followup"
            ? option.action === "followup"
            : option.action === "next" || option.action === "complete",
    ) ??
    options.at(-1);

  if (
    selected &&
    selected.text &&
    ["rephrase", "alternate", "followup"].includes(selected.action)
  ) {
    const active = activePublishedQuestion(questions, history);
    if (active) {
      const strategy: InterviewQuestionStrategy =
        selected.action === "rephrase"
          ? "clarification"
          : selected.action === "alternate"
            ? "situational_alternative"
            : "evidence_probe";
      return {
        done: false,
        question: selected.text,
        topic: active.attributeId,
        kind: "followup",
        strategy,
        selectedOptionId: selected.id,
        questionId: active.id,
        thinkTimeSec: active.thinkTimeSec,
        answerCapSec: active.answerCapSec,
        modality: active.modality,
        reRecordAttempts: active.reRecordAttempts,
        notesAllowed: active.notesAllowed,
        progress: Math.min(0.95, mainsAsked / Math.max(1, questions.length)),
      };
    }
  }

  if (selected?.action === "complete") {
    return {
      done: true,
      progress: 1,
      closing:
        providerStep?.closing ||
        "Your structured interview is complete. A human reviewer remains responsible for the hiring decision.",
    };
  }

  const nextMain = questions[mainsAsked];
  if (nextMain) return mainStep(nextMain, mainsAsked, questions.length);

  return {
    done: true,
    progress: 1,
    closing:
      providerStep?.closing ||
      "Your structured interview is complete. A human reviewer remains responsible for the hiring decision.",
  };
}

export function attachAnswerAssessment(
  history: InterviewTurn[],
  assessment: InterviewAnswerAssessment | undefined,
): InterviewTurn[] {
  if (!assessment || history.length === 0) return history;
  return history.map((turn, index) =>
    index === history.length - 1 ? { ...turn, assessment } : turn,
  );
}
