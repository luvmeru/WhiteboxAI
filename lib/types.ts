/* ============================================================
   WHITEBOX AI — OBJECT MODEL
   Source of truth: SPEC.md §3 (+ §4.4 block settings, §8 engine,
   §9 dispatch). Evidence base: RESEARCH.md (R-* citations).
   Legacy P0/P1 shapes are kept intact — fixtures re-export them.
   ============================================================ */

/* ———————————————————————— core scalars ———————————————————————— */

export type ConfidenceBand = "High" | "Medium" | "Low";
export type Tier = "Top" | "Mid" | "Bottom";
export type VerificationStatus = "VERIFIED" | "PENDING" | "—";
/* SPEC §3 — full lifecycle; legacy P0/P1 used the DRAFT/LIVE/CLOSED subset */
export type VacancyStatus = "DRAFT" | "IN_REVIEW" | "LIVE" | "PAUSED" | "CLOSED" | "ARCHIVED";

/* ———————————————————————— legacy P0/P1 shapes (retained) ———————————————————————— */

export interface EvidenceSpan {
  quote: string;
  timestamp: string; // mm:ss into interview
  question: string;
}

export interface Driver {
  text: string;
  impact: number; // 0..1, principal reason first (FICO reason-code model)
  direction: "pos" | "neg";
}

export interface CompetencyScore {
  id: string;
  name: string;
  score: number; // 0..100
  weight: number; // % of overall
  drivers: Driver[];
  confidence: ConfidenceBand;
  confidenceReason: string; // confidence is a phrase, never a bare number
  evidence: EvidenceSpan[];
  trace: string[];
  docVerified?: boolean;
  abstained?: boolean;
}

export type AuditAction =
  | "SCORED" | "APPROVED" | "REJECTED" | "ESCALATED" | "OVERRIDDEN" | "REVEALED"
  | "PUBLISHED" | "RECOMPUTED" | "DISPATCH_APPROVED" | "DISPATCH_SENT" | "CONSENTED" | "SUBMITTED";

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: AuditAction;
  target: string;
  reason?: string;
  modelVer: string;
  hash: string; // append-only, each entry hashes the previous
}

export interface Candidate {
  applicationId?: string;
  internalId: string;
  /**
   * Ordinal position among complete, rank-eligible evaluations only.
   * Incomplete evaluations are shown in a separate review queue and never
   * receive a synthetic place at the bottom of the ranking.
   */
  rank: number | null;
  overall: number;
  /**
   * A substantive threshold tier exists only for complete evaluations.
   * `null` means the frozen evidence policy withheld threshold comparison.
   */
  tier: Tier | null;
  confidence: ConfidenceBand;
  confidencePhrase: string;
  verification: VerificationStatus;
  divergence: boolean;
  appliedAt: string;
  evaluationComplete?: boolean;
  evaluationCoverage?: number;
  competencies: CompetencyScore[];
  strengths: string[];
  weaknesses: string[];
  audit: AuditEntry[];
}

export interface Vacancy {
  id: string;
  title: string;
  status: VacancyStatus;
  code: string;
  configVersion: number;
  candidates: number;
  needReview: number;
  funnel: number[];
}

/* ———————————————————————— criteria architecture (SPEC §4.3) ———————————————————————— */

export type AttributeKind = "skill" | "trait" | "knowledge" | "qualification" | "experience" | "language";
export type VerificationMethod =
  | "self_report"
  | "interview"
  | "test"
  | "document"
  | "reference"
  | "work_sample"
  | "human_observation";
export type CriterionPriority = "essential" | "important" | "supporting";

export interface AttributeEvidenceRequirement {
  priority: CriterionPriority;
  targetLevel: 1 | 2 | 3 | 4 | 5;
  methods: VerificationMethod[];
  minIndependentSources: 1 | 2 | 3;
  requiredForDecision: boolean;
  notes: string[];
  specialRequirements: string[];
}

/* 5 levels, each with a concrete BARS behavioral anchor (R-I.2) */
export interface ProficiencyScale {
  anchors: [string, string, string, string, string];
}

export interface MustHave {
  rule:
    | "min_years" | "certification" | "license" | "language_level"
    | "location" | "work_auth" | "min_scale_level" | "custom_bool";
  value: string | number;
  label: string; // candidate-visible, legally neutral wording
  humanRecoverable: true; // knockouts land in a tray, never the void (SPEC §4.3.2)
}

