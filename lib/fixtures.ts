/* Typed fixtures matching the data model — MASTERDOC · Book I · Part XII.
   UI is built against these until the AI/backend tickets land (Book V rule 5).
   Core shapes now live in lib/types.ts (SPEC §3); re-exported here for compat. */

export type {
  ConfidenceBand, Tier, VerificationStatus, VacancyStatus,
  EvidenceSpan, Driver, CompetencyScore, AuditEntry, Candidate, Vacancy,
} from "./types";

import type {
  Candidate, CompetencyScore, AuditEntry, Vacancy,
} from "./types";

export const vacancies: Vacancy[] = [
  { id: "vac-005", title: "Product Manager — Marketplace", status: "LIVE", code: "WBX-3N8D", configVersion: 1, candidates: 1, needReview: 0, funnel: [1, 1, 0, 0, 0, 0] },
  { id: "vac-001", title: "Team Lead — Core Platform", status: "LIVE", code: "WBX-7Q4K", configVersion: 3, candidates: 214, needReview: 12, funnel: [214, 186, 171, 128, 96, 41] },
  { id: "vac-002", title: "Senior Product Designer", status: "LIVE", code: "WBX-2M9F", configVersion: 1, candidates: 158, needReview: 4, funnel: [158, 140, 122, 87, 63, 22] },
  { id: "vac-003", title: "Data Engineer (Analytics)", status: "DRAFT", code: "WBX-5T1C", configVersion: 1, candidates: 0, needReview: 0, funnel: [0, 0, 0, 0, 0, 0] },
  { id: "vac-004", title: "Customer Success Manager", status: "CLOSED", code: "WBX-9K2R", configVersion: 5, candidates: 302, needReview: 0, funnel: [302, 270, 244, 190, 141, 58] },
];

export const kpis = [
  { label: "ACTIVE VACANCIES", value: 2, trend: 0, spark: [1, 1, 2, 2, 2, 2, 2] },
  { label: "TOTAL CANDIDATES", value: 674, trend: 12.4, spark: [420, 480, 512, 555, 590, 640, 674] },
  { label: "PASSED THRESHOLD", value: 96, trend: 8.1, spark: [40, 52, 61, 70, 78, 88, 96] },
  { label: "IN INVITED LIST", value: 41, trend: 5.2, spark: [12, 18, 22, 27, 31, 36, 41] },
  { label: "AVG SCORE", value: 71.3, trend: 1.8, spark: [66, 67, 68, 69, 70, 71, 71.3] },
  { label: "OPEN BIAS FLAGS", value: 1, trend: -50, spark: [4, 3, 3, 2, 2, 2, 1], alert: true },
];

const mkAudit = (cid: string): AuditEntry[] => [
  { id: "AE-0091", timestamp: "2026-07-16 09:12:04", actor: "model v2.3", action: "SCORED", target: `${cid} · all competencies`, modelVer: "wbx-score-2.3 / prompt v11 / rubric v3", hash: "9f4e2ab1…c07d" },
  { id: "AE-0114", timestamp: "2026-07-16 14:47:31", actor: "a.rakhimova (HR)", action: "OVERRIDDEN", target: `${cid} · Communication`, reason: "Answer at 24:10 shows structured conflict handling the model under-weighted.", modelVer: "wbx-score-2.3", hash: "b21c88fe…19aa" },
  { id: "AE-0117", timestamp: "2026-07-16 14:49:02", actor: "a.rakhimova (HR)", action: "APPROVED", target: `${cid} · overall`, modelVer: "wbx-score-2.3", hash: "77d0c4e9…f3b2" },
];

const leadership: CompetencyScore = {
  id: "leadership",
  name: "Leadership",
  score: 84,
  weight: 25,
  confidence: "High",
  confidenceReason: "High confidence — consistent evidence across 5 answers, low variance between episodes.",
  drivers: [
    { text: "Described leading a 6-person team through a failed release with a concrete recovery plan", impact: 0.42, direction: "pos" },
    { text: "Took ownership of an unpopular decision and explained the trade-off to stakeholders", impact: 0.31, direction: "pos" },
    { text: "Delegation examples were secondhand rather than personally driven", impact: 0.14, direction: "neg" },
  ],
  evidence: [
    { quote: "I told the team the rollback was my call — we lost two days, but we shipped a stable build and I walked sales through why.", timestamp: "12:40", question: "Tell me about a difficult decision you made under pressure." },
    { quote: "I split the incident into three tracks and assigned owners before the postmortem, not after.", timestamp: "18:22", question: "How do you organize a team in a crisis?" },
  ],
  trace: [
    "Collected 5 answer segments tagged leadership-relevant",
    "Matched segments against rubric v3 anchors (ownership, delegation, direction-setting)",
    "Weighted personally-driven episodes above secondhand reports",
    "Cross-checked consistency with answers at 12:40 and 18:22 — no contradiction",
    "Assigned band 80–85, settled 84 on evidence density",
  ],
  docVerified: true,
};

const decisionMaking: CompetencyScore = {
  id: "decision-making",
  name: "Decision-Making",
  score: 78,
  weight: 20,
  confidence: "High",
  confidenceReason: "High confidence — 4 independent episodes, all with verifiable outcomes.",
  drivers: [
    { text: "Consistently framed decisions as reversible vs irreversible before committing", impact: 0.38, direction: "pos" },
    { text: "Quantified trade-offs in two of four examples", impact: 0.27, direction: "pos" },
    { text: "One example lacked a stated outcome — depth unverified", impact: 0.18, direction: "neg" },
  ],
  evidence: [
    { quote: "For reversible calls I decide same-day; for the migration I ran a one-week spike because you can't easily walk that back.", timestamp: "24:10", question: "How do you decide how long to deliberate?" },
  ],
  trace: [
    "Identified 4 decision episodes in transcript",
    "Scored each against rubric anchors (framing, information use, outcome)",
    "Discounted episode 3 — no outcome stated after follow-up",
    "Aggregated to 78 with weight on recency",
  ],
};

