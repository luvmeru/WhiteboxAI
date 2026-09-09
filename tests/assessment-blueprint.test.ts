import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ASSESSMENT_METHOD_POLICIES,
  ASSESSMENT_METHODS_BY_BLOCK_KIND,
  PROHIBITED_ASSESSMENT_SIGNALS,
  blockUsesStructuredInterviewMethod,
  compileAssessmentBlueprint,
  type AssessmentMethod,
} from "../lib/server/assessment-blueprint";
import { effectiveWeights } from "../lib/studio";
import { BUILT_IN_PRESETS } from "../lib/presets";
import type {
  AttributeSpec,
  BlockSettings,
  CategorySpec,
  InterviewQuestion,
  PipelineBlock,
  ResponseModality,
  RubricDimension,
  VacancyV2,
} from "../lib/types";

const anchors = (construct: string): [string, string, string, string, string] => [
  `Does not yet demonstrate observable ${construct}.`,
  `Demonstrates limited ${construct} with substantial support.`,
  `Demonstrates reliable ${construct} in a typical job situation.`,
  `Demonstrates strong ${construct} across complex situations.`,
  `Demonstrates exceptional, repeatable ${construct} and improves others' practice.`,
];

function attribute(
  id: string,
  name: string,
  weight: number,
  focus = false,
): AttributeSpec {
  return {
    id,
    name,
    kind: "skill",
    definition: `Observable job behavior for ${name}.`,
    weight,
    focus,
    scale: { anchors: anchors(name) },
    verification: "test",
  };
}

function categories(
  first = attribute("attr-a", "Analysis", 50),
  second = attribute("attr-b", "Execution", 50),
): CategorySpec[] {
  return [
    {
      id: "category-core",
      name: "Core criteria",
      weight: 100,
      attributes: [first, second],
    },
  ];
}

function baseVacancy(
  pipeline: PipelineBlock[],
  criterionCategories = categories(),
): VacancyV2 {
  const preset = BUILT_IN_PRESETS.find(
    (candidate) => candidate.id === "preset-senior-backend",
  );
  assert.ok(preset);
  const vacancy = structuredClone(preset.payload) as VacancyV2;
  return {
    ...vacancy,
    id: "vac-assessment-blueprint",
    configVersion: 7,
    categories: criterionCategories,
    pipeline,
    scoring: {
      ...vacancy.scoring,
      abstainPolicy: {
        minEvidencePerAttribute: 1,
        onAbstain: "flag_human",
      },
      normalization: "absolute_rubric",
      anonymization: {
        maskPII: true,
        revealAtStage: "decision",
      },
    },
    governance: {
      ...vacancy.governance,
      reviewPolicy: {
        independentReviews: 2,
        assignment: "by_expertise",
      },
      calibrationRequired: true,
    },
  };
}

function question(
  id: string,
  attributeId: string,
  modality: ResponseModality,
): InterviewQuestion {
  return {
    id,
    text: `Describe observable evidence for ${attributeId}.`,
    attributeId,
    type: "behavioral",
    thinkTimeSec: 30,
    answerCapSec: 180,
    modality,
    reRecordAttempts: 1,
    notesAllowed: false,
    probes: [`What was your personal action for ${attributeId}?`],
    clarification: `Use a job, study, or volunteer example for ${attributeId}.`,
    situationalFallback: `Explain how you would handle a job scenario involving ${attributeId}.`,
    rubric: {
      id: `rubric-${id}`,
      attributeId,
      anchors: anchors(attributeId),
      version: 7,
    },
    source: "manual",
  };
}

function dimensions(prefix: string): RubricDimension[] {
  const result: RubricDimension[] = [
    {
      id: `${prefix}-quality`,
      attributeId: "attr-a",
      codingScoringArea:
        prefix === "coding" ? "correctness" : undefined,
      name: "Quality",
      weight: 70,
      anchors: anchors("quality"),
    },
    {
      id: `${prefix}-reasoning`,
      attributeId: "attr-b",
      codingScoringArea: prefix === "coding" ? "quality" : undefined,
      name: "Reasoning",
      weight: 30,
      anchors: anchors("reasoning"),
    },
  ];
  if (prefix === "coding") {
    result.push({
      id: `${prefix}-approach`,
      attributeId: "attr-b",
      codingScoringArea: "approach",
      name: "Approach",
      weight: 30,
      anchors: anchors("approach"),
    });
  }
  return result;
}

