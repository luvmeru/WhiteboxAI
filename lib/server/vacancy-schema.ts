import { z } from "zod";
import type { VacancyV2 } from "@/lib/types";

const nonEmpty = z.string().trim().min(1);
const id = nonEmpty.max(160);
const percentage = z.number().finite().min(0).max(100);
const bars = z.tuple([
  nonEmpty.max(2_000),
  nonEmpty.max(2_000),
  nonEmpty.max(2_000),
  nonEmpty.max(2_000),
  nonEmpty.max(2_000),
]);

const rubricSchema = z.object({
  id,
  attributeId: id,
  anchors: bars,
  version: z.number().int().positive(),
});

const questionSchema = z.object({
  id,
  text: nonEmpty.max(5_000),
  attributeId: id,
  secondaryAttributeId: id.optional(),
  type: z.enum([
    "behavioral",
    "situational",
    "background",
    "job_knowledge",
    "motivation",
  ]),
  thinkTimeSec: z.union([
    z.literal(0),
    z.literal(30),
    z.literal(60),
    z.literal(120),
    z.null(),
  ]),
  answerCapSec: z.number().int().min(30).max(300),
  modality: z.enum(["video", "audio", "text"]),
  reRecordAttempts: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
  ]),
  notesAllowed: z.boolean(),
  probes: z.array(nonEmpty.max(2_000)).max(12),
  clarification: z.string().max(5_000).optional(),
  situationalFallback: z.string().max(5_000).optional(),
  rubric: rubricSchema,
  source: z.enum(["bank", "ai", "manual"]),
  rationale: z.string().max(5_000).optional(),
});

const rubricDimensionSchema = z.object({
  id,
  attributeId: id.optional(),
  codingScoringArea: z
    .enum(["correctness", "quality", "approach"])
    .optional(),
  name: nonEmpty.max(300),
  weight: percentage,
  anchors: bars,
});

const applicationFormSchema = z.object({
  kind: z.literal("application_form"),
  fields: z
    .array(
      z.object({
        id,
        attributeId: id.optional(),
        label: nonEmpty.max(500),
        type: z.enum([
          "short_text",
          "long_text",
          "single_choice",
          "multi_choice",
          "dropdown",
          "date",
          "number",
          "file",
          "url",
          "consent",
        ]),
        required: z.boolean(),
        pii: z.boolean(),
        scored: z.boolean(),
        options: z
          .array(
            z.object({
              id,
              text: nonEmpty.max(1_000),
              points: z.number().finite().optional(),
            }),
          )
          .max(100)
          .optional(),
      }),
    )
    .max(100),
  prefillFromCv: z.boolean(),
  dedupeRule: z.literal("email_vacancy_resume").optional(),
});

const knockoutSchema = z.object({
  kind: z.literal("knockout"),
  items: z
    .array(
      z.object({
        id,
        question: nonEmpty.max(2_000),
        type: z.enum([
          "yes_no",
          "numeric_threshold",
          "single_choice",
          "multi_must_include",
        ]),
        passValue: z.boolean().optional(),
        threshold: z.number().finite().optional(),
        options: z
          .array(
            z.object({
              id,
              text: nonEmpty.max(1_000),
              disqualifies: z.boolean().optional(),
              mustInclude: z.boolean().optional(),
            }),
          )
          .max(100)
          .optional(),
        immediate: z.boolean(),
        rejectionText: nonEmpty.max(3_000),
        allowAppeal: z.boolean(),
        mustHaveId: id.optional(),
      }),
    )
    .max(100),
  placement: z.enum(["before_form", "after_form"]),
});

const cvIntakeSchema = z.object({
  kind: z.literal("cv_intake"),
  acceptedFormats: z.array(z.enum(["pdf", "docx"])).min(1).max(2),
  maxSizeMb: z.number().positive().max(50),
  parseTargets: z
    .array(
      z.enum([
        "employment",
        "education",
        "certifications",
        "skills",
        "publications",
        "links",
      ]),
    )
    .max(6),
  anonymizeForReview: z.boolean(),
  extractClaims: z.boolean(),
  portfolioUrlField: z.boolean(),
});