export type TaxonomySystem = "ONET" | "ESCO" | "SFIA" | "UCF" | "custom";

export interface AttributeSpec {
  id: string;
  name: string;
  kind: AttributeKind;
  definition: string; // one-sentence observable definition, injected into rubrics/prompts
  weight: number; // share within category, sums to 100
  focus?: boolean; // max 5 per vacancy; priority coverage + tie-breaking
  mustHave?: MustHave;
  scale: ProficiencyScale;
  verification: "self_report" | "interview" | "test" | "document" | "reference";
  /**
   * Multi-source evidence policy. `verification` remains the primary legacy
   * method; this policy is the source of truth for newly published vacancies.
   */
  evidenceRequirement?: AttributeEvidenceRequirement;
  taxonomyRef?: { system: TaxonomySystem; code: string };
  rationale?: string; // "why this" — every generated field explains itself
}

export interface CategorySpec {
  id: string;
  name: string;
  weight: number; // sums to 100 across categories
  attributes: AttributeSpec[];
  rationale?: string;
}

/* ———————————————————————— pipeline blocks (SPEC §4.4) ———————————————————————— */

export type BlockKind =
  | "application_form" | "knockout" | "cv_intake"
  | "async_interview" | "live_ai_interview" | "chat_interview"
  | "sjt" | "cognitive" | "personality" | "integrity_test" | "job_knowledge" | "language_test"
  | "work_sample" | "coding" | "case_exercise"
  | "doc_verification" | "reference_check" | "human_stage" | "custom";

export type BlockGroup = "screening" | "interviews" | "tests" | "simulations" | "verification";
export type EvidenceLevel = "meta-analytic" | "vendor-validated" | "experimental";
export type IntegrityTier = 0 | 1 | 2 | 3; // §4.4.0: tier 3 only on final blocks, always disclosed

export interface AccessibilityConfig {
  extraTimeMultiplier: 1 | 1.25 | 1.5 | 2 | "untimed";
  captions: boolean;
  screenReaderMode: boolean;
  alternativeFormats: boolean;
}

/* —— shared question/rubric shapes (interviews §4.4.4–6) —— */

export type QuestionType = "behavioral" | "situational" | "background" | "job_knowledge" | "motivation";
export type ResponseModality = "video" | "audio" | "text";
export type AuthorSource = "bank" | "ai" | "manual";

export interface Rubric {
  id: string;
  attributeId: string; // tied to exactly one attribute
  anchors: [string, string, string, string, string]; // BARS 1..5
  version: number; // rubric lock at publish; edits ⇒ new configVersion (§4.4.4)
}

export interface InterviewQuestion {
  id: string;
  text: string;
  attributeId: string; // exactly one primary
  secondaryAttributeId?: string; // contextual observation only; needs its own anchored item to score
  type: QuestionType;
  thinkTimeSec: 0 | 30 | 60 | 120 | null; // null = untimed
  answerCapSec: number; // 30..300
  modality: ResponseModality;
  reRecordAttempts: 0 | 1 | 2 | 3;
  notesAllowed: boolean;
  probes: string[]; // pre-approved anchored probes only (R-I.8)
  clarification?: string; // pre-approved equivalent rephrase, same construct and rubric
  situationalFallback?: string; // pre-approved equivalent scenario when no past example exists
  rubric: Rubric;
  source: AuthorSource;
  rationale?: string;
}

/* —— per-kind settings (discriminated on `kind`) —— */

export type FormFieldType =
  | "short_text" | "long_text" | "single_choice" | "multi_choice" | "dropdown"
  | "date" | "number" | "file" | "url" | "consent";

export interface FormField {
  id: string;
  attributeId?: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  pii: boolean; // masked in review (blind-by-default, §1.7)
  scored: boolean;
  options?: { id: string; text: string; points?: number }[]; // rational biodata keys at launch
}

export interface ApplicationFormSettings {
  kind: "application_form";
  fields: FormField[];
  prefillFromCv: boolean;
  /** Legacy metadata only. No duplicate-detection runtime is implied. */
  dedupeRule?: "email_vacancy_resume";
}

export type KnockoutItemType = "yes_no" | "numeric_threshold" | "single_choice" | "multi_must_include";

