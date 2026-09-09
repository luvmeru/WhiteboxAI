import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileAssessmentBlueprint,
  type AssessmentBlueprint,
} from "../lib/server/assessment-blueprint";
import {
  compileCandidateAssessmentPlan,
  validateCandidateSubmission,
  type CandidateAssessmentBlock,
  type UploadedAssetRef,
} from "../lib/server/assessment-runtime";
import { BUILT_IN_PRESETS } from "../lib/presets";
import type {
  BlockKind,
  BlockSettings,
  InterviewQuestion,
  PipelineBlock,
  RubricDimension,
  VacancyV2,
} from "../lib/types";

const secretAnchors = (
  label: string,
): [string, string, string, string, string] => [
  `SECRET_BARS_${label}_1`,
  `SECRET_BARS_${label}_2`,
  `SECRET_BARS_${label}_3`,
  `SECRET_BARS_${label}_4`,
  `SECRET_BARS_${label}_5`,
];

function question(
  id: string,
  modality: "video" | "audio" | "text" = "text",
): InterviewQuestion {
  return {
    id,
    text: `Candidate-visible question ${id}`,
    attributeId: "attr-runtime",
    type: "behavioral",
    thinkTimeSec: 30,
    answerCapSec: 180,
    modality,
    reRecordAttempts: 1,
    notesAllowed: true,
    probes: ["SECRET_PROBE"],
    clarification: "Equivalent clarification",
    situationalFallback: "Equivalent hypothetical scenario",
    rubric: {
      id: `rubric-${id}`,
      attributeId: "attr-runtime",
      anchors: secretAnchors(id),
      version: 12,
    },
    source: "manual",
    rationale: "SECRET_INTERNAL_QUESTION_RATIONALE",
  };
}

function dimensions(label: string): RubricDimension[] {
  const result: RubricDimension[] = [
    {
      id: `${label}-quality`,
      codingScoringArea:
        label === "coding" ? "correctness" : undefined,
      name: "Quality",
      weight: 100,
      anchors: secretAnchors(label),
    },
  ];
  if (label === "coding") {
    result.push(
      {
        id: `${label}-maintainability`,
        codingScoringArea: "quality",
        name: "Maintainability",
        weight: 100,
        anchors: secretAnchors(`${label}-maintainability`),
      },
      {
        id: `${label}-approach`,
        codingScoringArea: "approach",
        name: "Approach",
        weight: 100,
        anchors: secretAnchors(`${label}-approach`),
      },
    );
  }
  return result;
}

