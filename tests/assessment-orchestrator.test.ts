import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyAssessmentReviewToRuntime,
  applyEvaluationReceiptToRuntime,
  applyGateAdjudicationToRuntime,
  applyHumanDecisionToAssessmentRuntime,
  addHumanStageObservation,
  candidateAssessmentProgress,
  candidateSafeAssessmentBlockRuns,
  completeAssessmentBlock,
  evaluateKnockoutSubmission,
  initializeAssessmentRuntime,
  unlockDeferredAssessmentBlock,
} from "../lib/server/assessment-orchestrator";
import type {
  CandidateAssessmentBlock,
  CandidateAssessmentPlan,
} from "../lib/server/assessment-runtime";
import type { CandidateEvaluation, PipelineBlock } from "../lib/types";

function applicationBlock(): CandidateAssessmentBlock {
  return {
    id: "application",
    kind: "application_form",
    order: 1,
    title: "Application",
    candidateIntro: "Provide job-related information.",
    required: true,
    estimatedMinutes: 5,
    language: "en",
    accessibility: {
      extraTimeMultiplier: 1,
      captions: true,
      screenReaderMode: true,
      alternativeFormats: true,
    },
    retakePolicy: 1,
    delivery: { state: "candidate_input", availability: "ready" },
    scoring: {
      mode: "unscored",
      use: "context",
      deterministicResultAvailable: false,
      finalHumanReviewRequired: true,
      automatedEmploymentDecisionAllowed: false,
      explanationCode: "not_scored",
    },
    manifest: {
      kind: "application_form",
      fields: [],
      prefillFromCv: false,
    },
  };
}

function knockoutCandidateBlock(): CandidateAssessmentBlock {
  return {
    id: "eligibility",
    kind: "knockout",
    order: 1,
    title: "Eligibility",
    candidateIntro: "Answer job-related eligibility questions.",
    required: true,
    estimatedMinutes: 2,
    language: "en",
    accessibility: {
      extraTimeMultiplier: 1,
      captions: true,
      screenReaderMode: true,
      alternativeFormats: true,
    },
    retakePolicy: 0,
    delivery: { state: "candidate_input", availability: "ready" },
    scoring: {
      mode: "automatic_deterministic",
      use: "gate",
      deterministicResultAvailable: true,
      finalHumanReviewRequired: true,
      automatedEmploymentDecisionAllowed: false,
      explanationCode: "configured_gate_key",
    },
    manifest: {
      kind: "knockout",
      placement: "before_form",
      items: [
        {
          id: "eligibility-item",
          question: "Select every applicable requirement.",
          type: "multi_must_include",
          options: [
            { id: "required", text: "Required" },
            { id: "disqualifying", text: "Disqualifying" },
          ],
          allowAppeal: true,
        },
      ],
    },
  };
}

function publishedKnockout(immediate: boolean): PipelineBlock {
  return {
    id: "eligibility",
    kind: "knockout",
    order: 1,
    title: "Eligibility",
    candidateIntro: "Answer job-related eligibility questions.",
    required: true,
    scored: false,
    estimatedMinutes: 2,
    measures: [],
    settings: {
      kind: "knockout",
      placement: "before_form",
      items: [
        {
          id: "eligibility-item",
          question: "Select every applicable requirement.",
          type: "multi_must_include",
          options: [
            {
              id: "required",
              text: "Required",
              mustInclude: true,
            },
            {
              id: "disqualifying",
              text: "Disqualifying",
              disqualifies: true,
            },
          ],
          immediate,
          rejectionText: "A named reviewer will assess this response.",
          allowAppeal: true,
          mustHaveId: "must-have-eligibility",
        },
      ],
    },
    integrityTier: 1,
    accessibility: {
      extraTimeMultiplier: 1,
      captions: true,
      screenReaderMode: true,
      alternativeFormats: true,
    },
    retakePolicy: 0,
  };
}

