import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assessmentReviewBindingMatchesScope,
  ASSESSMENT_REVIEW_SCHEMA_VERSION,
  resolveAssessmentReviewWrite,
  resolveAssessmentReview,
  type AssessmentReviewBinding,
  type AssessmentReviewRecord,
} from "../lib/server/assessment-review";
import {
  assessmentReviewTargetViews,
  resolveAssessmentReviewEvidenceReceipt,
  type AssessmentReviewTarget,
} from "../lib/server/application-evaluation";

function binding(
  patch: Partial<AssessmentReviewBinding> = {},
): AssessmentReviewBinding {
  return {
    organizationId: "org-1",
    applicationId: "application-1",
    vacancyId: "vacancy-1",
    vacancyVersion: 7,
    blockId: "manual-panel",
    sourceItemId: "criterion-1",
    attributeId: "attribute-1",
    kind: "manual_bars",
    rubricHash: "rubric-v7",
    ...patch,
  };
}

function review(
  id: string,
  target: AssessmentReviewBinding,
  patch: Partial<AssessmentReviewRecord> = {},
): AssessmentReviewRecord {
  return {
    ...target,
    schemaVersion: ASSESSMENT_REVIEW_SCHEMA_VERSION,
    id,
    idempotencyKeyHash: `idempotency-${id}`,
    inputHash: `input-${id}`,
    level: target.kind === "manual_bars" ? 3 : null,
    verificationOutcome:
      target.kind === "verification" ? "verified" : null,
    gateWaiverOutcome: target.kind === "gate_waiver" ? "upheld" : null,
    evidence: {
      summary: "Verified job-related evidence.",
      locator: `frozen:${target.blockId}:${target.sourceItemId}`,
      source:
        target.kind === "gate_waiver"
          ? "frozen_gate"
          : "submitted_artifact",
      observedBy: "named_reviewer",
    },
    rationale: "Evidence-based named review.",
    reviewerUserId: `reviewer-${id}`,
    reviewerEmail: `${id}@example.test`,
    reviewerRole: "HiringManager",
    supersedesReviewId: null,
    createdAt: "2026-07-31T10:00:00.000Z",
    ...patch,
  };
}

test("a stale vacancy or rubric review cannot resolve the current frozen binding", () => {
  const current = binding();
  const staleVersion = binding({ vacancyVersion: 6 });
  const staleRubric = binding({ rubricHash: "rubric-v6" });

  assert.equal(
    resolveAssessmentReview(
      [
        review("old-version", staleVersion),
        review("old-rubric", staleRubric),
      ],
      current,
      1,
    ).status,
    "pending",
  );
});

test("a superseded review cannot create a false conflict or close consensus", () => {
  const target = binding();
  const original = review("original", target, {
    reviewerUserId: "reviewer-1",
    level: 2,
    createdAt: "2026-07-31T10:00:00.000Z",
  });
  const replacement = review("replacement", target, {
    reviewerUserId: "reviewer-1",
    level: 4,
    supersedesReviewId: original.id,
    createdAt: "2026-07-31T11:00:00.000Z",
  });

  const oneReviewer = resolveAssessmentReview(
    [original, replacement],
    target,
    1,
  );
  assert.equal(oneReviewer.status, "resolved");
  assert.equal(
    oneReviewer.status === "resolved" ? oneReviewer.level : null,
    4,
  );

  const twoReviewers = resolveAssessmentReview(
    [original, replacement],
    target,
    2,
  );
  assert.equal(twoReviewers.status, "pending");
});

test("document and reference reviews resolve only their exact frozen block binding", () => {
  const document = binding({
    blockId: "document-check",
    sourceItemId: "degree",
    attributeId: null,
    kind: "verification",
    rubricHash: "document-policy-v7",
  });
  const reference = binding({
    blockId: "reference-check",
    sourceItemId: "manager-reference",
    attributeId: null,
    kind: "verification",
    rubricHash: "reference-policy-v7",
  });
  const documentReview = review("document-review", document);

  assert.equal(
    resolveAssessmentReview([documentReview], document, 1).status,
    "resolved",
  );
  assert.equal(
    resolveAssessmentReview([documentReview], reference, 1).status,
    "pending",
  );
});

test("tenant, application, vacancy version, source item, and rubric spoofing fail closed", () => {
  const current = binding();
  assert.equal(
    assessmentReviewBindingMatchesScope(current, {
      organizationId: "org-1",
      applicationId: "application-1",
      vacancyId: "vacancy-1",
      vacancyVersion: 7,
    }),
    true,
  );
  for (const spoofed of [
    binding({ organizationId: "org-2" }),
    binding({ applicationId: "application-2" }),
    binding({ vacancyId: "vacancy-2" }),
    binding({ vacancyVersion: 8 }),
  ]) {
    assert.equal(
      assessmentReviewBindingMatchesScope(spoofed, {
        organizationId: "org-1",
        applicationId: "application-1",
        vacancyId: "vacancy-1",
        vacancyVersion: 7,
      }),
      false,
    );
  }
  assert.equal(
    resolveAssessmentReview(
      [
        review(
          "spoofed-source",
          binding({ sourceItemId: "another-item" }),
        ),
        review(
          "spoofed-rubric",
          binding({ rubricHash: "another-rubric" }),
        ),
      ],
      current,
      1,
    ).status,
    "pending",
  );
});

