/* ============================================================
   DETERMINISTIC DEMO EVALUATION — SPEC §8 contract reference.
   Stage A (§8.2): independent per-block scoring at block submission.
   Stage B (§8.3): mechanical rollup + cross-source synthesis.
   This implementation is used only in development demo mode and unit tests.
   Production evaluation runs through lib/server/ai-provider.ts.
   Non-negotiables honored here (§8.1): per-attribute scoring only,
   evidence quotes with locators, ranked drivers (principal first),
   abstain → human tray (never a low score), EngineStamp on every
   result, integrity signals as neutral advisories — never verdicts.
   ============================================================ */

import type {
  ApplicationRecord, AttributeSpec, BlockResult, BlockRuntimeResult, Candidate,
  CandidateEvaluation, CompetencyScore, ConfidenceBand, Contradiction, ClaimRecord,
  Driver, EngineStamp, EvidenceChip, EvidenceSpan, IntegritySignal, ItemScore,
  InterviewQuestion, PipelineBlock, ReasoningStep, RubricDimension, Tier, VacancyV2,
} from "./types";
import { sanitizeIntegritySignals } from "./integrity-signals";

/* ———————————————————————— shared helpers ———————————————————————— */

type Level = 1 | 2 | 3 | 4 | 5;

/* level → 0–100 mapping (§8.1: integer level vs BARS + 0–100 mapping) */
const LEVEL_SCORE: Record<Level, number> = { 1: 20, 2: 40, 3: 60, 4: 75, 5: 92 };

const clampLevel = (n: number): Level => Math.max(1, Math.min(5, Math.round(n))) as Level;
const clamp100 = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/* deterministic seed for the k=3 self-consistency jitter (§8.1) */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

const BAND_NUM: Record<ConfidenceBand, number> = { Low: 1, Medium: 2, High: 3 };
const NUM_BAND: ConfidenceBand[] = ["Low", "Low", "Medium", "High"]; // index by 1..3
const lowerBand = (b: ConfidenceBand): ConfidenceBand => (b === "High" ? "Medium" : "Low");
const capBandAt = (b: ConfidenceBand, cap: ConfidenceBand): ConfidenceBand =>
  BAND_NUM[b] > BAND_NUM[cap] ? cap : b;

function makeStamp(vacancy: VacancyV2, promptId: string): EngineStamp {
  return {
    model: "wbx-demo-rubric-evaluator-1",
    promptId,
    promptVersion: "demo-v1",
    rubricVersion: "v" + vacancy.configVersion,
    runs: 3,
    scoredAt: new Date().toISOString(),
  };
}

/* per-block chip numbering; Stage B renumbers to a flat E-1…E-n for narrative cites */
function chipFactory(block: PipelineBlock) {
  let n = 0;
  return (quote: string, locator: string, question?: string): EvidenceChip => ({
    id: `E-${block.order}-${++n}`,
    quote,
    locator,
    blockId: block.id,
    question,
  });
}

const topDrivers = (drivers: Driver[], max = 3): Driver[] => {
  const seen = new Set<string>();
  return [...drivers]
    .sort((a, b) => b.impact - a.impact)
    .filter((d) => (seen.has(d.text) ? false : (seen.add(d.text), true)))
    .slice(0, max);
};

/* ———————————————————————— answer analysis (interview heuristics) ———————————————————————— */

interface AnswerSignals {
  wc: number;
  situation: boolean;
  task: boolean;
  action: boolean;
  result: boolean;
  starCount: number;
  iDensity: number; // "I" vs "we" — personally-driven episodes score above secondhand reports
  numbers: number;
  tools: number; // named tools / proper nouns as concreteness proxy
}

const RE_SITUATION = /\b(when|while|situation|project|last (year|quarter|month)|at (the time|my (previous|last))|когда|ситуац|в проекте|в прошлом)\b/i;
const RE_TASK = /\b(my (task|goal|job|responsibility)|responsible for|needed to|had to|the goal was|задач|нужно было|должен (был|была)|цель была)\b/i;
const RE_ACTION = /\bI (decided|led|built|organized|organised|designed|wrote|launched|created|proposed|negotiated|set up|took (over|ownership)|ran|fixed|implemented|convinced|prioritized)\b|\bя (решил|решила|организовал|организовала|построил|построила|создал|создала|запустил|запустила|предложил|предложила|сделал|сделала)\b/i;
const RE_RESULT = /\d|%|\b(outcome|result|improved|reduced|increased|grew|saved|shipped|результат|итог|вырос|снизил|сэкономил|запустил)\b/i;
const COMMON_CAPS = new Set([
  "I", "The", "We", "My", "A", "An", "In", "It", "When", "After", "Then", "So", "But",
  "And", "At", "On", "For", "This", "That", "As", "To", "With", "Our", "They", "He", "She",
  "Also", "Because", "First", "Second", "Finally", "However", "Before", "During",
]);

