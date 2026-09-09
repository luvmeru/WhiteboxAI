import assert from "node:assert/strict";
import { test } from "node:test";

import type { EvaluationGateResult } from "../lib/types";
import {
  assertHumanDecisionEvaluationPolicy,
  blockingAdvanceGateIds,
  HumanDecisionPolicyError,
  unadjudicatedFailedGateIds,
  unadjudicatedFailedMustHaveIds,
  upheldFailedGateIds,
} from "../lib/server/human-decision-policy";

function gate(
  status: EvaluationGateResult["status"],
  waiver: EvaluationGateResult["waiver"]["outcome"] = "none",
  blockId = "work-sample",
): EvaluationGateResult {
  return {
    blockId,
    blockTitle: "Work sample",
    topology: "compensatory",
    configured: true,
    status,
    minimumBlockScore: 70,
    actualBlockScore: status === "failed" ? 55 : 82,
    mustHaveIds: ["must-have-1"],
    failedMustHaveIds: status === "failed" ? ["must-have-1"] : [],
    pendingMustHaveIds: status === "pending" ? ["must-have-1"] : [],
    requiresAdjudication: status === "failed" || status === "pending",
    reason: "Frozen assessment gate result.",
    waiver: {
      outcome: waiver,
      reviewIds: waiver === "waived" ? ["review-1"] : [],
    },
  };
}

test("advance is blocked by every failed frozen gate without a governed waiver", () => {
  const technical = gate("failed", "upheld", "technical");
  technical.waiver.reviewIds = ["review-technical"];
  const mustHave = gate("failed", "upheld", "must-have");
  mustHave.waiver.reviewIds = ["review-must-have"];
  const evaluation = {
    complete: true,
    gateResults: [
      technical,
      mustHave,
      gate("passed", "none", "portfolio"),
    ],
  };

  assert.deepEqual(blockingAdvanceGateIds(evaluation), [
    "technical",
    "must-have",
  ]);
  assert.throws(
    () => assertHumanDecisionEvaluationPolicy("advance", evaluation),
    (error) =>
      error instanceof HumanDecisionPolicyError &&
      error.code === "FAILED_ASSESSMENT_GATE" &&
      /technical, must-have/u.test(error.message),
  );
});

test("a governed waiver permits advance while preserving the failed gate status", () => {
  const failedButWaived = gate("failed", "waived");
  const evaluation = {
    complete: true,
    gateResults: [failedButWaived],
  };

  assert.doesNotThrow(() =>
    assertHumanDecisionEvaluationPolicy("advance", evaluation),
  );
  assert.equal(failedButWaived.status, "failed");
});

test("an unadjudicated gate blocks final dispositions but not hold or rescore", () => {
  const evaluation = {
    complete: true,
    gateResults: [gate("failed", "conflict")],
  };

  assert.deepEqual(unadjudicatedFailedGateIds(evaluation), ["work-sample"]);
  assert.throws(
    () => assertHumanDecisionEvaluationPolicy("reject", evaluation),
    (error) =>
      error instanceof HumanDecisionPolicyError &&
      error.code === "GATE_ADJUDICATION_REQUIRED",
  );
  for (const decision of ["hold", "request_rescore"] as const) {
    assert.doesNotThrow(() =>
      assertHumanDecisionEvaluationPolicy(decision, evaluation),
    );
  }
});

test("either governed gate outcome permits reject after complete evidence", () => {
  for (const outcome of ["waived", "upheld"] as const) {
    const resolved = gate("failed", outcome);
    resolved.waiver.reviewIds = [`review-${outcome}`];
    assert.doesNotThrow(() =>
      assertHumanDecisionEvaluationPolicy("reject", {
        complete: true,
        gateResults: [resolved],
      }),
    );
  }
});