const asyncInterviewSchema = z.object({
  kind: z.literal("async_interview"),
  questions: z.array(questionSchema).min(1).max(30),
  followUpPolicy: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  order: z.enum(["fixed", "randomized"]),
  introVideo: z.enum(["recruiter", "ai_presenter", "none"]),
  introScript: z.string().max(10_000).optional(),
  practiceQuestion: z.boolean(),
  pauseAllowance: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  reviewBeforeSubmit: z.boolean(),
});

const liveInterviewSchema = z.object({
  kind: z.literal("live_ai_interview"),
  durationCapMin: z.number().int().min(10).max(45),
  persona: z.object({
    name: nonEmpty.max(100),
    voice: z.enum(["neutral", "warm", "formal"]),
    disclosedAsAi: z.literal(true),
  }),
  questions: z.array(questionSchema).min(1).max(30),
  adaptivity: z.enum(["probe_only", "probe_reorder"]),
  latencyFallback: z.enum(["async", "chat"]),
  bargeInAllowed: z.boolean(),
});

const chatInterviewSchema = z.object({
  kind: z.literal("chat_interview"),
  questions: z.array(questionSchema).min(1).max(30),
  minAnswerWords: z.number().int().min(1).max(10_000),
  maxAnswerWords: z.number().int().min(1).max(20_000),
  typingTelemetry: z.boolean(),
  pastePolicy: z.enum(["allow", "warn", "block"]),
  followUpPolicy: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  tone: z.enum(["neutral", "warm"]),
});

const sjtSchema = z.object({
  kind: z.literal("sjt"),
  instruction: z.enum(["knowledge", "behavioral_tendency"]),
  format: z.enum(["pick_best", "pick_best_worst", "rank_all", "rate_each"]),
  keyType: z.enum(["sme", "consensus", "hybrid"]),
  items: z
    .array(
      z.object({
        id,
        scenario: nonEmpty.max(10_000),
        mediaKind: z.enum(["text", "image", "video"]),
        options: z
          .array(
            z.object({
              id,
              text: nonEmpty.max(2_000),
              keyScore: z.number().finite(),
            }),
          )
          .min(2)
          .max(10),
        attributeId: id,
        smeReviewed: z.boolean(),
      }),
    )
    .min(1)
    .max(100),
  timing: z.enum(["untimed", "soft_per_item"]),
  randomizeOrder: z.boolean(),
  pilotMode: z.boolean(),
});

const cognitiveSchema = z.object({
  kind: z.literal("cognitive"),
  subtests: z
    .array(
      z.enum([
        "numerical",
        "verbal",
        "logical",
        "spatial",
        "working_memory",
        "attention",
      ]),
    )
    .min(1)
    .max(6),
  criterionMappings: z
    .array(
      z.object({
        unit: z.enum([
          "numerical",
          "verbal",
          "logical",
          "spatial",
          "working_memory",
          "attention",
        ]),
        attributeId: id,
      }),
    )
    .max(6)
    .optional(),
  itemsPerSubtest: z.number().int().min(6).max(15),
  adaptive: z.boolean(),
  totalTimeMin: z.number().int().positive().max(240),
  calculatorAllowed: z.boolean(),
  practiceItems: z.literal(2),
});

const personalitySchema = z.object({
  kind: z.literal("personality"),
  model: z.enum(["big_five", "hexaco"]),
  lengthItems: z.union([z.literal(60), z.literal(120), z.literal(200)]),
  format: z.enum(["likert", "forced_choice"]),
  contextualizedAtWork: z.boolean(),
  traitMappings: z
    .array(
      z.object({
        traitId: id,
        attributeId: id,
        evidenceLevel: z.enum([
          "meta-analytic",
          "vendor-validated",
          "experimental",
        ]),
      }),
    )
    .max(50),
  candidateFeedbackReport: z.boolean(),
});

const integritySchema = z.object({
  kind: z.literal("integrity_test"),
  domains: z
    .array(
      z.enum([
        "rule_adherence",
        "safety",
        "dependability",
        "cwb_attitudes",
      ]),
    )
    .min(1)
    .max(4),
  criterionMappings: z
    .array(
      z.object({
        unit: z.enum([
          "rule_adherence",
          "safety",
          "dependability",
          "cwb_attitudes",
        ]),
        attributeId: id,
      }),
    )
    .max(4)
    .optional(),
  lengthItems: z.number().int().min(8).max(300),
  format: z.enum(["likert", "forced_choice"]),
});

