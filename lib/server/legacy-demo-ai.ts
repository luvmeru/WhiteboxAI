import type {
  InterviewStepRequest,
  InterviewStepResponse,
} from "../ai-contracts";
import { createBlock } from "../blocks";
import { createEmptyDraft } from "../studio";
import type {
  AttributeKind,
  AttributeSpec,
  CategorySpec,
  IndustryPack,
  InterviewQuestion,
  PipelineBlock,
  PositionProfile,
  QuestionType,
  Rubric,
  Seniority,
  VacancyV2,
} from "../types";
import type { VacancyAiExecutionMode } from "./ai-rollout";
import { isDevelopmentDemoMode } from "./env";

/**
 * Explicit compatibility-only implementations.
 *
 * Nothing in this module is a production authoring source. Historical
 * applications may use the deterministic interview path only when their
 * frozen execution mode is `legacy_deterministic`; demo vacancy generation is
 * additionally restricted to explicit development demo mode.
 */

const MAIN_TEMPLATES: Record<string, string> = {
  Leadership: "Tell me about a time you led people through something that was failing. What did you actually do?",
  "Decision-Making": "Walk me through a hard decision you made with incomplete information. How did you decide when to stop deliberating?",
  Communication: "Describe a moment you had to explain something complex to someone who disagreed with you. How did you approach it?",
  "Stress-Resilience": "Tell me about the most pressured period in your recent work. What did you do on the worst day of it?",
  "Analytical Thinking": "Give me an example where the data pointed one way and intuition another. What did you do?",
  "Customer Empathy": "Tell me about a time you changed a plan because of something a customer said or did.",
  "Growth Potential": "What is something you were genuinely bad at professionally, and how did you get good at it?",
};

const FOLLOWUPS = [
  "What was your specific role in that — what did you personally decide or do?",
  "What was the measurable outcome, and how do you know?",
  "If you faced it again tomorrow, what would you do differently?",
];

export function nextLegacyDeterministicInterviewStep(
  req: InterviewStepRequest,
  executionMode: VacancyAiExecutionMode,
): InterviewStepResponse {
  if (executionMode !== "legacy_deterministic") {
    throw new Error(
      "The deterministic interview implementation is restricted to frozen legacy applications.",
    );
  }
  const ordered = [...req.competencies].sort((a, b) => b.weight - a.weight).slice(0, 5);
  const mainsAsked = req.history.filter((t) => t.kind === "main").length;
  const last = req.history[req.history.length - 1];
  const totalPlanned = ordered.length + 2; // rough: mains + ~2 follow-ups

  // Historical compatibility rule: a short main answer receives one probe.
  if (last?.answer && last.kind === "main" && last.answer.trim().length < 140) {
    return {
      done: false,
      question: FOLLOWUPS[mainsAsked % FOLLOWUPS.length],
      topic: last.topic,
      kind: "followup",
      progress: Math.min(0.95, req.history.length / totalPlanned),
    };
  }

  if (mainsAsked >= ordered.length) {
    return {
      done: true,
      progress: 1,
      closing: "That's everything from my side — thank you. Your answers now go to the scoring pipeline, and a human reviewer makes the final call. You can follow your status any time.",
    };
  }

  const next = ordered[mainsAsked];
  return {
    done: false,
    question: MAIN_TEMPLATES[next.name] ?? `Tell me about a concrete situation that shows your ${next.name.toLowerCase()}. What happened and what did you do?`,
    topic: next.name,
    kind: "main",
    progress: Math.min(0.9, req.history.length / totalPlanned),
  };
}

/* Development fixture authoring. These helpers are not model fallbacks. */

const rand = () => Math.random().toString(36).slice(2, 8);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* —— BARS anchor generator: concrete observable behaviors per level, per kind (§4.3.2) —— */

