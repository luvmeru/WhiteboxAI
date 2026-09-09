import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateApplication,
  evaluationToCandidate,
  scoreBlock,
} from "../lib/engine";
import { vacancyV2Demo } from "../lib/fixtures";
import type {
  ApplicationRecord,
  BlockRuntimeResult,
  PipelineBlock,
  VacancyV2,
} from "../lib/types";

function cloneVacancy(): VacancyV2 {
  return structuredClone(vacancyV2Demo);
}

function interviewBlock(vacancy: VacancyV2): PipelineBlock {
  const block = vacancy.pipeline.find(
    (candidate) => candidate.settings.kind === "async_interview",
  );
  assert.ok(block, "demo vacancy must contain an async interview");
  return block;
}

function interviewResult(
  block: PipelineBlock,
  answer: string,
  elapsedSec = 240,
): BlockRuntimeResult {
  assert.equal(block.settings.kind, "async_interview");
  return {
    blockId: block.id,
    kind: block.kind,
    completedAt: "2026-07-20T12:00:00.000Z",
    elapsedSec,
    payload: block.settings.questions.map((question) => ({
      questionId: question.id,
      answer,
    })),
    integrityEvents: [],
  };
}

function application(
  vacancy: VacancyV2,
  blockResults: BlockRuntimeResult[],
): ApplicationRecord {
  return {
    id: "app-test",
    vacancyId: vacancy.id,
    code: vacancy.code,
    source: "unit-test",
    candidate: { internalId: "CND-TEST" },
    stage: "submitted",
    consent: {
      noticeVersion: vacancy.experience.notices.version,
      at: "2026-07-20T11:00:00.000Z",
    },
    blockResults,
    currentBlockIndex: vacancy.pipeline.length,
    createdAt: "2026-07-20T11:00:00.000Z",
    submittedAt: "2026-07-20T12:00:00.000Z",
    audit: [],
  };
}

const detailedAnswer =
  "When our platform migration stalled last quarter, my task was to restore delivery while protecting reliability. " +
  "I decided to create a written decision record, led two workshops, and assigned clear owners. " +
  "I implemented weekly checkpoints in Jira and Grafana. " +
  "As a result, lead time fell by 35 percent and the team shipped 12 services without an incident.";

test("structured interview abstains on thin evidence instead of assigning a low score", () => {
  const vacancy = cloneVacancy();
  const block = interviewBlock(vacancy);
  const result = scoreBlock(
    vacancy,
    block,
    interviewResult(block, "I helped the team."),
  );

  assert.equal(result.blockId, block.id);
  assert.equal(
    result.itemScores.length,
    block.settings.kind === "async_interview"
      ? block.settings.questions.length
      : 0,
  );
  assert.ok(result.itemScores.every((item) => item.abstained));
  assert.ok(result.itemScores.every((item) => item.score === 0));
  assert.equal(result.blockScore, 0);
  assert.equal(result.confidence, "Low");
  assert.equal(result.evidence.length, 0);
  assert.match(result.confidenceReason, /human review/i);
});

test("structured interview scoring stays bounded, evidence-backed, and deterministic", () => {
  const vacancy = cloneVacancy();
  const block = interviewBlock(vacancy);
  const runtime = interviewResult(block, detailedAnswer);
  const first = scoreBlock(vacancy, block, runtime);
  const second = scoreBlock(vacancy, block, runtime);

  assert.ok(first.itemScores.every((item) => !item.abstained));
  assert.ok(
    first.itemScores.every(
      (item) => item.score >= 0 && item.score <= 100 && item.evidence.length > 0,
    ),
  );
  assert.ok(first.blockScore >= 0 && first.blockScore <= 100);
  assert.equal(first.engine.runs, 3);
  assert.equal(first.engine.promptId, "scorer.item");

  assert.deepEqual(
    first.itemScores.map(({ level, score, abstained, starAnnotation }) => ({
      level,
      score,
      abstained,
      starAnnotation,
    })),
    second.itemScores.map(({ level, score, abstained, starAnnotation }) => ({
      level,
      score,
      abstained,
      starAnnotation,
    })),
  );

  for (const item of first.itemScores) {
    assert.ok(item.starAnnotation?.situation);
    assert.ok(item.starAnnotation?.task);
    assert.ok(item.starAnnotation?.action);
    assert.ok(item.starAnnotation?.result);
    for (const evidence of item.evidence) {
      assert.equal(evidence.blockId, block.id);
      assert.ok(evidence.quote.length > 0);
      assert.ok(evidence.locator.length > 0);
    }
  }
});

test("integrity telemetry remains an advisory and never changes the score", () => {
  const vacancy = cloneVacancy();
  const block = interviewBlock(vacancy);
  const normal = scoreBlock(
    vacancy,
    block,
    interviewResult(block, detailedAnswer, 300),
  );
  const fast = scoreBlock(
    vacancy,
    block,
    interviewResult(block, detailedAnswer, 10),
  );

  assert.equal(fast.blockScore, normal.blockScore);
  const latency = fast.integrity.find((signal) => signal.kind === "latency");
  assert.ok(latency);
  assert.equal(latency.level, "low");
  assert.match(latency.note, /advisory/i);
});