const knowledgeSchema = z.object({
  kind: z.literal("job_knowledge"),
  items: z
    .array(
      z.object({
        id,
        type: z.enum([
          "mcq_single",
          "mcq_multi",
          "true_false_justify",
          "short_answer",
          "image_hotspot",
          "sequence",
        ]),
        prompt: nonEmpty.max(10_000),
        options: z
          .array(
            z.object({
              id,
              text: nonEmpty.max(2_000),
              correct: z.boolean().optional(),
            }),
          )
          .max(100)
          .optional(),
        modelAnswer: z.string().max(10_000).optional(),
        keyPoints: z.array(nonEmpty.max(2_000)).max(100).optional(),
        difficulty: z.enum(["easy", "medium", "hard"]),
        attributeId: id,
      }),
    )
    .min(1)
    .max(200),
  timing: z.enum(["per_item", "total"]),
  totalTimeMin: z.number().positive().max(480).optional(),
  difficultyMix: z.object({
    easy: percentage,
    medium: percentage,
    hard: percentage,
  }),
  openBook: z.boolean(),
});

const languageSchema = z.object({
  kind: z.literal("language_test"),
  language: nonEmpty.max(100),
  skills: z
    .array(z.enum(["reading", "listening", "writing", "speaking"]))
    .min(1)
    .max(4),
  criterionMappings: z
    .array(
      z.object({
        unit: z.enum(["reading", "listening", "writing", "speaking"]),
        attributeId: id,
      }),
    )
    .max(4)
    .optional(),
  targetLevel: z.enum(["A2", "B1", "B2", "C1", "C2"]),
  minutesPerSkill: z.number().positive().max(120),
});

const workSampleSchema = z.object({
  kind: z.literal("work_sample"),
  brief: nonEmpty.max(50_000),
  deliverables: z
    .array(z.enum(["file", "url", "rich_text", "spreadsheet"]))
    .min(1)
    .max(4),
  timeModel: z.enum(["honesty_window", "hard_timer"]),
  timeBudgetHours: z.number().positive().max(80),
  aiPolicy: z.enum(["forbidden", "disclosed", "expected"]),
  originalityCheck: z.boolean(),
  anonymizedGrading: z.boolean(),
  rubricDimensions: z.array(rubricDimensionSchema).min(1).max(20),
  defenseFollowUp: z.boolean(),
});

const codingSchema = z.object({
  kind: z.literal("coding"),
  environment: z.enum(["browser_ide", "take_home_repo"]),
  languages: z.array(nonEmpty.max(100)).min(1).max(50),
  taskSource: z.enum(["bank", "custom", "ai_sme_reviewed"]),
  brief: nonEmpty.max(50_000),
  scoringSplit: z.object({
    correctness: percentage,
    quality: percentage,
    approach: percentage,
  }),
  timeCapMin: z.number().positive().max(1_440),
  aiPolicy: z.enum(["forbidden", "disclosed", "expected"]),
  similarityCheck: z.boolean(),
  rubricDimensions: z.array(rubricDimensionSchema).min(1).max(20),
});

const caseSchema = z.object({
  kind: z.literal("case_exercise"),
  format: z.enum(["case_analysis", "in_basket", "role_play", "presentation"]),
  materials: nonEmpty.max(100_000),
  timeBoxMin: z.number().positive().max(1_440),
  itemCount: z.number().int().positive().max(100).optional(),
  personaScript: z.string().max(50_000).optional(),
  rubricDimensions: z.array(rubricDimensionSchema).min(1).max(20),
});

const documentSchema = z.object({
  kind: z.literal("doc_verification"),
  requiredDocuments: z
    .array(
      z.object({
        id,
        label: nonEmpty.max(500),
        qualificationAttributeId: id.optional(),
      }),
    )
    .min(1)
    .max(100),
  acceptedFormats: z.array(nonEmpty.max(30)).min(1).max(30),
  mode: z.enum(["manual_document_review", "auto_extract_match"]),
  idCheck: z.boolean(),
  placement: z.enum(["in_flow", "post_shortlist"]),
});