function humanBlock(scored: boolean): CandidateAssessmentBlock {
  return {
    id: scored ? "scored-human" : "final-human",
    kind: "human_stage",
    order: scored ? 1 : 2,
    title: scored ? "Scored panel" : "Final human decision",
    candidateIntro: "A named reviewer records the stage.",
    required: true,
    estimatedMinutes: 30,
    language: "en",
    accessibility: {
      extraTimeMultiplier: 1,
      captions: true,
      screenReaderMode: true,
      alternativeFormats: true,
    },
    retakePolicy: 0,
    delivery: {
      state: "human_coordination_required",
      availability: "coordinated",
    },
    scoring: scored
      ? {
          mode: "human_pending",
          use: "composite",
          deterministicResultAvailable: false,
          finalHumanReviewRequired: true,
          automatedEmploymentDecisionAllowed: false,
          explanationCode: "rubric_review",
        }
      : {
          mode: "unscored",
          use: "context",
          deterministicResultAvailable: false,
          finalHumanReviewRequired: true,
          automatedEmploymentDecisionAllowed: false,
          explanationCode: "not_scored",
        },
    manifest: {
      kind: "human_stage",
      panelSize: 2,
      selfBooking: false,
      aiNotetaker: false,
    },
  };
}

function documentBlock(): CandidateAssessmentBlock {
  return {
    id: "documents",
    kind: "doc_verification",
    order: 1,
    title: "Document verification",
    candidateIntro: "A named reviewer verifies the required document.",
    required: true,
    estimatedMinutes: 5,
    language: "en",
    accessibility: {
      extraTimeMultiplier: 1,
      captions: true,
      screenReaderMode: true,
      alternativeFormats: true,
    },
    retakePolicy: 0,
    delivery: {
      state: "deferred_candidate_input",
      availability: "deferred",
    },
    scoring: {
      mode: "verification_human_pending",
      use: "context",
      deterministicResultAvailable: false,
      finalHumanReviewRequired: true,
      automatedEmploymentDecisionAllowed: false,
      explanationCode: "verification_adjudication",
    },
    manifest: {
      kind: "doc_verification",
      requiredDocuments: [{ id: "degree", label: "Degree" }],
      acceptedFormats: ["pdf"],
      mode: "manual_document_review",
      idCheck: false,
      placement: "in_flow",
    },
  };
}

function referenceBlock(): CandidateAssessmentBlock {
  return {
    id: "references",
    kind: "reference_check",
    order: 2,
    title: "Reference verification",
    candidateIntro: "A named reviewer verifies submitted references.",
    required: true,
    estimatedMinutes: 5,
    language: "en",
    accessibility: {
      extraTimeMultiplier: 1,
      captions: true,
      screenReaderMode: true,
      alternativeFormats: true,
    },
    retakePolicy: 0,
    delivery: {
      state: "candidate_then_external_participants",
      availability: "ready",
    },
    scoring: {
      mode: "verification_human_pending",
      use: "context",
      deterministicResultAvailable: false,
      finalHumanReviewRequired: true,
      automatedEmploymentDecisionAllowed: false,
      explanationCode: "verification_adjudication",
    },
    manifest: {
      kind: "reference_check",
      refereeCount: 1,
      allowedRelationships: ["manager"],
      collectionWindowDays: 7,
    },
  };
}

function aiInterviewBlock(): CandidateAssessmentBlock {
  return {
    id: "ai-interview",
    kind: "chat_interview",
    order: 1,
    title: "Structured interview",
    candidateIntro: "Answer job-related structured questions.",
    required: true,
    estimatedMinutes: 10,
    language: "en",
    accessibility: {
      extraTimeMultiplier: 1,
      captions: true,
      screenReaderMode: true,
      alternativeFormats: true,
    },
    retakePolicy: 0,
    delivery: { state: "interview_runtime", availability: "ready" },
    scoring: {
      mode: "ai_assisted_human_pending",
      use: "composite",
      deterministicResultAvailable: false,
      finalHumanReviewRequired: true,
      automatedEmploymentDecisionAllowed: false,
      explanationCode: "structured_evidence_review",
    },
    manifest: {
      kind: "chat_interview",
      questions: [],
      minAnswerWords: 20,
      maxAnswerWords: 500,
      pastePolicy: "allow",
      tone: "neutral",
    },
  };
}