function barsFor(kind: AttributeKind, topic: string): [string, string, string, string, string] {
  const t = topic.toLowerCase();
  switch (kind) {
    case "skill":
      return [
        `Talks about ${t} in general terms only; no personally executed example.`,
        `Describes taking part in ${t} work, but actions were directed by others and outcomes go unstated.`,
        `Gives one concrete, self-driven episode of ${t} with a clear action and a plausible outcome.`,
        `Names the situation, their own decisions, and a measured outcome; explains why the approach fit the constraints.`,
        `Multiple quantified episodes across contexts; anticipates failure modes and teaches the approach to others.`,
      ];
    case "trait":
      return [
        `No behavioral evidence of ${t}; answers stay hypothetical.`,
        `Claims ${t} but examples are secondhand or contradicted elsewhere in the interview.`,
        `One credible episode showing ${t} in a real situation with their own behavior at the center.`,
        `Consistent pattern across two or more episodes, including one where showing ${t} carried a personal cost.`,
        `Pattern is stable under pressure and follow-ups; behavior, reflection, and outcomes all align.`,
      ];
    case "knowledge":
      return [
        `Misstates core concepts of ${t}.`,
        `Recites definitions of ${t} but cannot apply them to a scenario.`,
        `Applies ${t} correctly to a standard scenario.`,
        `Applies ${t} to a novel scenario, naming the trade-offs and limits involved.`,
        `Expert command of ${t}: corrects flawed premises and connects it to adjacent domains with current practice.`,
      ];
    case "qualification":
      return [
        `Credential absent and no equivalent evidence offered.`,
        `Claims the credential; no document provided yet.`,
        `Credential claimed with consistent detail (issuer, year); verification pending.`,
        `Document provided and machine-matched to the claim.`,
        `Document verified and corroborated by demonstrated use in a concrete episode.`,
      ];
    case "experience":
      return [
        `No relevant tenure; examples come from unrelated contexts.`,
        `Brief or peripheral exposure to the ${t} scope.`,
        `Meets the stated tenure with duties matching the scope described.`,
        `Exceeds the tenure with visibly growing responsibility across roles.`,
        `Deep tenure with ownership of outcomes others depended on, verifiable across sources.`,
      ];
    case "language":
      return [
        `Cannot sustain a basic professional exchange.`,
        `Handles simple routine exchanges only; frequent breakdowns.`,
        `Handles routine professional communication with occasional errors (≈B1–B2).`,
        `Communicates fluently on complex topics with minor slips (≈C1).`,
        `Near-native precision and register control (≈C2).`,
      ];
  }
}

const VERIFICATION_BY_KIND: Record<AttributeKind, AttributeSpec["verification"]> = {
  skill: "interview",
  trait: "interview",
  knowledge: "test",
  qualification: "document", // §4.3.2: qualifications default to document proof
  experience: "interview",
  language: "test",
};

/* —— attribute atlas: COMPETENCY_SIGNALS extended with kinds, categories, definitions —— */

interface AttrTemplate {
  name: string;
  kind: AttributeKind;
  cat: "craft" | "people" | "drive";
  trigger: RegExp;
  definition: string;
  rationaleHit: string;
  rationaleMiss: string;
  priority: number; // focus ranking among hits — lower is stronger
}