const referenceSchema = z.object({
  kind: z.literal("reference_check"),
  referees: z.object({
    count: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
    ]),
    relationships: z
      .array(z.enum(["manager", "peer", "report"]))
      .min(1)
      .max(3),
  }),
  questionnaire: z
    .array(
      z.object({
        id,
        text: nonEmpty.max(5_000),
        attributeId: id.optional(),
        type: z.enum(["rating", "open"]),
      }),
    )
    .min(1)
    .max(100),
  collectionWindowDays: z.number().int().positive().max(90),
  fraudControls: z.boolean(),
  anonymizedAggregation: z.boolean(),
});

const humanSchema = z.object({
  kind: z.literal("human_stage"),
  panel: z.array(nonEmpty.max(300)).min(1).max(50),
  selfBooking: z.boolean(),
  bookingUrl: z.string().url().max(2_000).optional(),
  interviewKitAuto: z.boolean(),
  independentBeforeDiscussion: z.literal(true),
  aiNotetaker: z.boolean(),
});

const customSchema = z.object({
  kind: z.literal("custom"),
  instructions: nonEmpty.max(100_000),
  primitives: z
    .array(z.enum(["recorder", "text", "choice", "file", "grid"]))
    .min(1)
    .max(5),
  rubricDimensions: z.array(rubricDimensionSchema).min(1).max(20),
});

export const blockSettingsSchema = z.discriminatedUnion("kind", [
  applicationFormSchema,
  knockoutSchema,
  cvIntakeSchema,
  asyncInterviewSchema,
  liveInterviewSchema,
  chatInterviewSchema,
  sjtSchema,
  cognitiveSchema,
  personalitySchema,
  integritySchema,
  knowledgeSchema,
  languageSchema,
  workSampleSchema,
  codingSchema,
  caseSchema,
  documentSchema,
  referenceSchema,
  humanSchema,
  customSchema,
]);

const blockKindSchema = z.enum([
  "application_form",
  "knockout",
  "cv_intake",
  "async_interview",
  "live_ai_interview",
  "chat_interview",
  "sjt",
  "cognitive",
  "personality",
  "integrity_test",
  "job_knowledge",
  "language_test",
  "work_sample",
  "coding",
  "case_exercise",
  "doc_verification",
  "reference_check",
  "human_stage",
  "custom",
]);

const blockSchema = z
  .object({
    id,
    kind: blockKindSchema,
    order: z.number().int().min(0).max(1_000),
    title: nonEmpty.max(300),
    candidateIntro: nonEmpty.max(20_000),
    required: z.boolean(),
    scored: z.boolean(),
    estimatedMinutes: z.number().positive().max(100_000),
    gate: z
      .object({
        minBlockScore: percentage.optional(),
        mustHaveIds: z.array(id).max(100).optional(),
      })
      .optional(),
    measures: z
      .array(
        z.object({
          attributeId: id,
          share: percentage,
        }),
      )
      .max(100),
    settings: blockSettingsSchema,
    integrityTier: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
    ]),
    accessibility: z.object({
      extraTimeMultiplier: z.union([
        z.literal(1),
        z.literal(1.25),
        z.literal(1.5),
        z.literal(2),
        z.literal("untimed"),
      ]),
      captions: z.boolean(),
      screenReaderMode: z.boolean(),
      alternativeFormats: z.boolean(),
    }),
    languageOverride: z.string().max(100).optional(),
    retakePolicy: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    deadlineOffsetHours: z.number().positive().max(100_000).optional(),
    evidenceRole: z
      .enum(["primary", "corroborating", "verification", "context"])
      .optional(),
    assessorInstructions: z.string().max(20_000).optional(),
    internalNotes: z.array(z.string().max(5_000)).max(100).optional(),
    tags: z.array(z.string().max(100)).max(100).optional(),
    validation: z
      .object({
        strategy: z.enum(["content", "criterion", "construct", "transport"]),
        status: z.enum([
          "draft",
          "sme_reviewed",
          "pilot",
          "locally_validated",
        ]),
        scoreUse: z.enum([
          "context_only",
          "decision_support",
          "selection",
        ]),
        evidenceRefs: z.array(z.string().max(5_000)).max(100),
        reviewedBy: z.string().max(300).optional(),
        reviewedAt: z.string().max(100).optional(),
        applicabilityNote: z.string().max(5_000).optional(),
      })
      .optional(),
  })
  .superRefine((block, context) => {
    if (block.kind !== block.settings.kind) {
      context.addIssue({
        code: "custom",
        path: ["settings", "kind"],
        message: `must match block.kind (${block.kind})`,
      });
    }
  });