function evaluationReceipt(
  blockIds: string[],
): Pick<CandidateEvaluation, "perBlock" | "engine"> {
  const engine = {
    model: "gpt-evidence",
    promptId: "multi-block-evaluator",
    promptVersion: "3",
    rubricVersion: "7",
    runs: 1,
    scoredAt: "2026-07-31T13:00:00.000Z",
    providerResponseId: "response-1",
  };
  return {
    perBlock: blockIds.map((blockId) => ({
      blockId,
      itemScores: [],
      blockScore: 0,
      confidence: "Low",
      confidenceReason:
        "The evaluator completed and abstained because evidence was thin.",
      drivers: [],
      evidence: [],
      reasoning: [],
      integrity: [],
      engine,
    })),
    engine,
  };
}

function plan(blocks: CandidateAssessmentBlock[]): CandidateAssessmentPlan {
  return {
    schemaVersion: "candidate-assessment-plan-v1",
    source: {
      vacancyId: "vac-human-stage",
      vacancyVersion: 4,
      vacancyFingerprint: "b".repeat(64),
      blueprintSchemaVersion: "evidence-assessment-blueprint-v1",
    },
    role: {
      title: "Human-stage test",
      mission: "Test governed human decisions.",
      primaryLanguage: "en",
    },
    candidateExperience: {
      aiDisclosure: "AI structures evidence only.",
      noticeVersion: 1,
      retentionDays: 30,
      tone: "neutral",
    },
    readyForCandidate: true,
    blockingReasonCodes: [],
    finalDecisionByNamedHuman: true,
    blocks,
  };
}

test("unscored final human stage records independent reviews and completes atomically", () => {
  const frozenPlan = plan([applicationBlock(), humanBlock(false)]);
  const initial = initializeAssessmentRuntime(
    frozenPlan,
    "2026-07-31T10:00:00.000Z",
  );
  const awaitingHuman = completeAssessmentBlock(
    frozenPlan,
    initial,
    {
      blockId: "application",
      completionState: "completed_unscored",
      result: {
        blockId: "application",
        kind: "application_form",
        completedAt: "2026-07-31T10:01:00.000Z",
        elapsedSec: 60,
        payload: { answers: {} },
        integrityEvents: [],
      },
    },
    "2026-07-31T10:01:00.000Z",
  );
  assert.equal(awaitingHuman.stage, "under_review");
  assert.equal(awaitingHuman.currentBlockIndex, 1);
  assert.equal(
    awaitingHuman.blockRuns[1]?.status,
    "awaiting_human_review",
  );

  const firstReview = applyHumanDecisionToAssessmentRuntime(
    frozenPlan,
    awaitingHuman,
    {
      decisionId: "decision-1",
      actorUserId: "reviewer-1",
      decision: "advance",
      at: "2026-07-31T11:00:00.000Z",
      reviewComplete: false,
    },
  );
  assert.equal(firstReview.stage, "needs_adjudication");
  assert.equal(
    firstReview.blockRuns[1]?.status,
    "awaiting_human_review",
  );
  assert.deepEqual(firstReview.blockRuns[1]?.humanReviews, [
    {
      decisionId: "decision-1",
      actorUserId: "reviewer-1",
      decision: "advance",
      at: "2026-07-31T11:00:00.000Z",
    },
  ]);
  assert.equal(
    firstReview.blockResults.some((result) => result.blockId === "final-human"),
    false,
  );
  const candidateRuns = candidateSafeAssessmentBlockRuns(firstReview.blockRuns);
  assert.equal("humanReviews" in candidateRuns[1]!, false);
  assert.equal(
    "humanReviews" in
      candidateAssessmentProgress(frozenPlan, firstReview).currentRun!,
    false,
  );
  assert.equal(JSON.stringify(candidateRuns).includes("reviewer-1"), false);

  const completed = applyHumanDecisionToAssessmentRuntime(
    frozenPlan,
    firstReview,
    {
      decisionId: "decision-2",
      actorUserId: "reviewer-2",
      decision: "advance",
      at: "2026-07-31T12:00:00.000Z",
      reviewComplete: true,
    },
  );
  assert.equal(completed.stage, "submitted");
  assert.equal(completed.currentBlockIndex, frozenPlan.blocks.length);
  assert.equal(completed.blockRuns[1]?.status, "submitted");
  assert.equal(
    completed.blockRuns[1]?.completedAt,
    "2026-07-31T12:00:00.000Z",
  );
  assert.equal(completed.blockRuns[1]?.humanReviews?.length, 2);
  assert.equal(
    completed.blockResults.some((result) => result.blockId === "final-human"),
    false,
  );
});