const ATTRIBUTE_ATLAS: AttrTemplate[] = [
  { name: "Decision quality", kind: "skill", cat: "craft", priority: 1,
    trigger: /decision|решени|priorit|приорит|trade-?off|бюджет|budget|scope/i,
    definition: "Makes calls under incomplete information and can name what would change their mind.",
    rationaleHit: "The description stresses making calls under constraints — high impact on outcomes.",
    rationaleMiss: "Included at base weight: every professional role decides something." },
  { name: "Structured problem solving", kind: "skill", cat: "craft", priority: 2,
    trigger: /analy|аналит|data|данн|metric|метрик|problem|проблем|research|исследов/i,
    definition: "Breaks an ambiguous problem into checkable parts and shows the reasoning that led to the answer.",
    rationaleHit: "The role asks for reasoning over data and metrics explicitly.",
    rationaleMiss: "Baseline analytical expectation for the seniority level." },
  { name: "Domain knowledge", kind: "knowledge", cat: "craft", priority: 4,
    trigger: /процесс|process|стандарт|standard|методолог|methodolog|framework|регламент|domain|отрасл/i,
    definition: "Applies the field's core concepts correctly to concrete cases, not just by the book.",
    rationaleHit: "The description references domain processes and standards — tested, not self-reported.",
    rationaleMiss: "Light-weight knowledge check to anchor the interview evidence." },
  { name: "Tooling fluency", kind: "skill", cat: "craft", priority: 5,
    trigger: /sql|python|excel|figma|crm|jira|api|1c|1с|стек|stack|tool|инструмент/i,
    definition: "Uses the role's core tools hands-on to produce work others rely on.",
    rationaleHit: "Named tools appear in the description — fluency is observable in a work sample.",
    rationaleMiss: "Kept small: no specific tooling named by the employer." },
  { name: "Stakeholder communication", kind: "skill", cat: "people", priority: 2,
    trigger: /communicat|коммуника|stakeholder|стейкхолдер|презент|present|переговор|negotia|клиент|client/i,
    definition: "Explains complex material to a specific audience and lands the decision that matters.",
    rationaleHit: "Stakeholder and client interaction is explicit in the employer's text.",
    rationaleMiss: "Baseline weight for any collaborative role." },
  { name: "People leadership", kind: "skill", cat: "people", priority: 1,
    trigger: /\blead|лидер|руковод|manag|команд|team|наставн|mentor/i,
    definition: "Sets direction for others, owns unpopular calls, and grows the people around them.",
    rationaleHit: "The description names leading people directly — weighted as a focus attribute.",
    rationaleMiss: "Kept at a low weight: the role text does not emphasize people leadership." },
  { name: "Customer empathy", kind: "trait", cat: "people", priority: 3,
    trigger: /клиент|customer|пользовател|user|сервис|service|эмпат|empath/i,
    definition: "Changes a plan because of something a real customer said, did, or needed.",
    rationaleHit: "Customer and user focus is called out — measured through scenario questions.",
    rationaleMiss: "Small weight: no customer-facing signals found." },
  { name: "Collaboration", kind: "trait", cat: "people", priority: 6,
    trigger: /сотруднич|collaborat|cross-?functional|кросс-?функ|партнер|partner/i,
    definition: "Moves work forward across functions without formal authority, keeping others informed.",
    rationaleHit: "Cross-functional work appears in the description.",
    rationaleMiss: "Default people signal so the category never rests on one attribute." },
  { name: "Ownership", kind: "trait", cat: "drive", priority: 3,
    trigger: /ответствен|responsib|ownership|инициатив|initiativ|drive|самостоятел/i,
    definition: "Takes a result personally end-to-end, including the parts nobody assigned.",
    rationaleHit: "The employer emphasizes autonomous responsibility for outcomes.",
    rationaleMiss: "Kept as a base expectation of professional maturity." },
  { name: "Learning velocity", kind: "trait", cat: "drive", priority: 4,
    trigger: /learn|обуча|рост|growth|потенциал|potential|развит|develop|curios|любозн/i,
    definition: "Turns feedback and new domains into demonstrable capability, fast.",
    rationaleHit: "The employer explicitly prioritizes growth potential over current experience.",
    rationaleMiss: "Kept small: growth is not mentioned as a priority." },
  { name: "Resilience under pressure", kind: "trait", cat: "drive", priority: 2,
    trigger: /стресс|stress|давлен|pressure|дедлайн|deadline|конфликт|conflict|кризис|crisis|аврал/i,
    definition: "Keeps output and judgment stable when timelines compress or conflict flares.",
    rationaleHit: "Pressure and conflict situations appear in the employer's text.",
    rationaleMiss: "Low weight: no pressure context named." },
];

