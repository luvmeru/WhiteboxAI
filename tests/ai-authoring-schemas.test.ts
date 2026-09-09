import assert from "node:assert/strict";
import { test } from "node:test";

import { zodTextFormat } from "openai/helpers/zod";

import {
  vacancyAssessmentContentSchema,
  vacancyJobAnalysisSchema,
} from "../lib/server/ai-authoring-schemas";
import { compileVacancyAuthoringDraft } from "../lib/server/ai-provider";
import { vacancySchema } from "../lib/server/vacancy-schema";
import { createEmptyDraft } from "../lib/studio";

test("OpenAI structured-output helper accepts both vacancy authoring schemas", () => {
  assert.doesNotThrow(() =>
    zodTextFormat(
      vacancyJobAnalysisSchema,
      "vacancy_job_analysis_contract_test",
    ),
  );
  assert.doesNotThrow(() =>
    zodTextFormat(
      vacancyAssessmentContentSchema,
      "vacancy_assessment_content_contract_test",
    ),
  );
});

test("vacancy authoring schemas reject omitted nullable content fields", () => {
  const missingContentFields = vacancyAssessmentContentSchema.safeParse({
    applicationFields: [],
    knockoutItems: [],
    interviewQuestions: [],
  });

  assert.equal(missingContentFields.success, false);
});