function allSettings(): BlockSettings[] {
  return [
    {
      kind: "application_form",
      fields: [
        {
          id: "availability",
          label: "Availability",
          type: "single_choice",
          required: true,
          pii: false,
          scored: true,
          options: [
            { id: "now", text: "Immediately", points: 9001 },
            { id: "later", text: "Later", points: 2 },
          ],
        },
      ],
      prefillFromCv: false,
      dedupeRule: "email_vacancy_resume",
    },
    {
      kind: "knockout",
      placement: "after_form",
      items: [
        {
          id: "work-auth",
          question: "Can you meet the published authorization requirement?",
          type: "yes_no",
          passValue: true,
          immediate: false,
          rejectionText: "SECRET_REJECTION_KEY",
          allowAppeal: true,
          mustHaveId: "SECRET_MUST_HAVE",
        },
      ],
    },
    {
      kind: "cv_intake",
      acceptedFormats: ["pdf", "docx"],
      maxSizeMb: 10,
      parseTargets: [],
      anonymizeForReview: true,
      extractClaims: false,
      portfolioUrlField: true,
    },
    {
      kind: "async_interview",
      questions: [question("async")],
      followUpPolicy: 1,
      order: "fixed",
      introVideo: "none",
      practiceQuestion: false,
      pauseAllowance: 0,
      reviewBeforeSubmit: false,
    },
    {
      kind: "live_ai_interview",
      durationCapMin: 20,
      persona: {
        name: "AI interviewer",
        voice: "neutral",
        disclosedAsAi: true,
      },
      questions: [question("live", "video")],
      adaptivity: "probe_only",
      latencyFallback: "async",
      bargeInAllowed: false,
    },
    {
      kind: "chat_interview",
      questions: [question("chat")],
      minAnswerWords: 1,
      maxAnswerWords: 100,
      typingTelemetry: false,
      pastePolicy: "allow",
      followUpPolicy: 1,
      tone: "warm",
    },
    {
      kind: "sjt",
      instruction: "knowledge",
      format: "pick_best",
      keyType: "sme",
      items: [
        {
          id: "sjt-item",
          scenario: "Select the most effective response.",
          mediaKind: "text",
          options: [
            { id: "investigate", text: "Gather facts.", keyScore: 9876 },
            { id: "guess", text: "Guess.", keyScore: -123 },
          ],
          attributeId: "attr-runtime",
          smeReviewed: true,
        },
      ],
      timing: "untimed",
      randomizeOrder: false,
      pilotMode: false,
    },
    {
      kind: "cognitive",
      subtests: ["logical"],
      itemsPerSubtest: 6,
      adaptive: false,
      totalTimeMin: 15,
      calculatorAllowed: false,
      practiceItems: 2,
    },
    {
      kind: "personality",
      model: "big_five",
      lengthItems: 60,
      format: "forced_choice",
      contextualizedAtWork: true,
      traitMappings: [
        {
          traitId: "SECRET_TRAIT_MAPPING",
          attributeId: "attr-runtime",
          evidenceLevel: "vendor-validated",
        },
      ],
      candidateFeedbackReport: true,
    },
    {
      kind: "integrity_test",
      domains: ["rule_adherence", "dependability"],
      lengthItems: 40,
      format: "forced_choice",
    },
    {
      kind: "job_knowledge",
      items: [
        {
          id: "knowledge-choice",
          type: "mcq_single",
          prompt: "Choose the supported option.",
          options: [
            { id: "supported", text: "Supported", correct: true },
            { id: "unsupported", text: "Unsupported", correct: false },
          ],
          difficulty: "medium",
          attributeId: "attr-runtime",
        },
        {
          id: "knowledge-open",
          type: "short_answer",
          prompt: "Explain your reasoning.",
          modelAnswer: "SECRET_MODEL_ANSWER",
          keyPoints: ["SECRET_KEY_POINT"],
          difficulty: "hard",
          attributeId: "attr-runtime",
        },
      ],
      timing: "total",
      totalTimeMin: 20,
      difficultyMix: { easy: 0, medium: 50, hard: 50 },
      openBook: true,
    },
    {
      kind: "language_test",
      language: "English",
      skills: ["reading", "writing", "speaking"],
      targetLevel: "B2",
      minutesPerSkill: 8,
    },
    {
      kind: "work_sample",
      brief: "Produce a representative work artifact.",
      deliverables: ["rich_text"],
      timeModel: "honesty_window",
      timeBudgetHours: 2,
      aiPolicy: "disclosed",
      originalityCheck: false,
      anonymizedGrading: true,
      rubricDimensions: dimensions("work"),
      defenseFollowUp: false,
    },
    {
      kind: "coding",
      environment: "browser_ide",
      languages: ["TypeScript"],
      taskSource: "custom",
      brief: "Implement the requested behavior.",
      scoringSplit: { correctness: 50, quality: 30, approach: 20 },
      timeCapMin: 60,
      aiPolicy: "disclosed",
      similarityCheck: false,
      rubricDimensions: dimensions("coding"),
    },
    {
      kind: "case_exercise",
      format: "case_analysis",
      materials: "Analyze the provided operational facts.",
      timeBoxMin: 45,
      rubricDimensions: dimensions("case"),
    },
    {
      kind: "doc_verification",
      requiredDocuments: [
        {
          id: "license",
          label: "Professional license",
          qualificationAttributeId: "attr-runtime",
        },
      ],
      acceptedFormats: ["pdf"],
      mode: "manual_document_review",
      idCheck: false,
      placement: "post_shortlist",
    },
    {
      kind: "reference_check",
      referees: { count: 1, relationships: ["manager", "peer"] },
      questionnaire: [
        {
          id: "reference-secret",
          text: "SECRET_REFERENCE_QUESTION",
          attributeId: "attr-runtime",
          type: "rating",
        },
      ],
      collectionWindowDays: 7,
      fraudControls: true,
      anonymizedAggregation: false,
    },
    {
      kind: "human_stage",
      panel: ["SECRET_PANEL_MEMBER"],
      selfBooking: false,
      interviewKitAuto: false,
      independentBeforeDiscussion: true,
      aiNotetaker: false,
    },
    {
      kind: "custom",
      instructions: "Provide the requested text and evidence file.",
      primitives: ["text", "file"],
      rubricDimensions: dimensions("custom"),
    },
  ];
}