function block(
  id: string,
  settings: BlockSettings,
  order: number,
  options: {
    scored?: boolean;
    required?: boolean;
    measures?: PipelineBlock["measures"];
  } = {},
): PipelineBlock {
  return {
    id,
    kind: settings.kind,
    order,
    title: `${settings.kind} assessment`,
    candidateIntro:
      "This standardized step collects job-related evidence and supports human review.",
    required: options.required ?? true,
    scored: options.scored ?? true,
    estimatedMinutes: 15,
    measures:
      options.measures ??
      [
        { attributeId: "attr-a", share: 50 },
        { attributeId: "attr-b", share: 50 },
      ],
    settings,
    integrityTier: 0,
    accessibility: {
      extraTimeMultiplier: 1.25,
      captions: true,
      screenReaderMode: true,
      alternativeFormats: true,
    },
    retakePolicy: 1,
  };
}

function everyBlockKind(): PipelineBlock[] {
  const settings: BlockSettings[] = [
    {
      kind: "application_form",
      fields: [
        {
          id: "field-job-response",
          attributeId: "attr-a",
          label: "Job-related keyed response",
          type: "single_choice",
          required: true,
          pii: false,
          scored: true,
          options: [
            { id: "field-job-response-a", text: "Option A", points: 0 },
            { id: "field-job-response-b", text: "Option B", points: 1 },
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
          id: "knockout-auth",
          question: "Can you satisfy the stated work authorization requirement?",
          type: "yes_no",
          passValue: true,
          immediate: false,
          rejectionText: "A reviewer will inspect this requirement.",
          allowAppeal: true,
        },
      ],
    },
    {
      kind: "cv_intake",
      acceptedFormats: ["pdf", "docx"],
      maxSizeMb: 10,
      parseTargets: ["employment", "skills", "links"],
      anonymizeForReview: true,
      extractClaims: true,
      portfolioUrlField: true,
    },
    {
      kind: "async_interview",
      questions: [
        question("async-video", "attr-a", "video"),
        question("async-audio", "attr-b", "audio"),
        question("async-text", "attr-a", "text"),
      ],
      followUpPolicy: 1,
      order: "fixed",
      introVideo: "none",
      practiceQuestion: true,
      pauseAllowance: 1,
      reviewBeforeSubmit: true,
    },
    {
      kind: "live_ai_interview",
      durationCapMin: 20,
      persona: {
        name: "Structured interviewer",
        voice: "neutral",
        disclosedAsAi: true,
      },
      questions: [question("live-video", "attr-b", "video")],
      adaptivity: "probe_only",
      latencyFallback: "chat",
      bargeInAllowed: false,
    },
    {
      kind: "chat_interview",
      questions: [question("chat-text", "attr-a", "text")],
      minAnswerWords: 20,
      maxAnswerWords: 400,
      typingTelemetry: false,
      pastePolicy: "allow",
      followUpPolicy: 1,
      tone: "neutral",
    },
    {
      kind: "sjt",
      instruction: "knowledge",
      format: "pick_best",
      keyType: "sme",
      items: [
        {
          id: "sjt-1",
          scenario: "Choose the most job-effective response.",
          mediaKind: "text",
          options: [
            { id: "sjt-a", text: "Gather facts first.", keyScore: 2 },
            { id: "sjt-b", text: "Act without checking.", keyScore: 0 },
          ],
          attributeId: "attr-a",
          smeReviewed: true,
        },
      ],
      timing: "untimed",
      randomizeOrder: false,
      pilotMode: false,
    },
    {
      kind: "cognitive",
      subtests: ["numerical", "logical"],
      criterionMappings: [
        { unit: "numerical", attributeId: "attr-a" },
        { unit: "logical", attributeId: "attr-b" },
      ],
      itemsPerSubtest: 6,
      adaptive: false,
      totalTimeMin: 20,
      calculatorAllowed: true,
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
          traitId: "work-conscientiousness",
          attributeId: "attr-b",
          evidenceLevel: "vendor-validated",
        },
      ],
      candidateFeedbackReport: true,
    },
    {
      kind: "integrity_test",
      domains: ["rule_adherence", "dependability"],
      criterionMappings: [
        { unit: "rule_adherence", attributeId: "attr-a" },
        { unit: "dependability", attributeId: "attr-b" },
      ],
      lengthItems: 40,
      format: "forced_choice",
    },
    {
      kind: "job_knowledge",
      items: [
        {
          id: "knowledge-1",
          type: "short_answer",
          prompt: "Explain the job-relevant trade-off.",
          modelAnswer: "A supported trade-off.",
          keyPoints: ["constraint", "decision", "result"],
          difficulty: "medium",
          attributeId: "attr-a",
        },
      ],
      timing: "total",
      totalTimeMin: 20,
      difficultyMix: { easy: 20, medium: 60, hard: 20 },
      openBook: true,
    },
    {
      kind: "language_test",
      language: "en",
      skills: ["reading", "writing", "speaking"],
      criterionMappings: [
        { unit: "reading", attributeId: "attr-a" },
        { unit: "writing", attributeId: "attr-b" },
        { unit: "speaking", attributeId: "attr-b" },
      ],
      targetLevel: "B2",
      minutesPerSkill: 8,
    },
    {
      kind: "work_sample",
      brief: "Produce the stated job deliverable.",
      deliverables: ["file", "rich_text"],
      timeModel: "honesty_window",
      timeBudgetHours: 2,
      aiPolicy: "disclosed",
      originalityCheck: false,
      anonymizedGrading: true,
      rubricDimensions: dimensions("sample"),
      defenseFollowUp: true,
    },
    {
      kind: "coding",
      environment: "browser_ide",
      languages: ["TypeScript"],
      taskSource: "custom",
      brief: "Implement the stated job-relevant change.",
      scoringSplit: { correctness: 50, quality: 30, approach: 20 },
      timeCapMin: 90,
      aiPolicy: "disclosed",
      similarityCheck: false,
      rubricDimensions: dimensions("coding"),
    },
    {
      kind: "case_exercise",
      format: "case_analysis",
      materials: "Analyze operational facts and recommend an action.",
      timeBoxMin: 45,
      rubricDimensions: dimensions("case"),
    },
    {
      kind: "doc_verification",
      requiredDocuments: [
        {
          id: "qualification-document",
          label: "Required professional qualification",
          qualificationAttributeId: "attr-a",
        },
      ],
      acceptedFormats: ["pdf"],
      mode: "auto_extract_match",
      idCheck: false,
      placement: "post_shortlist",
    },
    {
      kind: "reference_check",
      referees: { count: 2, relationships: ["manager", "peer"] },
      questionnaire: [
        {
          id: "reference-rating",
          text: "Rate the observable job behavior.",
          attributeId: "attr-b",
          type: "rating",
        },
        {
          id: "reference-example",
          text: "Give a concrete work example.",
          type: "open",
        },
      ],
      collectionWindowDays: 7,
      fraudControls: true,
      anonymizedAggregation: false,
    },
    {
      kind: "human_stage",
      panel: ["reviewer-a", "reviewer-b"],
      selfBooking: false,
      interviewKitAuto: false,
      independentBeforeDiscussion: true,
      aiNotetaker: false,
    },
    {
      kind: "custom",
      instructions: "Review the job-related artifact using the rubric.",
      primitives: ["file", "text"],
      rubricDimensions: dimensions("custom"),
    },
  ];

  return settings.map((item, index) =>
    block(`block-${item.kind}`, item, index + 1, {
      scored:
        item.kind !== "cv_intake" &&
        item.kind !== "doc_verification",
    }),
  );
}

