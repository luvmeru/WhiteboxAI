/* ============================================================
   BLOCK LIBRARY — SPEC §4.4 (19 block kinds, grouped A–E)
   Metadata + factories for the Pipeline Composer.

   This catalogue describes method families, not universal validity
   coefficients. Whether a method is defensible for a real vacancy depends on
   the frozen job analysis, content linkage, instrument/version, intended
   population, accessibility, outcome criterion and local monitoring.
   ============================================================ */

import type {
  BlockGroup,
  BlockKind,
  BlockSettings,
  PipelineBlock,
} from "./types";

/* ---------- metadata shape (UI compiles against this) ---------- */

export interface BlockMeta {
  kind: BlockKind;
  group: BlockGroup;
  label: string; // e.g. "Structured Async Interview"
  methodName: string; // named HR method, e.g. "Structured interview"
  methodBasis: string; // implementation and validation requirements
  evidenceLevel: string;
  defaultMinutes: number;
  description: string; // 1–2 sentences for the library card
  candidateIntroTemplate: string; // states what it measures + why job-relevant (justice rule, R-I.7)
  researchRef: string; // e.g. "R-I.1, R-I.2"
}

/* ---------- the library (SPEC §4.4.1–4.4.19) ---------- */

export const BLOCK_LIBRARY: Record<BlockKind, BlockMeta> = {
  /* —— Group A · Screening & background —— */

  application_form: {
    kind: "application_form",
    group: "screening",
    label: "Structured Application Form",
    methodName: "Structured biodata collection",
    methodBasis:
      "Structured fields improve consistency. Any scored biodata key must be job-related, documented and validated for the intended use; contact data is never scored.",
    evidenceLevel: "method-family research",
    defaultMinutes: 6,
    description:
      "Collects contact details and structured application data. Choice questions may carry documented rational keys, while PII remains outside evaluation.",
    candidateIntroTemplate:
      "This short form collects the basics we need to process your application. Only clearly marked questions are scored, and contact details are never part of the evaluation.",
    researchRef: "R-I.1",
  },

  knockout: {
    kind: "knockout",
    group: "screening",
    label: "Knockout Questionnaire",
    methodName: "Minimum-qualifications screen",
    methodBasis: "Uniform Guidelines-safe screen: job-related, documented, and always human-recoverable.",
    evidenceLevel: "job analysis required",
    defaultMinutes: 3,
    description:
      "Checks documented minimum requirements before anyone invests time. Every failed knockout lands in a human-review tray — never the void.",
    candidateIntroTemplate:
      "A few quick questions to confirm the minimum requirements stated in the job description. If something doesn't match, a person reviews it before anything is final.",
    researchRef: "R-III.13",
  },

  cv_intake: {
    kind: "cv_intake",
    group: "screening",
    label: "CV / Résumé Intake",
    methodName: "Credential & history extraction",
    methodBasis:
      "A CV is candidate-supplied context and a source of claims to verify; it is not treated as a performance score.",
    evidenceLevel: "context only",
    defaultMinutes: 4,
    description:
      "Stores the CV privately and records a receipt in the claims ledger. It informs accountable review and later verification rather than becoming a performance score.",
    candidateIntroTemplate:
      "Upload your CV so we can understand your experience. It provides context and verification for later steps — it is not scored on its own, and identifying details are hidden from reviewers by default.",
    researchRef: "R-I.1, R-I.6",
  },

  /* —— Group B · Interviews —— */

  async_interview: {
    kind: "async_interview",
    group: "interviews",
    label: "Structured Async Interview",
    methodName: "Structured interview",
    methodBasis: "Campion's 15 components by construction; transcript-only scoring.",
    evidenceLevel: "method-family research",
    defaultMinutes: 20,
    description:
      "Fixed core questions, bounded neutral probes and per-question BARS create comparable, auditable evidence. Only reviewed answer content is evaluated.",
    candidateIntroTemplate:
      "This structured interview asks every candidate for this role the same questions about real situations from your experience. Your answers are scored against published, job-related criteria — what you say, never how you look or sound.",
    researchRef: "R-I.1, R-I.2",
  },

  live_ai_interview: {
    kind: "live_ai_interview",
    group: "interviews",
    label: "Live AI Interview",
    methodName: "Structured interview (live AI)",
    methodBasis: "Same structured base plan with real-time anchored probing; free-form question generation not offered.",
    evidenceLevel: "method-family research",
    defaultMinutes: 20,
    description:
      "A real-time conversation with a disclosed AI interviewer, constrained to the frozen core plan, equivalent rephrases and pre-approved evidence probes.",
    candidateIntroTemplate:
      "You'll have a live conversation with an interviewer that is always disclosed as AI. It asks the same core questions as every candidate, with bounded clarifying follow-ups. Only the reviewed transcript is scored against job-related criteria, and a text accommodation remains available.",
    researchRef: "R-I.2, R-I.8",
  },

  chat_interview: {
    kind: "chat_interview",
    group: "interviews",
    label: "Structured Chat Interview",
    methodName: "Structured interview (text)",
    methodBasis:
      "Structured interview in text with the same frozen question and rubric controls; any configured deadline or whole-stage limit is disclosed and enforced separately.",
    evidenceLevel: "method-family research",
    defaultMinutes: 15,
    description:
      "Camera-free structured interview in text, with the same frozen criteria, bounded probes and BARS as the recorded formats.",
    candidateIntroTemplate:
      "A text-based interview — no camera needed. Every candidate answers the same job-related questions, and your written answers are scored against the same criteria for everyone.",
    researchRef: "R-I.2, R-II.2",
  },

  /* —— Group C · Tests & questionnaires —— */

  sjt: {
    kind: "sjt",
    group: "tests",
    label: "Situational Judgment Test",
    methodName: "Situational judgment test",
    methodBasis:
      "Job-specific dilemmas require SME review, a documented scoring key and pilot/local evidence before they may affect selection.",
    evidenceLevel: "SME + local evidence required",
    defaultMinutes: 8,
    description:
      "Realistic role dilemmas with keyed response options — a low-fidelity simulation of the judgment calls the job actually requires.",
    candidateIntroTemplate:
      "You'll see realistic situations from this job and choose how you'd respond. There are no trick questions — the scenarios reflect the judgment the role actually requires.",
    researchRef: "R-I.4",
  },

  cognitive: {
    kind: "cognitive",
    group: "tests",
    label: "Cognitive Ability Test",
    methodName: "General mental ability test",
    methodBasis:
      "Use only a named, validated instrument with an accessibility plan, job-related rationale and local subgroup/outcome monitoring.",
    evidenceLevel: "validated instrument required",
    defaultMinutes: 18,
    description:
      "Reasoning subtests from a configured validated provider. WhiteBox keeps the method unavailable until the exact instrument and its permitted use are documented.",
    candidateIntroTemplate:
      "A named reasoning assessment selected for this role. The connected provider must disclose its instructions, practice experience, accessibility options and score use before you begin.",
    researchRef: "R-I.1, R-I.6",
  },

  personality: {
    kind: "personality",
    group: "tests",
    label: "Personality Questionnaire",
    methodName: "Personality self-report (Big Five / HEXACO)",
    methodBasis:
      "Use only a named work-related instrument with construct evidence, accessibility review, permitted-use limits and local monitoring.",
    evidenceLevel: "validated instrument required",
    defaultMinutes: 10,
    description:
      "A configured work-related questionnaire from a validated provider. Generated or improvised personality items cannot affect selection.",
    candidateIntroTemplate:
      "A questionnaire about how you prefer to work. There are no right or wrong answers; it adds context to the overall picture and is never used on its own to reject anyone.",
    researchRef: "R-I.4",
  },

  integrity_test: {
    kind: "integrity_test",
    group: "tests",
    label: "Integrity & Reliability",
    methodName: "Overt integrity test",
    methodBasis:
      "Use only a named, validated overt instrument tied to a documented safety, asset or compliance requirement; generated items are prohibited.",
    evidenceLevel: "validated instrument required",
    defaultMinutes: 6,
    description:
      "A configured overt questionnaire for a documented cash, safety or compliance requirement. It cannot be generated ad hoc or become a sole decision rule.",
    candidateIntroTemplate:
      "A questionnaire about workplace situations involving rules and reliability — relevant because this role carries real responsibility for assets, safety, or compliance. It is never the sole reason for a decision.",
    researchRef: "R-I.4",
  },

  job_knowledge: {
    kind: "job_knowledge",
    group: "tests",
    label: "Job Knowledge Test",
    methodName: "Job-knowledge test",
    methodBasis:
      "Items sample knowledge that the frozen job analysis identifies as necessary on entry; keys and open responses are reviewed against published content.",
    evidenceLevel: "content evidence required",
    defaultMinutes: 12,
    description:
      "Tests knowledge the role demonstrably uses day to day, with item-level provenance, answer keys and SME review.",
    candidateIntroTemplate:
      "Questions about knowledge this role uses day to day. Knowing this material is directly tied to doing the job well.",
    researchRef: "R-I.1",
  },

  language_test: {
    kind: "language_test",
    group: "tests",
    label: "Language Proficiency",
    methodName: "CEFR-aligned proficiency assessment",
    methodBasis: "CEFR descriptors as the rubric; scored per skill against the attribute's target level.",
    evidenceLevel: "validated instrument required",
    defaultMinutes: 20,
    description:
      "CEFR-aligned check of the language skills the role requires, scored per skill against the target level set on the language attribute.",
    candidateIntroTemplate:
      "A short check of the language skills this role requires, measured against the level stated in the job description.",
    researchRef: "R-III.1",
  },

  /* —— Group D · Simulations & work —— */

  work_sample: {
    kind: "work_sample",
    group: "simulations",
    label: "Work Sample / Take-Home",
    methodName: "Work-sample test",
    methodBasis: "Samples over signs — direct observation of the work itself.",
    evidenceLevel: "content evidence required",
    defaultMinutes: 120,
    description:
      "A bounded piece of representative work graded anonymously against a published BARS rubric and checked for proportional candidate burden.",
    candidateIntroTemplate:
      "A small piece of real work, close to what the role actually involves — the fairest way to show what you can do. It is graded anonymously against a published rubric, and the AI-use policy is stated up front.",
    researchRef: "R-I.1, R-I.7",
  },

  coding: {
    kind: "coding",
    group: "simulations",
    label: "Coding Assessment",
    methodName: "Work-sample test (software)",
    methodBasis:
      "A representative software work sample reviewed against a frozen quality rubric. Automated execution or a defense round may be used only when that exact service is connected and disclosed.",
    evidenceLevel: "content evidence required",
    defaultMinutes: 60,
    description:
      "A software work sample that accepts reviewable source evidence and uses a published rubric. Unsupported execution, similarity and defense features remain unavailable instead of being simulated.",
    candidateIntroTemplate:
      "A hands-on coding task similar to this role's day-to-day work, graded on published criteria. The AI-use policy for this task is stated before you start.",
    researchRef: "R-I.1, R-III.7",
  },

  case_exercise: {
    kind: "case_exercise",
    group: "simulations",
    label: "Case / In-Basket Exercise",
    methodName: "Assessment-center exercise",
    methodBasis:
      "A representative, job-related scenario scored at the exercise level against frozen behavioral anchors.",
    evidenceLevel: "content evidence required",
    defaultMinutes: 45,
    description:
      "A configured case analysis or in-basket response, submitted as exact text or private artifacts and scored at the exercise level.",
    candidateIntroTemplate:
      "A realistic job scenario to work through — the kind of situation this role handles. Your response is scored on the quality of the outcome, against a published rubric.",
    researchRef: "R-I.4",
  },

  /* —— Group E · Verification & human —— */

  doc_verification: {
    kind: "doc_verification",
    group: "verification",
    label: "Documents & Credentials",
    methodName: "Document content review",
    methodBasis:
      "Private artifacts are bound to the frozen application so a named reviewer can check whether their contents meet the published requirement. This does not establish issuer authenticity.",
    evidenceLevel: "human content review",
    defaultMinutes: 6,
    description:
      "Collects PDF or DOCX evidence for manual content review. Receipt alone is not proof of authenticity, and a mismatch never auto-rejects.",
    candidateIntroTemplate:
      "Upload PDF or DOCX documents whose contents address the published qualification requirement. A named reviewer checks the contents; this stage does not independently verify the issuer or authenticity.",
    researchRef: "R-IV.2",
  },

  reference_check: {
    kind: "reference_check",
    group: "verification",
    label: "Reference Check",
    methodName: "Structured reference check",
    methodBasis:
      "Standardized, job-related questions and an unable-to-observe option make referee evidence comparable; identity and response provenance still require verification.",
    evidenceLevel: "method-family research",
    defaultMinutes: 5,
    description:
      "Structured referee questionnaires on the vacancy's own attributes, with fraud controls. Structure is what makes references worth anything.",
    candidateIntroTemplate:
      "We'll ask the referees you nominate a short, structured set of job-related questions — the same set for every candidate at this stage.",
    researchRef: "R-I.1, R-II.10",
  },

  human_stage: {
    kind: "human_stage",
    group: "verification",
    label: "Human Interview Stage",
    methodName: "Structured panel interview",
    methodBasis:
      "The panel uses the frozen job-related questions and BARS; reviewers rate independently before discussion and record evidence-backed reasons.",
    evidenceLevel: "method-family research",
    defaultMinutes: 45,
    description:
      "A live human round inside the same pipeline. Evidence-gap interview kits stay tied to the frozen criteria, and panelists rate independently on the same BARS before discussing.",
    candidateIntroTemplate:
      "An interview with people from the team, using the same published criteria as every earlier step. The hiring team will provide the scheduling instructions for this stage.",
    researchRef: "R-I.2, R-III.4",
  },

  custom: {
    kind: "custom",
    group: "verification",
    label: "Custom Block",
    methodName: "Author-defined instrument",
    methodBasis: "No validity evidence until locally validated — experimental by default.",
    evidenceLevel: "local evidence required",
    defaultMinutes: 10,
    description:
      "An author-defined instrument built from raw primitives. Ships with an experimental evidence badge until you validate it locally.",
    candidateIntroTemplate:
      "An additional exercise specific to this role. What it measures and how it is scored is described before you start.",
    researchRef: "R-I.4",
  },
};