const communication: CompetencyScore = {
  id: "communication",
  name: "Communication",
  score: 72,
  weight: 20,
  confidence: "Medium",
  confidenceReason: "Medium confidence — clear structure, but only 2 stakeholder-facing episodes to draw on.",
  drivers: [
    { text: "Answers followed situation → action → result structure without prompting", impact: 0.35, direction: "pos" },
    { text: "Adapted register when asked to explain a technical topic to a non-technical audience", impact: 0.29, direction: "pos" },
    { text: "Limited evidence of upward communication with executives", impact: 0.2, direction: "neg" },
  ],
  evidence: [
    { quote: "With the CFO I dropped the architecture and led with the two numbers that would change her decision.", timestamp: "31:05", question: "Explain a technical trade-off to a non-technical stakeholder." },
  ],
  trace: [
    "Segmented 12 answers for structural clarity",
    "Rated register-shift exercise at 31:05 as strong",
    "Flagged low episode count for stakeholder communication → confidence Medium",
  ],
};

const stressResilience: CompetencyScore = {
  id: "stress-resilience",
  name: "Stress-Resilience",
  score: 61,
  weight: 15,
  confidence: "Low",
  confidenceReason: "Low confidence — answers shortened notably under the pressure sequence; evidence is thin and mixed.",
  drivers: [
    { text: "Stayed composed and structured during rapid follow-up sequence", impact: 0.3, direction: "pos" },
    { text: "Answer length dropped 60% under pressure questions vs baseline", impact: 0.28, direction: "neg" },
    { text: "Recovery example described avoidance rather than management of the stressor", impact: 0.22, direction: "neg" },
  ],
  evidence: [
    { quote: "Honestly, I just took the weekend off and came back to it.", timestamp: "38:47", question: "What did you do after the incident escalated?" },
  ],
  trace: [
    "Compared answer dynamics baseline vs pressure sequence",
    "Two of three episodes scored below rubric anchor 3",
    "Evidence density below threshold → confidence Low, human review recommended",
  ],
};

const growthPotential: CompetencyScore = {
  id: "growth",
  name: "Growth Potential",
  score: 81,
  weight: 20,
  confidence: "Medium",
  confidenceReason: "Medium confidence — strong learning narrative, partially self-reported and not yet document-verified.",
  drivers: [
    { text: "Self-taught distributed-systems track with a shipped side project as proof", impact: 0.4, direction: "pos" },
    { text: "Sought and acted on critical feedback in the last review cycle", impact: 0.26, direction: "pos" },
    { text: "Certification claim pending document verification", impact: 0.12, direction: "neg" },
  ],
  evidence: [
    { quote: "The first design review tore my proposal apart. The second one passed — I kept both docs, the diff is the learning.", timestamp: "44:12", question: "Tell me about something you were bad at and got good at." },
  ],
  trace: [
    "Extracted learning-velocity signals from 3 answers",
    "Cross-referenced claimed certification — verification pending",
    "Scored 81; confidence held at Medium until documents verify",
  ],
};

export const candidates: Candidate[] = [
  {
    internalId: "CND-4A19", rank: 1, overall: 84, tier: "Top", confidence: "High",
    confidencePhrase: "High confidence — consistent evidence across competencies",
    verification: "VERIFIED", divergence: true,
    appliedAt: "2026-07-02",
    competencies: [leadership, decisionMaking, communication, stressResilience, growthPotential],
    strengths: ["Owns decisions publicly and explains trade-offs", "Reversible/irreversible decision framing", "Fast, evidenced learning loop"],
    weaknesses: ["Thin evidence under pressure sequences", "Limited executive-level communication", "Delegation partly secondhand"],
    audit: mkAudit("CND-4A19"),
  },
  { internalId: "CND-7C02", rank: 2, overall: 81, tier: "Top", confidence: "High", confidencePhrase: "High confidence — 6 corroborated episodes", verification: "VERIFIED", divergence: false, appliedAt: "2026-07-03", competencies: [{ ...leadership, score: 79 }, { ...decisionMaking, score: 83 }, { ...communication, score: 80 }, { ...stressResilience, score: 70, confidence: "Medium" }, { ...growthPotential, score: 77 }], strengths: ["Strong stakeholder narrative"], weaknesses: ["Fewer crisis episodes"], audit: mkAudit("CND-7C02") },
  { internalId: "CND-2F44", rank: 3, overall: 77, tier: "Top", confidence: "Medium", confidencePhrase: "Medium confidence — good depth, few verifiable outcomes", verification: "PENDING", divergence: false, appliedAt: "2026-07-01", competencies: [{ ...leadership, score: 74 }, { ...decisionMaking, score: 80 }, { ...communication, score: 76 }, { ...stressResilience, score: 72 }, { ...growthPotential, score: 82 }], strengths: ["High learning velocity"], weaknesses: ["Outcomes hard to verify"], audit: mkAudit("CND-2F44") },
  { internalId: "CND-9B71", rank: 4, overall: 74, tier: "Mid", confidence: "High", confidencePhrase: "High confidence — consistent but mid-band evidence", verification: "VERIFIED", divergence: false, appliedAt: "2026-07-05", competencies: [{ ...leadership, score: 71 }, { ...decisionMaking, score: 75 }, { ...communication, score: 78 }, { ...stressResilience, score: 69 }, { ...growthPotential, score: 76 }], strengths: ["Clear communicator"], weaknesses: ["Few leadership episodes"], audit: mkAudit("CND-9B71") },
  { internalId: "CND-5E28", rank: 5, overall: 72, tier: "Mid", confidence: "Medium", confidencePhrase: "Medium confidence — variance between early and late answers", verification: "VERIFIED", divergence: true, appliedAt: "2026-07-04", competencies: [{ ...leadership, score: 70 }, { ...decisionMaking, score: 72 }, { ...communication, score: 74 }, { ...stressResilience, score: 68 }, { ...growthPotential, score: 75 }], strengths: ["Steady under follow-ups"], weaknesses: ["Inconsistent early answers"], audit: mkAudit("CND-5E28") },
  { internalId: "CND-1D93", rank: 6, overall: 69, tier: "Mid", confidence: "Medium", confidencePhrase: "Medium confidence — solid but shallow episode pool", verification: "—", divergence: false, appliedAt: "2026-07-06", competencies: [{ ...leadership, score: 66 }, { ...decisionMaking, score: 70 }, { ...communication, score: 71 }, { ...stressResilience, score: 65 }, { ...growthPotential, score: 73 }], strengths: ["Practical examples"], weaknesses: ["Shallow episode pool"], audit: mkAudit("CND-1D93") },
  { internalId: "CND-8H56", rank: 7, overall: 63, tier: "Mid", confidence: "Low", confidencePhrase: "Low confidence — short answers, few follow-up recoveries", verification: "PENDING", divergence: false, appliedAt: "2026-07-07", competencies: [{ ...leadership, score: 60 }, { ...decisionMaking, score: 64 }, { ...communication, score: 66 }, { ...stressResilience, score: 58 }, { ...growthPotential, score: 68 }], strengths: ["Concise"], weaknesses: ["Low evidence density"], audit: mkAudit("CND-8H56") },
  { internalId: "CND-3J07", rank: 8, overall: 58, tier: "Bottom", confidence: "Medium", confidencePhrase: "Medium confidence — consistent, but below threshold on 3 of 5", verification: "VERIFIED", divergence: false, appliedAt: "2026-07-02", competencies: [{ ...leadership, score: 55 }, { ...decisionMaking, score: 59 }, { ...communication, score: 62 }, { ...stressResilience, score: 54 }, { ...growthPotential, score: 61 }], strengths: ["Honest self-assessment"], weaknesses: ["Below threshold on core competencies"], audit: mkAudit("CND-3J07") },
];