export interface KnockoutItem {
  id: string;
  question: string;
  type: KnockoutItemType;
  /* yes_no: pass value; numeric: min threshold; choices: disqualifying / must-include option ids */
  passValue?: boolean;
  threshold?: number;
  options?: { id: string; text: string; disqualifies?: boolean; mustInclude?: boolean }[];
  immediate: boolean; // disqualifies now vs routes to knockout review tray
  rejectionText: string; // candidate-visible, legally neutral
  allowAppeal: boolean; // "explain your answer" → human tray
  mustHaveId?: string; // generated from a criteria must-have floor
}

export interface KnockoutSettings {
  kind: "knockout";
  items: KnockoutItem[];
  placement: "before_form" | "after_form";
}

export interface CvIntakeSettings {
  kind: "cv_intake";
  acceptedFormats: ("pdf" | "docx")[];
  maxSizeMb: number;
  parseTargets: ("employment" | "education" | "certifications" | "skills" | "publications" | "links")[];
  anonymizeForReview: boolean; // ON by default (R-I.6)
  extractClaims: boolean; // claims ledger → probes + doc checks
  portfolioUrlField: boolean;
}

export interface AsyncInterviewSettings {
  kind: "async_interview";
  questions: InterviewQuestion[]; // 3–12 scored
  followUpPolicy: 0 | 1 | 2; // anchored probing levels
  order: "fixed" | "randomized";
  introVideo: "recruiter" | "ai_presenter" | "none";
  introScript?: string;
  practiceQuestion: boolean; // publishable only when an unscored capture flow exists
  pauseAllowance: 0 | 1 | 2; // pauses ≤ 5 min
  reviewBeforeSubmit: boolean; // off default for video, on for text
}

export interface LiveAiInterviewSettings {
  kind: "live_ai_interview";
  durationCapMin: number; // 10–45
  persona: { name: string; voice: "neutral" | "warm" | "formal"; disclosedAsAi: true };
  questions: InterviewQuestion[];
  adaptivity: "probe_only" | "probe_reorder"; // free-form generation not offered (R-I.8)
  latencyFallback: "async" | "chat";
  bargeInAllowed: boolean;
}

export interface ChatInterviewSettings {
  kind: "chat_interview";
  questions: InterviewQuestion[]; // 4–8 open
  minAnswerWords: number;
  maxAnswerWords: number;
  typingTelemetry: boolean;
  pastePolicy: "allow" | "warn" | "block";
  followUpPolicy: 0 | 1 | 2;
  tone: "neutral" | "warm";
}

export type SjtFormat = "pick_best" | "pick_best_worst" | "rank_all" | "rate_each";
export type SjtInstruction = "knowledge" | "behavioral_tendency"; // loads cognitive vs personality (R-I.4)
export type SjtKeyType = "sme" | "consensus" | "hybrid";

export interface SjtOption {
  id: string;
  text: string;
  keyScore: number; // SME/hybrid option score
}

export interface SjtItem {
  id: string;
  scenario: string;
  mediaKind: "text" | "image" | "video";
  options: SjtOption[]; // 4–6
  attributeId: string;
  smeReviewed: boolean; // generated items require SME checklist before scoreable (R-I.8)
}

export interface SjtSettings {
  kind: "sjt";
  instruction: SjtInstruction;
  format: SjtFormat;
  keyType: SjtKeyType;
  items: SjtItem[]; // 6–20
  timing: "untimed" | "soft_per_item";
  randomizeOrder: boolean;
  pilotMode: boolean;
}

export type CognitiveSubtest = "numerical" | "verbal" | "logical" | "spatial" | "working_memory" | "attention";

export interface CognitiveSettings {
  kind: "cognitive";
  subtests: CognitiveSubtest[];
  criterionMappings?: {
    unit: CognitiveSubtest;
    attributeId: string;
  }[];
  itemsPerSubtest: number; // 6–15
  adaptive: boolean;
  totalTimeMin: number;
  calculatorAllowed: boolean;
  practiceItems: 2; // unscored, mandatory
}

export interface PersonalitySettings {
  kind: "personality";
  model: "big_five" | "hexaco";
  lengthItems: 60 | 120 | 200;
  format: "likert" | "forced_choice"; // forced-choice default (faking-resistant, R-I.4)
  contextualizedAtWork: boolean;
  traitMappings: { traitId: string; attributeId: string; evidenceLevel: EvidenceLevel }[];
  candidateFeedbackReport: boolean; // Sapia-style "My Insights"
}