/* ---------- library grouping (drawer order, SPEC §4.4) ---------- */

export const BLOCK_GROUPS: { id: BlockGroup; label: string; kinds: BlockKind[] }[] = [
  { id: "screening", label: "Screening & background", kinds: ["application_form", "knockout", "cv_intake"] },
  { id: "interviews", label: "Interviews", kinds: ["async_interview", "live_ai_interview", "chat_interview"] },
  { id: "tests", label: "Tests & questionnaires", kinds: ["sjt", "cognitive", "personality", "integrity_test", "job_knowledge", "language_test"] },
  { id: "simulations", label: "Simulations & work", kinds: ["work_sample", "coding", "case_exercise"] },
  { id: "verification", label: "Verification & human", kinds: ["doc_verification", "reference_check", "human_stage", "custom"] },
];

/* ---------- per-kind default settings (SPEC §4.4.1–19) ---------- */
/* Item arrays start empty where content is generated from criteria. */

export function defaultSettings(kind: BlockKind): BlockSettings {
  switch (kind) {
    case "application_form":
      return {
        kind,
        fields: [
          /* contact block is locked in the builder and feeds the PII vault (§4.4.1) */
          { id: "fld-name", label: "Full name", type: "short_text", required: true, pii: true, scored: false },
          { id: "fld-email", label: "Email", type: "short_text", required: true, pii: true, scored: false },
          { id: "fld-phone", label: "Phone number", type: "short_text", required: false, pii: true, scored: false },
        ],
        prefillFromCv: false,
      };
    case "knockout":
      return { kind, items: [], placement: "before_form" };
    case "cv_intake":
      return {
        kind,
        acceptedFormats: ["pdf", "docx"],
        maxSizeMb: 10,
        parseTargets: [],
        anonymizeForReview: true, // ON by default (R-I.6)
        extractClaims: false,
        portfolioUrlField: false,
      };
    case "async_interview":
      return {
        kind,
        questions: [],
        followUpPolicy: 1,
        order: "fixed",
        introVideo: "none",
        practiceQuestion: false,
        pauseAllowance: 0,
        reviewBeforeSubmit: false, // off for video (spontaneity), on for text
      };
    case "live_ai_interview":
      return {
        kind,
        durationCapMin: 20,
        persona: { name: "Nova", voice: "neutral", disclosedAsAi: true },
        questions: [],
        adaptivity: "probe_only",
        latencyFallback: "async",
        bargeInAllowed: false,
      };
    case "chat_interview":
      return {
        kind,
        questions: [],
        minAnswerWords: 30,
        maxAnswerWords: 200,
        typingTelemetry: false,
        pastePolicy: "warn",
        followUpPolicy: 1,
        tone: "neutral",
      };
    case "sjt":
      return {
        kind,
        instruction: "behavioral_tendency", // lower cognitive loading by default (R-I.4)
        format: "pick_best",
        keyType: "hybrid",
        items: [],
        timing: "untimed",
        randomizeOrder: false,
        pilotMode: false,
      };
    case "cognitive":
      return {
        kind,
        subtests: ["numerical", "verbal", "logical"],
        itemsPerSubtest: 8,
        adaptive: false,
        totalTimeMin: 18,
        calculatorAllowed: false,
        practiceItems: 2,
      };
    case "personality":
      return {
        kind,
        model: "big_five",
        lengthItems: 60,
        format: "forced_choice", // faking-resistant default (R-I.4)
        contextualizedAtWork: true,
        traitMappings: [],
        candidateFeedbackReport: true, // Sapia-style "My Insights"
      };
    case "integrity_test":
      return { kind, domains: ["rule_adherence", "dependability"], lengthItems: 24, format: "likert" };
    case "job_knowledge":
      return {
        kind,
        items: [],
        timing: "total",
        totalTimeMin: 15,
        difficultyMix: { easy: 30, medium: 50, hard: 20 },
        openBook: false,
      };
    case "language_test":
      return { kind, language: "English", skills: ["reading", "listening"], targetLevel: "B2", minutesPerSkill: 10 };
    case "work_sample":
      return {
        kind,
        brief: "",
        deliverables: ["file"],
        timeModel: "honesty_window",
        timeBudgetHours: 2,
        aiPolicy: "disclosed",
        originalityCheck: false,
        anonymizedGrading: true,
        rubricDimensions: [],
        defenseFollowUp: false,
      };
    case "coding":
      return {
        kind,
        environment: "browser_ide",
        languages: [],
        taskSource: "custom",
        brief: "",
        scoringSplit: { correctness: 50, quality: 30, approach: 20 },
        timeCapMin: 60,
        aiPolicy: "disclosed",
        similarityCheck: false,
        rubricDimensions: [],
      };
    case "case_exercise":
      return { kind, format: "case_analysis", materials: "", timeBoxMin: 45, rubricDimensions: [] };
    case "doc_verification":
      return {
        kind,
        requiredDocuments: [],
        acceptedFormats: ["pdf", "docx"],
        mode: "manual_document_review",
        idCheck: false,
        placement: "post_shortlist", // reduce candidate burden by default (§4.4.16)
      };
    case "reference_check":
      return {
        kind,
        referees: { count: 2, relationships: ["manager", "peer"] },
        questionnaire: [],
        collectionWindowDays: 7,
        fraudControls: true,
        anonymizedAggregation: false, // only meaningful at ≥3 referees
      };
    case "human_stage":
      return {
        kind,
        panel: [],
        selfBooking: false,
        interviewKitAuto: false,
        independentBeforeDiscussion: true, // R-I.2 #13
        aiNotetaker: false,
      };
    case "custom":
      return { kind, instructions: "", primitives: ["text"], rubricDimensions: [] };
  }
}

