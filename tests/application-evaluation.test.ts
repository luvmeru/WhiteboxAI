import assert from "node:assert/strict";
import { test } from "node:test";

import { BUILT_IN_PRESETS } from "../lib/presets";
import {
  buildAssessmentReviewTargets,
  buildVerificationClaimLedger,
  finalizeApplicationEvaluation,
  prepareApplicationEvaluation,
} from "../lib/server/application-evaluation";
import {
  ASSESSMENT_REVIEW_SCHEMA_VERSION,
  type AssessmentReviewRecord,
} from "../lib/server/assessment-review";
import type {
  ApplicationEvidenceEvaluationOutput,
} from "../lib/server/ai-schemas";
import type {
  AttributeSpec,
  BlockRuntimeResult,
  PipelineBlock,
  VacancyV2,
} from "../lib/types";

function asTestRecord(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

const anchors = (
  construct: string,
): [string, string, string, string, string] => [
  `Provides no usable evidence of ${construct}.`,
  `Demonstrates limited ${construct} with substantial direction.`,
  `Demonstrates reliable ${construct} in routine work.`,
  `Demonstrates strong ${construct} in complex work and explains trade-offs.`,
  `Demonstrates exceptional, repeatable ${construct} and improves wider practice.`,
];

function criterion(
  id: string,
  name: string,
  kind: AttributeSpec["kind"],
  weight: number,
  methods: NonNullable<
    AttributeSpec["evidenceRequirement"]
  >["methods"],
  minimumSources: 1 | 2 | 3,
): AttributeSpec {
  return {
    id,
    name,
    kind,
    definition: `Observable job evidence for ${name}.`,
    weight,
    scale: { anchors: anchors(name) },
    verification:
      methods.includes("interview")
        ? "interview"
        : methods.includes("document")
          ? "document"
          : "test",
    evidenceRequirement: {
      priority: "essential",
      targetLevel: 3,
      methods,
      minIndependentSources: minimumSources,
      requiredForDecision: true,
      notes: [],
      specialRequirements: [],
    },
  };
}

function commonBlock(
  id: string,
  order: number,
  settings: PipelineBlock["settings"],
  measures: PipelineBlock["measures"],
  options: {
    scored?: boolean;
    required?: boolean;
    evidenceRole?: PipelineBlock["evidenceRole"];
  } = {},
): PipelineBlock {
  return {
    id,
    kind: settings.kind,
    order,
    title: `${settings.kind} stage`,
    candidateIntro:
      "This stage collects standardized job-related evidence for named human review.",
    required: options.required ?? true,
    scored: options.scored ?? true,
    estimatedMinutes: 15,
    measures,
    settings,
    integrityTier: 0,
    accessibility: {
      extraTimeMultiplier: 1.25,
      captions: true,
      screenReaderMode: true,
      alternativeFormats: true,
    },
    retakePolicy: 1,
    evidenceRole: options.evidenceRole ?? "primary",
    validation: {
      strategy: "content",
      status: "sme_reviewed",
      scoreUse: options.scored === false ? "context_only" : "decision_support",
      evidenceRefs: ["job-expert-content-review"],
    },
  };
}

function evaluationVacancy(): VacancyV2 {
  const preset = BUILT_IN_PRESETS.find(
    (candidate) => candidate.id === "preset-senior-backend",
  );
  assert.ok(preset);
  const vacancy = structuredClone(preset.payload) as VacancyV2;
  const knowledge = criterion(
    "attr-knowledge",
    "Production knowledge",
    "knowledge",
    40,
    ["test", "self_report"],
    1,
  );
  const delivery = criterion(
    "attr-delivery",
    "Technical delivery",
    "skill",
    60,
    ["interview", "work_sample", "document"],
    2,
  );
  const questionAnchors = anchors("Technical delivery");
  const blocks: PipelineBlock[] = [
    commonBlock(
      "block-knockout",
      1,
      {
        kind: "knockout",
        placement: "before_form",
        items: [
          {
            id: "eligible",
            question: "Can you work the explicitly published on-call schedule?",
            type: "yes_no",
            passValue: true,
            immediate: false,
            rejectionText:
              "A reviewer will inspect the eligibility response and any explanation.",
            allowAppeal: true,
            mustHaveId: "must-on-call",
          },
        ],
      },
      [{ attributeId: knowledge.id, share: 100 }],
      { scored: false, evidenceRole: "verification" },
    ),
    commonBlock(
      "block-knowledge",
      2,
      {
        kind: "job_knowledge",
        items: [
          {
            id: "knowledge-keyed",
            type: "mcq_single",
            prompt: "Which response preserves idempotency?",
            options: [
              { id: "correct", text: "Use an idempotency key.", correct: true },
              { id: "wrong", text: "Retry without a key.", correct: false },
            ],
            difficulty: "medium",
            attributeId: knowledge.id,
          },
        ],
        timing: "total",
        totalTimeMin: 10,
        difficultyMix: { easy: 0, medium: 100, hard: 0 },
        openBook: false,
      },
      [{ attributeId: knowledge.id, share: 100 }],
    ),
    commonBlock(
      "block-interview",
      3,
      {
        kind: "async_interview",
        questions: [
          {
            id: "question-delivery",
            text: "Describe a production change you personally delivered.",
            attributeId: delivery.id,
            type: "behavioral",
            thinkTimeSec: 60,
            answerCapSec: 180,
            modality: "video",
            reRecordAttempts: 1,
            notesAllowed: false,
            probes: ["What trade-off did you make?"],
            clarification:
              "Describe one concrete production change and your own actions.",
            situationalFallback:
              "Explain how you would deliver a risky production change.",
            rubric: {
              id: "rubric-delivery",
              attributeId: delivery.id,
              anchors: questionAnchors,
              version: 8,
            },
            source: "manual",
          },
        ],
        followUpPolicy: 1,
        order: "fixed",
        introVideo: "none",
        practiceQuestion: true,
        pauseAllowance: 1,
        reviewBeforeSubmit: false,
      },
      [{ attributeId: delivery.id, share: 100 }],
    ),
    commonBlock(
      "block-coding",
      4,
      {
        kind: "coding",
        environment: "browser_ide",
        languages: ["TypeScript"],
        taskSource: "custom",
        brief:
          "Implement an idempotent request handler and explain the failure modes.",
        scoringSplit: { correctness: 100, quality: 0, approach: 0 },
        timeCapMin: 60,
        aiPolicy: "disclosed",
        similarityCheck: false,
        rubricDimensions: [
          {
            id: "coding-quality",
            attributeId: delivery.id,
            codingScoringArea: "correctness",
            name: "Implementation quality",
            weight: 100,
            anchors: anchors("implementation quality"),
          },
        ],
      },
      [{ attributeId: delivery.id, share: 100 }],
    ),
    commonBlock(
      "block-doc",
      5,
      {
        kind: "doc_verification",
        requiredDocuments: [
          {
            id: "credential",
            label: "Published credential",
            qualificationAttributeId: delivery.id,
          },
        ],
        acceptedFormats: ["pdf"],
        mode: "auto_extract_match",
        idCheck: false,
        placement: "post_shortlist",
      },
      [{ attributeId: delivery.id, share: 100 }],
      { scored: false, evidenceRole: "verification" },
    ),
  ];
  return {
    ...vacancy,
    id: "vac-production-evaluation",
    configVersion: 8,
    categories: [
      {
        id: "category-core",
        name: "Core evidence",
        weight: 100,
        attributes: [knowledge, delivery],
      },
    ],
    pipeline: blocks,
    scoring: {
      ...vacancy.scoring,
      abstainPolicy: {
        minEvidencePerAttribute: 1,
        onAbstain: "flag_human",
      },
      aggregation: {
        acrossSources: "evidence_weighted_mean",
        contradictoryEvidence: "flag_human",
        optionalBlocks: "exclude_if_missing",
        minimumCoveragePct: 80,
      },
    },
    assessmentDesign: {
      purpose: "selection",
      jobAnalysis: {
        method: "mixed",
        sources: ["Role workshop", "Critical incident review"],
        criticalWorkOutputs: [
          "Reliable production changes",
          "Correct operational decisions",
        ],
        approvedBy: "job-expert",
        approvedAt: "2026-07-01T00:00:00.000Z",
      },
      validation: {
        monitoringMode: "operational",
        outcomeCriteria: ["Change failure rate", "Reviewer calibration"],
        reviewCadenceDays: 90,
        minimumSampleForAnalysis: 100,
        adverseImpactMonitoring: true,
      },
      decisionPolicy: {
        humanFinalDecision: true,
        allowAutomatedRejection: false,
        requireReasonCode: true,
        requireEvidenceCitation: true,
      },
    },
  };
}

function runtimeResults(): BlockRuntimeResult[] {
  const now = "2026-07-31T10:00:00.000Z";
  return [
    {
      blockId: "block-knockout",
      kind: "knockout",
      completedAt: now,
      elapsedSec: 20,
      payload: {
        answers: { eligible: true },
        appeals: {},
      },
      integrityEvents: [],
    },
    {
      blockId: "block-knowledge",
      kind: "job_knowledge",
      completedAt: now,
      elapsedSec: 100,
      payload: { answers: { "knowledge-keyed": "correct" } },
      integrityEvents: [],
    },
    {
      blockId: "block-interview",
      kind: "async_interview",
      completedAt: now,
      elapsedSec: 240,
      payload: [],
      transcript: [
        {
          speaker: "candidate",
          text:
            "I designed an idempotency boundary, measured duplicate requests, and reduced repeat side effects after rollout.",
          at: "turn-1",
          itemId: "question-delivery",
          kind: "main",
        },
      ],
      integrityEvents: [
        {
          id: "reading-legacy",
          kind: "reading_pattern",
          level: "medium",
          note: "Legacy signal that must not enter the evaluation.",
        },
        {
          id: "tab",
          kind: "tab_switch",
          level: "low",
          note: "Advisory only.",
        },
      ] as unknown as BlockRuntimeResult["integrityEvents"],
    },
    {
      blockId: "block-coding",
      kind: "coding",
      completedAt: now,
      elapsedSec: 900,
      payload: {
        language: "TypeScript",
        code:
          "export async function handle(key: string) { return store.once(key, () => perform()); }",
        notes:
          "The storage operation must enforce uniqueness across concurrent workers.",
      },
      integrityEvents: [],
    },
    {
      blockId: "block-doc",
      kind: "doc_verification",
      completedAt: now,
      elapsedSec: 60,
      payload: {
        documents: {
          credential: {
            uploadId: "opaque-artifact-reference",
            fileName: "credential.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024,
            applicationVersion: 5,
          },
        },
      },
      integrityEvents: [],
    },
  ];
}

const engine = {
  model: "gpt-test",
  promptId: "application-evidence-evaluation",
  promptVersion: "multi-source-bars-evaluation-v1",
  rubricVersion: "v8",
  runs: 1,
  scoredAt: "2026-07-31T11:00:00.000Z",
};

function validAiOutput(
  prepared: ReturnType<typeof prepareApplicationEvaluation>,
): ApplicationEvidenceEvaluationOutput {
  return {
    schemaVersion: "application-evidence-evaluation-v1",
    items: prepared.items
      .filter((item) => item.mode === "ai")
      .map((item) => ({
        evaluationItemId: item.evaluationItemId,
        blockId: item.blockId,
        sourceItemId: item.sourceItemId,
        attributeId: item.attributeId,
        disposition: "scored",
        level: 4,
        confidence: "Medium",
        evidence: [
          {
            passageId: item.passages[0]!.passageId,
            relation: "supports",
          },
        ],
        abstainReason: null,
        rationale:
          "The submitted evidence supports the fourth exact published anchor while remaining subject to human review.",
      })),
  };
}

function withResolvedManualBlocks(
  vacancy: VacancyV2,
  results: BlockRuntimeResult[],
  blockIds: readonly string[],
  level: 1 | 2 | 3 | 4 | 5 = 4,
) {
  const context = {
    organizationId: "org-1",
    applicationId: "application-manual-review",
    reviews: [] as AssessmentReviewRecord[],
  };
  const targets = buildAssessmentReviewTargets(
    vacancy,
    results,
    context,
  ).filter(
    (target) =>
      blockIds.includes(target.binding.blockId) &&
      target.binding.kind === "manual_bars" &&
      target.reviewable,
  );
  const reviews = targets.flatMap((target, targetIndex) =>
    Array.from(
      { length: target.requiredReviews },
      (_, reviewerIndex): AssessmentReviewRecord => ({
        ...target.binding,
        schemaVersion: ASSESSMENT_REVIEW_SCHEMA_VERSION,
        id: `resolved-review-${targetIndex + 1}-${reviewerIndex + 1}`,
        idempotencyKeyHash:
          `resolved-key-${targetIndex + 1}-${reviewerIndex + 1}`,
        inputHash:
          `resolved-input-${targetIndex + 1}-${reviewerIndex + 1}`,
        level,
        verificationOutcome: null,
        gateWaiverOutcome: null,
        evidence: {
          summary:
            "Named reviewer applied the exact published anchors to the persisted job-related evidence.",
          locator: target.evidenceReceipts[0]!.locator,
          source: target.evidenceReceipts[0]!.source,
          observedBy: target.evidenceReceipts[0]!.observedBy,
        },
        rationale:
          "The persisted evidence matches the selected frozen BARS anchor.",
        reviewerUserId: `reviewer-${reviewerIndex + 1}`,
        reviewerEmail: `reviewer-${reviewerIndex + 1}@example.test`,
        reviewerRole: "TechnicalReviewer",
        supersedesReviewId: null,
        createdAt:
          `2026-07-31T11:0${targetIndex}:${reviewerIndex}0.000Z`,
      }),
    ),
  );
  return { ...context, reviews };
}

test("preparation scores keys server-side and routes code to named manual review", () => {
  const prepared = prepareApplicationEvaluation(
    evaluationVacancy(),
    runtimeResults(),
  );
  const deterministic = prepared.items.filter(
    (item) => item.mode === "deterministic",
  );
  const ai = prepared.items.filter((item) => item.mode === "ai");
  const manual = prepared.items.filter(
    (item) => item.mode === "manual_pending",
  );
  const verification = prepared.items.filter(
    (item) => item.mode === "verification_pending",
  );

  assert.equal(deterministic.length, 1);
  assert.equal(deterministic[0]?.sourceItemId, "knowledge-keyed");
  assert.equal(deterministic[0]?.deterministicScore, 100);
  assert.deepEqual(
    ai.map((item) => item.blockKind).sort(),
    ["async_interview"],
  );
  assert.equal(
    ai.every((item) => item.passages.every((passage) => passage.text.length > 0)),
    true,
  );
  assert.equal(manual.length, 1);
  assert.equal(manual[0]?.blockKind, "coding");
  assert.equal(
    manual[0]?.passages.some(
      (passage) => passage.text.includes("store.once"),
    ),
    true,
  );
  assert.equal(verification.length, 1);
  assert.equal(verification[0]?.blockKind, "doc_verification");
  assert.deepEqual(prepared.pendingRequiredBlockIds, [
    "block-coding",
    "block-doc",
  ]);
  assert.deepEqual(prepared.mustHaveResults, [
    {
      id: "must-on-call",
      passed: true,
      evidence:
        'Server evaluated the response to frozen eligibility item "eligible". A candidate explanation remains available for human adjudication.',
    },
  ]);
});

test("finalization abstains while manual code and provider verification remain unresolved", () => {
  const vacancy = evaluationVacancy();
  const prepared = prepareApplicationEvaluation(vacancy, runtimeResults());
  const evaluation = finalizeApplicationEvaluation(
    vacancy,
    prepared,
    validAiOutput(prepared),
    engine,
  );

  assert.equal(
    evaluation.perBlock.find((block) => block.blockId === "block-doc")
      ?.itemScores.length,
    0,
  );
  assert.match(
    evaluation.perBlock.find((block) => block.blockId === "block-doc")
      ?.confidenceReason ?? "",
    /no performance score was synthesized/i,
  );
  assert.deepEqual(
    evaluation.perBlock
      .find((block) => block.blockId === "block-interview")
      ?.integrity.map((signal) => signal.kind),
    ["tab_switch"],
  );
  assert.equal(
    evaluation.attributeScores.find(
      (attribute) => attribute.id === "attr-knowledge",
    )?.score,
    92,
  );
  assert.equal(
    evaluation.attributeScores.find(
      (attribute) => attribute.id === "attr-delivery",
    )?.score,
    0,
  );
  assert.equal(
    evaluation.attributeScores.find(
      (attribute) => attribute.id === "attr-delivery",
    )?.abstained,
    true,
  );
  assert.match(
    evaluation.perBlock.find((block) => block.blockId === "block-coding")
      ?.confidenceReason ?? "",
    /manual or verification evidence unit.*remain pending/i,
  );
  assert.equal(evaluation.complete, false);
  assert.equal(evaluation.coverage, 40);
  assert.equal(
    evaluation.tier,
    null,
    "the frozen policy must withhold a substantive tier from incomplete evidence",
  );
  assert.match(evaluation.confidencePhrase, /not rank-eligible/i);
  assert.deepEqual(evaluation.claims, [
    {
      id: "claim:v8:block-doc:document:credential",
      text:
        'Required document "Published credential" received (PDF); a connected provider result remains pending; the upload alone is not verification.',
      sourceBlockId: "block-doc",
      sourceItemId: "document:credential",
      sourceVacancyId: "vac-production-evaluation",
      sourceVacancyVersion: 8,
      material: true,
      status: "UNCHECKED",
    },
  ]);
});

test("verification ledger exposes safe receipts without PII, content inference, or candidate-asserted verification", () => {
  const vacancy = evaluationVacancy();
  vacancy.pipeline.push(
    commonBlock(
      "block-cv",
      6,
      {
        kind: "cv_intake",
        acceptedFormats: ["pdf", "docx"],
        maxSizeMb: 10,
        parseTargets: ["employment", "education", "certifications"],
        anonymizeForReview: true,
        extractClaims: true,
        portfolioUrlField: true,
      },
      [],
      { scored: false, evidenceRole: "context" },
    ),
    commonBlock(
      "block-reference",
      7,
      {
        kind: "reference_check",
        referees: {
          count: 2,
          relationships: ["manager", "peer"],
        },
        questionnaire: [
          {
            id: "reference-delivery",
            text: "Describe observed delivery reliability.",
            attributeId: "attr-delivery",
            type: "open",
          },
        ],
        collectionWindowDays: 7,
        fraudControls: true,
        anonymizedAggregation: false,
      },
      [{ attributeId: "attr-delivery", share: 100 }],
      { evidenceRole: "verification" },
    ),
  );
  const results = runtimeResults();
  const documents = asTestRecord(
    asTestRecord(
      results.find((result) => result.blockId === "block-doc")?.payload,
    ).documents,
  );
  documents.credential = {
    ...asTestRecord(documents.credential),
    fileName: "candidate-full-name-degree.pdf",
    verificationStatus: "VERIFIED",
    verifiedBy: "candidate-controlled-value",
  };
  results.push(
    {
      blockId: "block-cv",
      kind: "cv_intake",
      completedAt: "2026-07-31T10:00:00.000Z",
      elapsedSec: 30,
      payload: {
        resume: {
          uploadId: "opaque-cv",
          fileName: "candidate-full-name-resume.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2_048,
        },
        portfolioUrl: "https://example.test/private-candidate-profile",
      },
      integrityEvents: [],
    },
    {
      blockId: "block-reference",
      kind: "reference_check",
      completedAt: "2026-07-31T10:00:00.000Z",
      elapsedSec: 30,
      payload: {
        referees: [
          {
            name: "Private Manager",
            email: "manager@example.test",
            relationship: "manager",
            consentConfirmed: true,
          },
          {
            name: "Private Peer",
            email: "peer@example.test",
            relationship: "peer",
            consentConfirmed: true,
          },
        ],
      },
      integrityEvents: [],
    },
  );

  const claims = buildVerificationClaimLedger(vacancy, results);
  const rendered = claims.map((claim) => claim.text).join(" ");

  assert.equal(claims.length, 4);
  assert.equal(claims.every((claim) => claim.status === "UNCHECKED"), true);
  assert.match(rendered, /Published credential.*received \(PDF\)/i);
  assert.match(rendered, /CV artifact received \(PDF\)/i);
  assert.match(rendered, /Portfolio link received/i);
  assert.match(rendered, /2 of 2 required referee contact record/i);
  assert.doesNotMatch(rendered, /candidate-full-name/i);
  assert.doesNotMatch(rendered, /private-candidate-profile/i);
  assert.doesNotMatch(rendered, /Private Manager|manager@example/i);
});

test("completion waits for scored or verification evidence, never the final unscored human decision stage", () => {
  const optionalDocumentVacancy = () => {
    const vacancy = evaluationVacancy();
    const documentBlock = vacancy.pipeline.find(
      (block) => block.id === "block-doc",
    );
    assert.ok(documentBlock);
    documentBlock.required = false;
    return vacancy;
  };
  const deliveryAttribute = (vacancy: VacancyV2) => {
    const attribute = vacancy.categories
      .flatMap((category) => category.attributes)
      .find((candidate) => candidate.id === "attr-delivery");
    assert.ok(attribute?.evidenceRequirement);
    return attribute;
  };
  const humanStage = (scored: boolean) =>
    commonBlock(
      "block-human-decision",
      6,
      {
        kind: "human_stage",
        panel: ["Named hiring manager"],
        selfBooking: false,
        interviewKitAuto: false,
        independentBeforeDiscussion: true,
        aiNotetaker: false,
      },
      [{ attributeId: "attr-delivery", share: 100 }],
      {
        scored,
        required: true,
        evidenceRole: "verification",
      },
    );

  const unscoredHumanVacancy = optionalDocumentVacancy();
  const unscoredHumanAttribute = deliveryAttribute(
    unscoredHumanVacancy,
  );
  unscoredHumanAttribute.evidenceRequirement!.methods = [
    ...unscoredHumanAttribute.evidenceRequirement!.methods,
    "human_observation",
  ];
  unscoredHumanVacancy.pipeline.push(humanStage(false));
  const unscoredHumanResults = runtimeResults();
  const unscoredHumanPrepared = prepareApplicationEvaluation(
    unscoredHumanVacancy,
    unscoredHumanResults,
    withResolvedManualBlocks(
      unscoredHumanVacancy,
      unscoredHumanResults,
      ["block-coding"],
    ),
  );
  const unscoredHumanEvaluation = finalizeApplicationEvaluation(
    unscoredHumanVacancy,
    unscoredHumanPrepared,
    validAiOutput(unscoredHumanPrepared),
    engine,
  );
  assert.equal(
    unscoredHumanPrepared.pendingRequiredBlockIds.includes(
      "block-human-decision",
    ),
    false,
  );
  assert.equal(unscoredHumanEvaluation.complete, true);
  assert.notEqual(
    unscoredHumanEvaluation.tier,
    null,
    "complete legacy-compatible evaluations retain their substantive tier",
  );
  assert.equal(
    unscoredHumanEvaluation.perBlock.length,
    unscoredHumanVacancy.pipeline.length,
  );
  assert.ok(
    unscoredHumanEvaluation.perBlock.some(
      (block) => block.blockId === "block-human-decision",
    ),
  );
  assert.equal(
    unscoredHumanEvaluation.perBlock
      .flatMap((block) => block.integrity)
      .some((signal) => signal.id === "reading-legacy"),
    false,
  );

  const scoredHumanVacancy = optionalDocumentVacancy();
  const scoredHumanAttribute = deliveryAttribute(scoredHumanVacancy);
  scoredHumanAttribute.evidenceRequirement!.methods = [
    ...scoredHumanAttribute.evidenceRequirement!.methods,
    "human_observation",
  ];
  scoredHumanVacancy.pipeline.push(humanStage(true));
  const scoredHumanResults = runtimeResults();
  const scoredHumanPrepared = prepareApplicationEvaluation(
    scoredHumanVacancy,
    scoredHumanResults,
    withResolvedManualBlocks(
      scoredHumanVacancy,
      scoredHumanResults,
      ["block-coding"],
    ),
  );
  assert.equal(
    scoredHumanPrepared.items.some(
      (item) =>
        item.blockId === "block-human-decision" &&
        item.mode === "manual_pending",
    ),
    true,
  );
  assert.deepEqual(scoredHumanPrepared.pendingRequiredBlockIds, [
    "block-human-decision",
  ]);
  assert.equal(
    finalizeApplicationEvaluation(
      scoredHumanVacancy,
      scoredHumanPrepared,
      validAiOutput(scoredHumanPrepared),
      engine,
    ).complete,
    false,
  );

  const requiredDocumentVacancy = evaluationVacancy();
  const requiredDocumentResults = runtimeResults();
  const requiredDocumentPrepared = prepareApplicationEvaluation(
    requiredDocumentVacancy,
    requiredDocumentResults,
    withResolvedManualBlocks(
      requiredDocumentVacancy,
      requiredDocumentResults,
      ["block-coding"],
    ),
  );
  assert.equal(
    requiredDocumentPrepared.items.some(
      (item) =>
        item.blockId === "block-doc" &&
        item.mode === "verification_pending",
    ),
    true,
  );
  assert.deepEqual(requiredDocumentPrepared.pendingRequiredBlockIds, [
    "block-doc",
  ]);

  const requiredReferenceVacancy = optionalDocumentVacancy();
  const referenceAttribute = deliveryAttribute(requiredReferenceVacancy);
  referenceAttribute.evidenceRequirement!.methods = [
    ...referenceAttribute.evidenceRequirement!.methods,
    "reference",
  ];
  requiredReferenceVacancy.pipeline.push(
    commonBlock(
      "block-reference-required",
      6,
      {
        kind: "reference_check",
        referees: {
          count: 1,
          relationships: ["manager"],
        },
        questionnaire: [
          {
            id: "reference-delivery",
            text: "Provide job-related examples of delivery reliability.",
            attributeId: "attr-delivery",
            type: "open",
          },
        ],
        collectionWindowDays: 7,
        fraudControls: true,
        anonymizedAggregation: false,
      },
      [{ attributeId: "attr-delivery", share: 100 }],
      {
        scored: false,
        required: true,
        evidenceRole: "verification",
      },
    ),
  );
  const requiredReferenceResults = runtimeResults();
  const requiredReferencePrepared = prepareApplicationEvaluation(
    requiredReferenceVacancy,
    requiredReferenceResults,
    withResolvedManualBlocks(
      requiredReferenceVacancy,
      requiredReferenceResults,
      ["block-coding"],
    ),
  );
  assert.equal(
    requiredReferencePrepared.items.some(
      (item) =>
        item.blockId === "block-reference-required" &&
        item.mode === "verification_pending",
    ),
    true,
    JSON.stringify(
      requiredReferencePrepared.items.filter(
        (item) => item.blockId === "block-reference-required",
      ),
    ),
  );
  assert.deepEqual(requiredReferencePrepared.pendingRequiredBlockIds, [
    "block-reference-required",
  ]);
  assert.equal(
    finalizeApplicationEvaluation(
      requiredReferenceVacancy,
      requiredReferencePrepared,
      validAiOutput(requiredReferencePrepared),
      engine,
    ).complete,
    false,
  );
});

test("invalid or contradictory AI references fail closed as abstentions", () => {
  const vacancy = evaluationVacancy();
  const prepared = prepareApplicationEvaluation(vacancy, runtimeResults());
  const aiItems = prepared.items.filter((item) => item.mode === "ai");
  const output: ApplicationEvidenceEvaluationOutput = {
    schemaVersion: "application-evidence-evaluation-v1",
    items: aiItems.map((item, index) => ({
      evaluationItemId: item.evaluationItemId,
      blockId: item.blockId,
      sourceItemId: item.sourceItemId,
      attributeId: item.attributeId,
      disposition: "scored",
      level: 5,
      confidence: "High",
      evidence: [
        {
          passageId:
            index === 0
              ? "invented-passage"
              : item.passages[0]!.passageId,
          relation: index === 0 ? "supports" : "contradicts",
        },
      ],
      abstainReason: null,
      rationale:
        "This deliberately malformed provider result must be rejected by server-owned evidence checks.",
    })),
  };
  const evaluation = finalizeApplicationEvaluation(
    vacancy,
    prepared,
    output,
    engine,
  );
  const delivery = evaluation.attributeScores.find(
    (attribute) => attribute.id === "attr-delivery",
  );

  assert.equal(delivery?.abstained, true);
  assert.equal(delivery?.score, 0);
  assert.match(delivery?.confidenceReason ?? "", /Not scored/);
  assert.equal(evaluation.complete, false);
});

test("provider item-set drift is rejected before a partial evaluation can be saved", () => {
  const vacancy = evaluationVacancy();
  const prepared = prepareApplicationEvaluation(vacancy, runtimeResults());

  assert.throws(
    () =>
      finalizeApplicationEvaluation(
        vacancy,
        prepared,
        {
          schemaVersion: "application-evidence-evaluation-v1",
          items: [],
        },
        engine,
      ),
    /invalid multi-block evidence item set/,
  );
});

test("cross-block source allocation preserves unequal frozen evidence weights", () => {
  const vacancy = evaluationVacancy();
  const interview = vacancy.pipeline.find(
    (block) => block.id === "block-interview",
  );
  const coding = vacancy.pipeline.find(
    (block) => block.id === "block-coding",
  );
  assert.ok(interview);
  assert.ok(coding);
  interview.measures = [
    { attributeId: "attr-delivery", share: 80 },
    { attributeId: "attr-knowledge", share: 20 },
  ];
  coding.measures = [
    { attributeId: "attr-delivery", share: 20 },
    { attributeId: "attr-knowledge", share: 80 },
  ];
  const results = runtimeResults();
  const prepared = prepareApplicationEvaluation(
    vacancy,
    results,
    withResolvedManualBlocks(
      vacancy,
      results,
      ["block-coding"],
      1,
    ),
  );
  const output = validAiOutput(prepared);
  output.items = output.items.map((item) => ({
    ...item,
    level:
      item.blockId === "block-interview"
        ? 5
        : item.blockId === "block-coding"
          ? 1
          : item.level,
  }));
  const evaluation = finalizeApplicationEvaluation(
    vacancy,
    prepared,
    output,
    engine,
  );
  assert.equal(
    evaluation.attributeScores.find(
      (attribute) => attribute.id === "attr-delivery",
    )?.score,
    77.6,
  );
});

test("human BARS and block gates use frozen within-block item weights", () => {
  const vacancy = evaluationVacancy();
  const delivery = vacancy.categories
    .flatMap((category) => category.attributes)
    .find((attribute) => attribute.id === "attr-delivery");
  assert.ok(delivery);
  delivery.evidenceRequirement = {
    priority: "essential",
    targetLevel: 3,
    methods: ["work_sample"],
    minIndependentSources: 1,
    requiredForDecision: true,
    notes: [],
    specialRequirements: [],
  };
  vacancy.categories = [
    {
      id: "category-core",
      name: "Core evidence",
      weight: 100,
      attributes: [{ ...delivery, weight: 100 }],
    },
  ];
  vacancy.governance.reviewPolicy.independentReviews = 1;
  vacancy.pipeline = [
    {
      ...commonBlock(
        "block-weighted-work",
        1,
        {
          kind: "work_sample",
          brief:
            "Produce a job-related delivery plan with explicit trade-offs.",
          deliverables: ["rich_text"],
          timeModel: "honesty_window",
          timeBudgetHours: 2,
          aiPolicy: "disclosed",
          originalityCheck: false,
          anonymizedGrading: true,
          rubricDimensions: [
            {
              id: "dimension-primary",
              attributeId: "attr-delivery",
              name: "Primary delivery evidence",
              weight: 90,
              anchors: anchors("primary delivery evidence"),
            },
            {
              id: "dimension-secondary",
              attributeId: "attr-delivery",
              name: "Secondary delivery evidence",
              weight: 10,
              anchors: anchors("secondary delivery evidence"),
            },
          ],
          defenseFollowUp: false,
        },
        [{ attributeId: "attr-delivery", share: 100 }],
      ),
      gate: { minBlockScore: 80 },
    },
  ];
  vacancy.scoring.topology = "hybrid";
  const results: BlockRuntimeResult[] = [
    {
      blockId: "block-weighted-work",
      kind: "work_sample",
      completedAt: "2026-07-31T10:00:00.000Z",
      elapsedSec: 120,
      payload: {
        deliverables: [
          {
            kind: "rich_text",
            text:
              "I prioritized rollback safety, explicit ownership, and measurable delivery outcomes.",
          },
        ],
      },
      integrityEvents: [],
    },
  ];
  const context = {
    organizationId: "org-1",
    applicationId: "application-weighted",
    reviews: [] as AssessmentReviewRecord[],
  };
  const targets = buildAssessmentReviewTargets(
    vacancy,
    results,
    context,
  );
  assert.equal(targets.length, 2);
  assert.equal(
    targets.every(
      (target) =>
        target.reviewable &&
        target.evidenceReceipts[0]?.source === "submitted_text",
    ),
    true,
  );
  const reviews: AssessmentReviewRecord[] = targets.map(
    (target, index) => ({
      ...target.binding,
      schemaVersion: ASSESSMENT_REVIEW_SCHEMA_VERSION,
      id: `review-${index + 1}`,
      idempotencyKeyHash: `key-${index + 1}`,
      inputHash: `input-${index + 1}`,
      level: index === 0 ? 5 : 1,
      verificationOutcome: null,
      gateWaiverOutcome: null,
      evidence: {
        summary:
          "Named reviewer mapped the submitted work evidence to the exact published anchor.",
        locator: target.evidenceReceipts[0]!.locator,
        source: target.evidenceReceipts[0]!.source,
        observedBy: target.evidenceReceipts[0]!.observedBy,
      },
      rationale:
        "The cited submitted evidence matches the selected behavioral anchor.",
      reviewerUserId: "reviewer-1",
      reviewerEmail: "reviewer@example.test",
      reviewerRole: "HiringManager",
      supersedesReviewId: null,
      createdAt: `2026-07-31T11:0${index}:00.000Z`,
    }),
  );
  const resolved = prepareApplicationEvaluation(vacancy, results, {
    ...context,
    reviews,
  });
  const evaluation = finalizeApplicationEvaluation(
    vacancy,
    resolved,
    {
      schemaVersion: "application-evidence-evaluation-v1",
      items: [],
    },
    engine,
  );
  assert.equal(
    evaluation.perBlock.find(
      (block) => block.blockId === "block-weighted-work",
    )?.blockScore,
    84.8,
  );
  assert.equal(
    evaluation.attributeScores.find(
      (attribute) => attribute.id === "attr-delivery",
    )?.score,
    84.8,
  );
  assert.equal(evaluation.gateResults?.[0]?.status, "passed");
});

test("contacts and auto-mode uploads stay unreviewable while explicit manual/provider receipts are honored", () => {
  const vacancy = evaluationVacancy();
  const referenceAttribute = vacancy.categories
    .flatMap((category) => category.attributes)
    .find((attribute) => attribute.id === "attr-delivery");
  assert.ok(referenceAttribute?.evidenceRequirement);
  referenceAttribute.evidenceRequirement.methods = [
    ...referenceAttribute.evidenceRequirement.methods,
    "reference",
  ];
  vacancy.pipeline.push(
    commonBlock(
      "block-reference",
      6,
      {
        kind: "reference_check",
        referees: { count: 1, relationships: ["manager"] },
        questionnaire: [
          {
            id: "reference-delivery",
            text: "Describe observed delivery behavior.",
            attributeId: "attr-delivery",
            type: "open",
          },
        ],
        collectionWindowDays: 7,
        fraudControls: true,
        anonymizedAggregation: false,
      },
      [{ attributeId: "attr-delivery", share: 100 }],
      { scored: false, evidenceRole: "verification" },
    ),
  );
  const results = [
    ...runtimeResults(),
    {
      blockId: "block-reference",
      kind: "reference_check" as const,
      completedAt: "2026-07-31T10:00:00.000Z",
      elapsedSec: 30,
      payload: {
        referees: [
          {
            name: "Candidate supplied contact",
            email: "contact@example.test",
            relationship: "manager",
          },
        ],
      },
      integrityEvents: [],
    },
  ];
  const targets = buildAssessmentReviewTargets(vacancy, results, {
    organizationId: "org-1",
    applicationId: "application-1",
    reviews: [],
  });
  const referenceTargets = targets.filter(
    (target) => target.blockKind === "reference_check",
  );
  const documentTargets = targets.filter(
    (target) => target.blockKind === "doc_verification",
  );
  assert.ok(referenceTargets.length > 0);
  assert.ok(documentTargets.length > 0);
  assert.equal(
    [...referenceTargets, ...documentTargets].every(
      (target) =>
        !target.reviewable &&
        target.evidenceReceipts.length === 0,
    ),
    true,
    JSON.stringify([...referenceTargets, ...documentTargets]),
  );
  assert.match(
    referenceTargets[0]?.unavailableReason ?? "",
    /contacts are not evidence/i,
  );
  assert.match(
    documentTargets[0]?.unavailableReason ?? "",
    /upload alone does not establish document authenticity/i,
  );

  const documentBlock = vacancy.pipeline.find(
    (block) => block.id === "block-doc",
  );
  assert.ok(documentBlock);
  assert.equal(documentBlock.settings.kind, "doc_verification");
  documentBlock.settings.mode = "manual_document_review";
  const manualDocumentTargets = buildAssessmentReviewTargets(
    vacancy,
    results,
    {
      organizationId: "org-1",
      applicationId: "application-1",
      reviews: [],
    },
  ).filter(
    (target) => target.blockKind === "doc_verification",
  );
  assert.ok(manualDocumentTargets.length > 0);
  assert.equal(
    manualDocumentTargets.every(
      (target) =>
        target.reviewable &&
        target.evidenceReceipts.every(
          (receipt) => receipt.source === "submitted_artifact",
        ),
    ),
    true,
  );
  assert.match(
    manualDocumentTargets[0]?.evidenceReceipts[0]?.label ?? "",
    /content for requirement review/i,
  );

  documentBlock.settings.mode = "auto_extract_match";
  const exactDocumentResult = results.find(
    (result) => result.blockId === "block-doc",
  ) as BlockRuntimeResult;
  exactDocumentResult.serverEvidence = {
    documentVerifications: [
      {
        receiptId: "provider-receipt-1",
        providerId: "credential-provider",
        providerVersion: "2026-07",
        responseHash: "c".repeat(64),
        verifiedAt: "2026-07-31T10:30:00.000Z",
        sourceItemIds: ["credential"],
        outcome: "verified",
      },
    ],
  };
  const providerDocumentTargets = buildAssessmentReviewTargets(
    vacancy,
    results,
    {
      organizationId: "org-1",
      applicationId: "application-1",
      reviews: [],
    },
  ).filter(
    (target) => target.blockKind === "doc_verification",
  );
  assert.equal(
    providerDocumentTargets.every(
      (target) =>
        target.reviewable &&
        target.evidenceReceipts.every(
          (receipt) =>
            receipt.source === "validated_provider_report" &&
            receipt.observedBy === "validated_provider",
        ),
    ),
    true,
  );

  const exactReferenceResult = results.find(
    (result) => result.blockId === "block-reference",
  ) as BlockRuntimeResult;
  exactReferenceResult.serverEvidence = {
    referenceResponses: [
      {
        receiptId: "3ad4b620-8f13-4e97-98e8-36ddf248d36d",
        invitationId: "758412c9-c95a-478f-b8bc-bc82903ad759",
        refereeOrdinal: 1,
        questionnaireHash: "a".repeat(64),
        responseHash: "b".repeat(64),
        respondedAt: "2026-07-31T11:00:00.000Z",
        sourceItemIds: ["reference-delivery"],
      },
    ],
  };
  const responseTargets = buildAssessmentReviewTargets(
    vacancy,
    results,
    {
      organizationId: "org-1",
      applicationId: "application-1",
      reviews: [],
    },
  ).filter(
    (target) => target.blockKind === "reference_check",
  );
  assert.equal(responseTargets.length, 1);
  assert.equal(responseTargets[0]?.reviewable, true);
  assert.deepEqual(
    responseTargets[0]?.evidenceReceipts,
    [
      {
        locator:
          "reference-response:3ad4b620-8f13-4e97-98e8-36ddf248d36d:reference-delivery",
        source: "external_questionnaire",
        observedBy: "external_participant",
        label: "Structured referee response 1 of 1",
      },
    ],
  );
});
