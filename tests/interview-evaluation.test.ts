import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aggregateInterviewEvidence,
  interviewAttributeIds,
} from "../lib/server/interview-evaluation";

test("evaluation scope is limited to the selected interview block measures", () => {
  const ids = interviewAttributeIds(
    {
      measures: [
        { attributeId: "leadership", share: 60 },
        { attributeId: "decision", share: 40 },
        { attributeId: "leadership", share: 0 },
      ],
    },
    [
      {
        attributeId: "leadership",
        secondaryAttributeId: "communication",
      },
    ],
  );

  assert.deepEqual(ids, ["leadership", "decision"]);
});

test("legacy scope uses only primary question bindings when block measures are absent", () => {
  const ids = interviewAttributeIds(
    { measures: [] },
    [
      {
        attributeId: "leadership",
        secondaryAttributeId: "communication",
      },
      { attributeId: "decision" },
    ],
  );

  assert.deepEqual(ids, ["leadership", "decision"]);
});

test("abstained weight is excluded from the provisional score", () => {
  const result = aggregateInterviewEvidence(
    [
      { categoryId: "delivery", weight: 30, score: 80 },
      { categoryId: "people", weight: 20, score: 60 },
    ],
    [
      { categoryId: "delivery", weight: 30 },
      { categoryId: "delivery", weight: 30 },
      { categoryId: "people", weight: 20 },
      { categoryId: "people", weight: 20 },
    ],
  );

  assert.equal(result.overall, 72);
  assert.equal(result.coverage, 50);
  assert.deepEqual(result.categoryScores, [
    { categoryId: "delivery", score: 80 },
    { categoryId: "people", score: 60 },
  ]);
});

test("no score is synthesized when every measured attribute abstains", () => {
  const result = aggregateInterviewEvidence(
    [],
    [
      { categoryId: "delivery", weight: 50 },
      { categoryId: "people", weight: 50 },
    ],
  );

  assert.equal(result.overall, 0);
  assert.equal(result.coverage, 0);
  assert.deepEqual(result.categoryScores, []);
});
