import { createHash } from "node:crypto";

import {
  compileAssessmentBlueprint,
  type AssessmentBlueprint,
  type BlockEvidencePlan,
} from "./assessment-blueprint";
import type {
  AccessibilityConfig,
  BlockKind,
  FormField,
  InterviewQuestion,
  JobKnowledgeSettings,
  PipelineBlock,
  ResponseModality,
  VacancyV2,
} from "../types";
import { countNaturalLanguageWords } from "../word-count";

export const CANDIDATE_ASSESSMENT_PLAN_SCHEMA_VERSION =
  "candidate-assessment-plan-v1" as const;

export type CandidateDeliveryState =
  | "candidate_input"
  | "interview_runtime"
  | "deferred_candidate_input"
  | "candidate_then_external_participants"
  | "human_coordination_required"
  | "external_provider_required"
  | "employer_configuration_required";

export type CandidateDeliveryAvailability =
  | "ready"
  | "deferred"
  | "coordinated"
  | "blocked";

export interface CandidateDelivery {
  state: CandidateDeliveryState;
  availability: CandidateDeliveryAvailability;
  /**
   * Stable, non-sensitive reason code. Candidate applications can persist this
   * without copying internal validation notes into candidate-facing storage.
   */
  reasonCode?: string;
}

export type CandidateScoringMode =
  | "unscored"
  | "automatic_deterministic"
  | "mixed_deterministic_and_human_pending"
  | "ai_assisted_human_pending"
  | "human_pending"
  | "verification_human_pending"
  | "validated_provider_pending";

export interface CandidateScoringDisposition {
  mode: CandidateScoringMode;
  use: "gate" | "composite" | "context";
  deterministicResultAvailable: boolean;
  finalHumanReviewRequired: true;
  automatedEmploymentDecisionAllowed: false;
  explanationCode:
    | "not_scored"
    | "configured_answer_key"
    | "configured_gate_key"
    | "mixed_key_and_judgment"
    | "structured_evidence_review"
    | "rubric_review"
    | "verification_adjudication"
    | "validated_provider_then_human_review";
}

export interface CandidateQuestion {
  id: string;
  text: string;
  type: InterviewQuestion["type"];
  thinkTimeSec: InterviewQuestion["thinkTimeSec"];
  answerCapSec: number;
  modality: ResponseModality;
  reRecordAttempts: InterviewQuestion["reRecordAttempts"];
  notesAllowed: boolean;
  clarificationAvailable: boolean;
  situationalFallbackAvailable: boolean;
}

export interface CandidateRubricDimension {
  id: string;
  name: string;
}

export type CandidateBlockManifest =
  | {
      kind: "application_form";
      fields: {
        id: string;
        label: string;
        type: FormField["type"];
        required: boolean;
        options?: { id: string; text: string }[];
      }[];
      prefillFromCv: boolean;
    }
  | {
      kind: "knockout";
      placement: "before_form" | "after_form";
      items: {
        id: string;
        question: string;
        type: "yes_no" | "numeric_threshold" | "single_choice" | "multi_must_include";
        options?: { id: string; text: string }[];
        allowAppeal: boolean;
      }[];
    }
  | {
      kind: "cv_intake";
      acceptedFormats: ("pdf" | "docx")[];
      maxSizeMb: number;
      portfolioUrlField: boolean;
    }
  | {
      kind: "async_interview";
      questions: CandidateQuestion[];
      order: "fixed" | "randomized";
      introVideo: "recruiter" | "ai_presenter" | "none";
      introScript?: string;
      practiceQuestion: boolean;
      pauseAllowance: 0 | 1 | 2;
      reviewBeforeSubmit: boolean;
    }
  | {
      kind: "live_ai_interview";
      durationCapMin: number;
      persona: {
        name: string;
        voice: "neutral" | "warm" | "formal";
        disclosedAsAi: true;
      };
      questions: CandidateQuestion[];
      adaptivity: "probe_only" | "probe_reorder";
      latencyFallback: "async" | "chat";
      bargeInAllowed: boolean;
    }
  | {
      kind: "chat_interview";
      questions: CandidateQuestion[];
      minAnswerWords: number;
      maxAnswerWords: number;
      pastePolicy: "allow" | "warn" | "block";
      tone: "neutral" | "warm";
    }
  | {
      kind: "sjt";
      instruction: "knowledge" | "behavioral_tendency";
      format: "pick_best" | "pick_best_worst" | "rank_all" | "rate_each";
      items: {
        id: string;
        scenario: string;
        mediaKind: "text" | "image" | "video";
        options: { id: string; text: string }[];
      }[];
      timing: "untimed" | "soft_per_item";
      randomizeOrder: boolean;
      pilotMode: boolean;
    }
  | {
      kind: "cognitive";
      subtests: string[];
      itemsPerSubtest: number;
      adaptive: boolean;
      totalTimeMin: number;
      calculatorAllowed: boolean;
      practiceItems: 2;
    }
  | {
      kind: "personality";
      model: "big_five" | "hexaco";
      lengthItems: 60 | 120 | 200;
      format: "likert" | "forced_choice";
      contextualizedAtWork: boolean;
      candidateFeedbackReport: boolean;
    }
  | {
      kind: "integrity_test";
      domains: string[];
      lengthItems: number;
      format: "likert" | "forced_choice";
    }
  | {
      kind: "job_knowledge";
      items: {
        id: string;
        type: JobKnowledgeSettings["items"][number]["type"];
        prompt: string;
        options?: { id: string; text: string }[];
      }[];
      timing: "per_item" | "total";
      totalTimeMin?: number;
      openBook: boolean;
    }
  | {
      kind: "language_test";
      language: string;
      skills: string[];
      targetLevel: "A2" | "B1" | "B2" | "C1" | "C2";
      minutesPerSkill: number;
    }
  | {
      kind: "work_sample";
      brief: string;
      deliverables: ("file" | "url" | "rich_text" | "spreadsheet")[];
      timeModel: "honesty_window" | "hard_timer";
      timeBudgetHours: number;
      aiPolicy: "forbidden" | "disclosed" | "expected";
      dimensions: CandidateRubricDimension[];
      defenseFollowUp: boolean;
    }
  | {
      kind: "coding";
      environment: "browser_ide" | "take_home_repo";
      languages: string[];
      brief: string;
      timeCapMin: number;
      aiPolicy: "forbidden" | "disclosed" | "expected";
      dimensions: CandidateRubricDimension[];
    }
  | {
      kind: "case_exercise";
      format: "case_analysis" | "in_basket" | "role_play" | "presentation";
      materials: string;
      timeBoxMin: number;
      itemCount?: number;
      personaScript?: string;
      dimensions: CandidateRubricDimension[];
    }
  | {
      kind: "doc_verification";
      requiredDocuments: { id: string; label: string }[];
      acceptedFormats: string[];
      mode: "manual_document_review" | "auto_extract_match";
      idCheck: boolean;
      placement: "in_flow" | "post_shortlist";
    }
  | {
      kind: "reference_check";
      refereeCount: 1 | 2 | 3 | 4;
      allowedRelationships: ("manager" | "peer" | "report")[];
      collectionWindowDays: number;
    }
  | {
      kind: "human_stage";
      panelSize: number;
      selfBooking: boolean;
      bookingUrl?: string;
      aiNotetaker: boolean;
    }
  | {
      kind: "custom";
      instructions: string;
      primitives: ("recorder" | "text" | "choice" | "file" | "grid")[];
      dimensions: CandidateRubricDimension[];
    };

export interface CandidateAssessmentBlock {
  id: string;
  kind: BlockKind;
  order: number;
  title: string;
  candidateIntro: string;
  required: boolean;
  estimatedMinutes: number;
  language: string;
  accessibility: AccessibilityConfig;
  retakePolicy: 0 | 1 | 2;
  deadlineOffsetHours?: number;
  delivery: CandidateDelivery;
  scoring: CandidateScoringDisposition;
  manifest: CandidateBlockManifest;
}

export interface CandidateAssessmentPlan {
  schemaVersion: typeof CANDIDATE_ASSESSMENT_PLAN_SCHEMA_VERSION;
  source: {
    vacancyId: string;
    vacancyVersion: number;
    vacancyFingerprint: string;
    blueprintSchemaVersion: AssessmentBlueprint["schemaVersion"];
  };
  role: {
    title: string;
    mission: string;
    primaryLanguage: string;
  };
  candidateExperience: {
    aiDisclosure: string;
    noticeVersion: number;
    retentionDays: number;
    tone: VacancyV2["experience"]["tone"];
  };
  readyForCandidate: boolean;
  blockingReasonCodes: string[];
  finalDecisionByNamedHuman: true;
  blocks: CandidateAssessmentBlock[];
}