test("every existing pipeline block compiles to an explicit evidence method", () => {
  const plan = compileAssessmentBlueprint(
    baseVacancy(everyBlockKind()),
  );
  assert.equal(
    plan.ready,
    true,
    JSON.stringify(plan.issues.filter((candidate) => candidate.severity === "blocker")),
  );
  const expectedKinds = new Set(
    Object.keys(ASSESSMENT_METHODS_BY_BLOCK_KIND),
  );
  const compiledKinds = new Set(
    plan.blocks.map((candidate) => candidate.blockKind),
  );
  assert.deepEqual(compiledKinds, expectedKinds);

  const expectedMethods = new Set(
    Object.keys(ASSESSMENT_METHOD_POLICIES) as AssessmentMethod[],
  );
  const compiledMethods = new Set(
    plan.blocks.flatMap((candidate) => candidate.methods),
  );
  assert.deepEqual(compiledMethods, expectedMethods);
  assert.equal(plan.methodPolicies.length, expectedMethods.size);

  for (const policy of plan.methodPolicies) {
    assert.equal(policy.humanReviewRequired, true);
    assert.equal(policy.automatedEmploymentDecisionAllowed, false);
    assert.equal(policy.protectedTraitUseAllowed, false);
    assert.equal(policy.appearanceInferenceAllowed, false);
    assert.equal(policy.emotionInferenceAllowed, false);
  }

  const interviewBlocks = plan.blocks.filter((candidate) =>
    [
      "async_interview",
      "live_ai_interview",
      "chat_interview",
    ].includes(candidate.blockKind),
  );
  assert.ok(interviewBlocks.every(blockUsesStructuredInterviewMethod));
});