test("scored manual human stage remains pending and receives no synthetic completion", () => {
  const frozenPlan = plan([humanBlock(true)]);
  const state = initializeAssessmentRuntime(
    frozenPlan,
    "2026-07-31T10:00:00.000Z",
  );
  assert.equal(state.stage, "under_review");
  assert.equal(state.blockRuns[0]?.status, "awaiting_human_review");

  const unchanged = applyHumanDecisionToAssessmentRuntime(
    frozenPlan,
    state,
    {
      decisionId: "decision-scored",
      actorUserId: "reviewer-1",
      decision: "reject",
      at: "2026-07-31T11:00:00.000Z",
      reviewComplete: true,
    },
  );
  assert.equal(unchanged, state);
  assert.equal(unchanged.blockRuns[0]?.status, "awaiting_human_review");
  assert.equal(unchanged.blockRuns[0]?.completedAt, undefined);
  assert.equal(unchanged.blockRuns[0]?.humanReviews, undefined);
  assert.deepEqual(unchanged.blockResults, []);
});

test("a named human-stage observation creates evidence but never a score or completion", () => {
  const frozenPlan = plan([humanBlock(true)]);
  const initial = initializeAssessmentRuntime(
    frozenPlan,
    "2026-07-31T10:00:00.000Z",
  );
  const observed = addHumanStageObservation(frozenPlan, initial, {
    blockId: "scored-human",
    observationId: "observation-1",
    observerUserId: "reviewer-1",
    observedAt: "2026-07-31T10:30:00.000Z",
    notes:
      "Candidate described the incident constraints, their own decision, the verification step, and the observed outcome.",
  });

  assert.equal(observed.stage, "under_review");
  assert.equal(observed.blockRuns[0]?.status, "awaiting_human_review");
  assert.equal(observed.blockRuns[0]?.completedAt, undefined);
  assert.equal(observed.blockResults.length, 1);
  assert.deepEqual(
    (
      observed.blockResults[0]?.payload as {
        observations: unknown[];
      }
    ).observations,
    [
      {
        observationId: "observation-1",
        observerUserId: "reviewer-1",
        observedAt: "2026-07-31T10:30:00.000Z",
        notes:
          "Candidate described the incident constraints, their own decision, the verification step, and the observed outcome.",
      },
    ],
  );
});

test("a named HR release opens only the current deferred document stage", () => {
  const frozenPlan = plan([documentBlock()]);
  const initial = initializeAssessmentRuntime(frozenPlan);
  assert.equal(initial.stage, "under_review");
  assert.equal(initial.blockRuns[0]?.status, "awaiting_verification");

  const opened = unlockDeferredAssessmentBlock(
    frozenPlan,
    initial,
    "documents",
  );
  assert.equal(opened.stage, "in_progress");
  assert.equal(opened.blockRuns[0]?.status, "available");
  assert.throws(
    () =>
      unlockDeferredAssessmentBlock(
        frozenPlan,
        opened,
        "documents",
      ),
    /currently deferred document stage/,
  );
});

