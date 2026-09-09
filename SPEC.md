# WhiteBox AI — Product Specification

**Vacancy Studio · Interview Pipeline · Evaluation Engine · Human-in-the-Loop Dispatch**

Status: design specification (v1, July 2026). Evidence base: [RESEARCH.md](RESEARCH.md) — citations in this document (e.g., *R-I.2*) point to its sections. Current implementation state is mapped in [§12](#12-implementation-mapping).

---

## Contents

1. [Product principles](#1-product-principles)
2. [Glossary](#2-glossary)
3. [Object model](#3-object-model)
4. [Employer side — the Vacancy Studio](#4-employer-side--the-vacancy-studio)
5. [Preset & template system](#5-preset--template-system)
6. [Publishing & distribution](#6-publishing--distribution)
7. [Candidate side — the application journey](#7-candidate-side--the-application-journey)
8. [The evaluation engine](#8-the-evaluation-engine)
9. [HR side — review, decision & dispatch](#9-hr-side--review-decision--dispatch)
10. [Analytics & compliance console](#10-analytics--compliance-console)
11. [Non-goals & red lines](#11-non-goals--red-lines)
12. [Implementation mapping](#12-implementation-mapping)

---

## 1. Product principles

Ten laws, derived from the research (R-V). Every screen and every API obeys them.

1. **One transparent chain.** Role → weighted criteria → blocks mapped to criteria → per-question rubrics → per-block scores with evidence → composite with visible math → human decision with reasons → append-only audit log. The chain is never broken and never hidden; any score can be walked back to the exact words that produced it.
2. **Blocks are named HR methods, not "tests."** Every pipeline block declares its methodological basis, its meta-analytic validity, and its adverse-impact profile (R-I.1) in the builder UI. Recruiters see what science they are buying.
3. **Structure by construction** (R-I.2). Identical questions per vacancy version, BARS-anchored rubrics, per-answer independent scoring, mechanical aggregation. The UI has no field for a "gut overall score."
4. **Transcript-only AI scoring.** Language content is scored; face, voice tone, appearance, accent, and emotion are never scored (R-I.8, R-IV.1 — EU emotion-inference ban). Recordings exist for human review and identity assurance only.
5. **AI drafts, humans decide.** Every AI artifact — question set, rubric, score, shortlist, email — is a draft until a named human approves it. Outbound consequences (rejections, invitations) require explicit human confirmation (R-IV.5, SCHUFA).
6. **Integrity signals advise, never verdict.** No candidate is auto-rejected by a proctoring flag or AI-text detector (R-IV.4). Signals route to human adjudication with evidence.
7. **Blind by default.** PII is masked during evaluation and review; identity is revealed only at the decision gate, and the reveal is logged (existing product behavior, retained).
8. **Everything customizable, nothing unexplained.** Every generated or default setting carries a "why this" affordance (existing `Describe → why` pattern, extended to the whole Studio).
9. **The candidate is a user, not a specimen.** Job-relatedness explained per block, opportunity to perform, tech checks, resume-in-place, disposition SLA timers, feedback offered (Gilliland's justice rules, R-I.7).
10. **Compliance is architecture.** Notices, consent, retention, bias monitoring, model/prompt pinning, and meaningful-review instrumentation are product surfaces, not policy documents (R-IV.2).

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Vacancy** | A configured competition for one concrete position: profile + criteria + pipeline + governance + distribution. Versioned; immutable once live (changes create a new `configVersion`). |
| **Competition Code** | Human-typeable public code (`WBX-3F8N`) that admits candidates to a vacancy from any channel. Channel variants map to the same vacancy with a source tag. |
| **Criteria Architecture** | The weighted hierarchy Category → Attribute (KSAO-typed) that defines what "good" means for this vacancy. Weights sum to 100 at each level. |
| **Attribute** | One measurable criterion (skill / trait / knowledge / qualification / experience). Carries weight, type, focus flag, must-have flag, and a proficiency scale. |
| **Pipeline** | The ordered sequence of Blocks a candidate traverses. Supports hurdle gates between blocks. |
| **Block** | One interactive stage implementing a named selection method (structured async interview, SJT, work sample…). Has its own sub-settings, rubric bindings, and integrity tier. |
| **Rubric** | The scoring contract for a scored item: BARS anchors per level, tied to exactly one attribute. |
| **Evidence Chip** | A verbatim fragment (with timestamp/locator) that supports a score driver. |
| **Driver** | A ranked reason code behind a score, principal reason first (FICO reason-code structure). |
| **Composite** | The weighted rollup: item → attribute → category → overall (0–100), under a compensatory / hurdle / hybrid topology. |
| **Leaderboard** | The ranked candidate table for a vacancy with tiers, bands, confidence, and integrity columns. |
| **HITL Gate** | A decision point where a named human must Accept / Adjust / Recompute / Reject with a reason before anything leaves the system. |
| **Preset** | A reusable, versioned template of any scope: full vacancy, criteria architecture, single block, question set, rubric set, email pack, or cover design. |
| **Evidence Pack** | Exportable per-candidate or per-vacancy dossier: scores, drivers, evidence, prompts/model versions, human decisions, notices — regenerated from the audit log. |

---

## 3. Object model

Extends [lib/types.ts](lib/types.ts). Abbreviated to load-bearing shapes; field-level settings appear in §4.

```ts
// ——— Criteria ———
type AttributeKind = "skill" | "trait" | "knowledge" | "qualification" | "experience" | "language";
interface AttributeSpec {
  id: string; name: string; kind: AttributeKind;
  weight: number;                    // share within category, sums to 100
  focus?: boolean;                   // Greenhouse-style focus attribute
  mustHave?: MustHave;               // knockout floor, separate from scoring
  scale: ProficiencyScale;           // 1..5 BARS anchors, editable text
  taxonomyRef?: { system: "ONET" | "ESCO" | "SFIA" | "UCF" | "custom"; code: string };
}
interface MustHave { rule: "min_years" | "certification" | "license" | "language_level" | "location" | "work_auth" | "min_scale_level" | "custom_bool"; value: string | number; humanRecoverable: true }
interface CategorySpec { id: string; name: string; weight: number; attributes: AttributeSpec[] }

// ——— Pipeline ———
type BlockKind =
  | "application_form" | "knockout" | "cv_intake"
  | "async_interview" | "live_ai_interview" | "chat_interview"
  | "sjt" | "cognitive" | "personality" | "integrity_test" | "job_knowledge" | "language_test"
  | "work_sample" | "coding" | "case_exercise"
  | "doc_verification" | "reference_check" | "human_stage" | "custom";

interface PipelineBlock {
  id: string; kind: BlockKind; order: number;
  title: string;                      // internal
  candidateIntro: string;             // shown to candidate incl. job-relatedness sentence
  required: boolean;                  // optional blocks never gate
  estimatedMinutes: number;           // auto-computed, shown to candidate & in time budget
  gate?: { minBlockScore?: number; mustHaveIds?: string[] };   // hurdle before next block
  measures: { attributeId: string; share: number }[];          // rollup mapping, shares sum 100 per block
  settings: BlockSettings;            // discriminated union per kind (§4.4)
  integrityTier: 0 | 1 | 2 | 3;       // §4.4.0
  deadlineOffsetHours?: number;       // per-block deadline within vacancy window
  scored: boolean;                    // informational blocks excluded from composite
}

// ——— Scoring ———
interface ScoringPolicy {
  topology: "compensatory" | "multiple_hurdle" | "hybrid";
  weighting: "rational" | "unit" | "pareto_assist";   // R-I.5, R-I.6
  threshold: number;                  // pass mark 0..100, live preview
  banding?: { enabled: boolean; sedWidth: number };   // score bands via standard error of difference
  tieBreakers: ("focus_attributes" | "work_sample" | "earlier_submission")[];
  anonymization: { maskPII: boolean; revealAtStage: "decision" | "invited" };
  abstainPolicy: { minEvidencePerAttribute: number; onAbstain: "flag_human" };
  normalization: "absolute_rubric";   // rubric-referenced, not cohort-normed (auditable)
}

// ——— Vacancy ———
type VacancyStatus = "DRAFT" | "IN_REVIEW" | "LIVE" | "PAUSED" | "CLOSED" | "ARCHIVED";
interface VacancyV2 {
  id: string; code: string; status: VacancyStatus; configVersion: number;
  profile: PositionProfile;           // §4.2
  categories: CategorySpec[];
  pipeline: PipelineBlock[];
  scoring: ScoringPolicy;
  experience: CandidateExperienceConfig;  // branding, landing, notices, comms (§4.6)
  governance: GovernanceConfig;           // reviewers, SLAs, dual-control (§4.7)
  distribution: ChannelLink[];            // §6
  window: { opensAt: string; closesAt: string; timezone: string };
  capacity?: { maxSubmissions?: number };
  audit: AuditEntry[];               // append-only, hash-chained (existing)
}

// ——— Evaluation ———
interface BlockResult {   // Stage A output, one per candidate×block
  blockId: string; itemScores: ItemScore[]; blockScore: number;
  confidence: ConfidenceBand; confidenceReason: string;
  drivers: Driver[]; evidence: EvidenceChip[]; reasoning: ReasoningStep[];
  integrity: IntegritySignal[]; engine: EngineStamp;
}
interface EngineStamp { model: string; promptId: string; promptVersion: string; rubricVersion: string; runs: number; scoredAt: string }
interface CandidateEvaluation {  // Stage B output
  perBlock: BlockResult[];
  attributeScores: CompetencyScore[];   // existing shape, reused
  categoryScores: { categoryId: string; score: number }[];
  overall: number; tier: Tier; confidence: ConfidenceBand; confidencePhrase: string;
  synthesis: { strengths: string[]; risks: string[]; contradictions: Contradiction[]; narrative: string };
  mustHaveResults: { id: string; passed: boolean; evidence: string }[];
  engine: EngineStamp;
}
interface Contradiction { claim: string; sourceA: string; sourceB: string; severity: "note" | "review" }

// ——— Dispatch ———
interface DispatchBatch {
  id: string; vacancyId: string;
  selection: { mode: "top_n" | "threshold" | "band" | "manual"; value?: number; candidateIds: string[] };
  action: "invite" | "reject" | "hold" | "custom";
  templateId: string; scheduledAt?: string;
  approvals: { userId: string; role: Role; at: string }[];   // dual-control per governance
  status: "draft" | "pending_approval" | "approved" | "sending" | "sent" | "cancelled";
  provider: "gmail_oauth" | "transactional";
}
```

---

## 4. Employer side — the Vacancy Studio

The Studio replaces the current two-branch creator with a seven-step workspace. Steps are a left rail, not a forced wizard: power users jump anywhere; a **preflight validator** (§4.8) is the only gatekeeper to publishing. Every step supports the two entry modes that exist today — **Describe** (natural language → generated config with per-field "why") and **Manual** — plus **From preset** and **Clone vacancy** (§5).

```
┌─ Vacancy Studio ────────────────────────────────────────────────┐
│ 1 Position Profile   4 Scoring & Ranking    7 Preflight/Publish │
│ 2 Criteria           5 Candidate Experience                     │
│ 3 Pipeline Composer  6 Team & Governance                        │
└─────────────────────────────────────────────────────────────────┘
```

A persistent right-side **Impact Panel** re-renders on every change: total candidate time, estimated composite validity band and adverse-impact caution (R-I.1), pass-count preview against the live applicant distribution (existing threshold preview, generalized), and a compliance lint summary.

### 4.1 Entry

| Mode | Behavior |
|---|---|
| **Describe** | Free-text role description → generator drafts Profile, Criteria, Pipeline, Scoring; every generated field carries a "why chosen" popover and is editable. (Existing NL branch, extended to full scope.) |
| **Manual** | Empty scaffold with sensible defaults (structured interview + knockout + CV intake). |
| **From preset** | Pick from org library or built-in role-family presets (§5); everything editable after instantiation. |
| **Clone** | Deep-copy an existing vacancy minus candidates, window, and code. |

### 4.2 Step 1 — Position Profile

Identity and logistics of the concrete workplace being hired for.

- **Role identity:** title; internal requisition ID; department/team; hiring manager; number of openings; seniority level (Intern / Junior / Middle / Senior / Lead / Head / Executive); employment type (full-time / part-time / contract / internship / seasonal / shift); work mode (on-site / hybrid / remote-country / remote-global) + location(s) and time-zone overlap requirement.
- **Compensation band** (optional, per-region): min–max, currency, period, visibility toggle (shown on landing page or hidden).
- **Taxonomy mapping:** the title autocompletes against O*NET/ESCO occupations (SFIA for tech roles); accepted mapping seeds the criteria generator and the question banks (R-I.3). Manual override allowed; "no taxonomy" allowed.
- **Role narrative:** mission of the role (1–3 sentences), responsibilities (bulleted), team context. Used on the landing page and injected into evaluation prompts as job context.
- **Industry pack** selector (Tech / Sales & CS / Healthcare / Finance / Retail & Hourly / Manufacturing / Logistics / Creative / Public sector / Education / Custom): pre-filters suggested attributes, question banks, block availability defaults, and compliance hints. Packs never restrict — only reorder suggestions.
- **Language(s) of the process:** primary candidate-facing language + optional alternates; per-block language override (e.g., interview in English for a support role serving US customers, everything else localized).
- **Window & capacity:** opens/closes datetimes with timezone; optional max submissions (hard stop with waitlist page); optional rolling review toggle (evaluate as submissions arrive vs. batch after close).

### 4.3 Step 2 — Criteria Architecture

The heart of customization: **what exactly is being evaluated and how much each thing matters.**

**4.3.1 Structure.** Categories (3–6 recommended, 1–10 allowed) → Attributes (≤6 per category recommended; Greenhouse comparability data, R-III.9). Category weights sum to 100; attribute weights sum to 100 within each category. Weight editing: sliders with lock icons (lock a weight, others auto-rebalance proportionally), numeric input, and a "distribute equally" action (unit weighting is defensible — R-I.5).

**4.3.2 Attribute anatomy.** Each attribute:

- **Kind:** `skill` (learnable capability), `trait` (behavioral disposition), `knowledge` (domain knowledge), `qualification` (credential: degree, certification, license), `experience` (tenure in scope), `language` (CEFR level).
- **Definition:** one-sentence observable definition — auto-drafted, editable; injected verbatim into rubrics and prompts (frame-of-reference discipline, R-I.5).
- **Proficiency scale:** 5 levels with BARS anchors — concrete behavioral exemplars per level, auto-drafted from the definition + taxonomy, fully editable. Example (Attribute "Decision-making under ambiguity", level 4): *"Names the decision, the information they lacked, the reversible/irreversible framing they applied, and the measured outcome."*
- **Weight** within category; **Focus** flag (max 5 focus attributes per vacancy — they get priority question coverage and tie-breaking power).
- **Must-have (knockout) floor** — separate from scoring by design (R-III.13 #2): e.g., `experience ≥ 3 years`, `certification = AWS SA Pro`, `language ≥ C1`, `work authorization = required`, or `min_scale_level ≥ 2` on this attribute. Every knockout is human-recoverable: failed candidates land in a "Knocked out" tray, not the void.
- **Verification source:** self-report / interview evidence / test score / document proof / reference. Attributes of kind `qualification` default to document proof and link to the Document Verification block (§4.4.16).
- **Taxonomy ref** (optional): pins the attribute to O*NET/ESCO/SFIA/UCF codes for reporting and question-bank retrieval.

**4.3.3 Suggestion engine.** "Suggest attributes" reads the Position Profile and taxonomy mapping and proposes a criteria architecture with weights and a one-line "why" per suggestion (e.g., *"Team-lead roles: leadership cluster weighted highest per your emphasis on people responsibility"*). Recruiter accepts/edits per row. Bulk actions: import from preset, import from another vacancy, export as preset.

**4.3.4 Coverage matrix.** A live grid Attributes × Pipeline Blocks showing where each attribute is measured (dot = mapped, ring = focus). Publishing requires every scored attribute measured by ≥1 block and every focus attribute by ≥2 (triangulation). This matrix *is* the traceability artifact regulators expect (R-I.3).

### 4.4 Step 3 — Pipeline Composer

An interactive canvas of ordered **blocks** — each an HR selection method with its own sub-settings.

**Canvas interactions:** vertical block list with drag-to-reorder; "+" inserts from the **Block Library** (right drawer, grouped as below, searchable, each card showing method name, validity badge from R-I.1 (e.g., *ρ ≈ .42 — highest validity-per-fairness*), time cost, and evidence level (meta-analytic / vendor-validated / experimental)); click block → settings sheet; duplicate / disable / delete; a **gate chip** between blocks configures hurdles (*"proceed only if block score ≥ 60"* or *"all must-haves passed"*). The rail shows cumulative candidate time; exceeding the recommended budget (45 min default, configurable) raises a drop-off warning citing abandonment data (R-I.7).

Pipelines may end with human stages (§4.4.18) — the AI-evaluated funnel and the human funnel are one pipeline.

**4.4.0 Settings common to every block**

| Setting | Detail |
|---|---|
| Title & candidate intro | Intro must state what the block measures and why it's job-relevant (justice rule, R-I.7); auto-drafted, editable. |
| Required / optional | Optional blocks never gate progression and are flagged in scoring as supplementary. |
| Scored / informational | Informational blocks collect data without composite contribution. |
| Attribute mapping | Which attributes this block measures and with what share (feeds Coverage Matrix + rollup). |
| Hurdle gate (outgoing) | Min block score and/or must-have checks required to unlock the next block. |
| Deadline offset | Optional per-block deadline within the vacancy window (e.g., knockout+CV within 48h of code entry). |
| Integrity tier | 0 none · 1 signals (tab/paste/latency logging) · 2 signals + camera snapshots + liveness · 3 tier 2 + ID document check. Tier 3 allowed only on final blocks; the tier is disclosed to the candidate before start (R-IV.4). |
| Accessibility | Extra-time multiplier (1.25× / 1.5× / 2× / untimed), captions, screen-reader mode, alternative-format availability; candidate-side accommodation requests always available regardless of settings (R-IV.3). |
| Language | Inherit vacancy language or override. |
| Retake policy | Whole-block retakes (0–2) for technical failure; per-item retakes are per-block settings below. |

**Block Library** (19 kinds, grouped):

---

**Group A — Screening & background**

**4.4.1 `application_form` — Structured Application Form**
*Method: structured biodata collection (R-I.1 — empirically keyed biodata ρ ≈ .38).*
- Field builder: contact block (locked, feeds PII vault), then custom fields — short/long text, single/multi choice, dropdown, date, number, file, URL, consent checkbox. Per-field: required, PII flag (masked in review), scored/unscored.
- Scored biodata items (optional): choice questions with per-option point keys (empirical keying supported later; rational keys at launch).
- Prefill from CV parse toggle; deduplication rule (same email+vacancy → resume existing application).
- Output: profile record; biodata sub-score if scored items exist.

**4.4.2 `knockout` — Knockout Questionnaire**
*Method: minimum-qualifications screen (Uniform Guidelines-safe: job-related, documented).*
- Items generated from must-have floors (§4.3.2) + custom items. Types: yes/no, numeric threshold, single choice with disqualifying options, multi-select "must include."
- Per-item: disqualifies immediately vs. contributes to a knockout review tray; custom rejection-reason text (candidate-visible wording, legally neutral).
- Settings: show knockouts before or after the form; allow "explain your answer" free-text appeal field (routes to human tray).
- Output: pass/fail per rule + tray routing. Never contributes to the composite.

**4.4.3 `cv_intake` — CV / Résumé Intake & Parsing**
*Method: credential and history extraction (low standalone validity — R-I.1 experience ≤ .10 — so default weight is low; its value is evidence for verification and interview context).*
- Settings: accepted formats (PDF/DOCX), max size; parse targets (employment history, education, certifications, skills, publications, links); **anonymization ON by default** (name, photo, age markers, address stripped from reviewer view — R-I.6); claim-extraction toggle (structured claims like "led team of 8" become verifiable items for interview probes and document checks); portfolio URL field.
- Output: structured profile, claims ledger, parse-confidence per field. Scored only if mapped to `experience`/`qualification` attributes via explicit rules (e.g., years-in-role bands).

---

**Group B — Interviews**

**4.4.4 `async_interview` — Structured Asynchronous Interview** *(flagship)*
*Method: structured interview, the validity champion (ρ ≈ .42, d ≈ .2–.3 — R-I.1, R-I.2). Implements Campion's 15 components by construction.*

Question set:
- **Count:** 3–12 scored questions (default 5; the Impact Panel shows marginal-validity-per-minute guidance — more, shorter questions beat few long ones, R-I.2 #5).
- **Sources per question:** ① curated bank (filtered by attribute + industry pack + seniority; each bank item ships with a BARS rubric and 2 pre-approved probes), ② AI-drafted from the attribute definition (never from the CV — cross-candidate consistency, R-I.8), ③ manual authoring with rubric assistant.
- **Per-question config:** target attribute (exactly one primary, optional secondary at reduced share); question type — `behavioral` (past-oriented, STAR-eliciting; default for Middle+ seniority) / `situational` (hypothetical with scoring key; default for Junior/hourly — Huffcutt moderator, R-I.2) / `background` / `job_knowledge` / `motivation`; think time (0/30/60/120s, or untimed); answer time cap (30s–5min); response modality — `video` / `audio` / `text` (per question; audio/text raise accessibility and reduce bandwidth barriers); re-record attempts (0–3; default 1 — reactions research, R-I.8); notes visibility (candidate may keep notes on screen: on/off).
- **Follow-up policy (anchored probing — R-I.8):** off / 1 level / 2 levels. Probes come only from the question's pre-approved probe list or a constrained generator instructed to seek rubric-relevant specifics ("measure," "your role vs. the team's," "what alternative did you reject"). Probes are logged as `AI` transcript lines; scoring still targets the base question's rubric only.
- **Order:** fixed or per-candidate randomized (fixed by default — same-experience fairness; randomization available for leak resistance with a lint warning).
- **Session settings:** intro video (recruiter-recorded or AI-presenter with disclosed synthetic voice; script editable); unscored practice question ON (non-removable — tech-check equity); captions ON default; pause allowance (0–2 pauses ≤ 5 min); disconnect policy (auto-resume at last unanswered question, answered items immutable); "review before submit" — off by default for video (spontaneity), on for text.
- **Rubrics:** every scored question carries a 1–5 BARS rubric bound to its attribute's scale; rubric text editable; **rubric lock at publish** — mid-flight edits create a new configVersion and trigger the re-scoring workflow (§8.6).
- Output: transcript (per-question, speaker-tagged, timestamped), media refs, per-question ItemScores (§8.2), integrity signals per tier.

Candidate runtime (the exact interview experience):
1. Device check inherited from journey step (§7.4) — camera/mic/connection re-verified.
2. Intro screen: recruiter/AI intro video, block intro text, question count, total time, what is scored (transcript) and what is not (appearance), integrity tier disclosure, accommodation link.
3. Practice question with playback and one free re-record; explicit "practice is never scored."
4. Per question: question displayed as text + spoken (TTS or recorded); think-time countdown (skippable); recording with visible remaining-time ring; optional re-record within allowance; submit → next. Follow-up (if policy on) is asked in the same slot with its own timer, marked "follow-up."
5. Progress rail persists (existing `ProgressRail`); pause button (per allowance); exit-and-resume always safe at question boundaries.
6. Finish: confirmation of receipt, what happens next, disposition SLA date, feedback opt-in.

**4.4.5 `live_ai_interview` — Live Conversational AI Interview**
*Method: real-time structured interview with an AI interviewer (micro1/Apriora category), constrained to anchored probing.*
- Settings: duration cap (10–45 min); persona (name, voice, formality; always disclosed as AI — Art. 50, R-IV.1); base question plan (same builder as 4.4.4); adaptivity level (probe-only / probe+reorder; free-form generation not offered — R-I.8); latency fallback (if candidate bandwidth fails → auto-offer async or chat variant); barge-in allowed (candidate can interrupt); human-handoff request always visible.
- Output: full dialog transcript with per-question segmentation → scored identically to 4.4.4. Real-time verification probes make this block the recommended integrity follow-up for flagged async candidates (R-IV.4).

**4.4.6 `chat_interview` — Structured Text Interview**
*Method: chat-based structured interview (Sapia category) — untimed, camera-free; highest accessibility, best applicant reactions in text-first populations.*
- Settings: 4–8 open questions from the same builder; min/max answer length (words); typing-pattern telemetry toggle (integrity tier ≥1); paste policy (allow / warn / block); follow-up policy as in 4.4.4; tone of AI acknowledgments (neutral/warm).
- Output: text transcript → standard scoring. AI-generated-content detector runs as an integrity *signal* only (R-I.8).

---

**Group C — Tests & questionnaires**

**4.4.7 `sjt` — Situational Judgment Test**
*Method: SJT (ρ ≈ .26; R-I.4). Low-fidelity simulation of role dilemmas.*
- Item builder: scenario (text / image / short video), 4–6 response options; response instruction — `knowledge` ("pick best/worst"; loads cognitive) vs `behavioral_tendency` ("what would you most/least likely do"; loads personality) — selected per vacancy with an explainer; formats: pick-best / pick-best-and-worst / rank-all / rate-each (1–5).
- Scoring key per item: SME key (author assigns option scores), consensus key (auto after ≥50 completions), or hybrid (recommended, R-I.4). Key editing locked post-publish.
- Generator: drafts scenarios from attribute definitions + industry pack; SME review checklist enforced before a generated item becomes scoreable (R-I.8).
- Settings: item count (6–20), timing (untimed default; per-item soft timer optional), randomize item order, pilot mode (first N candidates' items unscored for key calibration).
- Output: keyed scores per item → mapped attributes; distractor analytics for the author.

**4.4.8 `cognitive` — Cognitive Ability Test**
*Method: GMA (ρ ≈ .31 but d ≈ .7–.8 — the builder shows the adverse-impact caution and suggests weight ≤ 15% and late placement; R-I.1, R-I.6).*
- Settings: subtests (numerical / verbal / logical-inductive / spatial / working-memory / attention); length per subtest (6–15 items); adaptive difficulty toggle; total time; calculator allowed; practice items (2, unscored, mandatory); item-bank rotation + exposure caps (leak resistance).
- Output: subtest + total scores (rubric-referenced bands, not cohort percentiles at launch); extra-time completions flagged `conditions_modified` and excluded from norm comparisons (R-III.1 pattern).

**4.4.9 `personality` — Personality Questionnaire**
*Method: Big Five / HEXACO self-report (conscientiousness ρ ≈ .19–.22; near-zero d; R-I.4). Positioned as fit signal, never a hard filter.*
- Settings: model (Big Five / HEXACO incl. Honesty-Humility); length (60/120/200 items); format — Likert or **forced-choice pairs (default; faking-resistant, R-I.4)**; contextualized "at work" phrasing ON; target profile per attribute mapping (e.g., trait "Composure" ← low Neuroticism facet), each mapping shows its evidence level; candidate-facing feedback report toggle (Sapia-style "My Insights" — recommended ON for experience).
- Hard rule (lint-enforced): personality may contribute ≤ 20% of the composite and can never be a knockout.
- Output: trait/facet profile → mapped trait attributes with `Med` max confidence (self-report ceiling), flagged for interview triangulation.

**4.4.10 `integrity_test` — Integrity & Reliability Module**
*Method: overt integrity test (ρ ≈ .31, d ≈ 0; R-I.4). For roles with cash/safety/compliance exposure.*
- Settings: domains (rule adherence, safety orientation, dependability, counterproductive-behavior attitudes); length; format Likert/forced-choice; industry pack presets (retail shrink / warehouse safety / finance compliance).
- Output: domain scores → mapped attributes; never sole rejection grounds (lint).

**4.4.11 `job_knowledge` — Job Knowledge Test**
*Method: job-knowledge test (ρ ≈ .40 — R-I.1). The highest-validity test block; the default pick over `cognitive`.*
- Item types: MCQ (single/multi), true/false with justification, short answer (AI-scored vs model answer + key points), image-hotspot, sequence-ordering.
- Settings: item count, per-item or total timing, difficulty mix (easy/medium/hard %), bank rotation, open-book toggle (changes construct: knowledge → retrieval skill; labeled), AI-draft-items from attribute + taxonomy with SME checklist.
- Output: per-item + total; short-answer items produce evidence chips (the quoted answer fragment).

**4.4.12 `language_test` — Language Proficiency**
*Method: CEFR-aligned proficiency assessment.*
- Settings: language; skills tested (reading / listening / writing / speaking — speaking reuses the async recorder); target level (A2–C2) from the `language` attribute; length per skill; auto-scored writing/speaking with CEFR descriptors as rubric.
- Output: per-skill CEFR estimate + pass/fail vs target.

---

**Group D — Simulations & work**

**4.4.13 `work_sample` — Work Sample / Take-Home Assignment**
*Method: work-sample test (ρ ≈ .33; best applicant reactions — R-I.1, R-I.7).*
- Settings: brief (rich text + attachments); deliverable types (file upload with format whitelist / URL / in-platform rich-text / spreadsheet grid); time budget — honesty-window model (recommended: "≤ N hours, we log elapsed wall-clock but not keystrokes") or hard timer; AI-use policy — `forbidden` / `disclosed` ("you may use AI; attach your prompts") / `expected` (evaluates AI-collaboration skill — Codility Cody pattern, R-III.13) — disclosed to candidate verbatim; originality check toggle (similarity vs. cohort + web); anonymized grading ON (Greenhouse pattern); grading rubric 2–6 weighted dimensions, each BARS-anchored; optional employer-trained calibration (grade 5 sample submissions to tune the AI grader — Vervoe pattern, R-III.2); defense follow-up toggle (auto-adds 2 probe questions about their submission to the next interview block — the strongest anti-outsourcing measure, R-IV.4).
- Output: artifact + dimension scores + originality signal + elapsed time.

**4.4.14 `coding` — Technical Coding Assessment**
*Method: work sample for software roles.*
- Settings: environment (in-browser IDE with runner / take-home repo); languages allowed; task source (bank by stack+seniority / custom with hidden test cases / AI-drafted + SME review); scoring split % (correctness via tests / code quality via rubric-AI / approach via defense probes); time cap; AI-use policy as 4.4.13 (with `expected` mode instrumenting the AI-assistant dialog as an evaluated artifact); plagiarism/similarity check; keystroke playback for human reviewers.
- Output: test-pass matrix, quality scores with cited lines as evidence chips, similarity signal.

**4.4.15 `case_exercise` — Case Study / In-Basket Simulation**
*Method: assessment-center exercise (ρ ≈ .29; exercise effect — score the exercise, not abstract dimensions; R-I.4).*
- Formats: case analysis (materials pack → written recommendation); **in-basket/e-tray** (simulated inbox of N items — emails, memos, interruptions — candidate triages, replies, delegates within a time box); **role-play with AI counterpart** (disclosed AI plays a customer/report/stakeholder with a fixed persona script and escalation beats; transcript scored) ; presentation (record a deck walkthrough via the async recorder).
- Settings: format; materials; time box; item count (in-basket 8–15); persona script + escalation triggers (role-play); scoring rubric per exercise outcome (prioritization, judgment, tone, decision quality).
- Output: artifacts + transcript → exercise-level scores mapped to attributes.

---

**Group E — Verification & human stages**

**4.4.16 `doc_verification` — Documents & Credentials**
*Method: credential verification tied to `qualification` attributes (existing product surface, formalized).*
- Settings: required documents list auto-derived from qualification attributes + custom (diploma, certification, license, work authorization, portfolio); accepted formats; verification mode — automated extraction + claim match (VERIFIED / NOT_VERIFIED / PENDING with confidence, existing shapes) with human adjudication tray; deadline (often post-shortlist to reduce candidate burden — placement configurable); ID check (tier 3) optional at this block.
- Output: DocumentVerification[] (existing type); mismatches flag the related attribute's confidence, never auto-reject.

**4.4.17 `reference_check` — Automated Reference Check**
*Method: structured reference check (ρ ≈ .26 when structured; VidCruiter pattern — R-II.10).*
- Settings: number of referees (1–4) + required relationship (manager/peer/report); questionnaire from the same builder (rating items on the vacancy's attributes + open comments); collection window; fraud controls (referee email-domain and IP/device heuristics, self-reference detection); anonymized aggregation toggle when ≥3 referees.
- Output: referee ratings mapped to attributes (capped share ≤ 10%), flags to human tray.

**4.4.18 `human_stage` — Human Interview Stage**
*Method: live human panel round inside the same pipeline (post-AI funnel).*
- Settings: interviewers/panel; scheduling (candidate self-books from connected calendars); interview kit auto-generated per candidate — the AI-flagged weak/unverified attributes become suggested probe areas with the same BARS rubrics (SHL interviewer-guide pattern, R-III.4); scorecard = per-attribute 1–5 + evidence notes, independent submission before panel discussion unlocks (R-I.2 #13); optional AI notetaker (consented, produces draft scorecard for the human to edit — Ashby pattern).
- Output: human ItemScores entering the same rollup with configurable weight vs. AI blocks.

**4.4.19 `custom` — Custom Block**
- Author-defined instrument: instruction screen + any mix of item primitives (recorder, text, choice, file, grid) + rubric bindings. Carries an `experimental` evidence badge by default. Escape hatch for industries the library doesn't cover yet.

### 4.5 Step 4 — Scoring & Ranking

- **Topology:** compensatory (rank by composite) / multiple-hurdle (each gated block must clear its bar; ranking within survivors) / hybrid (knockouts + gates non-compensatory, rest compensatory — default).
- **Weight rollup preview:** a sunburst (category → attribute → block share) with an **effective-weight table** — the true % of the final score each block and attribute carries after all mappings; catches silent double-counting.
- **Threshold:** pass mark slider with live pass-count against current (or simulated) distribution — existing behavior, retained.
- **Banding:** optional SED-based bands (§3 `banding`); when on, the leaderboard displays bands and discourages rank-ordering within a band (R-I.5); tie-breakers configurable.
- **Confidence policy:** evidence minimums per attribute (abstain → `needs human` flag, not a low score); confidence rendered as phrases (existing rule: never a bare number).
- **Integrity policy:** which signal severities annotate vs. route to mandatory human adjudication before the candidate can be dispatched.
- **Anonymization:** mask-PII default ON; reveal stage (decision / invited); reveal events logged (existing).
- **Weighting mode:** rational (as configured) / unit (flatten within level) / **Pareto assist** (shows the validity–diversity frontier and suggests weight adjustments within recruiter-set bounds; suggestions require explicit acceptance and are logged — R-I.6).

### 4.6 Step 5 — Candidate Experience & Branding

- **Landing page** (public, per vacancy): hero with cover image, role narrative, comp band (if visible), process preview (block names, time, what's scored), company blurb, **AI-use notice + accommodation request + published bias-audit link** (R-IV.6), and the code-entry field / "Start" CTA. Block-based editor with brand tokens (Teamtailor pattern).
- **Brand kit** (org-level): logo(s), palette, typography choice, imagery, email footer, sender identity. Every vacancy inherits; per-vacancy override.
- **Cover Image Designer** (in-Studio canvas):
  - Artboards: LinkedIn landscape 1200×627, square 1080×1080, story 1080×1920, Twitter/X 1200×675, A4/A3 poster (print, with bleed), OG-image (auto-bound to landing page).
  - Layers: background (brand gradient / template art / upload); shapes; image masks; **text layers** (headline auto-bound to role title — editable; body; badge) with font, size, weight, letter-spacing, color from brand palette (contrast-checked AA); **logo layer** (from brand kit, safe-area snapping); **auto-elements**: competition-code chip (`WBX-3F8N`), short-URL, and QR code (per-channel QR auto-swaps when exporting channel variants).
  - Ops: templates gallery (industry-pack styled), duplicate artboard, per-channel variant generation, export PNG/JPG/PDF-print, "regenerate with AI" for background art only (never faces).
  - Saved designs are presets (§5) reusable across vacancies.
- **Notices & consent:** jurisdiction profile (auto-suggested from location targets): assembles the candidate-facing notice pack — AI-interaction disclosure, what is assessed, data retention, NYC 10-day AEDT notice, IL written consent, EU Art. 26(11) notice — versioned; consent checkpoints inserted into the journey (§7.2) and logged (R-IV.1–2).
- **Communication plan:** confirmation, reminder cadence (max 2 before deadline — R-IV.3), disposition SLA target (default 5 business days — R-I.7), feedback offer toggle (on-request structured explanation — R-IV.5), sender identity (org brand vs recruiter personal).
- **Candidate-facing language & tone:** formal/neutral/warm; localized string packs.

### 4.7 Step 6 — Team & Governance

- **Roles on this vacancy:** Owner (HR), Hiring Manager, Technical Reviewer(s), Observer (read-only) — existing `Role` type, per-vacancy assignment; PII-reveal permission is a separate grant.
- **Review policy:** number of independent human reviews required per candidate before decision (1 default; 2 for `Head+` seniority); reviewer assignment (round-robin / by attribute expertise); **independent-first rule** — reviewers see each other's verdicts only after submitting their own (R-I.2 #13).
- **Calibration:** before a reviewer's first live vacancy review, a frame-of-reference module: rate 3 anchored practice cases, get deviation feedback (R-I.5); per-reviewer drift metrics feed the existing Calibration page.
- **Dual-control dispatch:** outbound batches above a size threshold (default 25) require a second approver (§9.4).
- **SLA targets:** review-queue and disposition SLAs with dashboard timers.
- **Change control:** who may edit a LIVE vacancy (creates new configVersion); who may pause/close.

### 4.8 Step 7 — Preflight & Publish

The validator runs continuously; publishing requires all **blockers** green (warnings are overridable with a logged reason):

- Weights sum to 100 at every level; every scored attribute measured ≥1 block; focus attributes ≥2 blocks (blocker).
- Every scored question/item has a rubric bound to an attribute (blocker).
- Pipeline time within budget; drop-off warning if exceeded (warning).
- Personality ≤ 20% composite; GMA placement/weight caution (warning with rationale, R-I.1/I.6).
- Notices pack complete for targeted jurisdictions; accommodation route reachable (blocker).
- At least one human reviewer assigned; dispatch dual-control satisfied by roster (blocker).
- Integrity tiers disclosed in candidate intros (blocker); tier 3 only on final blocks (blocker).
- Bias lint: knockouts scanned for proxy risk (ZIP/address, age-correlated phrasing — IL HB 3773; R-IV.1) (warning → legal tray).

**Publish:** freezes `configVersion` (criteria, pipeline, rubrics, prompts, notices); generates the **Competition Code** (`WBX-` + 4 base-32 chars, collision-checked, profanity-filtered); mints channel links (§6); renders the landing page; opens the window. **Preview-as-candidate** (full journey against the draft, sandboxed) is available from every step and required once before first publish (blocker).

---

## 5. Preset & template system

- **Scopes:** full vacancy · criteria architecture · single block · question set · rubric set · SJT/knowledge item bank · email pack · cover design · notice pack.
- **Operations:** save-as-preset from any live object; instantiate (deep copy, fully editable); update preset (new preset version; existing vacancies unaffected); share org-wide or keep private; import/export JSON.
- **Built-ins:** role-family presets per industry pack (e.g., *Retail Store Associate — hourly*: knockout → chat interview 4q → SJT 8 items → integrity short → availability form; *Senior Backend Engineer*: knockout → CV intake → async interview 5q → coding 2 tasks (AI-disclosed) → work-sample defense probes → human panel; *Team Lead — Platform*: the existing demo vacancy, formalized). Each built-in states its method rationale inline.
- **Versioning:** presets carry semver-ish versions and provenance ("derived from vacancy v-teamlead cv7"); instantiation records lineage in the vacancy audit.

---

## 6. Publishing & distribution

**The model:** job boards carry the ad; WhiteBox is the destination. (Boards support only binary knockouts natively; Indeed killed native assessments — R-III.12.)

- **Channel links:** per channel (LinkedIn, Indeed, hh/other boards, referral, university, QR-poster, custom), the Studio mints `https://<org>.whitebox.ai/j/<code>?src=<channel>` + a matching **channel code suffix** for spoken/print contexts (`WBX-3F8N·LI`); all resolve to the same vacancy with first-touch source stamped on the candidate record (R-IV.6).
- **Post kit** per channel: the cover image variant (right aspect), ad copy draft (AI-drafted from the role narrative; editable), the link, the code, and the QR (print channels). Copy-to-clipboard / download bundle. (Direct board-API posting is a later integration; the kit makes manual posting one paste.)
- **Recommended board pattern** documented in-UI: use the board's native quick-apply where forced, with an auto-reply email/SMS carrying the invite link + code (redirect-penalty avoidance, R-III.12).
- **Source analytics:** per channel — clicks → code entries → registrations → completions → pass rate → invited (funnel per source; cost-per-quality-applicant when spend is entered) (§10).
- **Capacity & window** enforced at the door: closed/full states render branded pages with optional talent-pool opt-in.

---

## 7. Candidate side — the application journey

The journey is generated from the pipeline; the rail (existing `CandidateShell` + `ProgressRail`) always shows: steps, time estimates, deadline, saved-state, and the accommodation link. **Every step is resumable; nothing is lost on disconnect.** Session model: invite/code → durable application token (magic-link re-entry via email; R-IV.3).

1. **Entry.** Candidate lands via channel link (code prefilled) or types the code on `/apply` (existing page). Code validation states: valid / expired window / capacity-full (each branded, with talent-pool opt-in).
2. **Notice & consent.** The jurisdiction notice pack (§4.6): what the process is, which parts are AI, what is scored (language content) and what never is (face/voice/emotion), retention, rights (explanation, human review, accommodation). Explicit consent checkboxes where law requires (IL video). Declining AI-scored blocks routes to the **alternative-process request** tray (human-reviewed path) instead of a dead end (R-IV.2).
3. **Registration & profile.** Minimal account (email + OTP magic link; OAuth optional — existing auth); then the `application_form` block. Autosave every field.
4. **System check** (before any recorded block): camera/mic/screen/browser/connection with live meters (existing page, retained), device recommendation, bandwidth fallback offer (video → audio → text per block settings).
5. **Blocks in order.** Each block renders per its §4.4 runtime; between blocks: progress celebration, next-block preview with time estimate, exit-safe point messaging ("you can stop here and return until <deadline>"). Hurdle outcomes are silent to the candidate at block boundaries (no mid-process rejections unless the vacancy enables early-exit courtesy messaging — configurable; default: complete-then-decide to avoid distress mid-flow, except hard knockouts which show the configured neutral message immediately).
6. **Submission.** Receipt with submission ID, disposition SLA date, what-happens-next diagram (AI evaluation → human review → decision), feedback opt-in, calendar file for the SLA date.
7. **Status page** (existing): stages submitted → under review → decision; shows integrity-adjudication contact if the candidate was flagged (transparency without accusation); post-decision: invitation scheduling or neutral outcome + on-request structured explanation (R-IV.5).

Accessibility throughout: WCAG 2.2 AA; keyboard-complete; captions on all AI speech; extra-time multipliers applied per grant; accommodation requests never require completing the flow first (R-IV.3).

---

## 8. The evaluation engine

Two stages, exactly as the product story promises: **Stage A — independent per-block evaluation** at block submission; **Stage B — comprehensive cross-block synthesis** when the pipeline completes (or at window close for batch vacancies). All engine calls are provider-pluggable LLM API calls (default: Claude family — a large model for scoring/synthesis, a small model for extraction/formatting), pinned per vacancy configVersion.

### 8.1 Non-negotiables (engine-wide)

- Input to scoring prompts is **transcript/artifact text + rubric + role context**. Media never enters scoring models. No demographic fields ever enter any prompt (they live in a separated analytics store — §10).
- Determinism discipline: temperature 0; **k=3 self-consistency runs** per scored item, median score kept, run disagreement > 1 rubric level → confidence downgrade + human flag (R-I.8).
- **Per-attribute scoring, never holistic** (halo control, R-I.8). Cross-attribute prompts are forbidden in Stage A.
- Every score returns: integer level 1–5 vs BARS + 0–100 mapping, ≥1 evidence quote with locator, ranked drivers (principal first), confidence with reason, and an explicit `abstain` option when evidence is insufficient (abstain → human tray, not a low score).
- **EngineStamp** (model, promptId+version, rubricVersion, runs) written on every result; any stamp component change ⇒ recompute is a new audit event (R-IV.2).
- Verbosity guard: scorer prompts instruct against rewarding eloquence/length; calibration suite (§8.5) tracks length–score correlation as a drift metric.

### 8.2 Stage A — per-block scoring

Per block kind:

- **Interviews (4.4.4/5/6):** ASR transcription (word-level timestamps, speaker tags) → per-question scorer prompt: [attribute definition + 5 BARS anchors + question text + candidate answer only] → level, evidence quotes (verbatim spans become Evidence Chips with timestamps), drivers, confidence, STAR-completeness annotation for behavioral items. A separate **claims extractor** logs verifiable factual claims ("managed 8 people", "AWS cert 2024") into the claims ledger for doc-verification and human probes.
- **SJT / knowledge / cognitive / language:** deterministic keyed scoring (no LLM for closed items); AI scoring only for short-answer/writing/speaking items against model-answer rubrics with quoted evidence.
- **Personality / integrity questionnaires:** psychometric scoring (scale norms per instrument version); output profile + per-mapped-attribute contribution with `Med` confidence cap; faking indicators (response consistency, extreme-response style) as signals.
- **Work sample / coding / case:** rubric-dimension scorers over the artifact (code: test matrix is deterministic; quality dimensions cite line spans as evidence); originality/similarity as integrity signal; role-play transcripts scored like interviews.
- **Reference check:** referee ratings aggregate (mean, dispersion flag); open comments summarized with quotes.
- **Integrity analyst** (per block, tiers ≥1): consumes telemetry (tab/paste/latency/liveness/similarity) → `IntegritySignal[]` with level none/low/medium and neutral wording (existing shape). Signals never enter scoring prompts; they annotate results and gate dispatch via the adjudication tray.

### 8.3 Stage B — comprehensive synthesis

Runs when all required blocks are in:

1. **Attribute rollup (mechanical):** attribute score = Σ (block share × block-level attribute score); category = Σ attribute weights; overall = Σ category weights; topology applied (hurdles/knockouts filter before ranking). Pure arithmetic — no model in the math path (R-I.2 #15).
2. **Cross-source triangulation (model-assisted):** for each attribute measured by ≥2 blocks, compare evidence: agreement ↑confidence; divergence → `Contradiction` (e.g., claimed leadership vs. SJT delegation choices) with both sources quoted, severity `note`/`review`.
3. **Claims verification join:** claims ledger × doc-verification results → per-claim VERIFIED / NOT_VERIFIED / UNCHECKED; unverified *material* claims lower the related attribute's confidence, never the score (existing `docVerified` semantics).
4. **Narrative synthesis:** strengths (top drivers across attributes), risks (low anchors + contradictions), and a 6–10 sentence evidence-cited narrative. The narrative cites chip IDs — the UI renders them as the existing evidence chips.
5. **Confidence & tier:** overall ConfidenceBand from (evidence density, run agreement, cross-source agreement, data quality); phrase rendered (existing `confidencePhrase`); Tier Top/Mid/Bottom by threshold + banding.
6. **Leaderboard insert** with all columns (rank, tier, overall, confidence, integrity, docs, divergence-with-AI flag reserved for human overrides).

### 8.4 Prompt architecture (versioned assets, per vacancy)

| Prompt | Role |
|---|---|
| `scorer.item.v*` | Single-item BARS scoring (the workhorse; §8.2 contract). |
| `prober.followup.v*` | Constrained probe selection/generation for anchored probing (4.4.4/5/6). |
| `extractor.claims.v*` | Verifiable-claim extraction from transcripts/CV. |
| `synth.triangulate.v*` | Cross-source agreement/contradiction analysis (Stage B.2). |
| `synth.narrative.v*` | Evidence-cited narrative (Stage B.4). |
| `integrity.analyst.v*` | Telemetry → neutral advisory signals. |
| `authoring.question.v*` / `authoring.rubric.v*` / `authoring.sjt.v*` | Studio-side drafting (never runs on candidates). |
| `feedback.candidate.v*` | On-request structured explanation from the audit record (neutral, criteria-tied — R-IV.5). |

Prompts are content-addressed; the Studio pins the set at publish; the raw prompt text of any EngineStamp is viewable by Owner/auditors (true white-box).

### 8.5 Calibration & drift

A **golden set** per block kind (anchored answers at known levels, from bank authors + pilot data): every prompt/model version must pass agreement thresholds (exact-level ≥ 60%, ±1 level ≥ 95%) before it can be pinned; nightly canary re-runs detect provider drift; length-bias and cross-attribute halo (inter-correlation inflation) tracked per version (R-I.8). Results feed the existing Calibration surface.

### 8.6 Recompute workflow

Triggered by: rubric/prompt/model change on a LIVE vacancy (new configVersion), human `Recompute` verdict, or engine-incident remediation. Rules: recompute never silently replaces — old and new results both retained with stamps; affected candidates flagged; leaderboard shows "recomputed" chip; bulk recompute requires Owner + reason (audited).

### 8.7 Bias monitoring hooks

Per stage and per vacancy: score distributions and pass rates by voluntary demographic segments (collected separately from evaluation data, never joined into prompts): impact ratios with 4/5ths + significance flags feed the existing Bias page and the audit exports (§10; R-I.6, R-IV.2).

---

## 9. HR side — review, decision & dispatch

### 9.1 Review workbench

Existing surfaces retained and bound to the new engine: **Leaderboard** (ranking table + tiers + bands + confidence + integrity + docs columns; filter/sort; band-aware ranking), **Candidate Scorecard** (per-attribute scores with drivers, evidence chips linked to transcript timestamps, reasoning trace "Completed N steps", contradictions panel — new, per-block results tabs — new), **Compare** (side-by-side attribute profiles), **Transcript** with flagged lines.

Meaningful-review instrumentation (R-IV.2): the workbench records evidence-opened events and review dwell; the Governance dashboard shows per-reviewer agreement, override rate, and median dwell (SCHUFA defense posture). Bulk-accept of AI recommendations without opening evidence is rate-limited with friction copy.

### 9.2 HITL verdicts (per candidate)

Existing quartet, formalized: **Accept** (endorse AI result) / **Adjust** (override attribute or overall score — requires reason + becomes `divergence`, original `aiScore` preserved) / **Recompute** (with reason; §8.6) / **Reject** (with reason code from a governed list). Every verdict writes an AuditEntry (hash-chained, existing). Review policy (§4.7) enforces independent N-review before decision states unlock.

### 9.3 Decision states & the shortlist

Candidate stages extend the existing set: `submitted → under_review → shortlisted → invited → offer → hired` / `not_moving_forward` / `knocked_out` / `needs_adjudication` (integrity) / `withdrawn`. The **shortlist builder** operates on the leaderboard: select by **Top N** (e.g., "first 500"), by threshold, by band, or manually; selection previews per-segment impact ratios before confirmation (bias check at the moment of choice — R-I.6).

### 9.4 Dispatch (the human-confirmed outbox)

The pattern is **queue → human batch-confirm → send** (R-IV.5); nothing sends on threshold alone.

1. **Compose batch:** action (invite / reject / hold-warm / custom), audience (shortlist selection), template from the email pack — merge fields ({{first_name}}, {{role_title}}, {{company}}, {{schedule_link}}, {{sla_date}}, {{explanation_link}}…) with validation (missing-field send-block), per-candidate preview sampling, AI personalization assist (drafts a strengths sentence from the scorecard — always shown for edit, existing Invitations pattern).
2. **Approve:** batches > dual-control threshold require a second approver; approval screen shows audience stats, sample renders, and the impact-ratio preview. Approvals are audit entries.
3. **Send:** provider routing — **Gmail OAuth** (existing Google OAuth foundation) for recruiter-voice volume ≤ provider caps, replies landing in the recruiter's inbox; **transactional provider on a dedicated authenticated subdomain** (SPF/DKIM/DMARC-aligned) for volume; scheduled sends in recipient-local business hours; throttling to sender-reputation limits; per-candidate cancel until send moment (R-IV.5).
4. **Track:** delivery/bounce/reply status writeback to candidate records and audit; reply detection via threading; suppression list honored; disposition SLA timers close on decision-communication, and the dashboard shames overdue queues.
5. **Rejections:** neutral template + `{{explanation_link}}` to the on-request structured explanation generated by `feedback.candidate.v*` from the audit record — letter and record can never diverge (R-IV.5).

### 9.5 Post-decision

Invited flow: scheduling link or next `human_stage`; talent-pool consent for silver medalists (banded near-miss segment) with retention rules; hired outcome recorded (future criterion validation loop — quality-of-hire feedback at 90 days, feeding validity analytics §10).

---

## 10. Analytics & compliance console

- **Funnel:** per vacancy and per source-channel: code entries → registered → per-block completion → submitted → passed → shortlisted → invited → hired; drop-off per block with time-in-block distributions (block-level UX debugging — R-I.7).
- **Quality:** score distributions per block/attribute; discrimination stats per question/item (flags dead items); rubric-level usage histograms (anchor drift).
- **Fairness:** impact ratios (4/5ths + significance) per stage and overall; segment score distributions; alert feed (existing Bias page powered by §8.7).
- **Reviewers:** agreement, override rate, dwell, calibration deviation (existing Calibration page, extended).
- **Sources:** cost-per-quality-applicant per channel; QR/poster performance.
- **Compliance exports:** one-click **Evidence Pack** (per candidate / per vacancy); **bias-audit dataset** (LL144-shaped); **notice log** (who saw which notice version when); **retention dashboard** (per-artifact schedules, IL 30-day deletion queue, legal-hold overrides — R-IV.2); model/prompt version registry.
- **Validity loop (later):** hired-cohort performance feedback → local criterion validity estimates per block/attribute → weight recommendations (always suggested, never auto-applied).

---

## 11. Non-goals & red lines

- **No emotion inference, face analysis, voice-tone scoring, or eye-tracking. Ever.** (EU-prohibited; scientifically bankrupt — R-I.8, R-IV.1.)
- **No fully automated rejection** of any candidate who completed a scored stage; knockouts are rule-based, disclosed, and human-recoverable.
- **No auto-rejection on integrity/AI-detector signals** (false-positive injustice; Art. 22 exposure).
- **No demographic data in any scoring path**; analytics store is one-way separated.
- **No cohort-relative norming that a candidate can't be told about**; scores are rubric-referenced.
- **No dark-pattern proctoring** (hidden monitoring undisclosed to candidates); tier disclosure is mandatory.
- **No lock-in of human judgment:** the human can always override the machine; the machine never overrides the human; both are logged.

---

## 12. Implementation mapping

| Spec area | Exists today | Delta |
|---|---|---|
| Auth (email+password, Google/Microsoft OAuth) | [lib/auth-server.ts](lib/auth-server.ts), [lib/oauth.ts](lib/oauth.ts), SQLite | Reuse; add magic-link candidate sessions (§7) |
| Vacancy create (NL + manual branches) | [components/hr/CreateVacancy.tsx](components/hr/CreateVacancy.tsx) | Becomes Studio entry (§4.1); steps 1–7 are new surfaces |
| Criteria (categories→attributes, weights, focus, threshold preview) | [components/hr/CompetencyBuilder.tsx](components/hr/CompetencyBuilder.tsx) | Extend with KSAO kinds, BARS scales, must-haves, coverage matrix (§4.3) |
| Pipeline blocks | — (candidate flow is hardcoded: check→register→profile→documents→interview→status) | New: Pipeline Composer + block runtimes (§4.4, §7) |
| Interview runtime (AI Q&A, camera, captions, phases) | [app/apply/interview/page.tsx](app/apply/interview/page.tsx) | Generalize into `async_interview` block runtime (§4.4.4) |
| System check | [app/apply/check/page.tsx](app/apply/check/page.tsx) | Retained as journey step (§7.4) |
| Scorecard, drivers, evidence, reasoning, confidence phrases | [lib/types.ts](lib/types.ts), [components/hr/Scorecard.tsx](components/hr/Scorecard.tsx) | Reused as Stage A/B output rendering; add per-block tabs + contradictions (§9.1) |
| Ranking, compare, invitations composer | [components/hr/RankingTable.tsx](components/hr/RankingTable.tsx), [components/hr/Invitations.tsx](components/hr/Invitations.tsx) | Extend to shortlist builder + dispatch batches (§9.3–9.4) |
| Audit (hash-chained), bias, calibration pages | [lib/hash.ts](lib/hash.ts), app/hr/* | Bind to real event stream; add exports (§10) |
| Evaluation engine | Mocked fixtures ([lib/fixtures.ts](lib/fixtures.ts)) | New service per §8; fixtures remain the demo/test harness |
| Cover designer, presets, distribution kit | — | New (§4.6, §5, §6) |

*Suggested build order: object model + Studio steps 1–3 → block runtimes for the existing demo pipeline → Stage A engine on `async_interview` → Stage B + leaderboard binding → dispatch → designer/presets/analytics.*