export interface UploadedAssetRef {
  uploadId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Lock version used to bind the private object at upload time. */
  applicationVersion?: number;
}

export interface CandidateAiUseDisclosure {
  usedAi: boolean;
  attested: true;
  details?: string;
}

export interface CandidateSubmissionIssue {
  path: string;
  code:
    | "invalid_type"
    | "required"
    | "unknown_item"
    | "invalid_option"
    | "invalid_format"
    | "out_of_range"
    | "duplicate"
    | "policy_violation"
    | "block_not_open"
    | "external_provider_required"
    | "human_coordination_required"
    | "employer_configuration_required";
  message: string;
}

export type CandidateBlockCompletionState =
  | "completed_unscored"
  | "completed_deterministic_human_review"
  | "awaiting_human_review"
  | "awaiting_ai_assisted_human_review"
  | "awaiting_verification"
  | "awaiting_external_participants";

export type CandidateSubmissionValidation =
  | {
      ok: true;
      blockId: string;
      kind: BlockKind;
      normalized: Record<string, unknown>;
      nextState: CandidateBlockCompletionState;
    }
  | {
      ok: false;
      blockId: string;
      kind: BlockKind;
      issues: CandidateSubmissionIssue[];
    };

export interface CandidateSubmissionContext {
  deferredBlockUnlocked?: boolean;
}

class AssessmentPlanCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssessmentPlanCompileError";
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

function fingerprintVacancy(vacancy: VacancyV2): string {
  const assessmentSnapshot = {
    id: vacancy.id,
    code: vacancy.code,
    configVersion: vacancy.configVersion,
    profile: vacancy.profile,
    categories: vacancy.categories,
    pipeline: vacancy.pipeline,
    scoring: vacancy.scoring,
    experience: vacancy.experience,
    governance: vacancy.governance,
    assessmentDesign: vacancy.assessmentDesign ?? null,
  };
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(assessmentSnapshot)))
    .digest("hex");
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return value;
}

function candidateQuestion(question: InterviewQuestion): CandidateQuestion {
  return {
    id: question.id,
    text: question.text,
    type: question.type,
    thinkTimeSec: question.thinkTimeSec,
    answerCapSec: question.answerCapSec,
    modality: question.modality,
    reRecordAttempts: question.reRecordAttempts,
    notesAllowed: question.notesAllowed,
    clarificationAvailable: Boolean(question.clarification),
    situationalFallbackAvailable: Boolean(question.situationalFallback),
  };
}

function candidateDimensions(
  dimensions: { id: string; name: string }[],
): CandidateRubricDimension[] {
  return dimensions.map(({ id, name }) => ({ id, name }));
}

function manifestForBlock(block: PipelineBlock): CandidateBlockManifest {
  const settings = block.settings;
  switch (settings.kind) {
    case "application_form":
      return {
        kind: settings.kind,
        fields: settings.fields.map((field) => ({
          id: field.id,
          label: field.label,
          type: field.type,
          required: field.required,
          ...(field.options
            ? {
                options: field.options.map(({ id, text }) => ({ id, text })),
              }
            : {}),
        })),
        prefillFromCv: settings.prefillFromCv,
      };
    case "knockout":
      return {
        kind: settings.kind,
        placement: settings.placement,
        items: settings.items.map((item) => ({
          id: item.id,
          question: item.question,
          type: item.type,
          ...(item.options
            ? {
                options: item.options.map(({ id, text }) => ({ id, text })),
              }
            : {}),
          allowAppeal: item.allowAppeal,
        })),
      };
    case "cv_intake":
      return {
        kind: settings.kind,
        acceptedFormats: [...settings.acceptedFormats],
        maxSizeMb: settings.maxSizeMb,
        portfolioUrlField: settings.portfolioUrlField,
      };
    case "async_interview":
      return {
        kind: settings.kind,
        questions: settings.questions.map(candidateQuestion),
        order: settings.order,
        introVideo: settings.introVideo,
        ...(settings.introScript ? { introScript: settings.introScript } : {}),
        practiceQuestion: settings.practiceQuestion,
        pauseAllowance: settings.pauseAllowance,
        reviewBeforeSubmit: settings.reviewBeforeSubmit,
      };
    case "live_ai_interview":
      return {
        kind: settings.kind,
        durationCapMin: settings.durationCapMin,
        persona: { ...settings.persona },
        questions: settings.questions.map(candidateQuestion),
        adaptivity: settings.adaptivity,
        latencyFallback: settings.latencyFallback,
        bargeInAllowed: settings.bargeInAllowed,
      };
    case "chat_interview":
      return {
        kind: settings.kind,
        questions: settings.questions.map(candidateQuestion),
        minAnswerWords: settings.minAnswerWords,
        maxAnswerWords: settings.maxAnswerWords,
        pastePolicy: settings.pastePolicy,
        tone: settings.tone,
      };
    case "sjt":
      return {
        kind: settings.kind,
        instruction: settings.instruction,
        format: settings.format,
        items: settings.items.map((item) => ({
          id: item.id,
          scenario: item.scenario,
          mediaKind: item.mediaKind,
          options: item.options.map(({ id, text }) => ({ id, text })),
        })),
        timing: settings.timing,
        randomizeOrder: settings.randomizeOrder,
        pilotMode: settings.pilotMode,
      };
    case "cognitive":
      return {
        kind: settings.kind,
        subtests: [...settings.subtests],
        itemsPerSubtest: settings.itemsPerSubtest,
        adaptive: settings.adaptive,
        totalTimeMin: settings.totalTimeMin,
        calculatorAllowed: settings.calculatorAllowed,
        practiceItems: settings.practiceItems,
      };
    case "personality":
      return {
        kind: settings.kind,
        model: settings.model,
        lengthItems: settings.lengthItems,
        format: settings.format,
        contextualizedAtWork: settings.contextualizedAtWork,
        candidateFeedbackReport: settings.candidateFeedbackReport,
      };
    case "integrity_test":
      return {
        kind: settings.kind,
        domains: [...settings.domains],
        lengthItems: settings.lengthItems,
        format: settings.format,
      };
    case "job_knowledge":
      return {
        kind: settings.kind,
        items: settings.items.map((item) => ({
          id: item.id,
          type: item.type,
          prompt: item.prompt,
          ...(item.options
            ? {
                options: item.options.map(({ id, text }) => ({ id, text })),
              }
            : {}),
        })),
        timing: settings.timing,
        ...(settings.totalTimeMin !== undefined
          ? { totalTimeMin: settings.totalTimeMin }
          : {}),
        openBook: settings.openBook,
      };
    case "language_test":
      return {
        kind: settings.kind,
        language: settings.language,
        skills: [...settings.skills],
        targetLevel: settings.targetLevel,
        minutesPerSkill: settings.minutesPerSkill,
      };
    case "work_sample":
      return {
        kind: settings.kind,
        brief: settings.brief,
        deliverables: [...settings.deliverables],
        timeModel: settings.timeModel,
        timeBudgetHours: settings.timeBudgetHours,
        aiPolicy: settings.aiPolicy,
        dimensions: candidateDimensions(settings.rubricDimensions),
        defenseFollowUp: settings.defenseFollowUp,
      };
    case "coding":
      return {
        kind: settings.kind,
        environment: settings.environment,
        languages: [...settings.languages],
        brief: settings.brief,
        timeCapMin: settings.timeCapMin,
        aiPolicy: settings.aiPolicy,
        dimensions: candidateDimensions(settings.rubricDimensions),
      };
    case "case_exercise":
      return {
        kind: settings.kind,
        format: settings.format,
        materials: settings.materials,
        timeBoxMin: settings.timeBoxMin,
        ...(settings.itemCount !== undefined
          ? { itemCount: settings.itemCount }
          : {}),
        ...(settings.personaScript
          ? { personaScript: settings.personaScript }
          : {}),
        dimensions: candidateDimensions(settings.rubricDimensions),
      };
    case "doc_verification":
      return {
        kind: settings.kind,
        requiredDocuments: settings.requiredDocuments.map(({ id, label }) => ({
          id,
          label,
        })),
        acceptedFormats: [...settings.acceptedFormats],
        mode: settings.mode,
        idCheck: settings.idCheck,
        placement: settings.placement,
      };
    case "reference_check":
      return {
        kind: settings.kind,
        refereeCount: settings.referees.count,
        allowedRelationships: [...settings.referees.relationships],
        collectionWindowDays: settings.collectionWindowDays,
      };
    case "human_stage":
      return {
        kind: settings.kind,
        panelSize: settings.panel.length,
        selfBooking: settings.selfBooking,
        ...(settings.bookingUrl ? { bookingUrl: settings.bookingUrl } : {}),
        aiNotetaker: settings.aiNotetaker,
      };
    case "custom":
      return {
        kind: settings.kind,
        instructions: settings.instructions,
        primitives: [...settings.primitives],
        dimensions: candidateDimensions(settings.rubricDimensions),
      };
  }
}

