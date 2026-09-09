import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCandidateJourneySteps,
  candidateAssessmentPercent,
  candidateContinuation,
  candidateControlledMinutes,
  candidateInterviewMayStartAttempt,
  candidateJourneyPlan,
  candidateOpenedAssessmentBlock,
  type CandidateAssessmentSnapshot,
} from "../lib/candidate-assessment-view";
import type { AssessmentBlockRun } from "../lib/server/assessment-orchestrator";
import type {
  CandidateAssessmentBlock,
  CandidateAssessmentPlan,
} from "../lib/server/assessment-runtime";

test("interview attempt start waits for the selected delivery surface", () => {
  assert.equal(candidateInterviewMayStartAttempt(null, false), false);
  assert.equal(candidateInterviewMayStartAttempt(false, false), false);
  assert.equal(candidateInterviewMayStartAttempt(false, true), true);
  assert.equal(candidateInterviewMayStartAttempt(true, false), true);
});

function block(
  id: string,
  order: number,
  options: {
    kind?:
      | "application_form"
      | "live_ai_interview"
      | "chat_interview"
      | "job_knowledge";
    required?: boolean;
    deliveryState?:
      | "candidate_input"
      | "interview_runtime"
      | "human_coordination_required";
    availability?: "ready" | "coordinated";
  } = {},
): CandidateAssessmentBlock {
  const kind = options.kind ?? "application_form";
  const common = {
    id,
    kind,
    order,
    title: `Stage ${order}`,
    candidateIntro: "Candidate-visible purpose.",
    required: options.required ?? true,
    estimatedMinutes: 10,
    language: "en",
    accessibility: {
      extraTimeMultiplier: 1 as const,
      captions: true,
      screenReaderMode: true,
      alternativeFormats: true,
    },
    retakePolicy: 1 as const,
    delivery: {
      state:
        options.deliveryState ??
        (kind === "application_form"
          ? ("candidate_input" as const)
          : ("interview_runtime" as const)),
      availability: options.availability ?? ("ready" as const),
    },
    scoring: {
      mode: "human_pending" as const,
      use: "composite" as const,
      deterministicResultAvailable: false,
      finalHumanReviewRequired: true as const,
      automatedEmploymentDecisionAllowed: false as const,
      explanationCode: "structured_evidence_review" as const,
    },
  };
  if (kind === "live_ai_interview") {
    return {
      ...common,
      kind,
      manifest: {
        kind,
        durationCapMin: 20,
        persona: {
          name: "Interviewer",
          voice: "neutral",
          disclosedAsAi: true,
        },
        questions: [],
        adaptivity: "probe_only",
        latencyFallback: "chat",
        bargeInAllowed: false,
      },
    };
  }
  if (kind === "chat_interview") {
    return {
      ...common,
      kind,
      manifest: {
        kind,
        questions: [],
        minAnswerWords: 1,
        maxAnswerWords: 200,
        pastePolicy: "allow",
        tone: "neutral",
      },
    };
  }
  if (kind === "job_knowledge") {
    return {
      ...common,
      kind,
      delivery: {
        state: "candidate_input",
        availability: "ready",
      },
      manifest: {
        kind,
        items: [
          {
            id: "timed-current-item",
            type: "mcq_single",
            prompt: "CURRENT_TIMED_PROMPT_MUST_NOT_APPEAR_BEFORE_START",
            options: [
              {
                id: "timed-current-option",
                text: "CURRENT_TIMED_OPTION_MUST_NOT_APPEAR_BEFORE_START",
              },
            ],
          },
        ],
        timing: "total",
        totalTimeMin: 10,
        openBook: false,
      },
    };
  }
  return {
    ...common,
    kind,
    manifest: {
      kind,
      fields: [],
      prefillFromCv: false,
    },
  };
}

