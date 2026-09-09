import type {
  BlockRuntimeResult,
  CandidateEvaluation,
  EngineStamp,
  PipelineBlock,
} from "@/lib/types";
import type {
  CandidateAssessmentBlock,
  CandidateAssessmentPlan,
  CandidateBlockCompletionState,
} from "./assessment-runtime";

export type AssessmentRunStatus =
  | "locked"
  | "available"
  | "in_progress"
  | "submitted"
  | "awaiting_ai_review"
  | "awaiting_human_review"
  | "awaiting_verification"
  | "awaiting_external_participants"
  | "skipped"
  | "blocked";

export interface AssessmentBlockRun {
  blockId: string;
  kind: CandidateAssessmentBlock["kind"];
  order: number;
  status: AssessmentRunStatus;
  attempts: number;
  startedAt?: string;
  candidateCompletedAt?: string;
  completedAt?: string;
  skipReason?: "candidate_optional" | "optional_unavailable";
  blockingReasonCode?: string;
  /**
   * Server-owned references to named HR reviews of an unscored human decision
   * stage. Full reasons remain in the governed human-decision ledger.
   */
  humanReviews?: AssessmentHumanReviewStamp[];
  /**
   * Server-owned receipts linking a resolved manual or verification block to
   * its immutable trusted-review ledger. Review content is not duplicated.
   */
  assessmentReviews?: AssessmentEvidenceReviewStamp[];
  /**
   * Server-owned proof that a persisted evaluator run processed this block.
   * Candidate responses omit provider and prompt provenance.
   */
  evaluationReceipts?: AssessmentEvaluationReceipt[];
  /**
   * Server-owned receipts for governed adjudication of a failed frozen gate.
   * The immutable review ledger owns the outcome, rationale, and evidence.
   */
  gateReviews?: AssessmentGateReviewStamp[];
  /** Server-only audit of explicitly authorized retries and their reason. */
  retakeHistory?: {
    attempt: number;
    at: string;
    reason: string;
  }[];
}

export interface AssessmentHumanReviewStamp {
  decisionId: string;
  actorUserId: string;
  decision: "advance" | "reject";
  at: string;
}

export interface AssessmentEvidenceReviewStamp {
  reviewId: string;
  actorUserId: string;
  at: string;
}

export interface AssessmentGateReviewStamp {
  reviewId: string;
  actorUserId: string;
  at: string;
}

export type AssessmentEvaluationReceipt = Pick<
  EngineStamp,
  | "model"
  | "promptId"
  | "promptVersion"
  | "rubricVersion"
  | "scoredAt"
  | "providerResponseId"
>;

export type CandidateAssessmentBlockRun = Omit<
  AssessmentBlockRun,
  | "humanReviews"
  | "assessmentReviews"
  | "evaluationReceipts"
  | "gateReviews"
  | "retakeHistory"
>;

export interface AssessmentRuntimeState {
  blockRuns: AssessmentBlockRun[];
  blockResults: BlockRuntimeResult[];
  currentBlockIndex: number;
  progress: number;
  stage:
    | "in_progress"
    | "submitted"
    | "under_review"
    | "needs_adjudication";
}

export interface KnockoutOutcome {
  passed: boolean;
  failedItemIds: string[];
  mustHaveIds: string[];
  candidateRejectionTexts: string[];
  requiresHumanAdjudication: boolean;
  haltCandidate: boolean;
}

const CANDIDATE_FINISHED_STATUSES = new Set<AssessmentRunStatus>([
  "submitted",
  "awaiting_ai_review",
  "awaiting_human_review",
  "awaiting_verification",
  "awaiting_external_participants",
  "skipped",
]);

function progressFor(runs: AssessmentBlockRun[]): number {
  if (runs.length === 0) return 1;
  const finished = runs.filter((run) =>
    CANDIDATE_FINISHED_STATUSES.has(run.status),
  ).length;
  return Math.max(0, Math.min(1, finished / runs.length));
}

function statusForCompletion(
  state: CandidateBlockCompletionState,
): AssessmentRunStatus {
  switch (state) {
    case "completed_unscored":
    case "completed_deterministic_human_review":
      return "submitted";
    case "awaiting_ai_assisted_human_review":
      return "awaiting_ai_review";
    case "awaiting_human_review":
      return "awaiting_human_review";
    case "awaiting_verification":
      return "awaiting_verification";
    case "awaiting_external_participants":
      return "awaiting_external_participants";
  }
}