function hasConfiguredFormKey(field: FormField): boolean {
  return (
    !field.pii &&
    field.scored &&
    (field.type === "single_choice" ||
      field.type === "multi_choice" ||
      field.type === "dropdown") &&
    Boolean(field.options?.length) &&
    field.options!.every((option) => Number.isFinite(option.points))
  );
}

function knockoutItemIsConfigured(
  item: Extract<
    PipelineBlock["settings"],
    { kind: "knockout" }
  >["items"][number],
): boolean {
  if (item.type === "yes_no") return typeof item.passValue === "boolean";
  if (item.type === "numeric_threshold") {
    return Number.isFinite(item.threshold);
  }
  if (item.type === "single_choice") {
    return (
      Boolean(item.options?.length) &&
      item.options!.some((option) => option.disqualifies === true)
    );
  }
  return (
    Boolean(item.options?.length) &&
    item.options!.some((option) => option.mustInclude === true)
  );
}

function knowledgeItemIsDeterministic(
  item: JobKnowledgeSettings["items"][number],
): boolean {
  if (item.type !== "mcq_single" && item.type !== "mcq_multi") return false;
  const correctCount =
    item.options?.filter((option) => option.correct === true).length ?? 0;
  return (
    Boolean(item.options?.length) &&
    item.options!.every((option) => typeof option.correct === "boolean") &&
    (item.type === "mcq_single" ? correctCount === 1 : correctCount >= 1)
  );
}

function scoringForBlock(
  block: PipelineBlock,
): CandidateScoringDisposition {
  const contextDisposition = (
    mode: CandidateScoringMode,
    explanationCode: CandidateScoringDisposition["explanationCode"],
    deterministicResultAvailable = false,
  ): CandidateScoringDisposition => ({
    mode,
    use: block.scored
      ? block.kind === "knockout"
        ? "gate"
        : "composite"
      : "context",
    deterministicResultAvailable,
    finalHumanReviewRequired: true,
    automatedEmploymentDecisionAllowed: false,
    explanationCode,
  });

  if (block.kind === "knockout") {
    const settings = block.settings;
    if (
      settings.kind === "knockout" &&
      settings.items.length > 0 &&
      settings.items.every(knockoutItemIsConfigured)
    ) {
      return contextDisposition(
        "automatic_deterministic",
        "configured_gate_key",
        true,
      );
    }
    return contextDisposition("human_pending", "structured_evidence_review");
  }
  if (!block.scored) return contextDisposition("unscored", "not_scored");

  const settings = block.settings;
  switch (settings.kind) {
    case "application_form": {
      const scoredFields = settings.fields.filter((field) => field.scored);
      const deterministic = scoredFields.filter(hasConfiguredFormKey);
      if (
        scoredFields.length > 0 &&
        deterministic.length === scoredFields.length
      ) {
        return contextDisposition(
          "automatic_deterministic",
          "configured_answer_key",
          true,
        );
      }
      if (deterministic.length > 0) {
        return contextDisposition(
          "mixed_deterministic_and_human_pending",
          "mixed_key_and_judgment",
          true,
        );
      }
      return contextDisposition("human_pending", "structured_evidence_review");
    }
    case "sjt":
      if (settings.pilotMode) {
        return {
          ...contextDisposition("unscored", "not_scored"),
          use: "context",
        };
      }
      if (
        settings.items.length > 0 &&
        settings.items.every(
          (item) =>
            item.smeReviewed &&
            item.options.length >= 2 &&
            item.options.every((option) => Number.isFinite(option.keyScore)),
        )
      ) {
        return contextDisposition(
          "automatic_deterministic",
          "configured_answer_key",
          true,
        );
      }
      return {
        ...contextDisposition("unscored", "not_scored"),
        use: "context",
      };
    case "job_knowledge": {
      const deterministic = settings.items.filter(
        knowledgeItemIsDeterministic,
      );
      if (
        settings.items.length > 0 &&
        deterministic.length === settings.items.length
      ) {
        return contextDisposition(
          "automatic_deterministic",
          "configured_answer_key",
          true,
        );
      }
      if (deterministic.length > 0) {
        return contextDisposition(
          "mixed_deterministic_and_human_pending",
          "mixed_key_and_judgment",
          true,
        );
      }
      return contextDisposition(
        "ai_assisted_human_pending",
        "structured_evidence_review",
      );
    }
    case "cognitive":
    case "personality":
    case "integrity_test":
    case "language_test":
      return contextDisposition(
        "validated_provider_pending",
        "validated_provider_then_human_review",
      );
    case "cv_intake":
    case "doc_verification":
      return contextDisposition(
        "verification_human_pending",
        "verification_adjudication",
      );
    case "async_interview":
    case "live_ai_interview":
    case "chat_interview":
      return contextDisposition(
        "ai_assisted_human_pending",
        "structured_evidence_review",
      );
    case "work_sample":
    case "coding":
    case "case_exercise":
    case "custom":
      return contextDisposition("human_pending", "rubric_review");
    case "reference_check":
    case "human_stage":
      return contextDisposition(
        "human_pending",
        "structured_evidence_review",
      );
    case "knockout":
      return contextDisposition("human_pending", "structured_evidence_review");
  }
}