test("a trusted assessment review resolves a scored manual block without inventing evidence", () => {
  const frozenPlan = plan([humanBlock(true)]);
  const state = initializeAssessmentRuntime(
    frozenPlan,
    "2026-07-31T10:00:00.000Z",
  );

  const partial = applyAssessmentReviewToRuntime(frozenPlan, state, {
    blockId: "scored-human",
    reviewId: "assessment-review-1",
    actorUserId: "reviewer-1",
    at: "2026-07-31T11:00:00.000Z",
    reviewComplete: false,
  });
  assert.equal(partial.blockRuns[0]?.status, "awaiting_human_review");
  assert.equal(partial.currentBlockIndex, 0);
  assert.deepEqual(partial.blockRuns[0]?.assessmentReviews, [
    {
      reviewId: "assessment-review-1",
      actorUserId: "reviewer-1",
      at: "2026-07-31T11:00:00.000Z",
    },
  ]);
  assert.equal(
    "assessmentReviews" in
      candidateAssessmentProgress(frozenPlan, partial).currentRun!,
    false,
  );

  const completed = applyAssessmentReviewToRuntime(frozenPlan, partial, {
    blockId: "scored-human",
    reviewId: "assessment-review-2",
    actorUserId: "reviewer-2",
    at: "2026-07-31T12:00:00.000Z",
    reviewComplete: true,
  });
  assert.equal(completed.blockRuns[0]?.status, "submitted");
  assert.equal(
    completed.blockRuns[0]?.completedAt,
    "2026-07-31T12:00:00.000Z",
  );
  assert.equal(completed.currentBlockIndex, frozenPlan.blocks.length);
  assert.equal(completed.stage, "submitted");
  assert.deepEqual(completed.blockResults, []);

  const candidateRuns = candidateSafeAssessmentBlockRuns(completed.blockRuns);
  assert.equal("assessmentReviews" in candidateRuns[0]!, false);
  assert.equal(JSON.stringify(candidateRuns).includes("reviewer-2"), false);
});

test("a persisted evaluator receipt closes only AI-pending runs without inventing a score", () => {
  const frozenPlan = plan([aiInterviewBlock()]);
  const initial = initializeAssessmentRuntime(
    frozenPlan,
    "2026-07-31T10:00:00.000Z",
  );
  const awaitingEvaluation = completeAssessmentBlock(
    frozenPlan,
    initial,
    {
      blockId: "ai-interview",
      completionState: "awaiting_ai_assisted_human_review",
      result: {
        blockId: "ai-interview",
        kind: "chat_interview",
        completedAt: "2026-07-31T10:30:00.000Z",
        elapsedSec: 1_800,
        payload: { answers: {} },
        integrityEvents: [],
      },
    },
    "2026-07-31T10:30:00.000Z",
  );
  assert.equal(
    awaitingEvaluation.blockRuns[0]?.status,
    "awaiting_ai_review",
  );
  const receipt = evaluationReceipt(["ai-interview"]);
  const resolved = applyEvaluationReceiptToRuntime(
    frozenPlan,
    awaitingEvaluation,
    receipt,
  );
  assert.equal(resolved.blockRuns[0]?.status, "submitted");
  assert.equal(
    resolved.blockRuns[0]?.completedAt,
    receipt.engine.scoredAt,
  );
  assert.deepEqual(resolved.blockRuns[0]?.evaluationReceipts, [
    {
      model: receipt.engine.model,
      promptId: receipt.engine.promptId,
      promptVersion: receipt.engine.promptVersion,
      rubricVersion: receipt.engine.rubricVersion,
      scoredAt: receipt.engine.scoredAt,
      providerResponseId: receipt.engine.providerResponseId,
    },
  ]);
  assert.equal(resolved.blockResults.length, 1);
  assert.deepEqual(resolved.blockResults, awaitingEvaluation.blockResults);
  assert.equal(
    "evaluationReceipts" in
      candidateSafeAssessmentBlockRuns(resolved.blockRuns)[0]!,
    false,
  );
});

test("an evaluator receipt cannot close an unmatched frozen AI block", () => {
  const frozenPlan = plan([aiInterviewBlock()]);
  const initial = initializeAssessmentRuntime(frozenPlan);
  const awaitingEvaluation = completeAssessmentBlock(
    frozenPlan,
    initial,
    {
      blockId: "ai-interview",
      completionState: "awaiting_ai_assisted_human_review",
      result: {
        blockId: "ai-interview",
        kind: "chat_interview",
        completedAt: "2026-07-31T10:30:00.000Z",
        elapsedSec: 1,
        payload: { answers: {} },
        integrityEvents: [],
      },
    },
  );

  assert.throws(
    () =>
      applyEvaluationReceiptToRuntime(
        frozenPlan,
        awaitingEvaluation,
        evaluationReceipt(["another-block"]),
      ),
    /did not resolve AI review/u,
  );
  assert.equal(
    awaitingEvaluation.blockRuns[0]?.status,
    "awaiting_ai_review",
  );
});

