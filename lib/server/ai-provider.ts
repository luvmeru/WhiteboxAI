import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type {
  InterviewStepResponse,
  InterviewTurn,
  NlToConfigRequest,
  NlToConfigResponse,
} from "../ai-contracts";
import { createEmptyDraft } from "../studio";
import type {
  AttributeKind,
  AttributeSpec,
  BlockRuntimeResult,
  BlockKind,
  CandidateEvaluation,
  CategorySpec,
  ConfidenceBand,
  EvidenceChip,
  IndustryPack,
  InterviewQuestion,
  PipelineBlock,
  QuestionType,
  Seniority,
  VacancyV2,
  VerificationMethod,
} from "../types";
import { sanitizeIntegritySignals } from "../integrity-signals";
import { createBlock, estimateMinutes } from "../blocks";
import {
  assertOpenAIProviderConfigured,
  getServerEnv,
} from "./env";
import type { VacancyAiExecutionMode } from "./ai-rollout";
import { nextLegacyDeterministicInterviewStep } from "./legacy-demo-ai";
import {
  buildApplicationEvidenceEvaluationInstructions,
  buildEvidenceEvaluationInstructions,
  buildInterviewRouterInstructions,
  buildVacancyAssessmentContentInstructions,
  buildVacancyConfigInstructions,
  buildVacancyJobAnalysisInstructions,
  APPLICATION_EVALUATION_PROMPT_VERSION,
  APPLICATION_EVALUATION_SCHEMA_VERSION,
  EVALUATION_PROMPT_VERSION,
  INTERVIEW_PROMPT_VERSION,
  VACANCY_CONFIG_PROMPT_VERSION,
  VACANCY_CONTENT_PROMPT_VERSION,
  VACANCY_JOB_ANALYSIS_PROMPT_VERSION,
} from "./ai-prompts";
import {
  vacancyAssessmentContentSchema,
  vacancyJobAnalysisSchema,
  type VacancyAssessmentContent,
  type VacancyJobAnalysis,
} from "./ai-authoring-schemas";
import {
  applicationEvidenceEvaluationSchema,
  candidateEvaluationSchema,
  interviewRoutingSchema,
} from "./ai-schemas";
import {
  finalizeApplicationEvaluation,
  prepareApplicationEvaluation,
} from "./application-evaluation";
import type { AssessmentReviewRecord } from "./assessment-review";
import { sha256 } from "./crypto";
import {
  adaptiveInterviewOptions,
  resolveInterviewBlock,
} from "./interview-protocol";
import {
  aggregateInterviewEvidence,
  interviewAttributeIds,
} from "./interview-evaluation";
import type { ServerInterviewQuestion } from "./repository";
import { selectedTranscriptForEvaluation } from "./transcript-provenance";

const generatedField = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, rationale: z.string().min(10).max(600) });

const vacancyConfigSchema = z.object({
  categories: z.array(z.object({
    name: z.string().min(2).max(100),
    weight: z.number().int().min(1).max(100),
    rationale: z.string().min(10).max(600),
    focus: z.boolean(),
  })).min(3).max(5),
  interviewType: generatedField(z.enum(["adaptive-text", "adaptive-video", "adaptive-voice"])),
  questionDepth: generatedField(z.enum(["standard", "deep", "expert"])),
  requiredDocuments: generatedField(z.array(z.string().min(2).max(160)).max(10)),
  passThreshold: generatedField(z.number().int().min(40).max(90)),
  languages: generatedField(z.array(z.string().min(2).max(20)).min(1).max(5)),
});

const questionEnhancementSchema = z.object({
  text: z.string().min(20).max(800),
  probes: z.array(z.string().min(10).max(300)).min(1).max(3),
  clarification: z.string().min(20).max(800),
  situationalFallback: z.string().min(20).max(800),
  rationale: z.string().min(20).max(600),
});

const interviewCoverageRepairSchema = vacancyAssessmentContentSchema.pick({
  interviewQuestions: true,
});

let openaiClient: OpenAI | undefined;

function client(): OpenAI {
  const apiKey = getServerEnv().OPENAI_API_KEY;
  if (!apiKey) throw new Error("The OpenAI provider is enabled but OPENAI_API_KEY is missing.");
  openaiClient ??= new OpenAI({ apiKey, timeout: 120_000, maxRetries: 1 });
  return openaiClient;
}

export interface InterviewProviderInput {
  applicationId: string;
  internalCandidateId: string;
  vacancyTitle: string;
  competencies: { name: string; weight: number }[];
  vacancy: VacancyV2;
  interviewBlockId?: string;
  questions: ServerInterviewQuestion[];
  history: InterviewTurn[];
  followUpPolicy: 0 | 1 | 2;
  aiExecutionMode: VacancyAiExecutionMode;
}

export interface InterviewProviderResult {
  step: InterviewStepResponse;
  assessment?: InterviewTurn["assessment"];
  model: string;
  promptVersion: string;
  responseId?: string;
}

export async function nextInterviewStep(input: InterviewProviderInput): Promise<InterviewProviderResult> {
  if (input.aiExecutionMode === "legacy_deterministic") {
    return {
      step: nextLegacyDeterministicInterviewStep(
        {
          vacancyTitle: input.vacancyTitle,
          competencies: input.competencies,
          history: input.history,
        },
        input.aiExecutionMode,
      ),
      model: "wbx-deterministic-interview-1",
      promptVersion: "interview-v1-demo",
    };
  }
  assertOpenAIProviderConfigured();

  const env = getServerEnv();
  const minimumEvidencePerAttribute = Math.min(
    6,
    Math.max(
      1,
      Math.trunc(
        input.vacancy.scoring.abstainPolicy
          .minEvidencePerAttribute || 1,
      ),
    ),
  );
  const eligibleOptions = adaptiveInterviewOptions(
    input.questions,
    input.history,
    input.followUpPolicy,
    minimumEvidencePerAttribute,
  );
  const interviewBlock = resolveInterviewBlock(
    input.vacancy.pipeline,
    input.interviewBlockId,
    input.questions.map((question) => question.id),
  );
  const language =
    interviewBlock?.languageOverride ||
    input.vacancy.profile.languages.primary ||
    "en";
  const tone =
    interviewBlock?.settings.kind === "live_ai_interview"
      ? interviewBlock.settings.persona.voice
      : interviewBlock?.settings.kind === "chat_interview"
        ? interviewBlock.settings.tone
        : "neutral";
  const response = await client().responses.parse({
    model: env.OPENAI_MODEL,
    store: false,
    safety_identifier: sha256(input.internalCandidateId).slice(0, 64),
    reasoning: { effort: "low" },
    max_output_tokens: 900,
    instructions: buildInterviewRouterInstructions({
      followUpPolicy: input.followUpPolicy,
      minimumEvidencePerAttribute,
      tone,
      language,
    }),
    input: JSON.stringify({
      immutableVacancyContext: {
        version: input.vacancy.configVersion,
        interviewPolicy: {
          blockId: interviewBlock?.id ?? null,
          blockKind: interviewBlock?.settings.kind ?? null,
          required: interviewBlock?.required ?? true,
          scored: interviewBlock?.scored ?? true,
          measures: interviewBlock?.measures ?? [],
          followUpPolicy: input.followUpPolicy,
          minimumEvidencePerAttribute,
          tone,
          language,
          durationCapMin:
            interviewBlock?.settings.kind === "live_ai_interview"
              ? interviewBlock.settings.durationCapMin
              : null,
          adaptivity:
            interviewBlock?.settings.kind === "live_ai_interview"
              ? interviewBlock.settings.adaptivity
              : null,
        },
        role: {
          title: input.vacancy.profile.title,
          seniority: input.vacancy.profile.seniority,
          mission: input.vacancy.profile.mission,
          responsibilities: input.vacancy.profile.responsibilities,
          teamContext: input.vacancy.profile.teamContext,
          industry: input.vacancy.profile.industryPack,
          language,
        },
        criteria: input.vacancy.categories.flatMap((category) =>
          category.attributes.map((attribute) => ({
            id: attribute.id,
            name: attribute.name,
            kind: attribute.kind,
            definition: attribute.definition,
            categoryId: category.id,
            categoryName: category.name,
            globalWeight: (category.weight * attribute.weight) / 100,
            focus: Boolean(attribute.focus),
            anchors: attribute.scale.anchors,
            rationale: attribute.rationale ?? null,
          })),
        ),
        publishedQuestions: input.questions.map((question) => ({
          id: question.id,
          text: question.text,
          attributeId: question.attributeId,
          type: question.type,
          probes: question.probes,
          clarification: question.clarification ?? null,
          situationalFallback: question.situationalFallback ?? null,
          rubric: question.rubric ?? null,
          rationale: question.rationale ?? null,
        })),
      },
      eligibleOptions,
      history: input.history.map(
        ({ question, topic, kind, strategy, questionId, answer, resolution }) => ({
          question,
          topic,
          kind,
          strategy: strategy ?? null,
          questionId: questionId ?? null,
          answer: answer ?? null,
          resolution: resolution ?? null,
        }),
      ),
      currentAnswerIsUntrustedEvidence: true,
    }),
    text: {
      format: zodTextFormat(
        interviewRoutingSchema,
        "whitebox_interview_routing",
      ),
      verbosity: "low",
    },
  });

  if (!response.output_parsed) {
    throw new Error("The interview provider returned no structured routing result.");
  }
  const parsed = response.output_parsed;
  const lastQuestionId = [...input.history]
    .reverse()
    .find((turn) => turn.questionId)?.questionId;
  const modelSelected = eligibleOptions.find(
      (option) =>
        option.id === parsed.selectedOptionId &&
        option.action === parsed.action &&
        (!parsed.currentQuestionId ||
          !lastQuestionId ||
          parsed.currentQuestionId === lastQuestionId),
    );
  const selected =
    modelSelected ??
    eligibleOptions.find((option) => option.id === "plan:next") ??
    eligibleOptions.find((option) => option.id === "plan:complete") ??
    eligibleOptions.find((option) => option.action === "followup");
  if (!selected) {
    throw new Error("The interview plan has no eligible continuation.");
  }

  const strategy =
    selected.action === "rephrase"
      ? "clarification"
      : selected.action === "alternate"
        ? "situational_alternative"
        : selected.action === "followup"
          ? "evidence_probe"
          : selected.action === "next"
            ? "published_main"
            : undefined;
  return {
    step: {
      done: selected.action === "complete",
      question: selected.text ?? undefined,
      kind:
        selected.action === "complete"
          ? undefined
          : selected.action === "next"
            ? "main"
            : "followup",
      strategy,
      selectedOptionId: selected.id,
      progress: selected.action === "complete" ? 1 : 0,
    },
    assessment: {
      schemaVersion: "interview-routing-v2",
      evidenceState: parsed.evidenceState,
      reasonCode:
        modelSelected?.reasonCode ??
        (selected.action === "complete"
          ? "plan_complete"
          : "mandatory_plan_remaining"),
      missingElements: parsed.missingElements,
    },
    model: response.model || env.OPENAI_MODEL,
    promptVersion: INTERVIEW_PROMPT_VERSION,
    responseId: response.id,
  };
}