function runtimeVacancy(): VacancyV2 {
  const preset = BUILT_IN_PRESETS.find(
    (candidate) => candidate.id === "preset-senior-backend",
  );
  assert.ok(preset);
  const vacancy = structuredClone(preset.payload) as VacancyV2;
  const settings = allSettings();
  return {
    ...vacancy,
    id: "vac-runtime",
    code: "WBX-RT01",
    configVersion: 12,
    profile: {
      ...vacancy.profile,
      title: "Runtime test role",
      mission: "Collect job-related evidence.",
      languages: { primary: "en", alternates: ["ru"] },
    },
    categories: [
      {
        id: "category-runtime",
        name: "Job evidence",
        weight: 100,
        attributes: [
          {
            id: "attr-runtime",
            name: "Reasoning",
            kind: "skill",
            definition: "Makes supported job decisions.",
            weight: 100,
            scale: { anchors: secretAnchors("attribute") },
            verification: "test",
          },
        ],
      },
    ],
    pipeline: settings.map(
      (item, index): PipelineBlock => ({
        id: `block-${item.kind}`,
        kind: item.kind,
        order: index + 1,
        title: `Candidate ${item.kind}`,
        candidateIntro: "This step collects job-related evidence.",
        required: true,
        scored:
          item.kind !== "cv_intake" &&
          item.kind !== "doc_verification",
        estimatedMinutes: 15,
        measures: [{ attributeId: "attr-runtime", share: 100 }],
        settings: item,
        integrityTier: 0,
        accessibility: {
          extraTimeMultiplier: 1,
          captions: true,
          screenReaderMode: true,
          alternativeFormats: true,
        },
        retakePolicy: 1,
        assessorInstructions: "SECRET_ASSESSOR_INSTRUCTIONS",
        internalNotes: ["SECRET_INTERNAL_NOTES"],
      }),
    ),
    experience: {
      ...vacancy.experience,
      notices: {
        ...vacancy.experience.notices,
        aiDisclosure: "AI assists with structured evidence collection.",
        version: 4,
        retentionDays: 30,
      },
    },
  };
}

function blockByKind(
  blocks: readonly CandidateAssessmentBlock[],
  kind: BlockKind,
): CandidateAssessmentBlock {
  const block = blocks.find((candidate) => candidate.kind === kind);
  assert.ok(block, `Missing ${kind} runtime block`);
  return block;
}

const pdfAsset: UploadedAssetRef = {
  uploadId: "upload-pdf",
  fileName: "evidence.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024,
};

test("candidate plan covers all 19 kinds in frozen vacancy order", () => {
  const vacancy = runtimeVacancy();
  const plan = compileCandidateAssessmentPlan(vacancy);
  const expected = allSettings().map((settings) => settings.kind);

  assert.equal(plan.blocks.length, 19);
  assert.deepEqual(
    plan.blocks.map((block) => block.kind),
    expected,
  );
  assert.deepEqual(
    plan.blocks.map((block) => block.order),
    Array.from({ length: 19 }, (_, index) => index + 1),
  );
  assert.equal(plan.source.vacancyVersion, 12);
  assert.match(plan.source.vacancyFingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(plan.finalDecisionByNamedHuman, true);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.blocks), true);
  assert.equal(Object.isFrozen(plan.blocks[0]), true);

  vacancy.pipeline[0]!.title = "MUTATED AFTER SNAPSHOT";
  assert.notEqual(plan.blocks[0]?.title, "MUTATED AFTER SNAPSHOT");
});

test("historical duplicate source orders become contiguous candidate ordinals", () => {
  const vacancy = runtimeVacancy();
  vacancy.pipeline = vacancy.pipeline.map((block) => ({
    ...block,
    order: 1,
  }));

  const plan = compileCandidateAssessmentPlan(vacancy);

  assert.deepEqual(
    plan.blocks.map((block) => block.order),
    Array.from({ length: plan.blocks.length }, (_, index) => index + 1),
  );
  assert.equal(new Set(plan.blocks.map((block) => block.order)).size, 19);
});