test("exact idempotent retry survives a stale lock while changed content conflicts", () => {
  const target = binding();
  const stored = review("stored", target, {
    idempotencyKeyHash: "same-key",
    inputHash: "same-input",
  });
  const replay = resolveAssessmentReviewWrite([stored], {
    idempotencyKeyHash: "same-key",
    inputHash: "same-input",
    currentLockVersion: 9,
    expectedLockVersion: 8,
  });
  assert.equal(replay.action, "replay");
  assert.equal(
    replay.action === "replay" ? replay.review.id : null,
    "stored",
  );
  assert.throws(
    () =>
      resolveAssessmentReviewWrite([stored], {
        idempotencyKeyHash: "same-key",
        inputHash: "changed-input",
        currentLockVersion: 9,
        expectedLockVersion: 9,
      }),
    /different content/,
  );
  assert.throws(
    () =>
      resolveAssessmentReviewWrite([], {
        idempotencyKeyHash: "new-key",
        inputHash: "new-input",
        currentLockVersion: 9,
        expectedLockVersion: 8,
      }),
    /updated by another request/,
  );
});

test("independent-before-discussion hides peer content until the reviewer submits", () => {
  const targetBinding = binding();
  const peer = review("peer", targetBinding, {
    reviewerUserId: "reviewer-peer",
    level: 5,
    rationale:
      "Peer rationale must not anchor the next independent reviewer.",
  });
  const target: AssessmentReviewTarget = {
    targetId: "target-1",
    binding: targetBinding,
    blockKind: "work_sample",
    blockTitle: "Work sample",
    label: "Delivery quality",
    attributeName: "Delivery",
    bars: [
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
    ],
    requiredReviews: 2,
    independentBeforeDiscussion: true,
    blindReviewRequired: true,
    reviewable: true,
    unavailableReason: null,
    evidenceReceipts: [
      {
        locator: "submission:manual-panel:text",
        source: "submitted_text",
        observedBy: "named_reviewer",
        label: "Submitted text",
      },
    ],
    status: "pending",
    activeReviews: [peer],
  };
  const hidden = assessmentReviewTargetViews(
    [target],
    "reviewer-current",
  )[0]!;
  assert.equal(hidden.detailsVisible, false);
  assert.equal(hidden.activeReviews[0]?.level, null);
  assert.equal(hidden.activeReviews[0]?.rationale, null);
  assert.equal(hidden.activeReviews[0]?.evidence, null);

  const own = review("own", targetBinding, {
    reviewerUserId: "reviewer-current",
    level: 5,
  });
  const revealed = assessmentReviewTargetViews(
    [{ ...target, status: "resolved", activeReviews: [peer, own] }],
    "reviewer-current",
  )[0]!;
  assert.equal(revealed.detailsVisible, true);
  assert.equal(revealed.activeReviews[0]?.level, 5);
});

test("only an exact server-derived evidence receipt can ground a review", () => {
  const target = {
    reviewable: true,
    evidenceReceipts: [
      {
        locator: "artifact:block-1:opaque-upload-1",
        source: "submitted_artifact" as const,
        observedBy: "named_reviewer" as const,
        label: "Submitted artifact",
      },
    ],
  };
  assert.equal(
    resolveAssessmentReviewEvidenceReceipt(
      target,
      "provider-report:forged-by-browser",
    ),
    null,
  );
  assert.equal(
    resolveAssessmentReviewEvidenceReceipt(
      target,
      "artifact:block-1:opaque-upload-1",
    )?.source,
    "submitted_artifact",
  );
  assert.equal(
    resolveAssessmentReviewEvidenceReceipt(
      {
        reviewable: false,
        evidenceReceipts: [],
      },
      "questionnaire:forged",
    ),
    null,
  );
});

test("matching independent BARS moves pending to complete while disagreement conflicts", () => {
  const target = binding();
  const first = review("first", target, {
    reviewerUserId: "reviewer-1",
    level: 4,
  });
  assert.equal(
    resolveAssessmentReview([first], target, 2).status,
    "pending",
  );
  const agreeing = review("agreeing", target, {
    reviewerUserId: "reviewer-2",
    level: 4,
  });
  const resolved = resolveAssessmentReview(
    [first, agreeing],
    target,
    2,
  );
  assert.equal(resolved.status, "resolved");
  assert.equal(
    resolved.status === "resolved" ? resolved.level : null,
    4,
  );
  const disagreeing = review("disagreeing", target, {
    reviewerUserId: "reviewer-2",
    level: 2,
  });
  assert.equal(
    resolveAssessmentReview(
      [first, disagreeing],
      target,
      2,
    ).status,
    "conflict",
  );
});