test("trusted block review cannot bypass the final unscored disposition stage", () => {
  const frozenPlan = plan([humanBlock(false)]);
  const state = initializeAssessmentRuntime(
    frozenPlan,
    "2026-07-31T10:00:00.000Z",
  );

  assert.throws(
    () =>
      applyAssessmentReviewToRuntime(frozenPlan, state, {
        blockId: "final-human",
        reviewId: "assessment-review-wrong-path",
        actorUserId: "reviewer-1",
        at: "2026-07-31T11:00:00.000Z",
        reviewComplete: true,
      }),
    /governed disposition path/u,
  );
});

test("document and reference reviews close only their bound frozen block", () => {
  const frozenPlan = plan([documentBlock(), referenceBlock()]);
  const initial = initializeAssessmentRuntime(
    frozenPlan,
    "2026-07-31T10:00:00.000Z",
  );
  assert.equal(initial.blockRuns[0]?.status, "awaiting_verification");
  assert.equal(initial.blockRuns[1]?.status, "locked");

  const documentResolved = applyAssessmentReviewToRuntime(
    frozenPlan,
    initial,
    {
      blockId: "documents",
      reviewId: "document-review",
      actorUserId: "reviewer-documents",
      at: "2026-07-31T11:00:00.000Z",
      reviewComplete: true,
    },
  );
  assert.equal(documentResolved.blockRuns[0]?.status, "submitted");
  assert.equal(documentResolved.blockRuns[1]?.status, "available");
  assert.equal(
    documentResolved.blockRuns[1]?.assessmentReviews,
    undefined,
  );

  const referenceSubmitted = completeAssessmentBlock(
    frozenPlan,
    documentResolved,
    {
      blockId: "references",
      completionState: "awaiting_external_participants",
      result: {
        blockId: "references",
        kind: "reference_check",
        completedAt: "2026-07-31T11:30:00.000Z",
        elapsedSec: 60,
        payload: { referees: [{ relationship: "manager" }] },
        integrityEvents: [],
      },
    },
    "2026-07-31T11:30:00.000Z",
  );
  assert.equal(
    referenceSubmitted.blockRuns[1]?.status,
    "awaiting_external_participants",
  );
  const resultCount = referenceSubmitted.blockResults.length;

  const referenceResolved = applyAssessmentReviewToRuntime(
    frozenPlan,
    referenceSubmitted,
    {
      blockId: "references",
      reviewId: "reference-review",
      actorUserId: "reviewer-references",
      at: "2026-07-31T12:00:00.000Z",
      reviewComplete: true,
    },
  );
  assert.equal(referenceResolved.blockRuns[0]?.status, "submitted");
  assert.equal(referenceResolved.blockRuns[1]?.status, "submitted");
  assert.equal(
    referenceResolved.blockRuns[0]?.assessmentReviews?.length,
    1,
  );
  assert.deepEqual(referenceResolved.blockRuns[1]?.assessmentReviews, [
    {
      reviewId: "reference-review",
      actorUserId: "reviewer-references",
      at: "2026-07-31T12:00:00.000Z",
    },
  ]);
  assert.equal(referenceResolved.blockResults.length, resultCount);
});

test("multi-select knockout fails on a selected disqualifier even when must-includes are present", () => {
  const outcome = evaluateKnockoutSubmission(publishedKnockout(true), {
    answers: {
      "eligibility-item": ["required", "disqualifying"],
    },
  });

  assert.deepEqual(outcome, {
    passed: false,
    failedItemIds: ["eligibility-item"],
    mustHaveIds: ["must-have-eligibility"],
    candidateRejectionTexts: [
      "A named reviewer will assess this response.",
    ],
    requiresHumanAdjudication: true,
    haltCandidate: true,
  });
  assert.equal(
    evaluateKnockoutSubmission(publishedKnockout(true), {
      answers: { "eligibility-item": ["required"] },
    }).passed,
    true,
  );
});