test("candidate plan redacts keys, BARS, internal notes, and assessor material", () => {
  const plan = compileCandidateAssessmentPlan(runtimeVacancy());
  const publicJson = JSON.stringify(plan);

  for (const forbidden of [
    "points",
    "passValue",
    "threshold",
    "disqualifies",
    "mustInclude",
    "keyScore",
    "smeReviewed",
    "correct",
    "modelAnswer",
    "keyPoints",
    "anchors",
    "assessorInstructions",
    "internalNotes",
    "SECRET_BARS",
    "SECRET_PROBE",
    "SECRET_MODEL_ANSWER",
    "SECRET_KEY_POINT",
    "SECRET_ASSESSOR_INSTRUCTIONS",
    "SECRET_INTERNAL_NOTES",
    "SECRET_PANEL_MEMBER",
    "SECRET_TRAIT_MAPPING",
    "SECRET_REFERENCE_QUESTION",
    "SECRET_REJECTION_KEY",
  ]) {
    assert.equal(
      publicJson.includes(forbidden),
      false,
      `Candidate plan leaked ${forbidden}`,
    );
  }

  const sjt = blockByKind(plan.blocks, "sjt");
  assert.equal(sjt.manifest.kind, "sjt");
  assert.deepEqual(sjt.manifest.items[0]?.options, [
    { id: "investigate", text: "Gather facts." },
    { id: "guess", text: "Guess." },
  ]);
});

test("runtime distinguishes deterministic keys, judgment, verification, and providers", () => {
  const plan = compileCandidateAssessmentPlan(runtimeVacancy());

  assert.equal(
    blockByKind(plan.blocks, "application_form").scoring.mode,
    "automatic_deterministic",
  );
  assert.equal(
    blockByKind(plan.blocks, "knockout").scoring.mode,
    "automatic_deterministic",
  );
  assert.equal(
    blockByKind(plan.blocks, "sjt").scoring.mode,
    "automatic_deterministic",
  );
  assert.equal(
    blockByKind(plan.blocks, "job_knowledge").scoring.mode,
    "mixed_deterministic_and_human_pending",
  );
  for (const kind of [
    "async_interview",
    "live_ai_interview",
    "chat_interview",
  ] as const) {
    assert.equal(
      blockByKind(plan.blocks, kind).scoring.mode,
      "ai_assisted_human_pending",
    );
  }
  for (const kind of [
    "work_sample",
    "coding",
    "case_exercise",
    "reference_check",
    "human_stage",
    "custom",
  ] as const) {
    assert.equal(
      blockByKind(plan.blocks, kind).scoring.mode,
      "human_pending",
    );
  }
  assert.equal(
    blockByKind(plan.blocks, "doc_verification").scoring.mode,
    "unscored",
  );
  const documentRuntime = blockByKind(
    plan.blocks,
    "doc_verification",
  );
  assert.equal(documentRuntime.manifest.kind, "doc_verification");
  if (documentRuntime.manifest.kind !== "doc_verification") {
    throw new Error("Expected a document verification runtime.");
  }
  assert.equal(documentRuntime.manifest.mode, "manual_document_review");
  const providerDocumentVacancy = runtimeVacancy();
  const providerDocumentBlock = providerDocumentVacancy.pipeline.find(
    (block) => block.kind === "doc_verification",
  );
  assert.ok(providerDocumentBlock);
  assert.equal(
    providerDocumentBlock.settings.kind,
    "doc_verification",
  );
  if (providerDocumentBlock.settings.kind !== "doc_verification") {
    throw new Error("Expected a document verification fixture.");
  }
  providerDocumentBlock.settings.mode = "auto_extract_match";
  const providerDocumentRuntime = blockByKind(
    compileCandidateAssessmentPlan(providerDocumentVacancy).blocks,
    "doc_verification",
  );
  assert.equal(
    providerDocumentRuntime.manifest.kind,
    "doc_verification",
  );
  if (providerDocumentRuntime.manifest.kind !== "doc_verification") {
    throw new Error("Expected a provider document verification runtime.");
  }
  assert.equal(
    providerDocumentRuntime.manifest.mode,
    "auto_extract_match",
  );
  assert.equal(providerDocumentRuntime.delivery.availability, "blocked");
  assert.equal(
    providerDocumentRuntime.delivery.reasonCode,
    "document_verification_provider_not_configured",
  );
  for (const kind of [
    "cognitive",
    "personality",
    "integrity_test",
    "language_test",
  ] as const) {
    const block = blockByKind(plan.blocks, kind);
    assert.equal(block.scoring.mode, "validated_provider_pending");
    assert.equal(block.delivery.state, "external_provider_required");
    assert.equal(block.delivery.availability, "blocked");
  }
  assert.equal(plan.readyForCandidate, false);
  assert.ok(
    plan.blockingReasonCodes.some((code) =>
      code.includes("validated_instrument_delivery_not_configured"),
    ),
  );
  assert.ok(
    plan.blocks.every(
      (block) =>
        block.scoring.finalHumanReviewRequired &&
        !block.scoring.automatedEmploymentDecisionAllowed,
    ),
  );
});