function plan(blocks: CandidateAssessmentBlock[]): CandidateAssessmentPlan {
  return {
    schemaVersion: "candidate-assessment-plan-v1",
    source: {
      vacancyId: "vac-view",
      vacancyVersion: 3,
      vacancyFingerprint: "a".repeat(64),
      blueprintSchemaVersion: "evidence-assessment-blueprint-v1",
    },
    role: {
      title: "Test role",
      mission: "Test candidate journey.",
      primaryLanguage: "en",
    },
    candidateExperience: {
      aiDisclosure: "AI disclosure.",
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

function run(
  candidate: CandidateAssessmentBlock,
  status: AssessmentBlockRun["status"],
  skipReason?: AssessmentBlockRun["skipReason"],
): AssessmentBlockRun {
  return {
    blockId: candidate.id,
    kind: candidate.kind,
    order: candidate.order,
    status,
    attempts: 0,
    ...(skipReason ? { skipReason } : {}),
  };
}

function snapshot(
  blocks: CandidateAssessmentBlock[],
  statuses: AssessmentBlockRun["status"][],
  currentBlockIndex: number,
): CandidateAssessmentSnapshot {
  const frozenPlan = plan(blocks);
  const blockRuns = blocks.map((candidate, index) =>
    run(candidate, statuses[index] ?? "locked"),
  );
  return {
    plan: frozenPlan,
    blockRuns,
    currentBlockIndex,
    currentBlock: blocks[currentBlockIndex] ?? null,
    currentRun: blockRuns[currentBlockIndex] ?? null,
    completed: blockRuns.filter((candidate) =>
      [
        "submitted",
        "awaiting_ai_review",
        "awaiting_human_review",
        "awaiting_verification",
        "awaiting_external_participants",
        "skipped",
      ].includes(candidate.status),
    ).length,
    total: blockRuns.length,
  };
}

test("journey DTO hides future manifests and releases only the exact current non-interview task", () => {
  const timedCurrent = block("timed-current", 1, {
    kind: "job_knowledge",
  });
  const interview = block("future-interview", 2, {
    kind: "live_ai_interview",
  });
  assert.equal(interview.manifest.kind, "live_ai_interview");
  if (interview.manifest.kind !== "live_ai_interview") {
    throw new Error("Expected a live interview manifest.");
  }
  interview.manifest.questions.push({
    id: "future-question",
    text: "FUTURE_QUESTION_MUST_NOT_APPEAR_IN_JOURNEY",
    type: "behavioral",
    thinkTimeSec: 30,
    answerCapSec: 180,
    modality: "video",
    reRecordAttempts: 1,
    notesAllowed: true,
    clarificationAvailable: true,
    situationalFallbackAvailable: true,
  });
  const frozenPlan = plan([timedCurrent, interview]);

  const journey = candidateJourneyPlan(frozenPlan);
  assert.equal("manifest" in journey.blocks[0]!, false);
  assert.equal("manifest" in journey.blocks[1]!, false);
  const availablePayload = {
    plan: journey,
    currentBlock: candidateOpenedAssessmentBlock({
      plan: frozenPlan,
      currentBlockIndex: 0,
      currentRunStatus: "available",
      consentAt: "2026-07-31T12:00:00.000Z",
    }),
  };
  assert.doesNotMatch(
    JSON.stringify(availablePayload),
    /CURRENT_TIMED_PROMPT_MUST_NOT_APPEAR_BEFORE_START|CURRENT_TIMED_OPTION_MUST_NOT_APPEAR_BEFORE_START|FUTURE_QUESTION_MUST_NOT_APPEAR_IN_JOURNEY/u,
  );
  assert.equal(availablePayload.currentBlock, null);

  const opened = candidateOpenedAssessmentBlock({
    plan: frozenPlan,
    currentBlockIndex: 0,
    currentRunStatus: "in_progress",
    consentAt: "2026-07-31T12:00:00.000Z",
  });
  assert.equal(opened?.manifest.kind, "job_knowledge");
  if (opened?.manifest.kind !== "job_knowledge") {
    throw new Error("Expected the opened exact timed manifest.");
  }
  assert.equal(
    opened.manifest.items[0]?.prompt,
    "CURRENT_TIMED_PROMPT_MUST_NOT_APPEAR_BEFORE_START",
  );
  assert.equal(
    opened.manifest.items[0]?.options?.[0]?.text,
    "CURRENT_TIMED_OPTION_MUST_NOT_APPEAR_BEFORE_START",
  );
  const startedPayload = { plan: journey, currentBlock: opened };
  assert.match(
    JSON.stringify(startedPayload),
    /CURRENT_TIMED_PROMPT_MUST_NOT_APPEAR_BEFORE_START/u,
  );
  assert.doesNotMatch(
    JSON.stringify(startedPayload),
    /FUTURE_QUESTION_MUST_NOT_APPEAR_IN_JOURNEY/u,
  );
  assert.equal(
    candidateOpenedAssessmentBlock({
      plan: frozenPlan,
      currentBlockIndex: 0,
      currentRunStatus: "in_progress",
      consentAt: null,
    }),
    null,
  );

  const openedInterview = candidateOpenedAssessmentBlock({
    plan: plan([interview]),
    currentBlockIndex: 0,
    currentRunStatus: "in_progress",
    consentAt: "2026-07-31T12:00:00.000Z",
  });
  assert.equal(openedInterview?.manifest.kind, "live_ai_interview");
  if (openedInterview?.manifest.kind !== "live_ai_interview") {
    throw new Error("Expected the opened interview manifest.");
  }
  assert.deepEqual(openedInterview.manifest.questions, []);
  assert.doesNotMatch(
    JSON.stringify(openedInterview),
    /FUTURE_QUESTION_MUST_NOT_APPEAR_IN_JOURNEY/u,
  );
});

test("journey steps use frozen block runs instead of fixed candidate labels", () => {
  const blocks = [
    block("form", 1),
    block("interview", 2, { kind: "live_ai_interview" }),
    block("optional", 3, { required: false }),
  ];
  const assessment = snapshot(
    blocks,
    ["submitted", "in_progress", "skipped"],
    1,
  );
  assessment.blockRuns[2]!.skipReason = "optional_unavailable";

  const steps = buildCandidateJourneySteps(assessment);
  assert.deepEqual(
    steps.map((step) => [step.id, step.state, step.stateLabel]),
    [
      ["form", "submitted", "Submitted"],
      ["interview", "current", "In progress"],
      ["optional", "skipped", "Not offered · skipped automatically"],
    ],
  );
  assert.equal(candidateAssessmentPercent(assessment), 67);
});

test("continuation routes to consent, assessment inputs, and device check correctly", () => {
  const application = block("form", 1);
  const interview = block("interview", 1, {
    kind: "live_ai_interview",
  });
  const chat = block("chat", 1, { kind: "chat_interview" });

  const consent = candidateContinuation({
    applicationId: "app-1",
    code: "WBX-TEST",
    stage: "in_progress",
    consentAt: null,
    assessment: snapshot([application], ["available"], 0),
  });
  assert.equal(consent?.kind, "assessment");
  assert.match(consent?.href ?? "", /^\/assessment\?/u);

  const formAssessment = snapshot([application], ["available"], 0);
  formAssessment.currentBlock = null;
  const form = candidateContinuation({
    applicationId: "app-1",
    code: "WBX-TEST",
    stage: "in_progress",
    consentAt: "2026-07-31T00:00:00.000Z",
    assessment: formAssessment,
  });
  assert.equal(form?.kind, "assessment");

  const videoAssessment = snapshot([interview], ["available"], 0);
  videoAssessment.currentBlock = null;
  const video = candidateContinuation({
    applicationId: "app-1",
    code: "WBX-TEST",
    stage: "in_progress",
    consentAt: "2026-07-31T00:00:00.000Z",
    assessment: videoAssessment,
  });
  assert.equal(video?.kind, "interview");
  assert.match(video?.href ?? "", /^\/interview\/check\?/u);

  const text = candidateContinuation({
    applicationId: "app-1",
    code: "WBX-TEST",
    stage: "in_progress",
    consentAt: "2026-07-31T00:00:00.000Z",
    assessment: snapshot([chat], ["available"], 0),
  });
  assert.equal(text?.kind, "assessment");

  const review = candidateContinuation({
    applicationId: "app-1",
    code: "WBX-TEST",
    stage: "under_review",
    consentAt: "2026-07-31T00:00:00.000Z",
    assessment: snapshot([interview], ["awaiting_human_review"], 0),
  });
  assert.equal(review, null);
});

test("candidate effort excludes optional and employer-coordinated time", () => {
  const candidateInput = block("form", 1);
  const optional = block("optional", 2, { required: false });
  const coordinated = block("human", 3, {
    deliveryState: "human_coordination_required",
    availability: "coordinated",
  });
  assert.equal(
    candidateControlledMinutes(plan([candidateInput, optional, coordinated])),
    10,
  );
});
