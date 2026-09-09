import { z } from "zod";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const criterionKey = z.string().trim().min(2).max(80);
const bars = z.array(text(8, 500)).length(5);

const methodSelectionSchema = z.object({
  include: z.boolean(),
  attributeKeys: z.array(criterionKey).max(12),
  title: z.string().trim().max(160),
  candidateIntro: z.string().trim().max(1_000),
  rationale: text(20, 800),
});

export const vacancyJobAnalysisSchema = z.object({
  profile: z.object({
    mission: text(20, 1_200),
    responsibilities: z.array(text(8, 500)).min(3).max(10),
    successOutcomes: z.array(text(8, 500)).min(2).max(8),
    operatingConstraints: z.array(text(5, 500)).max(8),
    stakeholderGroups: z.array(text(2, 200)).max(8),
    specialRequirements: z.array(text(5, 500)).max(8),
    assumptionsForHrConfirmation: z.array(text(5, 500)).max(12),
    seniority: z.enum([
      "Intern",
      "Junior",
      "Middle",
      "Senior",
      "Lead",
      "Head",
      "Executive",
    ]),
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
    employmentType: z
      .enum([
        "full_time",
        "part_time",
        "contract",
        "internship",
        "seasonal",
        "shift",
      ])
      .nullable(),
    workMode: z
      .enum(["on_site", "hybrid", "remote_country", "remote_global"])
      .nullable(),
    locations: z.array(text(2, 200)).max(12),
    timezoneOverlap: z.string().trim().max(200).nullable(),
    primaryLanguage: text(2, 40),
    alternateLanguages: z.array(text(2, 40)).max(5),
  }),
  jobAnalysis: z.object({
    method: z.enum([
      "structured_workshop",
      "critical_incidents",
      "task_inventory",
      "competency_model",
      "mixed",
    ]),
    sources: z.array(text(5, 500)).min(1).max(10),
    criticalWorkOutputs: z.array(text(8, 500)).min(2).max(10),
    outcomeCriteria: z.array(text(8, 500)).min(2).max(10),
    rationale: text(20, 800),
  }),
  categories: z
    .array(
      z.object({
        key: criterionKey,
        name: text(2, 100),
        weight: z.number().int().min(1).max(100),
        rationale: text(20, 600),
        attributes: z
          .array(
            z.object({
              key: criterionKey,
              name: text(2, 100),
              kind: z.enum([
                "skill",
                "trait",
                "knowledge",
                "qualification",
                "experience",
                "language",
              ]),
              definition: text(20, 500),
              weight: z.number().int().min(1).max(100),
              focus: z.boolean(),
              priority: z.enum(["essential", "important", "supporting"]),
              targetLevel: z.union([
                z.literal(1),
                z.literal(2),
                z.literal(3),
                z.literal(4),
                z.literal(5),
              ]),
              requiredForDecision: z.boolean(),
              anchors: bars,
              rationale: text(20, 600),
            }),
          )
          .min(1)
          .max(5),
      }),
    )
    .min(3)
    .max(6),
  assessmentPlan: z.object({
    sequence: z
      .array(
        z.enum([
          "knockout",
          "application_form",
          "cv_intake",
          "job_knowledge",
          "sjt_pilot",
          "language_test",
          "work_sample",
          "coding",
          "case_exercise",
          "interview",
          "doc_verification",
          "reference_check",
          "human_stage",
        ]),
      )
      .min(2)
      .max(13),
    interviewKind: z.enum([
      "async_interview",
      "live_ai_interview",
      "chat_interview",
    ]),
    interview: methodSelectionSchema,
    knockout: methodSelectionSchema,
    applicationForm: methodSelectionSchema,
    cvIntake: methodSelectionSchema,
    jobKnowledge: methodSelectionSchema,
    sjtPilot: methodSelectionSchema,
    languageTest: methodSelectionSchema,
    workSample: methodSelectionSchema,
    coding: methodSelectionSchema,
    caseExercise: methodSelectionSchema,
    documentVerification: methodSelectionSchema,
    referenceCheck: methodSelectionSchema,
    humanStage: methodSelectionSchema,
    totalEstimatedMinutes: z.number().int().min(5).max(600),
    burdenRationale: text(20, 800),
    coverageRationale: text(20, 800),
  }),
  rationale: text(20, 1_000),
});

const contentOptionSchema = z.object({
  idHint: text(1, 80),
  text: text(1, 1_000),
});

const rubricDimensionContentSchema = z.object({
  idHint: text(1, 80),
  attributeKey: criterionKey,
  name: text(2, 200),
  weight: z.number().int().min(1).max(100),
  anchors: bars,
});