function freshRuns(plan: CandidateAssessmentPlan): AssessmentBlockRun[] {
  return plan.blocks.map((block) => ({
    blockId: block.id,
    kind: block.kind,
    order: block.order,
    status: "locked",
    attempts: 0,
  }));
}

function assertStateMatchesPlan(
  plan: CandidateAssessmentPlan,
  runs: AssessmentBlockRun[],
): void {
  if (runs.length !== plan.blocks.length) {
    throw new Error("Stored assessment runs do not match the frozen plan.");
  }
  for (const [index, block] of plan.blocks.entries()) {
    const run = runs[index];
    if (
      !run ||
      run.blockId !== block.id ||
      run.kind !== block.kind ||
      run.order !== block.order
    ) {
      throw new Error(
        "Stored assessment run order does not match the frozen plan.",
      );
    }
  }
}

function openFromIndex(
  plan: CandidateAssessmentPlan,
  runs: AssessmentBlockRun[],
  startIndex: number,
  now: string,
): Pick<AssessmentRuntimeState, "currentBlockIndex" | "stage"> {
  for (let index = Math.max(0, startIndex); index < plan.blocks.length; index += 1) {
    const block = plan.blocks[index];
    const run = runs[index];

    if (CANDIDATE_FINISHED_STATUSES.has(run.status)) continue;

    if (block.delivery.availability === "blocked") {
      if (block.required || block.scoring.use !== "context") {
        run.status = "blocked";
        run.blockingReasonCode =
          block.delivery.reasonCode ?? "required_block_unavailable";
        return { currentBlockIndex: index, stage: "needs_adjudication" };
      }
      run.status = "skipped";
      run.skipReason = "optional_unavailable";
      run.completedAt = now;
      continue;
    }

    if (
      block.delivery.state === "human_coordination_required" ||
      block.delivery.state === "deferred_candidate_input"
    ) {
      if (!block.required) {
        run.status = "available";
        return { currentBlockIndex: index, stage: "in_progress" };
      }
      run.status =
        block.delivery.state === "deferred_candidate_input"
          ? "awaiting_verification"
          : "awaiting_human_review";
      run.startedAt ??= now;
      return { currentBlockIndex: index, stage: "under_review" };
    }

    run.status = "available";
    return { currentBlockIndex: index, stage: "in_progress" };
  }

  return { currentBlockIndex: plan.blocks.length, stage: "submitted" };
}

export function initializeAssessmentRuntime(
  plan: CandidateAssessmentPlan,
  now = new Date().toISOString(),
): AssessmentRuntimeState {
  if (!plan.readyForCandidate) {
    throw new Error(
      `Candidate assessment plan is not launchable: ${plan.blockingReasonCodes.join(", ") || "unknown reason"}.`,
    );
  }
  const blockRuns = freshRuns(plan);
  const open = openFromIndex(plan, blockRuns, 0, now);
  return {
    blockRuns,
    blockResults: [],
    currentBlockIndex: open.currentBlockIndex,
    progress: progressFor(blockRuns),
    stage: open.stage,
  };
}

export function beginAssessmentBlock(
  plan: CandidateAssessmentPlan,
  state: AssessmentRuntimeState,
  blockId: string,
  now = new Date().toISOString(),
): AssessmentRuntimeState {
  assertStateMatchesPlan(plan, state.blockRuns);
  const block = plan.blocks[state.currentBlockIndex];
  const run = state.blockRuns[state.currentBlockIndex];
  if (!block || !run || block.id !== blockId || run.status !== "available") {
    throw new Error("The requested assessment block is not currently open.");
  }
  if (
    block.delivery.state === "human_coordination_required" ||
    block.delivery.state === "external_provider_required" ||
    block.delivery.state === "employer_configuration_required" ||
    block.delivery.state === "deferred_candidate_input"
  ) {
    throw new Error("This block cannot be started by a candidate payload.");
  }
  const blockRuns = state.blockRuns.map((candidate, index) =>
    index === state.currentBlockIndex
      ? {
          ...candidate,
          status: "in_progress" as const,
          attempts: candidate.attempts + 1,
          startedAt: candidate.startedAt ?? now,
        }
      : { ...candidate },
  );
  return { ...state, blockRuns };
}