test("a compiled AI vacancy is publish-schema compatible and not a single-block placeholder", () => {
  const excluded = (rationale: string) => ({
    include: false,
    attributeKeys: [],
    title: "",
    candidateIntro: "",
    rationale,
  });
  const included = (
    title: string,
    attributeKeys: string[],
    rationale: string,
  ) => ({
    include: true,
    attributeKeys,
    title,
    candidateIntro:
      `This stage collects structured job evidence for ${title.toLowerCase()} and explains how it will be reviewed.`,
    rationale,
  });
  const anchors = [
    "Provides no usable evidence of the required work.",
    "Completes simple parts only with substantial direction.",
    "Completes routine work independently to the expected standard.",
    "Handles complex work and explains sound trade-offs.",
    "Improves the wider system through exceptional, repeatable practice.",
  ];
  const analysis = vacancyJobAnalysisSchema.parse({
    profile: {
      mission:
        "Build reliable services that let internal teams ship customer value safely.",
      responsibilities: [
        "Design and maintain production services.",
        "Diagnose incidents and prevent recurrence.",
        "Review technical decisions with partner teams.",
      ],
      successOutcomes: [
        "Service reliability improves against published objectives.",
        "Changes ship with clear operational evidence.",
      ],
      operatingConstraints: ["Operate within an on-call rotation."],
      stakeholderGroups: ["Product teams", "Platform operations"],
      specialRequirements: [],
      assumptionsForHrConfirmation: [
        "Confirm the preferred employment type before publication.",
      ],
      seniority: "Senior",
      industryPack: "tech",
      employmentType: null,
      workMode: null,
      locations: [],
      timezoneOverlap: null,
      primaryLanguage: "en",
      alternateLanguages: [],
    },
    jobAnalysis: {
      method: "mixed",
      sources: [
        "Employer role brief",
        "Critical-work-output analysis pending job-expert confirmation",
      ],
      criticalWorkOutputs: [
        "Reliable production services",
        "Evidence-backed incident prevention",
      ],
      outcomeCriteria: [
        "Quality of delivered changes",
        "Operational reliability after hire",
      ],
      rationale:
        "The draft separates delivery, diagnosis, and collaboration because they produce distinct observable work evidence.",
    },
    categories: [
      {
        key: "delivery",
        name: "Technical delivery",
        weight: 40,
        rationale:
          "Reliable implementation is a critical output of the role.",
        attributes: [
          {
            key: "implementation",
            name: "Implementation quality",
            kind: "skill",
            definition:
              "Produces maintainable changes that meet stated functional and operational constraints.",
            weight: 100,
            focus: true,
            priority: "essential",
            targetLevel: 4,
            requiredForDecision: true,
            anchors,
            rationale:
              "The role owns production code and must demonstrate sound implementation decisions.",
          },
        ],
      },
      {
        key: "operations",
        name: "Operational judgment",
        weight: 35,
        rationale:
          "Incident diagnosis and recurrence prevention are explicit outputs.",
        attributes: [
          {
            key: "incident_reasoning",
            name: "Incident reasoning",
            kind: "knowledge",
            definition:
              "Diagnoses production failures methodically and verifies corrective actions.",
            weight: 100,
            focus: true,
            priority: "essential",
            targetLevel: 4,
            requiredForDecision: true,
            anchors,
            rationale:
              "Safe incident handling is an explicit recurring responsibility.",
          },
        ],
      },
      {
        key: "collaboration",
        name: "Decision collaboration",
        weight: 25,
        rationale:
          "The role must align technical decisions with partner teams.",
        attributes: [
          {
            key: "tradeoff_communication",
            name: "Trade-off communication",
            kind: "skill",
            definition:
              "Explains technical options, consequences, and decisions to affected work partners.",
            weight: 100,
            focus: true,
            priority: "important",
            targetLevel: 3,
            requiredForDecision: true,
            anchors,
            rationale:
              "Partner teams rely on clear decision consequences to plan their work.",
          },
        ],
      },
    ],
    assessmentPlan: {
      sequence: ["interview", "human_stage"],
      interviewKind: "async_interview",
      interview: included(
        "Structured video interview",
        ["implementation", "incident_reasoning", "tradeoff_communication"],
        "Standardized questions elicit comparable evidence about past decisions and job knowledge.",
      ),
      knockout: excluded(
        "The brief states no objective entry requirement that could justify a knockout.",
      ),
      applicationForm: excluded(
        "The basic application already captures identity and contact details.",
      ),
      cvIntake: excluded(
        "A CV would add claim context but is not needed for this focused test plan.",
      ),
      jobKnowledge: excluded(
        "Knowledge will be sampled through a structured interview question in this compact plan.",
      ),
      sjtPilot: excluded(
        "No unscored SJT pilot is needed for this compact plan.",
      ),
      languageTest: excluded(
        "The brief does not state a job-essential language level.",
      ),
      workSample: excluded(
        "The compact plan reserves direct work observation for the human stage.",
      ),
      coding: excluded(
        "The brief does not identify a language or coding environment.",
      ),
      caseExercise: excluded(
        "A separate case would duplicate evidence in this compact plan.",
      ),
      documentVerification: excluded(
        "The brief states no licence or credential requiring documentary proof.",
      ),
      referenceCheck: excluded(
        "Reference collection is not proportionate for this compact plan.",
      ),
      humanStage: included(
        "Independent human review",
        ["implementation", "incident_reasoning", "tradeoff_communication"],
        "A job expert applies the same evidence framework before discussion.",
      ),
      totalEstimatedMinutes: 40,
      burdenRationale:
        "Two evidence stages keep candidate effort proportionate while preserving independent human judgment.",
      coverageRationale:
        "Every required criterion is covered by standardized questions and independent human observation.",
    },
    rationale:
      "The plan combines standardized elicitation with accountable human review and avoids unsupported psychometric instruments.",
  });
  const question = (
    idHint: string,
    attributeKey: string,
    text: string,
  ) => ({
    idHint,
    attributeKey,
    type: "behavioral" as const,
    text,
    probes: [
      "What was your own responsibility in that situation?",
      "What observable result followed from your action?",
    ],
    clarification:
      "Please describe one specific work situation, what you personally did, and what happened.",
    situationalFallback:
      "If you have not faced this exact situation, explain how you would approach a comparable job scenario and verify success.",
    rationale:
      "The question requests observable job evidence for one published criterion.",
  });
  const content = vacancyAssessmentContentSchema.parse({
    applicationFields: [],
    knockoutItems: [],
    interviewQuestions: [
      question(
        "implementation",
        "implementation",
        "Tell us about a production change you designed under competing functional and operational constraints. What did you personally decide, and what happened?",
      ),
      question(
        "incident",
        "incident_reasoning",
        "Tell us about a production incident you diagnosed. How did you test competing explanations and verify that the corrective action worked?",
      ),
      question(
        "tradeoff",
        "tradeoff_communication",
        "Tell us about a technical trade-off that affected another team. How did you explain the options, reach a decision, and check its effect?",
      ),
    ],
    jobKnowledge: null,
    sjtPilot: null,
    workSample: null,
    coding: null,
    caseExercise: null,
    languageTest: null,
    requiredDocuments: [],
    referenceCheck: null,
    humanStage: {
      panelRoles: ["Hiring manager", "Role-domain specialist"],
      selfBooking: true,
      aiNotetaker: false,
      assessorInstructions:
        "Rate each published criterion independently against its five anchors, cite evidence, and record ratings before panel discussion.",
    },
  });

  const base = createEmptyDraft();
  base.governance.roles = [
    {
      userId: "reviewer-session-id",
      name: "Authenticated hiring manager",
      role: "HiringManager",
      piiReveal: true,
    },
  ];
  const draft = compileVacancyAuthoringDraft(
    base,
    "Senior platform engineer",
    analysis,
    content,
  );
  const publishParse = vacancySchema.safeParse(draft);

  assert.equal(
    publishParse.success,
    true,
    publishParse.success
      ? undefined
      : JSON.stringify(publishParse.error.issues),
  );
  assert.deepEqual(
    draft.pipeline.map((block) => block.kind),
    ["async_interview", "human_stage"],
  );
  assert.equal(
    draft.pipeline.every(
      (block) => block.validation?.status === "draft",
    ),
    true,
  );
  assert.equal(
    draft.categories.every((category) =>
      category.attributes.every(
        (attribute) =>
          attribute.evidenceRequirement?.methods.length === 2,
      ),
    ),
    true,
  );
});