export const vacancyAssessmentContentSchema = z.object({
  applicationFields: z
    .array(
      z.object({
        idHint: text(1, 80),
        label: text(3, 500),
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
        options: z.array(
          contentOptionSchema.extend({
            points: z.number().finite().nullable(),
          }),
        ).max(30),
      }),
    )
    .max(20),
  knockoutItems: z
    .array(
      z.object({
        idHint: text(1, 80),
        attributeKey: criterionKey,
        question: text(5, 1_000),
        type: z.enum([
          "yes_no",
          "numeric_threshold",
          "single_choice",
          "multi_must_include",
        ]),
        mustHaveRule: z.enum([
          "min_years",
          "certification",
          "license",
          "language_level",
          "location",
          "work_auth",
          "min_scale_level",
          "custom_bool",
        ]),
        mustHaveValueText: z.string().trim().max(500).nullable(),
        mustHaveValueNumber: z.number().finite().nullable(),
        candidateVisibleLabel: text(5, 500),
        passValue: z.boolean().nullable(),
        threshold: z.number().finite().nullable(),
        options: z
          .array(
            contentOptionSchema.extend({
              disqualifies: z.boolean(),
              mustInclude: z.boolean(),
            }),
          )
          .max(20),
        rejectionText: text(10, 1_000),
        allowAppeal: z.boolean(),
      }),
    )
    .max(20),
  interviewQuestions: z
    .array(
      z.object({
        idHint: text(1, 80),
        attributeKey: criterionKey,
        type: z.enum([
          "behavioral",
          "situational",
          "background",
          "job_knowledge",
          "motivation",
        ]),
        text: text(20, 800),
        probes: z.array(text(10, 300)).min(1).max(4),
        clarification: text(20, 800),
        situationalFallback: text(20, 800),
        rationale: text(20, 600),
      }),
    )
    .max(12),
  jobKnowledge: z
    .object({
      openBook: z.boolean(),
      totalTimeMin: z.number().int().min(5).max(120),
      items: z
        .array(
          z.object({
            idHint: text(1, 80),
            attributeKey: criterionKey,
            type: z.enum([
              "mcq_single",
              "mcq_multi",
              "true_false_justify",
              "short_answer",
              "sequence",
            ]),
            prompt: text(10, 2_000),
            options: z
              .array(
                contentOptionSchema.extend({
                  correct: z.boolean(),
                }),
              )
              .max(10),
            modelAnswer: z.string().trim().max(2_000).nullable(),
            keyPoints: z.array(text(2, 500)).max(12),
            difficulty: z.enum(["easy", "medium", "hard"]),
          }),
        )
        .min(3)
        .max(12),
    })
    .nullable(),
  sjtPilot: z
    .object({
      instruction: z.enum(["knowledge", "behavioral_tendency"]),
      items: z
        .array(
          z.object({
            idHint: text(1, 80),
            attributeKey: criterionKey,
            scenario: text(20, 2_000),
            options: z
              .array(
                contentOptionSchema.extend({
                  keyScore: z.number().int().min(0).max(4),
                }),
              )
              .min(4)
              .max(6),
          }),
        )
        .min(3)
        .max(12),
    })
    .nullable(),
  workSample: z
    .object({
      brief: text(50, 8_000),
      deliverables: z
        .array(z.enum(["file", "url", "rich_text", "spreadsheet"]))
        .min(1)
        .max(4),
      timeModel: z.enum(["honesty_window", "hard_timer"]),
      timeBudgetHours: z.number().positive().max(24),
      aiPolicy: z.enum(["forbidden", "disclosed", "expected"]),
      rubricDimensions: z.array(rubricDimensionContentSchema).min(2).max(5),
      defenseFollowUp: z.boolean(),
    })
    .nullable(),
  coding: z
    .object({
      environment: z.enum(["browser_ide", "take_home_repo"]),
      languages: z.array(text(1, 50)).min(1).max(10),
      brief: text(50, 8_000),
      correctnessWeight: z.number().int().min(0).max(100),
      qualityWeight: z.number().int().min(0).max(100),
      approachWeight: z.number().int().min(0).max(100),
      timeCapMin: z.number().int().positive().max(480),
      aiPolicy: z.enum(["forbidden", "disclosed", "expected"]),
      rubricDimensions: z
        .array(
          rubricDimensionContentSchema.extend({
            codingScoringArea: z.enum([
              "correctness",
              "quality",
              "approach",
            ]),
          }),
        )
        .min(3)
        .max(6),
    })
    .nullable(),
  caseExercise: z
    .object({
      format: z.enum([
        "case_analysis",
        "in_basket",
        "role_play",
        "presentation",
      ]),
      materials: text(50, 10_000),
      timeBoxMin: z.number().int().positive().max(480),
      itemCount: z.number().int().positive().max(30).nullable(),
      personaScript: z.string().trim().max(5_000).nullable(),
      rubricDimensions: z.array(rubricDimensionContentSchema).min(2).max(5),
    })
    .nullable(),
  languageTest: z
    .object({
      language: text(2, 100),
      skills: z
        .array(z.enum(["reading", "listening", "writing", "speaking"]))
        .min(1)
        .max(4),
      targetLevel: z.enum(["A2", "B1", "B2", "C1", "C2"]),
      minutesPerSkill: z.number().int().positive().max(60),
    })
    .nullable(),
  requiredDocuments: z
    .array(
      z.object({
        idHint: text(1, 80),
        label: text(3, 300),
        attributeKey: criterionKey,
      }),
    )
    .max(12),
  referenceCheck: z
    .object({
      refereeCount: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
      ]),
      relationships: z
        .array(z.enum(["manager", "peer", "report"]))
        .min(1)
        .max(3),
      collectionWindowDays: z.number().int().min(3).max(30),
      questions: z
        .array(
          z.object({
            idHint: text(1, 80),
            attributeKey: criterionKey.nullable(),
            text: text(10, 1_000),
            type: z.enum(["rating", "open"]),
          }),
        )
        .min(2)
        .max(12),
    })
    .nullable(),
  humanStage: z
    .object({
      panelRoles: z.array(text(3, 200)).min(1).max(8),
      selfBooking: z.boolean(),
      aiNotetaker: z.boolean(),
      assessorInstructions: text(20, 2_000),
    })
    .nullable(),
});

export type VacancyJobAnalysis = z.infer<typeof vacancyJobAnalysisSchema>;
export type VacancyAssessmentContent = z.infer<
  typeof vacancyAssessmentContentSchema
>;