export function completeAssessmentBlock(
  plan: CandidateAssessmentPlan,
  state: AssessmentRuntimeState,
  input: {
    blockId: string;
    completionState: CandidateBlockCompletionState;
    result: BlockRuntimeResult;
    knockout?: KnockoutOutcome;
  },
  now = new Date().toISOString(),
): AssessmentRuntimeState {
  assertStateMatchesPlan(plan, state.blockRuns);
  const index = state.currentBlockIndex;
  const block = plan.blocks[index];
  const run = state.blockRuns[index];
  if (
    !block ||
    !run ||
    block.id !== input.blockId ||
    !["available", "in_progress"].includes(run.status)
  ) {
    throw new Error("The submitted assessment block is not currently open.");
  }
  if (
    input.result.blockId !== block.id ||
    input.result.kind !== block.kind
  ) {
    throw new Error("Assessment result does not match the frozen block.");
  }

  const blockRuns = state.blockRuns.map((candidate, runIndex) =>
    runIndex === index
      ? {
          ...candidate,
          status: statusForCompletion(input.completionState),
          attempts: Math.max(1, candidate.attempts),
          startedAt: candidate.startedAt ?? now,
          candidateCompletedAt: now,
          completedAt:
            input.completionState === "completed_unscored" ||
            input.completionState === "completed_deterministic_human_review"
              ? now
              : candidate.completedAt,
        }
      : { ...candidate },
  );
  const blockResults = [
    ...state.blockResults.filter((result) => result.blockId !== block.id),
    input.result,
  ];

  if (input.knockout?.haltCandidate) {
    return {
      blockRuns,
      blockResults,
      currentBlockIndex: index,
      progress: progressFor(blockRuns),
      // Even an exact published key cannot make the final employment
      // decision. A named reviewer must verify the evidence and reason code.
      stage: "needs_adjudication",
    };
  }

  const open = openFromIndex(plan, blockRuns, index + 1, now);
  return {
    blockRuns,
    blockResults,
    currentBlockIndex: open.currentBlockIndex,
    progress: progressFor(blockRuns),
    stage: open.stage,
  };
}

export function skipOptionalAssessmentBlock(
  plan: CandidateAssessmentPlan,
  state: AssessmentRuntimeState,
  blockId: string,
  now = new Date().toISOString(),
): AssessmentRuntimeState {
  assertStateMatchesPlan(plan, state.blockRuns);
  const index = state.currentBlockIndex;
  const block = plan.blocks[index];
  const run = state.blockRuns[index];
  if (!block || !run || block.id !== blockId || block.required) {
    throw new Error("Only the currently open optional block may be skipped.");
  }
  if (!["available", "blocked"].includes(run.status)) {
    throw new Error("This optional block cannot be skipped in its current state.");
  }
  const blockRuns = state.blockRuns.map((candidate, runIndex) =>
    runIndex === index
      ? {
          ...candidate,
          status: "skipped" as const,
          skipReason: "candidate_optional" as const,
          completedAt: now,
        }
      : { ...candidate },
  );
  const open = openFromIndex(plan, blockRuns, index + 1, now);
  return {
    ...state,
    blockRuns,
    currentBlockIndex: open.currentBlockIndex,
    progress: progressFor(blockRuns),
    stage: open.stage,
  };
}

/**
 * Opens an exact frozen post-shortlist document stage after a named HR user
 * has decided that collection is proportionate. This is an operational
 * release only; it does not verify a document or create assessment evidence.
 */
export function unlockDeferredAssessmentBlock(
  plan: CandidateAssessmentPlan,
  state: AssessmentRuntimeState,
  blockId: string,
): AssessmentRuntimeState {
  assertStateMatchesPlan(plan, state.blockRuns);
  const index = state.currentBlockIndex;
  const block = plan.blocks[index];
  const run = state.blockRuns[index];
  if (
    !block ||
    !run ||
    block.id !== blockId ||
    block.kind !== "doc_verification" ||
    block.delivery.state !== "deferred_candidate_input" ||
    run.status !== "awaiting_verification"
  ) {
    throw new Error(
      "Only the currently deferred document stage can be opened.",
    );
  }
  const blockRuns = state.blockRuns.map((candidate, runIndex) =>
    runIndex === index
      ? {
          ...candidate,
          status: "available" as const,
          blockingReasonCode: undefined,
        }
      : { ...candidate },
  );
  return {
    ...state,
    blockRuns,
    progress: progressFor(blockRuns),
    stage: "in_progress",
  };
}

