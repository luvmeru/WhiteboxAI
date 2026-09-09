import assert from "node:assert/strict";
import { test } from "node:test";

import {
  candidateBlockControls,
  candidateBlockHardTimeLimitSec,
  specializeCandidatePlanForApplication,
  startCandidateBlockRun,
} from "../lib/server/assessment-controls";
import type { AssessmentBlockRun } from "../lib/server/assessment-orchestrator";
import type {
  CandidateAssessmentBlock,
  CandidateAssessmentPlan,
} from "../lib/server/assessment-runtime";

const accessibility = {
  extraTimeMultiplier: 1.5 as const,
  captions: true,
  screenReaderMode: true,
  alternativeFormats: true,
};

function codingBlock(): CandidateAssessmentBlock {
  return {
    id: "coding",
    kind: "coding",
    order: 1,
    title: "Timed coding",
    candidateIntro: "Complete a job-related task.",
    required: true,
    estimatedMinutes: 60,
    language: "en",
    accessibility,
    retakePolicy: 1,
    deadlineOffsetHours: 48,
    delivery: { state: "candidate_input", availability: "ready" },
    scoring: {
      mode: "human_pending",
      use: "composite",
      deterministicResultAvailable: false,
      finalHumanReviewRequired: true,
      automatedEmploymentDecisionAllowed: false,
      explanationCode: "rubric_review",
    },
    manifest: {
      kind: "coding",
      environment: "browser_ide",
      languages: ["TypeScript"],
      brief: "Implement the published task.",
      timeCapMin: 60,
      aiPolicy: "disclosed",
      dimensions: [{ id: "quality", name: "Quality" }],
    },
  };
}

function run(
  status: AssessmentBlockRun["status"] = "available",
  attempts = 0,
  startedAt?: string,
): AssessmentBlockRun {
  return {
    blockId: "coding",
    kind: "coding",
    order: 1,
    status,
    attempts,
    ...(startedAt ? { startedAt } : {}),
  };
}

test("hard timers apply the published accessibility multiplier and server timestamps", () => {
  const block = codingBlock();
  assert.equal(candidateBlockHardTimeLimitSec(block), 90 * 60);

  const controls = candidateBlockControls(
    block,
    run("in_progress", 1, "2026-07-31T10:00:00.000Z"),
    "2026-07-30T10:00:00.000Z",
    "2026-07-31T11:29:30.000Z",
  );
  assert.equal(controls.remainingSec, 30);
  assert.equal(controls.expiredReason, undefined);
  assert.equal(controls.timerExpiresAt, "2026-07-31T11:30:00.000Z");

  const expired = candidateBlockControls(
    block,
    run("in_progress", 1, "2026-07-31T10:00:00.000Z"),
    "2026-07-28T10:00:00.000Z",
    "2026-07-31T11:31:00.000Z",
  );
  assert.equal(expired.expiredReason, "deadline_expired");
});

test("whole-stage retakes are counted and cannot exceed the frozen policy", () => {
  const block = codingBlock();
  const first = startCandidateBlockRun(block, run(), {
    restart: false,
    at: "2026-07-31T10:00:00.000Z",
  });
  assert.equal(first.attempts, 1);
  const second = startCandidateBlockRun(block, first, {
    restart: true,
    at: "2026-07-31T10:10:00.000Z",
  });
  assert.equal(second.attempts, 2);
  assert.throws(
    () =>
      startCandidateBlockRun(block, second, {
        restart: true,
        at: "2026-07-31T10:20:00.000Z",
      }),
    /attempt limit/u,
  );
});

function sjtPlan(): CandidateAssessmentPlan {
  const items = Array.from({ length: 8 }, (_, index) => ({
    id: `item-${index + 1}`,
    scenario: `Scenario ${index + 1}`,
    mediaKind: "text" as const,
    options: [
      { id: `item-${index + 1}-a`, text: "A" },
      { id: `item-${index + 1}-b`, text: "B" },
    ],
  }));
  return {
    schemaVersion: "candidate-assessment-plan-v1",
    source: {
      vacancyId: "vac-sjt",
      vacancyVersion: 7,
      vacancyFingerprint: "f".repeat(64),
      blueprintSchemaVersion: "evidence-assessment-blueprint-v1",
    },
    role: {
      title: "SJT role",
      mission: "Test job judgment.",
      primaryLanguage: "en",
    },
    candidateExperience: {
      aiDisclosure: "No AI scoring without human review.",
      noticeVersion: 1,
      retentionDays: 30,
      tone: "neutral",
    },
    readyForCandidate: true,
    blockingReasonCodes: [],
    finalDecisionByNamedHuman: true,
    blocks: [
      {
        id: "sjt",
        kind: "sjt",
        order: 1,
        title: "SJT",
        candidateIntro: "Choose job-related responses.",
        required: true,
        estimatedMinutes: 10,
        language: "en",
        accessibility: { ...accessibility, extraTimeMultiplier: 1 },
        retakePolicy: 0,
        delivery: { state: "candidate_input", availability: "ready" },
        scoring: {
          mode: "automatic_deterministic",
          use: "composite",
          deterministicResultAvailable: true,
          finalHumanReviewRequired: true,
          automatedEmploymentDecisionAllowed: false,
          explanationCode: "configured_answer_key",
        },
        manifest: {
          kind: "sjt",
          instruction: "knowledge",
          format: "pick_best",
          items,
          timing: "untimed",
          randomizeOrder: true,
          pilotMode: false,
        },
      },
    ],
  };
}

test("SJT order is deterministic per application without changing frozen IDs", () => {
  const plan = sjtPlan();
  const first = specializeCandidatePlanForApplication(plan, "app-alpha");
  const repeat = specializeCandidatePlanForApplication(plan, "app-alpha");
  const second = specializeCandidatePlanForApplication(plan, "app-beta");
  const ids = (candidate: CandidateAssessmentPlan) => {
    const manifest = candidate.blocks[0]!.manifest;
    assert.equal(manifest.kind, "sjt");
    return manifest.kind === "sjt"
      ? manifest.items.map((item) => item.id)
      : [];
  };

  assert.deepEqual(ids(first), ids(repeat));
  assert.notDeepEqual(ids(first), ids(second));
  assert.deepEqual([...ids(first)].sort(), [...ids(plan)].sort());
  assert.equal(first.source.vacancyFingerprint, plan.source.vacancyFingerprint);
});