function deliveryForBlock(block: PipelineBlock): CandidateDelivery {
  const settings = block.settings;
  switch (settings.kind) {
    case "application_form":
      if (settings.prefillFromCv) {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "cv_prefill_pipeline_not_configured",
        };
      }
      return { state: "candidate_input", availability: "ready" };
    case "cv_intake":
      if (settings.parseTargets.length > 0 || settings.extractClaims) {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "cv_parsing_pipeline_not_configured",
        };
      }
      return { state: "candidate_input", availability: "ready" };
    case "chat_interview":
      if (settings.typingTelemetry) {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "typing_telemetry_contract_not_configured",
        };
      }
      return { state: "interview_runtime", availability: "ready" };
    case "async_interview":
      if (settings.order === "randomized") {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "async_randomized_order_not_specialized",
        };
      }
      if (settings.introVideo !== "none") {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "async_intro_media_not_configured",
        };
      }
      if (settings.practiceQuestion) {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "async_practice_capture_not_configured",
        };
      }
      if (settings.pauseAllowance > 0) {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "async_pause_state_not_implemented",
        };
      }
      if (settings.reviewBeforeSubmit) {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "async_review_flow_not_implemented",
        };
      }
      return { state: "interview_runtime", availability: "ready" };
    case "live_ai_interview":
      if (settings.adaptivity === "probe_reorder") {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "live_main_question_reorder_not_implemented",
        };
      }
      if (settings.latencyFallback !== "async") {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "live_chat_fallback_not_implemented",
        };
      }
      if (settings.bargeInAllowed) {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "live_barge_in_not_available",
        };
      }
      return { state: "interview_runtime", availability: "ready" };
    case "cognitive":
    case "personality":
    case "integrity_test":
    case "language_test":
      return {
        state: "external_provider_required",
        availability: "blocked",
        reasonCode: "validated_instrument_delivery_not_configured",
      };
    case "human_stage":
      return {
        state: "human_coordination_required",
        availability: "coordinated",
        reasonCode: settings.selfBooking
          ? "scheduling_provider_or_slots_required"
          : "employer_schedules_stage",
      };
    case "reference_check":
      return {
        state: "candidate_then_external_participants",
        availability: "ready",
      };
    case "sjt":
      if (settings.items.some((item) => item.mediaKind !== "text")) {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "sjt_media_asset_not_configured",
        };
      }
      if (settings.timing === "soft_per_item") {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "sjt_soft_timing_receipts_not_implemented",
        };
      }
      return { state: "candidate_input", availability: "ready" };
    case "doc_verification":
      if (settings.mode === "auto_extract_match") {
        return {
          state: "external_provider_required",
          availability: "blocked",
          reasonCode: "document_verification_provider_not_configured",
        };
      }
      if (settings.idCheck) {
        return {
          state: "external_provider_required",
          availability: "blocked",
          reasonCode: "document_identity_provider_not_configured",
        };
      }
      if (
        settings.acceptedFormats.some(
          (format) => !["pdf", "docx"].includes(format.toLowerCase()),
        )
      ) {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "document_upload_format_not_supported",
        };
      }
      return settings.placement === "post_shortlist"
        ? {
            state: "deferred_candidate_input",
            availability: "deferred",
            reasonCode: "opens_after_shortlist",
          }
        : { state: "candidate_input", availability: "ready" };
    case "custom":
      if (
        settings.primitives.includes("choice") ||
        settings.primitives.includes("grid") ||
        settings.primitives.includes("recorder")
      ) {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "custom_interaction_schema_missing",
        };
      }
      return { state: "candidate_input", availability: "ready" };
    case "job_knowledge":
      if (
        settings.timing === "per_item" &&
        settings.items.length > 0
      ) {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "knowledge_per_item_time_caps_missing",
        };
      }
      if (
        settings.items.some(
          (item) =>
            item.type === "image_hotspot" || item.type === "sequence",
        )
      ) {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "knowledge_interaction_schema_missing",
        };
      }
      return { state: "candidate_input", availability: "ready" };
    case "work_sample":
      if (settings.originalityCheck) {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "originality_provider_not_configured",
        };
      }
      if (settings.defenseFollowUp) {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "defense_follow_up_plan_not_frozen",
        };
      }
      return { state: "candidate_input", availability: "ready" };
    case "coding":
      if (settings.similarityCheck) {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "similarity_provider_not_configured",
        };
      }
      if (settings.environment === "take_home_repo") {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "take_home_repository_evidence_not_ingested",
        };
      }
      if (settings.taskSource !== "custom") {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "coding_task_provenance_not_frozen",
        };
      }
      return { state: "candidate_input", availability: "ready" };
    case "case_exercise":
      if (settings.format === "in_basket") {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "in_basket_items_not_frozen",
        };
      }
      if (settings.format === "role_play") {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "role_play_counterpart_runtime_not_configured",
        };
      }
      if (settings.format === "presentation") {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "presentation_capture_not_configured",
        };
      }
      return { state: "candidate_input", availability: "ready" };
    case "knockout":
      if (
        settings.items.length === 0 ||
        !settings.items.every(knockoutItemIsConfigured)
      ) {
        return {
          state: "employer_configuration_required",
          availability: "blocked",
          reasonCode: "knockout_key_incomplete",
        };
      }
      return { state: "candidate_input", availability: "ready" };
    default:
      return { state: "candidate_input", availability: "ready" };
  }
}

function assertBlueprintMatchesVacancy(
  vacancy: VacancyV2,
  blueprint: AssessmentBlueprint,
): Map<string, BlockEvidencePlan> {
  if (
    blueprint.vacancyId !== vacancy.id ||
    blueprint.vacancyVersion !== vacancy.configVersion
  ) {
    throw new AssessmentPlanCompileError(
      "Assessment blueprint does not belong to the exact vacancy version.",
    );
  }
  const byId = new Map(
    blueprint.blocks.map((block) => [block.blockId, block] as const),
  );
  if (byId.size !== vacancy.pipeline.length) {
    throw new AssessmentPlanCompileError(
      "Assessment blueprint block count differs from the frozen vacancy.",
    );
  }
  for (const block of vacancy.pipeline) {
    if (block.kind !== block.settings.kind) {
      throw new AssessmentPlanCompileError(
        `Vacancy block "${block.id}" kind does not match its settings kind.`,
      );
    }
    const compiled = byId.get(block.id);
    if (
      !compiled ||
      compiled.blockKind !== block.kind ||
      compiled.order !== block.order
    ) {
      throw new AssessmentPlanCompileError(
        `Assessment blueprint block "${block.id}" does not match the frozen vacancy.`,
      );
    }
  }
  return byId;
}

export function compileCandidateAssessmentPlan(
  vacancy: VacancyV2,
  blueprint: AssessmentBlueprint = compileAssessmentBlueprint(vacancy),
): Readonly<CandidateAssessmentPlan> {
  assertBlueprintMatchesVacancy(vacancy, blueprint);
  const orderedBlocks = [...vacancy.pipeline].sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id),
  );
  const blocks: CandidateAssessmentBlock[] = orderedBlocks.map((block, index) => {
    const delivery = deliveryForBlock(block);
    const optionalUnscoredBlueprintBlocker = blueprint.issues.some(
      (issue) =>
        issue.severity === "blocker" &&
        issue.blockId === block.id &&
        !block.required &&
        !block.scored,
    );
    return {
      id: block.id,
      kind: block.kind,
      // The frozen source order determines sequence; the candidate plan exposes
      // a contiguous ordinal even for historical configs that predate strict
      // order validation.
      order: index + 1,
      title: block.title,
      candidateIntro: block.candidateIntro,
      required: block.required,
      estimatedMinutes: block.estimatedMinutes,
      language: block.languageOverride ?? vacancy.profile.languages.primary,
      accessibility: { ...block.accessibility },
      retakePolicy: block.retakePolicy,
      ...(block.deadlineOffsetHours !== undefined
        ? { deadlineOffsetHours: block.deadlineOffsetHours }
        : {}),
      delivery:
        optionalUnscoredBlueprintBlocker &&
        delivery.availability !== "blocked"
          ? {
              state: "employer_configuration_required",
              availability: "blocked",
              reasonCode: "optional_block_blueprint_invalid",
            }
          : delivery,
      scoring: scoringForBlock(block),
      manifest: manifestForBlock(block),
    };
  });
  const vacancyBlockById = new Map(
    vacancy.pipeline.map((block) => [block.id, block] as const),
  );
  const blockingReasonCodes = [
    ...blueprint.issues
      .filter((issue) => {
        if (issue.severity !== "blocker") return false;
        if (!issue.blockId) return true;
        const sourceBlock = vacancyBlockById.get(issue.blockId);
        return !sourceBlock || sourceBlock.required || sourceBlock.scored;
      })
      .map((issue) => `blueprint:${issue.code}`),
    ...blocks
      .filter(
        (block) =>
          (block.required ||
            vacancyBlockById.get(block.id)?.scored === true) &&
          block.delivery.availability === "blocked",
      )
      .map(
        (block) =>
          `runtime:${block.id}:${block.delivery.reasonCode ?? "unavailable"}`,
      ),
  ];
  const plan: CandidateAssessmentPlan = {
    schemaVersion: CANDIDATE_ASSESSMENT_PLAN_SCHEMA_VERSION,
    source: {
      vacancyId: vacancy.id,
      vacancyVersion: vacancy.configVersion,
      vacancyFingerprint: fingerprintVacancy(vacancy),
      blueprintSchemaVersion: blueprint.schemaVersion,
    },
    role: {
      title: vacancy.profile.title,
      mission: vacancy.profile.mission,
      primaryLanguage: vacancy.profile.languages.primary,
    },
    candidateExperience: {
      aiDisclosure: vacancy.experience.notices.aiDisclosure,
      noticeVersion: vacancy.experience.notices.version,
      retentionDays: vacancy.experience.notices.retentionDays,
      tone: vacancy.experience.tone,
    },
    readyForCandidate: blockingReasonCodes.length === 0,
    blockingReasonCodes: [...new Set(blockingReasonCodes)],
    finalDecisionByNamedHuman: true,
    blocks,
  };
  return deepFreeze(plan);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isUploadedAsset(value: unknown): value is UploadedAssetRef {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.uploadId) &&
    isNonEmptyString(value.fileName) &&
    isNonEmptyString(value.mimeType) &&
    typeof value.sizeBytes === "number" &&
    Number.isFinite(value.sizeBytes) &&
    value.sizeBytes > 0 &&
    (value.applicationVersion === undefined ||
      (typeof value.applicationVersion === "number" &&
        Number.isSafeInteger(value.applicationVersion) &&
        value.applicationVersion >= 1))
  );
}

function issue(
  issues: CandidateSubmissionIssue[],
  path: string,
  code: CandidateSubmissionIssue["code"],
  message: string,
): void {
  issues.push({ path, code, message });
}