const CATEGORY_META: Record<AttrTemplate["cat"], { name: string; rationaleBase: string }> = {
  craft: { name: "Core craft", rationaleBase: "the doing of the job itself — what the person produces and how they reason" },
  people: { name: "Working with people", rationaleBase: "the role happens through other people — stakeholders, customers, the team" },
  drive: { name: "Drive and growth", rationaleBase: "how the person carries responsibility and compounds over time" },
};

/* normalize integer shares to exactly 100 (last item absorbs rounding) */
function normalizeTo100(shares: number[]): number[] {
  const total = shares.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return shares.map((s, i) => {
    const w = i === shares.length - 1 ? 100 - acc : Math.round((s / total) * 100);
    acc += w;
    return w;
  });
}

/* —— SPEC §4.3.3 — the suggestion engine —— */

function buildDemoCriteria(profile: PositionProfile): CategorySpec[] {
  const text = [profile.title, profile.mission, ...(profile.responsibilities ?? [])].join(". ");
  const seniorPlus = ["Senior", "Lead", "Head", "Executive"].includes(profile.seniority);
  const juniorish = ["Intern", "Junior"].includes(profile.seniority);

  const scored = ATTRIBUTE_ATLAS.map((a) => {
    let hit = a.trigger.test(text);
    /* seniority moderators */
    if (a.name === "People leadership" && seniorPlus) hit = true;
    if (a.name === "Learning velocity" && juniorish) hit = true;
    return { a, hit };
  });

  /* focus: strongest signals only, max 3 across the whole vacancy */
  const focusIds = new Set(
    scored.filter((s) => s.hit).sort((x, y) => x.a.priority - y.a.priority).slice(0, 3).map((s) => s.a.name)
  );

  const cats: CategorySpec[] = (["craft", "people", "drive"] as const).map((catKey) => {
    const pool = scored.filter((s) => s.a.cat === catKey);
    const hits = pool.filter((s) => s.hit);
    const picked = [...hits, ...pool.filter((s) => !s.hit)].slice(0, Math.max(2, Math.min(4, hits.length || 2)));
    const weights = normalizeTo100(picked.map((p) => (focusIds.has(p.a.name) ? 2 : 1)));
    const attributes: AttributeSpec[] = picked.map((p, i) => ({
      id: `attr-${slug(p.a.name)}`,
      name: p.a.name,
      kind: p.a.kind,
      definition: p.a.definition,
      weight: weights[i],
      focus: focusIds.has(p.a.name) || undefined,
      scale: { anchors: barsFor(p.a.kind, p.a.name) },
      verification: VERIFICATION_BY_KIND[p.a.kind],
      rationale: p.hit ? p.a.rationaleHit : p.a.rationaleMiss,
    }));
    const meta = CATEGORY_META[catKey];
    return {
      id: `cat-${catKey}`,
      name: meta.name,
      weight: 0, // set below
      attributes,
      rationale: hits.length
        ? `Weighted by ${hits.length} direct signal${hits.length > 1 ? "s" : ""} in the description — ${meta.rationaleBase}.`
        : `Kept at base weight — ${meta.rationaleBase}.`,
    };
  });

  /* category weights: 2 base shares + 1 per hit inside, normalized to 100 */
  const catShares = cats.map((c, i) =>
    2 + scored.filter((s) => s.hit && s.a.cat === (["craft", "people", "drive"] as const)[i]).length
  );
  normalizeTo100(catShares).forEach((w, i) => { cats[i].weight = w; });
  return cats;
}

/* —— rubric drafting: anchors flow from the attribute scale (§4.4.4 rubric lock) —— */

function buildDemoRubric(attr: AttributeSpec): Rubric {
  return {
    id: "r-" + rand(),
    attributeId: attr.id,
    anchors: [...attr.scale.anchors] as [string, string, string, string, string],
    version: 1,
  };
}