export const attentionQueue = [
  { id: "CND-8H56", reason: "Low-confidence scores await human review", kind: "review" as const },
  { id: "CND-2F44", reason: "Integrity advisory — window switching during Q7", kind: "flag" as const },
  { id: "CND-5E28", reason: "Calibration divergence between 2 reviewers", kind: "divergence" as const },
  { id: "VAC-002", reason: "Score distribution anomaly in group B", kind: "bias" as const },
];

export const threshold = 65;

/* ---- competitions the candidate side can join by code ------------------ */
/* WBX-3N8D was created through the NL→config wizard from this employer text: */
export const employerBrief = `Ищем Product Manager для маркетплейса. Важнее всего: умение принимать решения по данным и метрикам, коммуникация со стейкхолдерами и командой разработки, эмпатия к клиенту и пользователю. Постоянные дедлайны и конфликтующие приоритеты — нужна стрессоустойчивость. Опыт важен, но потенциал роста в приоритете. Высшее образование — плюс, диплом проверяем.`;

export interface Competition {
  vacancyId: string;
  title: string;
  code: string;
  competencies: { name: string; weight: number }[];
  /* where the code drops the candidate: fresh competition → interview flow,
     already-completed application (demo) → status page */
  entry: "interview" | "status";
}

export const competitions: Record<string, Competition> = {
  "WBX-3N8D": {
    vacancyId: "vac-005",
    title: "Product Manager — Marketplace",
    code: "WBX-3N8D",
    competencies: [
      { name: "Decision-Making", weight: 22 },
      { name: "Communication", weight: 22 },
      { name: "Customer Empathy", weight: 20 },
      { name: "Stress-Resilience", weight: 18 },
      { name: "Growth Potential", weight: 18 },
    ],
    entry: "interview",
  },
  "WBX-7Q4K": {
    vacancyId: "vac-001",
    title: "Team Lead — Core Platform",
    code: "WBX-7Q4K",
    competencies: [
      { name: "Leadership", weight: 25 },
      { name: "Decision-Making", weight: 20 },
      { name: "Communication", weight: 20 },
      { name: "Stress-Resilience", weight: 15 },
      { name: "Growth Potential", weight: 20 },
    ],
    entry: "status",
  },
};

export const candidateStatus = {
  code: "WBX-7Q4K",
  vacancyTitle: "Team Lead — Core Platform",
  status: "under_review" as const,
  steps: [
    { label: "Code", done: true },
    { label: "Register", done: true },
    { label: "Profile", done: true },
    { label: "System check", done: true },
    { label: "Interview", done: true },
    { label: "Documents", done: true },
    { label: "Done", done: false },
  ],
};

/* ============================================================
   SPEC v2 DEMO DATA — appended fixtures for the Studio surfaces.
   vacancyV2Demo formalizes the legacy "Team Lead — Core Platform"
   row (vac-001 / WBX-7Q4K / cv3) as a full VacancyV2 (SPEC §3, §5
   built-ins); evaluationsByCandidate is the two-stage engine output
   for CND-4A19 (SPEC §8); emailTemplatesDemo is the dispatch email
   pack (SPEC §9.4). Legacy exports above are untouched.
   ============================================================ */

import type {
  VacancyV2, CandidateEvaluation, EmailTemplate,
  InterviewQuestion, AccessibilityConfig, ProficiencyScale,
  EvidenceSpan, EvidenceChip, ItemScore, BlockResult,
} from "./types";

/* ---- SPEC §4.3.2 · BARS scales — 5 concrete behavioral anchors each ---- */

const LEADERSHIP_BARS: ProficiencyScale["anchors"] = [
  "Recounts team events in the passive voice; no decision or action is identifiably their own.",
  "Describes assigning tasks, but ownership of outcomes stays with their manager or with the team as a whole.",
  "Names a direction they set and the people they organized, with a plausible but unmeasured outcome.",
  "Owns an unpopular call publicly, names who they delegated to and why, and ties the outcome to the structure they built.",
  "Built a durable structure others now run without them, cites the measured team outcome, and names what they changed afterward.",
];