function answerRecord(
  payload: unknown,
  issues: CandidateSubmissionIssue[],
): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    issue(issues, "body", "invalid_type", "Submission must be an object.");
    return null;
  }
  if (!isRecord(payload.answers)) {
    issue(
      issues,
      "body.answers",
      "invalid_type",
      "answers must be an object keyed by item ID.",
    );
    return null;
  }
  return payload.answers;
}

function validateKnownKeys(
  answers: Record<string, unknown>,
  allowedIds: Set<string>,
  issues: CandidateSubmissionIssue[],
): void {
  for (const id of Object.keys(answers)) {
    if (!allowedIds.has(id)) {
      issue(
        issues,
        `body.answers.${id}`,
        "unknown_item",
        "Answer refers to an item outside the frozen block version.",
      );
    }
  }
}

function validateApplicationForm(
  block: Extract<CandidateAssessmentBlock, { kind: BlockKind }>,
  payload: unknown,
  issues: CandidateSubmissionIssue[],
): Record<string, unknown> | null {
  if (block.manifest.kind !== "application_form") return null;
  const answers = answerRecord(payload, issues);
  if (!answers) return null;
  const fieldIds = new Set(block.manifest.fields.map((field) => field.id));
  validateKnownKeys(answers, fieldIds, issues);
  for (const field of block.manifest.fields) {
    const value = answers[field.id];
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      if (field.required) {
        issue(
          issues,
          `body.answers.${field.id}`,
          "required",
          "This field is required.",
        );
      }
      continue;
    }
    const optionIds = new Set((field.options ?? []).map((option) => option.id));
    let valid = true;
    switch (field.type) {
      case "short_text":
      case "long_text":
      case "date":
        valid = isNonEmptyString(value);
        break;
      case "url":
        valid = isUrl(value);
        break;
      case "number":
        valid = typeof value === "number" && Number.isFinite(value);
        break;
      case "file":
        valid = isUploadedAsset(value);
        break;
      case "consent":
        valid = typeof value === "boolean" && (!field.required || value);
        break;
      case "single_choice":
      case "dropdown":
        valid = isNonEmptyString(value) && optionIds.has(value);
        break;
      case "multi_choice":
        valid =
          isStringArray(value) &&
          new Set(value).size === value.length &&
          value.every((selected) => optionIds.has(selected));
        break;
    }
    if (!valid) {
      issue(
        issues,
        `body.answers.${field.id}`,
        "invalid_format",
        "Answer does not match the frozen field definition.",
      );
    }
  }
  return { answers: { ...answers } };
}

function validateKnockout(
  block: CandidateAssessmentBlock,
  payload: unknown,
  issues: CandidateSubmissionIssue[],
): Record<string, unknown> | null {
  if (block.manifest.kind !== "knockout") return null;
  const answers = answerRecord(payload, issues);
  if (!answers) return null;
  const itemIds = new Set(block.manifest.items.map((item) => item.id));
  validateKnownKeys(answers, itemIds, issues);
  for (const item of block.manifest.items) {
    const value = answers[item.id];
    if (value === undefined) {
      issue(
        issues,
        `body.answers.${item.id}`,
        "required",
        "A response is required for every eligibility item.",
      );
      continue;
    }
    const optionIds = new Set((item.options ?? []).map((option) => option.id));
    const valid =
      (item.type === "yes_no" && typeof value === "boolean") ||
      (item.type === "numeric_threshold" &&
        typeof value === "number" &&
        Number.isFinite(value)) ||
      (item.type === "single_choice" &&
        isNonEmptyString(value) &&
        optionIds.has(value)) ||
      (item.type === "multi_must_include" &&
        isStringArray(value) &&
        new Set(value).size === value.length &&
        value.every((selected) => optionIds.has(selected)));
    if (!valid) {
      issue(
        issues,
        `body.answers.${item.id}`,
        "invalid_format",
        "Eligibility response has the wrong shape or an unknown option.",
      );
    }
  }
  if (isRecord(payload) && payload.appeals !== undefined) {
    if (!isRecord(payload.appeals)) {
      issue(
        issues,
        "body.appeals",
        "invalid_type",
        "appeals must be an object keyed by eligibility item ID.",
      );
    } else {
      for (const [id, value] of Object.entries(payload.appeals)) {
        const item = block.manifest.items.find((candidate) => candidate.id === id);
        if (!item || !item.allowAppeal) {
          issue(
            issues,
            `body.appeals.${id}`,
            "unknown_item",
            "This item does not accept a candidate explanation.",
          );
        } else if (!isNonEmptyString(value)) {
          issue(
            issues,
            `body.appeals.${id}`,
            "invalid_type",
            "Appeal explanation must be non-empty text.",
          );
        }
      }
    }
  }
  return {
    answers: { ...answers },
    ...(isRecord(payload) && isRecord(payload.appeals)
      ? { appeals: { ...payload.appeals } }
      : {}),
  };
}

function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

function validateCv(
  block: CandidateAssessmentBlock,
  payload: unknown,
  issues: CandidateSubmissionIssue[],
): Record<string, unknown> | null {
  if (block.manifest.kind !== "cv_intake") return null;
  if (!isRecord(payload)) {
    issue(issues, "body", "invalid_type", "Submission must be an object.");
    return null;
  }
  if (!isUploadedAsset(payload.resume)) {
    issue(
      issues,
      "body.resume",
      "required",
      "A completed resume upload reference is required.",
    );
  } else {
    if (
      !block.manifest.acceptedFormats.includes(
        fileExtension(payload.resume.fileName) as "pdf" | "docx",
      )
    ) {
      issue(
        issues,
        "body.resume.fileName",
        "invalid_format",
        "Resume file format is not accepted for this vacancy version.",
      );
    }
    if (payload.resume.sizeBytes > block.manifest.maxSizeMb * 1024 * 1024) {
      issue(
        issues,
        "body.resume.sizeBytes",
        "out_of_range",
        "Resume exceeds the published size limit.",
      );
    }
  }
  if (
    payload.portfolioUrl !== undefined &&
    (!block.manifest.portfolioUrlField || !isUrl(payload.portfolioUrl))
  ) {
    issue(
      issues,
      "body.portfolioUrl",
      "invalid_format",
      "Portfolio URL is not enabled or is invalid.",
    );
  }
  return {
    ...(isUploadedAsset(payload.resume) ? { resume: { ...payload.resume } } : {}),
    ...(isUrl(payload.portfolioUrl)
      ? { portfolioUrl: payload.portfolioUrl }
      : {}),
  };
}