test("the compiler normalizes category, attribute, block, item, and composite weights", () => {
  const weightedCategories: CategorySpec[] = [
    {
      id: "category-one",
      name: "Primary",
      weight: 3,
      attributes: [
        attribute("attr-a", "Analysis", 2, true),
        attribute("attr-b", "Execution", 1),
      ],
    },
    {
      id: "category-two",
      name: "Secondary",
      weight: 1,
      attributes: [attribute("attr-c", "Quality", 7)],
    },
  ];
  const textBlock = block(
    "text-evidence",
    {
      kind: "chat_interview",
      questions: [
        question("text-a", "attr-a", "text"),
        question("text-b", "attr-b", "text"),
      ],
      minAnswerWords: 20,
      maxAnswerWords: 400,
      typingTelemetry: false,
      pastePolicy: "allow",
      followUpPolicy: 0,
      tone: "neutral",
    },
    1,
    {
      measures: [
        { attributeId: "attr-a", share: 2 },
        { attributeId: "attr-b", share: 1 },
      ],
    },
  );
  const sampleBlock = block(
    "sample-evidence",
    {
      kind: "work_sample",
      brief: "Create a representative job deliverable.",
      deliverables: ["file"],
      timeModel: "honesty_window",
      timeBudgetHours: 2,
      aiPolicy: "disclosed",
      originalityCheck: false,
      anonymizedGrading: true,
      rubricDimensions: [
        {
          id: "sample-primary",
          attributeId: "attr-a",
          name: "Primary dimension",
          weight: 9,
          anchors: anchors("primary quality"),
        },
        {
          id: "sample-secondary",
          attributeId: "attr-c",
          name: "Secondary dimension",
          weight: 1,
          anchors: anchors("secondary quality"),
        },
      ],
      defenseFollowUp: false,
    },
    2,
    {
      measures: [
        { attributeId: "attr-a", share: 10 },
        { attributeId: "attr-c", share: 10 },
      ],
    },
  );
  const plan = compileAssessmentBlueprint(
    baseVacancy([textBlock, sampleBlock], weightedCategories),
  );

  assert.equal(plan.ready, true);
  assert.equal(plan.totals.normalizedAttributeWeight, 100);
  assert.equal(plan.totals.coveredCompositeWeight, 100);
  assert.equal(plan.totals.normalizedScoredBlockWeight, 100);
  assert.deepEqual(
    plan.attributes.map((candidate) => candidate.globalWeight),
    [50, 25, 25],
  );
  for (const candidate of plan.blocks) {
    assert.equal(
      Math.round(
        candidate.measures.reduce(
          (sum, measure) => sum + measure.normalizedShare,
          0,
        ) * 1_000_000,
      ) / 1_000_000,
      100,
    );
    assert.equal(
      Math.round(
        candidate.items
          .filter((item) => item.eligibleForScoring)
          .reduce((sum, item) => sum + item.normalizedWeight, 0) *
          1_000_000,
      ) / 1_000_000,
      100,
    );
  }
  const sample = plan.blocks.find(
    (candidate) => candidate.blockId === "sample-evidence",
  );
  assert.ok(sample);
  assert.deepEqual(
    sample.items
      .filter((item) => item.eligibleForScoring)
      .map((item) => item.normalizedWeight),
    [90, 10],
  );
  assert.deepEqual(
    sample.items
      .filter((item) => item.eligibleForScoring)
      .map((item) => item.attributeIds),
    [["attr-a"], ["attr-c"]],
  );
  assert.ok(
    plan.issues.some(
      (candidate) => candidate.code === "category-weights-normalized",
    ),
  );
  assert.ok(
    plan.issues.some(
      (candidate) => candidate.code === "block-measures-normalized",
    ),
  );
});