const DECISION_BARS: ProficiencyScale["anchors"] = [
  "Describes outcomes that happened to them; no decision point or alternative is identifiable.",
  "Names a decision but not the alternatives considered or the information that drove its timing.",
  "Names the decision and one rejected alternative, with a stated but unverified outcome.",
  "Names the decision, the information they lacked, the reversible/irreversible framing they applied, and the measured outcome.",
  "All of level 4, plus a reusable decision rule and evidence they revisited the call when new information arrived.",
];

const COMMUNICATION_BARS: ProficiencyScale["anchors"] = [
  "Restates the technical content unchanged regardless of audience; disagreement ends the exchange.",
  "Simplifies vocabulary but keeps the same structure; cannot say what the listener needed to decide.",
  "Reorders the message around the listener's question, with partial evidence the listener acted on it.",
  "Opens with the facts that change the listener's decision, checks understanding, and names the action that followed.",
  "All of level 4, plus converts the disagreement into an explicit shared criterion both sides use afterward.",
];

const STRESS_BARS: ProficiencyScale["anchors"] = [
  "Describes shutting down or exiting the situation; no strategy for the stressor is named.",
  "Names generic coping (rest, time away) with no change to how the pressured work itself was handled.",
  "Kept working through the pressure but cannot describe what they did differently on the worst day.",
  "Names the worst day, the specific triage they applied, and a deliberate recovery practice they repeated.",
  "All of level 4, plus a change they made to the system afterward so the same pressure cannot recur unmanaged.",
];

const GROWTH_BARS: ProficiencyScale["anchors"] = [
  "Cannot name a professional weakness, or names one with no improvement attempt.",
  "Names a weakness and a course or resource, but no applied practice or observable change.",
  "Names a weakness and a practice loop, with self-reported but undocumented improvement.",
  "Names the weakness, the feedback that exposed it, the practice loop, and an artifact showing the before/after delta.",
  "All of level 4, plus now teaches or systematizes the skill for others and is already working the next weakness.",
];

/* ---- SPEC §4.4 · pipeline scaffolding ---------------------------------- */

const BLK_KNOCKOUT = "blk-knockout";
const BLK_CV = "blk-cv-intake";
const BLK_INTERVIEW = "blk-async-interview";
const BLK_DOCS = "blk-doc-verification";
const BLK_HUMAN = "blk-human-panel";

const A11Y_STANDARD: AccessibilityConfig = { extraTimeMultiplier: 1, captions: true, screenReaderMode: true, alternativeFormats: false };
const A11Y_RECORDED: AccessibilityConfig = { extraTimeMultiplier: 1.5, captions: true, screenReaderMode: true, alternativeFormats: true };

/* question texts reuse lib/ai.ts MAIN_TEMPLATES verbatim (SPEC §4.4.4, source: bank) */
const Q_TEXT: Record<string, string> = {
  leadership: "Tell me about a time you led people through something that was failing. What did you actually do?",
  "decision-making": "Walk me through a hard decision you made with incomplete information. How did you decide when to stop deliberating?",
  communication: "Describe a moment you had to explain something complex to someone who disagreed with you. How did you approach it?",
  "stress-resilience": "Tell me about the most pressured period in your recent work. What did you do on the worst day of it?",
  growth: "What is something you were genuinely bad at professionally, and how did you get good at it?",
};

const mkQuestion = (
  attributeId: string,
  probes: [string, string],
  anchors: ProficiencyScale["anchors"],
  rationale: string,
): InterviewQuestion => ({
  id: `q-${attributeId}`,
  text: Q_TEXT[attributeId],
  attributeId,
  type: "behavioral",
  thinkTimeSec: 30,
  answerCapSec: 180,
  modality: "video",
  reRecordAttempts: 1,
  notesAllowed: true,
  probes,
  rubric: { id: `rub-${attributeId}`, attributeId, anchors, version: 3 },
  source: "bank",
  rationale,
});

/* ---- SPEC §3 + §5 · the Team Lead built-in, formalized ----------------- */