test("SJT pilot data is unscored while every SME-keyed response format is deterministic", () => {
  const pilotVacancy = runtimeVacancy();
  const pilotBlock = pilotVacancy.pipeline.find(
    (block) => block.kind === "sjt",
  );
  assert.ok(pilotBlock);
  assert.equal(pilotBlock.settings.kind, "sjt");
  if (pilotBlock.settings.kind !== "sjt") {
    throw new Error("Expected an SJT fixture.");
  }
  pilotBlock.settings.pilotMode = true;

  const pilotPlan = compileCandidateAssessmentPlan(pilotVacancy);
  const pilotRuntime = blockByKind(pilotPlan.blocks, "sjt");
  assert.equal(pilotRuntime.scoring.mode, "unscored");
  assert.equal(pilotRuntime.scoring.use, "context");
  const pilotBlueprint = compileAssessmentBlueprint(pilotVacancy);
  const pilotEvidence = pilotBlueprint.blocks.find(
    (block) => block.blockId === pilotBlock.id,
  )?.items;
  assert.ok(pilotEvidence?.length);
  assert.ok(
    pilotEvidence.every(
      (item) =>
        item.scoringRule === "unscored" && !item.eligibleForScoring,
    ),
  );

  const rankedVacancy = runtimeVacancy();
  const rankedBlock = rankedVacancy.pipeline.find(
    (block) => block.kind === "sjt",
  );
  assert.ok(rankedBlock);
  assert.equal(rankedBlock.settings.kind, "sjt");
  if (rankedBlock.settings.kind !== "sjt") {
    throw new Error("Expected an SJT fixture.");
  }
  rankedBlock.settings.format = "rank_all";
  const rankedPlan = compileCandidateAssessmentPlan(rankedVacancy);
  assert.equal(
    blockByKind(rankedPlan.blocks, "sjt").scoring.mode,
    "automatic_deterministic",
  );
});

test("a supplied blueprint must match the exact frozen vacancy version and blocks", () => {
  const vacancy = runtimeVacancy();
  const blueprint = compileAssessmentBlueprint(vacancy);
  const wrongVersion: AssessmentBlueprint = {
    ...blueprint,
    vacancyVersion: blueprint.vacancyVersion + 1,
  };

  assert.throws(
    () => compileCandidateAssessmentPlan(vacancy, wrongVersion),
    /exact vacancy version/u,
  );
});

test("optional unscored unavailable blocks stay visible and skippable without blocking launch", () => {
  const vacancy = runtimeVacancy();
  vacancy.pipeline = vacancy.pipeline.map((block) => ({
    ...block,
    required: block.kind === "async_interview",
    scored: block.kind === "async_interview",
  }));
  vacancy.categories[0]!.attributes[0]!.verification = "interview";
  vacancy.categories[0]!.attributes[0]!.evidenceRequirement = {
    methods: ["interview"],
    priority: "important",
    targetLevel: 3,
    minIndependentSources: 1,
    requiredForDecision: true,
    notes: [],
    specialRequirements: [],
  };
  vacancy.scoring.abstainPolicy.minEvidencePerAttribute = 1;

  const plan = compileCandidateAssessmentPlan(vacancy);
  assert.equal(
    blockByKind(plan.blocks, "cognitive").delivery.availability,
    "blocked",
  );
  assert.equal(blockByKind(plan.blocks, "cognitive").required, false);
  assert.equal(plan.readyForCandidate, true, plan.blockingReasonCodes.join(","));
});