const attributeSchema = z.object({
  id,
  name: nonEmpty.max(300),
  kind: z.enum([
    "skill",
    "trait",
    "knowledge",
    "qualification",
    "experience",
    "language",
  ]),
  definition: nonEmpty.max(5_000),
  weight: percentage,
  focus: z.boolean().optional(),
  mustHave: z
    .object({
      rule: z.enum([
        "min_years",
        "certification",
        "license",
        "language_level",
        "location",
        "work_auth",
        "min_scale_level",
        "custom_bool",
      ]),
      value: z.union([z.string().max(1_000), z.number().finite()]),
      label: nonEmpty.max(1_000),
      humanRecoverable: z.literal(true),
    })
    .optional(),
  scale: z.object({ anchors: bars }),
  verification: z.enum([
    "self_report",
    "interview",
    "test",
    "document",
    "reference",
  ]),
  evidenceRequirement: z
    .object({
      priority: z.enum(["essential", "important", "supporting"]),
      targetLevel: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
      ]),
      methods: z
        .array(
          z.enum([
            "self_report",
            "interview",
            "test",
            "document",
            "reference",
            "work_sample",
            "human_observation",
          ]),
        )
        .min(1)
        .max(7),
      minIndependentSources: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
      ]),
      requiredForDecision: z.boolean(),
      notes: z.array(z.string().max(5_000)).max(100),
      specialRequirements: z.array(z.string().max(5_000)).max(100),
    })
    .optional(),
  taxonomyRef: z
    .object({
      system: z.enum(["ONET", "ESCO", "SFIA", "UCF", "custom"]),
      code: z.string().max(100),
    })
    .optional(),
  rationale: z.string().max(5_000).optional(),
});

