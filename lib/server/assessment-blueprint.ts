import type {
  AttributeEvidenceRequirement,
  AttributeSpec,
  BlockKind,
  PipelineBlock,
  ResponseModality,
  VacancyV2,
} from "@/lib/types";

export const ASSESSMENT_BLUEPRINT_SCHEMA_VERSION =
  "evidence-assessment-blueprint-v1" as const;

export type AssessmentMethod =
  | "structured_video"
  | "structured_audio"
  | "structured_text"
  | "work_sample"
  | "case_study"
  | "portfolio"
  | "screening"
  | "situational_judgment"
  | "cognitive_test"
  | "personality_inventory"
  | "integrity_inventory"
  | "job_knowledge_test"
  | "language_assessment"
  | "coding_exercise"
  | "document_verification"
  | "reference_check"
  | "manual_review"
  | "custom_assessment";

export type EvidenceUnit =
  | "response"
  | "recording"
  | "artifact"
  | "keyed_item"
  | "validated_scale"
  | "document"
  | "reference_response"
  | "human_rating";

export type EvidenceScoringRule =
  | "unscored"
  | "keyed_gate"
  | "rational_key_then_bars"
  | "published_bars"
  | "validated_scale_then_bars"
  | "artifact_bars"
  | "verification_only"
  | "human_bars";

export type EvidenceScoringActor =
  | "none"
  | "deterministic_key"
  | "validated_instrument"
  | "model_assisted_human_review"
  | "verification_with_human_adjudication"
  | "independent_human_review";

export interface AssessmentMethodPolicy {
  method: AssessmentMethod;
  administration:
    | "standardized"
    | "standardized_with_accessible_equivalent"
    | "structured_human";
  validityRequirement:
    | "content_validity_and_sme_review"
    | "local_or_vendor_validation"
    | "job_analysis_and_structured_rubric";
  requiresJobAnalysis: true;
  requiresAccessibleEquivalent: true;
  humanReviewRequired: true;
  automatedEmploymentDecisionAllowed: false;
  protectedTraitUseAllowed: false;
  appearanceInferenceAllowed: false;
  emotionInferenceAllowed: false;
}

function methodPolicy(
  method: AssessmentMethod,
  administration: AssessmentMethodPolicy["administration"],
  validityRequirement: AssessmentMethodPolicy["validityRequirement"],
): AssessmentMethodPolicy {
  return {
    method,
    administration,
    validityRequirement,
    requiresJobAnalysis: true,
    requiresAccessibleEquivalent: true,
    humanReviewRequired: true,
    automatedEmploymentDecisionAllowed: false,
    protectedTraitUseAllowed: false,
    appearanceInferenceAllowed: false,
    emotionInferenceAllowed: false,
  };
}

export const ASSESSMENT_METHOD_POLICIES: Record<
  AssessmentMethod,
  AssessmentMethodPolicy
> = {
  structured_video: methodPolicy(
    "structured_video",
    "standardized_with_accessible_equivalent",
    "content_validity_and_sme_review",
  ),
  structured_audio: methodPolicy(
    "structured_audio",
    "standardized_with_accessible_equivalent",
    "content_validity_and_sme_review",
  ),
  structured_text: methodPolicy(
    "structured_text",
    "standardized_with_accessible_equivalent",
    "content_validity_and_sme_review",
  ),
  work_sample: methodPolicy(
    "work_sample",
    "standardized_with_accessible_equivalent",
    "job_analysis_and_structured_rubric",
  ),
  case_study: methodPolicy(
    "case_study",
    "standardized_with_accessible_equivalent",
    "job_analysis_and_structured_rubric",
  ),
  portfolio: methodPolicy(
    "portfolio",
    "standardized_with_accessible_equivalent",
    "job_analysis_and_structured_rubric",
  ),
  screening: methodPolicy(
    "screening",
    "standardized_with_accessible_equivalent",
    "content_validity_and_sme_review",
  ),
  situational_judgment: methodPolicy(
    "situational_judgment",
    "standardized_with_accessible_equivalent",
    "local_or_vendor_validation",
  ),
  cognitive_test: methodPolicy(
    "cognitive_test",
    "standardized_with_accessible_equivalent",
    "local_or_vendor_validation",
  ),
  personality_inventory: methodPolicy(
    "personality_inventory",
    "standardized_with_accessible_equivalent",
    "local_or_vendor_validation",
  ),
  integrity_inventory: methodPolicy(
    "integrity_inventory",
    "standardized_with_accessible_equivalent",
    "local_or_vendor_validation",
  ),
  job_knowledge_test: methodPolicy(
    "job_knowledge_test",
    "standardized_with_accessible_equivalent",
    "content_validity_and_sme_review",
  ),
  language_assessment: methodPolicy(
    "language_assessment",
    "standardized_with_accessible_equivalent",
    "local_or_vendor_validation",
  ),
  coding_exercise: methodPolicy(
    "coding_exercise",
    "standardized_with_accessible_equivalent",
    "job_analysis_and_structured_rubric",
  ),
  document_verification: methodPolicy(
    "document_verification",
    "standardized_with_accessible_equivalent",
    "content_validity_and_sme_review",
  ),
  reference_check: methodPolicy(
    "reference_check",
    "standardized_with_accessible_equivalent",
    "content_validity_and_sme_review",
  ),
  manual_review: methodPolicy(
    "manual_review",
    "structured_human",
    "job_analysis_and_structured_rubric",
  ),
  custom_assessment: methodPolicy(
    "custom_assessment",
    "standardized_with_accessible_equivalent",
    "job_analysis_and_structured_rubric",
  ),
};

export const ASSESSMENT_METHODS_BY_BLOCK_KIND = {
  application_form: ["screening"],
  knockout: ["screening"],
  cv_intake: ["screening", "portfolio"],
  async_interview: [
    "structured_video",
    "structured_audio",
    "structured_text",
  ],
  live_ai_interview: [
    "structured_video",
    "structured_audio",
    "structured_text",
  ],
  chat_interview: ["structured_text"],
  sjt: ["situational_judgment"],
  cognitive: ["cognitive_test"],
  personality: ["personality_inventory"],
  integrity_test: ["integrity_inventory"],
  job_knowledge: ["job_knowledge_test"],
  language_test: ["language_assessment"],
  work_sample: ["work_sample"],
  coding: ["coding_exercise"],
  case_exercise: ["case_study"],
  doc_verification: ["document_verification"],
  reference_check: ["reference_check"],
  human_stage: ["manual_review"],
  custom: ["custom_assessment"],
} as const satisfies Record<BlockKind, readonly AssessmentMethod[]>;

export const PROHIBITED_ASSESSMENT_SIGNALS = [
  "protected traits or proxies",
  "facial features or physical appearance",
  "facial-expression or emotion inference",
  "eye contact, gaze direction, or alleged reading behavior",
  "accent, voice identity, or speech style unrelated to a stated language criterion",
  "camera background, clothing, lighting, or device quality",
  "health, disability, pregnancy, family status, religion, race, ethnicity, gender, sexual orientation, or age",
] as const;

export interface AssessmentBlueprintIssue {
  severity: "blocker" | "review";
  code: string;
  message: string;
  blockId?: string;
  attributeId?: string;
}

export interface EvidenceItemPlan {
  id: string;
  sourceItemId: string;
  blockId: string;
  method: AssessmentMethod;
  unit: EvidenceUnit;
  attributeIds: string[];
  required: boolean;
  conditional: boolean;
  eligibleForScoring: boolean;
  scoringRule: EvidenceScoringRule;
  scoringActor: EvidenceScoringActor;
  /**
   * Present for newly published coding rubric items. Together with the
   * vacancy's frozen scoringSplit this makes the cross-area weighting
   * auditable instead of leaving the control as inert metadata.
   */
  codingScoringArea?: "correctness" | "quality" | "approach";
  normalizedWeight: number;
  rubric?: {
    id: string;
    version: number;
    anchorCount: 5;
    anchors: [string, string, string, string, string];
  };
  validationEvidenceLevel?: "meta-analytic" | "vendor-validated" | "experimental";
  humanReviewRequired: true;
}

export interface BlockMeasurePlan {
  attributeId: string;
  normalizedShare: number;
  compositeWeight: number;
}

