import type { IntegritySignal, ResponseModality } from "./types";

/**
 * Provider-neutral contracts shared by browser, route, repository, and AI
 * provider code. This module contains no model calls or generated content.
 */

export interface GeneratedField<T> {
  value: T;
  rationale: string;
}

export interface CompetencyConfigItem {
  name: string;
  weight: number;
  rationale: string;
  focus: boolean;
}

export interface VacancyConfig {
  categories: CompetencyConfigItem[];
  interviewType: GeneratedField<
    "adaptive-text" | "adaptive-video" | "adaptive-voice"
  >;
  questionDepth: GeneratedField<"standard" | "deep" | "expert">;
  requiredDocuments: GeneratedField<string[]>;
  passThreshold: GeneratedField<number>;
  languages: GeneratedField<string[]>;
}

export interface NlToConfigRequest {
  title: string;
  description: string;
}

export interface NlToConfigResponse {
  config: VacancyConfig;
  modelVer: string;
  promptVer: string;
}

export type ProviderTranscriptStatus = "succeeded" | "unavailable";

export type TranscriptReviewStatus =
  | "provider_verified"
  | "candidate_correction_pending"
  | "provider_unavailable"
  | "human_verified";

export interface TranscriptCorrectionDiff {
  originalLength: number;
  correctedLength: number;
  commonPrefixLength: number;
  commonSuffixLength: number;
  removedLength: number;
  addedLength: number;
}

export interface TranscriptProvenance {
  recordingId: string;
  recordingSha256: string;
  providerStatus: ProviderTranscriptStatus;
  providerModel: string;
  providerTranscript?: string;
  providerTranscriptSha256?: string;
  candidateCorrection?: string;
  candidateCorrectionSha256?: string;
  correctionReason?: string;
  correctionDiff?: TranscriptCorrectionDiff;
  submittedAt: string;
  reviewStatus: TranscriptReviewStatus;
  reviewedTranscript?: string;
  reviewedTranscriptSha256?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewReason?: string;
}

export type InterviewQuestionStrategy =
  | "published_main"
  | "evidence_probe"
  | "clarification"
  | "situational_alternative";

export interface CandidateRepairCapabilities {
  rephrase: boolean;
  alternate: boolean;
  repairRemaining: number;
  blockedReason: "no_open_question" | "not_available" | null;
}

export type InterviewEvidenceElement =
  | "context"
  | "personal_action"
  | "decision_basis"
  | "outcome"
  | "reflection"
  | "job_relevance";

export interface InterviewAnswerAssessment {
  schemaVersion: "interview-routing-v2";
  evidenceState: "not_an_answer" | "thin" | "adequate" | "contradictory";
  reasonCode:
    | "candidate_requested_clarification"
    | "candidate_requested_rephrase"
    | "candidate_has_no_applicable_example"
    | "missing_context"
    | "missing_personal_action"
    | "missing_decision_basis"
    | "missing_outcome"
    | "missing_reflection"
    | "adequate_evidence"
    | "probe_budget_exhausted"
    | "mandatory_plan_remaining"
    | "plan_complete";
  missingElements: InterviewEvidenceElement[];
}

export interface InterviewTurn {
  /** Frozen pipeline block that owns this turn in multi-stage applications. */
  blockId?: string;
  /** Whole-stage attempt number; earlier attempts remain immutable. */
  assessmentAttempt?: number;
  question: string;
  topic: string;
  kind: "main" | "followup";
  strategy?: InterviewQuestionStrategy;
  questionId?: string;
  thinkTimeSec?: 0 | 30 | 60 | 120 | null;
  answerCapSec?: number;
  modality?: ResponseModality;
  reRecordAttempts?: 0 | 1 | 2 | 3;
  recordingAttempts?: number;
  notesAllowed?: boolean;
  answer?: string;
  recordingId?: string;
  transcript?: TranscriptProvenance;
  integrity?: IntegritySignal[];
  assessment?: InterviewAnswerAssessment;
  resolution?:
    | "candidate_requested_rephrase"
    | "candidate_requested_alternate";
  engine?: {
    model: string;
    promptVersion: string;
    responseId?: string;
  };
}

export interface InterviewStepRequest {
  vacancyTitle: string;
  competencies: { name: string; weight: number }[];
  history: InterviewTurn[];
}

export interface InterviewStepResponse {
  done: boolean;
  question?: string;
  topic?: string;
  kind?: "main" | "followup";
  strategy?: InterviewQuestionStrategy;
  selectedOptionId?: string;
  questionId?: string;
  thinkTimeSec?: 0 | 30 | 60 | 120 | null;
  answerCapSec?: number;
  modality?: ResponseModality;
  reRecordAttempts?: 0 | 1 | 2 | 3;
  notesAllowed?: boolean;
  progress: number;
  closing?: string;
}