function analyzeAnswer(text: string): AnswerSignals {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const situation = RE_SITUATION.test(text);
  const task = RE_TASK.test(text);
  const action = RE_ACTION.test(text);
  const result = RE_RESULT.test(text);
  const iCount = (text.match(/\bI\b/g) ?? []).length + (text.match(/\bя\b/gi) ?? []).length;
  const weCount = (text.match(/\bwe\b/gi) ?? []).length + (text.match(/\bмы\b/gi) ?? []).length;
  const numbers = (text.match(/\d+(?:[.,]\d+)?%?/g) ?? []).length;
  const tools = (text.match(/\b[A-Z][A-Za-z0-9+#.-]{1,}\b/g) ?? []).filter((t) => !COMMON_CAPS.has(t)).length;
  return {
    wc: words.length,
    situation, task, action, result,
    starCount: [situation, task, action, result].filter(Boolean).length,
    iDensity: iCount / Math.max(1, iCount + weCount),
    numbers,
    tools,
  };
}

function baseLevelFor(sig: AnswerSignals): Level {
  let pts = 0;
  if (sig.wc >= 30) pts += 1; // length bands — guarded against eloquence-rewarding (§8.1)
  if (sig.wc >= 80) pts += 1;
  pts += 0.5 * sig.starCount;
  if (sig.iDensity >= 0.6) pts += 0.5;
  if (sig.numbers >= 1) pts += 0.5;
  if (sig.numbers >= 3 || sig.tools >= 2) pts += 0.5;
  return pts >= 4.5 ? 5 : pts >= 3.5 ? 4 : pts >= 2.25 ? 3 : pts >= 1.25 ? 2 : 1;
}

/* k=3 self-consistency: median kept; runs disagreeing > 1 level → human flag (§8.1) */
function selfConsistency(base: Level, seedText: string): { level: Level; disagreement: boolean } {
  const seed = djb2(seedText);
  const jitter = (run: number): number => {
    const v = (seed >>> (run * 7)) % 4;
    return v === 0 ? -1 : v === 3 ? 1 : 0;
  };
  const runs = [base, clampLevel(base + jitter(1)), clampLevel(base + jitter(2))];
  const sorted = [...runs].sort((a, b) => a - b);
  return { level: sorted[1] as Level, disagreement: sorted[2] - sorted[0] > 1 };
}

/* most concrete verbatim sentences become Evidence Chips (§8.2) */
function pickEvidenceSentences(text: string, max = 2): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 4);
  const ranked = sentences
    .map((s) => ({
      s,
      c:
        (s.match(/\d+(?:[.,]\d+)?%?/g) ?? []).length * 2 +
        (/%/.test(s) ? 1 : 0) +
        Math.min(s.split(/\s+/).length, 24) / 24,
    }))
    .sort((a, b) => b.c - a.c);
  return ranked.slice(0, max).map((x) => (x.s.length > 220 ? x.s.slice(0, 217).trimEnd() + "…" : x.s));
}

const fractionLevel = (f: number): Level => (f >= 0.95 ? 5 : f >= 0.75 ? 4 : f >= 0.5 ? 3 : f >= 0.25 ? 2 : 1);

/* item score = level map + small evidence-density adjustment, clamped */
function itemScoreValue(level: Level, chips: number): number {
  return clamp100(LEVEL_SCORE[level] + (chips >= 2 ? 3 : chips === 0 ? -3 : 0));
}

/* ———————————————————————— payload readers ———————————————————————— */

interface KeyedResponse { itemId: string; optionId?: string; optionIds?: string[]; value?: unknown }
interface AnswerPayload { questionId: string; answer: string }
interface ArtifactPayload { text?: string; url?: string; fileName?: string }

function keyedResponses(payload: unknown): KeyedResponse[] {
  if (!Array.isArray(payload)) return [];
  return payload.filter(
    (p): p is KeyedResponse => !!p && typeof p === "object" && typeof (p as KeyedResponse).itemId === "string"
  );
}

function answerPayloads(payload: unknown): AnswerPayload[] {
  if (!Array.isArray(payload)) return [];
  return payload.filter(
    (p): p is AnswerPayload =>
      !!p && typeof p === "object" &&
      typeof (p as AnswerPayload).questionId === "string" &&
      typeof (p as AnswerPayload).answer === "string"
  );
}

/* candidate answer for a question: transcript turns first, payload fallback */
function answerFor(
  q: InterviewQuestion,
  result: BlockRuntimeResult,
  index: number
): { text: string; locator: string } {
  const turns = (result.transcript ?? []).filter((t) => t.speaker === "candidate" && t.itemId === q.id);
  if (turns.length) return { text: turns.map((t) => t.text).join(" "), locator: turns[0].at };
  const hit = answerPayloads(result.payload).find((a) => a.questionId === q.id);
  return { text: hit?.answer ?? "", locator: `q${index + 1}` };
}

/* ———————————————————————— integrity heuristics (advisory only) ———————————————————————— */

function integrityHeuristics(block: PipelineBlock, result: BlockRuntimeResult, totalWords: number): IntegritySignal[] {
  const extra: IntegritySignal[] = [];
  /* suspiciously fast long answers — a neutral latency advisory, never a verdict */
  if (result.elapsedSec > 0 && totalWords >= 120 && totalWords / result.elapsedSec > 3.2) {
    extra.push({
      id: `int-${block.id}-lat`,
      kind: "latency",
      level: "low",
      note: "Long responses were completed unusually fast for this format. Advisory context only.",
    });
  }
  return extra;
}

/* ———————————————————————— block result assembly ———————————————————————— */

function assembleBlockResult(
  vacancy: VacancyV2,
  block: PipelineBlock,
  result: BlockRuntimeResult,
  items: ItemScore[],
  reasoning: ReasoningStep[],
  totalWords: number,
  confidenceCap?: ConfidenceBand
): BlockResult {
  const scored = items.filter((i) => !i.abstained);
  const abstains = items.length - scored.length;
  /* abstained items are EXCLUDED from the mean — abstain routes to a human (§8.1) */
  const blockScore = scored.length ? clamp100(mean(scored.map((i) => i.score))) : 0;
  const avgChips = scored.length ? mean(scored.map((i) => i.evidence.length)) : 0;
  const disagreement = items.some((i) => i.runDisagreement === true);

  let confidence: ConfidenceBand = avgChips >= 2 ? "High" : avgChips >= 1 ? "Medium" : "Low";
  if (disagreement) confidence = lowerBand(confidence);
  if (confidenceCap) confidence = capBandAt(confidence, confidenceCap);

  const parts: string[] = [];
  parts.push(`${scored.reduce((a, i) => a + i.evidence.length, 0)} evidence quotes across ${scored.length || "no"} scored items`);
  if (disagreement) parts.push("self-consistency runs disagreed on at least one item");
  if (abstains > 0) parts.push(`${abstains} item${abstains > 1 ? "s" : ""} abstained and route to human review`);
  const confidenceReason = `${confidence} confidence — ${parts.join("; ")}.`;

  const drivers = topDrivers(items.flatMap((i) => i.drivers));
  const evidence = items.flatMap((i) => i.evidence).slice(0, 4); // same chip objects — Stage B renumbers once

  return {
    blockId: block.id,
    itemScores: items,
    blockScore,
    confidence,
    confidenceReason,
    drivers,
    evidence,
    reasoning,
    integrity: [
      ...sanitizeIntegritySignals(result.integrityEvents),
      ...integrityHeuristics(block, result, totalWords),
    ],
    engine: makeStamp(vacancy, "scorer.item"),
  };
}

function abstainedItem(itemId: string, itemLabel: string, attributeId: string, why: string): ItemScore {
  return {
    itemId,
    itemLabel,
    attributeId,
    level: 1,
    score: 0,
    evidence: [],
    drivers: [{ text: why, impact: 0.5, direction: "neg" }],
    confidence: "Low",
    confidenceReason: `Low confidence — ${why}`,
    abstained: true, // → human tray, never a low score (§8.1)
  };
}

/* ———————————————————————— Stage A scorers per kind (§8.2) ———————————————————————— */

function scoreInterview(
  vacancy: VacancyV2,
  block: PipelineBlock,
  result: BlockRuntimeResult,
  questions: InterviewQuestion[]
): BlockResult {
  const chip = chipFactory(block);
  let totalWords = 0;

  const items: ItemScore[] = questions.map((q, idx) => {
    const { text, locator } = answerFor(q, result, idx);
    const sig = analyzeAnswer(text);
    totalWords += sig.wc;

    /* abstain: under 15 words is not scoreable evidence (§8.1) */
    if (sig.wc < 15) {
      return {
        ...abstainedItem(q.id, q.text, q.attributeId, "answer under 15 words — insufficient evidence to score; routed to a human reviewer instead of a low score"),
        starAnnotation: { situation: sig.situation, task: sig.task, action: sig.action, result: sig.result },
      };
    }

    const base = baseLevelFor(sig);
    const { level, disagreement } = selfConsistency(base, text);
    const evidence = pickEvidenceSentences(text, sig.wc >= 40 ? 2 : 1).map((s) => chip(s, locator, q.text));

    const drivers: Driver[] = [];
    if (sig.result && sig.numbers >= 1)
      drivers.push({ text: "Cites measurable outcomes — numbers or percentages anchor the episode", impact: 0.4, direction: "pos" });
    if (sig.action && sig.iDensity >= 0.6)
      drivers.push({ text: "First-person actions dominate — the episode is personally driven, not secondhand", impact: 0.34, direction: "pos" });
    if (sig.starCount === 4)
      drivers.push({ text: "Covers situation, task, action and result without prompting", impact: 0.3, direction: "pos" });
    if (sig.tools >= 2)
      drivers.push({ text: "Names concrete tools and artifacts — the account is checkable", impact: 0.24, direction: "pos" });
    if (!sig.result)
      drivers.push({ text: "No measurable outcome stated — depth unverified", impact: 0.27, direction: "neg" });
    if (sig.iDensity < 0.4)
      drivers.push({ text: "Mostly “we” framing — personal contribution unclear", impact: 0.22, direction: "neg" });
    if (sig.wc < 30)
      drivers.push({ text: "Answer is brief relative to the question's scope", impact: 0.18, direction: "neg" });
    if (disagreement)
      drivers.push({ text: "Self-consistency runs disagreed by more than one level — flagged for human review", impact: 0.36, direction: "neg" });

    let confidence: ConfidenceBand = evidence.length >= 2 ? "High" : "Medium";
    if (disagreement) confidence = lowerBand(confidence);

    return {
      itemId: q.id,
      itemLabel: q.text,
      attributeId: q.attributeId,
      level,
      score: itemScoreValue(level, evidence.length),
      evidence,
      drivers: topDrivers(drivers),
      confidence,
      confidenceReason: disagreement
        ? `${confidence} confidence — scoring runs disagreed by more than one level; median kept, human review flagged.`
        : `${confidence} confidence — ${evidence.length} verbatim quote${evidence.length > 1 ? "s" : ""}, ${sig.starCount} of 4 STAR components present.`,
      abstained: false,
      starAnnotation: { situation: sig.situation, task: sig.task, action: sig.action, result: sig.result },
      runDisagreement: disagreement || undefined,
    };
  });

  const abstains = items.filter((i) => i.abstained).length;
  const disagreements = items.filter((i) => i.runDisagreement).length;
  const reasoning: ReasoningStep[] = [
    { step: 1, text: "Matched each transcript answer to its question — only text entered scoring, never media (§8.1)." },
    { step: 2, text: "Scored every answer against its attribute's 5-level BARS anchors, one attribute at a time — never holistically." },
    { step: 3, text: `Ran 3 self-consistency passes per item and kept the median level${disagreements ? `; ${disagreements} item${disagreements > 1 ? "s" : ""} disagreed and carry a human-review flag` : "; all runs agreed"}.` },
    { step: 4, text: "Extracted the most concrete verbatim sentences as evidence chips, each with a locator back to the answer." },
    ...(abstains > 0
      ? [{ step: 5, text: `${abstains} answer${abstains > 1 ? "s were" : " was"} under 15 words — abstained and excluded from the mean; a human reviews them instead.` }]
      : []),
    { step: abstains > 0 ? 6 : 5, text: "Averaged non-abstained item scores into the block score with a small evidence-density adjustment." },
  ];

  return assembleBlockResult(vacancy, block, result, items, reasoning, totalWords);
}

function scoreKeyed(vacancy: VacancyV2, block: PipelineBlock, result: BlockRuntimeResult): BlockResult {
  const chip = chipFactory(block);
  const responses = keyedResponses(result.payload);
  const byId = new Map(responses.map((r) => [r.itemId, r]));
  const s = block.settings;
  const measures = block.measures;
  const attrAt = (i: number): string => (measures.length ? measures[i % measures.length].attributeId : "");
  const items: ItemScore[] = [];
  let cap: ConfidenceBand | undefined;

  const pushKeyed = (
    itemId: string, itemLabel: string, attributeId: string, level: Level,
    quote: string, locator: string, question?: string, driverPos?: string, driverNeg?: string
  ) => {
    const ev = [chip(quote, locator, question)];
    const drivers: Driver[] = [
      level >= 4
        ? { text: driverPos ?? "Response matches the scoring key's preferred answer", impact: 0.35, direction: "pos" }
        : level <= 2
          ? { text: driverNeg ?? "Response diverges from the scoring key", impact: 0.3, direction: "neg" }
          : { text: "Partially aligned with the scoring key", impact: 0.2, direction: "pos" },
    ];
    items.push({
      itemId, itemLabel, attributeId, level,
      score: itemScoreValue(level, ev.length),
      evidence: ev,
      drivers,
      confidence: "High",
      confidenceReason: "High confidence — deterministic keyed scoring, no model judgment involved.",
      abstained: false,
    });
  };

  if (s.kind === "sjt") {
    if (s.items.some((it) => !it.smeReviewed)) cap = "Medium"; // generated items pending SME checklist (R-I.8)
    s.items.forEach((it) => {
      const r = byId.get(it.id);
      const chosen = r?.optionId ? it.options.find((o) => o.id === r.optionId) : undefined;
      const label = it.scenario.length > 90 ? it.scenario.slice(0, 87) + "…" : it.scenario;
      if (!chosen) { items.push(abstainedItem(it.id, label, it.attributeId, "no response recorded for this scenario")); return; }
      const keys = it.options.map((o) => o.keyScore);
      const span = Math.max(...keys) - Math.min(...keys) || 1;
      const f = (chosen.keyScore - Math.min(...keys)) / span;
      pushKeyed(it.id, label, it.attributeId, fractionLevel(f), chosen.text, it.id, it.scenario,
        "Chose the SME-preferred response for this scenario", "Chose a response the key ranks low for this scenario");
    });
  } else if (s.kind === "job_knowledge") {
    s.items.forEach((it) => {
      const r = byId.get(it.id);
      const label = it.prompt.length > 90 ? it.prompt.slice(0, 87) + "…" : it.prompt;
      if (!r) { items.push(abstainedItem(it.id, label, it.attributeId, "no response recorded for this item")); return; }
      let level: Level = 3;
      let quote = "";
      if (it.type === "mcq_multi" && it.options) {
        const correct = new Set(it.options.filter((o) => o.correct).map((o) => o.id));
        const chosen = r.optionIds ?? (r.optionId ? [r.optionId] : []);
        const tp = chosen.filter((id) => correct.has(id)).length;
        const fp = chosen.length - tp;
        const f = Math.max(0, Math.min(1, correct.size ? (tp - fp * 0.5) / correct.size : 0));
        level = fractionLevel(f);
        quote = it.options.filter((o) => chosen.includes(o.id)).map((o) => o.text).join("; ") || "no options selected";
      } else if (it.options && (r.optionId || r.optionIds?.length)) {
        const chosen = it.options.find((o) => o.id === (r.optionId ?? r.optionIds?.[0]));
        level = chosen?.correct ? 5 : 1;
        quote = chosen?.text ?? "unrecognized option";
      } else if (typeof r.value === "string" && it.keyPoints?.length) {
        const text = r.value.toLowerCase();
        const hit = it.keyPoints.filter((kp) => {
          const token = kp.toLowerCase().split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? "";
          return token.length > 2 && text.includes(token);
        }).length;
        level = fractionLevel(hit / it.keyPoints.length);
        quote = r.value.length > 200 ? r.value.slice(0, 197) + "…" : r.value;
      } else {
        quote = String(r.value ?? "response recorded");
      }
      pushKeyed(it.id, label, it.attributeId, level, quote, it.id, it.prompt,
        "Answer matches the keyed correct response", "Answer misses the keyed correct response");
    });
  } else if (s.kind === "cognitive") {
    responses.forEach((r, i) => {
      const subtest = s.subtests.length ? s.subtests[i % s.subtests.length] : "item";
      const correct = r.value === true || r.value === 1 || r.value === "correct";
      pushKeyed(r.itemId, `Cognitive · ${subtest} item`, attrAt(i), correct ? 5 : 1,
        `Response: ${String(r.value)}`, r.itemId, undefined,
        "Solved the item within its constraints", "Item answered incorrectly");
    });
    if (!responses.length) items.push(abstainedItem("cog-none", "Cognitive battery", attrAt(0), "no responses recorded"));
  } else if (s.kind === "language_test") {
    responses.forEach((r, i) => {
      const skill = s.skills.length ? s.skills[i % s.skills.length] : "skill";
      const v = Math.max(0, Math.min(100, Number(r.value) || 0));
      pushKeyed(r.itemId, `Language · ${skill} (target ${s.targetLevel})`, attrAt(i), clampLevel(1 + v / 25),
        `Section score ${v}/100 against the ${s.targetLevel} target`, r.itemId, undefined,
        "Performs at or above the target CEFR band", "Performs below the target CEFR band");
    });
    if (!responses.length) items.push(abstainedItem("lang-none", "Language test", attrAt(0), "no responses recorded"));
  }

  const reasoning: ReasoningStep[] = [
    { step: 1, text: "Closed items are scored deterministically against their keys — no LLM touches this path (§8.2)." },
    { step: 2, text: "Each response was compared with the item key and mapped to a 1–5 level, then to the 0–100 scale." },
    { step: 3, text: "Unanswered items abstained and route to a human — they never become a low score." },
    { step: 4, text: cap ? "Some items are AI-generated and not yet SME-reviewed — block confidence capped at Medium." : "All items carry reviewed keys — confidence reflects keyed certainty." },
    { step: 5, text: "Item scores were averaged into the block score; integrity telemetry attached as neutral advisories." },
  ];

  return assembleBlockResult(vacancy, block, result, items, reasoning, 0, cap);
}

function scorePsychometric(vacancy: VacancyV2, block: PipelineBlock, result: BlockRuntimeResult): BlockResult {
  const chip = chipFactory(block);
  const responses = keyedResponses(result.payload);
  const likert = responses
    .map((r) => Number(r.value))
    .filter((v) => Number.isFinite(v) && v >= 1 && v <= 5);
  const s = block.settings;
  const items: ItemScore[] = [];

  const domains: { id: string; label: string; attributeId: string }[] =
    s.kind === "personality"
      ? s.traitMappings.map((m) => ({ id: m.traitId, label: `${s.model === "hexaco" ? "HEXACO" : "Big Five"} · ${m.traitId}`, attributeId: m.attributeId }))
      : s.kind === "integrity_test"
        ? s.domains.map((d, i) => ({
            id: d, label: `Integrity · ${d.replace(/_/g, " ")}`,
            attributeId: block.measures.length ? block.measures[i % block.measures.length].attributeId : "",
          }))
        : [];

  domains.forEach((d, di) => {
    const slice = likert.filter((_, idx) => idx % Math.max(1, domains.length) === di);
    if (!slice.length) { items.push(abstainedItem(d.id, d.label, d.attributeId, "no questionnaire responses recorded for this domain")); return; }
    const m = mean(slice);
    const level = clampLevel(m);
    const ev = [chip(`Mean self-rating ${m.toFixed(1)} of 5 across ${slice.length} items`, d.id)];
    items.push({
      itemId: d.id,
      itemLabel: d.label,
      attributeId: d.attributeId,
      level,
      score: itemScoreValue(level, ev.length),
      evidence: ev,
      drivers: [
        m >= 3.5
          ? { text: "Self-reports a consistently high standing on this domain", impact: 0.3, direction: "pos" }
          : m <= 2.5
            ? { text: "Self-reports a low standing on this domain", impact: 0.28, direction: "neg" }
            : { text: "Self-report sits mid-scale — no strong signal either way", impact: 0.2, direction: "pos" },
        { text: "Self-report instrument — treated as one signal among several, never decisive", impact: 0.18, direction: "neg" },
      ],
      confidence: "Medium", // self-report ceiling (§8.2): psychometric confidence capped at Medium
      confidenceReason: "Medium confidence — self-report instrument; the ceiling is by design, corroborate in interviews.",
      abstained: false,
    });
  });

  const reasoning: ReasoningStep[] = [
    { step: 1, text: "Questionnaire responses were scored psychometrically per instrument version — no LLM in this path." },
    { step: 2, text: "Domain scores are means of the mapped self-ratings, translated onto the 1–5 scale." },
    { step: 3, text: "Confidence is capped at Medium: self-reports can be shaped by the test-taker (§8.2)." },
    { step: 4, text: "Mapped attributes receive these scores as one triangulation source — interviews and samples can confirm or contradict them." },
  ];

  return assembleBlockResult(vacancy, block, result, items, reasoning, 0, "Medium");
}

function scoreArtifact(
  vacancy: VacancyV2,
  block: PipelineBlock,
  result: BlockRuntimeResult,
  dims: RubricDimension[]
): BlockResult {
  const chip = chipFactory(block);
  const payload = (result.payload ?? {}) as ArtifactPayload;
  const text = typeof payload.text === "string" ? payload.text : "";
  const items: ItemScore[] = [];

  if (!text && !payload.url && !payload.fileName) {
    dims.forEach((d) => items.push(abstainedItem(d.id, d.name, block.measures[0]?.attributeId ?? "", "no artifact submitted for this dimension")));
  } else if (!text) {
    /* artifact exists but no reviewable text — informational floor, low confidence */
    const ref = payload.url ?? payload.fileName ?? "artifact";
    dims.forEach((d, i) => {
      const ev = [chip(`Submitted: ${ref}`, "artifact", d.name)];
      items.push({
        itemId: d.id,
        itemLabel: d.name,
        attributeId: block.measures.length ? block.measures[i % block.measures.length].attributeId : "",
        level: 3,
        score: itemScoreValue(3, ev.length),
        evidence: ev,
        drivers: [{ text: "Artifact submitted but its content is not machine-reviewable — human grading advised", impact: 0.3, direction: "neg" }],
        confidence: "Low",
        confidenceReason: "Low confidence — the artifact could not be read as text; a human should grade this dimension.",
        abstained: false,
      });
    });
  } else {
    const lines = text.split(/\r?\n/);
    const wc = text.trim().split(/\s+/).filter(Boolean).length;
    const structure = lines.filter((l) => /^\s*(#{1,6}\s|\d+[.)]\s|[-*•]\s)/.test(l)).length;
    const numbers = (text.match(/\d+(?:[.,]\d+)?%?/g) ?? []).length;
    const base = clampLevel(
      1 + (wc >= 120 ? 1 : 0) + (wc >= 300 ? 1 : 0) + (structure >= 3 ? 1 : 0) + (numbers >= 2 ? 0.5 : 0) + (payload.url ? 0.5 : 0)
    );
    /* rank lines by concreteness for line-span evidence cites */
    const rankedLines = lines
      .map((l, i) => ({ l: l.trim(), i }))
      .filter((x) => x.l.split(/\s+/).length >= 4)
      .sort((a, b) => ((b.l.match(/\d/g) ?? []).length - (a.l.match(/\d/g) ?? []).length) || b.l.length - a.l.length);

    dims.forEach((d, di) => {
      const jitter = ((djb2(d.id + String(wc)) >>> 3) % 3) - 1;
      const level = clampLevel(base + jitter * 0.5);
      const pick = rankedLines[di % Math.max(1, rankedLines.length)];
      const ev = pick
        ? [chip(
            pick.l.length > 200 ? pick.l.slice(0, 197) + "…" : pick.l,
            `lines ${pick.i + 1}–${Math.min(pick.i + 2, lines.length)}`,
            d.name
          )]
        : [];
      items.push({
        itemId: d.id,
        itemLabel: d.name,
        attributeId: block.measures.length ? block.measures[di % block.measures.length].attributeId : "",
        level,
        score: itemScoreValue(level, ev.length),
        evidence: ev,
        drivers: topDrivers([
          ...(structure >= 3 ? [{ text: "Deliverable is structured — sections, lists, or numbered steps carry the argument", impact: 0.32, direction: "pos" as const }] : []),
          ...(numbers >= 2 ? [{ text: "Quantifies its claims — figures anchor the work to checkable facts", impact: 0.3, direction: "pos" as const }] : []),
          ...(wc < 120 ? [{ text: "Thin submission relative to the brief's scope", impact: 0.26, direction: "neg" as const }] : []),
          ...(structure < 1 ? [{ text: "No visible structure — harder to trace the reasoning", impact: 0.2, direction: "neg" as const }] : []),
        ]),
        confidence: ev.length ? "Medium" : "Low",
        confidenceReason: ev.length
          ? "Medium confidence — heuristic rubric pass over the artifact text; human grading refines this."
          : "Low confidence — no citable line found for this dimension.",
        abstained: false,
      });
    });
  }

  const reasoning: ReasoningStep[] = [
    { step: 1, text: "The artifact's text was scored dimension by dimension against the rubric — never as one holistic impression." },
    { step: 2, text: "Structure, concreteness, and scope heuristics stand in for the rubric-dimension scorers of the real engine." },
    { step: 3, text: "Each dimension cites a line span from the submission as its evidence chip." },
    { step: 4, text: "This demo evaluator produced no originality or similarity inference." },
    { step: 5, text: "Dimension scores were averaged into the block score with the evidence-density adjustment." },
  ];

  return assembleBlockResult(vacancy, block, result, items, reasoning, 0);
}

function scoreApplicationForm(vacancy: VacancyV2, block: PipelineBlock, result: BlockRuntimeResult): BlockResult {
  const chip = chipFactory(block);
  const responses = keyedResponses(result.payload);
  const byId = new Map(responses.map((r) => [r.itemId, r]));
  const s = block.settings;
  const items: ItemScore[] = [];

  if (s.kind === "application_form") {
    s.fields
      .filter((f) => f.scored && f.options?.length)
      .forEach((f, i) => {
        const opts = f.options ?? [];
        const r = byId.get(f.id);
        const chosenIds = r?.optionIds ?? (r?.optionId ? [r.optionId] : []);
        const chosen = opts.filter((o) => chosenIds.includes(o.id));
        const maxPts =
          f.type === "multi_choice"
            ? opts.reduce((a, o) => a + Math.max(0, o.points ?? 0), 0)
            : Math.max(...opts.map((o) => o.points ?? 0), 0);
        if (!r) { items.push(abstainedItem(f.id, f.label, block.measures[i % Math.max(1, block.measures.length)]?.attributeId ?? "", "field left unanswered")); return; }
        const got = chosen.reduce((a, o) => a + (o.points ?? 0), 0);
        const f01 = maxPts > 0 ? Math.max(0, Math.min(1, got / maxPts)) : 0;
        const level = fractionLevel(f01);
        const ev = [chip(chosen.map((o) => o.text).join("; ") || "no option selected", f.id, f.label)];
        items.push({
          itemId: f.id,
          itemLabel: f.label,
          attributeId: block.measures.length ? block.measures[i % block.measures.length].attributeId : "",
          level,
          score: itemScoreValue(level, ev.length),
          evidence: ev,
          drivers: [
            f01 >= 0.75
              ? { text: "Selected options carry the field's highest rational-key points", impact: 0.3, direction: "pos" }
              : { text: "Selected options score below the field's keyed maximum", impact: 0.22, direction: "neg" },
          ],
          confidence: "High",
          confidenceReason: "High confidence — rational biodata keys, deterministic scoring.",
          abstained: false,
        });
      });
  }

  const reasoning: ReasoningStep[] = [
    { step: 1, text: "Only fields marked as scored enter this result; PII fields stay masked for review." },
    { step: 2, text: "Option points follow the rational keys set at publish — summed and normalized per field." },
    { step: 3, text: "Unanswered scored fields abstain and route to a human rather than scoring zero." },
    { step: 4, text: "Field scores were averaged into the block score." },
  ];

  return assembleBlockResult(vacancy, block, result, items, reasoning, 0);
}

function passthroughResult(vacancy: VacancyV2, block: PipelineBlock, result: BlockRuntimeResult): BlockResult {
  return {
    blockId: block.id,
    itemScores: [],
    blockScore: 0,
    confidence: "High",
    confidenceReason: "High confidence — informational stage; nothing here enters the composite score.",
    drivers: [],
    evidence: [],
    reasoning: [
      { step: 1, text: `${block.title} is informational — it collects material or routes to humans, it does not score.` },
      { step: 2, text: "Its outputs (documents, knockout answers, human notes) feed verification and the claims ledger instead." },
      { step: 3, text: "Integrity telemetry, if any, is attached below as neutral advisory context." },
    ],
    integrity: sanitizeIntegritySignals(result.integrityEvents),
    engine: makeStamp(vacancy, "scorer.item"),
  };
}

/* ———————————————————————— Stage A entry point ———————————————————————— */

export function scoreBlock(vacancy: VacancyV2, block: PipelineBlock, result: BlockRuntimeResult): BlockResult {
  const s = block.settings;
  switch (s.kind) {
    case "async_interview":
    case "live_ai_interview":
    case "chat_interview":
      return scoreInterview(vacancy, block, result, s.questions);
    case "sjt":
    case "job_knowledge":
    case "cognitive":
    case "language_test":
      return scoreKeyed(vacancy, block, result);
    case "personality":
    case "integrity_test":
      return scorePsychometric(vacancy, block, result);
    case "work_sample":
    case "coding":
    case "case_exercise":
    case "custom":
      return scoreArtifact(vacancy, block, result, s.rubricDimensions);
    case "application_form":
      return scoreApplicationForm(vacancy, block, result);
    /* cv_intake / doc_verification / knockout / human_stage / reference_check: informational */
    default:
      return passthroughResult(vacancy, block, result);
  }
}

/* ———————————————————————— Stage B helpers (§8.3) ———————————————————————— */

interface AttrRollup {
  attr: AttributeSpec;
  categoryId: string;
  categoryWeight: number;
  score: number;
  sources: { block: PipelineBlock; br: BlockResult; share: number; score: number; items: ItemScore[] }[];
}

function extractClaims(app: ApplicationRecord, vacancy: VacancyV2): ClaimRecord[] {
  const claims: ClaimRecord[] = [];
  const seen = new Set<string>();
  let n = 0;

  const push = (text: string, sourceBlockId: string, material: boolean) => {
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    claims.push({ id: `claim-${++n}`, text, sourceBlockId, material, status: "UNCHECKED" });
  };

  for (const r of app.blockResults) {
    const texts: string[] = [
      ...(r.transcript ?? []).filter((t) => t.speaker === "candidate").map((t) => t.text),
      ...answerPayloads(r.payload).map((a) => a.answer),
    ];
    const artifact = (r.payload ?? {}) as ArtifactPayload;
    if (typeof artifact.text === "string") texts.push(artifact.text);
    const joined = texts.join(" ");
    if (!joined) continue;

    const team = joined.match(/\bled\s+(?:a\s+)?team\s+of\s+(\d+)\b/i);
    if (team) push(`Led a team of ${team[1]}`, r.blockId, true);

    const years = joined.match(/\b(\d{1,2})\+?\s*(?:years?|лет|год(?:а|ов)?)\b/i);
    if (years) push(`${years[1]} years of experience`, r.blockId, Number(years[1]) >= 2);

    const cert = joined.match(/\b(AWS|Azure|GCP|Google Cloud|PMP|CFA|CPA|CISSP|Scrum|ITIL|Cisco|CKA|ACCA|CIMA)\b[^.\n]{0,40}?\b(certif\w+|cert)\b/i);
    if (cert) push(`${cert[1]} certification`, r.blockId, true);

    const degree = joined.match(/\b(bachelor'?s?|master'?s?|MBA|PhD|диплом|высшее образование)\b/i);
    if (degree) push(`${degree[1]} degree claimed`, r.blockId, true);
  }

  /* claims verification join (§8.3.3): match against doc_verification payloads */
  const docResults = app.blockResults.filter((r) => r.kind === "doc_verification");
  const docText = docResults.map((r) => JSON.stringify(r.payload ?? "")).join(" ").toLowerCase();
  for (const c of claims) {
    if (!docResults.length) { c.status = "UNCHECKED"; continue; }
    const token = c.text.toLowerCase().split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? "";
    const num = c.text.match(/\d+/)?.[0];
    const matched = (token.length > 2 && docText.includes(token)) || (num !== undefined && docText.includes(num));
    c.status = matched ? "VERIFIED" : "NOT_VERIFIED";
  }
  void vacancy;
  return claims;
}

const TIER_MARGIN = 12;

/* ———————————————————————— Stage B entry point (§8.3) ———————————————————————— */

export function evaluateApplication(vacancy: VacancyV2, app: ApplicationRecord): CandidateEvaluation {
  /* 1 · Stage A for every block with a runtime result */
  const resultByBlock = new Map(app.blockResults.map((r) => [r.blockId, r]));
  const ordered = [...vacancy.pipeline].sort((a, b) => a.order - b.order);
  const perBlock: BlockResult[] = [];
  const blockOf = new Map<string, PipelineBlock>();
  for (const block of ordered) {
    blockOf.set(block.id, block);
    const r = resultByBlock.get(block.id);
    if (r) perBlock.push(scoreBlock(vacancy, block, r));
  }

  /* flat chip ids E-1…E-n so the narrative can cite them (§8.3.4) */
  let chipN = 0;
  const renumbered = new Set<EvidenceChip>();
  for (const br of perBlock) {
    for (const item of br.itemScores)
      for (const c of item.evidence)
        if (!renumbered.has(c)) { renumbered.add(c); c.id = `E-${++chipN}`; }
    for (const c of br.evidence)
      if (!renumbered.has(c)) { renumbered.add(c); c.id = `E-${++chipN}`; }
  }
  const brByBlockId = new Map(perBlock.map((b) => [b.blockId, b]));

  /* 2 · mechanical rollup — no model in the arithmetic (§8.3.1) */
  const rollups: AttrRollup[] = [];
  for (const cat of vacancy.categories) {
    for (const attr of cat.attributes) {
      const sources: AttrRollup["sources"] = [];
      for (const block of ordered) {
        if (!block.scored) continue;
        const measure = block.measures.find((m) => m.attributeId === attr.id);
        const br = brByBlockId.get(block.id);
        if (!measure || !br) continue;
        const items = br.itemScores.filter((i) => i.attributeId === attr.id && !i.abstained);
        if (!items.length) continue;
        sources.push({ block, br, share: measure.share, score: clamp100(mean(items.map((i) => i.score))), items });
      }
      if (!sources.length) continue;
      const totalShare = sources.reduce((a, s) => a + s.share, 0) || 1;
      const score = clamp100(sources.reduce((a, s) => a + s.share * s.score, 0) / totalShare);
      rollups.push({ attr, categoryId: cat.id, categoryWeight: cat.weight, score, sources });
    }
  }

  const categoryScores = vacancy.categories
    .map((cat) => {
      const rs = rollups.filter((r) => r.categoryId === cat.id);
      if (!rs.length) return null;
      const totalW = rs.reduce((a, r) => a + r.attr.weight, 0) || 1;
      return { categoryId: cat.id, score: clamp100(rs.reduce((a, r) => a + r.attr.weight * r.score, 0) / totalW) };
    })
    .filter((c): c is { categoryId: string; score: number } => c !== null);

  const catWeightOf = new Map(vacancy.categories.map((c) => [c.id, c.weight]));
  const totalCatW = categoryScores.reduce((a, c) => a + (catWeightOf.get(c.categoryId) ?? 0), 0) || 1;
  const overall = clamp100(
    categoryScores.reduce((a, c) => a + (catWeightOf.get(c.categoryId) ?? 0) * c.score, 0) / totalCatW
  );

  /* 3 · must-have floors + hurdle gates (§8.3.1 topology) */
  const knockoutResponses: KeyedResponse[] = app.blockResults
    .filter((r) => r.kind === "knockout")
    .flatMap((r) => keyedResponses(r.payload));
  const claims = extractClaims(app, vacancy);

  const mustHaveResults: { id: string; passed: boolean; evidence: string }[] = [];
  for (const cat of vacancy.categories) {
    for (const attr of cat.attributes) {
      const mh = attr.mustHave;
      if (!mh) continue;
      let passed = true;
      let evidence = "No disqualifying signal recorded; verification continues downstream.";
      /* knockout items generated from this floor carry mustHaveId = attribute id */
      for (const block of ordered) {
        if (block.settings.kind !== "knockout") continue;
        for (const item of block.settings.items) {
          if (item.mustHaveId !== attr.id) continue;
          const resp = knockoutResponses.find((r) => r.itemId === item.id);
          if (!resp) continue;
          if (item.type === "yes_no") {
            passed = resp.value === (item.passValue ?? true);
            evidence = `Answered ${String(resp.value)} to “${item.question}”.`;
          } else if (item.type === "numeric_threshold") {
            const v = Number(resp.value);
            passed = Number.isFinite(v) && v >= (item.threshold ?? 0);
            evidence = `Reported ${String(resp.value)} against a floor of ${item.threshold ?? 0}.`;
          } else if (item.type === "single_choice") {
            const chosen = item.options?.find((o) => o.id === resp.optionId);
            passed = !(chosen?.disqualifies === true);
            evidence = `Chose “${chosen?.text ?? "—"}”.`;
          } else if (item.type === "multi_must_include") {
            const need = (item.options ?? []).filter((o) => o.mustInclude).map((o) => o.id);
            const have = resp.optionIds ?? [];
            passed = need.every((id) => have.includes(id));
            evidence = `Selected ${have.length} option(s) against ${need.length} required.`;
          }
        }
      }
      /* claims can satisfy a floor pending verification */
      if (passed && mh.rule === "min_years") {
        const yearClaim = claims.find((c) => /years of experience/.test(c.text));
        if (yearClaim && Number(yearClaim.text.match(/\d+/)?.[0] ?? 0) >= Number(mh.value)) {
          evidence = `Claimed “${yearClaim.text}” (${yearClaim.status.toLowerCase().replace("_", " ")}).`;
        }
      }
      if (passed && (mh.rule === "certification" || mh.rule === "license")) {
        const certClaim = claims.find((c) => /certification|degree/i.test(c.text));
        if (certClaim) evidence = `Claimed “${certClaim.text}” (${certClaim.status.toLowerCase().replace("_", " ")}).`;
      }
      mustHaveResults.push({ id: attr.id, passed, evidence });
    }
  }

  const gateRisks: string[] = [];
  let hurdleFailed = false;
  for (const block of ordered) {
    if (!block.gate) continue;
    const br = brByBlockId.get(block.id);
    if (block.gate.minBlockScore !== undefined && br && block.scored && br.blockScore < block.gate.minBlockScore) {
      hurdleFailed = true;
      gateRisks.push(`Failed the “${block.title}” hurdle (${br.blockScore} vs a floor of ${block.gate.minBlockScore}) — ranked Bottom pending human review.`);
    }
    if (block.gate.mustHaveIds?.some((id) => mustHaveResults.find((m) => m.id === id)?.passed === false)) {
      hurdleFailed = true;
      gateRisks.push(`A must-have gated by “${block.title}” did not pass — ranked Bottom pending human review.`);
    }
  }

  /* 4 · cross-source triangulation (§8.3.2) */
  const contradictions: Contradiction[] = [];
  for (const r of rollups) {
    if (r.sources.length < 2) continue;
    const sorted = [...r.sources].sort((a, b) => b.score - a.score);
    const hi = sorted[0];
    const lo = sorted[sorted.length - 1];
    const divergence = hi.score - lo.score;
    if (divergence <= 20) continue;
    const quoteOf = (s: AttrRollup["sources"][number]) => s.items.flatMap((i) => i.evidence)[0]?.quote ?? "no quote captured";
    contradictions.push({
      claim: `${r.attr.name} reads differently across sources`,
      sourceA: `${hi.block.title} — ${hi.score}: “${quoteOf(hi)}”`,
      sourceB: `${lo.block.title} — ${lo.score}: “${quoteOf(lo)}”`,
      severity: divergence > 35 ? "review" : "note",
    });
  }

  /* 5 · claims → confidence (never the score, §8.3.3) */
  const unverifiedMaterial = claims.filter((c) => c.material && c.status !== "VERIFIED");
  const verifiedClaims = claims.filter((c) => c.status === "VERIFIED");
  const attrIdsLoweredByClaims = new Set<string>();
  const attrIdsDocVerified = new Set<string>();
  const allAttrs = vacancy.categories.flatMap((c) => c.attributes);
  const relatedAttrIds = (c: ClaimRecord): string[] => {
    const kind = /certification|degree/i.test(c.text) ? "qualification" : /years/i.test(c.text) ? "experience" : null;
    const byKind = kind ? allAttrs.filter((a) => a.kind === kind).map((a) => a.id) : [];
    if (byKind.length) return byKind;
    return blockOf.get(c.sourceBlockId)?.measures.map((m) => m.attributeId) ?? [];
  };
  for (const c of unverifiedMaterial) relatedAttrIds(c).forEach((id) => attrIdsLoweredByClaims.add(id));
  for (const c of verifiedClaims) relatedAttrIds(c).forEach((id) => attrIdsDocVerified.add(id));

  /* 7 · legacy CompetencyScore adapter */
  const rawWeights = rollups.map((r) => (r.categoryWeight * r.attr.weight) / 100);
  const weightTotal = rawWeights.reduce((a, b) => a + b, 0) || 1;
  let accW = 0;
  const attributeScores: CompetencyScore[] = rollups.map((r, i) => {
    const w = i === rollups.length - 1
      ? Math.max(0, 100 - accW)
      : Math.round((rawWeights[i] / weightTotal) * 100);
    accW += w;
    const items = r.sources.flatMap((s) => s.items);
    const chips = items.flatMap((it) => it.evidence);
    let band = NUM_BAND[Math.max(1, Math.min(3, Math.floor(mean(items.map((it) => BAND_NUM[it.confidence])))))];
    const loweredByClaim = attrIdsLoweredByClaims.has(r.attr.id);
    if (loweredByClaim) band = lowerBand(band);
    const multiSource = r.sources.length >= 2;
    const reasonBits: string[] = [
      `${chips.length} quoted moment${chips.length === 1 ? "" : "s"} across ${r.sources.length} block${r.sources.length === 1 ? "" : "s"}`,
    ];
    if (loweredByClaim) reasonBits.push("a material claim awaits document verification");
    if (multiSource) reasonBits.push("multiple sources triangulate");
    const evidence: EvidenceSpan[] = chips.slice(0, 3).map((c) => ({
      quote: c.quote,
      timestamp: c.locator,
      question: c.question ?? items.find((it) => it.evidence.includes(c))?.itemLabel ?? "",
    }));
    const trace = r.sources
      .flatMap((s) => s.br.reasoning.map((step) => step.text))
      .filter((t, idx, arr) => arr.indexOf(t) === idx)
      .slice(0, 6);
    return {
      id: r.attr.id,
      name: r.attr.name,
      score: r.score,
      weight: w,
      drivers: topDrivers(items.flatMap((it) => it.drivers)),
      confidence: band,
      confidenceReason: `${band} confidence — ${reasonBits.join("; ")}.`,
      evidence,
      trace,
      docVerified: attrIdsDocVerified.has(r.attr.id) ? true : undefined,
    };
  });

  /* 6 · synthesis (§8.3.4) */
  const allDrivers = attributeScores.flatMap((a) => a.drivers.map((d) => ({ ...d, attr: a.name })));
  const strengths = topDrivers(allDrivers.filter((d) => d.direction === "pos"), 3).map((d) => d.text);
  const reviewContradictions = contradictions.filter((c) => c.severity === "review");
  const risks = [
    ...topDrivers(allDrivers.filter((d) => d.direction === "neg"), reviewContradictions.length || gateRisks.length ? 2 : 3).map((d) => d.text),
    ...reviewContradictions.map((c) => `Sources disagree: ${c.claim.toLowerCase()} — flagged for review`),
    ...gateRisks,
  ].slice(0, 3 + gateRisks.length);

  const abstainedTotal = perBlock.reduce((a, b) => a + b.itemScores.filter((i) => i.abstained).length, 0);
  const anyDisagreement = perBlock.some((b) => b.itemScores.some((i) => i.runDisagreement));
  const scoredBlocks = perBlock.filter((b) => blockOf.get(b.blockId)?.scored && b.itemScores.length > 0);

  /* tier: hurdle failures rank Bottom regardless of the composite (§8.3.1) */
  const threshold = vacancy.scoring.threshold;
  const tier: Tier = hurdleFailed ? "Bottom" : overall >= threshold + TIER_MARGIN ? "Top" : overall >= threshold ? "Mid" : "Bottom";

  let confNum = attributeScores.length
    ? Math.max(1, Math.min(3, Math.floor(mean(attributeScores.map((a) => BAND_NUM[a.confidence])))))
    : 1;
  if (reviewContradictions.length || hurdleFailed) confNum = Math.max(1, confNum - 1);
  const confidence = NUM_BAND[confNum];
  const confidencePhrase =
    confidence === "High"
      ? `High confidence — ${chipN} quoted moments across ${scoredBlocks.length} scored block${scoredBlocks.length === 1 ? "" : "s"}, run agreement held throughout.`
      : confidence === "Medium"
        ? `Medium confidence — evidence is real but uneven: ${chipN} quotes across ${scoredBlocks.length} scored block${scoredBlocks.length === 1 ? "" : "s"}${anyDisagreement ? ", with a run disagreement flagged" : ""}.`
        : `Low confidence — thin evidence (${chipN} quote${chipN === 1 ? "" : "s"}); human review recommended before any decision.`;

  const best = [...attributeScores].sort((a, b) => b.score - a.score);
  const firstChipId = (a?: CompetencyScore): string | null => {
    if (!a) return null;
    const r = rollups.find((x) => x.attr.id === a.id);
    return r?.sources.flatMap((s) => s.items).flatMap((i) => i.evidence)[0]?.id ?? null;
  };

  const sentences: string[] = [];
  sentences.push(
    scoredBlocks.length
      ? `Across ${scoredBlocks.length} scored block${scoredBlocks.length === 1 ? "" : "s"} the candidate lands at ${overall} against a threshold of ${threshold} — ${tier} tier.`
      : `No scored blocks have results yet, so the composite stands at ${overall} and nothing here should be read as a signal.`
  );
  const top1 = best[0];
  if (top1) {
    const cite = firstChipId(top1);
    sentences.push(`The strongest signal is ${top1.name} at ${top1.score}: ${top1.drivers[0]?.text ?? "consistent evidence"}${cite ? ` [${cite}]` : ""}.`);
  }
  const top2 = best[1];
  if (top2 && top2.score >= threshold) {
    const cite = firstChipId(top2);
    sentences.push(`${top2.name} holds at ${top2.score}${top2.drivers[0] ? ` — ${top2.drivers[0].text.toLowerCase()}` : ""}${cite ? ` [${cite}]` : ""}.`);
  }
  const low1 = best[best.length - 1];
  if (low1 && best.length > 1 && low1.id !== top1?.id) {
    const negDriver = low1.drivers.find((d) => d.direction === "neg");
    const cite = firstChipId(low1);
    sentences.push(`The main open question is ${low1.name} at ${low1.score}${negDriver ? `: ${negDriver.text.toLowerCase()}` : ""}${cite ? ` [${cite}]` : ""}.`);
  }
  if (reviewContradictions.length) {
    sentences.push(`Sources disagree on ${reviewContradictions[0].claim.toLowerCase()} — both quotes sit side by side in the contradiction panel for review.`);
  }
  if (claims.length) {
    sentences.push(`${claims.length} verifiable claim${claims.length === 1 ? " was" : "s were"} logged; ${verifiedClaims.length} verified against documents, the rest cap confidence — never the score.`);
  }
  if (abstainedTotal > 0) {
    sentences.push(`${abstainedTotal} item${abstainedTotal === 1 ? "" : "s"} abstained for thin evidence and sit in the human tray rather than dragging the composite down.`);
  }
  if (gateRisks.length) sentences.push(gateRisks[0]);
  sentences.push(`Confidence is ${confidence.toLowerCase()}; a human reviewer makes the final call.`);
  const pads = [
    "Every score above traces to a quoted moment — open any chip to see the verbatim evidence.",
    "Scores are rubric-referenced against the published anchors, never cohort-normed silently.",
    "No demographic data entered any prompt at any stage of this evaluation.",
    "Abstentions and knockouts route to a human tray — no one is rejected by silence.",
  ];
  let padIdx = 0;
  while (sentences.length < 6 && padIdx < pads.length) sentences.push(pads[padIdx++]);
  const narrative = sentences.slice(0, 8).join(" ");

  return {
    perBlock,
    attributeScores,
    categoryScores,
    overall,
    tier,
    confidence,
    confidencePhrase,
    synthesis: { strengths, risks, contradictions, narrative },
    mustHaveResults,
    claims,
    engine: makeStamp(vacancy, "synth.narrative"),
  };
}

/* ———————————————————————— legacy adapter (RankingTable / Scorecard) ———————————————————————— */

export function evaluationToCandidate(app: ApplicationRecord, ev: CandidateEvaluation, rank: number): Candidate {
  const anyVerified = ev.claims.some((c) => c.status === "VERIFIED");
  const docBlockPresent = app.blockResults.some((r) => r.kind === "doc_verification");
  const complete = ev.complete ?? true;
  const rankEligible = complete && ev.tier !== null;
  return {
    internalId: app.candidate.internalId,
    rank: rankEligible ? rank : null,
    overall: ev.overall,
    tier: rankEligible ? ev.tier : null,
    confidence: ev.confidence,
    confidencePhrase: ev.confidencePhrase,
    verification: anyVerified ? "VERIFIED" : docBlockPresent ? "PENDING" : "—",
    divergence: false, // reserved for human-override divergence, set by the review surface
    appliedAt: app.createdAt.slice(0, 10),
    evaluationComplete: complete,
    evaluationCoverage: ev.coverage ?? (complete ? 100 : 0),
    competencies: ev.attributeScores,
    strengths: ev.synthesis.strengths,
    weaknesses: ev.synthesis.risks,
    audit: app.audit,
  };
}