export const vacancyV2Demo: VacancyV2 = {
  id: "vac-001",
  code: "WBX-7Q4K",
  status: "LIVE",
  configVersion: 3,

  profile: {
    title: "Team Lead — Core Platform",
    requisitionId: "REQ-2026-041",
    department: "Engineering — Core Platform",
    hiringManager: "m.baker (Eng Director)",
    openings: 1,
    seniority: "Lead",
    employmentType: "full_time",
    workMode: "hybrid",
    locations: ["Almaty, Kazakhstan"],
    timezoneOverlap: "UTC+3 to UTC+7",
    taxonomyRef: { system: "ONET", code: "11-3021.00", label: "Computer and Information Systems Managers" },
    mission: "Lead the eight-person Core Platform team through its next scale-up while keeping incident load humane and decisions written down.",
    responsibilities: [
      "Lead and grow a team of 8 platform engineers",
      "Own reliability and incident response for the services every product ships on",
      "Set the platform roadmap with product leadership and communicate the trade-offs",
      "Run written decision processes for irreversible architecture calls",
    ],
    teamContext: "Core Platform sits between infrastructure and product teams; it owns deployment, data pipelines, and the internal API layer.",
    industryPack: "tech",
    languages: { primary: "en", alternates: ["ru"] },
  },

  /* §4.3 — category weights sum 100; attribute weights sum 100 within each.
     Effective weights ≈ legacy 25/20/20/15/20:
     45·.56=25.2 · 45·.44=19.8 · 55·.36=19.8 · 55·.27=14.85 · 55·.37=20.35 */
  categories: [
    {
      id: "leading-deciding",
      name: "Leading and Deciding",
      weight: 45,
      rationale: "Team-lead role: the leadership cluster is weighted highest per the emphasis on people responsibility.",
      attributes: [
        {
          id: "leadership",
          name: "Leadership",
          kind: "skill",
          definition: "Sets direction for a team, owns outcomes publicly, and delegates with explicit ownership rather than doing the work alone.",
          weight: 56,
          focus: true,
          scale: { anchors: LEADERSHIP_BARS },
          verification: "interview",
          rationale: "The role text names leading people directly — focus attribute with priority question coverage.",
        },
        {
          id: "decision-making",
          name: "Decision-Making",
          kind: "skill",
          definition: "Frames decisions by reversibility and information value, commits at the right moment, and states the measured outcome.",
          weight: 44,
          focus: true,
          scale: { anchors: DECISION_BARS },
          verification: "interview",
          rationale: "Platform calls are often irreversible — decision framing is a focus attribute for this role.",
        },
      ],
    },
    {
      id: "communication-growth",
      name: "Communication and Growth",
      weight: 55,
      rationale: "Stakeholder communication, composure under incident load, and learning velocity carry the rest of the composite.",
      attributes: [
        {
          id: "communication",
          name: "Communication",
          kind: "skill",
          definition: "Adapts structure and register to the audience so a disagreeing or non-expert listener can act on the message.",
          weight: 36,
          scale: { anchors: COMMUNICATION_BARS },
          verification: "interview",
        },
        {
          id: "stress-resilience",
          name: "Stress-Resilience",
          kind: "trait",
          definition: "Maintains structured output and recovers deliberately during sustained pressure rather than avoiding the stressor.",
          weight: 27,
          scale: { anchors: STRESS_BARS },
          verification: "interview",
        },
        {
          id: "growth",
          name: "Growth Potential",
          kind: "trait",
          definition: "Seeks disconfirming feedback, converts it into practice, and can evidence the before/after delta.",
          weight: 37,
          scale: { anchors: GROWTH_BARS },
          verification: "interview",
        },
      ],
    },
  ],

  pipeline: [
    {
      id: BLK_KNOCKOUT,
      kind: "knockout",
      order: 0,
      title: "Minimum requirements",
      candidateIntro: "Two quick questions confirm this role's minimum requirements — work authorization and team-leadership experience. These are rule-based checks, not scored judgments, and a person reviews every borderline answer.",
      required: true,
      scored: false,
      estimatedMinutes: 2,
      measures: [],
      settings: {
        kind: "knockout",
        placement: "after_form",
        items: [
          {
            id: "ko-work-auth",
            question: "Do you have the legal right to work in the country of this role's location without sponsorship?",
            type: "yes_no",
            passValue: true,
            immediate: true,
            rejectionText: "This role requires an existing right to work in the role's location, which we are unable to sponsor at this time. Based on your answer, we cannot move this application forward. If you believe this is an error, you can add an explanation and a person will review it.",
            allowAppeal: true,
          },
          {
            id: "ko-min-lead-years",
            question: "How many years have you spent leading a team of two or more people?",
            type: "numeric_threshold",
            threshold: 3,
            immediate: false,
            rejectionText: "This role asks for at least 3 years of team-leadership experience. Your answer is below that threshold, so a reviewer will look at your full application before any decision is made.",
            allowAppeal: true,
          },
        ],
      },
      integrityTier: 0,
      accessibility: A11Y_STANDARD,
      retakePolicy: 0,
      deadlineOffsetHours: 48,
    },
    {
      id: BLK_CV,
      kind: "cv_intake",
      order: 1,
      title: "CV intake & parsing",
      candidateIntro: "Upload your CV so we can extract your work history and stated qualifications. Your name, photo, and contact details are hidden from reviewers, and factual claims may be verified later against documents.",
      required: true,
      scored: false,
      estimatedMinutes: 4,
      measures: [],
      settings: {
        kind: "cv_intake",
        acceptedFormats: ["pdf", "docx"],
        maxSizeMb: 10,
        parseTargets: ["employment", "education", "certifications", "skills", "links"],
        anonymizeForReview: true,
        extractClaims: true,
        portfolioUrlField: true,
      },
      integrityTier: 0,
      accessibility: A11Y_STANDARD,
      retakePolicy: 0,
      deadlineOffsetHours: 48,
    },
    {
      id: BLK_INTERVIEW,
      kind: "async_interview",
      order: 2,
      title: "Structured async interview",
      candidateIntro: "This interview measures the five attributes the role is scored on — leadership, decision-making, communication, stress-resilience, and growth — through five video questions. Your camera and microphone recording is transcribed; only reviewed answer evidence is scored, never your appearance, voice tone, gaze, background, or alleged reading behavior. You get 30 seconds to think, up to 3 minutes to answer and one re-record per question.",
      required: true,
      scored: true,
      estimatedMinutes: 25,
      measures: [
        { attributeId: "leadership", share: 20 },
        { attributeId: "decision-making", share: 20 },
        { attributeId: "communication", share: 20 },
        { attributeId: "stress-resilience", share: 20 },
        { attributeId: "growth", share: 20 },
      ],
      settings: {
        kind: "async_interview",
        questions: [
          mkQuestion(
            "leadership",
            ["What was your specific role in that — what did you personally decide or do?", "What did the team do differently afterward, and how do you know?"],
            LEADERSHIP_BARS,
            "Past-oriented failure episodes elicit the ownership and delegation evidence the rubric anchors grade.",
          ),
          mkQuestion(
            "decision-making",
            ["What alternative did you reject, and why?", "What was the measurable outcome, and how do you know?"],
            DECISION_BARS,
            "Targets the reversible/irreversible framing named at rubric level 4.",
          ),
          mkQuestion(
            "communication",
            ["What did the other person need to decide, and how did that change what you said?", "How did you check they actually understood?"],
            COMMUNICATION_BARS,
            "Disagreement forces register and structure adaptation — directly observable against the anchors.",
          ),
          mkQuestion(
            "stress-resilience",
            ["What exactly did you triage first on that day, and why?", "What did you change afterward so it would not repeat?"],
            STRESS_BARS,
            "The worst-day specific forces concrete triage evidence over generic coping claims.",
          ),
          mkQuestion(
            "growth",
            ["What feedback or event made the weakness visible to you?", "What evidence shows the improvement — what can you point to?"],
            GROWTH_BARS,
            "Asks for the before/after delta the rubric's upper anchors require as evidence.",
          ),
        ],
        followUpPolicy: 1,
        order: "fixed",
        introVideo: "none",
        practiceQuestion: false,
        pauseAllowance: 0,
        reviewBeforeSubmit: false,
      },
      integrityTier: 1,
      accessibility: A11Y_RECORDED,
      retakePolicy: 1,
    },
    {
      id: BLK_DOCS,
      kind: "doc_verification",
      order: 3,
      title: "Documents & credentials",
      candidateIntro: "If you are shortlisted, we will ask for your diploma and any certifications you named. A named reviewer checks whether the submitted contents meet the published requirement; this does not independently authenticate the issuer. Documents are deleted on the retention schedule, and no upload can trigger an automatic rejection.",
      required: true,
      scored: false,
      estimatedMinutes: 10,
      measures: [],
      settings: {
        kind: "doc_verification",
        requiredDocuments: [
          { id: "doc-diploma", label: "Diploma / degree certificate" },
          { id: "doc-certifications", label: "Professional certifications named in your CV or interview" },
        ],
        acceptedFormats: ["pdf", "docx"],
        mode: "manual_document_review",
        idCheck: false,
        placement: "post_shortlist",
      },
      integrityTier: 0,
      accessibility: A11Y_STANDARD,
      retakePolicy: 0,
    },
    {
      id: BLK_HUMAN,
      kind: "human_stage",
      order: 4,
      title: "Panel interview",
      candidateIntro: "A live conversation with the engineering director and an HR partner. The hiring team coordinates the time, and panelists independently record evidence against the same leadership, communication, and decision-making rubrics before discussion.",
      required: true,
      scored: true,
      estimatedMinutes: 60,
      measures: [
        { attributeId: "leadership", share: 40 },
        { attributeId: "communication", share: 30 },
        { attributeId: "decision-making", share: 30 },
      ],
      settings: {
        kind: "human_stage",
        panel: ["m.baker (Eng Director)", "a.rakhimova (HR)"],
        selfBooking: false,
        interviewKitAuto: false,
        independentBeforeDiscussion: true,
        aiNotetaker: false,
      },
      integrityTier: 0,
      accessibility: A11Y_STANDARD,
      retakePolicy: 0,
    },
  ],

  /* §4.5 */
  scoring: {
    topology: "hybrid",
    weighting: "rational",
    threshold: 65,
    banding: { enabled: false, sedWidth: 4 },
    tieBreakers: ["focus_attributes", "earlier_submission"],
    anonymization: { maskPII: true, revealAtStage: "decision" },
    abstainPolicy: { minEvidencePerAttribute: 1, onAbstain: "flag_human" },
    normalization: "absolute_rubric",
  },

  /* §4.6 */
  experience: {
    landing: {
      showCompensation: false,
      companyBlurb: "Core Platform is the team behind the services every Acme product ships on — deployment, data pipelines, and the internal API layer. Eight engineers who value calm incident handling, written decision records, and unglamorous reliability work done well.",
    },
    notices: {
      jurisdictionProfile: "EU",
      aiDisclosure: "The asynchronous interview in this process is transcribed and scored by an AI system against published rubrics; every final decision is made by a human reviewer, and only the content of your answers is ever scored — never your face, voice tone, or background.",
      retentionDays: 180,
      consentCheckpoints: ["entry", "recorded_blocks"],
      version: 3,
    },
    comms: {
      confirmationEnabled: true,
      reminderCadence: 2,
      dispositionSlaDays: 5,
      feedbackOffer: true,
      senderIdentity: "org",
    },
    tone: "neutral",
  },

  /* §4.7 */
  governance: {
    roles: [
      { userId: "a.rakhimova", name: "A. Rakhimova", role: "Owner", piiReveal: true },
      { userId: "m.baker", name: "M. Baker", role: "HiringManager", piiReveal: false },
    ],
    reviewPolicy: { independentReviews: 2, assignment: "round_robin" },
    calibrationRequired: true,
    dualControlThreshold: 25,
    slaTargets: { reviewQueueHours: 48, dispositionDays: 5 },
    changeControl: { editLive: ["Owner"], pauseClose: ["Owner", "HiringManager"] },
  },

  /* §6 */
  distribution: [
    { channel: "linkedin", url: "https://acme.whitebox.ai/j/WBX-7Q4K?src=linkedin", codeSuffix: "WBX-7Q4K-LI", clicks: 302 },
    { channel: "hh", url: "https://acme.whitebox.ai/j/WBX-7Q4K?src=hh", codeSuffix: "WBX-7Q4K-HH", clicks: 187 },
  ],

  window: { opensAt: "2026-07-01T09:00:00+05:00", closesAt: "2026-07-31T18:00:00+05:00", timezone: "Asia/Almaty" },
  rollingReview: true,

  audit: [
    {
      id: "AE-0007",
      timestamp: "2026-07-01 09:00:12",
      actor: "a.rakhimova (HR)",
      action: "PUBLISHED",
      target: "vac-001 · configVersion 3",
      reason: "Preflight green; rubrics, prompts, and notices frozen at cv3.",
      modelVer: "wbx-score-2.3 / prompt v11 / rubric v3",
      hash: "3e91acd7…5b04",
    },
  ],
  createdAt: "2026-07-01T08:40:00+05:00",
  publishedAt: "2026-07-01T09:00:00+05:00",
};