/* —— question drafting: behavioral STAR-eliciting for Middle+, situational for
   Junior/Intern (Huffcutt moderator, R-I.2) — with pre-approved probes only —— */

const AUTHOR_PROBES = [
  "What was your specific role in that — what did you personally decide or do?",
  "What was the measurable outcome, and how do you know?",
];

function questionTextFor(attr: AttributeSpec, type: QuestionType): string {
  const n = attr.name.toLowerCase();
  switch (type) {
    case "behavioral":
      switch (attr.kind) {
        case "trait":
          return `Describe a time your ${n} was genuinely tested. What was the situation, what did you do, and what came of it?`;
        case "knowledge":
          return `Tell me about a time you applied your ${n} to a real problem. What did you know that changed the outcome?`;
        case "experience":
          return `Walk me through the most representative project from your ${n}. What was your specific role, and what happened?`;
        case "language":
          return `Tell me about a situation where you had to work entirely in another language. What was at stake, and how did it go?`;
        default:
          return `Tell me about a recent piece of work where ${n} made the difference. What was the situation, and what did you personally do?`;
      }
    case "situational":
      switch (attr.kind) {
        case "trait":
          return `Suppose in your first month here a commitment you made starts slipping and your ${n} is put to the test. What exactly would you do, in order?`;
        case "knowledge":
          return `A colleague proposes a plan that conflicts with how ${n} actually works. What do you check first, and what do you tell them?`;
        default:
          return `Imagine a task lands in your first month that depends entirely on ${n}, with half the time you'd want. Walk me through what you would do, step by step.`;
      }
    case "background":
      return `Which parts of your background best evidence ${n}? Give the concrete facts — dates, scope, outcomes.`;
    case "job_knowledge":
      return `Explain ${n} as you would apply it in this role: the core principles, and one common mistake people make with it.`;
    case "motivation":
      return `What draws you to work where ${n} matters daily? Anchor it in something you have actually done.`;
  }
}

function buildDemoQuestion(
  attr: AttributeSpec,
  type: QuestionType,
  seniority: Seniority,
): InterviewQuestion {
  /* Huffcutt moderator (R-I.2): past-behavior questions need a past to draw on —
     for Junior/Intern, behavioral requests are drafted as situational instead */
  const juniorish = seniority === "Junior" || seniority === "Intern";
  const effectiveType: QuestionType = type === "behavioral" && juniorish ? "situational" : type;
  return {
    id: "q-" + rand(),
    text: questionTextFor(attr, effectiveType),
    attributeId: attr.id,
    type: effectiveType,
    thinkTimeSec: 30,
    answerCapSec: 180,
    modality: "video",
    reRecordAttempts: 1,
    notesAllowed: false,
    probes: [...AUTHOR_PROBES],
    rubric: buildDemoRubric(attr),
    source: "ai",
    rationale:
      effectiveType !== type
        ? `Drafted as situational rather than behavioral: ${seniority} candidates may lack past episodes, and situational questions predict as well at this level (R-I.2).`
        : `${effectiveType === "behavioral" ? "STAR-eliciting behavioral" : `A ${effectiveType.replace("_", " ")}`} question targeting “${attr.name}” — scored only against its own BARS rubric, with pre-approved probes.`,
  };
}

/* Development-only vacancy fixture generation. */

const SENIORITY_MARKERS: [RegExp, Seniority][] = [
  [/chief|c-level|\bceo\b|\bcto\b|\bcoo\b|founder|директор по/i, "Executive"],
  [/\bhead\b|head of|руководитель отдела|руководитель направления/i, "Head"],
  [/\blead\b|тимлид|team ?lead|ведущ/i, "Lead"],
  [/senior|синьор|сеньор|старш/i, "Senior"],
  [/junior|джун|младш/i, "Junior"],
  [/intern|стажер|стажёр|практикант/i, "Intern"],
];