test("a failed knockout must-have cannot bypass disposition when no explicit block gate exists", () => {
  const evaluation = {
    complete: true,
    mustHaveResults: [
      {
        id: "work-authorization",
        passed: false,
        evidence: "Server evaluated the frozen eligibility response.",
      },
    ],
    gateResults: [gate("not_applicable", "none", "knockout")],
  };

  assert.deepEqual(unadjudicatedFailedMustHaveIds(evaluation), [
    "work-authorization",
  ]);
  for (const decision of ["advance", "reject"] as const) {
    assert.throws(
      () => assertHumanDecisionEvaluationPolicy(decision, evaluation),
      (error) =>
        error instanceof HumanDecisionPolicyError &&
        error.code === "GATE_ADJUDICATION_REQUIRED" &&
        /must-have:work-authorization/u.test(error.message),
    );
  }
});

test("a trusted implicit gate outcome adjudicates its frozen knockout must-have", () => {
  for (const outcome of ["waived", "upheld"] as const) {
    const implicitGate = gate("failed", outcome, "knockout");
    implicitGate.mustHaveIds = ["work-authorization"];
    implicitGate.failedMustHaveIds = ["work-authorization"];
    implicitGate.waiver.reviewIds = [`review-${outcome}`];
    const evaluation = {
      complete: true,
      mustHaveResults: [
        {
          id: "work-authorization",
          passed: false,
          evidence: "Server evaluated the frozen eligibility response.",
        },
      ],
      gateResults: [implicitGate],
    };
    assert.deepEqual(unadjudicatedFailedMustHaveIds(evaluation), []);
    assert.doesNotThrow(() =>
      assertHumanDecisionEvaluationPolicy("reject", evaluation),
    );
  }
});

test("incomplete evidence blocks advance and any reject without an upheld gate", () => {
  const evaluation = {
    complete: false,
    gateResults: [gate("pending")],
  };

  assert.throws(
    () => assertHumanDecisionEvaluationPolicy("advance", evaluation),
    /complete rubric evidence/u,
  );
  assert.throws(
    () => assertHumanDecisionEvaluationPolicy("reject", evaluation),
    /trusted upheld failed gate/u,
  );
});

test("trusted upheld gate consensus permits early reject but never advance", () => {
  const upheld = gate("failed", "upheld", "early-knockout");
  upheld.waiver.reviewIds = ["review-1", "review-2"];
  const evaluation = {
    complete: false,
    gateResults: [upheld, gate("pending", "none", "future-required")],
  };

  assert.deepEqual(upheldFailedGateIds(evaluation), ["early-knockout"]);
  assert.doesNotThrow(() =>
    assertHumanDecisionEvaluationPolicy("reject", evaluation),
  );
  assert.throws(
    () => assertHumanDecisionEvaluationPolicy("advance", evaluation),
    /complete rubric evidence/u,
  );
});

test("an untrusted upheld marker without review receipts cannot authorize early reject", () => {
  const untrusted = gate("failed", "upheld");
  const evaluation = {
    complete: false,
    gateResults: [untrusted],
  };

  assert.deepEqual(upheldFailedGateIds(evaluation), []);
  assert.throws(
    () => assertHumanDecisionEvaluationPolicy("reject", evaluation),
    (error) =>
      error instanceof HumanDecisionPolicyError &&
      error.code === "GATE_ADJUDICATION_REQUIRED",
  );
});

test("a new frozen-plan application cannot bypass policy while reevaluation is pending", () => {
  for (const decision of ["advance", "reject"] as const) {
    assert.throws(
      () =>
        assertHumanDecisionEvaluationPolicy(decision, undefined, {
          evaluationRequired: true,
        }),
      (error) =>
        error instanceof HumanDecisionPolicyError &&
        error.code === "EVALUATION_REQUIRED",
    );
  }
  assert.doesNotThrow(() =>
    assertHumanDecisionEvaluationPolicy("hold", undefined, {
      evaluationRequired: true,
    }),
  );
  assert.doesNotThrow(() =>
    assertHumanDecisionEvaluationPolicy("advance", undefined, {
      evaluationRequired: false,
    }),
  );
});