function validateInterviewAnswers(
  block: CandidateAssessmentBlock,
  payload: unknown,
  issues: CandidateSubmissionIssue[],
): Record<string, unknown> | null {
  if (
    block.manifest.kind !== "async_interview" &&
    block.manifest.kind !== "chat_interview"
  ) {
    return null;
  }
  if (!isRecord(payload) || !Array.isArray(payload.answers)) {
    issue(
      issues,
      "body.answers",
      "invalid_type",
      "answers must be an array.",
    );
    return null;
  }
  const questions = new Map(
    block.manifest.questions.map((question) => [question.id, question] as const),
  );
  const seen = new Set<string>();
  const normalized: Record<string, unknown>[] = [];
  payload.answers.forEach((answer, index) => {
    const path = `body.answers.${index}`;
    if (!isRecord(answer) || !isNonEmptyString(answer.questionId)) {
      issue(
        issues,
        path,
        "invalid_type",
        "Each answer needs a questionId and response.",
      );
      return;
    }
    const question = questions.get(answer.questionId);
    if (!question) {
      issue(
        issues,
        `${path}.questionId`,
        "unknown_item",
        "Question is outside the frozen block version.",
      );
      return;
    }
    if (seen.has(question.id)) {
      issue(
        issues,
        `${path}.questionId`,
        "duplicate",
        "Question was answered more than once.",
      );
      return;
    }
    seen.add(question.id);
    if (block.manifest.kind === "chat_interview") {
      if (!isNonEmptyString(answer.text)) {
        issue(issues, `${path}.text`, "required", "Text answer is required.");
      } else {
        const words = countNaturalLanguageWords(
          answer.text,
          block.language,
        );
        if (
          words < block.manifest.minAnswerWords ||
          words > block.manifest.maxAnswerWords
        ) {
          issue(
            issues,
            `${path}.text`,
            "out_of_range",
            "Text answer is outside the published word range.",
          );
        }
      }
      if (typeof answer.pasteDetected !== "boolean") {
        issue(
          issues,
          `${path}.pasteDetected`,
          "required",
          "Paste-event disclosure is required for this text response.",
        );
      } else if (
        answer.pasteDetected &&
        block.manifest.pastePolicy === "block"
      ) {
        issue(
          issues,
          `${path}.pasteDetected`,
          "policy_violation",
          "Pasted text is not accepted under the published response policy.",
        );
      } else if (
        answer.pasteDetected &&
        block.manifest.pastePolicy === "warn" &&
        answer.pasteAcknowledged !== true
      ) {
        issue(
          issues,
          `${path}.pasteAcknowledged`,
          "required",
          "Acknowledge the published paste notice before submitting.",
        );
      }
      normalized.push({
        questionId: question.id,
        ...(isNonEmptyString(answer.text) ? { text: answer.text.trim() } : {}),
        pasteDetected: answer.pasteDetected === true,
        ...(answer.pasteDetected === true &&
        block.manifest.pastePolicy === "warn"
          ? { pasteAcknowledged: answer.pasteAcknowledged === true }
          : {}),
      });
      return;
    }
    if (question.modality === "text") {
      if (!isNonEmptyString(answer.text)) {
        issue(issues, `${path}.text`, "required", "Text answer is required.");
      }
    } else if (!isNonEmptyString(answer.mediaRef)) {
      issue(
        issues,
        `${path}.mediaRef`,
        "required",
        `${question.modality} recording reference is required.`,
      );
    }
    if (
      answer.durationSec !== undefined &&
      (typeof answer.durationSec !== "number" ||
        !Number.isFinite(answer.durationSec) ||
        answer.durationSec < 0 ||
        answer.durationSec > question.answerCapSec)
    ) {
      issue(
        issues,
        `${path}.durationSec`,
        "out_of_range",
        "Recorded duration exceeds the published answer cap.",
      );
    }
    normalized.push({
      questionId: question.id,
      modality: question.modality,
      ...(isNonEmptyString(answer.text) ? { text: answer.text.trim() } : {}),
      ...(isNonEmptyString(answer.mediaRef) ? { mediaRef: answer.mediaRef } : {}),
      ...(isNonEmptyString(answer.transcriptRef)
        ? { transcriptRef: answer.transcriptRef }
        : {}),
      ...(typeof answer.durationSec === "number"
        ? { durationSec: answer.durationSec }
        : {}),
    });
  });
  for (const questionId of questions.keys()) {
    if (!seen.has(questionId)) {
      issue(
        issues,
        "body.answers",
        "required",
        `Missing response for question "${questionId}".`,
      );
    }
  }
  return { answers: normalized };
}

function validateLiveInterview(
  block: CandidateAssessmentBlock,
  payload: unknown,
  issues: CandidateSubmissionIssue[],
): Record<string, unknown> | null {
  if (block.manifest.kind !== "live_ai_interview") return null;
  if (!isRecord(payload)) {
    issue(issues, "body", "invalid_type", "Submission must be an object.");
    return null;
  }
  if (!isNonEmptyString(payload.sessionId)) {
    issue(
      issues,
      "body.sessionId",
      "required",
      "Interview session ID is required.",
    );
  }
  if (!isNonEmptyString(payload.transcriptRef)) {
    issue(
      issues,
      "body.transcriptRef",
      "required",
      "A persisted transcript reference is required.",
    );
  }
  if (!isStringArray(payload.answeredQuestionIds)) {
    issue(
      issues,
      "body.answeredQuestionIds",
      "invalid_type",
      "answeredQuestionIds must contain at least one question ID.",
    );
  } else {
    const known = new Set(block.manifest.questions.map((question) => question.id));
    if (
      payload.answeredQuestionIds.length === 0 ||
      payload.answeredQuestionIds.some((id) => !known.has(id))
    ) {
      issue(
        issues,
        "body.answeredQuestionIds",
        "unknown_item",
        "Answered questions must belong to the frozen interview version.",
      );
    }
  }
  return {
    ...(isNonEmptyString(payload.sessionId)
      ? { sessionId: payload.sessionId }
      : {}),
    ...(isNonEmptyString(payload.transcriptRef)
      ? { transcriptRef: payload.transcriptRef }
      : {}),
    ...(isNonEmptyString(payload.recordingRef)
      ? { recordingRef: payload.recordingRef }
      : {}),
    ...(isStringArray(payload.answeredQuestionIds)
      ? { answeredQuestionIds: [...payload.answeredQuestionIds] }
      : {}),
  };
}

function validateSjt(
  block: CandidateAssessmentBlock,
  payload: unknown,
  issues: CandidateSubmissionIssue[],
): Record<string, unknown> | null {
  if (block.manifest.kind !== "sjt") return null;
  const answers = answerRecord(payload, issues);
  if (!answers) return null;
  const itemIds = new Set(block.manifest.items.map((item) => item.id));
  validateKnownKeys(answers, itemIds, issues);
  for (const item of block.manifest.items) {
    const value = answers[item.id];
    const optionIds = new Set(item.options.map((option) => option.id));
    let valid = false;
    if (block.manifest.format === "pick_best") {
      valid = isNonEmptyString(value) && optionIds.has(value);
    } else if (block.manifest.format === "pick_best_worst") {
      valid =
        isRecord(value) &&
        isNonEmptyString(value.bestId) &&
        isNonEmptyString(value.worstId) &&
        value.bestId !== value.worstId &&
        optionIds.has(value.bestId) &&
        optionIds.has(value.worstId);
    } else if (block.manifest.format === "rank_all") {
      valid =
        isStringArray(value) &&
        value.length === optionIds.size &&
        new Set(value).size === value.length &&
        value.every((id) => optionIds.has(id));
    } else {
      valid =
        isRecord(value) &&
        Object.keys(value).length === optionIds.size &&
        Object.entries(value).every(
          ([id, rating]) =>
            optionIds.has(id) &&
            typeof rating === "number" &&
            Number.isInteger(rating) &&
            rating >= 1 &&
            rating <= 5,
        );
    }
    if (!valid) {
      issue(
        issues,
        `body.answers.${item.id}`,
        value === undefined ? "required" : "invalid_format",
        "SJT answer does not match the published response format.",
      );
    }
  }
  return { answers: { ...answers } };
}

function validateJobKnowledge(
  block: CandidateAssessmentBlock,
  payload: unknown,
  issues: CandidateSubmissionIssue[],
): Record<string, unknown> | null {
  if (block.manifest.kind !== "job_knowledge") return null;
  const answers = answerRecord(payload, issues);
  if (!answers) return null;
  const itemIds = new Set(block.manifest.items.map((item) => item.id));
  validateKnownKeys(answers, itemIds, issues);
  for (const item of block.manifest.items) {
    const value = answers[item.id];
    const optionIds = new Set((item.options ?? []).map((option) => option.id));
    let valid = false;
    if (item.type === "mcq_single") {
      valid = isNonEmptyString(value) && optionIds.has(value);
    } else if (item.type === "mcq_multi") {
      valid =
        isStringArray(value) &&
        new Set(value).size === value.length &&
        value.every((id) => optionIds.has(id));
    } else if (item.type === "true_false_justify") {
      valid =
        isRecord(value) &&
        typeof value.choice === "boolean" &&
        isNonEmptyString(value.justification);
    } else if (item.type === "short_answer") {
      valid = isNonEmptyString(value);
    } else if (item.type === "sequence") {
      valid =
        isStringArray(value) &&
        value.length === optionIds.size &&
        new Set(value).size === value.length &&
        value.every((id) => optionIds.has(id));
    }
    if (!valid) {
      issue(
        issues,
        `body.answers.${item.id}`,
        value === undefined ? "required" : "invalid_format",
        "Knowledge-test answer does not match the published item type.",
      );
    }
  }
  return { answers: { ...answers } };
}

