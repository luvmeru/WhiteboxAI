import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  renderFrozenGateEvidence,
  resolvePersistedReviewEvidence,
} from "../lib/server/assessment-evidence";
import {
  assessmentEvidenceAccessBinding,
  hasAssessmentEvidenceAccess,
} from "../lib/server/assessment-evidence-access";
import type { AssessmentReviewTarget } from "../lib/server/application-evaluation";
import type {
  BlockKind,
  BlockRuntimeResult,
  EvaluationGateResult,
} from "../lib/types";

function target(
  blockKind: BlockKind,
  blockId: string,
  receipt: AssessmentReviewTarget["evidenceReceipts"][number],
  kind: AssessmentReviewTarget["binding"]["kind"] = "manual_bars",
): AssessmentReviewTarget {
  return {
    targetId: "a".repeat(64),
    binding: {
      organizationId: "org-1",
      applicationId: "app-1",
      vacancyId: "vacancy-1",
      vacancyVersion: 7,
      blockId,
      sourceItemId: "dimension-1",
      attributeId: "attribute-1",
      kind,
      rubricHash: "b".repeat(64),
    },
    blockKind,
    blockTitle: "Bound assessment block",
    label: "Bound review target",
    attributeName: "Job-related capability",
    bars: kind === "manual_bars"
      ? ["one", "two", "three", "four", "five"]
      : null,
    requiredReviews: 1,
    independentBeforeDiscussion: true,
    blindReviewRequired: true,
    reviewable: true,
    unavailableReason: null,
    evidenceReceipts: [receipt],
    status: "pending",
    activeReviews: [],
  };
}

function result(
  blockId: string,
  kind: BlockKind,
  payload: unknown,
): BlockRuntimeResult {
  return {
    blockId,
    kind,
    completedAt: "2026-07-31T12:00:00.000Z",
    elapsedSec: 120,
    payload,
    integrityEvents: [],
  };
}

test("review evidence resolves the exact persisted text selected by the server receipt", () => {
  const reviewTarget = target("work_sample", "work-1", {
    locator: "submission:work-1:deliverables:1:text",
    source: "submitted_text",
    observedBy: "named_reviewer",
    label: "Submitted work-sample text 2",
  });
  const resolved = resolvePersistedReviewEvidence(
    reviewTarget,
    [
      result("work-1", "work_sample", {
        deliverables: [
          { text: "Unselected evidence" },
          {
            text:
              "Exact persisted response with job-related reasoning and trade-offs.",
          },
        ],
      }),
    ],
    0,
  );
  assert.deepEqual(resolved, {
    kind: "text",
    label: "Submitted work-sample text 2",
    text:
      "Exact persisted response with job-related reasoning and trade-offs.",
  });
  assert.equal(
    resolvePersistedReviewEvidence(reviewTarget, [], 0),
    null,
  );
  assert.equal(
    resolvePersistedReviewEvidence(reviewTarget, [
      result("another-block", "work_sample", {
        deliverables: [{ text: "Cross-block data" }],
      }),
    ], 0),
    null,
  );
  assert.equal(
    resolvePersistedReviewEvidence(reviewTarget, [
      result("work-1", "work_sample", {
        deliverables: [{ text: "Wrong receipt index" }],
      }),
    ], 1),
    null,
  );
});

test("artifact evidence keeps only the immutable upload binding and excludes candidate filenames", () => {
  const reference = "art1.opaque.signed-reference";
  const reviewTarget = target("case_exercise", "case-1", {
    locator: `artifact:case-1:${reference}`,
    source: "submitted_artifact",
    observedBy: "named_reviewer",
    label: "Submitted case artifact 1",
  });
  const resolved = resolvePersistedReviewEvidence(
    reviewTarget,
    [
      result("case-1", "case_exercise", {
        files: [
          {
            uploadId: reference,
            applicationVersion: 13,
            fileName: "candidate-controlled-secret-name.pdf",
            mimeType: "application/pdf",
            sizeBytes: 4096,
          },
        ],
      }),
    ],
    0,
  );
  assert.deepEqual(resolved, {
    kind: "artifact",
    label: "Submitted case artifact 1",
    reference,
    applicationVersion: 13,
    purpose: "case_study",
    expectedContentType: "application/pdf",
    expectedByteSize: 4096,
  });
  assert.equal(
    Object.hasOwn(resolved ?? {}, "fileName"),
    false,
  );
  assert.equal(
    Object.hasOwn(resolved ?? {}, "storageKey"),
    false,
  );
});