test("requiredness, minimum evidence, and focus triangulation fail closed", () => {
  const focusAttribute = attribute(
    "attr-a",
    "Critical analysis",
    100,
    true,
  );
  const optionalInterview = block(
    "optional-text",
    {
      kind: "chat_interview",
      questions: [question("only-question", "attr-a", "text")],
      minAnswerWords: 20,
      maxAnswerWords: 300,
      typingTelemetry: false,
      pastePolicy: "allow",
      followUpPolicy: 0,
      tone: "neutral",
    },
    1,
    {
      required: false,
      measures: [{ attributeId: "attr-a", share: 100 }],
    },
  );
  const vacancy = baseVacancy(
    [optionalInterview],
    [
      {
        id: "focus-category",
        name: "Focus",
        weight: 100,
        attributes: [focusAttribute],
      },
    ],
  );
  vacancy.scoring.abstainPolicy.minEvidencePerAttribute = 3;
  const plan = compileAssessmentBlueprint(vacancy);
  const focusPlan = plan.attributes[0];

  assert.equal(plan.ready, false);
  assert.ok(focusPlan);
  assert.deepEqual(focusPlan.minimumCoverage, {
    evidenceItems: 3,
    independentSources: 2,
    plannedEvidenceCapacity: 2,
    plannedIndependentSources: 1,
    plannedIndependentMethods: 1,
    satisfiedByPlan: false,
  });
  assert.equal(plan.blocks[0]?.coverage.requiredEvidenceUnits, 0);
  assert.ok(
    plan.issues.some(
      (candidate) =>
        candidate.code === "attribute-covered-only-by-optional-blocks",
    ),
  );
  assert.ok(
    plan.issues.some(
      (candidate) =>
        candidate.code === "focus-attribute-needs-triangulation",
    ),
  );
  assert.ok(
    plan.issues.some(
      (candidate) =>
        candidate.code === "planned-evidence-capacity-below-minimum",
    ),
  );
  assert.equal(focusPlan.abstention.score, null);
  assert.equal(focusPlan.abstention.excludedFromComposite, true);
  assert.equal(focusPlan.abstention.preventsRankingAndTier, true);
  assert.equal(plan.scoringPolicy.incompleteEvaluationRanked, false);
  assert.equal(plan.scoringPolicy.incompleteEvaluationGetsTier, false);
});