export const vacancySchema = z
  .object({
    id,
    code: z.string().max(16),
    status: z.enum([
      "DRAFT",
      "IN_REVIEW",
      "LIVE",
      "PAUSED",
      "CLOSED",
      "ARCHIVED",
    ]),
    configVersion: z.number().int().positive(),
    aiExecution: z
      .object({
        mode: z.literal("openai_required"),
        policyVersion: z.literal("openai-required-v1"),
        assignedAt: nonEmpty,
      })
      .optional(),
    profile: z
      .object({
        title: nonEmpty.max(200),
        requisitionId: z.string().max(200).optional(),
        department: z.string().max(300).optional(),
        hiringManager: z.string().max(300).optional(),
        openings: z.number().int().positive().max(100_000),
        seniority: z.enum([
          "Intern",
          "Junior",
          "Middle",
          "Senior",
          "Lead",
          "Head",
          "Executive",
        ]),
        employmentType: z.enum([
          "full_time",
          "part_time",
          "contract",
          "internship",
          "seasonal",
          "shift",
        ]),
        workMode: z.enum([
          "on_site",
          "hybrid",
          "remote_country",
          "remote_global",
        ]),
        locations: z.array(z.string().max(300)).max(100),
        timezoneOverlap: z.string().max(300).optional(),
        compensation: z
          .object({
            min: z.number().finite().min(0),
            max: z.number().finite().min(0),
            currency: nonEmpty.max(20),
            period: z.enum(["year", "month", "hour"]),
            visible: z.boolean(),
          })
          .optional(),
        taxonomyRef: z
          .object({
            system: z.enum(["ONET", "ESCO", "SFIA", "UCF", "custom"]),
            code: nonEmpty.max(100),
            label: nonEmpty.max(300),
          })
          .optional(),
        mission: nonEmpty.max(20_000),
        responsibilities: z.array(nonEmpty.max(5_000)).min(1).max(200),
        teamContext: z.string().max(20_000).optional(),
        successOutcomes: z.array(z.string().max(5_000)).max(100).optional(),
        operatingConstraints: z.array(z.string().max(5_000)).max(100).optional(),
        stakeholderGroups: z.array(z.string().max(1_000)).max(100).optional(),
        specialRequirements: z.array(z.string().max(5_000)).max(100).optional(),
        internalComments: z.array(z.string().max(5_000)).max(100).optional(),
        tags: z.array(z.string().max(100)).max(100).optional(),
        industryPack: z.enum([
          "tech",
          "sales_cs",
          "healthcare",
          "finance",
          "retail_hourly",
          "manufacturing",
          "logistics",
          "creative",
          "public_sector",
          "education",
          "custom",
        ]),
        languages: z.object({
          primary: nonEmpty.max(100),
          alternates: z.array(nonEmpty.max(100)).max(50),
        }),
      })
      .superRefine((profile, context) => {
        if (
          profile.compensation &&
          profile.compensation.max < profile.compensation.min
        ) {
          context.addIssue({
            code: "custom",
            path: ["compensation", "max"],
            message: "must be greater than or equal to compensation.min",
          });
        }
      }),
    categories: z
      .array(
        z.object({
          id,
          name: nonEmpty.max(300),
          weight: percentage,
          attributes: z.array(attributeSchema).min(1).max(100),
          rationale: z.string().max(5_000).optional(),
        }),
      )
      .min(1)
      .max(50),
    pipeline: z.array(blockSchema).min(1).max(100),
    scoring: z
      .object({
        topology: z.enum(["compensatory", "multiple_hurdle", "hybrid"]),
        weighting: z.enum(["rational", "unit", "pareto_assist"]),
        threshold: percentage,
        banding: z
          .object({
            enabled: z.boolean(),
            sedWidth: z.number().finite().min(0).max(100),
          })
          .optional(),
        tieBreakers: z
          .array(
            z.enum([
              "focus_attributes",
              "work_sample",
              "earlier_submission",
            ]),
          )
          .max(3),
        anonymization: z.object({
          maskPII: z.boolean(),
          revealAtStage: z.enum(["decision", "invited"]),
        }),
        abstainPolicy: z.object({
          minEvidencePerAttribute: z.number().int().min(1).max(20),
          onAbstain: z.literal("flag_human"),
        }),
        normalization: z.literal("absolute_rubric"),
        aggregation: z
          .object({
            acrossSources: z.enum([
              "evidence_weighted_mean",
              "conservative_floor",
              "highest_quality_source",
            ]),
            contradictoryEvidence: z.enum([
              "flag_human",
              "use_lower_confidence",
            ]),
            optionalBlocks: z.enum([
              "exclude_if_missing",
              "include_when_completed",
            ]),
            minimumCoveragePct: percentage,
          })
          .optional(),
      })
      .passthrough(),
    experience: z
      .object({
        landing: z.object({
          coverDesignId: z.string().max(200).optional(),
          showCompensation: z.boolean(),
          companyBlurb: z.string().max(20_000),
          biasAuditUrl: z.string().url().optional(),
        }),
        notices: z.object({
          jurisdictionProfile: nonEmpty.max(100),
          aiDisclosure: nonEmpty.max(20_000),
          retentionDays: z.number().int().positive().max(10_000),
          consentCheckpoints: z
            .array(z.enum(["entry", "recorded_blocks", "integrity_tier"]))
            .max(3),
          version: z.number().int().positive(),
        }),
        comms: z.object({
          confirmationEnabled: z.boolean(),
          reminderCadence: z.union([
            z.literal(0),
            z.literal(1),
            z.literal(2),
          ]),
          dispositionSlaDays: z.number().int().positive().max(365),
          feedbackOffer: z.boolean(),
          senderIdentity: z.enum(["org", "recruiter"]),
        }),
        tone: z.enum(["formal", "neutral", "warm"]),
      })
      .passthrough(),
    governance: z
      .object({
        roles: z
          .array(
            z.object({
              userId: id,
              name: nonEmpty.max(300),
              role: z.enum([
                "Owner",
                "HiringManager",
                "TechnicalReviewer",
                "Observer",
              ]),
              piiReveal: z.boolean(),
            }),
          )
          .min(1)
          .max(100),
        reviewPolicy: z.object({
          independentReviews: z.union([
            z.literal(1),
            z.literal(2),
            z.literal(3),
          ]),
          assignment: z.enum(["round_robin", "by_expertise"]),
        }),
        calibrationRequired: z.boolean(),
        dualControlThreshold: z.number().int().positive().max(100_000),
        slaTargets: z.object({
          reviewQueueHours: z.number().positive().max(10_000),
          dispositionDays: z.number().positive().max(10_000),
        }),
        changeControl: z.object({
          editLive: z.array(
            z.enum([
              "Owner",
              "HiringManager",
              "TechnicalReviewer",
              "Observer",
            ]),
          ),
          pauseClose: z.array(
            z.enum([
              "Owner",
              "HiringManager",
              "TechnicalReviewer",
              "Observer",
            ]),
          ),
        }),
      })
      .passthrough(),
    assessmentDesign: z
      .object({
        purpose: z.enum([
          "selection",
          "screening",
          "internal_mobility",
          "development",
        ]),
        jobAnalysis: z.object({
          method: z.enum([
            "structured_workshop",
            "critical_incidents",
            "task_inventory",
            "competency_model",
            "mixed",
          ]),
          sources: z.array(z.string().max(5_000)).max(100),
          criticalWorkOutputs: z.array(z.string().max(5_000)).max(100),
          approvedBy: z.string().max(300).optional(),
          approvedAt: z.string().max(100).optional(),
        }),
        validation: z.object({
          monitoringMode: z.enum([
            "prelaunch_review",
            "pilot",
            "operational",
          ]),
          outcomeCriteria: z.array(z.string().max(5_000)).max(100),
          reviewCadenceDays: z.number().int().positive().max(10_000),
          minimumSampleForAnalysis: z.number().int().positive().max(1_000_000),
          adverseImpactMonitoring: z.boolean(),
        }),
        decisionPolicy: z.object({
          humanFinalDecision: z.literal(true),
          allowAutomatedRejection: z.literal(false),
          requireReasonCode: z.literal(true),
          requireEvidenceCitation: z.literal(true),
        }),
      })
      .optional(),
    distribution: z
      .array(
        z.object({
          channel: z.enum([
            "linkedin",
            "indeed",
            "hh",
            "referral",
            "university",
            "qr_poster",
            "custom",
          ]),
          url: z.string().url().max(4_000),
          codeSuffix: nonEmpty.max(100),
          clicks: z.number().int().nonnegative().optional(),
        }),
      )
      .max(100),
    window: z.object({
      opensAt: z.string().max(100),
      closesAt: z.string().max(100),
      timezone: nonEmpty.max(100),
    }),
    capacity: z
      .object({ maxSubmissions: z.number().int().positive().max(10_000_000) })
      .optional(),
    rollingReview: z.boolean(),
    audit: z
      .array(
        z.object({
          id: nonEmpty.max(300),
          timestamp: z.string().max(100),
          actor: nonEmpty.max(300),
          action: z.enum([
            "SCORED",
            "APPROVED",
            "REJECTED",
            "ESCALATED",
            "OVERRIDDEN",
            "REVEALED",
            "PUBLISHED",
            "RECOMPUTED",
            "DISPATCH_APPROVED",
            "DISPATCH_SENT",
            "CONSENTED",
            "SUBMITTED",
          ]),
          target: nonEmpty.max(500),
          reason: z.string().max(5_000).optional(),
          modelVer: nonEmpty.max(300),
          hash: nonEmpty.max(1_000),
        }),
      )
      .max(10_000),
    createdAt: z.string().max(100),
    publishedAt: z.string().max(100).optional(),
  })
  .superRefine((vacancy, context) => {
    const ids = vacancy.categories.flatMap((category) =>
      category.attributes.map((attribute) => attribute.id),
    );
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["categories"],
        message: "attribute IDs must be unique across the vacancy",
      });
    }
    const blockIds = vacancy.pipeline.map((block) => block.id);
    if (new Set(blockIds).size !== blockIds.length) {
      context.addIssue({
        code: "custom",
        path: ["pipeline"],
        message: "block IDs must be unique",
      });
    }
    const orderedPositions = vacancy.pipeline
      .map((block) => block.order)
      .sort((left, right) => left - right);
    if (
      orderedPositions.some((position, index) => position !== index + 1)
    ) {
      context.addIssue({
        code: "custom",
        path: ["pipeline"],
        message:
          "block order must be unique and contiguous, starting at 1",
      });
    }
  });

export function parseVacancy(value: unknown): VacancyV2 {
  return vacancySchema.parse(value) as VacancyV2;
}