test("human observation view preserves notes and timestamp without disclosing observer identity", () => {
  const reviewTarget = target("human_stage", "panel-1", {
    locator: "observation:panel-1:observation-1",
    source: "live_observation",
    observedBy: "named_reviewer",
    label: "Structured human-stage observation 1",
  });
  const resolved = resolvePersistedReviewEvidence(
    reviewTarget,
    [
      result("panel-1", "human_stage", {
        observations: [
          {
            observationId: "observation-1",
            observerUserId: "private-observer-id",
            observedAt: "2026-07-31T12:30:00.000Z",
            notes:
              "Candidate separated the incident timeline from hypotheses and named a rollback criterion.",
          },
        ],
      }),
    ],
    0,
  );
  assert.equal(resolved?.kind, "text");
  assert.match(
    resolved?.kind === "text" ? resolved.text : "",
    /2026-07-31T12:30:00.000Z/,
  );
  assert.match(
    resolved?.kind === "text" ? resolved.text : "",
    /rollback criterion/,
  );
  assert.doesNotMatch(
    resolved?.kind === "text" ? resolved.text : "",
    /private-observer-id/,
  );
});

test("document evidence distinguishes manual content review from provider-backed verification", () => {
  const reference = "art1.document.signed-reference";
  const manualTarget = target(
    "doc_verification",
    "documents-1",
    {
      locator: `artifact:documents-1:${reference}`,
      source: "submitted_artifact",
      observedBy: "named_reviewer",
      label: "Submitted content for requirement review · Licence",
    },
    "verification",
  );
  manualTarget.binding.sourceItemId = "licence";
  manualTarget.binding.attributeId = null;
  const manual = resolvePersistedReviewEvidence(
    manualTarget,
    [
      result("documents-1", "doc_verification", {
        documents: {
          licence: {
            uploadId: reference,
            applicationVersion: 17,
            fileName: "candidate-controlled-name.pdf",
            mimeType: "application/pdf",
            sizeBytes: 2048,
          },
        },
      }),
    ],
    0,
  );
  assert.equal(manual?.kind, "artifact");
  assert.equal(
    manual?.kind === "artifact" ? manual.purpose : null,
    "document_check",
  );

  const providerTarget = target(
    "doc_verification",
    "documents-1",
    {
      locator: "document-provider:provider-receipt-1:licence",
      source: "validated_provider_report",
      observedBy: "validated_provider",
      label: "Connected provider result 1",
    },
    "verification",
  );
  providerTarget.binding.sourceItemId = "licence";
  providerTarget.binding.attributeId = null;
  const provider = resolvePersistedReviewEvidence(
    providerTarget,
    [
      {
        ...result("documents-1", "doc_verification", {
          documents: {},
        }),
        serverEvidence: {
          documentVerifications: [
            {
              receiptId: "provider-receipt-1",
              providerId: "credential-provider",
              providerVersion: "2026-07",
              responseHash: "d".repeat(64),
              verifiedAt: "2026-07-31T12:00:00.000Z",
              sourceItemIds: ["licence"],
              outcome: "verified",
            },
          ],
        },
      },
    ],
    0,
  );
  assert.equal(provider?.kind, "text");
  assert.match(
    provider?.kind === "text" ? provider.text : "",
    /credential-provider[\s\S]*Provider result: verified/,
  );
  assert.doesNotMatch(
    provider?.kind === "text" ? provider.text : "",
    /dddddddddddddddd/,
  );
});

test("frozen gate evidence is limited to the exact recorded failed gate", () => {
  const reviewTarget = target(
    "knockout",
    "gate-1",
    {
      locator: "gate:gate-1",
      source: "frozen_gate",
      observedBy: "named_reviewer",
      label: "Exact frozen gate and recorded outcome",
    },
    "gate_waiver",
  );
  const gate: EvaluationGateResult = {
    blockId: "gate-1",
    blockTitle: "Eligibility gate",
    topology: "multiple_hurdle",
    configured: true,
    status: "failed",
    minimumBlockScore: null,
    actualBlockScore: null,
    mustHaveIds: ["must-1"],
    failedMustHaveIds: ["must-1"],
    pendingMustHaveIds: [],
    requiresAdjudication: true,
    reason: "A published must-have criterion was not met.",
    waiver: { outcome: "none", reviewIds: [] },
  };
  const rendered = renderFrozenGateEvidence(reviewTarget, [gate]);
  assert.equal(rendered?.kind, "text");
  assert.match(rendered?.text ?? "", /Recorded gate status: failed/);
  assert.match(rendered?.text ?? "", /must-1/);
  assert.equal(
    renderFrozenGateEvidence(
      reviewTarget,
      [{ ...gate, blockId: "another-gate" }],
    ),
    null,
  );
});