test("candidate plan blocks subtype controls that lack exact execution evidence", () => {
  const asyncVacancy = runtimeVacancy();
  const asyncSource = asyncVacancy.pipeline.find(
    (block) => block.settings.kind === "async_interview",
  );
  assert.ok(asyncSource);
  if (asyncSource.settings.kind !== "async_interview") {
    throw new Error("Expected async interview settings.");
  }
  asyncSource.settings.order = "randomized";
  assert.equal(
    blockByKind(
      compileCandidateAssessmentPlan(asyncVacancy).blocks,
      "async_interview",
    ).delivery.reasonCode,
    "async_randomized_order_not_specialized",
  );

  const liveVacancy = runtimeVacancy();
  const liveSource = liveVacancy.pipeline.find(
    (block) => block.settings.kind === "live_ai_interview",
  );
  assert.ok(liveSource);
  if (liveSource.settings.kind !== "live_ai_interview") {
    throw new Error("Expected live interview settings.");
  }
  liveSource.settings.adaptivity = "probe_reorder";
  assert.equal(
    blockByKind(
      compileCandidateAssessmentPlan(liveVacancy).blocks,
      "live_ai_interview",
    ).delivery.reasonCode,
    "live_main_question_reorder_not_implemented",
  );

  const codingVacancy = runtimeVacancy();
  const codingSource = codingVacancy.pipeline.find(
    (block) => block.settings.kind === "coding",
  );
  assert.ok(codingSource);
  if (codingSource.settings.kind !== "coding") {
    throw new Error("Expected coding settings.");
  }
  codingSource.settings.environment = "take_home_repo";
  assert.equal(
    blockByKind(
      compileCandidateAssessmentPlan(codingVacancy).blocks,
      "coding",
    ).delivery.reasonCode,
    "take_home_repository_evidence_not_ingested",
  );

  const caseVacancy = runtimeVacancy();
  const caseSource = caseVacancy.pipeline.find(
    (block) => block.settings.kind === "case_exercise",
  );
  assert.ok(caseSource);
  if (caseSource.settings.kind !== "case_exercise") {
    throw new Error("Expected case exercise settings.");
  }
  caseSource.settings.format = "presentation";
  assert.equal(
    blockByKind(
      compileCandidateAssessmentPlan(caseVacancy).blocks,
      "case_exercise",
    ).delivery.reasonCode,
    "presentation_capture_not_configured",
  );
});

test("candidate submission contracts cover all 19 kinds without placeholder completion", () => {
  const plan = compileCandidateAssessmentPlan(runtimeVacancy());
  const payloads: Partial<Record<BlockKind, unknown>> = {
    application_form: { answers: { availability: "now" } },
    knockout: { answers: { "work-auth": true } },
    cv_intake: {
      resume: pdfAsset,
      portfolioUrl: "https://example.test/portfolio",
    },
    async_interview: {
      answers: [{ questionId: "async", text: "A concrete example." }],
    },
    live_ai_interview: {
      sessionId: "session-1",
      transcriptRef: "transcript-1",
      recordingRef: "recording-1",
      answeredQuestionIds: ["live"],
    },
    chat_interview: {
      answers: [
        {
          questionId: "chat",
          text: "A concrete example.",
          pasteDetected: false,
        },
      ],
    },
    sjt: { answers: { "sjt-item": "investigate" } },
    job_knowledge: {
      answers: {
        "knowledge-choice": "supported",
        "knowledge-open": "A supported explanation.",
      },
    },
    work_sample: {
      deliverables: [{ kind: "rich_text", text: "Work artifact" }],
      aiUse: { usedAi: false, attested: true },
    },
    coding: {
      language: "TypeScript",
      code: "export const value = 1;",
      aiUse: { usedAi: false, attested: true },
    },
    case_exercise: { responseText: "Evidence-based recommendation." },
    doc_verification: { documents: { license: pdfAsset } },
    reference_check: {
      referees: [
        {
          name: "Reference Person",
          email: "reference@example.test",
          relationship: "manager",
          consentConfirmed: true,
        },
      ],
    },
    custom: {
      text: "Custom response",
      files: [pdfAsset],
    },
  };
  const candidateInputKinds: BlockKind[] = [
    "application_form",
    "knockout",
    "cv_intake",
    "async_interview",
    "live_ai_interview",
    "chat_interview",
    "sjt",
    "job_knowledge",
    "work_sample",
    "coding",
    "case_exercise",
    "doc_verification",
    "reference_check",
    "custom",
  ];
  for (const kind of candidateInputKinds) {
    const result = validateCandidateSubmission(
      blockByKind(plan.blocks, kind),
      payloads[kind],
      kind === "doc_verification"
        ? { deferredBlockUnlocked: true }
        : undefined,
    );
    assert.equal(result.ok, true, `${kind}: ${JSON.stringify(result)}`);
  }

  const deferred = validateCandidateSubmission(
    blockByKind(plan.blocks, "doc_verification"),
    payloads.doc_verification,
  );
  assert.equal(deferred.ok, false);
  if (!deferred.ok) assert.equal(deferred.issues[0]?.code, "block_not_open");

  for (const kind of [
    "cognitive",
    "personality",
    "integrity_test",
    "language_test",
  ] as const) {
    const result = validateCandidateSubmission(
      blockByKind(plan.blocks, kind),
      { pretendCompleted: true, score: 100 },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, "external_provider_required");
    }
  }
  const human = validateCandidateSubmission(
    blockByKind(plan.blocks, "human_stage"),
    { pretendCompleted: true },
  );
  assert.equal(human.ok, false);
  if (!human.ok) {
    assert.equal(human.issues[0]?.code, "human_coordination_required");
  }
});