test("unknown single and multi-choice knockout answers fail closed", () => {
  const multi = evaluateKnockoutSubmission(publishedKnockout(false), {
    answers: { "eligibility-item": ["required", "unknown-option"] },
  });
  assert.equal(multi.passed, false);
  assert.equal(multi.haltCandidate, false);

  const singleBlock = publishedKnockout(true);
  assert.equal(singleBlock.settings.kind, "knockout");
  if (singleBlock.settings.kind !== "knockout") {
    throw new Error("Expected a knockout fixture.");
  }
  singleBlock.settings.items[0] = {
    ...singleBlock.settings.items[0],
    type: "single_choice",
  };
  const single = evaluateKnockoutSubmission(singleBlock, {
    answers: { "eligibility-item": "unknown-option" },
  });
  assert.equal(single.passed, false);
  assert.equal(single.haltCandidate, true);
});

test("only immediate knockout failures pause runtime for named adjudication", () => {
  const nextBlock = { ...applicationBlock(), order: 2 };
  const frozenPlan = plan([knockoutCandidateBlock(), nextBlock]);
  const initial = initializeAssessmentRuntime(
    frozenPlan,
    "2026-07-31T10:00:00.000Z",
  );
  const result = {
    blockId: "eligibility",
    kind: "knockout" as const,
    completedAt: "2026-07-31T10:01:00.000Z",
    elapsedSec: 60,
    payload: {
      answers: {
        "eligibility-item": ["required", "disqualifying"],
      },
    },
    integrityEvents: [],
  };
  const immediateOutcome = evaluateKnockoutSubmission(
    publishedKnockout(true),
    result.payload,
  );
  const paused = completeAssessmentBlock(
    frozenPlan,
    initial,
    {
      blockId: "eligibility",
      completionState: "completed_deterministic_human_review",
      result,
      knockout: immediateOutcome,
    },
    result.completedAt,
  );
  assert.equal(paused.stage, "needs_adjudication");
  assert.equal(paused.currentBlockIndex, 0);
  assert.equal(paused.blockRuns[1]?.status, "locked");

  const deferredOutcome = evaluateKnockoutSubmission(
    publishedKnockout(false),
    result.payload,
  );
  const continued = completeAssessmentBlock(
    frozenPlan,
    initial,
    {
      blockId: "eligibility",
      completionState: "completed_deterministic_human_review",
      result,
      knockout: deferredOutcome,
    },
    result.completedAt,
  );
  assert.equal(deferredOutcome.requiresHumanAdjudication, true);
  assert.equal(deferredOutcome.haltCandidate, false);
  assert.equal(continued.stage, "in_progress");
  assert.equal(continued.currentBlockIndex, 1);
  assert.equal(continued.blockRuns[1]?.status, "available");
});