/* ---------- factory (SPEC §4.4.0 common settings) ---------- */

const TIER1_KINDS: BlockKind[] = [
  "async_interview", "live_ai_interview", "chat_interview",
  "sjt", "cognitive", "personality", "integrity_test", "job_knowledge", "language_test",
];

const UNSCORED_BY_DEFAULT: BlockKind[] = ["application_form", "knockout", "cv_intake", "doc_verification"];

const mkId = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export function createBlock(kind: BlockKind, order: number): PipelineBlock {
  const meta = BLOCK_LIBRARY[kind];
  return {
    id: mkId("blk"),
    kind,
    order,
    title: meta.label,
    candidateIntro: meta.candidateIntroTemplate,
    required: true,
    scored: !UNSCORED_BY_DEFAULT.includes(kind),
    estimatedMinutes: meta.defaultMinutes,
    measures: [],
    settings: defaultSettings(kind),
    integrityTier: TIER1_KINDS.includes(kind) ? 1 : 0,
    accessibility: { extraTimeMultiplier: 1, captions: true, screenReaderMode: false, alternativeFormats: false },
    retakePolicy: 1,
  };
}

/* ---------- time estimation (feeds the composer's time rail, §4.4) ---------- */

export function estimateMinutes(block: PipelineBlock): number {
  const s = block.settings;
  let minutes = BLOCK_LIBRARY[block.kind].defaultMinutes;

  switch (s.kind) {
    case "application_form":
      if (s.fields.length > 0) minutes = 1 + s.fields.length * 0.5;
      break;
    case "knockout":
      if (s.items.length > 0) minutes = s.items.length * 0.5;
      break;
    case "cv_intake":
      break; // upload + parse review — flat default
    case "async_interview":
      if (s.questions.length > 0) {
        const perQuestionSec = s.questions.reduce(
          (sum, q) => sum + (q.thinkTimeSec ?? 45) + q.answerCapSec + s.followUpPolicy * 45,
          0,
        );
        minutes =
          perQuestionSec / 60 +
          (s.introVideo === "none" ? 0 : 1) +
          (s.practiceQuestion ? 2 : 0);
      }
      break;
    case "live_ai_interview":
      minutes = s.durationCapMin;
      break;
    case "chat_interview":
      if (s.questions.length > 0) {
        /* reading + typing toward the max answer length at ~40 words/min */
        minutes = s.questions.length * (0.5 + s.maxAnswerWords / 40) * (1 + 0.25 * s.followUpPolicy);
      }
      break;
    case "sjt":
      if (s.items.length > 0) minutes = s.items.length * 0.75;
      break;
    case "cognitive":
      minutes = s.totalTimeMin;
      break;
    case "personality":
      minutes = s.lengthItems * 0.15;
      break;
    case "integrity_test":
      minutes = s.lengthItems * 0.2;
      break;
    case "job_knowledge":
      if (s.timing === "total" && s.totalTimeMin) minutes = s.totalTimeMin;
      else if (s.items.length > 0) minutes = s.items.length * 0.75;
      break;
    case "language_test":
      minutes = s.skills.length * s.minutesPerSkill;
      break;
    case "work_sample":
      minutes = s.timeBudgetHours * 60;
      break;
    case "coding":
      minutes = s.timeCapMin;
      break;
    case "case_exercise":
      minutes = s.timeBoxMin;
      break;
    case "doc_verification":
      if (s.requiredDocuments.length > 0) minutes = 2 + s.requiredDocuments.length * 1.5;
      break;
    case "reference_check":
      minutes = 1 + s.referees.count * 2; // candidate side: nominating referees
      break;
    case "human_stage":
    case "custom":
      break; // flat defaults
  }

  return Math.max(1, Math.round(minutes));
}