test("validators reject unknown frozen-version items and malformed evidence", () => {
  const plan = compileCandidateAssessmentPlan(runtimeVacancy());
  const form = validateCandidateSubmission(
    blockByKind(plan.blocks, "application_form"),
    { answers: { availability: "secret-option", injected: "value" } },
  );
  assert.equal(form.ok, false);
  if (!form.ok) {
    assert.ok(form.issues.some((candidate) => candidate.code === "unknown_item"));
    assert.ok(form.issues.some((candidate) => candidate.code === "invalid_format"));
  }

  const asyncInterview = validateCandidateSubmission(
    blockByKind(plan.blocks, "async_interview"),
    { answers: [{ questionId: "question-from-newer-version", text: "Answer" }] },
  );
  assert.equal(asyncInterview.ok, false);
  if (!asyncInterview.ok) {
    assert.ok(
      asyncInterview.issues.some(
        (candidate) => candidate.code === "unknown_item",
      ),
    );
  }

  const references = validateCandidateSubmission(
    blockByKind(plan.blocks, "reference_check"),
    {
      referees: [
        {
          name: "Reference",
          email: "not-an-email",
          relationship: "family",
          consentConfirmed: false,
        },
      ],
    },
  );
  assert.equal(references.ok, false);
});

test("chat word and paste policies are enforced by the frozen submission contract", () => {
  const source = blockByKind(
    compileCandidateAssessmentPlan(runtimeVacancy()).blocks,
    "chat_interview",
  );
  assert.equal(source.manifest.kind, "chat_interview");
  if (source.manifest.kind !== "chat_interview") {
    throw new Error("Expected chat interview manifest.");
  }
  const block: CandidateAssessmentBlock = {
    ...source,
    manifest: {
      ...source.manifest,
      minAnswerWords: 3,
      maxAnswerWords: 5,
      pastePolicy: "warn",
    },
  };

  const short = validateCandidateSubmission(block, {
    answers: [
      { questionId: "chat", text: "Too short", pasteDetected: false },
    ],
  });
  assert.equal(short.ok, false);
  if (!short.ok) {
    assert.ok(short.issues.some((issue) => issue.code === "out_of_range"));
  }

  const unacknowledgedPaste = validateCandidateSubmission(block, {
    answers: [
      {
        questionId: "chat",
        text: "Three valid words",
        pasteDetected: true,
      },
    ],
  });
  assert.equal(unacknowledgedPaste.ok, false);
  if (!unacknowledgedPaste.ok) {
    assert.ok(
      unacknowledgedPaste.issues.some(
        (issue) => issue.path.endsWith("pasteAcknowledged"),
      ),
    );
  }

  const accepted = validateCandidateSubmission(block, {
    answers: [
      {
        questionId: "chat",
        text: "Three valid words",
        pasteDetected: true,
        pasteAcknowledged: true,
      },
    ],
  });
  assert.equal(accepted.ok, true);

  const blockedPaste = validateCandidateSubmission(
    {
      ...block,
      manifest: { ...source.manifest, pastePolicy: "block" },
    },
    {
      answers: [
        {
          questionId: "chat",
          text: "Three valid words",
          pasteDetected: true,
        },
      ],
    },
  );
  assert.equal(blockedPaste.ok, false);
  if (!blockedPaste.ok) {
    assert.ok(
      blockedPaste.issues.some(
        (issue) => issue.code === "policy_violation",
      ),
    );
  }
});