test("PII, appearance, emotion, and protected-trait content cannot enter scoring", () => {
  const unsafeAttribute = attribute(
    "attr-a",
    "Facial emotion and age impression",
    100,
  );
  unsafeAttribute.definition =
    "Judge appearance, eye contact, religion, and emotional state.";
  const unsafeForm = block(
    "unsafe-form",
    {
      kind: "application_form",
      fields: [
        {
          id: "religion-field",
          label: "Candidate religion",
          type: "short_text",
          required: true,
          pii: true,
          scored: true,
        },
      ],
      prefillFromCv: false,
      dedupeRule: "email_vacancy_resume",
    },
    1,
    {
      measures: [{ attributeId: "attr-a", share: 100 }],
    },
  );
  const unsafeInterview = block(
    "unsafe-interview",
    {
      kind: "async_interview",
      questions: [
        {
          ...question("unsafe-question", "attr-a", "video"),
          text: "Maintain eye contact so facial expression and mood can be rated.",
        },
      ],
      followUpPolicy: 0,
      order: "fixed",
      introVideo: "none",
      practiceQuestion: true,
      pauseAllowance: 0,
      reviewBeforeSubmit: false,
    },
    2,
    {
      measures: [{ attributeId: "attr-a", share: 100 }],
    },
  );
  const plan = compileAssessmentBlueprint(
    baseVacancy(
      [unsafeForm, unsafeInterview],
      [
        {
          id: "unsafe-category",
          name: "Unsafe",
          weight: 100,
          attributes: [unsafeAttribute],
        },
      ],
    ),
  );

  assert.equal(plan.ready, false);
  assert.ok(
    plan.issues.some(
      (candidate) => candidate.code === "pii-field-scored",
    ),
  );
  assert.ok(
    plan.issues.some((candidate) =>
      candidate.code.startsWith("prohibited-construct-"),
    ),
  );
  assert.ok(
    plan.issues.some((candidate) =>
      candidate.code.startsWith("prohibited-evidence-content-"),
    ),
  );
  const piiItem = plan.blocks
    .find((candidate) => candidate.blockId === "unsafe-form")
    ?.items.find((candidate) => candidate.sourceItemId === "religion-field");
  assert.ok(piiItem);
  assert.equal(piiItem.eligibleForScoring, false);
  assert.deepEqual(piiItem.attributeIds, []);
  assert.deepEqual(
    plan.guardrails.prohibitedSignals,
    PROHIBITED_ASSESSMENT_SIGNALS,
  );
  assert.ok(
    plan.methodPolicies.every(
      (policy) =>
        !policy.protectedTraitUseAllowed &&
        !policy.appearanceInferenceAllowed &&
        !policy.emotionInferenceAllowed,
    ),
  );
});

test("multi-criterion items fail closed until each score maps to one criterion", () => {
  const ambiguousForm = block(
    "ambiguous-form",
    {
      kind: "application_form",
      fields: [
        {
          id: "scored-field",
          label: "Explain the job decision.",
          type: "long_text",
          required: true,
          pii: false,
          scored: true,
        },
      ],
      prefillFromCv: false,
      dedupeRule: "email_vacancy_resume",
    },
    1,
  );
  const ambiguousCognitive = block(
    "ambiguous-cognitive",
    {
      kind: "cognitive",
      subtests: ["numerical"],
      itemsPerSubtest: 8,
      adaptive: false,
      totalTimeMin: 12,
      calculatorAllowed: true,
      practiceItems: 2,
    },
    2,
  );
  const ambiguousSample = block(
    "ambiguous-sample",
    {
      kind: "work_sample",
      brief: "Produce a representative job deliverable.",
      deliverables: ["rich_text"],
      timeModel: "honesty_window",
      timeBudgetHours: 1,
      aiPolicy: "disclosed",
      originalityCheck: false,
      anonymizedGrading: true,
      rubricDimensions: [
        {
          id: "ambiguous-dimension",
          name: "Overall quality",
          weight: 100,
          anchors: anchors("overall quality"),
        },
      ],
      defenseFollowUp: false,
    },
    3,
  );

  const plan = compileAssessmentBlueprint(
    baseVacancy([ambiguousForm, ambiguousCognitive, ambiguousSample]),
  );

  assert.equal(plan.ready, false);
  assert.ok(
    plan.issues.some(
      (candidate) =>
        candidate.code === "ambiguous-application-field-attribute",
    ),
  );
  assert.ok(
    plan.issues.some(
      (candidate) =>
        candidate.code === "ambiguous-cognitive-subtest-attribute",
    ),
  );
  assert.ok(
    plan.issues.some(
      (candidate) =>
        candidate.code === "ambiguous-rubric-dimension-attribute",
    ),
  );
  for (const blockPlan of plan.blocks) {
    for (const item of blockPlan.items) {
      assert.ok(
        item.attributeIds.length <= 1,
        `${item.id} must never duplicate one response across criteria`,
      );
    }
  }
});