function validateAiUseDisclosure(
  policy: "forbidden" | "disclosed" | "expected",
  payload: Record<string, unknown>,
  issues: CandidateSubmissionIssue[],
): CandidateAiUseDisclosure | null {
  if (!isRecord(payload.aiUse)) {
    issue(
      issues,
      "body.aiUse",
      "required",
      "Confirm the published AI-use policy before submitting.",
    );
    return null;
  }
  const disclosure = payload.aiUse;
  if (typeof disclosure.usedAi !== "boolean") {
    issue(
      issues,
      "body.aiUse.usedAi",
      "invalid_type",
      "State whether AI tools were used.",
    );
  }
  if (disclosure.attested !== true) {
    issue(
      issues,
      "body.aiUse.attested",
      "required",
      "Attest that the AI-use statement is accurate.",
    );
  }
  if (policy === "forbidden" && disclosure.usedAi === true) {
    issue(
      issues,
      "body.aiUse.usedAi",
      "policy_violation",
      "This frozen exercise forbids AI assistance. Contact the hiring team instead of submitting a non-compliant attempt.",
    );
  }
  const details =
    typeof disclosure.details === "string" ? disclosure.details.trim() : "";
  if (
    disclosure.usedAi === true &&
    policy !== "forbidden" &&
    details.length < 10
  ) {
    issue(
      issues,
      "body.aiUse.details",
      "required",
      "Briefly identify the tools used and how they contributed.",
    );
  }
  if (details.length > 4_000) {
    issue(
      issues,
      "body.aiUse.details",
      "out_of_range",
      "AI-use details must contain at most 4,000 characters.",
    );
  }
  if (
    typeof disclosure.usedAi !== "boolean" ||
    disclosure.attested !== true
  ) {
    return null;
  }
  return {
    usedAi: disclosure.usedAi,
    attested: true,
    ...(details ? { details } : {}),
  };
}

function validateWorkSample(
  block: CandidateAssessmentBlock,
  payload: unknown,
  issues: CandidateSubmissionIssue[],
): Record<string, unknown> | null {
  if (block.manifest.kind !== "work_sample") return null;
  if (!isRecord(payload) || !Array.isArray(payload.deliverables)) {
    issue(
      issues,
      "body.deliverables",
      "invalid_type",
      "deliverables must be an array.",
    );
    return null;
  }
  const aiUse = validateAiUseDisclosure(
    block.manifest.aiPolicy,
    payload,
    issues,
  );
  const configured = new Set(block.manifest.deliverables);
  const seen = new Set<string>();
  const normalized: Record<string, unknown>[] = [];
  payload.deliverables.forEach((deliverable, index) => {
    const path = `body.deliverables.${index}`;
    if (!isRecord(deliverable) || !isNonEmptyString(deliverable.kind)) {
      issue(issues, path, "invalid_type", "Deliverable kind is required.");
      return;
    }
    if (!configured.has(deliverable.kind as never)) {
      issue(
        issues,
        `${path}.kind`,
        "invalid_option",
        "Deliverable kind is outside the frozen block version.",
      );
      return;
    }
    if (seen.has(deliverable.kind)) {
      issue(
        issues,
        `${path}.kind`,
        "duplicate",
        "Each configured deliverable kind may be submitted once.",
      );
    }
    seen.add(deliverable.kind);
    const valid =
      ((deliverable.kind === "file" ||
        deliverable.kind === "spreadsheet") &&
        isUploadedAsset(deliverable.asset)) ||
      (deliverable.kind === "url" && isUrl(deliverable.url)) ||
      (deliverable.kind === "rich_text" && isNonEmptyString(deliverable.text));
    if (!valid) {
      issue(
        issues,
        path,
        "invalid_format",
        "Deliverable content does not match its configured kind.",
      );
    }
    normalized.push({ ...deliverable });
  });
  for (const kind of configured) {
    if (!seen.has(kind)) {
      issue(
        issues,
        "body.deliverables",
        "required",
        `Missing required "${kind}" deliverable.`,
      );
    }
  }
  return {
    deliverables: normalized,
    ...(aiUse ? { aiUse } : {}),
  };
}

function validateCoding(
  block: CandidateAssessmentBlock,
  payload: unknown,
  issues: CandidateSubmissionIssue[],
): Record<string, unknown> | null {
  if (block.manifest.kind !== "coding") return null;
  if (!isRecord(payload)) {
    issue(issues, "body", "invalid_type", "Submission must be an object.");
    return null;
  }
  const aiUse = validateAiUseDisclosure(
    block.manifest.aiPolicy,
    payload,
    issues,
  );
  if (block.manifest.environment === "browser_ide") {
    if (
      !isNonEmptyString(payload.language) ||
      !block.manifest.languages.includes(payload.language)
    ) {
      issue(
        issues,
        "body.language",
        "invalid_option",
        "Programming language is not enabled for this block.",
      );
    }
    if (!isNonEmptyString(payload.code)) {
      issue(issues, "body.code", "required", "Source code is required.");
    }
    return {
      ...(isNonEmptyString(payload.language)
        ? { language: payload.language }
        : {}),
      ...(isNonEmptyString(payload.code) ? { code: payload.code } : {}),
      ...(isNonEmptyString(payload.notes) ? { notes: payload.notes } : {}),
      ...(aiUse ? { aiUse } : {}),
    };
  }
  if (!isUrl(payload.repositoryUrl)) {
    issue(
      issues,
      "body.repositoryUrl",
      "invalid_format",
      "A valid HTTP(S) repository URL is required.",
    );
  }
  if (!isNonEmptyString(payload.commitSha)) {
    issue(
      issues,
      "body.commitSha",
      "required",
      "An immutable commit identifier is required.",
    );
  }
  return {
    ...(isUrl(payload.repositoryUrl)
      ? { repositoryUrl: payload.repositoryUrl }
      : {}),
    ...(isNonEmptyString(payload.commitSha)
      ? { commitSha: payload.commitSha }
      : {}),
    ...(isNonEmptyString(payload.notes) ? { notes: payload.notes } : {}),
    ...(aiUse ? { aiUse } : {}),
  };
}

function validateCase(
  block: CandidateAssessmentBlock,
  payload: unknown,
  issues: CandidateSubmissionIssue[],
): Record<string, unknown> | null {
  if (block.manifest.kind !== "case_exercise") return null;
  if (!isRecord(payload)) {
    issue(issues, "body", "invalid_type", "Submission must be an object.");
    return null;
  }
  const files =
    Array.isArray(payload.files) && payload.files.every(isUploadedAsset)
      ? payload.files
      : null;
  const links =
    Array.isArray(payload.links) && payload.links.every(isUrl)
      ? payload.links
      : null;
  const hasText = isNonEmptyString(payload.responseText);
  if (
    payload.files !== undefined &&
    files === null
  ) {
    issue(
      issues,
      "body.files",
      "invalid_format",
      "files must contain completed upload references.",
    );
  }
  if (payload.links !== undefined && links === null) {
    issue(
      issues,
      "body.links",
      "invalid_format",
      "links must contain valid HTTP(S) URLs.",
    );
  }
  if (!hasText && !files?.length && !links?.length) {
    issue(
      issues,
      "body",
      "required",
      "Case submission needs text, a file, or a link.",
    );
  }
  return {
    ...(hasText ? { responseText: (payload.responseText as string).trim() } : {}),
    ...(files ? { files: files.map((asset) => ({ ...asset })) } : {}),
    ...(links ? { links: [...links] } : {}),
  };
}

function validateDocuments(
  block: CandidateAssessmentBlock,
  payload: unknown,
  issues: CandidateSubmissionIssue[],
): Record<string, unknown> | null {
  if (block.manifest.kind !== "doc_verification") return null;
  if (!isRecord(payload) || !isRecord(payload.documents)) {
    issue(
      issues,
      "body.documents",
      "invalid_type",
      "documents must be an object keyed by document ID.",
    );
    return null;
  }
  const requiredIds = new Set(
    block.manifest.requiredDocuments.map((document) => document.id),
  );
  validateKnownKeys(payload.documents, requiredIds, issues);
  for (const document of block.manifest.requiredDocuments) {
    const asset = payload.documents[document.id];
    if (!isUploadedAsset(asset)) {
      issue(
        issues,
        `body.documents.${document.id}`,
        "required",
        "A completed document upload reference is required.",
      );
      continue;
    }
    const extension = fileExtension(asset.fileName);
    if (
      block.manifest.acceptedFormats.length > 0 &&
      !block.manifest.acceptedFormats
        .map((format) => format.toLowerCase().replace(/^\./u, ""))
        .includes(extension)
    ) {
      issue(
        issues,
        `body.documents.${document.id}.fileName`,
        "invalid_format",
        "Document format is not accepted for this vacancy version.",
      );
    }
  }
  return {
    documents: Object.fromEntries(
      Object.entries(payload.documents)
        .filter(([, asset]) => isUploadedAsset(asset))
        .map(([id, asset]) => [id, { ...(asset as UploadedAssetRef) }]),
    ),
  };
}

