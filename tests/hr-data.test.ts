import assert from "node:assert/strict";
import { test } from "node:test";

import { BUILT_IN_PRESETS } from "../lib/presets";
import {
  rankingSummaryView,
  rankTenantApplications,
} from "../lib/server/hr-data";
import type { TenantApplicationSummary } from "../lib/server/repository";
import type {
  CandidateEvaluation,
  EngineStamp,
  VacancyV2,
} from "../lib/types";

const engine: EngineStamp = {
  model: "test",
  promptId: "test",
  promptVersion: "1",
  rubricVersion: "1",
  runs: 1,
  scoredAt: "2026-07-31T00:00:00.000Z",
};

test("ranking summary never serializes candidate free-text evidence", () => {
  const summary = rankingSummaryView({
    source: "repository",
    vacancy: {
      id: "vacancy-1",
      title: "Role",
      code: "WBX-TEST",
      status: "LIVE",
      version: 1,
    },
    versionCohorts: [{ version: 1, applications: 1 }],
    threshold: 70,
    totalApplications: 1,
    pendingEvaluations: 0,
    pendingApplications: [],
    ineligibleCandidates: [],
    candidates: [
      {
        applicationId: "sensitive-application-id",
        internalId: "CND-SAFE",
        rank: 1,
        overall: 90,
        tier: "Top",
        confidence: "High",
        confidencePhrase: "Candidate Alice described a sensitive event.",
        verification: "VERIFIED",
        divergence: false,
        appliedAt: "2026-07-31",
        competencies: [
          {
            id: "skill",
            name: "Skill",
            score: 90,
            weight: 100,
            drivers: [
              {
                text: "Alice named a private customer.",
                impact: 0.5,
                direction: "pos",
              },
            ],
            confidence: "High",
            confidenceReason: "Contains candidate-specific details.",
            evidence: [
              {
                quote: "My private customer was Example Person.",
                timestamp: "00:10",
                question: "Name your customer.",
              },
            ],
            trace: ["Candidate-specific reasoning."],
          },
        ],
        strengths: ["Candidate-specific strength."],
        weaknesses: ["Candidate-specific risk."],
        audit: [],
      },
    ],
  });

  const serialized = JSON.stringify(summary);
  for (const sensitive of [
    "sensitive-application-id",
    "Alice",
    "private customer",
    "Example Person",
    "Candidate-specific",
    "Name your customer",
  ]) {
    assert.equal(
      serialized.includes(sensitive),
      false,
      `ranking summary leaked ${sensitive}`,
    );
  }
  assert.equal(summary.candidates[0]?.overall, 90);
  assert.equal(summary.candidates[0]?.competencies[0]?.score, 90);
});

function rankingVacancy(): {
  vacancy: VacancyV2;
  focusAttributeId: string;
  workBlockId: string;
} {
  const preset = BUILT_IN_PRESETS.find(
    (candidate) => candidate.id === "preset-senior-backend",
  );
  assert.ok(preset);
  const vacancy = structuredClone(preset.payload) as VacancyV2;
  const focusAttribute =
    vacancy.categories
      .flatMap((category) => category.attributes)
      .find((attribute) => attribute.focus) ??
    vacancy.categories[0]?.attributes[0];
  const workBlock = vacancy.pipeline.find((block) =>
    ["work_sample", "coding", "case_exercise"].includes(block.kind),
  );
  assert.ok(focusAttribute);
  assert.ok(workBlock);
  vacancy.scoring.tieBreakers = [
    "focus_attributes",
    "work_sample",
    "earlier_submission",
  ];
  return {
    vacancy,
    focusAttributeId: focusAttribute.id,
    workBlockId: workBlock.id,
  };
}

function evaluation(
  overall: number,
  focusAttributeId: string,
  focusScore: number,
  workBlockId: string,
  workScore: number,
  complete = true,
): CandidateEvaluation {
  return {
    perBlock: [
      {
        blockId: workBlockId,
        itemScores: [
          {
            itemId: "work-item",
            itemLabel: "Work item",
            attributeId: focusAttributeId,
            level: 3,
            score: workScore,
            evidence: [],
            drivers: [],
            confidence: "High",
            confidenceReason: "Test evidence.",
            abstained: false,
          },
        ],
        blockScore: workScore,
        confidence: "High",
        confidenceReason: "Test evidence.",
        drivers: [],
        evidence: [],
        reasoning: [],
        integrity: [],
        engine,
      },
    ],
    attributeScores: [
      {
        id: focusAttributeId,
        name: "Focus",
        score: focusScore,
        weight: 100,
        drivers: [],
        confidence: "High",
        confidenceReason: "Test evidence.",
        evidence: [],
        trace: [],
        abstained: false,
      },
    ],
    categoryScores: [],
    overall,
    complete,
    coverage: complete ? 100 : 20,
    tier: overall >= 80 ? "Top" : "Mid",
    confidence: complete ? "High" : "Low",
    confidencePhrase: complete ? "Complete." : "Incomplete.",
    synthesis: {
      strengths: [],
      risks: [],
      contradictions: [],
      narrative: "Test evaluation.",
    },
    mustHaveResults: [],
    claims: [],
    engine,
  };
}

function application(
  id: string,
  createdAt: string,
  candidateEvaluation: CandidateEvaluation,
): TenantApplicationSummary {
  return {
    id,
    vacancyId: "vacancy",
    vacancyVersion: 1,
    internalCandidateId: `CND-${id}`,
    stage: "under_review",
    evaluation: candidateEvaluation,
    lockVersion: 1,
    createdAt,
    updatedAt: createdAt,
  };
}

test("ranking applies configured focus and work-sample tie breakers", () => {
  const { vacancy, focusAttributeId, workBlockId } = rankingVacancy();
  vacancy.scoring.banding = { enabled: false, sedWidth: 0 };
  const ranked = rankTenantApplications(
    [
      application(
        "A",
        "2026-07-30T00:00:00.000Z",
        evaluation(80, focusAttributeId, 60, workBlockId, 95),
      ),
      application(
        "B",
        "2026-07-31T00:00:00.000Z",
        evaluation(80, focusAttributeId, 90, workBlockId, 40),
      ),
    ],
    vacancy,
  );

  assert.deepEqual(
    ranked.map((candidate) => candidate.internalId),
    ["CND-B", "CND-A"],
  );
});

test("configured score bands use tie breakers while incomplete evaluations remain last", () => {
  const { vacancy, focusAttributeId, workBlockId } = rankingVacancy();
  vacancy.scoring.banding = { enabled: true, sedWidth: 4 };
  const ranked = rankTenantApplications(
    [
      application(
        "A",
        "2026-07-29T00:00:00.000Z",
        evaluation(90, focusAttributeId, 50, workBlockId, 90),
      ),
      application(
        "B",
        "2026-07-30T00:00:00.000Z",
        evaluation(87, focusAttributeId, 95, workBlockId, 40),
      ),
      application(
        "C",
        "2026-07-28T00:00:00.000Z",
        evaluation(99, focusAttributeId, 99, workBlockId, 99, false),
      ),
    ],
    vacancy,
  );

  assert.deepEqual(
    ranked.map((candidate) => candidate.internalId),
    ["CND-B", "CND-A", "CND-C"],
  );
  assert.deepEqual(
    ranked.slice(0, 2).map((candidate) => candidate.rank),
    [1, 2],
    "only complete evaluations receive contiguous ordinal ranks",
  );
  assert.equal(ranked[2]?.evaluationComplete, false);
  assert.equal(ranked[2]?.rank, null);
  assert.equal(ranked[2]?.tier, null);
});