export interface IntegrityTestSettings {
  kind: "integrity_test";
  domains: ("rule_adherence" | "safety" | "dependability" | "cwb_attitudes")[];
  criterionMappings?: {
    unit: "rule_adherence" | "safety" | "dependability" | "cwb_attitudes";
    attributeId: string;
  }[];
  lengthItems: number;
  format: "likert" | "forced_choice";
}

export type KnowledgeItemType = "mcq_single" | "mcq_multi" | "true_false_justify" | "short_answer" | "image_hotspot" | "sequence";

export interface KnowledgeItem {
  id: string;
  type: KnowledgeItemType;
  prompt: string;
  options?: { id: string; text: string; correct?: boolean }[];
  modelAnswer?: string; // short_answer: AI-scored vs model answer + key points
  keyPoints?: string[];
  difficulty: "easy" | "medium" | "hard";
  attributeId: string;
}

export interface JobKnowledgeSettings {
  kind: "job_knowledge";
  items: KnowledgeItem[];
  timing: "per_item" | "total";
  totalTimeMin?: number;
  difficultyMix: { easy: number; medium: number; hard: number }; // %
  openBook: boolean; // changes construct: knowledge → retrieval (labeled)
}

export type CefrLevel = "A2" | "B1" | "B2" | "C1" | "C2";

export interface LanguageTestSettings {
  kind: "language_test";
  language: string;
  skills: ("reading" | "listening" | "writing" | "speaking")[];
  criterionMappings?: {
    unit: "reading" | "listening" | "writing" | "speaking";
    attributeId: string;
  }[];
  targetLevel: CefrLevel;
  minutesPerSkill: number;
}

export type AiUsePolicy = "forbidden" | "disclosed" | "expected"; // §4.4.13, disclosed verbatim

export interface RubricDimension {
  id: string;
  /**
   * Criterion scored by this dimension. It remains optional only so frozen
   * single-criterion legacy vacancies can be migrated without changing their
   * meaning; new multi-criterion blocks must bind every dimension explicitly.
   */
  attributeId?: string;
  /**
   * Coding rubrics additionally bind each dimension to one published scoring
   * area. It remains optional so already-frozen legacy vacancies can still be
   * evaluated; publication preflight requires it on newly published coding
   * blocks.
   */
  codingScoringArea?: "correctness" | "quality" | "approach";
  name: string;
  /**
   * Relative dimension weight. Coding dimensions are normalized within their
   * codingScoringArea before the cross-area scoringSplit is applied.
   */
  weight: number;
  anchors: [string, string, string, string, string];
}

export interface WorkSampleSettings {
  kind: "work_sample";
  brief: string;
  deliverables: ("file" | "url" | "rich_text" | "spreadsheet")[];
  timeModel: "honesty_window" | "hard_timer";
  timeBudgetHours: number;
  aiPolicy: AiUsePolicy;
  originalityCheck: boolean;
  anonymizedGrading: boolean;
  rubricDimensions: RubricDimension[]; // 2–6
  defenseFollowUp: boolean; // auto-adds 2 probes to next interview block (R-IV.4)
}

export interface CodingSettings {
  kind: "coding";
  environment: "browser_ide" | "take_home_repo";
  languages: string[];
  taskSource: "bank" | "custom" | "ai_sme_reviewed";
  brief: string;
  scoringSplit: { correctness: number; quality: number; approach: number }; // %
  timeCapMin: number;
  aiPolicy: AiUsePolicy;
  similarityCheck: boolean;
  rubricDimensions: RubricDimension[];
}

export interface CaseExerciseSettings {
  kind: "case_exercise";
  format: "case_analysis" | "in_basket" | "role_play" | "presentation";
  materials: string;
  timeBoxMin: number;
  itemCount?: number; // in-basket 8–15
  personaScript?: string; // role-play AI counterpart, disclosed
  rubricDimensions: RubricDimension[]; // exercise-level scoring (exercise effect, R-I.4)
}

export interface DocVerificationSettings {
  kind: "doc_verification";
  requiredDocuments: { id: string; label: string; qualificationAttributeId?: string }[];
  acceptedFormats: string[];
  /**
   * `manual_document_review` lets a named reviewer assess whether the
   * submitted contents meet the published requirement. It does not claim
   * external authenticity. `auto_extract_match` remains pending until a
   * connected provider creates a server-owned result receipt.
   */
  mode: "manual_document_review" | "auto_extract_match";
  idCheck: boolean; // tier 3, optional here
  placement: "in_flow" | "post_shortlist";
}

