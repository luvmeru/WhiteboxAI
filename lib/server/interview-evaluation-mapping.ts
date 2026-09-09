export interface FrozenInterviewQuestionRef {
  id: string;
}

export interface EvaluationInterviewTurn {
  kind: "main" | "followup";
  questionId?: string;
  answer?: string;
}

export interface FrozenQuestionAnswer {
  turnNumber: number;
  kind: "main" | "followup";
  answer: string;
}

export interface FrozenQuestionAnswerGroup {
  questionId: string;
  answers: FrozenQuestionAnswer[];
}

export interface FrozenInterviewEvidenceScope {
  blockId: string;
  assessmentAttempt: number;
  /**
   * This escape hatch exists only for applications created before interview
   * turns carried immutable block/attempt ownership. Callers must establish
   * that the application has exactly one interview block and one attempt.
   */
  allowSingleLegacyBlockAttempt?: boolean;
}

/**
 * Selects the immutable evidence stream owned by one frozen interview run.
 *
 * Modern evidence must carry both the exact block ID and attempt number.
 * Missing ownership tags are accepted only when the caller has positively
 * identified a single-block, first-attempt legacy application.
 */
export function selectInterviewEvidenceForFrozenRun<T>(
  turns: readonly T[],
  scope: FrozenInterviewEvidenceScope,
): T[] {
  const allowLegacy =
    scope.allowSingleLegacyBlockAttempt === true &&
    scope.assessmentAttempt === 1;

  return turns.filter((turn) => {
    const ownedTurn = turn as T & {
      blockId?: string;
      assessmentAttempt?: number;
    };
    if (ownedTurn.blockId === scope.blockId) {
      return (
        ownedTurn.assessmentAttempt === scope.assessmentAttempt ||
        (allowLegacy && ownedTurn.assessmentAttempt === undefined)
      );
    }
    return (
      allowLegacy &&
      ownedTurn.blockId === undefined &&
      ownedTurn.assessmentAttempt === undefined
    );
  });
}

/**
 * Associates interview answers only with question IDs from the frozen
 * vacancy block. Modern turns use their explicit questionId. Legacy main
 * turns without one fall back by main-question position, while legacy
 * follow-ups inherit the most recently resolved main question.
 */
export function groupInterviewAnswersByFrozenQuestion(
  questions: readonly FrozenInterviewQuestionRef[],
  turns: readonly EvaluationInterviewTurn[],
): FrozenQuestionAnswerGroup[] {
  const knownQuestionIds = new Set(questions.map((question) => question.id));
  const answersByQuestionId = new Map(
    questions.map((question) => [
      question.id,
      [] as FrozenQuestionAnswer[],
    ]),
  );
  let mainQuestionIndex = 0;
  let activeQuestionId: string | undefined;

  turns.forEach((turn, turnIndex) => {
    const hasExplicitQuestionId =
      typeof turn.questionId === "string" && turn.questionId.length > 0;
    const explicitQuestionId =
      hasExplicitQuestionId && knownQuestionIds.has(turn.questionId!)
        ? turn.questionId
        : undefined;
    let resolvedQuestionId: string | undefined;

    if (turn.kind === "main") {
      resolvedQuestionId = hasExplicitQuestionId
        ? explicitQuestionId
        : questions[mainQuestionIndex]?.id;
      activeQuestionId = resolvedQuestionId;
      mainQuestionIndex += 1;
    } else {
      resolvedQuestionId = hasExplicitQuestionId
        ? explicitQuestionId
        : activeQuestionId;
    }

    const answer = turn.answer?.trim();
    if (!resolvedQuestionId || !answer) return;
    answersByQuestionId.get(resolvedQuestionId)?.push({
      turnNumber: turnIndex + 1,
      kind: turn.kind,
      answer,
    });
  });

  return questions.map((question) => ({
    questionId: question.id,
    answers: answersByQuestionId.get(question.id) ?? [],
  }));
}