function normalizeWeightedItems<T extends { weight: number }>(
  items: T[],
): T[] {
  if (items.length === 0) return [];
  const remaining = 100 - items.length;
  const total = items.reduce((sum, item) => sum + Math.max(1, item.weight), 0);
  const exact = items.map(
    (item) => (Math.max(1, item.weight) / total) * remaining,
  );
  const additions = exact.map(Math.floor);
  let leftover =
    remaining - additions.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({
      index,
      remainder: value - additions[index],
    }))
    .sort(
      (left, right) =>
        right.remainder - left.remainder || left.index - right.index,
    );
  for (const item of order) {
    if (leftover <= 0) break;
    additions[item.index] += 1;
    leftover -= 1;
  }
  return items.map((item, index) => ({
    ...item,
    weight: additions[index] + 1,
  }));
}

function normalizeWeights(config: NlToConfigResponse["config"]): NlToConfigResponse["config"] {
  return {
    ...config,
    categories: normalizeWeightedItems(config.categories),
  };
}

export async function generateVacancyConfig(request: NlToConfigRequest): Promise<NlToConfigResponse> {
  assertOpenAIProviderConfigured();

  const env = getServerEnv();
  const response = await client().responses.parse({
    model: env.OPENAI_MODEL,
    store: false,
    reasoning: { effort: "low" },
    instructions: buildVacancyConfigInstructions(),
    input: JSON.stringify(request),
    text: {
      format: zodTextFormat(vacancyConfigSchema, "whitebox_vacancy_config"),
      verbosity: "low",
    },
  });
  if (!response.output_parsed) throw new Error("The AI provider returned no vacancy configuration.");
  return {
    config: normalizeWeights(response.output_parsed),
    modelVer: env.OPENAI_MODEL,
    promptVer: VACANCY_CONFIG_PROMPT_VERSION,
  };
}

type AssessmentPlan = VacancyJobAnalysis["assessmentPlan"];
type AssessmentSequenceKey = AssessmentPlan["sequence"][number];
type MethodSelection = AssessmentPlan["interview"];

const PLAN_SELECTIONS: Record<
  Exclude<AssessmentSequenceKey, "interview">,
  keyof AssessmentPlan
> = {
  knockout: "knockout",
  application_form: "applicationForm",
  cv_intake: "cvIntake",
  job_knowledge: "jobKnowledge",
  sjt_pilot: "sjtPilot",
  language_test: "languageTest",
  work_sample: "workSample",
  coding: "coding",
  case_exercise: "caseExercise",
  doc_verification: "documentVerification",
  reference_check: "referenceCheck",
  human_stage: "humanStage",
};

const METHOD_EVIDENCE: Record<AssessmentSequenceKey, VerificationMethod> = {
  knockout: "self_report",
  application_form: "self_report",
  cv_intake: "self_report",
  job_knowledge: "test",
  sjt_pilot: "test",
  language_test: "test",
  work_sample: "work_sample",
  coding: "work_sample",
  case_exercise: "work_sample",
  interview: "interview",
  doc_verification: "document",
  reference_check: "reference",
  human_stage: "human_observation",
};