export interface ReferenceCheckSettings {
  kind: "reference_check";
  referees: { count: 1 | 2 | 3 | 4; relationships: ("manager" | "peer" | "report")[] };
  questionnaire: { id: string; text: string; attributeId?: string; type: "rating" | "open" }[];
  collectionWindowDays: number;
  fraudControls: boolean;
  anonymizedAggregation: boolean; // when ≥3 referees
}

export interface HumanStageSettings {
  kind: "human_stage";
  panel: string[]; // interviewer names/roles
  selfBooking: boolean;
  bookingUrl?: string;
  /**
   * Reserved legacy control. New publication fails closed when enabled until a
   * generated-kit approval receipt and frozen panel-delivery runtime exist.
   */
  interviewKitAuto: boolean;
  independentBeforeDiscussion: true; // R-I.2 #13
  aiNotetaker: boolean; // consented, draft scorecard for human edit
}

export interface CustomBlockSettings {
  kind: "custom";
  instructions: string;
  primitives: ("recorder" | "text" | "choice" | "file" | "grid")[];
  rubricDimensions: RubricDimension[];
}

export type BlockSettings =
  | ApplicationFormSettings | KnockoutSettings | CvIntakeSettings
  | AsyncInterviewSettings | LiveAiInterviewSettings | ChatInterviewSettings
  | SjtSettings | CognitiveSettings | PersonalitySettings | IntegrityTestSettings
  | JobKnowledgeSettings | LanguageTestSettings
  | WorkSampleSettings | CodingSettings | CaseExerciseSettings
  | DocVerificationSettings | ReferenceCheckSettings | HumanStageSettings | CustomBlockSettings;

export interface PipelineBlock {
  id: string;
  kind: BlockKind;
  order: number;
  title: string; // internal
  candidateIntro: string; // states what's measured + why job-relevant (justice rule, R-I.7)
  required: boolean; // optional blocks never gate
  scored: boolean; // informational blocks excluded from composite
  estimatedMinutes: number;
  gate?: { minBlockScore?: number; mustHaveIds?: string[] }; // hurdle before next block
  measures: { attributeId: string; share: number }[]; // shares sum 100 per block
  settings: BlockSettings;
  integrityTier: IntegrityTier;
  accessibility: AccessibilityConfig;
  languageOverride?: string;
  retakePolicy: 0 | 1 | 2; // whole-block retakes for technical failure
  deadlineOffsetHours?: number;
  evidenceRole?: "primary" | "corroborating" | "verification" | "context";
  assessorInstructions?: string;
  internalNotes?: string[];
  tags?: string[];
  validation?: {
    strategy: "content" | "criterion" | "construct" | "transport";
    status: "draft" | "sme_reviewed" | "pilot" | "locally_validated";
    scoreUse: "context_only" | "decision_support" | "selection";
    evidenceRefs: string[];
    reviewedBy?: string;
    reviewedAt?: string;
    applicabilityNote?: string;
  };
}

/* ———————————————————————— scoring policy (SPEC §4.5) ———————————————————————— */

export interface ScoringPolicy {
  topology: "compensatory" | "multiple_hurdle" | "hybrid";
  weighting: "rational" | "unit" | "pareto_assist"; // R-I.5, R-I.6
  threshold: number; // pass mark 0..100
  banding?: { enabled: boolean; sedWidth: number };
  tieBreakers: ("focus_attributes" | "work_sample" | "earlier_submission")[];
  anonymization: { maskPII: boolean; revealAtStage: "decision" | "invited" };
  abstainPolicy: { minEvidencePerAttribute: number; onAbstain: "flag_human" };
  normalization: "absolute_rubric"; // rubric-referenced, never cohort-normed silently
  aggregation?: {
    acrossSources:
      | "evidence_weighted_mean"
      | "conservative_floor"
      | "highest_quality_source";
    contradictoryEvidence: "flag_human" | "use_lower_confidence";
    optionalBlocks: "exclude_if_missing" | "include_when_completed";
    minimumCoveragePct: number;
  };
}

/* ———————————————————————— position profile (SPEC §4.2) ———————————————————————— */

export type Seniority = "Intern" | "Junior" | "Middle" | "Senior" | "Lead" | "Head" | "Executive";
export type EmploymentType = "full_time" | "part_time" | "contract" | "internship" | "seasonal" | "shift";
export type WorkMode = "on_site" | "hybrid" | "remote_country" | "remote_global";
export type IndustryPack =
  | "tech" | "sales_cs" | "healthcare" | "finance" | "retail_hourly"
  | "manufacturing" | "logistics" | "creative" | "public_sector" | "education" | "custom";