export interface BlockEvidencePlan {
  blockId: string;
  blockKind: BlockKind;
  order: number;
  requiredForCompletion: boolean;
  scored: boolean;
  methods: AssessmentMethod[];
  measures: BlockMeasurePlan[];
  items: EvidenceItemPlan[];
  coverage: {
    requiredEvidenceUnits: number;
    plannedEvidenceCapacity: number;
    scorableEvidenceCapacity: number;
    measuredAttributeCount: number;
  };
  gate: {
    enabled: boolean;
    minimumBlockScore: number | null;
    mustHaveIds: string[];
    failureRequiresHumanReview: true;
  };
  review: {
    namedHumanRequired: true;
    independentBeforeDiscussion: boolean;
    minimumIndependentReviews: number;
    blindReviewRequired: boolean;
  };
  compositeWeight: number;
  evidenceRole: "primary" | "corroborating" | "verification" | "context";
  assessorInstructions: string | null;
  validation: {
    strategy: "content" | "criterion" | "construct" | "transport";
    status: "draft" | "sme_reviewed" | "pilot" | "locally_validated";
    scoreUse: "context_only" | "decision_support" | "selection";
    evidenceRefs: string[];
  };
}

export interface AttributeEvidencePlan {
  attributeId: string;
  attributeName: string;
  attributeKind: AttributeSpec["kind"];
  categoryId: string;
  normalizedCategoryWeight: number;
  normalizedWeightWithinCategory: number;
  globalWeight: number;
  focus: boolean;
  priority: AttributeEvidenceRequirement["priority"];
  targetLevel: AttributeEvidenceRequirement["targetLevel"];
  allowedVerificationMethods: AttributeEvidenceRequirement["methods"];
  requiredForCompleteEvaluation: boolean;
  plannedBlockIds: string[];
  plannedMethods: AssessmentMethod[];
  plannedEvidenceItemIds: string[];
  minimumCoverage: {
    evidenceItems: number;
    independentSources: number;
    plannedEvidenceCapacity: number;
    plannedIndependentSources: number;
    plannedIndependentMethods: number;
    satisfiedByPlan: boolean;
  };
  bars: {
    rubricVersion: number;
    normalization: "absolute_rubric";
    exactPublishedAnchorRequired: true;
    levels: {
      level: 1 | 2 | 3 | 4 | 5;
      score: 20 | 40 | 60 | 75 | 92;
      anchor: string;
    }[];
  };
  abstention: {
    reasons: (
      | "missing"
      | "insufficient"
      | "contradictory"
      | "off_topic"
      | "unverifiable"
    )[];
    score: null;
    excludedFromComposite: true;
    preventsRankingAndTier: true;
    routesToHumanReview: true;
  };
}

export interface AssessmentBlueprint {
  schemaVersion: typeof ASSESSMENT_BLUEPRINT_SCHEMA_VERSION;
  vacancyId: string;
  vacancyVersion: number;
  ready: boolean;
  blocks: BlockEvidencePlan[];
  attributes: AttributeEvidencePlan[];
  methodPolicies: AssessmentMethodPolicy[];
  scoringPolicy: {
    normalization: "absolute_rubric";
    compositeRule: "renormalize_scored_evidence_only_when_complete";
    minimumEvidencePerAttribute: number;
    incompleteEvaluationRanked: false;
    incompleteEvaluationGetsTier: false;
    abstentionScore: null;
    thresholdComparisonRequiresCompleteEvidence: true;
    aggregation:
      | "evidence_weighted_mean"
      | "conservative_floor"
      | "highest_quality_source";
    contradictoryEvidence: "flag_human" | "use_lower_confidence";
    optionalBlocks: "exclude_if_missing" | "include_when_completed";
    minimumCoveragePct: number;
  };
  humanReviewPolicy: {
    finalDecisionByNamedHuman: true;
    automatedEmploymentDecisionAllowed: false;
    independentReviews: number;
    calibrationRequired: boolean;
    maskPiiDuringEvidenceReview: boolean;
    reviewTriggers: string[];
  };
  guardrails: {
    jobRelatedEvidenceOnly: true;
    candidateContentIsDataNotInstruction: true;
    equivalentAccessibilityDoesNotReduceScore: true;
    prohibitedSignals: readonly string[];
  };
  totals: {
    normalizedAttributeWeight: number;
    coveredCompositeWeight: number;
    normalizedScoredBlockWeight: number;
    requiredBlocks: number;
    scoredBlocks: number;
  };
  issues: AssessmentBlueprintIssue[];
}

interface AttributeDraft {
  spec: AttributeSpec;
  categoryId: string;
  categoryWeight: number;
  attributeWeight: number;
  globalWeight: number;
}

interface EvidenceItemDraft
  extends Omit<EvidenceItemPlan, "normalizedWeight" | "humanReviewRequired"> {
  rawWeight: number;
}

const SCORE_BY_LEVEL = [20, 40, 60, 75, 92] as const;
const STRUCTURED_INTERVIEW_METHODS = new Set<AssessmentMethod>([
  "structured_video",
  "structured_audio",
  "structured_text",
]);

const PROHIBITED_CONSTRUCT_PATTERNS = [
  {
    code: "appearance",
    pattern:
      /\b(appearance|attractiveness|facial features?|face shape|clothing|body language|eye contact|gaze direction|smil(?:e|ing))\b/i,
  },
  {
    code: "emotion",
    pattern:
      /\b(emotion(?:al)?(?: recognition| state| expression)?|facial expression|mood detection|sentiment of (?:the )?candidate)\b/i,
  },
  {
    code: "protected-trait",
    pattern:
      /\b(race|ethnicity|gender|sex|religion|pregnan(?:cy|t)|marital status|family status|sexual orientation|nationality|disability|mental health|medical condition|age)\b/i,
  },
  {
    code: "behavioral-surveillance",
    pattern:
      /\b(reading behavior|reading pattern|off-screen reading|camera background|device quality|lighting quality)\b/i,
  },
  {
    code: "accent",
    pattern: /\b(accent|voice identity|voiceprint)\b/i,
  },
] as const;

