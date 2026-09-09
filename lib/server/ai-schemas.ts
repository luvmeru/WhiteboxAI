import { z } from "zod";
import {
  APPLICATION_EVALUATION_SCHEMA_VERSION,
  EVALUATION_SCHEMA_VERSION,
  INTERVIEW_ROUTER_SCHEMA_VERSION,
} from "./ai-prompts";

export const interviewRoutingSchema = z.object({
  schemaVersion: z.literal(INTERVIEW_ROUTER_SCHEMA_VERSION),
  action: z.enum([
    "rephrase",
    "alternate",
    "followup",
    "next",
    "complete",
  ]),
  currentQuestionId: z.string().min(1).max(128).nullable(),
  selectedOptionId: z.string().min(1).max(128).nullable(),
  evidenceState: z.enum([
    "not_an_answer",
    "thin",
    "adequate",
    "contradictory",
  ]),
  reasonCode: z.enum([
    "candidate_requested_rephrase",
    "candidate_has_no_applicable_example",
    "missing_context",
    "missing_personal_action",
    "missing_decision_basis",
    "missing_outcome",
    "missing_reflection",
    "adequate_evidence",
    "probe_budget_exhausted",
    "mandatory_plan_remaining",
    "plan_complete",
  ]),
  missingElements: z
    .array(
      z.enum([
        "context",
        "personal_action",
        "decision_basis",
        "outcome",
        "reflection",
        "job_relevance",
      ]),
    )
    .max(6),
});

export type InterviewRoutingOutput = z.infer<typeof interviewRoutingSchema>;

const evidenceReferenceSchema = z.object({
  passageId: z.string().min(1).max(160),
  relation: z.enum(["supports", "limits", "contradicts"]),
});

export const candidateEvaluationSchema = z.object({
  schemaVersion: z.literal(EVALUATION_SCHEMA_VERSION),
  attributes: z
    .array(
      z.object({
        attributeId: z.string().min(1).max(128),
        disposition: z.enum(["scored", "abstained"]),
        level: z.number().int().min(1).max(5).nullable(),
        confidence: z.enum(["High", "Medium", "Low"]),
        evidence: z.array(evidenceReferenceSchema).max(6),
        abstainReason: z
          .enum([
            "missing",
            "insufficient",
            "contradictory",
            "off_topic",
            "unverifiable",
          ])
          .nullable(),
        rationale: z.string().min(10).max(800),
      }),
    )
    .min(1)
    .max(60),
});

export type CandidateEvaluationOutput = z.infer<
  typeof candidateEvaluationSchema
>;

export const applicationEvidenceEvaluationSchema = z.object({
  schemaVersion: z.literal(APPLICATION_EVALUATION_SCHEMA_VERSION),
  items: z
    .array(
      z.object({
        evaluationItemId: z.string().min(1).max(240),
        blockId: z.string().min(1).max(160),
        sourceItemId: z.string().min(1).max(160),
        attributeId: z.string().min(1).max(160),
        disposition: z.enum(["scored", "abstained"]),
        level: z.number().int().min(1).max(5).nullable(),
        confidence: z.enum(["High", "Medium", "Low"]),
        evidence: z.array(evidenceReferenceSchema).max(8),
        abstainReason: z
          .enum([
            "missing",
            "insufficient",
            "contradictory",
            "off_topic",
            "unverifiable",
          ])
          .nullable(),
        rationale: z.string().min(10).max(1_000),
      }),
    )
    .max(240),
});

export type ApplicationEvidenceEvaluationOutput = z.infer<
  typeof applicationEvidenceEvaluationSchema
>;