function validateReferences(
  block: CandidateAssessmentBlock,
  payload: unknown,
  issues: CandidateSubmissionIssue[],
): Record<string, unknown> | null {
  if (block.manifest.kind !== "reference_check") return null;
  const manifest = block.manifest;
  if (!isRecord(payload) || !Array.isArray(payload.referees)) {
    issue(
      issues,
      "body.referees",
      "invalid_type",
      "referees must be an array.",
    );
    return null;
  }
  if (payload.referees.length !== manifest.refereeCount) {
    issue(
      issues,
      "body.referees",
      "out_of_range",
      `Exactly ${manifest.refereeCount} referee contact(s) are required.`,
    );
  }
  const normalized: Record<string, unknown>[] = [];
  const seenEmails = new Set<string>();
  payload.referees.forEach((referee, index) => {
    const path = `body.referees.${index}`;
    if (!isRecord(referee)) {
      issue(issues, path, "invalid_type", "Referee must be an object.");
      return;
    }
    const email =
      isNonEmptyString(referee.email) ? referee.email.trim().toLowerCase() : "";
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
    if (!isNonEmptyString(referee.name)) {
      issue(issues, `${path}.name`, "required", "Referee name is required.");
    }
    if (!validEmail) {
      issue(
        issues,
        `${path}.email`,
        "invalid_format",
        "Referee email is invalid.",
      );
    } else if (seenEmails.has(email)) {
      issue(
        issues,
        `${path}.email`,
        "duplicate",
        "Each referee must have a distinct email address.",
      );
    }
    seenEmails.add(email);
    if (
      !isNonEmptyString(referee.relationship) ||
      !manifest.allowedRelationships.includes(
        referee.relationship as "manager" | "peer" | "report",
      )
    ) {
      issue(
        issues,
        `${path}.relationship`,
        "invalid_option",
        "Referee relationship is outside the published options.",
      );
    }
    if (referee.consentConfirmed !== true) {
      issue(
        issues,
        `${path}.consentConfirmed`,
        "required",
        "Candidate must confirm permission to contact this referee.",
      );
    }
    normalized.push({
      ...(isNonEmptyString(referee.name)
        ? { name: referee.name.trim() }
        : {}),
      ...(validEmail ? { email } : {}),
      ...(isNonEmptyString(referee.relationship)
        ? { relationship: referee.relationship }
        : {}),
      consentConfirmed: referee.consentConfirmed === true,
    });
  });
  return { referees: normalized };
}

function validateCustom(
  block: CandidateAssessmentBlock,
  payload: unknown,
  issues: CandidateSubmissionIssue[],
): Record<string, unknown> | null {
  if (block.manifest.kind !== "custom") return null;
  if (!isRecord(payload)) {
    issue(issues, "body", "invalid_type", "Submission must be an object.");
    return null;
  }
  const normalized: Record<string, unknown> = {};
  for (const primitive of block.manifest.primitives) {
    if (primitive === "text") {
      if (!isNonEmptyString(payload.text)) {
        issue(issues, "body.text", "required", "Text response is required.");
      } else {
        normalized.text = payload.text.trim();
      }
    } else if (primitive === "file") {
      if (
        !Array.isArray(payload.files) ||
        payload.files.length === 0 ||
        !payload.files.every(isUploadedAsset)
      ) {
        issue(
          issues,
          "body.files",
          "required",
          "At least one completed file upload is required.",
        );
      } else {
        normalized.files = payload.files.map((asset) => ({ ...asset }));
      }
    } else if (primitive === "recorder") {
      if (
        !Array.isArray(payload.recordings) ||
        payload.recordings.length === 0 ||
        !payload.recordings.every(isNonEmptyString)
      ) {
        issue(
          issues,
          "body.recordings",
          "required",
          "At least one recording reference is required.",
        );
      } else {
        normalized.recordings = [...payload.recordings];
      }
    }
  }
  return normalized;
}

function nextStateForBlock(
  block: CandidateAssessmentBlock,
): CandidateBlockCompletionState {
  if (block.kind === "reference_check") return "awaiting_external_participants";
  if (
    block.scoring.mode === "verification_human_pending" ||
    block.kind === "doc_verification"
  ) {
    return "awaiting_verification";
  }
  if (block.scoring.mode === "ai_assisted_human_pending") {
    return "awaiting_ai_assisted_human_review";
  }
  if (
    block.scoring.mode === "automatic_deterministic" ||
    block.scoring.mode === "mixed_deterministic_and_human_pending"
  ) {
    return "completed_deterministic_human_review";
  }
  if (block.scoring.mode === "unscored") return "completed_unscored";
  return "awaiting_human_review";
}

export function validateCandidateSubmission(
  block: CandidateAssessmentBlock,
  payload: unknown,
  context: CandidateSubmissionContext = {},
): CandidateSubmissionValidation {
  const publishedInteractionSchemaMissing =
    (block.manifest.kind === "custom" &&
      block.manifest.primitives.some((primitive) =>
        ["choice", "grid", "recorder"].includes(primitive),
      )) ||
    (block.manifest.kind === "job_knowledge" &&
      block.manifest.items.some(
        (item) =>
          item.type === "image_hotspot" || item.type === "sequence",
      )) ||
    (block.manifest.kind === "sjt" &&
      block.manifest.items.some((item) => item.mediaKind !== "text"));
  const unavailableIssue: CandidateSubmissionIssue | null =
    publishedInteractionSchemaMissing
      ? {
          path: "block",
          code: "employer_configuration_required",
          message:
            "The frozen block lacks a complete interaction schema or bound media asset and cannot accept a generic response.",
        }
      : block.delivery.state === "external_provider_required"
      ? {
          path: "block",
          code: "external_provider_required",
          message:
            "This instrument must be administered by a configured validated provider; candidate payloads cannot complete it.",
        }
      : block.delivery.state === "human_coordination_required"
        ? {
            path: "block",
            code: "human_coordination_required",
            message:
              "This stage is completed through employer scheduling and a named human scorecard.",
          }
        : block.delivery.state === "employer_configuration_required"
          ? {
              path: "block",
              code: "employer_configuration_required",
              message:
                "The employer must complete this block's delivery schema before candidates can use it.",
            }
          : block.delivery.state === "deferred_candidate_input" &&
              !context.deferredBlockUnlocked
            ? {
                path: "block",
                code: "block_not_open",
                message:
                  "This verification block is not open at the candidate's current stage.",
              }
            : null;
  if (unavailableIssue) {
    return {
      ok: false,
      blockId: block.id,
      kind: block.kind,
      issues: [unavailableIssue],
    };
  }

  const issues: CandidateSubmissionIssue[] = [];
  let normalized: Record<string, unknown> | null = null;
  switch (block.kind) {
    case "application_form":
      normalized = validateApplicationForm(block, payload, issues);
      break;
    case "knockout":
      normalized = validateKnockout(block, payload, issues);
      break;
    case "cv_intake":
      normalized = validateCv(block, payload, issues);
      break;
    case "async_interview":
    case "chat_interview":
      normalized = validateInterviewAnswers(block, payload, issues);
      break;
    case "live_ai_interview":
      normalized = validateLiveInterview(block, payload, issues);
      break;
    case "sjt":
      normalized = validateSjt(block, payload, issues);
      break;
    case "job_knowledge":
      normalized = validateJobKnowledge(block, payload, issues);
      break;
    case "work_sample":
      normalized = validateWorkSample(block, payload, issues);
      break;
    case "coding":
      normalized = validateCoding(block, payload, issues);
      break;
    case "case_exercise":
      normalized = validateCase(block, payload, issues);
      break;
    case "doc_verification":
      normalized = validateDocuments(block, payload, issues);
      break;
    case "reference_check":
      normalized = validateReferences(block, payload, issues);
      break;
    case "custom":
      normalized = validateCustom(block, payload, issues);
      break;
    case "cognitive":
    case "personality":
    case "integrity_test":
    case "language_test":
    case "human_stage":
      // Delivery-state guards above always return before this switch.
      break;
  }
  if (!normalized && issues.length === 0) {
    issue(
      issues,
      "body",
      "employer_configuration_required",
      "No candidate submission contract exists for this block state.",
    );
  }
  if (issues.length > 0 || !normalized) {
    return {
      ok: false,
      blockId: block.id,
      kind: block.kind,
      issues,
    };
  }
  return {
    ok: true,
    blockId: block.id,
    kind: block.kind,
    normalized,
    nextState: nextStateForBlock(block),
  };
}