/**
 * Persists a named HR observer's job-related notes as the server-owned source
 * record for a structured human stage. It deliberately does not score or
 * complete the stage; independent BARS reviews and the governed disposition
 * path remain separate.
 */
export function addHumanStageObservation(
  plan: CandidateAssessmentPlan,
  state: AssessmentRuntimeState,
  input: {
    blockId: string;
    observationId: string;
    observerUserId: string;
    observedAt: string;
    notes: string;
  },
): AssessmentRuntimeState {
  assertStateMatchesPlan(plan, state.blockRuns);
  const index = plan.blocks.findIndex((block) => block.id === input.blockId);
  const block = plan.blocks[index];
  const run = state.blockRuns[index];
  if (
    index < 0 ||
    !block ||
    !run ||
    index !== state.currentBlockIndex ||
    block.kind !== "human_stage" ||
    !["available", "awaiting_human_review"].includes(run.status)
  ) {
    throw new Error(
      "The human interview stage is not currently awaiting an observation.",
    );
  }
  const existing = state.blockResults.find(
    (result) => result.blockId === input.blockId,
  );
  const existingPayload =
    existing?.payload &&
    typeof existing.payload === "object" &&
    !Array.isArray(existing.payload)
      ? (existing.payload as Record<string, unknown>)
      : {};
  const existingObservations = Array.isArray(existingPayload.observations)
    ? existingPayload.observations.filter(
        (candidate): candidate is Record<string, unknown> =>
          Boolean(
            candidate &&
              typeof candidate === "object" &&
              !Array.isArray(candidate),
          ),
      )
    : [];
  if (
    existingObservations.some(
      (observation) => observation.observationId === input.observationId,
    )
  ) {
    throw new Error("This human-stage observation is already recorded.");
  }
  const result: BlockRuntimeResult = {
    blockId: block.id,
    kind: block.kind,
    completedAt: input.observedAt,
    elapsedSec: existing?.elapsedSec ?? 0,
    payload: {
      observations: [
        ...existingObservations,
        {
          observationId: input.observationId,
          observerUserId: input.observerUserId,
          observedAt: input.observedAt,
          notes: input.notes,
        },
      ],
    },
    integrityEvents: [],
  };
  const blockRuns = state.blockRuns.map((candidate, runIndex) =>
    runIndex === index
      ? {
          ...candidate,
          status: "awaiting_human_review" as const,
          startedAt: candidate.startedAt ?? input.observedAt,
        }
      : { ...candidate },
  );
  return {
    ...state,
    blockRuns,
    blockResults: [
      ...state.blockResults.filter(
        (candidate) => candidate.blockId !== input.blockId,
      ),
      result,
    ],
    progress: progressFor(blockRuns),
    stage: "under_review",
  };
}

/**
 * Records a named final-review action against the currently open unscored
 * human stage. It never manufactures a score or completes a scored/manual
 * evidence block. With multi-review governance the stage remains pending until
 * the required independent reviews agree.
 */