test("HR evidence route is authenticated, tenant-bound, receipt-bound and no-store", async () => {
  const route = await readFile(
    path.join(
      process.cwd(),
      "app/api/hr/applications/[id]/assessment-evidence/[targetId]/[receiptIndex]/route.ts",
    ),
    "utf8",
  );
  assert.match(route, /const session = await getHrSession\(\)/);
  assert.match(route, /REVIEW_ROLES\.has\(session\.role\)/);
  assert.match(
    route,
    /getTenantApplication\(\s*id,\s*session\.organizationId,\s*\)/,
  );
  assert.match(
    route,
    /candidate\.targetId === targetId/,
  );
  assert.match(
    route,
    /target\.evidenceReceipts\[receiptIndex\]/,
  );
  assert.match(
    route,
    /assertReviewerAuthorized\(\{[\s\S]*capability: "evidence_read"[\s\S]*evidenceMode: "raw"[\s\S]*blindReviewRequired: target\.blindReviewRequired[\s\S]*deidentifiedEvidenceAvailable: false/,
  );
  assert.ok(
    route.indexOf("assertReviewerAuthorized({") <
      route.indexOf("readPrivateArtifact(artifact)"),
    "reviewer authorization must run before raw evidence is read",
  );
  assert.match(
    route,
    /organizationId: application\.organizationId[\s\S]*applicationId: application\.id[\s\S]*applicationVersion: evidence\.applicationVersion[\s\S]*blockId: target\.binding\.blockId[\s\S]*purposes: \[evidence\.purpose\]/,
  );
  assert.match(route, /readPrivateArtifact\(artifact\)/);
  assert.match(
    route,
    /getHrReferenceResponseEvidence\([\s\S]*evidence\.applicationId !== scope\.applicationId[\s\S]*evidence\.vacancyId !== scope\.vacancyId[\s\S]*evidence\.vacancyVersion !== scope\.vacancyVersion[\s\S]*evidence\.blockId !== scope\.blockId/,
  );
  assert.match(
    route,
    /recordAssessmentEvidenceAccess\([\s\S]*targetId: target\.targetId[\s\S]*blockId: target\.binding\.blockId[\s\S]*receiptIndex/,
  );
  assert.match(
    route,
    /"Cache-Control": "private, no-store, max-age=0"/,
  );
  assert.match(route, /genericArtifactName\(artifact\.contentType\)/);
  assert.doesNotMatch(route, /originalFilename|storageKey|storageBucket/);
});

test("review access attestation requires the same actor and exact receipt", () => {
  const exact = assessmentEvidenceAccessBinding({
    organizationId: "org-1",
    applicationId: "app-1",
    targetId: "a".repeat(64),
    blockId: "work-1",
    receiptIndex: 0,
    receiptLocator: "submission:work-1:deliverables:0:text",
    actorUserId: "reviewer-1",
  });
  assert.equal(hasAssessmentEvidenceAccess([], exact), false);
  assert.equal(hasAssessmentEvidenceAccess([exact], exact), true);
  assert.equal(
    hasAssessmentEvidenceAccess(
      [{ ...exact, actorUserId: "reviewer-2" }],
      exact,
    ),
    false,
  );
  assert.equal(
    hasAssessmentEvidenceAccess(
      [
        assessmentEvidenceAccessBinding({
          organizationId: "org-1",
          applicationId: "app-1",
          targetId: "a".repeat(64),
          blockId: "work-1",
          receiptIndex: 1,
          receiptLocator: "submission:work-1:deliverables:1:text",
          actorUserId: "reviewer-1",
        }),
      ],
      exact,
    ),
    false,
  );
});

test("review persistence checks server-side access before its atomic write", async () => {
  const [repository, reviewRoute, evidenceRoute] = await Promise.all([
    readFile(
      path.join(process.cwd(), "lib/server/repository.ts"),
      "utf8",
    ),
    readFile(
      path.join(
        process.cwd(),
        "app/api/hr/applications/[id]/assessment-reviews/route.ts",
      ),
      "utf8",
    ),
    readFile(
      path.join(
        process.cwd(),
        "app/api/hr/applications/[id]/assessment-evidence/[targetId]/[receiptIndex]/route.ts",
      ),
      "utf8",
    ),
  ]);
  assert.match(
    repository,
    /databaseHasAssessmentEvidenceAccess\([\s\S]*receiptLocatorHash[\s\S]*ASSESSMENT_EVIDENCE_ACCESSED/,
  );
  assert.match(
    repository,
    /transaction\(async \(client\) => \{\s*requireAssessmentEvidenceAccess\([\s\S]*databaseHasAssessmentEvidenceAccess[\s\S]*UPDATE applications/,
  );
  assert.match(
    repository,
    /hasAssessmentEvidenceAccess\([\s\S]*data\.audit\.flatMap[\s\S]*accessBinding/,
  );
  assert.match(
    reviewRoute,
    /EVIDENCE_ACCESS_REQUIRED/,
  );
  assert.match(
    reviewRoute,
    /assertReviewerAuthorized\(\{[\s\S]*capability: "assessment_review"[\s\S]*evidenceMode: "raw"[\s\S]*blindReviewRequired: target\.blindReviewRequired[\s\S]*deidentifiedEvidenceAvailable: false/,
  );
  assert.match(
    repository,
    /assertReviewerAuthorized\(\{[\s\S]*capability: "assessment_review"[\s\S]*blindReviewRequired: currentTarget\.blindReviewRequired/,
  );
  assert.match(
    evidenceRoute,
    /receiptLocator: receipt\.locator/,
  );
  assert.doesNotMatch(
    reviewRoute,
    /viewed\s*:/,
  );
});