/* ---- SPEC §8 · engine output for CND-4A19 (Stage A + Stage B) ---------- */

const spanToChip = (s: EvidenceSpan, id: string, blockId: string): EvidenceChip => ({
  id,
  quote: s.quote,
  locator: s.timestamp,
  blockId,
  question: s.question,
});

/* chips reuse the exact quotes + timestamps of the competency consts above */
const chipsLeadership = leadership.evidence.map((s, i) => spanToChip(s, `E-${i + 1}`, BLK_INTERVIEW)); // E-1, E-2
const chipsDecision = decisionMaking.evidence.map((s) => spanToChip(s, "E-3", BLK_INTERVIEW));
const chipsCommunication = communication.evidence.map((s) => spanToChip(s, "E-4", BLK_INTERVIEW));
const chipsStress = stressResilience.evidence.map((s) => spanToChip(s, "E-5", BLK_INTERVIEW));
const chipsGrowth = growthPotential.evidence.map((s) => spanToChip(s, "E-6", BLK_INTERVIEW));

const mkItem = (
  attributeId: string,
  level: ItemScore["level"],
  score: number,
  source: CompetencyScore,
  evidence: EvidenceChip[],
  starAnnotation: NonNullable<ItemScore["starAnnotation"]>,
): ItemScore => ({
  itemId: `q-${attributeId}`,
  itemLabel: Q_TEXT[attributeId],
  attributeId,
  level,
  score,
  evidence,
  drivers: source.drivers,
  confidence: source.confidence,
  confidenceReason: source.confidenceReason,
  abstained: false,
  starAnnotation,
});