export function applyHumanDecisionToAssessmentRuntime(
  plan: CandidateAssessmentPlan,
  state: AssessmentRuntimeState,
  input: AssessmentHumanReviewStamp & { reviewComplete: boolean },
): AssessmentRuntimeState {
  assertStateMatchesPlan(plan, state.blockRuns);
  const index = state.currentBlockIndex;
  const block = plan.blocks[index];
  const run = state.blockRuns[index];
  if (
    !block ||
    !run ||
    block.kind !== "human_stage" ||
    block.scoring.mode !== "unscored" ||
    block.scoring.use !== "context"
  ) {
    return state;
  }
  if (!["available", "awaiting_human_review"].includes(run.status)) {
    throw new Error(
      "The unscored human decision stage is not currently awaiting review.",
    );
  }
  if (
    run.humanReviews?.some(
      (review) => review.decisionId === input.decisionId,
    )
  ) {
    throw new Error("The human decision is already bound to this stage.");
  }

  const humanReviews: AssessmentHumanReviewStamp[] = [
    ...(run.humanReviews ?? []),
    {
      decisionId: input.decisionId,
      actorUserId: input.actorUserId,
      decision: input.decision,
      at: input.at,
    },
  ];
  const blockRuns = state.blockRuns.map((candidate, runIndex) =>
    runIndex === index
      ? {
          ...candidate,
          status: input.reviewComplete
            ? ("submitted" as const)
            : ("awaiting_human_review" as const),
          startedAt: candidate.startedAt ?? input.at,
          completedAt: input.reviewComplete
            ? input.at
            : candidate.completedAt,
          humanReviews,
        }
      : { ...candidate },
  );
  if (!input.reviewComplete) {
    return {
      ...state,
      blockRuns,
      progress: progressFor(blockRuns),
      stage: "needs_adjudication",
    };
  }
  const open = openFromIndex(plan, blockRuns, index + 1, input.at);
  return {
    ...state,
    blockRuns,
    currentBlockIndex: open.currentBlockIndex,
    progress: progressFor(blockRuns),
    stage: open.stage,
  };
}

const REVIEW_PENDING_STATUSES = new Set<AssessmentRunStatus>([
  "awaiting_ai_review",
  "awaiting_human_review",
  "awaiting_verification",
  "awaiting_external_participants",
]);

/**
 * Links a trusted block review to its pending run. The immutable review ledger
 * owns the outcome and reasons; runtime state records only the receipt and
 * progression. No score or block result is created here.
 */
export function applyAssessmentReviewToRuntime(
  plan: CandidateAssessmentPlan,
  state: AssessmentRuntimeState,
  input: AssessmentEvidenceReviewStamp & {
    blockId: string;
    reviewComplete: boolean;
  },
): AssessmentRuntimeState {
  assertStateMatchesPlan(plan, state.blockRuns);
  const index = plan.blocks.findIndex((block) => block.id === input.blockId);
  if (index < 0) {
    throw new Error("The reviewed block is not part of the frozen assessment.");
  }
  const block = plan.blocks[index]!;
  const run = state.blockRuns[index]!;
  if (
    block.kind === "human_stage" &&
    block.scoring.mode === "unscored" &&
    block.scoring.use === "context"
  ) {
    throw new Error(
      "The final unscored human decision stage must use the governed disposition path.",
    );
  }
  if (!REVIEW_PENDING_STATUSES.has(run.status)) {
    throw new Error("The assessment block is not awaiting a trusted review.");
  }
  if (
    run.assessmentReviews?.some(
      (review) => review.reviewId === input.reviewId,
    )
  ) {
    throw new Error("The assessment review is already bound to this block.");
  }

  const assessmentReviews: AssessmentEvidenceReviewStamp[] = [
    ...(run.assessmentReviews ?? []),
    {
      reviewId: input.reviewId,
      actorUserId: input.actorUserId,
      at: input.at,
    },
  ];
  const blockRuns = state.blockRuns.map((candidate, runIndex) =>
    runIndex === index
      ? {
          ...candidate,
          status: input.reviewComplete
            ? ("submitted" as const)
            : candidate.status,
          completedAt: input.reviewComplete
            ? input.at
            : candidate.completedAt,
          assessmentReviews,
        }
      : { ...candidate },
  );

  if (!input.reviewComplete || index !== state.currentBlockIndex) {
    return {
      ...state,
      blockRuns,
      progress: progressFor(blockRuns),
    };
  }
  const open = openFromIndex(plan, blockRuns, index + 1, input.at);
  return {
    ...state,
    blockRuns,
    currentBlockIndex: open.currentBlockIndex,
    progress: progressFor(blockRuns),
    stage: open.stage,
  };
}

/**
 * Links a governed failed-gate review to the exact frozen block. Only a
 * resolved waiver may release a candidate paused at that gate; pending,
 * conflicting, and upheld decisions remain fail-closed.
 */