test("work and coding submissions require an explicit AI-use attestation", () => {
  const plan = compileCandidateAssessmentPlan(runtimeVacancy());
  const work = blockByKind(plan.blocks, "work_sample");
  const missing = validateCandidateSubmission(work, {
    deliverables: [{ kind: "rich_text", text: "Work artifact" }],
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.ok(missing.issues.some((issue) => issue.path === "body.aiUse"));
  }

  const disclosed = validateCandidateSubmission(work, {
    deliverables: [{ kind: "rich_text", text: "Work artifact" }],
    aiUse: {
      usedAi: true,
      attested: true,
      details: "Used an assistant to check grammar only.",
    },
  });
  assert.equal(disclosed.ok, true);

  assert.equal(work.manifest.kind, "work_sample");
  if (work.manifest.kind !== "work_sample") {
    throw new Error("Expected work-sample manifest.");
  }
  const forbidden = validateCandidateSubmission(
    {
      ...work,
      manifest: { ...work.manifest, aiPolicy: "forbidden" },
    },
    {
      deliverables: [{ kind: "rich_text", text: "Work artifact" }],
      aiUse: {
        usedAi: true,
        attested: true,
        details: "Used an assistant to draft the response.",
      },
    },
  );
  assert.equal(forbidden.ok, false);
  if (!forbidden.ok) {
    assert.ok(
      forbidden.issues.some((issue) => issue.code === "policy_violation"),
    );
  }
});

test("under-specified custom and image-hotspot blocks fail closed", () => {
  const vacancy = runtimeVacancy();
  const custom = vacancy.pipeline.find((block) => block.kind === "custom");
  assert.ok(custom);
  custom.settings = {
    kind: "custom",
    instructions: "Choose an option, but no option schema was published.",
    primitives: ["choice", "recorder"],
    rubricDimensions: dimensions("under-specified-custom"),
  };
  const knowledge = vacancy.pipeline.find(
    (block) => block.kind === "job_knowledge",
  );
  assert.ok(knowledge);
  knowledge.settings = {
    kind: "job_knowledge",
    items: [
      {
        id: "hotspot-without-media",
        type: "image_hotspot",
        prompt: "Select an area, but no immutable image or answer geometry exists.",
        difficulty: "medium",
        attributeId: "attr-runtime",
      },
    ],
    timing: "per_item",
    difficultyMix: { easy: 0, medium: 100, hard: 0 },
    openBook: false,
  };
  const sjt = vacancy.pipeline.find((block) => block.kind === "sjt");
  assert.ok(sjt);
  assert.equal(sjt.settings.kind, "sjt");
  sjt.settings.items[0]!.mediaKind = "image";

  const plan = compileCandidateAssessmentPlan(vacancy);
  for (const kind of ["custom", "job_knowledge", "sjt"] as const) {
    const block = blockByKind(plan.blocks, kind);
    assert.equal(block.delivery.state, "employer_configuration_required");
    const result = validateCandidateSubmission(block, {
      pretendCompleted: true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(
        result.issues[0]?.code,
        "employer_configuration_required",
      );
    }

    const historicalPlanBlock: CandidateAssessmentBlock = {
      ...block,
      delivery: {
        state: "candidate_input",
        availability: "ready",
      },
    };
    const historicalResult = validateCandidateSubmission(
      historicalPlanBlock,
      { pretendCompleted: true },
    );
    assert.equal(historicalResult.ok, false);
    if (!historicalResult.ok) {
      assert.equal(
        historicalResult.issues[0]?.code,
        "employer_configuration_required",
      );
    }
  }
});