function round6(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function safeWeight(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeWeights(values: number[]): number[] {
  if (values.length === 0) return [];
  const cleaned = values.map(safeWeight);
  const total = cleaned.reduce((sum, value) => sum + value, 0);
  const basis =
    total > 0 ? cleaned : cleaned.map(() => 1);
  const basisTotal = basis.reduce((sum, value) => sum + value, 0);
  const normalized = basis.map((value) =>
    round6((value / basisTotal) * 100),
  );
  const difference = round6(
    100 - normalized.reduce((sum, value) => sum + value, 0),
  );
  const adjustmentIndex = basis.reduce(
    (best, value, index) => (value > basis[best]! ? index : best),
    0,
  );
  normalized[adjustmentIndex] = round6(
    normalized[adjustmentIndex]! + difference,
  );
  return normalized;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function modalityMethod(modality: ResponseModality): AssessmentMethod {
  if (modality === "video") return "structured_video";
  if (modality === "audio") return "structured_audio";
  return "structured_text";
}

function verificationMethodForAssessment(
  method: AssessmentMethod,
): AttributeEvidenceRequirement["methods"][number] {
  if (
    method === "structured_video" ||
    method === "structured_audio" ||
    method === "structured_text"
  ) {
    return "interview";
  }
  if (
    method === "work_sample" ||
    method === "case_study" ||
    method === "portfolio" ||
    method === "coding_exercise" ||
    method === "custom_assessment"
  ) {
    return "work_sample";
  }
  if (method === "document_verification") return "document";
  if (method === "reference_check") return "reference";
  if (method === "manual_review") return "human_observation";
  if (method === "screening") return "self_report";
  return "test";
}

function issueKey(issue: AssessmentBlueprintIssue): string {
  return [
    issue.severity,
    issue.code,
    issue.blockId ?? "",
    issue.attributeId ?? "",
  ].join(":");
}

function addIssue(
  issues: AssessmentBlueprintIssue[],
  seen: Set<string>,
  issue: AssessmentBlueprintIssue,
): void {
  const key = issueKey(issue);
  if (seen.has(key)) return;
  seen.add(key);
  issues.push(issue);
}

function itemId(
  blockId: string,
  method: AssessmentMethod,
  sourceItemId: string,
): string {
  return `${blockId}:${method}:${sourceItemId}`;
}

function collectProtectedConstructIssues(
  vacancy: VacancyV2,
  issues: AssessmentBlueprintIssue[],
  seen: Set<string>,
): void {
  for (const category of vacancy.categories) {
    for (const attribute of category.attributes) {
      const construct = [
        attribute.name,
        attribute.definition,
        attribute.rationale ?? "",
      ].join(" ").replace(/[_-]+/g, " ");
      for (const prohibited of PROHIBITED_CONSTRUCT_PATTERNS) {
        if (!prohibited.pattern.test(construct)) continue;
        addIssue(issues, seen, {
          severity: "blocker",
          code: `prohibited-construct-${prohibited.code}`,
          attributeId: attribute.id,
          message:
            `Attribute "${attribute.name}" relies on a prohibited or non-job-related signal. ` +
            "Remove protected-trait, appearance, emotion, gaze, accent, or surveillance constructs before collecting evidence.",
        });
      }
    }
  }

  for (const block of vacancy.pipeline) {
    const content = assessmentContentForBlock(block)
      .join(" ")
      .replace(/[_-]+/g, " ");
    for (const prohibited of PROHIBITED_CONSTRUCT_PATTERNS) {
      if (!prohibited.pattern.test(content)) continue;
      addIssue(issues, seen, {
        severity: "blocker",
        code: `prohibited-evidence-content-${prohibited.code}`,
        blockId: block.id,
        message:
          `Block "${block.title}" asks for a prohibited or non-job-related signal. ` +
          "Assessment content must not use protected traits, appearance, emotion, gaze, accent, or surveillance behavior.",
      });
    }
  }
}

function assessmentContentForBlock(block: PipelineBlock): string[] {
  const settings = block.settings;
  switch (settings.kind) {
    case "application_form":
      return settings.fields.map((field) => field.label);
    case "knockout":
      return settings.items.flatMap((item) => [
        item.question,
        ...((item.options ?? []).map((option) => option.text)),
      ]);
    case "cv_intake":
      return [];
    case "async_interview":
    case "live_ai_interview":
    case "chat_interview":
      return settings.questions.flatMap((question) => [
        question.text,
        question.clarification ?? "",
        question.situationalFallback ?? "",
        ...question.probes,
      ]);
    case "sjt":
      return settings.items.flatMap((item) => [
        item.scenario,
        ...item.options.map((option) => option.text),
      ]);
    case "cognitive":
      return settings.subtests;
    case "personality":
      return settings.traitMappings.map((mapping) => mapping.traitId);
    case "integrity_test":
      return settings.domains;
    case "job_knowledge":
      return settings.items.flatMap((item) => [
        item.prompt,
        item.modelAnswer ?? "",
        ...(item.keyPoints ?? []),
        ...((item.options ?? []).map((option) => option.text)),
      ]);
    case "language_test":
      return [settings.language];
    case "work_sample":
      return [
        settings.brief,
        ...settings.rubricDimensions.flatMap((dimension) => [
          dimension.name,
          ...dimension.anchors,
        ]),
      ];
    case "coding":
      return [
        settings.brief,
        ...settings.rubricDimensions.flatMap((dimension) => [
          dimension.name,
          ...dimension.anchors,
        ]),
      ];
    case "case_exercise":
      return [
        settings.materials,
        settings.personaScript ?? "",
        ...settings.rubricDimensions.flatMap((dimension) => [
          dimension.name,
          ...dimension.anchors,
        ]),
      ];
    case "doc_verification":
      return settings.requiredDocuments.map((document) => document.label);
    case "reference_check":
      return settings.questionnaire.map((question) => question.text);
    case "human_stage":
      return [];
    case "custom":
      return [
        settings.instructions,
        ...settings.rubricDimensions.flatMap((dimension) => [
          dimension.name,
          ...dimension.anchors,
        ]),
      ];
  }
}

function buildAttributes(
  vacancy: VacancyV2,
  issues: AssessmentBlueprintIssue[],
  seenIssues: Set<string>,
): AttributeDraft[] {
  const categoryWeights = normalizeWeights(
    vacancy.categories.map((category) => category.weight),
  );
  const attributeDrafts: AttributeDraft[] = [];
  const seenAttributeIds = new Set<string>();
  const seenCategoryIds = new Set<string>();

  if (vacancy.categories.length === 0) {
    addIssue(issues, seenIssues, {
      severity: "blocker",
      code: "no-assessment-criteria",
      message:
        "The vacancy has no job-related criteria from which to compile an evidence plan.",
    });
  }

  if (
    vacancy.categories.length > 0 &&
    Math.abs(
      vacancy.categories.reduce(
        (sum, category) => sum + safeWeight(category.weight),
        0,
      ) - 100
    ) > 0.000001
  ) {
    addIssue(issues, seenIssues, {
      severity: "review",
      code: "category-weights-normalized",
      message:
        "Category weights did not sum to 100 and were normalized deterministically in the evidence blueprint.",
    });
  }

  vacancy.categories.forEach((category, categoryIndex) => {
    if (seenCategoryIds.has(category.id)) {
      addIssue(issues, seenIssues, {
        severity: "blocker",
        code: "duplicate-category-id",
        message:
          `Category ID "${category.id}" is duplicated; weights and evidence bindings are ambiguous.`,
      });
    }
    seenCategoryIds.add(category.id);
    const attributeWeights = normalizeWeights(
      category.attributes.map((attribute) => attribute.weight),
    );
    if (category.attributes.length === 0) {
      addIssue(issues, seenIssues, {
        severity: "blocker",
        code: "empty-category",
        message: `Category "${category.name}" has no attributes.`,
      });
    } else if (
      Math.abs(
        category.attributes.reduce(
          (sum, attribute) => sum + safeWeight(attribute.weight),
          0,
        ) - 100
      ) > 0.000001
    ) {
      addIssue(issues, seenIssues, {
        severity: "review",
        code: "attribute-weights-normalized",
        message:
          `Attribute weights in category "${category.name}" did not sum to 100 and were normalized deterministically.`,
      });
    }

    category.attributes.forEach((attribute, attributeIndex) => {
      if (seenAttributeIds.has(attribute.id)) {
        addIssue(issues, seenIssues, {
          severity: "blocker",
          code: "duplicate-attribute-id",
          attributeId: attribute.id,
          message: `Attribute ID "${attribute.id}" is duplicated; evidence cannot be bound unambiguously.`,
        });
        return;
      }
      seenAttributeIds.add(attribute.id);
      const categoryWeight = categoryWeights[categoryIndex] ?? 0;
      const attributeWeight = attributeWeights[attributeIndex] ?? 0;
      attributeDrafts.push({
        spec: attribute,
        categoryId: category.id,
        categoryWeight,
        attributeWeight,
        globalWeight: (categoryWeight * attributeWeight) / 100,
      });
    });
  });

  if (vacancy.scoring.weighting === "pareto_assist") {
    addIssue(issues, seenIssues, {
      severity: "blocker",
      code: "pareto-weighting-without-calibration-data",
      message:
        "Pareto-assisted weighting requires a versioned local outcome dataset, fairness constraints and a frozen optimization result. This vacancy has no such artifact; choose configured or unit weighting.",
    });
  }
  const finalGlobalWeights = normalizeWeights(
    vacancy.scoring.weighting === "unit"
      ? attributeDrafts.map(() => 1)
      : attributeDrafts.map((attribute) => attribute.globalWeight),
  );
  return attributeDrafts.map((attribute, index) => ({
    ...attribute,
    globalWeight: finalGlobalWeights[index] ?? 0,
  }));
}

function mappedAttributeIds(
  block: PipelineBlock,
  validAttributeIds: Set<string>,
  issues: AssessmentBlueprintIssue[],
  seenIssues: Set<string>,
): { attributeId: string; rawShare: number }[] {
  const shares = new Map<string, number>();
  for (const measure of block.measures) {
    if (!validAttributeIds.has(measure.attributeId)) {
      addIssue(issues, seenIssues, {
        severity: "blocker",
        code: "unknown-measured-attribute",
        blockId: block.id,
        attributeId: measure.attributeId,
        message:
          `Block "${block.title}" measures unknown attribute "${measure.attributeId}".`,
      });
      continue;
    }
    if (shares.has(measure.attributeId)) {
      addIssue(issues, seenIssues, {
        severity: "review",
        code: "duplicate-block-measure",
        blockId: block.id,
        attributeId: measure.attributeId,
        message:
          `Duplicate measures for "${measure.attributeId}" were combined before normalization.`,
      });
    }
    shares.set(
      measure.attributeId,
      (shares.get(measure.attributeId) ?? 0) + safeWeight(measure.share),
    );
  }
  return [...shares].map(([attributeId, rawShare]) => ({
    attributeId,
    rawShare,
  }));
}

function evidenceItem(
  block: PipelineBlock,
  sourceItemId: string,
  method: AssessmentMethod,
  unit: EvidenceUnit,
  attributeIds: string[],
  scoringRule: EvidenceScoringRule,
  scoringActor: EvidenceScoringActor,
  options: {
    required?: boolean;
    conditional?: boolean;
    rawWeight?: number;
    rubric?: EvidenceItemPlan["rubric"];
    codingScoringArea?: EvidenceItemPlan["codingScoringArea"];
    validationEvidenceLevel?: EvidenceItemPlan["validationEvidenceLevel"];
  } = {},
): EvidenceItemDraft {
  const eligibleForScoring =
    block.scored &&
    scoringRule !== "unscored" &&
    scoringRule !== "verification_only";
  return {
    id: itemId(block.id, method, sourceItemId),
    sourceItemId,
    blockId: block.id,
    method,
    unit,
    attributeIds: unique(attributeIds),
    required: Boolean(block.required && (options.required ?? true)),
    conditional: options.conditional ?? false,
    eligibleForScoring,
    scoringRule,
    scoringActor,
    rawWeight: options.rawWeight ?? 1,
    rubric: options.rubric,
    codingScoringArea: options.codingScoringArea,
    validationEvidenceLevel: options.validationEvidenceLevel,
  };
}

function directAttributeIds(
  block: PipelineBlock,
  candidateIds: (string | undefined)[],
  validAttributeIds: Set<string>,
  measuredAttributeIds: Set<string>,
  issues: AssessmentBlueprintIssue[],
  seenIssues: Set<string>,
): string[] {
  const result: string[] = [];
  for (const candidateId of unique(candidateIds.filter(Boolean) as string[])) {
    if (!validAttributeIds.has(candidateId)) {
      addIssue(issues, seenIssues, {
        severity: "blocker",
        code: "item-unknown-attribute",
        blockId: block.id,
        attributeId: candidateId,
        message:
          `An evidence item in "${block.title}" references unknown attribute "${candidateId}".`,
      });
      continue;
    }
    if (!measuredAttributeIds.has(candidateId)) {
      addIssue(issues, seenIssues, {
        severity: "blocker",
        code: "item-not-in-block-measures",
        blockId: block.id,
        attributeId: candidateId,
        message:
          `An evidence item in "${block.title}" is bound to "${candidateId}", but the frozen block measures do not include it.`,
      });
      continue;
    }
    result.push(candidateId);
  }
  return result;
}

function collectBlockItems(
  block: PipelineBlock,
  blockAttributeIds: string[],
  validAttributeIds: Set<string>,
  rubricVersion: number,
  issues: AssessmentBlueprintIssue[],
  seenIssues: Set<string>,
): EvidenceItemDraft[] {
  const settings = block.settings;
  const measuredAttributeIds = new Set(blockAttributeIds);
  const items: EvidenceItemDraft[] = [];
  const direct = (...candidateIds: (string | undefined)[]) =>
    directAttributeIds(
      block,
      candidateIds,
      validAttributeIds,
      measuredAttributeIds,
      issues,
      seenIssues,
    );
  const exactlyOneAttribute = (
    itemLabel: string,
    candidateIds: (string | undefined)[],
    issueCode: string,
  ): string[] => {
    const explicitIds = unique(candidateIds.filter(Boolean) as string[]);
    if (explicitIds.length === 1) {
      return direct(explicitIds[0]);
    }
    if (explicitIds.length === 0 && blockAttributeIds.length === 1) {
      return [blockAttributeIds[0]];
    }
    addIssue(issues, seenIssues, {
      severity: "blocker",
      code: issueCode,
      blockId: block.id,
      message:
        `"${itemLabel}" in "${block.title}" must be bound to exactly one criterion. ` +
        "One response or scale cannot be copied across several constructs.",
    });
    return [];
  };
  const dimensionAttributes = (dimension: {
    id: string;
    name: string;
    attributeId?: string;
  }): string[] => {
    return exactlyOneAttribute(
      `Rubric dimension ${dimension.name}`,
      [dimension.attributeId],
      "ambiguous-rubric-dimension-attribute",
    );
  };

  if (block.kind !== settings.kind) {
    addIssue(issues, seenIssues, {
      severity: "blocker",
      code: "block-kind-settings-mismatch",
      blockId: block.id,
      message:
        `Block "${block.title}" declares kind "${block.kind}" but contains "${settings.kind}" settings.`,
    });
  }

  switch (settings.kind) {
    case "application_form":
      for (const field of settings.fields) {
        const prohibitedScoring = field.pii && field.scored;
        const optionPoints = (field.options ?? []).map(
          (option) => option.points,
        );
        const hasRationalKey =
          ["single_choice", "multi_choice", "dropdown"].includes(field.type) &&
          optionPoints.length >= 2 &&
          optionPoints.every(
            (points): points is number =>
              typeof points === "number" && Number.isFinite(points),
          ) &&
          new Set(optionPoints).size >= 2;
        const attributeIds =
          field.scored && !prohibitedScoring
            ? exactlyOneAttribute(
                `Application field ${field.label}`,
                [field.attributeId],
                "ambiguous-application-field-attribute",
              )
            : [];
        if (prohibitedScoring) {
          addIssue(issues, seenIssues, {
            severity: "blocker",
            code: "pii-field-scored",
            blockId: block.id,
            message:
              `PII field "${field.id}" is marked scored. PII must be masked and excluded from assessment evidence.`,
          });
        }
        if (field.scored && !block.scored) {
          addIssue(issues, seenIssues, {
            severity: "blocker",
            code: "scored-field-in-context-block",
            blockId: block.id,
            message:
              `Application field "${field.label}" is marked scored while its block is context-only. ` +
              "Enable block scoring or keep the field unscored.",
          });
        }
        if (field.scored && !prohibitedScoring && !hasRationalKey) {
          addIssue(issues, seenIssues, {
            severity: "blocker",
            code: "application-field-missing-rational-key",
            blockId: block.id,
            message:
              `Scored application field "${field.label}" needs at least two choice options with explicit, non-identical rational-biodata points. ` +
              "Free text and unkeyed answers remain context only.",
          });
        }
        items.push(
          evidenceItem(
            block,
            field.id,
            "screening",
            "response",
            attributeIds,
            field.scored && !prohibitedScoring
              ? "rational_key_then_bars"
              : "unscored",
            field.scored && !prohibitedScoring
              ? "deterministic_key"
              : "none",
            {
              required: field.required,
              rawWeight: field.scored ? 1 : 0,
            },
          ),
        );
      }
      break;

    case "knockout":
      for (const item of settings.items) {
        items.push(
          evidenceItem(
            block,
            item.id,
            "screening",
            "keyed_item",
            blockAttributeIds,
            "keyed_gate",
            "deterministic_key",
          ),
        );
      }
      break;

    case "cv_intake":
      items.push(
        evidenceItem(
          block,
          "parsed-job-claims",
          "screening",
          "document",
          blockAttributeIds,
          "verification_only",
          "verification_with_human_adjudication",
        ),
      );
      if (block.scored && !settings.anonymizeForReview) {
        addIssue(issues, seenIssues, {
          severity: "blocker",
          code: "scored-cv-not-anonymized",
          blockId: block.id,
          message:
            "A scored CV source must be anonymized before review so identity and demographic proxies cannot enter scoring.",
        });
      }
      if (settings.portfolioUrlField) {
        items.push(
          evidenceItem(
            block,
            "portfolio",
            "portfolio",
            "artifact",
            blockAttributeIds,
            "artifact_bars",
            "independent_human_review",
          ),
        );
      }
      break;

    case "async_interview":
    case "live_ai_interview":
    case "chat_interview":
      for (const question of settings.questions) {
        const method =
          settings.kind === "chat_interview"
            ? "structured_text"
            : modalityMethod(question.modality);
        const attributeIds = direct(question.attributeId);
        if (question.secondaryAttributeId) {
          direct(question.secondaryAttributeId);
          addIssue(issues, seenIssues, {
            severity: "review",
            code: "secondary-interview-attribute-context-only",
            blockId: block.id,
            attributeId: question.secondaryAttributeId,
            message:
              `Question "${question.id}" may surface context about a secondary criterion, but only its primary criterion is scored against the published rubric. ` +
              "Add a separately anchored question to score the secondary criterion.",
          });
        }
        if (question.rubric.attributeId !== question.attributeId) {
          addIssue(issues, seenIssues, {
            severity: "blocker",
            code: "interview-rubric-binding-mismatch",
            blockId: block.id,
            attributeId: question.attributeId,
            message:
              `Question "${question.id}" and rubric "${question.rubric.id}" bind different attributes.`,
          });
        }
        items.push(
          evidenceItem(
            block,
            question.id,
            method,
            method === "structured_text" ? "response" : "recording",
            attributeIds,
            "published_bars",
            "model_assisted_human_review",
            {
              rubric: {
                id: question.rubric.id,
                version: question.rubric.version,
                anchorCount: 5,
                anchors: question.rubric.anchors,
              },
            },
          ),
        );
        question.probes.forEach((_, probeIndex) => {
          items.push(
            evidenceItem(
              block,
              `${question.id}:probe:${probeIndex + 1}`,
              method,
              method === "structured_text" ? "response" : "recording",
              attributeIds,
              "published_bars",
              "model_assisted_human_review",
              {
                required: false,
                conditional: true,
                rawWeight: 0,
                rubric: {
                  id: question.rubric.id,
                  version: question.rubric.version,
                  anchorCount: 5,
                  anchors: question.rubric.anchors,
                },
              },
            ),
          );
        });
      }
      break;

    case "sjt": {
      const deterministicSjt =
        !settings.pilotMode &&
        settings.items.length > 0 &&
        settings.items.every(
          (item) =>
            item.smeReviewed &&
            item.options.length >= 2 &&
            item.options.every((option) => Number.isFinite(option.keyScore)),
        );
      for (const item of settings.items) {
        items.push(
          evidenceItem(
            block,
            item.id,
            "situational_judgment",
            "keyed_item",
            direct(item.attributeId),
            deterministicSjt
              ? "validated_scale_then_bars"
              : "unscored",
            "deterministic_key",
          ),
        );
        if (block.scored && !item.smeReviewed) {
          addIssue(issues, seenIssues, {
            severity: "blocker",
            code: "unreviewed-sjt-item",
            blockId: block.id,
            attributeId: item.attributeId,
            message:
              `SJT item "${item.id}" is not SME-reviewed and cannot produce scoreable evidence.`,
          });
        }
      }
      break;
    }

    case "cognitive":
      for (const subtest of settings.subtests) {
        const mappings = (settings.criterionMappings ?? [])
          .filter((mapping) => mapping.unit === subtest)
          .map((mapping) => mapping.attributeId);
        items.push(
          evidenceItem(
            block,
            subtest,
            "cognitive_test",
            "validated_scale",
            exactlyOneAttribute(
              `Cognitive subtest ${subtest}`,
              mappings,
              "ambiguous-cognitive-subtest-attribute",
            ),
            "validated_scale_then_bars",
            "validated_instrument",
          ),
        );
      }
      break;

    case "personality":
      for (const mapping of settings.traitMappings) {
        items.push(
          evidenceItem(
            block,
            mapping.traitId,
            "personality_inventory",
            "validated_scale",
            direct(mapping.attributeId),
            "validated_scale_then_bars",
            "validated_instrument",
            { validationEvidenceLevel: mapping.evidenceLevel },
          ),
        );
      }
      break;

    case "integrity_test":
      for (const domain of settings.domains) {
        const mappings = (settings.criterionMappings ?? [])
          .filter((mapping) => mapping.unit === domain)
          .map((mapping) => mapping.attributeId);
        items.push(
          evidenceItem(
            block,
            domain,
            "integrity_inventory",
            "validated_scale",
            exactlyOneAttribute(
              `Integrity domain ${domain}`,
              mappings,
              "ambiguous-integrity-domain-attribute",
            ),
            "validated_scale_then_bars",
            "validated_instrument",
          ),
        );
      }
      break;

    case "job_knowledge":
      for (const item of settings.items) {
        const modelAssisted =
          item.type === "short_answer" ||
          item.type === "true_false_justify";
        items.push(
          evidenceItem(
            block,
            item.id,
            "job_knowledge_test",
            modelAssisted ? "response" : "keyed_item",
            direct(item.attributeId),
            "validated_scale_then_bars",
            modelAssisted
              ? "model_assisted_human_review"
              : "deterministic_key",
          ),
        );
      }
      break;

    case "language_test":
      for (const skill of settings.skills) {
        const mappings = (settings.criterionMappings ?? [])
          .filter((mapping) => mapping.unit === skill)
          .map((mapping) => mapping.attributeId);
        items.push(
          evidenceItem(
            block,
            skill,
            "language_assessment",
            "validated_scale",
            exactlyOneAttribute(
              `Language skill ${skill}`,
              mappings,
              "ambiguous-language-skill-attribute",
            ),
            "validated_scale_then_bars",
            "validated_instrument",
          ),
        );
      }
      break;

    case "work_sample":
      settings.deliverables.forEach((deliverable, index) => {
        items.push(
          evidenceItem(
            block,
            `deliverable:${index + 1}:${deliverable}`,
            "work_sample",
            "artifact",
            [],
            "unscored",
            "none",
            { rawWeight: 0 },
          ),
        );
      });
      for (const dimension of settings.rubricDimensions) {
        items.push(
          evidenceItem(
            block,
            dimension.id,
            "work_sample",
            "human_rating",
            dimensionAttributes(dimension),
            "artifact_bars",
            "independent_human_review",
            {
              rawWeight: dimension.weight,
              rubric: {
                id: dimension.id,
                version: rubricVersion,
                anchorCount: 5,
                anchors: dimension.anchors,
              },
            },
          ),
        );
      }
      break;

    case "coding":
      {
        const areas = ["correctness", "quality", "approach"] as const;
        const splitTotal = areas.reduce(
          (sum, area) => sum + safeWeight(settings.scoringSplit[area]),
          0,
        );
        const executableSplit =
          Math.abs(splitTotal - 100) <= 0.000001 &&
          settings.rubricDimensions.every(
            (dimension) => dimension.codingScoringArea,
          ) &&
          areas.every(
            (area) =>
              safeWeight(settings.scoringSplit[area]) === 0 ||
              settings.rubricDimensions.some(
                (dimension) => dimension.codingScoringArea === area,
              ),
          );
        if (!executableSplit) {
          addIssue(issues, seenIssues, {
            severity: "review",
            code: "coding-scoring-split-legacy-fallback",
            blockId: block.id,
            message:
              `Coding block "${block.title}" has no complete executable area mapping. Legacy dimension weights were preserved; republishing requires an explicit correctness, quality, and approach mapping.`,
          });
        }
        const areaWeightByDimensionId = new Map<string, number>();
        if (executableSplit) {
          for (const area of areas) {
            const dimensions = settings.rubricDimensions.filter(
              (dimension) => dimension.codingScoringArea === area,
            );
            const normalizedWithinArea = normalizeWeights(
              dimensions.map((dimension) => dimension.weight),
            );
            dimensions.forEach((dimension, index) => {
              areaWeightByDimensionId.set(
                dimension.id,
                (safeWeight(settings.scoringSplit[area]) *
                  (normalizedWithinArea[index] ?? 0)) /
                  100,
              );
            });
          }
        }
        for (const dimension of settings.rubricDimensions) {
          items.push(
            evidenceItem(
              block,
              dimension.id,
              "coding_exercise",
              "human_rating",
              dimensionAttributes(dimension),
              "artifact_bars",
              "independent_human_review",
              {
                rawWeight: executableSplit
                  ? (areaWeightByDimensionId.get(dimension.id) ?? 0)
                  : dimension.weight,
                codingScoringArea: executableSplit
                  ? dimension.codingScoringArea
                  : undefined,
                rubric: {
                  id: dimension.id,
                  version: rubricVersion,
                  anchorCount: 5,
                  anchors: dimension.anchors,
                },
              },
            ),
          );
        }
      }
      break;

    case "case_exercise":
      for (const dimension of settings.rubricDimensions) {
        items.push(
          evidenceItem(
            block,
            dimension.id,
            "case_study",
            "human_rating",
            dimensionAttributes(dimension),
            "artifact_bars",
            "independent_human_review",
            {
              rawWeight: dimension.weight,
              rubric: {
                id: dimension.id,
                version: rubricVersion,
                anchorCount: 5,
                anchors: dimension.anchors,
              },
            },
          ),
        );
      }
      break;

    case "doc_verification":
      for (const document of settings.requiredDocuments) {
        items.push(
          evidenceItem(
            block,
            document.id,
            "document_verification",
            "document",
            document.qualificationAttributeId
              ? direct(document.qualificationAttributeId)
              : blockAttributeIds,
            "verification_only",
            "verification_with_human_adjudication",
          ),
        );
      }
      break;

    case "reference_check":
      for (const question of settings.questionnaire) {
        const scored = Boolean(question.attributeId);
        items.push(
          evidenceItem(
            block,
            question.id,
            "reference_check",
            "reference_response",
            question.attributeId ? direct(question.attributeId) : [],
            scored ? "human_bars" : "unscored",
            scored ? "independent_human_review" : "none",
            { rawWeight: scored ? 1 : 0 },
          ),
        );
      }
      break;

    case "human_stage":
      if (
        settings.selfBooking &&
        (!settings.bookingUrl ||
          !settings.bookingUrl.startsWith("https://"))
      ) {
        addIssue(issues, seenIssues, {
          severity: "blocker",
          code: "human-stage-booking-url-missing",
          blockId: block.id,
          message:
            `Human stage "${block.title}" enables self-booking without an HTTPS scheduling URL.`,
        });
      }
      if (settings.aiNotetaker) {
        addIssue(issues, seenIssues, {
          severity: "blocker",
          code: "human-stage-notetaker-provider-missing",
          blockId: block.id,
          message:
            `Human stage "${block.title}" enables an AI notetaker without a connected consented recording provider.`,
        });
      }
      for (const attributeId of blockAttributeIds) {
        items.push(
          evidenceItem(
            block,
            `scorecard:${attributeId}`,
            "manual_review",
            "human_rating",
            [attributeId],
            "human_bars",
            "independent_human_review",
            {
              rawWeight:
                block.measures.find(
                  (measure) => measure.attributeId === attributeId,
                )?.share ?? 1,
            },
          ),
        );
      }
      break;

    case "custom":
      for (const dimension of settings.rubricDimensions) {
        items.push(
          evidenceItem(
            block,
            dimension.id,
            "custom_assessment",
            settings.primitives.includes("file")
              ? "artifact"
              : "human_rating",
            dimensionAttributes(dimension),
            "artifact_bars",
            "independent_human_review",
            {
              rawWeight: dimension.weight,
              rubric: {
                id: dimension.id,
                version: rubricVersion,
                anchorCount: 5,
                anchors: dimension.anchors,
              },
              validationEvidenceLevel: "experimental",
            },
          ),
        );
      }
      break;
  }

  return items;
}

function normalizeEvidenceItems(
  drafts: EvidenceItemDraft[],
): EvidenceItemPlan[] {
  const weighted = drafts.filter(
    (item) => item.eligibleForScoring && !item.conditional,
  );
  const normalized = normalizeWeights(
    weighted.map((item) => item.rawWeight),
  );
  const weightById = new Map(
    weighted.map((item, index) => [item.id, normalized[index] ?? 0]),
  );
  return drafts.map(({ rawWeight: _rawWeight, ...item }) => ({
    ...item,
    normalizedWeight: weightById.get(item.id) ?? 0,
    humanReviewRequired: true,
  }));
}

function effectiveBlockGate(block: PipelineBlock): {
  minimumBlockScore: number | null;
  mustHaveIds: string[];
} | null {
  const implicitKnockoutMustHaves =
    block.settings.kind === "knockout"
      ? block.settings.items.flatMap((item) =>
          item.mustHaveId ? [item.mustHaveId] : [],
        )
      : [];
  const mustHaveIds = [
    ...new Set([
      ...(block.gate?.mustHaveIds ?? []),
      ...implicitKnockoutMustHaves,
    ]),
  ];
  if (
    block.gate?.minBlockScore === undefined &&
    mustHaveIds.length === 0
  ) {
    return null;
  }
  return {
    minimumBlockScore: block.gate?.minBlockScore ?? null,
    mustHaveIds,
  };
}

function actualMethodsForBlock(
  block: PipelineBlock,
  items: EvidenceItemPlan[],
): AssessmentMethod[] {
  const methods = unique(items.map((item) => item.method));
  if (methods.length > 0) return methods;
  if (
    block.settings.kind === "cv_intake" &&
    !block.settings.portfolioUrlField
  ) {
    return ["screening"];
  }
  return [...ASSESSMENT_METHODS_BY_BLOCK_KIND[block.settings.kind]];
}

function independentBeforeDiscussion(block: PipelineBlock): boolean {
  return block.settings.kind === "human_stage"
    ? block.settings.independentBeforeDiscussion
    : block.scored;
}

function blindReviewRequired(
  vacancy: VacancyV2,
  block: PipelineBlock,
): boolean {
  if (vacancy.scoring.anonymization.maskPII) return true;
  if (block.settings.kind === "cv_intake") {
    return block.settings.anonymizeForReview;
  }
  if (block.settings.kind === "work_sample") {
    return block.settings.anonymizedGrading;
  }
  return false;
}

function attributeRequirement(
  attribute: AttributeSpec,
): AttributeEvidenceRequirement {
  return (
    attribute.evidenceRequirement ?? {
      priority: attribute.focus ? "essential" : "important",
      targetLevel: 3,
      methods: [attribute.verification],
      minIndependentSources: attribute.focus ? 2 : 1,
      requiredForDecision: true,
      notes: [],
      specialRequirements: [],
    }
  );
}

function defaultBlockValidation(
  block: PipelineBlock,
): NonNullable<PipelineBlock["validation"]> {
  const instrumentKinds = new Set<BlockKind>([
    "sjt",
    "cognitive",
    "personality",
    "integrity_test",
    "language_test",
  ]);
  return {
    strategy: instrumentKinds.has(block.kind) ? "construct" : "content",
    status: instrumentKinds.has(block.kind) ? "pilot" : "sme_reviewed",
    scoreUse: block.scored ? "decision_support" : "context_only",
    evidenceRefs: [],
  };
}

export function compileAssessmentBlueprint(
  vacancy: VacancyV2,
): AssessmentBlueprint {
  const issues: AssessmentBlueprintIssue[] = [];
  const seenIssues = new Set<string>();
  if (
    vacancy.assessmentDesign &&
    vacancy.assessmentDesign.jobAnalysis.criticalWorkOutputs.length === 0
  ) {
    addIssue(issues, seenIssues, {
      severity: "review",
      code: "job-analysis-outcomes-missing",
      message:
        "The assessment design has no documented critical work outputs; add them before claiming content validity.",
    });
  }
  if (vacancy.pipeline.length === 0) {
    addIssue(issues, seenIssues, {
      severity: "blocker",
      code: "no-assessment-blocks",
      message:
        "The vacancy pipeline has no assessment or review block from which to collect evidence.",
    });
  }
  const seenBlockIds = new Set<string>();
  for (const block of vacancy.pipeline) {
    if (seenBlockIds.has(block.id)) {
      addIssue(issues, seenIssues, {
        severity: "blocker",
        code: "duplicate-block-id",
        blockId: block.id,
        message:
          `Block ID "${block.id}" is duplicated; evidence provenance would be ambiguous.`,
      });
    }
    seenBlockIds.add(block.id);
  }
  if (vacancy.scoring.banding?.enabled) {
    addIssue(issues, seenIssues, {
      severity: "blocker",
      code: "banding-without-validated-standard-error",
      message:
        "Score banding cannot be enabled until a versioned reliability study and validated standard error of measurement are attached. A configured width alone is not evidence.",
    });
  }
  const gatedBlocks = vacancy.pipeline.filter((block) =>
    Boolean(effectiveBlockGate(block)),
  );
  if (
    vacancy.scoring.topology === "compensatory" &&
    gatedBlocks.length > 0
  ) {
    for (const block of gatedBlocks) {
      addIssue(issues, seenIssues, {
        severity: "blocker",
        code: "gate-conflicts-with-compensatory-topology",
        blockId: block.id,
        message:
          `Block "${block.title}" contains a hurdle, but the vacancy topology is fully compensatory. Choose hybrid/multiple-hurdle or remove the gate.`,
      });
    }
  }
  if (
    vacancy.scoring.topology === "multiple_hurdle" &&
    gatedBlocks.length === 0
  ) {
    addIssue(issues, seenIssues, {
      severity: "blocker",
      code: "multiple-hurdle-topology-without-gates",
      message:
        "Multiple-hurdle topology requires at least one explicit frozen block gate.",
    });
  }
  collectProtectedConstructIssues(vacancy, issues, seenIssues);
  const attributeDrafts = buildAttributes(vacancy, issues, seenIssues);
  const validAttributeIds = new Set(
    attributeDrafts.map((attribute) => attribute.spec.id),
  );
  const minimumEvidencePerAttribute = Math.max(
    1,
    Math.min(
      20,
      Math.trunc(
        vacancy.scoring.abstainPolicy.minEvidencePerAttribute || 1,
      ),
    ),
  );

  const blocks: BlockEvidencePlan[] = [...vacancy.pipeline]
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    )
    .map((block) => {
      const mapped = mappedAttributeIds(
        block,
        validAttributeIds,
        issues,
        seenIssues,
      );
      const normalizedShares = normalizeWeights(
        mapped.map((measure) => measure.rawShare),
      );
      if (
        mapped.length > 0 &&
        Math.abs(
          mapped.reduce(
            (sum, measure) => sum + safeWeight(measure.rawShare),
            0,
          ) - 100
        ) > 0.000001
      ) {
        addIssue(issues, seenIssues, {
          severity: "review",
          code: "block-measures-normalized",
          blockId: block.id,
          message:
            `Measure shares in "${block.title}" did not sum to 100 and were normalized deterministically.`,
        });
      }
      const measures = mapped.map((measure, index) => ({
        attributeId: measure.attributeId,
        normalizedShare: normalizedShares[index] ?? 0,
        compositeWeight: 0,
      }));
      if (block.scored && measures.length === 0) {
        addIssue(issues, seenIssues, {
          severity: "blocker",
          code: "scored-block-without-measures",
          blockId: block.id,
          message:
            `Scored block "${block.title}" has no valid attribute measures.`,
        });
      }

      const items = normalizeEvidenceItems(
        collectBlockItems(
          block,
          measures.map((measure) => measure.attributeId),
          validAttributeIds,
          vacancy.configVersion,
          issues,
          seenIssues,
        ),
      );
      if (new Set(items.map((item) => item.id)).size !== items.length) {
        addIssue(issues, seenIssues, {
          severity: "blocker",
          code: "duplicate-evidence-item-id",
          blockId: block.id,
          message:
            `Block "${block.title}" produces duplicate evidence item IDs; provenance would be ambiguous.`,
        });
      }
      for (const item of items) {
        if (
          item.rubric &&
          (item.rubric.anchors.length !== 5 ||
            item.rubric.anchors.some(
              (anchor) => anchor.trim().length === 0,
            ))
        ) {
          addIssue(issues, seenIssues, {
            severity: "blocker",
            code: "invalid-item-bars-anchors",
            blockId: block.id,
            message:
              `Evidence item "${item.sourceItemId}" must have five non-empty observable BARS anchors.`,
          });
        }
      }
      const scoreableItems = items.filter(
        (item) => item.eligibleForScoring,
      );
      if (block.scored && scoreableItems.length === 0) {
        addIssue(issues, seenIssues, {
          severity: "blocker",
          code: "scored-block-without-scoreable-evidence",
          blockId: block.id,
          message:
            `Scored block "${block.title}" has no eligible job-related evidence items.`,
        });
      }
      if (block.required && items.filter((item) => item.required).length === 0) {
        addIssue(issues, seenIssues, {
          severity: "blocker",
          code: "required-block-without-required-evidence",
          blockId: block.id,
          message:
            `Required block "${block.title}" has no required evidence unit.`,
        });
      }
      const validation = block.validation ?? defaultBlockValidation(block);
      if (block.scored && validation.scoreUse === "context_only") {
        addIssue(issues, seenIssues, {
          severity: "blocker",
          code: "context-only-block-marked-scored",
          blockId: block.id,
          message:
            `Block "${block.title}" is marked scored but its validation policy allows context-only use.`,
        });
      }
      if (
        block.scored &&
        validation.status === "draft" &&
        validation.scoreUse === "selection"
      ) {
        addIssue(issues, seenIssues, {
          severity: "blocker",
          code: "unreviewed-block-used-for-selection",
          blockId: block.id,
          message:
            `Block "${block.title}" cannot affect selection until its scoring content and job relevance are reviewed.`,
        });
      }
      if (
        validation.scoreUse === "selection" &&
        (validation.evidenceRefs.length === 0 ||
          !validation.reviewedBy ||
          !validation.reviewedAt)
      ) {
        addIssue(issues, seenIssues, {
          severity: "blocker",
          code: "selection-use-without-validation-record",
          blockId: block.id,
          message:
            `Block "${block.title}" cannot affect selection without validation evidence references, a named reviewer and a review timestamp.`,
        });
      }
      if (
        validation.scoreUse === "selection" &&
        [
          "sjt",
          "cognitive",
          "personality",
          "integrity_test",
          "language_test",
        ].includes(block.kind) &&
        validation.status !== "locally_validated"
      ) {
        addIssue(issues, seenIssues, {
          severity: "blocker",
          code: "instrument-selection-use-not-locally-validated",
          blockId: block.id,
          message:
            `Instrument block "${block.title}" cannot affect selection until the exact version is locally validated for the intended role, population and decision.`,
        });
      }

      return {
        blockId: block.id,
        blockKind: block.kind,
        order: block.order,
        requiredForCompletion: block.required,
        scored: block.scored,
        methods: actualMethodsForBlock(block, items),
        measures,
        items,
        coverage: {
          requiredEvidenceUnits: items.filter((item) => item.required).length,
          plannedEvidenceCapacity: items.length,
          scorableEvidenceCapacity: scoreableItems.length,
          measuredAttributeCount: measures.length,
        },
        gate: {
          enabled: Boolean(effectiveBlockGate(block)),
          minimumBlockScore:
            effectiveBlockGate(block)?.minimumBlockScore ?? null,
          mustHaveIds:
            effectiveBlockGate(block)?.mustHaveIds ?? [],
          failureRequiresHumanReview: true,
        },
        review: {
          namedHumanRequired: true,
          independentBeforeDiscussion: independentBeforeDiscussion(block),
          minimumIndependentReviews: Math.max(
            1,
            vacancy.governance.reviewPolicy.independentReviews,
          ),
          blindReviewRequired: blindReviewRequired(vacancy, block),
        },
        compositeWeight: 0,
        evidenceRole:
          block.evidenceRole ??
          (block.scored
            ? "primary"
            : block.kind === "doc_verification" ||
                block.kind === "reference_check"
              ? "verification"
              : "context"),
        assessorInstructions: block.assessorInstructions?.trim() || null,
        validation: {
          strategy: validation.strategy,
          status: validation.status,
          scoreUse: validation.scoreUse,
          evidenceRefs: [...validation.evidenceRefs],
        },
      };
    });

  for (const attribute of attributeDrafts) {
    const sources = blocks.flatMap((block) => {
      if (!block.scored) return [];
      const measure = block.measures.find(
        (candidate) => candidate.attributeId === attribute.spec.id,
      );
      if (!measure) return [];
      const itemIds = block.items
        .filter(
          (item) =>
            item.eligibleForScoring &&
            item.attributeIds.includes(attribute.spec.id),
        )
        .map((item) => item.id);
      if (itemIds.length === 0) return [];
      return [{ block, measure, itemIds }];
    });
    const allocation = normalizeWeights(
      sources.map((source) => source.measure.normalizedShare),
    );
    sources.forEach((source, index) => {
      source.measure.compositeWeight = round6(
        (attribute.globalWeight * (allocation[index] ?? 0)) / 100,
      );
    });
  }
  for (const block of blocks) {
    block.compositeWeight = round6(
      block.measures.reduce(
        (sum, measure) => sum + measure.compositeWeight,
        0,
      ),
    );
  }

  const attributes: AttributeEvidencePlan[] = attributeDrafts.map(
    (attribute) => {
      const sourceBlocks = blocks.filter(
        (block) =>
          block.scored &&
          block.measures.some(
            (measure) =>
              measure.attributeId === attribute.spec.id &&
              measure.compositeWeight > 0,
          ),
      );
      const evidenceItems = sourceBlocks.flatMap((block) =>
        block.items.filter(
          (item) =>
            item.eligibleForScoring &&
            item.attributeIds.includes(attribute.spec.id),
        ),
      );
      const requiredSourceBlocks = sourceBlocks.filter(
        (block) => block.requiredForCompletion,
      );
      const plannedMethods = unique(
        evidenceItems.map((item) => item.method),
      );
      const requirement = attributeRequirement(attribute.spec);
      const plannedVerificationMethods = unique(
        plannedMethods.map(verificationMethodForAssessment),
      );
      const minimumIndependentSources =
        requirement.minIndependentSources;
      const requiredForCompleteEvaluation =
        attribute.globalWeight > 0 && requirement.requiredForDecision;
      const satisfiedByPlan =
        !requiredForCompleteEvaluation ||
        (evidenceItems.length >= minimumEvidencePerAttribute &&
          sourceBlocks.length >= minimumIndependentSources &&
          requiredSourceBlocks.length > 0);

      if (requiredForCompleteEvaluation && sourceBlocks.length === 0) {
        addIssue(issues, seenIssues, {
          severity: "blocker",
          code: "attribute-without-scored-source",
          attributeId: attribute.spec.id,
          message:
            `Attribute "${attribute.spec.name}" has no scoreable evidence source.`,
        });
      }
      if (
        attribute.spec.evidenceRequirement &&
        sourceBlocks.length > 0 &&
        !plannedVerificationMethods.some((method) =>
          requirement.methods.includes(method),
        )
      ) {
        addIssue(issues, seenIssues, {
          severity: "blocker",
          code: "attribute-evidence-method-mismatch",
          attributeId: attribute.spec.id,
          message:
            `Attribute "${attribute.spec.name}" is measured only by methods that its evidence policy does not allow.`,
        });
      } else if (
        attribute.spec.evidenceRequirement &&
        plannedVerificationMethods.some(
          (method) => !requirement.methods.includes(method),
        )
      ) {
        addIssue(issues, seenIssues, {
          severity: "review",
          code: "attribute-has-unapproved-evidence-method",
          attributeId: attribute.spec.id,
          message:
            `Attribute "${attribute.spec.name}" has a scored source outside its configured evidence-method list.`,
        });
      }
      if (
        requiredForCompleteEvaluation &&
        requiredSourceBlocks.length === 0
      ) {
        addIssue(issues, seenIssues, {
          severity: "blocker",
          code: "attribute-covered-only-by-optional-blocks",
          attributeId: attribute.spec.id,
          message:
            `Attribute "${attribute.spec.name}" is covered only by optional blocks, so complete evidence cannot be guaranteed.`,
        });
      }
      if (
        requiredForCompleteEvaluation &&
        attribute.spec.focus &&
        sourceBlocks.length < 2
      ) {
        addIssue(issues, seenIssues, {
          severity: "review",
          code: "focus-attribute-needs-triangulation",
          attributeId: attribute.spec.id,
          message:
            `Focus attribute "${attribute.spec.name}" needs two independent job-related sources or mandatory human review.`,
        });
      }
      if (
        requiredForCompleteEvaluation &&
        sourceBlocks.length > 0 &&
        evidenceItems.length < minimumEvidencePerAttribute
      ) {
        addIssue(issues, seenIssues, {
          severity: "review",
          code: "planned-evidence-capacity-below-minimum",
          attributeId: attribute.spec.id,
          message:
            `Attribute "${attribute.spec.name}" has capacity for ${evidenceItems.length} evidence item(s), below the configured minimum of ${minimumEvidencePerAttribute}.`,
        });
      }
      const anchors = attribute.spec.scale.anchors;
      if (
        anchors.length !== 5 ||
        anchors.some((anchor) => anchor.trim().length === 0)
      ) {
        addIssue(issues, seenIssues, {
          severity: "blocker",
          code: "invalid-bars-anchors",
          attributeId: attribute.spec.id,
          message:
            `Attribute "${attribute.spec.name}" must have five non-empty observable BARS anchors.`,
        });
      }

      return {
        attributeId: attribute.spec.id,
        attributeName: attribute.spec.name,
        attributeKind: attribute.spec.kind,
        categoryId: attribute.categoryId,
        normalizedCategoryWeight: attribute.categoryWeight,
        normalizedWeightWithinCategory: attribute.attributeWeight,
        globalWeight: attribute.globalWeight,
        focus: Boolean(attribute.spec.focus),
        priority: requirement.priority,
        targetLevel: requirement.targetLevel,
        allowedVerificationMethods: [...requirement.methods],
        requiredForCompleteEvaluation,
        plannedBlockIds: sourceBlocks.map((block) => block.blockId),
        plannedMethods,
        plannedEvidenceItemIds: evidenceItems.map((item) => item.id),
        minimumCoverage: {
          evidenceItems: minimumEvidencePerAttribute,
          independentSources: minimumIndependentSources,
          plannedEvidenceCapacity: evidenceItems.length,
          plannedIndependentSources: sourceBlocks.length,
          plannedIndependentMethods: plannedMethods.length,
          satisfiedByPlan,
        },
        bars: {
          rubricVersion: vacancy.configVersion,
          normalization: "absolute_rubric",
          exactPublishedAnchorRequired: true,
          levels: anchors.map((anchor, index) => ({
            level: (index + 1) as 1 | 2 | 3 | 4 | 5,
            score: SCORE_BY_LEVEL[index]!,
            anchor,
          })),
        },
        abstention: {
          reasons: [
            "missing",
            "insufficient",
            "contradictory",
            "off_topic",
            "unverifiable",
          ],
          score: null,
          excludedFromComposite: true,
          preventsRankingAndTier: true,
          routesToHumanReview: true,
        },
      };
    },
  );

  const usedMethods = unique(
    blocks.flatMap((block) => block.methods),
  );
  const coveredCompositeWeight = round6(
    attributes
      .filter((attribute) => attribute.plannedBlockIds.length > 0)
      .reduce((sum, attribute) => sum + attribute.globalWeight, 0),
  );
  const normalizedScoredBlockWeight = round6(
    blocks.reduce((sum, block) => sum + block.compositeWeight, 0),
  );

  issues.sort(
    (left, right) =>
      Number(left.severity === "review") -
        Number(right.severity === "review") ||
      left.code.localeCompare(right.code) ||
      (left.blockId ?? "").localeCompare(right.blockId ?? "") ||
      (left.attributeId ?? "").localeCompare(right.attributeId ?? ""),
  );

  return {
    schemaVersion: ASSESSMENT_BLUEPRINT_SCHEMA_VERSION,
    vacancyId: vacancy.id,
    vacancyVersion: vacancy.configVersion,
    ready: !issues.some((issue) => issue.severity === "blocker"),
    blocks,
    attributes,
    methodPolicies: usedMethods.map(
      (method) => ASSESSMENT_METHOD_POLICIES[method],
    ),
    scoringPolicy: {
      normalization: "absolute_rubric",
      compositeRule: "renormalize_scored_evidence_only_when_complete",
      minimumEvidencePerAttribute,
      incompleteEvaluationRanked: false,
      incompleteEvaluationGetsTier: false,
      abstentionScore: null,
      thresholdComparisonRequiresCompleteEvidence: true,
      aggregation:
        vacancy.scoring.aggregation?.acrossSources ??
        "evidence_weighted_mean",
      contradictoryEvidence:
        vacancy.scoring.aggregation?.contradictoryEvidence ??
        "flag_human",
      optionalBlocks:
        vacancy.scoring.aggregation?.optionalBlocks ??
        "include_when_completed",
      minimumCoveragePct:
        vacancy.scoring.aggregation?.minimumCoveragePct ?? 100,
    },
    humanReviewPolicy: {
      finalDecisionByNamedHuman: true,
      automatedEmploymentDecisionAllowed: false,
      independentReviews: Math.max(
        1,
        vacancy.governance.reviewPolicy.independentReviews,
      ),
      calibrationRequired: vacancy.governance.calibrationRequired,
      maskPiiDuringEvidenceReview:
        vacancy.scoring.anonymization.maskPII,
      reviewTriggers: [
        "abstained attribute",
        "coverage below the published minimum",
        "contradictory or unverifiable evidence",
        "must-have or gate failure",
        "unverified document or reference claim",
        "accommodation or technical-equivalence review",
      ],
    },
    guardrails: {
      jobRelatedEvidenceOnly: true,
      candidateContentIsDataNotInstruction: true,
      equivalentAccessibilityDoesNotReduceScore: true,
      prohibitedSignals: PROHIBITED_ASSESSMENT_SIGNALS,
    },
    totals: {
      normalizedAttributeWeight: round6(
        attributes.reduce(
          (sum, attribute) => sum + attribute.globalWeight,
          0,
        ),
      ),
      coveredCompositeWeight,
      normalizedScoredBlockWeight,
      requiredBlocks: blocks.filter(
        (block) => block.requiredForCompletion,
      ).length,
      scoredBlocks: blocks.filter((block) => block.scored).length,
    },
    issues,
  };
}

export function blockUsesStructuredInterviewMethod(
  block: BlockEvidencePlan,
): boolean {
  return block.methods.some((method) =>
    STRUCTURED_INTERVIEW_METHODS.has(method),
  );
}