export function applyGateAdjudicationToRuntime(
  plan: CandidateAssessmentPlan,
  state: AssessmentRuntimeState,
  input: AssessmentGateReviewStamp & {
    blockId: string;
    resolution: "pending" | "conflict" | "waived" | "upheld";
  },
): AssessmentRuntimeState {
  assertStateMatchesPlan(plan, state.blockRuns);
  const index = plan.blocks.findIndex((block) => block.id === input.blockId);
  if (index < 0) {
    throw new Error(
      "The adjudicated gate is not part of the frozen assessment.",
    );
  }
  const run = state.blockRuns[index]!;
  if (run.status !== "submitted") {
    throw new Error(
      "The failed assessment block must be submitted before its gate can be adjudicated.",
    );
  }
  if (
    run.gateReviews?.some((review) => review.reviewId === input.reviewId)
  ) {
    throw new Error("The gate review is already bound to this block.");
  }

  const gateReviews: AssessmentGateReviewStamp[] = [
    ...(run.gateReviews ?? []),
    {
      reviewId: input.reviewId,
      actorUserId: input.actorUserId,
      at: input.at,
    },
  ];
  const blockRuns = state.blockRuns.map((candidate, runIndex) =>
    runIndex === index
      ? {
          ...candidate,
          gateReviews,
        }
      : { ...candidate },
  );

  const isPausedCurrentGate =
    index === state.currentBlockIndex &&
    state.stage === "needs_adjudication";
  if (!isPausedCurrentGate || input.resolution !== "waived") {
    return {
      ...state,
      blockRuns,
      progress: progressFor(blockRuns),
      ...(isPausedCurrentGate
        ? { stage: "needs_adjudication" as const }
        : {}),
    };
  }

  const open = openFromIndex(plan, blockRuns, index + 1, input.at);
  return {
    ...state,
    blockRuns,
    currentBlockIndex: open.currentBlockIndex,
    progress: progressFor(blockRuns),
    stage: open.stage,
  };
}

/**
 * Applies a persisted evaluator receipt to AI-pending runs. Abstention remains
 * an evaluation outcome rather than a fabricated score, so receipt completion
 * closes the AI work even when the resulting evidence stays insufficient.
 */
export function applyEvaluationReceiptToRuntime(
  plan: CandidateAssessmentPlan,
  state: AssessmentRuntimeState,
  evaluation: Pick<CandidateEvaluation, "perBlock" | "engine">,
): AssessmentRuntimeState {
  assertStateMatchesPlan(plan, state.blockRuns);
  const evaluatedBlockIds = evaluation.perBlock.map(
    (result) => result.blockId,
  );
  if (new Set(evaluatedBlockIds).size !== evaluatedBlockIds.length) {
    throw new Error("The evaluation receipt contains duplicate block results.");
  }
  const evaluated = new Set(evaluatedBlockIds);
  const pendingIndexes = state.blockRuns.flatMap((run, index) =>
    run.status === "awaiting_ai_review" ? [index] : [],
  );
  if (pendingIndexes.length === 0) return state;

  for (const index of pendingIndexes) {
    const block = plan.blocks[index]!;
    if (
      block.scoring.mode !== "ai_assisted_human_pending" ||
      !evaluated.has(block.id)
    ) {
      throw new Error(
        `The persisted evaluation did not resolve AI review for frozen block "${block.id}".`,
      );
    }
  }

  const receipt: AssessmentEvaluationReceipt = {
    model: evaluation.engine.model,
    promptId: evaluation.engine.promptId,
    promptVersion: evaluation.engine.promptVersion,
    rubricVersion: evaluation.engine.rubricVersion,
    scoredAt: evaluation.engine.scoredAt,
    ...(evaluation.engine.providerResponseId
      ? { providerResponseId: evaluation.engine.providerResponseId }
      : {}),
  };
  const pending = new Set(pendingIndexes);
  const blockRuns = state.blockRuns.map((run, index) =>
    pending.has(index)
      ? {
          ...run,
          status: "submitted" as const,
          completedAt: evaluation.engine.scoredAt,
          evaluationReceipts: [...(run.evaluationReceipts ?? []), receipt],
        }
      : { ...run },
  );
  const currentWasResolved = pending.has(state.currentBlockIndex);
  if (!currentWasResolved) {
    return {
      ...state,
      blockRuns,
      progress: progressFor(blockRuns),
    };
  }
  const open = openFromIndex(
    plan,
    blockRuns,
    state.currentBlockIndex + 1,
    evaluation.engine.scoredAt,
  );
  return {
    ...state,
    blockRuns,
    currentBlockIndex: open.currentBlockIndex,
    progress: progressFor(blockRuns),
    stage: open.stage,
  };
}

