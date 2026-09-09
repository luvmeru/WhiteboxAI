import assert from "node:assert/strict";
import { test } from "node:test";

import { zodTextFormat } from "openai/helpers/zod";
import {
  applicationEvidenceEvaluationSchema,
  candidateEvaluationSchema,
  interviewRoutingSchema,
} from "../lib/server/ai-schemas";

test("OpenAI structured-output helpers accept the router and evaluator schemas", () => {
  assert.doesNotThrow(() =>
    zodTextFormat(interviewRoutingSchema, "interview_router_test"),
  );
  assert.doesNotThrow(() =>
    zodTextFormat(candidateEvaluationSchema, "candidate_evaluation_test"),
  );
  assert.doesNotThrow(() =>
    zodTextFormat(
      applicationEvidenceEvaluationSchema,
      "application_evidence_evaluation_test",
    ),
  );
});

test("multi-block evaluation contract keeps scored and abstained items explicit", () => {
  const parsed = applicationEvidenceEvaluationSchema.parse({
    schemaVersion: "application-evidence-evaluation-v1",
    items: [
      {
        evaluationItemId: "block:item::attribute",
        blockId: "block",
        sourceItemId: "item",
        attributeId: "attribute",
        disposition: "abstained",
        level: null,
        confidence: "Low",
        evidence: [],
        abstainReason: "insufficient",
        rationale:
          "The submitted passage does not distinguish adjacent published anchors.",
      },
    ],
  });

  assert.equal(parsed.items[0]?.level, null);
  assert.equal(parsed.items[0]?.disposition, "abstained");
});

test("the router contract requires nullable fields instead of optional fields", () => {
  const valid = interviewRoutingSchema.safeParse({
    schemaVersion: "interview-routing-v2",
    action: "next",
    currentQuestionId: null,
    selectedOptionId: "plan:next",
    evidenceState: "adequate",
    reasonCode: "adequate_evidence",
    missingElements: [],
  });
  assert.equal(valid.success, true);

  const missingNullableField = interviewRoutingSchema.safeParse({
    schemaVersion: "interview-routing-v2",
    action: "next",
    selectedOptionId: "plan:next",
    evidenceState: "adequate",
    reasonCode: "adequate_evidence",
    missingElements: [],
  });
  assert.equal(missingNullableField.success, false);
});

test("the evaluation contract distinguishes an abstention from a low level", () => {
  const parsed = candidateEvaluationSchema.parse({
    schemaVersion: "candidate-evaluation-v2",
    attributes: [
      {
        attributeId: "attribute-1",
        disposition: "abstained",
        level: null,
        confidence: "Low",
        evidence: [],
        abstainReason: "insufficient",
        rationale:
          "There is not enough job-related evidence to distinguish adjacent anchors.",
      },
    ],
  });

  assert.equal(parsed.attributes[0]?.level, null);
  assert.equal(parsed.attributes[0]?.disposition, "abstained");
});