export interface PositionProfile {
  title: string;
  requisitionId?: string;
  department?: string;
  hiringManager?: string;
  openings: number;
  seniority: Seniority;
  employmentType: EmploymentType;
  workMode: WorkMode;
  locations: string[];
  timezoneOverlap?: string;
  compensation?: { min: number; max: number; currency: string; period: "year" | "month" | "hour"; visible: boolean };
  taxonomyRef?: { system: TaxonomySystem; code: string; label: string };
  mission: string; // 1–3 sentences, landing + evaluation prompt context
  responsibilities: string[];
  teamContext?: string;
  successOutcomes?: string[];
  operatingConstraints?: string[];
  stakeholderGroups?: string[];
  specialRequirements?: string[];
  internalComments?: string[];
  tags?: string[];
  industryPack: IndustryPack;
  languages: { primary: string; alternates: string[] };
}

export interface AssessmentDesignConfig {
  purpose: "selection" | "screening" | "internal_mobility" | "development";
  jobAnalysis: {
    method:
      | "structured_workshop"
      | "critical_incidents"
      | "task_inventory"
      | "competency_model"
      | "mixed";
    sources: string[];
    criticalWorkOutputs: string[];
    approvedBy?: string;
    approvedAt?: string;
  };
  validation: {
    monitoringMode: "prelaunch_review" | "pilot" | "operational";
    outcomeCriteria: string[];
    reviewCadenceDays: number;
    minimumSampleForAnalysis: number;
    adverseImpactMonitoring: boolean;
  };
  decisionPolicy: {
    humanFinalDecision: true;
    allowAutomatedRejection: false;
    requireReasonCode: true;
    requireEvidenceCitation: true;
  };
}

/* ———————————————————————— candidate experience (SPEC §4.6) ———————————————————————— */

export interface CandidateExperienceConfig {
  landing: {
    coverDesignId?: string;
    showCompensation: boolean;
    companyBlurb: string;
    biasAuditUrl?: string;
  };
  notices: {
    jurisdictionProfile: string; // e.g. "EU", "US-NYC", "KZ"
    aiDisclosure: string;
    retentionDays: number;
    consentCheckpoints: ("entry" | "recorded_blocks" | "integrity_tier")[];
    version: number;
  };
  comms: {
    confirmationEnabled: boolean;
    reminderCadence: 0 | 1 | 2; // max 2 before deadline (R-IV.3)
    dispositionSlaDays: number; // default 5 business days (R-I.7)
    feedbackOffer: boolean; // on-request structured explanation (R-IV.5)
    senderIdentity: "org" | "recruiter";
  };
  tone: "formal" | "neutral" | "warm";
}

/* ———————————————————————— governance (SPEC §4.7) ———————————————————————— */

export type Role = "Owner" | "HiringManager" | "TechnicalReviewer" | "Observer";

export interface GovernanceConfig {
  roles: { userId: string; name: string; role: Role; piiReveal: boolean }[];
  reviewPolicy: { independentReviews: 1 | 2 | 3; assignment: "round_robin" | "by_expertise" };
  calibrationRequired: boolean; // FOR module before first live review (R-I.5)
  dualControlThreshold: number; // batches above N need second approver
  slaTargets: { reviewQueueHours: number; dispositionDays: number };
  changeControl: { editLive: Role[]; pauseClose: Role[] };
}

/* ———————————————————————— distribution (SPEC §6) ———————————————————————— */

export type Channel = "linkedin" | "indeed" | "hh" | "referral" | "university" | "qr_poster" | "custom";

export interface ChannelLink {
  channel: Channel;
  url: string;
  codeSuffix: string; // spoken/print variant: WBX-3F8N·LI
  clicks?: number;
}

/* ———————————————————————— vacancy v2 (SPEC §3) ———————————————————————— */