const asyncInterviewResult: BlockResult = {
  blockId: BLK_INTERVIEW,
  itemScores: [
    mkItem("leadership", 4, 84, leadership, chipsLeadership, { situation: true, task: true, action: true, result: true }),
    mkItem("decision-making", 4, 78, decisionMaking, chipsDecision, { situation: true, task: true, action: true, result: true }),
    mkItem("communication", 4, 72, communication, chipsCommunication, { situation: true, task: true, action: true, result: true }),
    mkItem("stress-resilience", 3, 61, stressResilience, chipsStress, { situation: true, task: false, action: true, result: false }),
    mkItem("growth", 4, 81, growthPotential, chipsGrowth, { situation: true, task: true, action: true, result: true }),
  ],
  blockScore: 76,
  confidence: "High",
  confidenceReason: "High confidence — dense first-person evidence on four of five items; stress-resilience is Low confidence and flagged for human review.",
  drivers: [leadership.drivers[0], decisionMaking.drivers[0], stressResilience.drivers[1]],
  evidence: [...chipsLeadership, ...chipsDecision, ...chipsCommunication, ...chipsStress, ...chipsGrowth],
  reasoning: [
    { step: 1, text: "Transcribed 5 main answers and 4 anchored follow-ups with word-level timestamps and speaker tags." },
    { step: 2, text: "Scored each answer independently against its attribute's BARS rubric v3 — k=3 runs at temperature 0, median kept." },
    { step: 3, text: "Extracted verifiable claims into the ledger (degree, AWS certification, team size) and routed them to document verification." },
    { step: 4, text: "Weighted personally-driven episodes above secondhand reports; annotated STAR completeness per behavioral item." },
    { step: 5, text: "Rolled item scores into block score 76 at equal 20% shares; stress-resilience flagged Low confidence for the human tray." },
  ],
  integrity: [], // CND-4A19 carries no integrity advisory
  engine: { model: "wbx-score-2.3", promptId: "scorer.item", promptVersion: "v11", rubricVersion: "v3", runs: 3, scoredAt: "2026-07-16T09:12:04Z" },
};

const chipsPanel: EvidenceChip[] = [
  { id: "E-7", quote: "Set roles in the first five minutes of the incident case and kept a visible decision log for the panel.", locator: "panel-note-1", blockId: BLK_HUMAN },
  { id: "E-8", quote: "Delegation examples leaned on named senior engineers rather than own structure.", locator: "panel-note-2", blockId: BLK_HUMAN },
  { id: "E-9", quote: "Explained the rollback trade-off to the non-technical panelist unprompted, leading with cost and risk.", locator: "panel-note-3", blockId: BLK_HUMAN },
  { id: "E-10", quote: "Chose to cut scope rather than slip the date in the case exercise, and defended it with the on-call cost numbers.", locator: "panel-note-4", blockId: BLK_HUMAN },
];

const humanStageResult: BlockResult = {
  blockId: BLK_HUMAN,
  itemScores: [
    {
      itemId: "hs-leadership",
      itemLabel: "Leadership — panel scorecard",
      attributeId: "leadership",
      level: 4,
      score: 82,
      evidence: [chipsPanel[0], chipsPanel[1]],
      drivers: [
        { text: "Structured the incident case quickly and kept ownership visible throughout", impact: 0.41, direction: "pos" },
        { text: "Delegation examples leaned on named senior engineers rather than own structure", impact: 0.19, direction: "neg" },
      ],
      confidence: "High",
      confidenceReason: "High confidence — both panelists scored independently and landed within one rubric level.",
      abstained: false,
    },
    {
      itemId: "hs-communication",
      itemLabel: "Communication — panel scorecard",
      attributeId: "communication",
      level: 4,
      score: 74,
      evidence: [chipsPanel[2]],
      drivers: [
        { text: "Shifted register for the non-technical panelist without being asked", impact: 0.38, direction: "pos" },
      ],
      confidence: "High",
      confidenceReason: "High confidence — the register shift was observed live by both panelists.",
      abstained: false,
    },
    {
      itemId: "hs-decision-making",
      itemLabel: "Decision-Making — panel scorecard",
      attributeId: "decision-making",
      level: 4,
      score: 80,
      evidence: [chipsPanel[3]],
      drivers: [
        { text: "Defended the scope cut with quantified on-call cost rather than preference", impact: 0.36, direction: "pos" },
      ],
      confidence: "High",
      confidenceReason: "High confidence — the case decision was reasoned aloud and matched both written scorecards.",
      abstained: false,
    },
  ],
  blockScore: 79, // 82·.40 + 74·.30 + 80·.30
  confidence: "High",
  confidenceReason: "High confidence — two independent scorecards within one rubric level on every attribute.",
  drivers: [
    { text: "Fast, visible structuring of the incident case", impact: 0.4, direction: "pos" },
    { text: "Quantified defense of the scope-cut decision", impact: 0.33, direction: "pos" },
    { text: "Delegation still leans on named senior engineers", impact: 0.18, direction: "neg" },
  ],
  evidence: chipsPanel,
  reasoning: [
    { step: 1, text: "Both panelists submitted independent scorecards before the discussion unlocked." },
    { step: 2, text: "Each panelist recorded their own evidence notes; no automated notetaker or draft score was used." },
    { step: 3, text: "Item scores rolled up at configured shares (leadership 40, communication 30, decision-making 30) to block score 79." },
  ],
  integrity: [],
  engine: { model: "human", promptId: "human.scorecard", promptVersion: "v1", rubricVersion: "v3", runs: 1, scoredAt: "2026-07-17T15:38:00Z" },
};