function answerMap(payload: Record<string, unknown>): Record<string, unknown> {
  const answers = payload.answers;
  return answers && typeof answers === "object" && !Array.isArray(answers)
    ? (answers as Record<string, unknown>)
    : {};
}

export function evaluateKnockoutSubmission(
  block: PipelineBlock,
  normalized: Record<string, unknown>,
): KnockoutOutcome {
  if (block.settings.kind !== "knockout") {
    throw new Error("Knockout evaluation requires a knockout block.");
  }
  const answers = answerMap(normalized);
  const failedItemIds: string[] = [];
  const mustHaveIds: string[] = [];
  const candidateRejectionTexts: string[] = [];
  let haltCandidate = false;

  for (const item of block.settings.items) {
    const answer = answers[item.id];
    let passed = true;
    if (item.type === "yes_no") {
      passed = typeof answer === "boolean" && answer === item.passValue;
    } else if (item.type === "numeric_threshold") {
      passed =
        typeof answer === "number" &&
        Number.isFinite(answer) &&
        answer >= (item.threshold ?? Number.POSITIVE_INFINITY);
    } else if (item.type === "single_choice") {
      const selectedOption =
        typeof answer === "string"
          ? item.options?.find((option) => option.id === answer)
          : undefined;
      passed = Boolean(selectedOption && !selectedOption.disqualifies);
    } else {
      const selectedValues = Array.isArray(answer) ? answer : [];
      const selected = new Set(
        selectedValues.filter(
          (value): value is string => typeof value === "string",
        ),
      );
      const options = item.options ?? [];
      const optionIds = new Set(options.map((option) => option.id));
      const validSelection =
        selectedValues.length > 0 &&
        selected.size === selectedValues.length &&
        selectedValues.every(
          (value) => typeof value === "string" && optionIds.has(value),
        );
      const includesRequired = options
        .filter((option) => option.mustInclude)
        .every((option) => selected.has(option.id));
      const selectedDisqualifier = options.some(
        (option) => option.disqualifies && selected.has(option.id),
      );
      passed =
        validSelection && includesRequired && !selectedDisqualifier;
    }
    if (!passed) {
      failedItemIds.push(item.id);
      if (item.mustHaveId) mustHaveIds.push(item.mustHaveId);
      const rejectionText = item.rejectionText.trim();
      if (
        rejectionText &&
        !candidateRejectionTexts.includes(rejectionText)
      ) {
        candidateRejectionTexts.push(rejectionText);
      }
      if (item.immediate) haltCandidate = true;
    }
  }

  return {
    passed: failedItemIds.length === 0,
    failedItemIds,
    mustHaveIds,
    candidateRejectionTexts,
    requiresHumanAdjudication: failedItemIds.length > 0,
    haltCandidate,
  };
}

export function candidateSafeAssessmentBlockRun(
  run: AssessmentBlockRun,
): CandidateAssessmentBlockRun {
  const candidateRun = { ...run };
  delete candidateRun.humanReviews;
  delete candidateRun.assessmentReviews;
  delete candidateRun.evaluationReceipts;
  delete candidateRun.gateReviews;
  delete candidateRun.retakeHistory;
  return candidateRun;
}

export function candidateSafeAssessmentBlockRuns(
  runs: AssessmentBlockRun[],
): CandidateAssessmentBlockRun[] {
  return runs.map(candidateSafeAssessmentBlockRun);
}

export function candidateAssessmentProgress(
  plan: CandidateAssessmentPlan,
  state: AssessmentRuntimeState,
): {
  currentBlock: CandidateAssessmentBlock | null;
  currentRun: CandidateAssessmentBlockRun | null;
  completed: number;
  total: number;
  progress: number;
} {
  assertStateMatchesPlan(plan, state.blockRuns);
  const currentRun = state.blockRuns[state.currentBlockIndex];
  return {
    currentBlock: plan.blocks[state.currentBlockIndex] ?? null,
    currentRun: currentRun ? candidateSafeAssessmentBlockRun(currentRun) : null,
    completed: state.blockRuns.filter((run) =>
      CANDIDATE_FINISHED_STATUSES.has(run.status),
    ).length,
    total: state.blockRuns.length,
    progress: progressFor(state.blockRuns),
  };
}