test("published BARS and named human review govern every attribute outcome", () => {
  const interview = block(
    "bars-interview",
    {
      kind: "async_interview",
      questions: [
        question("bars-a", "attr-a", "video"),
        question("bars-b", "attr-b", "text"),
      ],
      followUpPolicy: 1,
      order: "fixed",
      introVideo: "none",
      practiceQuestion: true,
      pauseAllowance: 1,
      reviewBeforeSubmit: true,
    },
    1,
  );
  const plan = compileAssessmentBlueprint(baseVacancy([interview]));

  for (const candidate of plan.attributes) {
    assert.equal(candidate.bars.rubricVersion, 7);
    assert.equal(candidate.bars.normalization, "absolute_rubric");
    assert.equal(candidate.bars.exactPublishedAnchorRequired, true);
    assert.deepEqual(
      candidate.bars.levels.map((level) => level.score),
      [20, 40, 60, 75, 92],
    );
    assert.equal(candidate.bars.levels.length, 5);
    assert.equal(candidate.abstention.routesToHumanReview, true);
  }
  assert.equal(plan.humanReviewPolicy.finalDecisionByNamedHuman, true);
  assert.equal(
    plan.humanReviewPolicy.automatedEmploymentDecisionAllowed,
    false,
  );
  assert.equal(plan.humanReviewPolicy.independentReviews, 2);
  assert.equal(plan.humanReviewPolicy.calibrationRequired, true);
  assert.equal(plan.humanReviewPolicy.maskPiiDuringEvidenceReview, true);
  const frozenQuestionRubric = plan.blocks[0]?.items.find(
    (item) => item.sourceItemId === "bars-a",
  )?.rubric;
  assert.ok(frozenQuestionRubric);
  assert.equal(frozenQuestionRubric.version, 7);
  assert.deepEqual(frozenQuestionRubric.anchors, anchors("attr-a"));
  assert.ok(
    plan.blocks.every(
      (candidate) =>
        candidate.review.namedHumanRequired &&
        candidate.items.every((item) => item.humanReviewRequired),
    ),
  );
});

test("verification is evidence for adjudication, never an automatic performance score", () => {
  const documentBlock = block(
    "scored-documents",
    {
      kind: "doc_verification",
      requiredDocuments: [
        {
          id: "license",
          label: "Required job license",
          qualificationAttributeId: "attr-a",
        },
      ],
      acceptedFormats: ["pdf"],
      mode: "auto_extract_match",
      idCheck: false,
      placement: "post_shortlist",
    },
    1,
    {
      scored: true,
      measures: [{ attributeId: "attr-a", share: 100 }],
    },
  );
  const manualBlock = block(
    "manual-scorecard",
    {
      kind: "human_stage",
      panel: ["reviewer-a", "reviewer-b"],
      selfBooking: false,
      interviewKitAuto: false,
      independentBeforeDiscussion: true,
      aiNotetaker: false,
    },
    2,
    {
      measures: [{ attributeId: "attr-a", share: 100 }],
    },
  );
  const plan = compileAssessmentBlueprint(
    baseVacancy(
      [documentBlock, manualBlock],
      [
        {
          id: "qualification-category",
          name: "Qualification",
          weight: 100,
          attributes: [attribute("attr-a", "Licensed practice", 100)],
        },
      ],
    ),
  );
  const verificationItem = plan.blocks
    .find((candidate) => candidate.blockId === "scored-documents")
    ?.items[0];
  const manualItem = plan.blocks
    .find((candidate) => candidate.blockId === "manual-scorecard")
    ?.items[0];

  assert.ok(verificationItem);
  assert.equal(verificationItem.scoringRule, "verification_only");
  assert.equal(verificationItem.eligibleForScoring, false);
  assert.equal(
    verificationItem.scoringActor,
    "verification_with_human_adjudication",
  );
  assert.ok(manualItem);
  assert.equal(manualItem.scoringRule, "human_bars");
  assert.equal(manualItem.scoringActor, "independent_human_review");
  assert.ok(
    plan.issues.some(
      (candidate) =>
        candidate.code === "scored-block-without-scoreable-evidence" &&
        candidate.blockId === "scored-documents",
    ),
  );
});