export const evaluationsByCandidate: Record<string, CandidateEvaluation> = {
  "CND-4A19": {
    perBlock: [asyncInterviewResult, humanStageResult],
    attributeScores: [leadership, decisionMaking, communication, stressResilience, growthPotential],
    /* weighted rollup: 84·.56 + 78·.44 ≈ 81 · 72·.36 + 61·.27 + 81·.37 ≈ 72 */
    categoryScores: [
      { categoryId: "leading-deciding", score: 81 },
      { categoryId: "communication-growth", score: 72 },
    ],
    overall: 84,
    tier: "Top",
    confidence: "High",
    confidencePhrase: "High confidence — consistent evidence across competencies",
    synthesis: {
      strengths: candidates[0].strengths,
      risks: candidates[0].weaknesses,
      contradictions: [
        {
          claim: "Personally structures delegation during incidents",
          sourceA: "\"I split the incident into three tracks and assigned owners before the postmortem, not after.\" — async interview, 18:22 [E-2]",
          sourceB: "\"Delegation examples leaned on named senior engineers rather than own structure.\" — human panel note [E-8]",
          severity: "note",
        },
      ],
      narrative:
        "Evidence across both interview stages supports a Top-tier result at High confidence. The candidate owns decisions publicly — the rollback call and its stakeholder explanation are first-person and outcome-linked [E-1]. Decision framing is consistent: reversible calls decided same-day, the migration spiked for a week before commitment [E-3], and the panel saw the same quantified reasoning live [E-10]. Communication adapts to the audience — architecture dropped for the two numbers a CFO needed [E-4], with the register shift confirmed by the panel [E-9]. Stress-resilience is the thinnest area: answers shortened under the pressure sequence and the recovery example describes avoidance rather than management [E-5], so that attribute carries Low confidence and a human-review flag. One contradiction is logged at note severity — the claimed delegation structure [E-2] against the panel's observation that examples leaned on named senior engineers [E-8]. Growth evidence is strong and artifact-backed [E-6], with the certification claim held at UNCHECKED until documents arrive.",
    },
    mustHaveResults: [
      { id: "ko-work-auth", passed: true, evidence: "Answered yes to the work-authorization check at entry." },
      { id: "ko-min-lead-years", passed: true, evidence: "Reported 5 years leading teams against a 3-year threshold." },
    ],
    claims: [
      { id: "CL-1", text: "B.Sc. Computer Science, KBTU (2019)", sourceBlockId: BLK_CV, material: true, status: "VERIFIED" },
      { id: "CL-2", text: "AWS Solutions Architect cert (2024)", sourceBlockId: BLK_CV, material: true, status: "UNCHECKED" },
      { id: "CL-3", text: "led a 6-person team", sourceBlockId: BLK_INTERVIEW, material: false, status: "UNCHECKED" },
    ],
    engine: { model: "wbx-score-2.3", promptId: "synth.narrative", promptVersion: "v11", rubricVersion: "v3", runs: 3, scoredAt: "2026-07-16T09:12:04Z" },
  },
};

/* ---- SPEC §9.4 · dispatch email pack ----------------------------------- */

export const emailTemplatesDemo: EmailTemplate[] = [
  {
    id: "tpl-invite",
    name: "Invite — next stage scheduling",
    action: "invite",
    subject: "Next step for {{role_title}} at {{company}}",
    body:
      "Hi {{first_name}},\n\n" +
      "Thank you for completing the process for {{role_title}}. Your results have been reviewed by our team, and we would like to move forward with you.\n\n" +
      "The next step is a conversation with the hiring panel. Please choose a time that works for you: {{schedule_link}}\n\n" +
      "If none of the offered slots fit, reply to this email and we will find one that does.\n\n" +
      "Best regards,\n{{company}} Recruiting",
  },
  {
    id: "tpl-reject",
    name: "Not moving forward — neutral, with explanation offer",
    action: "reject",
    subject: "Your application for {{role_title}} at {{company}}",
    body:
      "Hi {{first_name}},\n\n" +
      "Thank you for the time and care you put into your application for {{role_title}}. After a structured evaluation and a human review, we have decided not to move forward — and we wanted to tell you within the window we promised, by {{sla_date}}.\n\n" +
      "This decision reflects how your responses matched this role's specific criteria, not your abilities overall. If you would like to see how your application was assessed, you can request a structured explanation here: {{explanation_link}}\n\n" +
      "We wish you well in your search.\n\n" +
      "{{company}} Recruiting",
  },
  {
    id: "tpl-hold",
    name: "Hold — talent-pool consent",
    action: "hold",
    subject: "Staying in touch about roles at {{company}}",
    body:
      "Hi {{first_name}},\n\n" +
      "Your results for {{role_title}} were strong. We are not able to extend an invitation for this opening, but we would like your permission to keep your profile in our talent pool for future roles.\n\n" +
      "This is strictly opt-in. If you agree, we will retain your assessment under the retention terms you were shown and contact you when a matching role opens. Reply to this email with \"Yes\" to opt in; if we do not hear from you, your data is deleted on the normal schedule.\n\n" +
      "Best regards,\n{{company}} Recruiting",
  },
  {
    id: "tpl-custom",
    name: "Custom — blank scaffold",
    action: "custom",
    subject: "{{role_title}} at {{company}} — an update",
    body:
      "Hi {{first_name}},\n\n" +
      "[Write your message here. Available merge fields: {{first_name}}, {{role_title}}, {{company}}, {{schedule_link}}, {{sla_date}}, {{explanation_link}}.]\n\n" +
      "Best regards,\n{{company}} Recruiting",
  },
];