test("only a resolved knockout waiver resumes a paused candidate", () => {
  const frozenPlan = plan([
    knockoutCandidateBlock(),
    { ...applicationBlock(), order: 2 },
  ]);
  const initial = initializeAssessmentRuntime(
    frozenPlan,
    "2026-07-31T10:00:00.000Z",
  );
  const result = {
    blockId: "eligibility",
    kind: "knockout" as const,
    completedAt: "2026-07-31T10:01:00.000Z",
    elapsedSec: 60,
    payload: {
      answers: {
        "eligibility-item": ["required", "disqualifying"],
      },
    },
    integrityEvents: [],
  };
  const paused = completeAssessmentBlock(
    frozenPlan,
    initial,
    {
      blockId: "eligibility",
      completionState: "completed_deterministic_human_review",
      result,
      knockout: evaluateKnockoutSubmission(
        publishedKnockout(true),
        result.payload,
      ),
    },
    result.completedAt,
  );
  const pending = applyGateAdjudicationToRuntime(frozenPlan, paused, {
    blockId: "eligibility",
    reviewId: "gate-review-1",
    actorUserId: "reviewer-1",
    at: "2026-07-31T10:10:00.000Z",
    resolution: "pending",
  });
  assert.equal(pending.stage, "needs_adjudication");
  assert.equal(pending.currentBlockIndex, 0);
  assert.equal(pending.blockRuns[1]?.status, "locked");

  const upheld = applyGateAdjudicationToRuntime(frozenPlan, pending, {
    blockId: "eligibility",
    reviewId: "gate-review-2",
    actorUserId: "reviewer-2",
    at: "2026-07-31T10:11:00.000Z",
    resolution: "upheld",
  });
  assert.equal(upheld.stage, "needs_adjudication");
  assert.equal(upheld.currentBlockIndex, 0);

  const waived = applyGateAdjudicationToRuntime(frozenPlan, pending, {
    blockId: "eligibility",
    reviewId: "gate-review-waiver",
    actorUserId: "reviewer-2",
    at: "2026-07-31T10:12:00.000Z",
    resolution: "waived",
  });
  assert.equal(waived.stage, "in_progress");
  assert.equal(waived.currentBlockIndex, 1);
  assert.equal(waived.blockRuns[1]?.status, "available");
  assert.equal(waived.blockResults.length, paused.blockResults.length);
  assert.deepEqual(waived.blockRuns[0]?.gateReviews, [
    {
      reviewId: "gate-review-1",
      actorUserId: "reviewer-1",
      at: "2026-07-31T10:10:00.000Z",
    },
    {
      reviewId: "gate-review-waiver",
      actorUserId: "reviewer-2",
      at: "2026-07-31T10:12:00.000Z",
    },
  ]);
  assert.equal(
    "gateReviews" in
      candidateSafeAssessmentBlockRuns(waived.blockRuns)[0]!,
    false,
  );
});

test("a deferred knockout gate review never rewinds candidate progress", () => {
  const frozenPlan = plan([
    knockoutCandidateBlock(),
    { ...applicationBlock(), order: 2 },
  ]);
  const initial = initializeAssessmentRuntime(frozenPlan);
  const result = {
    blockId: "eligibility",
    kind: "knockout" as const,
    completedAt: "2026-07-31T10:01:00.000Z",
    elapsedSec: 60,
    payload: {
      answers: {
        "eligibility-item": ["required", "disqualifying"],
      },
    },
    integrityEvents: [],
  };
  const continued = completeAssessmentBlock(
    frozenPlan,
    initial,
    {
      blockId: "eligibility",
      completionState: "completed_deterministic_human_review",
      result,
      knockout: evaluateKnockoutSubmission(
        publishedKnockout(false),
        result.payload,
      ),
    },
    result.completedAt,
  );
  const reviewed = applyGateAdjudicationToRuntime(frozenPlan, continued, {
    blockId: "eligibility",
    reviewId: "deferred-gate-review",
    actorUserId: "reviewer-1",
    at: "2026-07-31T10:10:00.000Z",
    resolution: "upheld",
  });
  assert.equal(reviewed.stage, "in_progress");
  assert.equal(reviewed.currentBlockIndex, 1);
  assert.equal(reviewed.blockRuns[1]?.status, "available");
});

test("a decision receipt cannot be bound twice to the same human stage", () => {
  const frozenPlan = plan([humanBlock(false)]);
  const state = initializeAssessmentRuntime(
    frozenPlan,
    "2026-07-31T10:00:00.000Z",
  );
  const first = applyHumanDecisionToAssessmentRuntime(frozenPlan, state, {
    decisionId: "decision-duplicate",
    actorUserId: "reviewer-1",
    decision: "advance",
    at: "2026-07-31T11:00:00.000Z",
    reviewComplete: false,
  });

  assert.throws(
    () =>
      applyHumanDecisionToAssessmentRuntime(frozenPlan, first, {
        decisionId: "decision-duplicate",
        actorUserId: "reviewer-1",
        decision: "advance",
        at: "2026-07-31T11:01:00.000Z",
        reviewComplete: false,
      }),
    /already bound/u,
  );
});