export interface VacancyV2 {
  id: string;
  code: string; // WBX- + 4 base-32 chars
  status: VacancyStatus;
  configVersion: number; // immutable once live; changes create a new version
  /**
   * Server-owned rollout marker. Historical vacancy configs intentionally do
   * not have this field and keep their deterministic evaluation behavior.
   * New vacancy IDs are stamped at first publication and require the real
   * provider for every AI-derived result.
   */
  aiExecution?: {
    mode: "openai_required";
    policyVersion: "openai-required-v1";
    assignedAt: string;
  };
  profile: PositionProfile;
  categories: CategorySpec[];
  pipeline: PipelineBlock[];
  scoring: ScoringPolicy;
  experience: CandidateExperienceConfig;
  governance: GovernanceConfig;
  assessmentDesign?: AssessmentDesignConfig;
  distribution: ChannelLink[];
  window: { opensAt: string; closesAt: string; timezone: string };
  capacity?: { maxSubmissions?: number };
  rollingReview: boolean;
  audit: AuditEntry[];
  createdAt: string;
  publishedAt?: string;
}

/* ———————————————————————— presets (SPEC §5) ———————————————————————— */

export type PresetScope =
  | "vacancy" | "criteria" | "block" | "question_set" | "rubric_set"
  | "item_bank" | "email_pack" | "cover_design" | "notice_pack";

export interface Preset {
  id: string;
  scope: PresetScope;
  name: string;
  description: string;
  version: string; // semver-ish
  provenance?: string; // "derived from vacancy v-teamlead cv7"
  builtIn: boolean;
  payload: unknown; // shape depends on scope; vacancy scope = Partial<VacancyV2>
}

/* ———————————————————————— evaluation engine (SPEC §8) ———————————————————————— */

export interface EvidenceChip {
  id: string;
  quote: string; // verbatim fragment
  locator: string; // timestamp mm:ss, line ref, or item id
  blockId: string;
  question?: string;
}

export interface ReasoningStep {
  step: number;
  text: string;
}

export type IntegritySignalLevel = "none" | "low" | "medium";

export interface IntegritySignal {
  id: string;
  kind:
    | "tab_switch"
    | "paste"
    | "latency"
    | "similarity"
    | "liveness"
    | "ai_text"
    | "typing_pattern";
  level: IntegritySignalLevel;
  note: string; // neutral wording — advisory context, never a verdict
}

export interface EngineStamp {
  model: string;
  promptId: string;
  promptVersion: string;
  rubricVersion: string;
  runs: number; // k self-consistency runs
  scoredAt: string;
  providerResponseId?: string;
}

export interface ItemScore {
  itemId: string;
  itemLabel: string; // question text / dimension name
  attributeId: string;
  level: 1 | 2 | 3 | 4 | 5; // vs BARS
  score: number; // 0..100 mapping
  evidence: EvidenceChip[]; // ≥1 quote with locator, or abstain
  drivers: Driver[];
  confidence: ConfidenceBand;
  confidenceReason: string;
  abstained: boolean; // abstain → human tray, not a low score
  starAnnotation?: { situation: boolean; task: boolean; action: boolean; result: boolean };
  runDisagreement?: boolean; // self-consistency runs disagreed > 1 level
}

export interface BlockResult {
  blockId: string;
  itemScores: ItemScore[];
  blockScore: number; // 0..100
  confidence: ConfidenceBand;
  confidenceReason: string;
  drivers: Driver[];
  evidence: EvidenceChip[];
  reasoning: ReasoningStep[];
  integrity: IntegritySignal[];
  engine: EngineStamp;
}

export interface Contradiction {
  claim: string;
  sourceA: string; // quoted, with block ref
  sourceB: string;
  severity: "note" | "review";
}

export interface ClaimRecord {
  id: string;
  text: string; // "led team of 8", "AWS cert 2024"
  sourceBlockId: string;
  sourceItemId?: string;
  sourceVacancyId?: string;
  sourceVacancyVersion?: number;
  material: boolean;
  status: "VERIFIED" | "NOT_VERIFIED" | "UNCHECKED";
}

export interface EvaluationGateResult {
  blockId: string;
  blockTitle: string;
  topology: ScoringPolicy["topology"];
  configured: boolean;
  status: "not_applicable" | "pending" | "passed" | "failed";
  minimumBlockScore: number | null;
  actualBlockScore: number | null;
  mustHaveIds: string[];
  failedMustHaveIds: string[];
  pendingMustHaveIds: string[];
  requiresAdjudication: boolean;
  reason: string;
  waiver: {
    outcome: "none" | "waived" | "upheld" | "conflict";
    reviewIds: string[];
  };
}