function authoringId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${sha256(parts.join("\u001f")).slice(0, 16)}`;
}

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function asBars(
  anchors: string[],
): [string, string, string, string, string] {
  requireAuthoring(
    anchors.length === 5,
    "a BARS scale must contain exactly five anchors",
  );
  return anchors as [string, string, string, string, string];
}

function requireAuthoring(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`The AI vacancy draft is inconsistent: ${message}`);
  }
}

function selectionFor(
  plan: AssessmentPlan,
  key: AssessmentSequenceKey,
): MethodSelection {
  if (key === "interview") return plan.interview;
  return plan[PLAN_SELECTIONS[key]] as MethodSelection;
}

function selectedSequence(plan: AssessmentPlan): AssessmentSequenceKey[] {
  const preferred = distinct(plan.sequence).filter(
    (key) => selectionFor(plan, key).include,
  );
  const fallbacks = (
    Object.keys(METHOD_EVIDENCE) as AssessmentSequenceKey[]
  ).filter(
    (key) =>
      selectionFor(plan, key).include && !preferred.includes(key),
  );
  return [...preferred, ...fallbacks];
}

function evidenceMethodsFor(
  plan: AssessmentPlan,
  attributeKey: string,
): VerificationMethod[] {
  return distinct(
    (Object.keys(METHOD_EVIDENCE) as AssessmentSequenceKey[])
      .filter((key) => {
        const selection = selectionFor(plan, key);
        return (
          selection.include &&
          selection.attributeKeys.includes(attributeKey) &&
          key !== "sjt_pilot"
        );
      })
      .map((key) => METHOD_EVIDENCE[key]),
  );
}

function legacyVerification(
  methods: VerificationMethod[],
): AttributeSpec["verification"] {
  const primary = [
    "work_sample",
    "test",
    "interview",
    "document",
    "reference",
    "human_observation",
    "self_report",
  ].find((method) => methods.includes(method as VerificationMethod));
  if (primary === "work_sample") return "test";
  if (primary === "human_observation") return "interview";
  return (primary as AttributeSpec["verification"] | undefined) ??
    "self_report";
}

function measuresFor(
  attributeKeys: string[],
  attributeByKey: Map<
    string,
    { attribute: AttributeSpec; globalWeight: number }
  >,
): PipelineBlock["measures"] {
  const weighted = distinct(attributeKeys).map((key) => {
    const entry = attributeByKey.get(key);
    requireAuthoring(entry, `unknown criterion key "${key}" in assessment plan`);
    return {
      attributeId: entry.attribute.id,
      weight: Math.max(1, entry.globalWeight),
    };
  });
  return normalizeWeightedItems(weighted).map((item) => ({
    attributeId: item.attributeId,
    share: item.weight,
  }));
}

function contentKeysArePlanned(
  itemKeys: string[],
  selection: MethodSelection,
  methodName: string,
): void {
  const planned = new Set(selection.attributeKeys);
  for (const key of itemKeys) {
    requireAuthoring(
      planned.has(key),
      `${methodName} content refers to unplanned criterion "${key}"`,
    );
  }
  for (const key of planned) {
    requireAuthoring(
      itemKeys.includes(key),
      `${methodName} has no content for planned criterion "${key}"`,
    );
  }
}

function validateAuthoringOutput(
  analysis: VacancyJobAnalysis,
  content: VacancyAssessmentContent,
): void {
  const categoryKeys = analysis.categories.map((category) => category.key);
  requireAuthoring(
    distinct(categoryKeys).length === categoryKeys.length,
    "category keys must be unique",
  );
  const attributeKeys = analysis.categories.flatMap((category) =>
    category.attributes.map((attribute) => attribute.key),
  );
  const attributeKindByKey = new Map(
    analysis.categories.flatMap((category) =>
      category.attributes.map(
        (attribute) => [attribute.key, attribute.kind] as const,
      ),
    ),
  );
  requireAuthoring(
    distinct(attributeKeys).length === attributeKeys.length,
    "criterion keys must be unique across the vacancy",
  );
  const known = new Set(attributeKeys);
  for (const key of Object.keys(METHOD_EVIDENCE) as AssessmentSequenceKey[]) {
    const selection = selectionFor(analysis.assessmentPlan, key);
    if (selection.include) {
      requireAuthoring(
        selection.title.trim().length > 0 &&
          selection.candidateIntro.trim().length >= 20,
        `${key} needs a real title and candidate-facing explanation`,
      );
      for (const attributeKey of selection.attributeKeys) {
        requireAuthoring(
          known.has(attributeKey),
          `${key} refers to unknown criterion "${attributeKey}"`,
        );
      }
    } else {
      requireAuthoring(
        selection.attributeKeys.length === 0,
        `${key} is excluded but still maps criteria`,
      );
    }
  }
  requireAuthoring(
    analysis.assessmentPlan.interview.include,
    "a structured interview must be included",
  );
  requireAuthoring(
    analysis.assessmentPlan.humanStage.include,
    "a named-role human review stage must be included",
  );
  for (const key of analysis.assessmentPlan.jobKnowledge.attributeKeys) {
    requireAuthoring(
      attributeKindByKey.get(key) === "knowledge",
      `job-knowledge method maps non-knowledge criterion "${key}"`,
    );
  }
  for (const key of analysis.assessmentPlan.languageTest.attributeKeys) {
    requireAuthoring(
      attributeKindByKey.get(key) === "language",
      `language test maps non-language criterion "${key}"`,
    );
  }
  for (
    const key of analysis.assessmentPlan.documentVerification.attributeKeys
  ) {
    requireAuthoring(
      attributeKindByKey.get(key) === "qualification" ||
        attributeKindByKey.get(key) === "language",
      `document verification maps criterion "${key}" that is neither a qualification nor a language credential`,
    );
  }
  for (const category of analysis.categories) {
    for (const attribute of category.attributes) {
      const methods = evidenceMethodsFor(
        analysis.assessmentPlan,
        attribute.key,
      );
      requireAuthoring(
        methods.length > 0,
        `criterion "${attribute.key}" has no independent evidence source`,
      );
      if (attribute.requiredForDecision) {
        requireAuthoring(
          methods.some((method) => method !== "self_report"),
          `required criterion "${attribute.key}" relies only on self-report`,
        );
      }
    }
  }

  const plan = analysis.assessmentPlan;
  if (plan.applicationForm.include) {
    requireAuthoring(
      content.applicationFields.length > 0,
      "application form is included without fields",
    );
  } else {
    requireAuthoring(
      content.applicationFields.length === 0,
      "application form content was returned for an excluded stage",
    );
  }
  if (plan.knockout.include) {
    requireAuthoring(
      content.knockoutItems.length > 0,
      "knockout is included without explicit must-have questions",
    );
    contentKeysArePlanned(
      content.knockoutItems.map((item) => item.attributeKey),
      plan.knockout,
      "knockout",
    );
  } else {
    requireAuthoring(
      content.knockoutItems.length === 0,
      "knockout content was returned for an excluded stage",
    );
  }
  contentKeysArePlanned(
    content.interviewQuestions.map((question) => question.attributeKey),
    plan.interview,
    "structured interview",
  );
  requireAuthoring(
    content.interviewQuestions.length >= 3,
    "structured interview needs at least three substantive questions",
  );
  if (plan.jobKnowledge.include) {
    requireAuthoring(
      content.jobKnowledge,
      "job-knowledge stage is included without an item set",
    );
    contentKeysArePlanned(
      content.jobKnowledge.items.map((item) => item.attributeKey),
      plan.jobKnowledge,
      "job-knowledge test",
    );
    for (const item of content.jobKnowledge.items) {
      const correctCount = item.options.filter(
        (option) => option.correct,
      ).length;
      if (item.type === "mcq_single") {
        requireAuthoring(
          item.options.length >= 2 && correctCount === 1,
          `single-choice knowledge item "${item.idHint}" needs at least two options and exactly one correct key`,
        );
      }
      if (item.type === "mcq_multi") {
        requireAuthoring(
          item.options.length >= 2 &&
            correctCount >= 1 &&
            correctCount < item.options.length,
          `multiple-choice knowledge item "${item.idHint}" needs both correct and incorrect options`,
        );
      }
      if (item.type === "short_answer") {
        requireAuthoring(
          item.modelAnswer !== null && item.keyPoints.length > 0,
          `short-answer knowledge item "${item.idHint}" needs a model answer and key points`,
        );
      }
    }
  } else {
    requireAuthoring(
      content.jobKnowledge === null,
      "job-knowledge content was returned for an excluded stage",
    );
  }
  if (plan.sjtPilot.include) {
    requireAuthoring(
      content.sjtPilot,
      "SJT pilot is included without scenarios",
    );
    contentKeysArePlanned(
      content.sjtPilot.items.map((item) => item.attributeKey),
      plan.sjtPilot,
      "SJT pilot",
    );
  } else {
    requireAuthoring(
      content.sjtPilot === null,
      "SJT content was returned for an excluded stage",
    );
  }
  const artifactChecks = [
    ["work sample", plan.workSample, content.workSample],
    ["coding task", plan.coding, content.coding],
    ["case exercise", plan.caseExercise, content.caseExercise],
    ["language test", plan.languageTest, content.languageTest],
    ["reference check", plan.referenceCheck, content.referenceCheck],
    ["human stage", plan.humanStage, content.humanStage],
  ] as const;
  for (const [name, selection, artifact] of artifactChecks) {
    requireAuthoring(
      selection.include ? artifact !== null : artifact === null,
      `${name} content does not match its include decision`,
    );
  }
  if (plan.workSample.include && content.workSample) {
    contentKeysArePlanned(
      content.workSample.rubricDimensions.map(
        (dimension) => dimension.attributeKey,
      ),
      plan.workSample,
      "work sample",
    );
  }
  if (plan.coding.include && content.coding) {
    contentKeysArePlanned(
      content.coding.rubricDimensions.map(
        (dimension) => dimension.attributeKey,
      ),
      plan.coding,
      "coding task",
    );
    const codingAreas = [
      "correctness",
      "quality",
      "approach",
    ] as const;
    requireAuthoring(
      content.coding.correctnessWeight +
        content.coding.qualityWeight +
        content.coding.approachWeight ===
        100,
      "coding correctness, quality, and approach weights must sum to 100",
    );
    for (const area of codingAreas) {
      const dimensions = content.coding.rubricDimensions.filter(
        (dimension) => dimension.codingScoringArea === area,
      );
      requireAuthoring(
        dimensions.length > 0,
        `coding task needs at least one ${area} rubric dimension`,
      );
      requireAuthoring(
        dimensions.reduce(
          (sum, dimension) => sum + dimension.weight,
          0,
        ) === 100,
        `coding ${area} rubric-dimension weights must sum to 100`,
      );
    }
  }
  if (plan.caseExercise.include && content.caseExercise) {
    contentKeysArePlanned(
      content.caseExercise.rubricDimensions.map(
        (dimension) => dimension.attributeKey,
      ),
      plan.caseExercise,
      "case exercise",
    );
  }
  if (plan.documentVerification.include) {
    requireAuthoring(
      content.requiredDocuments.length > 0,
      "document verification is included without explicit documents",
    );
    contentKeysArePlanned(
      content.requiredDocuments.map((document) => document.attributeKey),
      plan.documentVerification,
      "document verification",
    );
  } else {
    requireAuthoring(
      content.requiredDocuments.length === 0,
      "documents were returned for an excluded verification stage",
    );
  }
}

function blockValidation(
  status: "draft" | "pilot",
  scoreUse: "context_only" | "decision_support",
  rationale: string,
): NonNullable<PipelineBlock["validation"]> {
  return {
    strategy: "content",
    status,
    scoreUse,
    evidenceRefs: [
      VACANCY_JOB_ANALYSIS_PROMPT_VERSION,
      VACANCY_CONTENT_PROMPT_VERSION,
    ],
    applicabilityNote:
      `${rationale} Job-expert review and local outcome monitoring are required before selection use.`,
  };
}

function baseAuthoredBlock(
  kind: BlockKind,
  order: number,
  title: string,
  selection: MethodSelection,
  measures: PipelineBlock["measures"],
  primaryLanguage: string,
): PipelineBlock {
  const block = createBlock(kind, order);
  block.id = authoringId(
    "blk",
    title,
    kind,
    String(order),
    selection.rationale,
  );
  block.title = selection.title;
  block.candidateIntro = selection.candidateIntro;
  block.measures = measures;
  block.languageOverride = primaryLanguage;
  block.accessibility = {
    extraTimeMultiplier: 1,
    captions: true,
    screenReaderMode: true,
    alternativeFormats: true,
  };
  block.evidenceRole = "primary";
  block.assessorInstructions = selection.rationale;
  block.tags = [
    "ai-authored-draft",
    VACANCY_JOB_ANALYSIS_PROMPT_VERSION,
    VACANCY_CONTENT_PROMPT_VERSION,
  ];
  return block;
}

function normalizedRubricDimensions(
  dimensions: NonNullable<
    VacancyAssessmentContent["workSample"]
  >["rubricDimensions"],
  title: string,
  resolveAttributeId: (attributeKey: string) => string,
): NonNullable<
  Extract<
    PipelineBlock["settings"],
    { kind: "work_sample" }
  >
>["rubricDimensions"] {
  return normalizeWeightedItems(dimensions).map((dimension, index) => ({
    id: authoringId(
      "dim",
      title,
      String(index),
      dimension.idHint,
      dimension.name,
    ),
    attributeId: resolveAttributeId(dimension.attributeKey),
    name: dimension.name,
    weight: dimension.weight,
    anchors: asBars(dimension.anchors),
  }));
}

function buildAuthoredPipeline(
  title: string,
  analysis: VacancyJobAnalysis,
  content: VacancyAssessmentContent,
  attributeByKey: Map<
    string,
    { attribute: AttributeSpec; globalWeight: number }
  >,
): PipelineBlock[] {
  const plan = analysis.assessmentPlan;
  const blocks: PipelineBlock[] = [];
  const primaryLanguage = analysis.profile.primaryLanguage;
  const measures = (selection: MethodSelection) =>
    measuresFor(selection.attributeKeys, attributeByKey);
  const attributeId = (key: string): string => {
    const entry = attributeByKey.get(key);
    requireAuthoring(entry, `content refers to unknown criterion "${key}"`);
    return entry.attribute.id;
  };

  for (const sequenceKey of selectedSequence(plan)) {
    const selection = selectionFor(plan, sequenceKey);
    const order = blocks.length + 1;
    let block: PipelineBlock;

    switch (sequenceKey) {
      case "application_form": {
        block = baseAuthoredBlock(
          "application_form",
          order,
          title,
          selection,
          measures(selection),
          primaryLanguage,
        );
        block.scored = false;
        block.evidenceRole = "context";
        block.validation = blockValidation(
          "draft",
          "context_only",
          selection.rationale,
        );
        block.settings = {
          kind: "application_form",
          fields: content.applicationFields.map((field, index) => ({
            id: authoringId(
              "field",
              title,
              String(index),
              field.idHint,
              field.label,
            ),
            label: field.label,
            type: field.type,
            required: field.required,
            pii: field.pii,
            scored: false,
            ...(field.options.length > 0
              ? {
                  options: field.options.map((option, optionIndex) => ({
                    id: authoringId(
                      "opt",
                      title,
                      field.idHint,
                      String(optionIndex),
                      option.idHint,
                    ),
                    text: option.text,
                    ...(option.points === null
                      ? {}
                      : { points: option.points }),
                  })),
                }
              : {}),
          })),
          prefillFromCv: false,
        };
        break;
      }
      case "knockout": {
        block = baseAuthoredBlock(
          "knockout",
          order,
          title,
          selection,
          measures(selection),
          primaryLanguage,
        );
        block.scored = false;
        block.evidenceRole = "verification";
        block.validation = blockValidation(
          "draft",
          "context_only",
          selection.rationale,
        );
        block.settings = {
          kind: "knockout",
          placement: "before_form",
          items: content.knockoutItems.map((item, index) => {
            const mustHaveId = authoringId(
              "must",
              title,
              item.attributeKey,
              item.idHint,
            );
            return {
              id: authoringId(
                "ko",
                title,
                String(index),
                item.idHint,
              ),
              question: item.question,
              type: item.type,
              ...(item.passValue === null
                ? {}
                : { passValue: item.passValue }),
              ...(item.threshold === null
                ? {}
                : { threshold: item.threshold }),
              ...(item.options.length > 0
                ? {
                    options: item.options.map((option, optionIndex) => ({
                      id: authoringId(
                        "opt",
                        title,
                        item.idHint,
                        String(optionIndex),
                        option.idHint,
                      ),
                      text: option.text,
                      disqualifies: option.disqualifies,
                      mustInclude: option.mustInclude,
                    })),
                  }
                : {}),
              immediate: false,
              rejectionText: item.rejectionText,
              allowAppeal: true,
              mustHaveId,
            };
          }),
        };
        break;
      }
      case "cv_intake": {
        block = baseAuthoredBlock(
          "cv_intake",
          order,
          title,
          selection,
          measures(selection),
          primaryLanguage,
        );
        block.scored = false;
        block.evidenceRole = "context";
        block.validation = blockValidation(
          "draft",
          "context_only",
          selection.rationale,
        );
        block.settings = {
          kind: "cv_intake",
          acceptedFormats: ["pdf", "docx"],
          maxSizeMb: 10,
          parseTargets: [],
          anonymizeForReview: true,
          extractClaims: false,
          portfolioUrlField:
            analysis.profile.industryPack === "creative" ||
            analysis.profile.industryPack === "tech",
        };
        break;
      }
      case "interview": {
        const modality =
          plan.interviewKind === "chat_interview" ? "text" : "video";
        const questions: InterviewQuestion[] =
          content.interviewQuestions.map((question, index) => {
            const attribute = attributeByKey.get(
              question.attributeKey,
            )?.attribute;
            requireAuthoring(
              attribute,
              `interview question refers to unknown criterion "${question.attributeKey}"`,
            );
            const questionId = authoringId(
              "q",
              title,
              String(index),
              question.idHint,
              attribute.id,
            );
            return {
              id: questionId,
              text: question.text,
              attributeId: attribute.id,
              type: question.type,
              thinkTimeSec: 60,
              answerCapSec:
                analysis.profile.seniority === "Executive" ||
                analysis.profile.seniority === "Head"
                  ? 240
                  : 180,
              modality,
              reRecordAttempts: modality === "text" ? 0 : 1,
              notesAllowed: false,
              probes: question.probes,
              clarification: question.clarification,
              situationalFallback: question.situationalFallback,
              rubric: {
                id: authoringId("rub", title, questionId),
                attributeId: attribute.id,
                anchors: attribute.scale.anchors,
                version: 1,
              },
              source: "ai",
              rationale: question.rationale,
            };
          });
        block = baseAuthoredBlock(
          plan.interviewKind,
          order,
          title,
          selection,
          measures(selection),
          primaryLanguage,
        );
        block.scored = true;
        block.evidenceRole = "primary";
        block.validation = blockValidation(
          "draft",
          "decision_support",
          selection.rationale,
        );
        if (plan.interviewKind === "async_interview") {
          block.settings = {
            kind: "async_interview",
            questions,
            followUpPolicy: 2,
            order: "fixed",
            introVideo: "none",
            practiceQuestion: false,
            pauseAllowance: 0,
            reviewBeforeSubmit: false,
          };
        } else if (plan.interviewKind === "live_ai_interview") {
          block.settings = {
            kind: "live_ai_interview",
            durationCapMin: Math.min(
              45,
              Math.max(15, questions.length * 4),
            ),
            persona: {
              name: "AI interviewer",
              voice: "neutral",
              disclosedAsAi: true,
            },
            questions,
            adaptivity: "probe_only",
            latencyFallback: "async",
            bargeInAllowed: false,
          };
        } else {
          block.settings = {
            kind: "chat_interview",
            questions,
            minAnswerWords: 20,
            maxAnswerWords: 350,
            typingTelemetry: false,
            pastePolicy: "allow",
            followUpPolicy: 2,
            tone: "neutral",
          };
        }
        break;
      }
      case "job_knowledge": {
        requireAuthoring(
          content.jobKnowledge,
          "job-knowledge content is missing",
        );
        const counts = { easy: 0, medium: 0, hard: 0 };
        for (const item of content.jobKnowledge.items) {
          counts[item.difficulty] += 1;
        }
        const mix = normalizeWeightedItems(
          (["easy", "medium", "hard"] as const).map((difficulty) => ({
            difficulty,
            weight: Math.max(1, counts[difficulty]),
          })),
        );
        const difficultyMix = {
          easy: mix.find((item) => item.difficulty === "easy")?.weight ?? 0,
          medium:
            mix.find((item) => item.difficulty === "medium")?.weight ?? 0,
          hard: mix.find((item) => item.difficulty === "hard")?.weight ?? 0,
        };
        block = baseAuthoredBlock(
          "job_knowledge",
          order,
          title,
          selection,
          measures(selection),
          primaryLanguage,
        );
        block.scored = true;
        block.validation = blockValidation(
          "draft",
          "decision_support",
          selection.rationale,
        );
        block.settings = {
          kind: "job_knowledge",
          timing: "total",
          totalTimeMin: content.jobKnowledge.totalTimeMin,
          difficultyMix,
          openBook: content.jobKnowledge.openBook,
          items: content.jobKnowledge.items.map((item, index) => ({
            id: authoringId(
              "ki",
              title,
              String(index),
              item.idHint,
            ),
            type: item.type,
            prompt: item.prompt,
            ...(item.options.length > 0
              ? {
                  options: item.options.map((option, optionIndex) => ({
                    id: authoringId(
                      "opt",
                      title,
                      item.idHint,
                      String(optionIndex),
                      option.idHint,
                    ),
                    text: option.text,
                    correct: option.correct,
                  })),
                }
              : {}),
            ...(item.modelAnswer === null
              ? {}
              : { modelAnswer: item.modelAnswer }),
            ...(item.keyPoints.length > 0
              ? { keyPoints: item.keyPoints }
              : {}),
            difficulty: item.difficulty,
            attributeId: attributeId(item.attributeKey),
          })),
        };
        break;
      }
      case "sjt_pilot": {
        requireAuthoring(content.sjtPilot, "SJT pilot content is missing");
        block = baseAuthoredBlock(
          "sjt",
          order,
          title,
          selection,
          measures(selection),
          primaryLanguage,
        );
        block.required = false;
        block.scored = false;
        block.evidenceRole = "context";
        block.validation = blockValidation(
          "pilot",
          "context_only",
          selection.rationale,
        );
        block.settings = {
          kind: "sjt",
          instruction: content.sjtPilot.instruction,
          format: "pick_best",
          keyType: "sme",
          timing: "untimed",
          randomizeOrder: true,
          pilotMode: true,
          items: content.sjtPilot.items.map((item, index) => ({
            id: authoringId(
              "sjt",
              title,
              String(index),
              item.idHint,
            ),
            scenario: item.scenario,
            mediaKind: "text",
            options: item.options.map((option, optionIndex) => ({
              id: authoringId(
                "opt",
                title,
                item.idHint,
                String(optionIndex),
                option.idHint,
              ),
              text: option.text,
              keyScore: option.keyScore,
            })),
            attributeId: attributeId(item.attributeKey),
            smeReviewed: false,
          })),
        };
        break;
      }
      case "language_test": {
        requireAuthoring(
          content.languageTest,
          "language-test configuration is missing",
        );
        block = baseAuthoredBlock(
          "language_test",
          order,
          title,
          selection,
          measures(selection),
          primaryLanguage,
        );
        block.scored = true;
        block.validation = blockValidation(
          "draft",
          "decision_support",
          selection.rationale,
        );
        const languageAttributeIds = selection.attributeKeys.map(attributeId);
        requireAuthoring(
          languageAttributeIds.length === 1,
          "each language-test block must target exactly one published language criterion",
        );
        block.settings = {
          kind: "language_test",
          language: content.languageTest.language,
          skills: content.languageTest.skills,
          criterionMappings: content.languageTest.skills.map((unit) => ({
            unit,
            attributeId: languageAttributeIds[0],
          })),
          targetLevel: content.languageTest.targetLevel,
          minutesPerSkill: content.languageTest.minutesPerSkill,
        };
        break;
      }
      case "work_sample": {
        requireAuthoring(content.workSample, "work sample content is missing");
        block = baseAuthoredBlock(
          "work_sample",
          order,
          title,
          selection,
          measures(selection),
          primaryLanguage,
        );
        block.scored = true;
        block.validation = blockValidation(
          "draft",
          "decision_support",
          selection.rationale,
        );
        block.settings = {
          kind: "work_sample",
          brief: content.workSample.brief,
          deliverables: content.workSample.deliverables,
          timeModel: content.workSample.timeModel,
          timeBudgetHours: content.workSample.timeBudgetHours,
          aiPolicy: content.workSample.aiPolicy,
          originalityCheck: false,
          anonymizedGrading: true,
          rubricDimensions: normalizedRubricDimensions(
            content.workSample.rubricDimensions,
            `${title}:work-sample`,
            attributeId,
          ),
          defenseFollowUp: false,
        };
        break;
      }
      case "coding": {
        requireAuthoring(content.coding, "coding-task content is missing");
        const split = normalizeWeightedItems([
          {
            key: "correctness" as const,
            weight: Math.max(1, content.coding.correctnessWeight),
          },
          {
            key: "quality" as const,
            weight: Math.max(1, content.coding.qualityWeight),
          },
          {
            key: "approach" as const,
            weight: Math.max(1, content.coding.approachWeight),
          },
        ]);
        block = baseAuthoredBlock(
          "coding",
          order,
          title,
          selection,
          measures(selection),
          primaryLanguage,
        );
        block.scored = true;
        block.validation = blockValidation(
          "draft",
          "decision_support",
          selection.rationale,
        );
        block.settings = {
          kind: "coding",
          environment: content.coding.environment,
          languages: content.coding.languages,
          taskSource: "custom",
          brief: content.coding.brief,
          scoringSplit: {
            correctness:
              split.find((item) => item.key === "correctness")?.weight ?? 0,
            quality:
              split.find((item) => item.key === "quality")?.weight ?? 0,
            approach:
              split.find((item) => item.key === "approach")?.weight ?? 0,
          },
          timeCapMin: content.coding.timeCapMin,
          aiPolicy: content.coding.aiPolicy,
          similarityCheck: false,
          rubricDimensions: normalizedRubricDimensions(
            content.coding.rubricDimensions,
            `${title}:coding`,
            attributeId,
          ).map((dimension, index) => ({
            ...dimension,
            codingScoringArea:
              content.coding!.rubricDimensions[index]!.codingScoringArea,
          })),
        };
        break;
      }
      case "case_exercise": {
        requireAuthoring(
          content.caseExercise,
          "case-exercise content is missing",
        );
        block = baseAuthoredBlock(
          "case_exercise",
          order,
          title,
          selection,
          measures(selection),
          primaryLanguage,
        );
        block.scored = true;
        block.validation = blockValidation(
          "draft",
          "decision_support",
          selection.rationale,
        );
        block.settings = {
          kind: "case_exercise",
          format: "case_analysis",
          materials: content.caseExercise.materials,
          timeBoxMin: content.caseExercise.timeBoxMin,
          rubricDimensions: normalizedRubricDimensions(
            content.caseExercise.rubricDimensions,
            `${title}:case`,
            attributeId,
          ),
        };
        break;
      }
      case "doc_verification": {
        block = baseAuthoredBlock(
          "doc_verification",
          order,
          title,
          selection,
          measures(selection),
          primaryLanguage,
        );
        block.scored = false;
        block.required = false;
        block.evidenceRole = "verification";
        block.validation = blockValidation(
          "draft",
          "context_only",
          selection.rationale,
        );
        block.settings = {
          kind: "doc_verification",
          requiredDocuments: content.requiredDocuments.map(
            (document, index) => ({
              id: authoringId(
                "doc",
                title,
                String(index),
                document.idHint,
              ),
              label: document.label,
              qualificationAttributeId: attributeId(
                document.attributeKey,
              ),
            }),
          ),
          acceptedFormats: ["pdf", "docx"],
          mode: "manual_document_review",
          idCheck: false,
          placement: "post_shortlist",
        };
        break;
      }
      case "reference_check": {
        requireAuthoring(
          content.referenceCheck,
          "reference-check content is missing",
        );
        block = baseAuthoredBlock(
          "reference_check",
          order,
          title,
          selection,
          measures(selection),
          primaryLanguage,
        );
        block.scored = false;
        block.required = false;
        block.evidenceRole = "corroborating";
        block.validation = blockValidation(
          "draft",
          "context_only",
          selection.rationale,
        );
        block.settings = {
          kind: "reference_check",
          referees: {
            count: content.referenceCheck.refereeCount,
            relationships: content.referenceCheck.relationships,
          },
          questionnaire: content.referenceCheck.questions.map(
            (question, index) => ({
              id: authoringId(
                "refq",
                title,
                String(index),
                question.idHint,
              ),
              text: question.text,
              ...(question.attributeKey === null
                ? {}
                : {
                    attributeId: attributeId(
                      question.attributeKey,
                    ),
                  }),
              type: question.type,
            }),
          ),
          collectionWindowDays:
            content.referenceCheck.collectionWindowDays,
          fraudControls: true,
          // Do not claim anonymity until the runtime can issue a server-owned
          // minimum-cell aggregate receipt and suppress individual responses.
          anonymizedAggregation: false,
        };
        break;
      }
      case "human_stage": {
        requireAuthoring(content.humanStage, "human-stage content is missing");
        block = baseAuthoredBlock(
          "human_stage",
          order,
          title,
          selection,
          measures(selection),
          primaryLanguage,
        );
        block.scored = selection.attributeKeys.length > 0;
        block.evidenceRole = block.scored ? "corroborating" : "context";
        block.assessorInstructions =
          content.humanStage.assessorInstructions;
        block.validation = blockValidation(
          "draft",
          block.scored ? "decision_support" : "context_only",
          selection.rationale,
        );
        block.settings = {
          kind: "human_stage",
          panel: content.humanStage.panelRoles,
          selfBooking: false,
          interviewKitAuto: false,
          independentBeforeDiscussion: true,
          aiNotetaker: false,
        };
        break;
      }
    }
    block.estimatedMinutes = Math.max(1, Math.ceil(estimateMinutes(block)));
    blocks.push(block);
  }
  return blocks;
}

export function compileVacancyAuthoringDraft(
  base: VacancyV2,
  title: string,
  analysis: VacancyJobAnalysis,
  content: VacancyAssessmentContent,
): VacancyV2 {
  validateAuthoringOutput(analysis, content);
  const unresolvedAdministrativeFields = [
    ...(analysis.profile.employmentType === null
      ? [
          `Employment type was not stated; the editor currently shows "${base.profile.employmentType}" and HR must confirm it before publication.`,
        ]
      : []),
    ...(analysis.profile.workMode === null
      ? [
          `Work mode was not stated; the editor currently shows "${base.profile.workMode}" and HR must confirm it before publication.`,
        ]
      : []),
    ...(analysis.profile.locations.length === 0
      ? [
          "No work location was stated; HR must confirm whether a location or remote-work boundary applies.",
        ]
      : []),
  ];

  const knockoutByAttribute = new Map(
    content.knockoutItems.map((item) => [item.attributeKey, item]),
  );
  let focusSlots = 5;
  const normalizedCategories = normalizeWeightedItems(analysis.categories);
  const attributeByKey = new Map<
    string,
    { attribute: AttributeSpec; globalWeight: number }
  >();
  const categories: CategorySpec[] = normalizedCategories.map(
    (category, categoryIndex) => {
      const normalizedAttributes = normalizeWeightedItems(
        category.attributes,
      );
      const attributes = normalizedAttributes.map(
        (source, attributeIndex): AttributeSpec => {
          const methods = evidenceMethodsFor(
            analysis.assessmentPlan,
            source.key,
          );
          const focus = source.focus && focusSlots > 0;
          if (focus) focusSlots -= 1;
          const knockout = knockoutByAttribute.get(source.key);
          const mustHaveValue =
            knockout?.mustHaveValueNumber ??
            knockout?.mustHaveValueText ??
            (knockout?.passValue === null ||
            knockout?.passValue === undefined
              ? undefined
              : String(knockout.passValue));
          const attribute: AttributeSpec = {
            id: authoringId(
              "attr",
              title,
              category.key,
              source.key,
              String(attributeIndex),
            ),
            name: source.name,
            kind: source.kind as AttributeKind,
            definition: source.definition,
            weight: source.weight,
            ...(focus ? { focus: true } : {}),
            ...(knockout && mustHaveValue !== undefined
              ? {
                  mustHave: {
                    rule: knockout.mustHaveRule,
                    value: mustHaveValue,
                    label: knockout.candidateVisibleLabel,
                    humanRecoverable: true,
                  },
                }
              : {}),
            scale: { anchors: asBars(source.anchors) },
            verification: legacyVerification(methods),
            evidenceRequirement: {
              priority: source.priority,
              targetLevel: source.targetLevel,
              methods,
              minIndependentSources:
                source.priority === "essential" && methods.length > 1
                  ? 2
                  : 1,
              requiredForDecision: source.requiredForDecision,
              notes: [
                "AI-authored evidence plan; confirm construct coverage and scoring use during job-expert review.",
              ],
              specialRequirements: knockout
                ? [knockout.candidateVisibleLabel]
                : [],
            },
            rationale: source.rationale,
          };
          attributeByKey.set(source.key, {
            attribute,
            globalWeight: (category.weight * source.weight) / 100,
          });
          return attribute;
        },
      );
      return {
        id: authoringId(
          "cat",
          title,
          category.key,
          String(categoryIndex),
        ),
        name: category.name,
        weight: category.weight,
        attributes,
        rationale: category.rationale,
      };
    },
  );
  const pipeline = buildAuthoredPipeline(
    title,
    analysis,
    content,
    attributeByKey,
  );

  return {
    ...base,
    profile: {
      ...base.profile,
      title,
      mission: analysis.profile.mission,
      responsibilities: analysis.profile.responsibilities,
      successOutcomes: analysis.profile.successOutcomes,
      operatingConstraints: analysis.profile.operatingConstraints,
      stakeholderGroups: analysis.profile.stakeholderGroups,
      specialRequirements: analysis.profile.specialRequirements,
      internalComments: [
        ...analysis.profile.assumptionsForHrConfirmation,
        ...unresolvedAdministrativeFields,
        `Job-analysis rationale: ${analysis.jobAnalysis.rationale}`,
        `Assessment coverage: ${analysis.assessmentPlan.coverageRationale}`,
        `Candidate burden: ${analysis.assessmentPlan.burdenRationale}`,
        `AI draft rationale: ${analysis.rationale}`,
        "The initial pass threshold is provisional and requires job-expert review, outcome monitoring, and adverse-impact monitoring before selection use.",
      ],
      tags: distinct([
        ...(base.profile.tags ?? []),
        ...(analysis.profile.employmentType === null
          ? ["needs-confirmation:employment-type"]
          : []),
        ...(analysis.profile.workMode === null
          ? ["needs-confirmation:work-mode"]
          : []),
        ...(analysis.profile.locations.length === 0
          ? ["needs-confirmation:location"]
          : []),
        "ai-authored-job-analysis",
      ]),
      seniority: analysis.profile.seniority as Seniority,
      industryPack: analysis.profile.industryPack as IndustryPack,
      ...(analysis.profile.employmentType === null
        ? {}
        : { employmentType: analysis.profile.employmentType }),
      ...(analysis.profile.workMode === null
        ? {}
        : { workMode: analysis.profile.workMode }),
      locations: analysis.profile.locations,
      ...(analysis.profile.timezoneOverlap === null
        ? {}
        : { timezoneOverlap: analysis.profile.timezoneOverlap }),
      languages: {
        primary: analysis.profile.primaryLanguage,
        alternates: analysis.profile.alternateLanguages,
      },
    },
    categories,
    pipeline,
    scoring: {
      ...base.scoring,
      aggregation: {
        acrossSources: "evidence_weighted_mean",
        contradictoryEvidence: "flag_human",
        optionalBlocks: "exclude_if_missing",
        minimumCoveragePct: 70,
      },
    },
    assessmentDesign: {
      purpose: "selection",
      jobAnalysis: {
        method: analysis.jobAnalysis.method,
        sources: analysis.jobAnalysis.sources,
        criticalWorkOutputs: analysis.jobAnalysis.criticalWorkOutputs,
      },
      validation: {
        monitoringMode: "prelaunch_review",
        outcomeCriteria: analysis.jobAnalysis.outcomeCriteria,
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

export async function generateVacancyDraft(
  title: string,
  description: string,
): Promise<{ draft: VacancyV2; modelVer: string; promptVer: string }> {
  // This contributes only product policy and empty structural defaults.
  // Job content comes exclusively from the two validated provider responses.
  const base = createEmptyDraft();
  assertOpenAIProviderConfigured();

  const env = getServerEnv();
  const analysisResponse = await client().responses.parse({
    model: env.OPENAI_MODEL,
    store: false,
    reasoning: { effort: "medium" },
    instructions: buildVacancyJobAnalysisInstructions(),
    input: JSON.stringify({
      employerBrief: { title, description },
      immutableProductConstraints: {
        humanFinalDecision: true,
        automatedRejection: false,
        generatedPsychometricInstrumentsAllowed: false,
        generatedSjtSelectionScoringAllowed: false,
        supportedInterviewKinds: [
          "async_interview",
          "live_ai_interview",
          "chat_interview",
        ],
      },
    }),
    text: {
      format: zodTextFormat(
        vacancyJobAnalysisSchema,
        "whitebox_vacancy_job_analysis",
      ),
      verbosity: "low",
    },
  });
  if (!analysisResponse.output_parsed) {
    throw new Error("The AI provider returned no vacancy job analysis.");
  }
  const analysis = analysisResponse.output_parsed;

  const contentResponse = await client().responses.parse({
    model: env.OPENAI_MODEL,
    store: false,
    reasoning: { effort: "medium" },
    instructions: buildVacancyAssessmentContentInstructions(),
    input: JSON.stringify({
      employerBrief: { title, description },
      immutableJobAnalysis: analysis,
    }),
    text: {
      format: zodTextFormat(
        vacancyAssessmentContentSchema,
        "whitebox_vacancy_assessment_content",
      ),
      verbosity: "low",
    },
  });
  if (!contentResponse.output_parsed) {
    throw new Error("The AI provider returned no vacancy assessment content.");
  }
  const content = contentResponse.output_parsed;
  const plannedInterviewKeys = distinct(
    analysis.assessmentPlan.interview.attributeKeys,
  );
  const authoredInterviewKeys = new Set(
    content.interviewQuestions.map((question) => question.attributeKey),
  );
  const missingInterviewKeys = plannedInterviewKeys.filter(
    (key) => !authoredInterviewKeys.has(key),
  );
  if (missingInterviewKeys.length > 0) {
    const criteria = analysis.categories
      .flatMap((category) => category.attributes)
      .filter((attribute) => missingInterviewKeys.includes(attribute.key));
    const repairResponse = await client().responses.parse({
      model: env.OPENAI_MODEL,
      store: false,
      reasoning: { effort: "low" },
      instructions: [
        "Repair an otherwise valid structured interview coverage gap.",
        "Return exactly one complete, job-related structured interview question for every key in missingCriterionKeys and no questions for any other key.",
        "Copy each attributeKey exactly. Ask for observable actions, decisions, outcomes and reflection. Include neutral probes, one equivalent clarification, one situational fallback and a plain-language job-relevance rationale.",
        "Do not reveal rubric anchors or a preferred answer. Return only the supplied structured schema.",
      ].join("\n"),
      input: JSON.stringify({
        employerBrief: { title, description },
        missingCriterionKeys: missingInterviewKeys,
        criteria,
        existingQuestions: content.interviewQuestions.map((question) => ({
          attributeKey: question.attributeKey,
          text: question.text,
        })),
      }),
      text: {
        format: zodTextFormat(
          interviewCoverageRepairSchema,
          "whitebox_interview_coverage_repair",
        ),
        verbosity: "low",
      },
    });
    if (!repairResponse.output_parsed) {
      throw new Error("The AI provider returned no interview coverage repair.");
    }
    for (const key of missingInterviewKeys) {
      const repairedQuestion = repairResponse.output_parsed.interviewQuestions
        .find((question) => question.attributeKey === key);
      if (repairedQuestion) content.interviewQuestions.push(repairedQuestion);
    }
  }
  const draft = compileVacancyAuthoringDraft(
    base,
    title,
    analysis,
    content,
  );

  return {
    draft,
    modelVer: env.OPENAI_MODEL,
    promptVer:
      `${VACANCY_JOB_ANALYSIS_PROMPT_VERSION}+${VACANCY_CONTENT_PROMPT_VERSION}`,
  };
}

function questionAuthoringScaffold(
  attribute: AttributeSpec,
  requestedType: QuestionType,
  seniority: Seniority,
): InterviewQuestion {
  const type =
    requestedType === "behavioral" &&
    (seniority === "Junior" || seniority === "Intern")
      ? "situational"
      : requestedType;
  return {
    id: authoringId("q", attribute.id, type, seniority),
    text: "",
    attributeId: attribute.id,
    type,
    thinkTimeSec: 30,
    answerCapSec: 180,
    modality: "video",
    reRecordAttempts: 1,
    notesAllowed: false,
    probes: [],
    rubric: {
      id: authoringId("rubric", attribute.id),
      attributeId: attribute.id,
      anchors: [...attribute.scale.anchors],
      version: 1,
    },
    source: "ai",
  };
}

export async function generateInterviewQuestion(
  attribute: AttributeSpec,
  type: QuestionType,
  seniority: Seniority,
): Promise<{
  question: InterviewQuestion;
  modelVer: string;
  promptVer: string;
}> {
  const base = questionAuthoringScaffold(attribute, type, seniority);
  assertOpenAIProviderConfigured();

  const env = getServerEnv();
  const response = await client().responses.parse({
    model: env.OPENAI_MODEL,
    store: false,
    reasoning: { effort: "low" },
    instructions:
      "Draft one structured, job-related recorded video interview question for the named criterion and seniority. " +
      "Ask for observable evidence, personal actions and outcomes. Do not ask about protected traits, health, family, age, nationality, appearance, voice, personality, or unrelated background. " +
      "Do not combine multiple primary competencies. Probes must clarify evidence without coaching. Provide one semantically equivalent clarification and one situational fallback for a candidate without past experience; neither may disclose a preferred answer or rubric anchor. The rationale must explain job relevance in plain language.",
    input: JSON.stringify({
      attribute: {
        name: attribute.name,
        kind: attribute.kind,
        definition: attribute.definition,
        scale: attribute.scale,
      },
      requestedType: base.type,
      seniority,
    }),
    text: {
      format: zodTextFormat(questionEnhancementSchema, "whitebox_interview_question"),
      verbosity: "low",
    },
  });
  if (!response.output_parsed) {
    throw new Error("The AI provider returned no interview question.");
  }
  return {
    question: {
      ...base,
      text: response.output_parsed.text,
      probes: response.output_parsed.probes,
      clarification: response.output_parsed.clarification,
      situationalFallback: response.output_parsed.situationalFallback,
      rationale: response.output_parsed.rationale,
      modality: "video",
      reRecordAttempts: 1,
      notesAllowed: false,
    },
    modelVer: env.OPENAI_MODEL,
    promptVer: "question-draft-v1",
  };
}

export interface ApplicationEvidenceProviderInput {
  id: string;
  organizationId: string;
  internalCandidateId: string;
  updatedAt: string;
  blockResults: BlockRuntimeResult[];
  assessmentReviews: AssessmentReviewRecord[];
}

export async function evaluateApplicationWithProvider(
  vacancy: VacancyV2,
  application: ApplicationEvidenceProviderInput,
): Promise<CandidateEvaluation> {
  assertOpenAIProviderConfigured();
  const prepared = prepareApplicationEvaluation(
    vacancy,
    application.blockResults,
    {
      organizationId: application.organizationId,
      applicationId: application.id,
      reviews: application.assessmentReviews,
    },
  );
  const aiItems = prepared.items.filter((item) => item.mode === "ai");
  const languageCriteriaIds = vacancy.categories.flatMap((category) =>
    category.attributes
      .filter((attribute) => attribute.kind === "language")
      .map((attribute) => attribute.id),
  );
  const env = getServerEnv();
  let parsed: {
    schemaVersion: typeof APPLICATION_EVALUATION_SCHEMA_VERSION;
    items: z.infer<
      typeof applicationEvidenceEvaluationSchema
    >["items"];
  } = {
    schemaVersion: APPLICATION_EVALUATION_SCHEMA_VERSION,
    items: [],
  };
  let providerModel = "wbx-server-deterministic-evidence-v1";
  let providerResponseId: string | undefined;

  if (aiItems.length > 0) {
    const response = await client().responses.parse({
      model: env.OPENAI_MODEL,
      store: false,
      safety_identifier: sha256(application.internalCandidateId).slice(
        0,
        64,
      ),
      reasoning: { effort: "medium" },
      max_output_tokens: Math.min(20_000, 1_000 + aiItems.length * 500),
      instructions: buildApplicationEvidenceEvaluationInstructions({
        minimumEvidencePerAttribute:
          prepared.blueprint.scoringPolicy.minimumEvidencePerAttribute,
        languageCriteriaIds,
      }),
      input: JSON.stringify({
        immutableVacancyContext: {
          vacancyId: vacancy.id,
          vacancyVersion: vacancy.configVersion,
          role: {
            title: vacancy.profile.title,
            seniority: vacancy.profile.seniority,
            mission: vacancy.profile.mission,
            responsibilities: vacancy.profile.responsibilities,
            successOutcomes: vacancy.profile.successOutcomes ?? [],
            operatingConstraints:
              vacancy.profile.operatingConstraints ?? [],
            primaryLanguage: vacancy.profile.languages.primary,
          },
          scoringPolicy: {
            normalization: prepared.blueprint.scoringPolicy.normalization,
            minimumEvidencePerAttribute:
              prepared.blueprint.scoringPolicy.minimumEvidencePerAttribute,
            contradictoryEvidence:
              prepared.blueprint.scoringPolicy.contradictoryEvidence,
          },
        },
        evaluationItems: aiItems.map((item) => ({
          evaluationItemId: item.evaluationItemId,
          blockId: item.blockId,
          blockKind: item.blockKind,
          sourceItemId: item.sourceItemId,
          method: item.method,
          label: item.label,
          attribute: {
            id: item.attributeId,
            name: item.attributeName,
            definition: item.attributeDefinition,
          },
          exactPublishedBars: item.bars.map((anchor, index) => ({
            level: index + 1,
            anchor,
          })),
          evaluationContext: item.evaluationContext ?? null,
          passages: item.passages,
        })),
      }),
      text: {
        format: zodTextFormat(
          applicationEvidenceEvaluationSchema,
          "whitebox_application_evidence_evaluation",
        ),
        verbosity: "low",
      },
    });
    if (!response.output_parsed) {
      throw new Error(
        "The AI provider returned no multi-block evidence evaluation.",
      );
    }
    parsed = response.output_parsed;
    providerModel = response.model || env.OPENAI_MODEL;
    providerResponseId = response.id;
  }

  const engine = {
    model: providerModel,
    promptId: "application-evidence-evaluation",
    promptVersion: APPLICATION_EVALUATION_PROMPT_VERSION,
    rubricVersion: `v${vacancy.configVersion}`,
    runs: 1,
    scoredAt: new Date().toISOString(),
    ...(providerResponseId ? { providerResponseId } : {}),
  };
  return finalizeApplicationEvaluation(
    vacancy,
    prepared,
    parsed,
    engine,
  );
}

interface EvaluationApplicationInput {
  id: string;
  internalCandidateId: string;
  updatedAt: string;
  interviewBlockId?: string;
  questions: ServerInterviewQuestion[];
  history: InterviewTurn[];
}

type EvaluationLevel = 1 | 2 | 3 | 4 | 5;
const LEVEL_SCORE: Record<EvaluationLevel, number> = {
  1: 20,
  2: 40,
  3: 60,
  4: 75,
  5: 92,
};

export async function evaluateInterviewWithProvider(
  vacancy: VacancyV2,
  application: EvaluationApplicationInput,
): Promise<CandidateEvaluation> {
  assertOpenAIProviderConfigured();

  const block = resolveInterviewBlock(
    vacancy.pipeline,
    application.interviewBlockId,
    application.questions.map((question) => question.id),
  );
  if (!block) throw new Error("The published vacancy has no evaluation block.");

  const measuredAttributeIds = new Set(
    interviewAttributeIds(block, application.questions),
  );
  const attributes = vacancy.categories.flatMap((category) =>
    category.attributes
      .filter((attribute) => measuredAttributeIds.has(attribute.id))
      .map((attribute) => ({
        ...attribute,
        categoryId: category.id,
        categoryName: category.name,
        categoryWeight: category.weight,
        globalWeight: (category.weight * attribute.weight) / 100,
      })),
  );
  if (attributes.length === 0) {
    throw new Error(
      "The selected interview block has no valid measured attributes.",
    );
  }
  const attributeById = new Map(attributes.map((attribute) => [attribute.id, attribute]));
  interface EvaluationPassage {
    passageId: string;
    attributeId: string;
    answer: string;
    question: string;
    locator: string;
    questionId: string;
    strategy: InterviewTurn["strategy"] | null;
  }
  const answersByAttribute = new Map<
    string,
    EvaluationPassage[]
  >();
  let mainQuestionIndex = -1;
  let activeQuestion = application.questions[0];
  for (const [index, turn] of application.history.entries()) {
    if (turn.kind === "main") {
      mainQuestionIndex += 1;
      activeQuestion =
        application.questions.find((question) => question.id === turn.questionId) ??
        application.questions[mainQuestionIndex] ??
        activeQuestion;
    } else if (turn.questionId) {
      activeQuestion =
        application.questions.find((question) => question.id === turn.questionId) ??
        activeQuestion;
    }
    const answer = turn.recordingId
      ? selectedTranscriptForEvaluation(turn.transcript)
      : turn.answer?.trim() || null;
    if (!answer || !activeQuestion) continue;
    // A secondary binding may inform routing, but it cannot become scoreable evidence.
    const scoreableAttributeId = activeQuestion.attributeId;
    if (measuredAttributeIds.has(scoreableAttributeId)) {
      const attributeId = scoreableAttributeId;
      const evidence = answersByAttribute.get(attributeId) ?? [];
      evidence.push({
        passageId: `turn-${index + 1}:${attributeId}`,
        attributeId,
        answer,
        question: turn.question,
        locator: `turn-${index + 1}`,
        questionId: activeQuestion.id,
        strategy: turn.strategy ?? null,
      });
      answersByAttribute.set(attributeId, evidence);
    }
  }

  const minimumEvidencePerAttribute = Math.min(
    6,
    Math.max(
      1,
      Math.trunc(vacancy.scoring.abstainPolicy.minEvidencePerAttribute || 1),
    ),
  );
  const languageCriteriaIds = attributes
    .filter((attribute) => attribute.kind === "language")
    .map((attribute) => attribute.id);
  const env = getServerEnv();
  const response = await client().responses.parse({
    model: env.OPENAI_MODEL,
    store: false,
    safety_identifier: sha256(application.internalCandidateId).slice(0, 64),
    reasoning: { effort: "medium" },
    max_output_tokens: Math.min(12_000, 1_200 + attributes.length * 550),
    instructions: buildEvidenceEvaluationInstructions({
      minimumEvidencePerAttribute,
      languageCriteriaIds,
    }),
    input: JSON.stringify({
      immutableVacancyContext: {
        vacancyId: vacancy.id,
        vacancyVersion: vacancy.configVersion,
        interviewBlockId: block.id,
        interviewBlockKind: block.settings.kind,
        role: {
        title: vacancy.profile.title,
        seniority: vacancy.profile.seniority,
        mission: vacancy.profile.mission,
        responsibilities: vacancy.profile.responsibilities,
        teamContext: vacancy.profile.teamContext,
        industry: vacancy.profile.industryPack,
        language: vacancy.profile.languages.primary,
        },
        scoring: {
          normalization: vacancy.scoring.normalization,
          minimumEvidencePerAttribute,
        },
      },
      attributes: attributes.map((attribute) => ({
        id: attribute.id,
        name: attribute.name,
        kind: attribute.kind,
        definition: attribute.definition,
        categoryId: attribute.categoryId,
        categoryName: attribute.categoryName,
        categoryRationale:
          vacancy.categories.find(
            (category) => category.id === attribute.categoryId,
          )?.rationale ?? null,
        focus: Boolean(attribute.focus),
        verification: attribute.verification,
        rationale: attribute.rationale ?? null,
        anchors: attribute.scale.anchors,
        publishedQuestions: application.questions
          .filter((question) => question.attributeId === attribute.id)
          .map((question) => ({
            id: question.id,
            text: question.text,
            type: question.type,
            rubricAnchors:
              question.rubric?.anchors ?? attribute.scale.anchors,
            rubricVersion: question.rubric?.version ?? vacancy.configVersion,
            rationale: question.rationale ?? null,
          })),
        passages: answersByAttribute.get(attribute.id) ?? [],
      })),
    }),
    text: {
      format: zodTextFormat(
        candidateEvaluationSchema,
        "whitebox_candidate_evaluation",
      ),
      verbosity: "low",
    },
  });
  if (!response.output_parsed) {
    throw new Error("The AI provider returned no candidate evaluation.");
  }

  const outputIds = response.output_parsed.attributes.map(
    (item) => item.attributeId,
  );
  const expectedIds = attributes.map((attribute) => attribute.id);
  if (
    outputIds.length !== expectedIds.length ||
    new Set(outputIds).size !== outputIds.length ||
    outputIds.some((id) => !attributeById.has(id)) ||
    expectedIds.some((id) => !outputIds.includes(id))
  ) {
    throw new Error(
      "The AI provider returned an invalid attribute set; no partial evaluation was saved.",
    );
  }
  const outputByAttribute = new Map(
    response.output_parsed.attributes.map((item) => [item.attributeId, item]),
  );
  const passageById = new Map(
    [...answersByAttribute.values()]
      .flat()
      .map((passage) => [passage.passageId, passage]),
  );
  let evidenceNumber = 0;
  const evidenceFor = (
    attributeId: string,
    passageId: string,
  ): { chip: EvidenceChip; timestamp: string; question: string } | null => {
    const source = passageById.get(passageId);
    if (!source || source.attributeId !== attributeId) return null;
    evidenceNumber += 1;
    return {
      chip: {
        id: `E-${evidenceNumber}`,
        quote: source.answer.slice(0, 1_200),
        locator: source.locator,
        blockId: block.id,
        question: source.question,
      },
      timestamp: source.locator,
      question: source.question,
    };
  };

  const itemScores: CandidateEvaluation["perBlock"][number]["itemScores"] = [];
  const attributeScores: CandidateEvaluation["attributeScores"] = [];
  const scoredWeights: { score: number; weight: number; categoryId: string }[] = [];

  for (const attribute of attributes) {
    const result = outputByAttribute.get(attribute.id);
    const distinctReferences = [
      ...new Map(
        (result?.evidence ?? []).map((reference) => [
          reference.passageId,
          reference,
        ]),
      ).values(),
    ];
    const invalidReference = distinctReferences.some((reference) => {
      const passage = passageById.get(reference.passageId);
      return !passage || passage.attributeId !== attribute.id;
    });
    const supportingPassageIds = distinctReferences
      .filter((reference) => reference.relation === "supports")
      .map((reference) => reference.passageId)
      .filter((passageId) => {
        const passage = passageById.get(passageId);
        return passage?.attributeId === attribute.id;
      });
    const contractValid = Boolean(
      result &&
        (result.disposition === "scored"
          ? result.level !== null && result.abstainReason === null
          : result.level === null &&
            result.abstainReason !== null &&
            result.confidence === "Low"),
    );
    const abstained =
      !result ||
      result.disposition === "abstained" ||
      !contractValid ||
      invalidReference ||
      supportingPassageIds.length < minimumEvidencePerAttribute;
    const level = (result?.level ?? 1) as EvaluationLevel;
    const score = abstained ? 0 : LEVEL_SCORE[level];
    const confidence: ConfidenceBand = abstained ? "Low" : result.confidence;
    const rationale =
      result?.rationale ??
      "The provider returned no valid rubric assessment for this attribute.";
    const evidence = distinctReferences
      .map((reference) => evidenceFor(attribute.id, reference.passageId))
      .filter(
        (
          item,
        ): item is {
          chip: EvidenceChip;
          timestamp: string;
          question: string;
        } => Boolean(item),
      );
    const abstainReason = invalidReference
      ? "unverifiable"
      : supportingPassageIds.length < minimumEvidencePerAttribute
        ? "insufficient"
        : result?.abstainReason ?? "missing";
    const drivers = abstained
      ? []
      : [{
          text: rationale,
          impact: Math.min(1, attribute.globalWeight / 100),
          direction: (level < 3 ? "neg" : "pos") as "neg" | "pos",
        }];

    itemScores.push({
      itemId: attribute.id,
      itemLabel: attribute.name,
      attributeId: attribute.id,
      level,
      score,
      evidence: evidence.map((item) => item.chip),
      drivers,
      confidence,
      confidenceReason: abstained
        ? `Not scored (${abstainReason}): ${supportingPassageIds.length} of ${minimumEvidencePerAttribute} required supporting transcript passages were validated.`
        : `${supportingPassageIds.length} server-owned transcript passage(s) support anchor ${level}; a human must still review the judgment.`,
      abstained,
    });

    if (!abstained) {
      scoredWeights.push({
        score,
        weight: attribute.globalWeight,
        categoryId: attribute.categoryId,
      });
    }
    attributeScores.push({
      id: attribute.id,
      name: attribute.name,
      score,
      weight: attribute.globalWeight,
      drivers,
      confidence,
      confidenceReason: abstained
        ? `Not scored (${abstainReason}): the submitted answers did not support a published rubric anchor.`
        : `Rubric anchor ${level} is supported by validated server-owned transcript passages.`,
      evidence: evidence.map((item) => ({
        quote: item.chip.quote,
        timestamp: item.timestamp,
        question: item.question,
      })),
      trace: abstained
        ? [
            "Loaded the immutable vacancy rubric and server-owned interview transcript.",
            `Validated ${supportingPassageIds.length} of ${minimumEvidencePerAttribute} required supporting passage(s).`,
            "Abstained and routed the attribute to mandatory human review.",
          ]
        : [
            "Loaded the immutable vacancy rubric and server-owned interview transcript.",
            `Matched ${supportingPassageIds.length} server-owned passage(s) to published BARS anchor ${level}.`,
            "Queued the result for mandatory human adjudication.",
          ],
      abstained,
    });
  }

  const {
    overall,
    categoryScores,
    coverage,
    scoredWeight,
  } = aggregateInterviewEvidence(
    scoredWeights,
    attributes.map((attribute) => ({
      categoryId: attribute.categoryId,
      weight: attribute.globalWeight,
    })),
  );
  const abstainedCount = itemScores.filter((item) => item.abstained).length;
  const confidence: ConfidenceBand =
    abstainedCount > 0
      ? "Low"
      : itemScores.every((item) => item.confidence === "High")
        ? "High"
        : "Medium";
  const complete = abstainedCount === 0;
  const tier = complete
    ? overall >= vacancy.scoring.threshold + 10
      ? "Top"
      : overall >= vacancy.scoring.threshold
        ? "Mid"
        : "Bottom"
    : null;
  const strengths = attributeScores
    .filter(
      (attribute) => !attribute.abstained && attribute.score >= 75,
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((attribute) => `${attribute.name}: ${attribute.drivers[0]?.text ?? "Strong rubric evidence."}`);
  const risks = [
    ...attributeScores
      .filter((attribute) => !attribute.abstained && attribute.score <= 40)
      .sort((left, right) => left.score - right.score)
      .slice(0, 3)
      .map((attribute) => `${attribute.name}: ${attribute.drivers[0]?.text ?? "Evidence needs review."}`),
    ...itemScores
      .filter((item) => item.abstained)
      .slice(0, 3)
      .map((item) => `${item.itemLabel}: insufficient evidence; do not treat as a negative score.`),
  ].slice(0, 4);
  const engine = {
    model: response.model || env.OPENAI_MODEL,
    promptId: "candidate-evaluation",
    promptVersion: EVALUATION_PROMPT_VERSION,
    rubricVersion: `v${vacancy.configVersion}`,
    runs: 1,
    scoredAt: new Date().toISOString(),
    providerResponseId: response.id,
  };
  const allEvidence = itemScores.flatMap((item) => item.evidence);

  return {
    perBlock: [{
      blockId: block.id,
      itemScores,
      blockScore: overall,
      confidence,
      confidenceReason:
        abstainedCount > 0
          ? `${abstainedCount} attribute${abstainedCount === 1 ? "" : "s"} abstained and require human evidence review.`
          : "Every scored attribute has an exact transcript quote; human adjudication remains mandatory.",
      drivers: itemScores.flatMap((item) => item.drivers).slice(0, 5),
      evidence: allEvidence,
      reasoning: [
        { step: 1, text: "Loaded the immutable published rubric and transcript." },
        { step: 2, text: "Resolved every evidence ID to a server-owned transcript passage." },
        { step: 3, text: "Applied the configured weights mechanically and routed the result to a human." },
      ],
      integrity: sanitizeIntegritySignals(
        application.history.flatMap((turn) => turn.integrity ?? []),
      ),
      engine,
    }],
    attributeScores,
    categoryScores,
    overall,
    complete,
    coverage,
    tier,
    confidence,
    confidencePhrase:
      abstainedCount > 0
        ? `Low confidence — ${abstainedCount} attribute${abstainedCount === 1 ? "" : "s"} need human evidence review.`
        : `${confidence} confidence — every score is tied to validated submitted evidence.`,
    synthesis: {
      strengths,
      risks,
      contradictions: [],
      narrative:
        `${attributeScores.filter((attribute) => !attribute.abstained).length} of ${attributes.length} attributes measured by the frozen interview block had enough transcript evidence to score. ` +
        (scoredWeight > 0
          ? `The provisional score among scorable evidence is ${overall}; coverage is ${coverage}%. An incomplete evaluation is not eligible for ranking or threshold comparison. `
          : "No provisional score is available because every measured attribute requires more evidence. ") +
        "This is decision support, not an employment decision; a named human reviewer must inspect the evidence and record the outcome.",
    },
    mustHaveResults: [],
    claims: [],
    engine,
  };
}

export async function transcribeInterviewRecording(
  recording: File,
  aiExecutionMode: VacancyAiExecutionMode,
): Promise<{ text: string; model: string }> {
  const env = getServerEnv();
  if (aiExecutionMode === "legacy_deterministic") {
    return { text: "", model: "transcription-disabled-demo" };
  }
  assertOpenAIProviderConfigured();
  const transcription = await client().audio.transcriptions.create({
    file: recording,
    model: env.OPENAI_TRANSCRIBE_MODEL,
    response_format: "json",
  });
  return {
    text: transcription.text.trim(),
    model: env.OPENAI_TRANSCRIBE_MODEL,
  };
}