test("legacy reading-pattern telemetry is discarded before scoring", () => {
  const vacancy = cloneVacancy();
  const block = interviewBlock(vacancy);
  const baselineRuntime = interviewResult(block, detailedAnswer);
  const advisoryRuntime: BlockRuntimeResult = {
    ...structuredClone(baselineRuntime),
    integrityEvents: [
      {
        id: "reading-test",
        kind: "reading_pattern",
        level: "medium",
        note:
          "Repeated samples may be consistent with consulting off-screen notes. Human review only.",
      },
    ] as unknown as BlockRuntimeResult["integrityEvents"],
  };

  const baselineBlock = scoreBlock(vacancy, block, baselineRuntime);
  const advisoryBlock = scoreBlock(vacancy, block, advisoryRuntime);
  assert.equal(advisoryBlock.blockScore, baselineBlock.blockScore);
  assert.deepEqual(
    advisoryBlock.itemScores.map(({ itemId, level, score, abstained }) => ({
      itemId,
      level,
      score,
      abstained,
    })),
    baselineBlock.itemScores.map(({ itemId, level, score, abstained }) => ({
      itemId,
      level,
      score,
      abstained,
    })),
  );
  assert.deepEqual(advisoryBlock.drivers, baselineBlock.drivers);
  assert.deepEqual(advisoryBlock.evidence, baselineBlock.evidence);
  assert.deepEqual(advisoryBlock.integrity, []);

  const baselineEvaluation = evaluateApplication(
    vacancy,
    application(vacancy, [baselineRuntime]),
  );
  const advisoryEvaluation = evaluateApplication(
    vacancy,
    application(vacancy, [advisoryRuntime]),
  );
  assert.equal(advisoryEvaluation.overall, baselineEvaluation.overall);
  assert.equal(advisoryEvaluation.tier, baselineEvaluation.tier);
  assert.deepEqual(
    advisoryEvaluation.attributeScores.map(({ id, score, confidence }) => ({
      id,
      score,
      confidence,
    })),
    baselineEvaluation.attributeScores.map(({ id, score, confidence }) => ({
      id,
      score,
      confidence,
    })),
  );
  assert.deepEqual(advisoryEvaluation.perBlock[0]?.integrity, []);
});

test("application rollup normalizes weights and emits sequential evidence ids", () => {
  const vacancy = cloneVacancy();
  const block = interviewBlock(vacancy);
  const runtime = interviewResult(block, detailedAnswer);
  const first = evaluateApplication(vacancy, application(vacancy, [runtime]));
  const second = evaluateApplication(vacancy, application(vacancy, [runtime]));

  assert.equal(first.perBlock.length, 1);
  assert.equal(first.attributeScores.length, 5);
  assert.equal(
    first.attributeScores.reduce((sum, attribute) => sum + attribute.weight, 0),
    100,
  );
  assert.ok(first.overall >= 0 && first.overall <= 100);
  assert.deepEqual(
    first.attributeScores.map(({ id, score, weight }) => ({ id, score, weight })),
    second.attributeScores.map(({ id, score, weight }) => ({ id, score, weight })),
  );
  assert.equal(first.overall, second.overall);
  assert.equal(first.tier, second.tier);

  const evidenceIds = first.perBlock.flatMap((result) =>
    result.itemScores.flatMap((item) =>
      item.evidence.map((evidence) => evidence.id),
    ),
  );
  assert.deepEqual(
    evidenceIds,
    evidenceIds.map((_, index) => `E-${index + 1}`),
  );
  assert.match(first.synthesis.narrative, /human reviewer/i);
});

test("a failed hurdle forces Bottom tier even when the composite clears the threshold", () => {
  const vacancy = cloneVacancy();
  const block = interviewBlock(vacancy);
  block.gate = { minBlockScore: 100 };

  const evaluation = evaluateApplication(
    vacancy,
    application(vacancy, [interviewResult(block, detailedAnswer)]),
  );

  assert.ok(evaluation.overall >= vacancy.scoring.threshold);
  assert.equal(evaluation.tier, "Bottom");
  assert.ok(
    evaluation.synthesis.risks.some((risk) => /hurdle/i.test(risk)),
  );
});

test("informational blocks never enter the composite score", () => {
  const vacancy = cloneVacancy();
  const block = vacancy.pipeline.find(
    (candidate) => candidate.settings.kind === "cv_intake",
  );
  assert.ok(block);

  const runtime: BlockRuntimeResult = {
    blockId: block.id,
    kind: block.kind,
    completedAt: "2026-07-20T12:00:00.000Z",
    elapsedSec: 30,
    payload: { fileName: "candidate.pdf" },
    integrityEvents: [],
  };
  const scored = scoreBlock(vacancy, block, runtime);
  const evaluation = evaluateApplication(
    vacancy,
    application(vacancy, [runtime]),
  );

  assert.equal(scored.blockScore, 0);
  assert.equal(scored.itemScores.length, 0);
  assert.equal(evaluation.overall, 0);
  assert.equal(evaluation.attributeScores.length, 0);
  assert.equal(evaluation.confidence, "Low");
});

test("legacy candidate adapter preserves the evaluation and masks absent verification", () => {
  const vacancy = cloneVacancy();
  const block = interviewBlock(vacancy);
  const app = application(vacancy, [
    interviewResult(block, detailedAnswer),
  ]);
  const evaluation = evaluateApplication(vacancy, app);
  const candidate = evaluationToCandidate(app, evaluation, 3);

  assert.equal(candidate.internalId, "CND-TEST");
  assert.equal(candidate.rank, 3);
  assert.equal(candidate.overall, evaluation.overall);
  assert.equal(candidate.tier, evaluation.tier);
  assert.equal(candidate.verification, "—");
  assert.equal(candidate.appliedAt, "2026-07-20");
});