export interface CandidateEvaluation {
  perBlock: BlockResult[];
  attributeScores: CompetencyScore[];
  categoryScores: { categoryId: string; score: number }[];
  overall: number;
  complete?: boolean;
  coverage?: number;
  /**
   * Frozen policies prohibit a substantive tier while required evidence is
   * incomplete. Historical complete evaluations retain their existing tier.
   */
  tier: Tier | null;
  confidence: ConfidenceBand;
  confidencePhrase: string;
  synthesis: {
    strengths: string[];
    risks: string[];
    contradictions: Contradiction[];
    narrative: string; // 6–10 sentences, cites chip ids
  };
  mustHaveResults: { id: string; passed: boolean; evidence: string }[];
  gateResults?: EvaluationGateResult[];
  claims: ClaimRecord[];
  engine: EngineStamp;
}

/* ———————————————————————— candidate journey runtime (SPEC §7) ———————————————————————— */

export type ApplicationStage =
  | "in_progress" | "submitted" | "under_review" | "shortlisted" | "invited"
  | "offer" | "hired" | "not_moving_forward" | "knocked_out" | "needs_adjudication" | "withdrawn";

/* What a block runtime hands back when the candidate completes it.
   payload shape depends on kind (answers, transcript turns, uploads, choices). */
export interface BlockRuntimeResult {
  blockId: string;
  kind: BlockKind;
  completedAt: string;
  elapsedSec: number;
  payload: unknown;
  transcript?: { speaker: "ai" | "candidate"; text: string; at: string; itemId?: string; kind?: "main" | "followup" }[];
  integrityEvents: IntegritySignal[];
  /**
   * Server-created evidence pointers. Candidate payloads are never copied into
   * this namespace and browsers cannot assert these receipts.
   */
  serverEvidence?: {
    documentVerifications?: {
      receiptId: string;
      providerId: string;
      providerVersion: string;
      responseHash: string;
      verifiedAt: string;
      sourceItemIds: string[];
      outcome: "verified" | "not_verified";
    }[];
    referenceResponses?: {
      receiptId: string;
      invitationId: string;
      refereeOrdinal: number;
      questionnaireHash: string;
      responseHash: string;
      respondedAt: string;
      sourceItemIds: string[];
    }[];
  };
}

export interface ApplicationRecord {
  id: string;
  vacancyId: string;
  code: string;
  source?: string; // first-touch channel tag
  candidate: { internalId: string; email?: string; displayName?: string }; // PII masked in review
  stage: ApplicationStage;
  consent: { noticeVersion: number; at: string } | null;
  blockResults: BlockRuntimeResult[];
  currentBlockIndex: number;
  evaluation?: CandidateEvaluation;
  knockedOutBy?: string; // knockout item id → "Knocked out" tray
  createdAt: string;
  submittedAt?: string;
  slaDate?: string; // disposition promise shown to candidate
  audit: AuditEntry[];
}

/* ———————————————————————— dispatch (SPEC §9.4) ———————————————————————— */

export type DispatchAction = "invite" | "reject" | "hold" | "custom";

export interface EmailTemplate {
  id: string;
  name: string;
  action: DispatchAction;
  subject: string;
  body: string; // merge fields: {{first_name}} {{role_title}} {{company}} {{schedule_link}} {{sla_date}} {{explanation_link}}
}

export interface DispatchBatch {
  id: string;
  vacancyId: string;
  selection: { mode: "top_n" | "threshold" | "band" | "manual"; value?: number; candidateIds: string[] };
  action: DispatchAction;
  templateId: string;
  scheduledAt?: string;
  approvals: { userId: string; role: Role; at: string }[]; // dual-control per governance
  status: "draft" | "pending_approval" | "approved" | "sending" | "sent" | "cancelled";
  provider: "gmail_oauth" | "transactional";
  createdAt: string;
  impactPreview?: { segment: string; ratio: number }[]; // bias check at the moment of choice (R-I.6)
}

/* ———————————————————————— preflight (SPEC §4.8) ———————————————————————— */

export interface PreflightIssue {
  id: string;
  severity: "blocker" | "warning";
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  message: string;
  overridable: boolean; // warnings only, with a logged reason
}

/* ———————————————————————— local store keys (prototype persistence) ———————————————————————— */

export const STORE_KEYS = {
  vacancies: "wbx:v2:vacancies",
  draft: "wbx:v2:studio-draft",
  applications: "wbx:v2:applications",
  presets: "wbx:v2:presets",
  dispatch: "wbx:v2:dispatch",
  legacyPublished: "wbx-published", // P0/P1 compat: simple {title, code, competencies}
} as const;