test("coding scoring split governs frozen evidence-item weights", () => {
  const coding = block(
    "weighted-coding",
    {
      kind: "coding",
      environment: "browser_ide",
      languages: ["TypeScript"],
      taskSource: "custom",
      brief:
        "Implement a bounded work queue and explain the failure-handling decisions.",
      scoringSplit: { correctness: 60, quality: 25, approach: 15 },
      timeCapMin: 60,
      aiPolicy: "disclosed",
      similarityCheck: false,
      rubricDimensions: [
        {
          id: "correctness-core",
          attributeId: "attr-a",
          codingScoringArea: "correctness",
          name: "Core behavior",
          weight: 3,
          anchors: anchors("core behavior"),
        },
        {
          id: "correctness-edge",
          attributeId: "attr-a",
          codingScoringArea: "correctness",
          name: "Edge handling",
          weight: 1,
          anchors: anchors("edge handling"),
        },
        {
          id: "quality",
          attributeId: "attr-b",
          codingScoringArea: "quality",
          name: "Maintainability",
          weight: 100,
          anchors: anchors("maintainability"),
        },
        {
          id: "approach",
          attributeId: "attr-b",
          codingScoringArea: "approach",
          name: "Decision process",
          weight: 100,
          anchors: anchors("decision process"),
        },
      ],
    },
    1,
  );

  const plan = compileAssessmentBlueprint(baseVacancy([coding]));
  const items = plan.blocks[0]?.items;
  assert.ok(items);
  assert.equal(plan.ready, true, JSON.stringify(plan.issues));
  assert.deepEqual(
    items.map((item) => ({
      id: item.sourceItemId,
      area: item.codingScoringArea,
      weight: item.normalizedWeight,
    })),
    [
      { id: "correctness-core", area: "correctness", weight: 45 },
      { id: "correctness-edge", area: "correctness", weight: 15 },
      { id: "quality", area: "quality", weight: 25 },
      { id: "approach", area: "approach", weight: 15 },
    ],
  );
});

test("unit weighting is compiled as equal criterion weight instead of being a decorative control", () => {
  const interview = block(
    "unit-weight-interview",
    {
      kind: "async_interview",
      questions: [
        question("unit-a", "attr-a", "text"),
        question("unit-b", "attr-b", "text"),
      ],
      followUpPolicy: 1,
      order: "fixed",
      introVideo: "none",
      practiceQuestion: true,
      pauseAllowance: 1,
      reviewBeforeSubmit: true,
    },
    1,
  );
  const vacancy = baseVacancy(
    [interview],
    categories(
      attribute("attr-a", "Analysis", 90),
      attribute("attr-b", "Execution", 10),
    ),
  );
  vacancy.scoring.weighting = "unit";

  const plan = compileAssessmentBlueprint(vacancy);
  assert.deepEqual(
    plan.attributes.map((item) => item.globalWeight),
    [50, 50],
  );
  assert.deepEqual(
    effectiveWeights(vacancy).attributes.map((item) => item.pct),
    [50, 50],
  );
});

test("pareto weighting fails closed without a frozen local optimization artifact", () => {
  const interview = block(
    "pareto-interview",
    {
      kind: "async_interview",
      questions: [
        question("pareto-a", "attr-a", "text"),
        question("pareto-b", "attr-b", "text"),
      ],
      followUpPolicy: 1,
      order: "fixed",
      introVideo: "none",
      practiceQuestion: true,
      pauseAllowance: 1,
      reviewBeforeSubmit: true,
    },
    1,
  );
  const vacancy = baseVacancy([interview]);
  vacancy.scoring.weighting = "pareto_assist";

  const plan = compileAssessmentBlueprint(vacancy);
  assert.equal(plan.ready, false);
  assert.ok(
    plan.issues.some(
      (issue) =>
        issue.code === "pareto-weighting-without-calibration-data" &&
        issue.severity === "blocker",
    ),
  );
});