const INDUSTRY_MARKERS: [RegExp, IndustryPack][] = [
  [/developer|engineer|программист|разработ|devops|frontend|backend|\bqa\b|data|product manager|продакт|\bit\b/i, "tech"],
  [/sales|продаж|account manager|customer success|\bsdr\b|\bbdr\b/i, "sales_cs"],
  [/nurse|врач|медиц|clinic|health|фармацевт/i, "healthcare"],
  [/финанс|financ|бухгалт|accountant|accounting|audit|аудит|банк|\bbank/i, "finance"],
  [/retail|магазин|кассир|store|продавец/i, "retail_hourly"],
  [/производств|manufactur|завод|plant|станк/i, "manufacturing"],
  [/логист|logist|warehouse|склад|courier|курьер|driver|водител/i, "logistics"],
  [/дизайн|design|copywrit|маркетолог|marketing|бренд|brand|content|контент/i, "creative"],
  [/государ|public sector|муницип|госуслуг/i, "public_sector"],
  [/учитель|teacher|препода|tutor|education|образователь/i, "education"],
];

export function createDemoVacancyDraft(
  title: string,
  description: string,
): VacancyV2 {
  if (!isDevelopmentDemoMode()) {
    throw new Error(
      "Demo vacancy generation is available only in explicit development demo mode.",
    );
  }
  const draft = createEmptyDraft();
  const text = `${title}. ${description}`;
  const ru = /[а-яё]/i.test(description);

  const seniority = SENIORITY_MARKERS.find(([re]) => re.test(text))?.[1] ?? "Middle";
  const industryPack = INDUSTRY_MARKERS.find(([re]) => re.test(text))?.[1] ?? "custom";

  const sentences = description.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 8);
  const mission = sentences.slice(0, 2).join(" ") || description.trim();
  const responsibilities = sentences.slice(2, 8).length ? sentences.slice(2, 8) : [mission];

  const profile: PositionProfile = {
    ...draft.profile,
    title,
    seniority,
    industryPack,
    mission,
    responsibilities,
    languages: { primary: ru ? "ru" : "en", alternates: ru ? ["en"] : [] },
  };

  const categories = buildDemoCriteria(profile);
  const allAttrs = categories.flatMap((c) => c.attributes);
  const interviewAttrs = [
    ...allAttrs.filter((a) => a.focus),
    ...allAttrs.filter((a) => !a.focus),
  ].slice(0, 6); // one question per attribute, max 6, focus first

  const pipeline: PipelineBlock[] = [];
  let order = 1;

  const questions = interviewAttrs.map((a) =>
    buildDemoQuestion(
      a,
      a.kind === "knowledge" ? "job_knowledge" : "behavioral",
      seniority,
    )
  );
  const shares = normalizeTo100(interviewAttrs.map((a) => (a.focus ? 2 : 1)));
  const interview = createBlock("async_interview", order++);
  interview.title = "Structured interview";
  interview.candidateIntro = `Structured recorded video interview: ${questions.length} questions, each tied to one published criterion. Camera and microphone answers are transcribed; only reviewed answer evidence is scored. No frames are extracted, and no gaze, reading behavior, appearance, emotion, or voice traits are inferred. A text accommodation is available.`;
  interview.scored = true;
  interview.integrityTier = 1;
  interview.estimatedMinutes = questions.length * 3 + 2;
  interview.measures = interviewAttrs.map((a, i) => ({ attributeId: a.id, share: shares[i] }));
  interview.settings = {
    kind: "async_interview",
    questions,
    followUpPolicy: 1,
    order: "fixed",
    introVideo: "none",
    practiceQuestion: false,
    pauseAllowance: 0,
    reviewBeforeSubmit: false,
  };
  pipeline.push(interview);

  return { ...draft, profile, categories, pipeline };
}
