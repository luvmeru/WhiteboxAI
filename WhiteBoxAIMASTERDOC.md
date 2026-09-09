**WHITEBOX AI — UNIFIED MASTER DOCUMENT**

**The single source of truth: Product Vision + Visual System + HR Spec + Candidate Spec + Build Sequence**

**Version 1.0 · All documents stitched into one · English**

This is the complete, self-contained specification for **WhiteBox AI — the Explainable AI Hiring Operating System** (the working product, not a landing page). Every prior document is merged here with **zero detail loss**, plus an embedded build sequence for implementation (Claude Code) that does **not** re-describe anything — it only structures the order of construction and links into the exact sections that already hold the precise descriptions.

**HOW TO READ THIS DOCUMENT — Book map**

- **BOOK I — PRODUCT VISION** — soul, positioning, the one differentiator, philosophy, the full design system & tokens, component library, app shell, both product sides at overview level, the explainability/HITL core, motion, and the complete technical + AI + data/compliance stack, roadmap & checklist. *(Parts 0–XIV.)*
- **BOOK II — VISUAL REFERENCE SYSTEM** — per-image analysis of all 27 mood references + the synthesized aesthetic (palette, texture, typography, motif, motion) and how each maps onto the product. The visual DNA behind Book I's tokens.
- **BOOK III — HR SCREEN SPEC** — the recruiter product, screen-by-screen, tab-by-tab, field-by-field, state-by-state (app shell + 13 screens).
- **BOOK IV — CANDIDATE SCREEN SPEC** — the applicant product, same granularity (shell + 7 screens), calm-clarity register.
- **BOOK V — BUILD SEQUENCE & IMPLEMENTATION GUIDE** — the locked stack (forks collapsed to single picks), agent operating rules, phased ticket sequence P0→P4 that **links into Books I–IV** for every spec, the starter scaffold prompt, and the AI prompt-engineering call sequence. Lean by design: sequence + links, never re-description.

**CROSS-REFERENCE LEGEND (used throughout)**

- → Book I · Part X / → Book III · §6 — a pointer to where the precise description lives. Build tickets in Book V use these instead of repeating content.
- [research: X] — a pattern carried from a studied product/article (Ashby, HireVue, Mercor, Greenhouse, Metaview, Linear, Attio, Retool, Vanta, Stripe/Datadog, Amplitude/PostHog, XAI/HITL/reason-codes, data-table/wizard/empty-state pattern libraries).
- [visual: Y] — one of the 27 mood images (batch·index), analyzed in Book II.
- [token: --z] — a design token defined in Book I · Part III.

**LOCKED DECISIONS (the fixed spine — everything else may float in small aspects)**

- **Product, not landing.** A two-sided working application: HR side (dense instrument) + candidate side (calm, reassuring).
- **The one differentiator:** ranked drivers + confidence-as-phrase + evidence chips + collapsible reasoning trace + a mandatory human exit written to an append-only, hash-chained audit log. When any decision is ambiguous, the tie-breaker is: *does this make the reasoning more visible and more contestable?*
- **Theme:** dark base (--void #060608), white-on-top dominant; **invertible white-box panels** (--wb-paper + --wb-ink) = "a white box you can see into," used for explainability / how-it-works / trust moments.
- **Brand object:** the white, transparent, glowing cube — light passes through = explainability in one image.
- **Accent:** iridescent/prism as primary (brand "light"), token-driven and swap-ready to --dune-gold (dusty sand, Dune register) or --ember (burning coal). One warm functional accent for human/action/status; never mix two warms in one element.
- **Elevation = 1px hairlines, not shadows.** Density > whitespace on HR surfaces; generous calm on candidate surfaces.
- **Human-in-the-Loop is mandatory:** the AI structures information; the human decides.

**UPSTREAM RESEARCH (source base, kept separate, not inlined here)**

The two full research conspectuses — the landing-era design research (YC/Sequoia/Plug-and-Play/vibe-coded/award, with URLs & tokens) and the product/application-UI research (competitor product UIs + best-practice apps + explainability/HITL/reason-code patterns, with URLs) — plus the UI-composition & technical addendum, remain as separate reference files. Books I–IV already distill everything relevant from them; consult the raw conspectuses only when you need the original sources/URLs behind a pattern.

-----
**BOOK I — PRODUCT VISION**

**WHITEBOX AI — MASTER PRODUCT VISION DOCUMENT**

**Explainable AI Hiring Operating System · Full Product Architecture, Design System & Technical Execution**

**Version 1.0 · Ститч всех документов воедино (product, not landing page)**

This document unifies everything produced so far into one absolute specification: the two design-research conspectuses (landing-era + product-UI era), the UI-composition & technical addendum, and the 27-image visual-reference analysis — plus the full product context. It describes the **working product**: every screen, tab, panel, state, on both the **HR side** and the **candidate side**, how each small detail is placed and why, the motion system, the design tokens, and the complete technical/AI stack (frameworks, libraries, APIs, open-source to implement, prompt engineering, data model, compliance).

**Nothing is a landing page here.** This is the architecture of the product's appearance + function.

**Philosophy of choices:** this is an instruction, but it is allowed to "float" in the smallest aspects — where a rigid single choice would be premature, 2–3 grounded options/recommendations are given. Everything must be *usable and non-vague*, never hand-wavy.

-----
**TABLE OF CONTENTS**

- **PART 0** — Soul, Positioning, The One Differentiator
- **PART I** — Product Philosophy & The Black-Box Problem
- **PART II** — Aesthetic System (synthesized from 27 references + research)
- **PART III** — Design System & Tokens (color, type, spacing, elevation, texture, iridescent accent + swap options)
- **PART IV** — Component Library (buttons → tables → score cells → the "white box" inverted panel)
- **PART V** — App Shell & Global Patterns (nav, ⌘K, roles, states, notifications)
- **PART VI** — HR-SIDE PRODUCT — every screen & tab, meticulous
- **PART VII** — CANDIDATE-SIDE PRODUCT — every screen & tab, meticulous
- **PART VIII** — The Explainability, Confidence & Human-in-the-Loop System (the core)
- **PART IX** — Motion & Animation System
- **PART X** — Technical Execution (frontend + backend + infra)
- **PART XI** — AI / ML Architecture & Prompt Engineering
- **PART XII** — Data Model, Audit, Security & Compliance
- **PART XIII** — Complete Screen/Flow Inventory Map
- **PART XIV** — Build Priority Roadmap & Production Checklist
-----
**PART 0 — SOUL, POSITIONING, THE ONE DIFFERENTIATOR**

**0.1 Soul statement**

WhiteBox is a **white, transparent box of light in the middle of the market's black opacity.** Where competitors are glitch, noise, and the red anomalies of a hidden decision, WhiteBox is a glowing glass cube through which every layer of evaluation is visible. It does not replace the recruiter — it replaces the opaque algorithmic *black box* with an explainable, controllable, professionally-configurable evaluation system that keeps the human as the final decision-maker.

Three governing words carried through every pixel and every screen:

- **CLARITY** — light passing through; white-on-black; invertible "windows."
- **PRECISION** — topographic maps, HUD markers, graph-paper grids, mono labels, tabular numerals.
- **TRUST** — the human↔machine handshake, halftone × wireframe, a hand-touch layer over the system.

**0.2 Positioning line**

*"Vertical AI, built for fair hiring. Not a faster black box — a white one you can see into."*

Positioned as an **Explainable AI Hiring Operating System**, not an "AI interviewer." The moat is transparency, auditability, per-vacancy configurability, and human-final-decision — not full automation.

**0.3 The one differentiator (design + product must serve this above all)**

Every competitor (Mercor, HireVue, BrightHire, Ashby scorecards) already solved per-competency scoring, blind feedback, rubric-driven interviews, and pre-interview system checks. **None does the one thing WhiteBox exists for:**

- **Ranked drivers** of each score (FICO/VantageScore reason-code model — legally-tested under ECOA/Reg B; the only proven model of explainable adverse-action),
- **Confidence as a phrase**, not a bare number,
- **Evidence chips** tying each score to actual interview fragments,
- a **mandatory human exit** (change / recompute / reject with reason) written to an **append-only, hash-chained audit log**.

This is the single design territory unoccupied in the category. When in doubt about any screen, the tie-breaker is: *does this make the reasoning more visible and more contestable?*

-----
**PART I — PRODUCT PHILOSOPHY & THE BLACK-BOX PROBLEM**

Companies receive hundreds–thousands of applications per role. To cope, they use ATS/AI systems that auto-rank résumés and decide who reaches a human — before the first interview. Most are black boxes: the candidate doesn't know why they were rejected; the recruiter often doesn't know which factors decided it; the models may carry hidden preferences. Research shows different LLMs score identical résumés differently, and humans working alongside biased recommendations tend to unconsciously replicate them rather than correct them — so human presence alone is not enough; transparent explanations and control mechanisms are required. Most tools also over-index on résumé keywords, while leadership, decision-making, stress-resilience, critical thinking, communication, and growth potential are assessed shallowly or not at all.

**WhiteBox's answer, embodied in the product:**

- A **two-sided intelligent HR platform** for the first screening stage.
- Combines modern LLMs, multimodal interview analysis, organizational-psychology methods, automatic document verification, anti-abuse mechanisms against generative-AI misuse, and keeps a full **Human-in-the-Loop**.
- The AI **never** makes the final decision. It *structures information*; the human decides.
-----
**PART II — AESTHETIC SYSTEM (synthesized from 27 references)**

**2.1 Locked direction (from client)**

- **Dark theme** — near-black base.
- **White on top — dominant** (structure, text, lines, objects are white/light-grey).
- **Invertible segments** — individual sections may flip to white with black content inside. This is not merely rhythm: a **white segment is literally "a white box you can see into."** Transparency rendered as layout.
- **Brand metaphor — the WHITE box** (light/clarity/transparency) vs. the market's black boxes.

**2.2 The five aesthetic layers (with weights)**

1. **The White Cube / brand object (30%)** — a white, transparent, glowing cube; light passes through = explainability in one image. It unfolds into layers (= "how the AI reached the score"). Sources: glowing glass cube, "White on White" typographic cube, engraving floating cube, exploded stone cubes.
1. **Topographic / data-map layer (25%)** — contour maps + HUD nodes (dots, crosses, dashed paths) as the background language of "the map of a decision"; competency maps, depth of analysis.
1. **Precision / HUD / line-geometry (20%)** — converging triangles, nested pyramids (tiers), tunnel-of-lines toward light (leads the eye to the decision), graph-paper grid, mono edge-labels ("trust001 / security" language).
1. **Particle / decode / human↔data (15%)** — a person/candidate dissolving into a point-cloud *inside a wireframe box*; glitch→clarity as "the opaque becoming legible"; decode-echo motion.
1. **Human-touch / analog (10%)** — hand-ink flowing lines, voronoi ink sketches, pencil-on-graph-paper; the "trace of the human" over the machine → Human-in-the-Loop.

**2.3 The Trust motif (most on-brand reference)**

The halftone (human) × wireframe (AI) **handshake** with trust001 / security mono labels, radar circles, and a single ember-orange dot = Human-in-the-Loop + trust + audit, in one image. This directly informs the HITL sections, status-label language, and confidence/scan radar visuals.

-----
**PART III — DESIGN SYSTEM & TOKENS**

**3.1 Color — base (dark theme)**

--void            #060608   /\* primary app canvas, near-black, faintly cool  \*/

--void-2          #0A0A0C   /\* secondary canvas / deep sections               \*/

--surface         #0E0E11   /\* cards, panels on dark                          \*/

--surface-2       #141418   /\* raised/hover surface, modals                   \*/

--hairline        rgba(255,255,255,0.06)  /\* borders = elevation primitive    \*/

--hairline-strong rgba(255,255,255,0.12)

--grid-line       rgba(255,255,255,0.03)  /\* graph-paper background grid       \*/

**3.2 Color — text & lines (white-on-black dominant)**

--paper           #FFFFFF   /\* pure white: cube, key structure                \*/

--text-hi         #ECECEE   /\* primary text (bone, not pure white)            \*/

--text-mid        #A6A6AB   /\* secondary text                                 \*/

--text-lo         #6A6A70   /\* captions, muted labels                         \*/

--text-disabled   #3A3A40

--line-strong     #9A9A9E   /\* contour / diagram lines                        \*/

--line-mid        #55555A

--line-soft       #2A2A2E

**3.3 Color — inverted "white box" segments**

--wb-paper        #F4F4F2   /\* white-box background (warm off-white, w/ grain) \*/

--wb-ink          #0A0A0C   /\* content inside the white box                    \*/

--wb-text         #17171A

--wb-hairline     rgba(0,0,0,0.10)

A subtle speckle/concrete grain (from the DAILYMINIMAL references) sits on --wb-paper at ~3–4% so white never reads sterile.

**3.4 Accent system — ONE accent, two roles (+ swap options)**

**Primary accent = IRIDESCENT / PRISM** (refracted light through the transparent cube). This is the client's chosen main direction. It is a *narrow holographic gradient*, used ONLY on product visuals and living/active states — never as UI chrome fill.

--iris-a   #6EE7F0   /\* cyan   \*/

--iris-b   #7B93FF   /\* indigo \*/

--iris-c   #C77BFF   /\* violet \*/

--iris-d   #FF8AD8   /\* magenta\*/

/\* usage: linear/conic gradient across these, low-saturation, thin \*/

--iris-gradient  linear-gradient(120deg,#6EE7F0,#7B93FF,#C77BFF,#FF8AD8)

**Functional accent = a single warm signal** for human/action/status (the ember-orange dot from the handshake ref):

--ember     #FF6A2E   /\* burning-coal ember (option B, client-mentioned)      \*/

--dune-gold #C9A86A   /\* dusty sand-gold, "Dune" register (option C)          \*/

**Swap policy (client-requested flexibility):**

- **Primary stays iridescent** as the brand "light."
- If a warmer, calmer, more enterprise-serious tone is later preferred, **swap the primary to --dune-gold** (dusty sand-gold, Dune register — quieter, premium, less "techy") OR to --ember (hotter, more human/energetic).
- All accent usage must be token-driven (--accent-primary, --accent-action) so a single variable flip re-skins the product. Recommendation: keep **iridescent = brand/light**, and use **ember OR dune-gold = human/action/status**; never mix two warm accents in one element.

**3.5 Color — semantic**

--pos     #46D08A   /\* confirmed / passed threshold / positive driver         \*/

--neg     #E5484D   /\* bias flag / anomaly / negative driver (echo of glitch-red)\*/

--warn    #E8A93B   /\* caution / low-confidence / needs review                \*/

--info    #7B93FF   /\* neutral info (part of iris family)                      \*/

/\* confidence maps: high→--pos, medium→--warn, low→--neg, always w/ icon+label \*/

**3.6 Typography**

- **Display grotesque** (bold, tight tracking) — headings, section titles. Candidates: PP Neue Montreal, TWK Everett, Söhne, Neue Haas Grotesk, or Geist. letter-spacing: -0.02em at large sizes.
- **Wordmark** — thin, wide-tracking, minimal (Dune-poster register) for "WHITEBOX" + a signature glyph (a small open square / cube outline as the "o" or period).
- **Interface / body** — Inter or Geist, weights 400/500/590 (no 700 in-product; hierarchy via size + tracking, not weight — Linear/Stripe lesson).
- **Mono** — JetBrains Mono / Berkeley Mono / Geist Mono for: candidate internal IDs, competition codes, audit timestamps, version tags, HUD edge-labels, status pills. tabular-nums everywhere numbers appear (scores, deltas, funnels).
- **Serif-italic accent** — one word inside a sans headline (the "*limitations*" trick) for emotional/mission moments only.
- **Fluid scale (clamp):**

h1  clamp(32px, 4vw, 56px)   -0.02em

h2  clamp(24px, 3vw, 40px)   -0.015em

h3  clamp(19px, 2vw, 28px)

body-lg 17px / 1.6

body    15px / 1.55

caption 13px / 1.4

mono-label 11–12px UPPERCASE / +0.08em / --text-lo

metric  clamp(28px,3vw,48px) tabular-nums 590

**3.7 Spacing, radii, elevation, density**

- **Base 4px.** Ladder 8 / 12 / 16 / 24 / 40 / 64.
- **Container** max-width for reading sections 1200px; app work-surfaces are full-width fluid with 240–280px sidebar.
- **Radii — a vocabulary of 3–4 only:** 4px (buttons, cells), 8px (inputs, small cards), 12px (cards, panels), 9999px (pills, avatars).
- **Elevation = 1px hairline borders, NOT shadows** (Linear/Vanta/Ramp lesson). Shadows reserved for: floating product mockups, sticky nav, the glowing cube's bloom, modals/popovers.
- **Density > whitespace** on work surfaces (HR are power-users on wide monitors); generous space only on hero/mission/empty states.

**3.8 Texture layers (the "humanity" hierarchy)**

1. Concrete/speckle grain on white surfaces & cube faces (anti-sterility).
1. Halftone/dither for photos (team, candidates) — humanity via dots.
1. Topographic contours as background layer of sections at 5–10% opacity.
1. Fine 1px graph-paper grid under "engineering" sections.
1. Hand-ink, rare, as the "human signature" (HITL / mission).
-----
**PART IV — COMPONENT LIBRARY**

Built on **shadcn/ui (Radix primitives), fully re-themed** to the tokens above. Never ships looking like default shadcn.

- **Buttons.** Primary = filled --surface-2 + 1px --hairline-strong + --text-hi; on hover a thin iridescent border-glow. Never a saturated fill; the accent is *light*, not paint. Secondary = ghost. Destructive = --neg text on transparent. Every primary is paired with an outlined secondary (never a lone CTA). Sizes: sm 32px / md 38px / lg 44px, radius 4px.
- **Inputs / selects / textareas.** --surface, 1px hairline, 8px radius, focus = 1px iridescent ring (box-shadow: 0 0 0 1px iris + faint outer bloom). Mono for code/ID fields.
- **Cards / panels.** --surface, 1px hairline, 12px radius, 20–24px padding. Hover on interactive cards: translateY(-2px), hairline → iris-tinted, corner-bracket L-marks animate in (::before/::after, 0→16px). Corner brackets are a signature HUD detail.
- **The Inverted "White Box" panel (signature).** A section/card that flips to --wb-paper with --wb-ink content, subtle grain, and — key — a thin wireframe/structural motif visible "inside" it (transparent overlapping planes). Used for explainability / "how it works" / trust sections. Semantics: *transparency = a light panel you can see into.* Entering it, a scroll-reveal "opens" it like a lid.
- **Status pills.** Pastel-tinted background + bold mono label + a leading dot; states: DRAFT, LIVE, CLOSED, VERIFIED, PENDING, FLAGGED. All-caps mono, 11px.
- **Data table (candidate ranking / leaderboard).** TanStack Table. Sticky header; pinned first column (candidate internal ID + rank); pagination 25/50/100 (never infinite scroll on a work surface); sortable columns (default: overall score desc); expandable rows (reveal per-competency without leaving); bulk-select with explicit affordances (→ "Move to invited"); **score cells with mini-viz** (a 1-line sparkline or micro-bar + tabular number, colored by threshold); tier badges Top/Mid/Bottom; column customization with a mandatory "reset."
- **KPI tile.** One number (tabular) + trend arrow + %, + optional sparkline; short mono label; tooltip for detail. Used 4–6 across an analytics strip.
- **Radar / spider chart.** For multi-competency candidate profile & side-by-side comparison (from Mercor pattern).
- **Score gauge & confidence badge.** Discrete confidence (High/Med/Low) = color + icon + word, never a bare %; expandable "why this confidence."
- **Evidence chip.** A rounded chip citing an interview fragment; click → anchored popover with the transcript excerpt, timestamp, and 1/N pagination across supporting fragments (Perplexity domain-chip model).
- **Timeline / trace.** Collapsible "Completed N steps" header (collapsed by default) → plain-language step list; for full audit, a LangSmith-style parent/child tree with per-step latency/tokens.
- **Command palette (⌘K).** cmdk; fuzzy search; tabs (Candidates / Vacancies / Actions); shows shortcuts.
- **Empty / loading / error — three states for every container.** Skeletons on tables/cards (not on buttons/toasts); determinate progress for interview & document processing; action-oriented empty states with a single CTA; context-aware by role.
- **Toasts / banners / drawers.** Non-blocking; long tasks (scoring, sending invites) report via toast or a corner drawer.
-----
**PART V — APP SHELL & GLOBAL PATTERNS**

**5.1 Shell layout**

- **Left sidebar 240–280px, collapsible.** Control panel (workspace switch, settings, theme, user) + navigation (Dashboard, Vacancies, Candidates, Analytics, Bias, Calibration, Audit, Settings) + a section for the active vacancy's sub-views. Near-black --void; active item = 1px iris left-marker + --text-hi; muted otherwise.
- **Top bar (thin).** Breadcrumb + global search (/) + ⌘K hint + notifications + role indicator. Sticky, backdrop-blur, 1px bottom hairline.
- **Work surface.** Full-width fluid, dense; graph-paper grid at 3% under some sections; contour texture at 6% behind analytics.
- **Right inspector panel (contextual).** Slides in for record detail / HITL editing / activity log (Attio model). Vertical overlay, inline-editable fields, activity feed.

**5.2 Roles / RBAC (configurable)**

Four base roles, each seeing a different module set & permissions:

- **HR / Recruiter** — full pipeline, scoring review, HITL edits, invites.
- **Department Head** — read + comment + final approve; comparison & analytics.
- **Technical Interviewer** — assigned candidates, technical competencies, scorecards; blind to others' feedback until submitted.
- **Observer** — read-only, no scores, for compliance/audit. Permissions gate visibility of settings, audit, bias dashboard, and candidate PII (revealed only at final stage — see anonymization).

**5.3 Global states & notifications**

Loading (skeleton), Empty (single-CTA, role-aware), Error (retry + support). Toasts for "score recomputed," "invites sent," "documents verified & deleted." A persistent, non-intrusive "AI is processing N interviews" status chip.

-----
**PART VI — HR-SIDE PRODUCT (every screen & tab)**

**6.1 Global Dashboard (single pane of glass)**

- **Top:** KPI strip — Active vacancies · Total candidates · Passed threshold · In invited list · Avg. score · Open bias flags.
- **Center:** vacancy cards (status pill, candidate count, pending actions, mini funnel), sortable.
- **Right/inline:** "Needs your attention" queue (scores awaiting human review, flagged anomalies, calibration divergences).
- **Empty state:** giant "Create your first vacancy" CTA, everything else dimmed.
- **Signature:** the glowing white cube sits quietly in the header as brand anchor; hover → faint prism flash.

**6.2 Create Vacancy — Wizard (branching) + Sectioned mode**

Two entry branches on step 1:

- **(A) Natural-language description.** HR types the role in plain language (e.g., *"Team Lead for a dev team. Leadership, decision-making, communication, conflict resolution, stress-resilience matter most. Experience important, but growth potential is high priority."*). The AI converts this into a full evaluation config: categories, per-category weights, extra competencies, interview type, question depth, required documents, skill-check format, minimum pass thresholds. Rendered as an editable, transparent config (every field shows *why the AI set it* — a mini-explainability moment even here).
- **(B) Manual parameters.** Power-user sectioned form to set every parameter directly (no wizard hand-holding).
- **Wizard mechanics:** segmented progress bar; "Next" disabled until valid; responsive disclosure (advanced fields appear on input); a **Summary-review** step before publish; exit-confirmation modal.
- **On publish:** generate a unique **competition/vacancy code** (mono, copyable); config is versioned; change-history + diff view available thereafter.

**6.3 Competency Builder**

- **Category → Attribute hierarchy** (Greenhouse model): 3–4 categories per vacancy, 5–6 attributes each (skills, traits, qualifications).
- **Focus attributes** grouped at top, iris-highlighted.
- **Weight controls:** sliders / numeric fields per category, **validated to sum to 100%** with live feedback; per-attribute weights within.
- **Threshold controls:** minimum pass score with a live preview of how many current candidates would pass.
- Library of **psychologically-validated questions**, customizable; **auto-generate interview** from the config.
- Progressive disclosure for advanced (question depth, skill-check format, interview type).

**6.4 Vacancy Management**

List/kanban of vacancies (Draft/Live/Closed), competition code, applicant count, config version, quick actions (edit, close, clone). Closed vacancies become read-only (audit pattern).

**6.5 Candidate Ranking / Leaderboard (the core work surface)**

- TanStack data table: sticky header, pinned internal-ID + rank column, pagination, sort by overall score (default).
- **Columns:** rank · internal ID · overall score (cell with micro-bar + tabular number, threshold-colored) · per-competency mini-scores (compact sparkline set) · tier badge (Top/Mid/Bottom) · doc-verification status pill · AI-vs-human divergence flag · integrity-signal indicator (advisory) · actions.
- **Expandable row:** reveals full per-competency breakdown inline.
- **Bulk actions:** multiselect → "Move to invited," "Compare," "Export."
- **Filters/toolbar:** by tier, threshold, competency, verification status, flag.
- Background: contour+HUD map at 6% opacity.

**6.6 Candidate Detail / Scorecard (record page — Attio model)**

Tabs across the top:

1. **Overview** — anonymized profile (until final stage), overall score gauge, tier, radar of competencies, top strengths/weaknesses, quick HITL actions.
1. **Competencies** — each competency as an expandable block: score, **ranked drivers** (top 3–5, plain-language, by impact — FICO reason-code model), **confidence** (High/Med/Low + word + "why"), **evidence chips** (interview fragments), collapsible **reasoning trace** ("Completed N steps").
1. **Interview** — video player + synced transcript; notes structured **per question** (Metaview model); timeline markers; integrity signals surfaced as advisory context (never auto-reject); answer-dynamics timeline.
1. **Documents** — verification results (claim ↔ verified/not), structured extracted info; note that source documents were auto-deleted after verification (only result + structured data retained).
1. **Audit** — full change history for this candidate: every AI score, every human override, reason, approver, timestamp, hash (append-only).
- **Right inspector:** HITL editing (change / recompute / reject + reason — equal visual weight with "accept"), activity log.

**6.7 Comparison View**

Side-by-side of 2–4 candidates: overlaid radar, per-competency deltas, evidence side-by-side, verification status. "Attributes, not gut feelings."

**6.8 Analytics Dashboard**

- KPI strip.
- **Score distribution** histogram (drill-down: click a bin → the candidates in it — Amplitude "Microscope" pattern).
- **Hiring funnel** (ordered, drop-off): code → registration → profile → interview → verification → shortlist → invited. Breakdown by criteria; "largest drop-off / slowest step" insights.
- **Criteria-effectiveness comparison** (which evaluation criteria predict outcomes).
- Each report ships with an inline "how to interpret this" (Ashby pattern).
- High-density mode for wide monitors.

**6.9 Bias Dashboard**

- Score distributions with anomaly warnings.
- Fairness metrics (demographic parity, equalized odds) shown as side-by-side / heatmaps across groups (Fairlearn/Aequitas concepts) — **operating only on data lawfully available and post-hoc**, respecting anonymization.
- Alerts HR to potential systematic bias; every alert links to affected candidates.
- Red (--neg) reserved strictly for anomalies (echo of the glitch-red reference).

**6.10 Calibration (between HR specialists)**

- **Blind feedback:** an interviewer sees others' feedback only after submitting their own (Ashby verbatim pattern) — removes anchoring.
- Consistency metrics across reviewers; divergence view.
- **AI-vs-human divergence = override-rate** as an operational signal (rising → model drift; near-zero on high volume → reviewers not engaged / rubber-stamping).

**6.11 Audit & Versioning**

- Append-only, hash-chained audit log (see Part XII): action ID, timestamp, payload, decision (APPROVED/REJECTED/ESCALATED/OVERRIDDEN), approver ID, reason, hash of previous entry.
- Scoring-model versioning; vacancy-config change history with diff view.
- "Share with auditor" flags at field level (Vanta model) controlling auditor visibility.

**6.12 Final Selection & Invitations**

- One-click move from ranking → invited list.
- Auto-send **personalized invitation emails** (HR-written or AI-generated then edited). Preview + edit before send; explicit "Send" confirmation.
- Integration to schedule next-stage live interviews (Teams/Zoom/Meet).

**6.13 Settings & Integrations**

- Integrations: ATS/HRIS via API; Microsoft Teams / Zoom / Google Meet for live interviews.
- Multi-language interview settings.
- **Local-legislation compliance settings** (per-jurisdiction allowable criteria — e.g., NYC LL144 AEDT audit, Illinois AIVIA consent, GDPR, Kazakhstan data law).
- Roles/permissions management; per-interview report generation config.
-----
**PART VII — CANDIDATE-SIDE PRODUCT (every screen & tab)**

Design ethos here inverts the HR side: **low-stress, frictionless, reassuring, spacious.** Same dark theme + white, but calmer, more generous spacing, the glowing cube present as a calming anchor. Candidate never sees ranking, scores, or others.

**7.1 Code Entry**

Minimal centered screen: enter the **competition/vacancy code** (mono input) → lands directly in the specific vacancy's competition. Calm, spacious, cube-lit.

**7.2 Registration / Login**

Create or sign into an account. Immediately after registration, an **anonymous internal ID** is auto-assigned; from here, all evaluation stages use only this ID and de-identified data. Name, photo, gender, age, and other PII are hidden from both the scoring model and HR until the final stage.

**7.3 Short Profile Form**

Only essentials: experience, education, skills, contacts, links, short bio. Clean, few fields, responsive disclosure. Reassurance copy about anonymization.

**7.4 Pre-Interview System Check (gate)**

Camera / microphone / (optional, consented) screen-share checks. **"Start Interview" is disabled (grayed) until all checks pass** (Mercor model). Clear consent capture. Retake policy shown (e.g., limited retakes; completed steps don't expire).

**7.5 AI Video Interview (the main part)**

- **Not pre-recorded questions.** The AI conducts the interview like a professional recruiter: asks follow-ups, changes direction, checks answer consistency, returns to earlier points, asks for real examples, evaluates depth of argument, adapts difficulty, and builds the interview individually from the candidate's answers. **Each interview is unique;** no universal answer set can be prepared.
- **UI:** candidate video, a calm AI presence (voice + subtle visual, e.g., the cube pulsing as it "listens/thinks"), live captions/transcript optional, a gentle progress indicator, question flow that never feels like a rigid list. Reassuring, human-paced.

**7.6 Anti-AI Integrity (background, advisory only)**

During the interview the system may surface possible signs of external assistance (unusually long delays, constant gaze shifts, window switching, speech-rate mismatch, sudden answer-style changes, second-device detection where user-permitted). These are **only additional information for HR, never grounds for automatic rejection** — reducing false accusations. The candidate is informed transparently that integrity signals are collected.

**7.7 Document Upload & Verification**

If the candidate mentions a diploma, certificates, work experience, or achievements, they can upload supporting documents. The AI extracts information, checks it against claims, and records the verification result. **After verification, the documents themselves are automatically deleted;** only the verification result and structured info are retained.

**7.8 Multimodal Assessment (produced, shown to HR — candidate sees status)**

After the interview, the system builds a comprehensive assessment across dozens of employer-weighted competencies (leadership potential, logical thinking, communication, emotional stability, learning ability, responsibility, initiative, teamwork, motivation, professional knowledge, argumentation, critical thinking, corporate-values fit, decision-making, growth potential). For each, detailed reasoning cites interview fragments. **The AI does not make the final decision — it structures information.**

**7.9 Status / Results**

Candidate sees clear status (submitted / under review / invited to next stage), calm empty/loading states, and — where the employer opts in — a candidate-facing insight report (strengths / growth areas). Personalized invitation email arrives if shortlisted.

-----
**PART VIII — EXPLAINABILITY, CONFIDENCE & HUMAN-IN-THE-LOOP (the core system)**

This is the product's reason to exist; it gets its own cross-cutting spec.

**8.1 Explainability (XAI) rules baked into UI**

1. **Every explanation maps to an action** (change input, escalate, override, appeal). No action → don't show a decoration, improve the decision.
1. **Show the real drivers, ranked.** Top 3–5 by impact, plain-language, "principal reason" first — the FICO/VantageScore reason-code structure (legally-tested under ECOA/Reg B). This is the single legally-proven model of explainable adverse action and the backbone of WhiteBox's compliance story.
1. **Confidence is legible, not decorative.** Never a bare "82/100." Instead: a phrase ("High confidence — consistent evidence across 4 answers"), color + icon + word.
1. **Always provide an exit.** Every score has "this is wrong → change / recompute / reject with reason."
1. **No fake transparency** — never show tidy "factors" the model didn't actually use.

**8.2 Confidence UI**

Discrete High/Med/Low bands, color (--pos/--warn/--neg) + icon + label; expandable "what drives this confidence" (data quality, evidence count, model certainty). Per-competency, not just overall.

**8.3 Evidence & reasoning-trace**

- **Evidence chips** cite interview fragments; layered depth: inline chip → side-panel → full audit tab (Perplexity/scite model).
- **Reasoning trace** collapsed by default ("Completed N steps"), plain-language; full audit view = parent/child tree with per-step data (LangSmith model). This literally *unfolds the white cube's layers*.

**8.4 Human-in-the-Loop**

- **Confirm and override at equal effort/weight**; design the "no" before the "yes." If accepting is one click but overriding takes three screens, override-rate collapses artificially.
- Reject/change **requires a reason** → written to audit log; every override optionally feeds model improvement.
- **Track override-rate** as the AI-vs-human **divergence** signal.
- Avoid rubber-stamping: surface enough context (evidence, confidence, flags) that each decision is meaningful.
- Append-only, hash-chained audit log; log the *reasoning chain*, not just the final number.
-----
**PART IX — MOTION & ANIMATION SYSTEM**

Principle: **motion as narrative** — every movement tells part of the "opaque → clear" story. Respect prefers-reduced-motion (instant, no transitions).

- **Cube unfold** (core) — the white cube opens into layers to reveal per-competency reasoning; used on explainability panels and "how it works." GSAP timeline; on scroll-into-view.
- **Particle assemble** — a point-cloud converges into the cube/figure inside a wireframe box (loading → hero). r3f + custom shader or instanced points; degrade to static render on weak devices.
- **Decode / echo** — object leaves a data-echo trail; glitch→clarity transitions (the market's black-box noise resolving into WhiteBox clarity).
- **Contour drift** — slow background contour-line drift at low opacity.
- **Prism flash** — iridescent shimmer on active/hover of key objects (the accent is *light*).
- **Tunnel pull** — parallax depth toward a light point (leads eye to CTA / decision).
- **Panel-open (white box)** — inverted white segments "open like a lid" on scroll reveal (clip-path), reinforcing "you can see inside."
- **Count-up** — KPIs/scores animate 0→value on viewport entry (tabular).
- **Base scroll animations** — fadeInUp (y:40, 0.6s, power2.out), clip-path reveal, stagger 0.08s; parallax on background layers.
- **Micro-interactions** — corner-bracket L-marks on card hover; iris focus ring; 100–200ms transitions (Linear tempo). Optional custom cursor + magnetic buttons (Cuberto model) for premium feel without WebGL.

Libraries: **GSAP 3 (ScrollTrigger, clip-path reveals)** + **Framer Motion** (React micro) + **Lenis** (smooth scroll on marketing/onboarding surfaces; keep native scroll on dense work surfaces). **react-three-fiber + drei** only for the cube/particle hero, lazy-loaded, with static fallback.

-----
**PART X — TECHNICAL EXECUTION**

Guiding principle: reach Linear/Sierra-grade polish **without** heavy-WebGL performance risk. Take the vibe-coded foundation (Next.js + Tailwind = fast, SEO, conversion) but break the generic look with custom type, brand palette, deliberate motion, and the unifying "white box" concept.

**10.1 Frontend**

- **Framework:** Next.js 15 (App Router) + TypeScript. (Alt: Remix if a more data-loader-centric model is preferred; Next is the default.)
- **Styling:** Tailwind CSS + CSS custom properties (all tokens from Part III). Dark theme default; inverted "white box" via a .wb scope.
- **UI base:** shadcn/ui (Radix), fully re-themed. Icons: Lucide.
- **Tables:** TanStack Table v8 (headless) for ranking/leaderboard; virtualization via TanStack Virtual for large candidate sets.
- **Server state:** TanStack Query. **Client state:** Zustand. Forms: React Hook Form + Zod (schema validation shared with backend).
- **Charts:** Recharts or visx (distributions, funnels); Nivo for radar; or ECharts if very dense dashboards. (Pick one primary — recommend visx for control, Recharts for speed.)
- **Command palette:** cmdk. **Smooth scroll:** Lenis. **Animation:** GSAP + Framer Motion. **3D:** react-three-fiber + drei (cube/particles, optional).
- **Fonts:** next/font (self-host display + mono + body). i18n: next-intl or i18next (multi-language interviews & UI).
- **Video (candidate interview):** WebRTC via **LiveKit** (open-source, self-hostable) — or Daily / Twilio Video / Agora as managed alternatives. Recording via LiveKit Egress or **Mux** for storage/playback. Client-side capture fallback via MediaRecorder.
- **Realtime AI voice interviewer:** OpenAI Realtime API, or a pipeline (STT → LLM → TTS) with **Deepgram/AssemblyAI** (STT) + **ElevenLabs/Cartesia** (TTS). LiveKit Agents framework orchestrates the realtime loop well.
- **Integrity signals (client):** MediaPipe FaceLandmarker / Tasks Vision for gaze/window-focus heuristics — **advisory only**, computed client-side where possible for privacy, surfaced as context.

**10.2 Backend**

- **API:** Python **FastAPI** (best fit for the AI-heavy core) — or Node **NestJS/Fastify** if the team is TS-first. A hybrid is fine: TS BFF + Python AI service.
- **DB:** PostgreSQL (primary). ORM: Prisma or Drizzle (TS) / SQLAlchemy (Py). **pgvector** for embeddings (question similarity, competency matching) — or dedicated **Qdrant/Weaviate** at scale.
- **Cache/queue:** Redis. **Background jobs:** BullMQ (Node) / Celery (Py). **Durable workflows** (interview → transcription → scoring → explainability, multi-step, retryable): **Temporal** (strongly recommended for reliability + auditability of the pipeline).
- **Object storage:** S3 / Cloudflare R2 (video + docs). **Docs auto-deleted** post-verification via lifecycle policy + explicit delete job; only verification result retained.
- **Auth / RBAC / SSO:** WorkOS (enterprise SSO/SCIM) or Clerk/Auth0; RBAC enforced server-side. Roles from Part V.
- **Search:** Postgres FTS or Meilisearch/Typesense for candidate/interview archive search.

**10.3 Infra / DevOps**

- Deploy: Vercel (frontend) + a container host (Fly.io / Render / AWS ECS / GCP Cloud Run) for API + AI services; GPU nodes (or managed inference) for any self-hosted models.
- Observability: OpenTelemetry tracing; Sentry (errors); LLM tracing via **Langfuse** (open-source) or LangSmith.
- IaC: Terraform. CI/CD: GitHub Actions. Feature flags: Statsig/PostHog.
- Data residency: region-pinned storage for GDPR / Kazakhstan compliance.

**10.4 Performance budget**

LCP < 2.5s; CLS 0 (reserve sizes); initial JS < 350KB gz (tree-shake GSAP ~65KB, r3f ~150KB — lazy-load 3D). Skeletons over spinners (measurably better perceived speed). Optimistic UI on score edits; IndexedDB cache for instant re-open of large candidate lists (Linear pattern).

-----
**PART XI — AI / ML ARCHITECTURE & PROMPT ENGINEERING**

**11.1 Models**

- **Core LLM:** Claude (Anthropic) and/or GPT-4-class as primary reasoning models; open models (Llama-class, Qwen) via **vLLM** for self-host / cost / data-residency where required. Route by task (cheap model for extraction, strong model for scoring/reasoning).
- **Embeddings:** OpenAI / Cohere / open (BGE, E5) for question & competency vectors.
- **STT/TTS:** Deepgram/AssemblyAI + ElevenLabs/Cartesia (see 10.1).
- **OCR / doc verification:** AWS Textract / Google Document AI / open **Tesseract**, then LLM cross-check of claims.

**11.2 Orchestration & structured output**

- **Agent orchestration:** LangGraph (stateful, good for the adaptive interview state machine) or a custom finite-state controller. Realtime loop via LiveKit Agents.
- **Structured output:** JSON schema / function calling + **Instructor** or **Outlines** to guarantee typed config, scores, drivers, confidence, evidence spans.
- **Observability/evals:** Langfuse / LangSmith; offline eval sets for scoring consistency & bias regression.
- **Guardrails:** Guardrails AI / NeMo Guardrails for output constraints; cite-or-abstain policy.

**11.3 Prompt-engineering playbook (per feature)**

- **NL → config:** structured extraction with an explicit JSON schema (categories, weights summing to 100, competencies, interview type, depth, docs, thresholds), few-shot examples, and a "rationale" field per setting (feeds the in-UI "why the AI set this").
- **Adaptive interview agent:** system prompt encodes the rubric, follow-up logic, consistency-checking (compare against earlier answers held in state), request-for-examples, difficulty adaptation, and a running JSON interview state. Streaming for natural pacing. Never reveals the rubric to the candidate.
- **Per-competency scoring:** one rubric-anchored prompt per competency; must output {score, ranked\_drivers[3–5], confidence\_band, confidence\_reason, evidence\_spans[]} where evidence\_spans reference exact transcript offsets. **Require evidence or abstain** (anti-hallucination).
- **Ranked drivers (reason codes):** prompt patterned on FICO/VantageScore — principal reason first, specific, plain-language, impact-ordered.
- **Confidence calibration:** self-reported confidence is post-hoc calibrated against held-out agreement data; surfaced as a band, not a raw number.
- **Anti-AI integrity:** signals are heuristic/statistical (timing, gaze, focus, speech-rate); explicitly advisory; never fed as a scoring input.
- **Document verification:** OCR → extract claims → LLM compares claim vs document → {verified: bool, evidence, confidence}; then delete source doc.
- **Invitation email generation:** templated, HR-editable, tone-controlled.
- **Determinism/versioning:** pin model + prompt + rubric versions per vacancy; log all three per score for reproducibility and audit (echoes HireVue's deterministic, versioned model stance).

**11.4 Open-source / existing systems to implement**

- **Fairlearn / Aequitas** — fairness metrics for the Bias Dashboard.
- **Langfuse** — LLM tracing/observability (self-hostable).
- **LiveKit** (+ Agents) — realtime video + AI interviewer loop.
- **Whisper / faster-whisper** — self-host STT option.
- **Instructor / Outlines / Guardrails AI** — structured, guarded outputs.
- **pgvector / Qdrant** — vector search.
- **Temporal** — durable, auditable multi-step pipelines.
- **Docling / Unstructured** — document parsing before verification.
- **OpenTelemetry** — end-to-end tracing (ties into audit).
-----
**PART XII — DATA MODEL, AUDIT, SECURITY & COMPLIANCE**

**12.1 Core entities (sketch)**

Organization · User(role) · Vacancy(config\_version, competition\_code) · CompetencyConfig(category→attribute, weights, thresholds) · Candidate(internal\_id, pii\_vault\_ref) · Application · Interview(transcript, video\_ref, state) · CompetencyScore(score, drivers[], confidence, evidence\_spans[], model\_ver, prompt\_ver) · DocumentVerification(result, structured\_data) [source deleted] · HumanDecision(action, reason, approver, timestamp) · AuditEntry(append\_only, prev\_hash) · BiasMetric · IntegritySignal(advisory).

**12.2 Anonymization**

PII stored in a separate vault, referenced by token; scoring model and HR views receive only the internal\_id + de-identified data until the final stage. Reveal is a logged, permissioned action.

**12.3 Audit log**

Append-only, hash-chained (each entry hashes the previous → tamper-evident). Fields: action ID, timestamp, payload, decision (APPROVED/REJECTED/ESCALATED/OVERRIDDEN), approver ID, reason, model/prompt/rubric versions, prev-hash. Logs the reasoning chain, not just outcomes. "Share with auditor" field-level flags.

**12.4 Security & compliance**

- SOC 2 posture; RBAC; SSO/SCIM; encryption at rest/in transit; region-pinned data.
- Consent-first candidate experience; explicit disclosure of AI use and integrity-signal collection.
- **Hiring is a high-risk use under the EU AI Act (Annex III)** → conformity, logging, human oversight, transparency obligations; design already satisfies human-oversight + logging. Also: NYC LL144 (AEDT bias audit — consider a named independent auditor like BABL AI, as BrightHire did), Illinois AIVIA (video-interview consent), GDPR, Kazakhstan personal-data law. Compliance settings are per-jurisdiction and configurable.
- Model/prompt versioning + reproducibility for adverse-action defensibility.

*(Compliance specifics must be validated with counsel per deployment jurisdiction; this spec provides the technical scaffolding, not legal advice.)*

-----
**PART XIII — COMPLETE SCREEN / FLOW INVENTORY MAP**

**HR side:** Login/Workspace · Global Dashboard · Create Vacancy (Wizard NL + Manual) · Competency Builder · Question Library · Vacancy Management · Candidate Ranking/Leaderboard · Candidate Detail (Overview / Competencies / Interview / Documents / Audit) · Explainability panel · HITL inspector · Comparison · Analytics (distribution + funnel + criteria-effectiveness) · Bias Dashboard · Calibration · Divergence view · Audit & Versioning · Roles/Permissions · Final Selection · Invitation composer · Settings/Integrations.

**Candidate side:** Code Entry · Register/Login · Profile Form (+ anonymization) · Pre-Interview System Check (gate) · AI Video Interview · Anti-AI Integrity (background) · Document Upload & Verification · Multimodal Assessment (produced) · Status/Results (+ optional insight report) · Invitation received.

**Global:** App shell (sidebar + ⌘K + top bar + inspector) · Empty/Loading/Error states · Notifications/Toasts · Theme (dark default, inverted white-box segments) · Role-based views.

-----
**PART XIV — BUILD PRIORITY ROADMAP & PRODUCTION CHECKLIST**

**14.1 Priority order**

- **P0 — Foundation:** design tokens + Tailwind theme; app shell (sidebar, ⌘K, top bar); auth/RBAC; three states baked in; Postgres schema + audit skeleton; the inverted "white-box" panel primitive.
- **P1 — Core differentiator:** candidate scorecard record page; explainability stack (ranked drivers + confidence-as-phrase + evidence chips + reasoning trace); HITL with equal-weight confirm/override + reason + append-only audit; ranking table.
- **P2 — Two-sided flows:** candidate code→register→profile→system-check gate→AI video interview→doc verification; vacancy creation (NL→config wizard + manual) + competency builder.
- **P3 — Analytics & governance:** analytics (distribution + funnel), bias dashboard, calibration/divergence, versioning, integrations (ATS/HRIS, Teams/Zoom/Meet), invitations, multi-language, compliance settings.
- **P4 — Polish:** cube/particle hero (r3f, with fallback), motion system, custom cursor, prism/decode transitions.

**14.2 Decision thresholds that should change the plan**

- If override-rate → 0 on high volume → HITL became a rubber stamp; add context to the review panel or stop pre-selecting the AI recommendation as default.
- If users can't name the top-3 drivers of a score in usability testing → the explainability panel failed; return to ranked drivers.
- If confidence ever ships as a bare number → rewrite as a phrase.
- If the product looks indistinguishable from Mercor/HireVue on prototype → push harder on the explainability visuals (the only unoccupied design territory).
- If enterprise-serious tone is preferred over "techy" → flip --accent-primary from iridescent to --dune-gold.

**14.3 Assets & pre-build checklist**

- [ ] Final font licenses (display + mono + body).
- [ ] White-cube 3D asset (GLB, Draco-compressed <2MB) + static high-res fallback render.
- [ ] Token file finalized (palette, type scale, radii 3–4, spacing ladder, elevation = borders).
- [ ] Motion curves defined *before* layout (Zentry lesson).
- [ ] Rubric library + validated question bank.
- [ ] Compliance matrix per launch jurisdiction (validated with counsel).
- [ ] Eval sets for scoring consistency + bias regression.
- [ ] Lighthouse ≥ 90 (perf/a11y); WCAG AA contrast; reduced-motion path; cross-browser + Safari WebGL check.
-----
**APPENDIX — SOURCE DOCUMENTS STITCHED HERE**

1. Landing-era design research conspectus (YC/Sequoia/Plug-and-Play/vibe-coded/award — palette & type tokens, patterns).
1. UI-composition & technical addendum (Parts 7–8: placement + stack synthesis).
1. Product/Application-UI research conspectus (Ashby, BrightHire, HireVue, Mercor, Greenhouse, Metaview; Linear, Attio, Retool, Vanta, Stripe/Datadog, Amplitude; explainability/confidence/HITL/reason-codes; tables/wizards/empty-states; cross-cutting pattern lists; HR + candidate screen map).
1. 27-image visual-reference analysis (the white-cube brand object, topographic/HUD data language, particle/decode, human-touch, trust handshake; dark-theme + white-on-top + invertible white-box segments; iridescent accent + dune-gold/ember swap options).
1. Full product context (WhiteBox feature spec — both sides).

**Caveat:** design tokens (hex, type) are grounded proposals synthesized from reverse-engineered references and the mood set; finalize pixel-exact against live products and brand tests. Technical/library choices intentionally offer 2–3 options where a rigid pick would be premature — all listed options are viable; pick per team skill and data-residency needs. Compliance scaffolding is technical, not legal advice.

-----
**BOOK II — VISUAL REFERENCE SYSTEM**

**WHITEBOX AI — АНАЛИЗ ВИЗУАЛЬНЫХ РЕФЕРЕНСОВ (27 изображений)**

**Разбор стиля / вайба / узоров / приёмов + синтез единой эстетики**

**Зафиксированные решения (от заказчика):**

- **Тема сайта — ЧЁРНАЯ** (near-black база).
- **Белое поверх — доминанта** (структура, текст, линии, объекты — белые/светло-серые).
- **Инвертируемые сегменты** — отдельные секции можно делать белыми, а контент внутри них чёрным. Это не просто ритм: **белый сегмент = буквально «белый ящик, в который видно»** → прозрачность как приём вёрстки.
- **Метафора бренда — БЕЛЫЙ ящик** (свет/ясность/прозрачность) против «чёрных ящиков» рынка (непрозрачность).

**Метод:** каждое из 27 изображений разобрано отдельно (что это, техника, вайб, узор) и помечено → где применяется. Нумерация: [П1·N] = партия 1, изображение N. В конце — синтез в единую систему (палитра/текстура/типографика/мотив/моушен) и раскладка на продукт.

-----
**ЧАСТЬ 1 — ПОКАДРОВЫЙ РАЗБОР**

**Семья A — БЕЛЫЙ ЯЩИК / КУБ (ядро бренда)**

**[П1·6] Гравюрный парящий куб в горной долине.** Стиль: старинная гравюра (Доре-эстетика), штриховка, левитирующий геометрически-идеальный куб посреди «природного хаоса». Вайб: артефакт, «идеальный объект среди дикого». Узор: cross-hatch штрих + перспектива долины. → Концепт hero-объекта: белый куб как «наведённый порядок в хаосе тысяч заявок». Human-touch-гравюра как контрапункт цифре.

**[П1·7] Взорванные каменные/мраморные кубы, изометрия.** Стиль: isometric exploded-view, зернистая noise-текстура, B&W мрамор. Вайб: «разбор на слои», конструкция/деконструкция. Узор: grain/speckle на гранях, ступенчатая изо-раскладка. → Анимация «раскрытия ящика»: куб разбирается на слои-грани → показывает, что внутри (explainability). Зерно = материальность, не стерильность.

**[П2·6] Зернистые кубы, выпадающие из чёрного ромба.** Стиль: минимал, чёрный ромб-квадрат сверху → мелкие grain-кубы «высыпаются» вниз. Вайб: «из чёрного ящика выходит прозрачность/множество». Узор: speckle-grain на белых гранях. → Прямая иллюстрация тезиса: из чёрного (непрозрачного) рождаются считываемые единицы (кандидаты/оценки). Loading / раздел «как это работает».

**[П2·7] «White on White» — типографический 3D-куб (постер Suppos).** Стиль: swiss/international, огромный grotesque, куб собран из слов «White / on / White», ч/б грани. Вайб: дерзкий, дизайнерский, ясность как манифест. Узор: типографика ПО граням куба (текст как объём). → Логотип-концепт и приём: **имя бренда живёт на гранях куба**; «white on white» = буквальный вижуал-девиз. Инвертируемые панели растут отсюда.

**[П2·8] Светящийся стеклянный/хрустальный белый куб на чёрном.** Стиль: студийный render, мягкие блики, полупрозрачное стекло, near-black фон. Вайб: премиальный, чистый, «драгоценность/призма». Узор: световые рёбра, внутреннее свечение. → **Главный hero-объект.** Белый прозрачный куб, светящийся изнутри = «прозрачный ИИ». Свет проходит насквозь — это и есть explainability одним объектом.

**[П1·4] Иридесцентный стеклянный кейкап «esc.» на чёрном.** Стиль: 3D-render, хроматическая аберрация (радужные переливы), near-black. Вайб: технологичный, тактильный, «единственный цвет = преломлённый свет». Узор: prism/holographic на прозрачной грани. → **Источник акцентной палитры:** единственный хроматический момент = иридесцентное преломление (свет сквозь прозрачный куб). Микро-объект «esc.» = отсылка к keyboard-first продукту (⌘K).

**Семья B — ТОПОГРАФИКА / КАРТА ДАННЫХ (фоновый язык)**

**[П2·3] Контурные линии, тёмные, средней плотности.** Стиль: topographic contour map, белые линии на чёрном, органические «острова». Вайб: «карта глубины/рельефа». Узор: вложенные замкнутые контуры. → Фоновый слой секций (opacity 5–10%): «карта решения», слои оценки.

**[П2·4] Контуры, тёмные, высокой плотности.** Стиль: то же, но плотнее, с серыми заливками между линий → почти древесный срез. Вайб: глубина, «годовые кольца» анализа. Узор: очень плотные вложенные линии. → Текстура для «глубоких» разделов (multimodal assessment, где десятки слоёв).

**[П2·5] Контурная карта + HUD-точки/крестики/пунктиры.** Стиль: contour + навигационные маркеры (dots, +, dashed paths), звёздная разметка. Вайб: precision, «навигационная карта», разведка. Узор: контуры + точки-узлы + пунктирные трассы. → **Ключевой референс:** фон для аналитики/карты компетенций. Точки = кандидаты/сигналы, пунктиры = связи. Прямо в HUD-язык продукта.

**[П1·5] Скалы + вертикальные линии-потоки + топо-рябь + мрамор.** Стиль: коллаж природной фактуры и цифровых линий, B&W, мрамор снизу. Вайб: «природа встречает данные». Узор: вертикальные штрихи (сигнал), концентрическая рябь (волна), мраморные прожилки. → Переходы между секциями; «сигнал» как вертикальные линии; рябь = резонанс/распространение оценки.

**[П2·2] Рукописные белые контур-линии-потоки на чёрном (дата 2016.11.10).** Стиль: hand-drawn, тонкие белые органические линии, «дым/поток», подпись-дата. Вайб: human-touch, поэтичный, живой. Узор: перо, разветвляющийся поток. → Human-in-the-Loop слой: рукотворные линии как «след человека» поверх машинных контуров.

**Семья C — PARTICLE / DISSOLVE / ДЕКОДИРОВАНИЕ (человек ↔ данные)**

**[П1·1] Глитч-лицо, распадающееся в круги + потоки данных, красные вкрапления.** Стиль: datamosh/glitch, B&W, фрагментация в круглые маски, красные пиксели. Вайб: «чёрный ящик» тревожно-непрозрачен, шум. Узор: glitch-полосы, круговые вырезы. → **Problem-состояние:** так выглядит непрозрачность конкурентов (шум, красные аномалии = bias). Контраст к чистому белому кубу.

**[П1·10] Камень, распадающийся в data-эхо, «you are what you think».** Стиль: object + motion-echo (повторяющиеся смещённые копии), B&W на чёрном, мелкий serif/label. Вайб: мысль→форма, декодирование. Узор: echo-trail, «размножение» силуэта. → Motion-приём «декодирования»: объект оставляет data-шлейф. Для интро/переходов.

**[П2·9] Particle-облако в тонком wireframe-боксе, человек→точки, иридесцентная вспышка, HUD-моно-лейблы.** Стиль: point-cloud, тонкий каркасный параллелепипед, dot-матрицы и моно-текст по краям, один цветной проблеск. Вайб: «сущность внутри прозрачного ящика», научный постер. Узор: particles + wireframe-рамка + мелкая HUD-типографика. → **Эталон hero-визуализации:** кандидат = облако точек ВНУТРИ белого/каркасного ящика; по краям — моно-лейблы (ID, метрики). Ровно один иридесцентный акцент.

**[П3·4] «ASCII MOTION — CODE MEETS MOVEMENT».** Стиль: ASCII-арт, фигура собрана из символов на чёрном, моно-типографика. Вайб: retro-tech, «код становится формой». Узор: character-grid dissolve. → Опциональный retro-слой (loading/ambient): «код оценивает, но остаётся читаемым». Дозировка малая.

**[П3·5] Halftone-рука с светящимся шаром, распад в частицы, «Create with no limitations».** Стиль: dither/halftone (точки разного размера), B&W, sans+serif-микс в подписи. Вайб: «созидание/потенциал», чистый, современный. Узор: halftone-градиент, particle-распад по краям. → Human-touch halftone для фото (команда/кандидаты); приём «объект держит свет» = потенциал. Типографика: sans-заголовок + serif-italic на одном слове.

**Семья D — ЛИНИЯ / ГЕОМЕТРИЯ / HUD / МОУШЕН (precision)**

**[П1·8] Наложенные тонкие треугольники, сходящиеся к яркой точке.** Стиль: минимал line-geometry, near-black, серые→белый градиент линий, Penrose-намёк. Вайб: концентрация, «схождение к решению». Узор: вложенные контуры с общей вершиной. → Лого-паттерн / иконки; «схождение к финальному решению» (human decision point).

**[П3·1] DAILYMINIMAL №547 — вложенная пирамида/треугольники, градиент тёмный→светлый, бетон-текстура.** Стиль: минимал, слоёная пирамида, concrete-speckle, крошечный моно-caption («NO.547 · SERIE 2»). Вайб: спокойный, системный, «слои/уровни». Узор: nested layers + грануляция. → Визуализация «уровней/порогов» (tiers Top/Mid/Bottom); стиль caption-подписей (моно, номер, серия).

**[П3·2] Постер «RAGE… DYING OF THE LIGHT» — концентрические арки-тоннель к светящейся точке.** Стиль: line-art тоннель (арки из линий) уходящий к свету, near-black, тонкая типографика по краям + внизу. Вайб: кинематографично, глубина, «свет в конце». Узор: концентрические арки-перспектива. → **Сильный композиционный приём:** тоннель линий, ведущий взгляд к белому кубу/CTA. Свет-точка = «ясность». Тонкая рамочная типографика по краям (моно-лейблы слева/справа/сверху).

**[П3·7] DAILYMINIMAL №639 — вертикальные пластины в перспективе, бетон-текстура, «раскрытие».** Стиль: минимал, ряд white-пластин, разворачивающихся в перспективе, speckle. Вайб: «разворачивание/раскрытие по шагам». Узор: последовательные панели, motion-намёк. → Motion-паттерн для How-it-works: панели-шаги раскрываются последовательно; ступенчатое появление.

**[П2·1] Архитектурный wireframe: прозрачные пересекающиеся плоскости на белом.** Стиль: 3D-wireframe/архитектурный рендер, полупрозрачные грани, светлый фон. Вайб: «просвечиваемая структура», ясность конструкции. Узор: overlapping transparent planes, тонкие рёбра. → **Для инвертированных БЕЛЫХ сегментов:** структура, которую видно насквозь = explainability. Прямая иллюстрация «белого ящика».

**Семья E — HUMAN-TOUCH / РУЧНОЕ (анти-AI контрапункт)**

**[П1·2] Архитектурный туш-скетч, искажённая перспектива (башня/собор).** Стиль: ink + wash, экспрессивная штриховка, fish-eye перспектива, тёплый серый. Вайб: живое, рукотворное, «взгляд человека». Узор: скетч-линии, перспективные лучи. → Human-in-the-Loop слой; «человеческий взгляд» как ценность. Тёплый серый как опциональный второй регистр.

**[П2·10] Туш-скетч клеточной/воронои-структуры.** Стиль: hand-drawn ink, органическая сетка ячеек, cross-hatch. Вайб: «структура, нарисованная рукой», органика+система. Узор: voronoi-ячейки, штрих внутри. → Мотив «сети компетенций/связей», но human-drawn; для разделов о методологии.

**[П3·6] Плотный карандашный wireframe на миллиметровке, вертикальная композиция.** Стиль: pencil на grid-бумаге, взрыв перспективных линий в рамке, B&W. Вайб: «инженерный чертёж/конструирование». Узор: perspective-explosion + видимая сетка-миллиметровка. → **Grid как видимый слой** (миллиметровка = precision-фон); «конструирование оценки». Приём: тонкая сетка 1px под контентом.

**Семья F — КИНЕМАТОГРАФИЧНЫЙ МИНИМАЛИЗМ / DUNE (тёплый регистр, mood)**

**[П1·3] Dune-render: дюны + тёмная архитектурная пустота, тауп, отражающая вода.** Стиль: minimalist 3D, огромные плоскости, warm sand/taupe + near-black, зеркальный пол. Вайб: монументально, спокойно, много воздуха. Узор: резкий диагональный раздел свет/тьма. → Референс «воздуха» и монументальности hero; тёплый тауп как опциональный акцент-регистр. Диагональный раздел света/тьмы.

**[П1·9] Постер «DUNE»: фигура в плаще, гигантская изогнутая структура, тонкий wordmark.** Стиль: кинематографичный, warm desert, тонкий futuristic wordmark «DUNE» с точкой-глифом. Вайб: эпично, сдержанно, «масштаб и одиночество». Узор: тонкая моно-строка сверху, wordmark по центру. → **Тип wordmark:** тонкий, широкий трекинг, минималистичный глиф. Приём «масштаб через пустоту». Тонкая строка-эпиграф сверху.

**Семья G — TRUST / РУКОПОЖАТИЕ (явная тема бренда)**

**[П3·3] Halftone-рукопожатие + wireframe-рука, «trust001», «security», HUD-круги/радар, оранжевая точка.** Стиль: коллаж halftone (человеческое) + wireframe (цифровое) руки, near-black, моно-лейблы («trust001», «security», координаты), radar-круги, ОДИН оранжевый акцент-dot. Вайб: **доверие человек↔машина**, security, аудит. Узор: halftone × wireframe, концентрические радары, HUD-подписи. → **Самый «на-бренд» референс.** Человек (halftone) + ИИ (wireframe) в рукопожатии = Human-in-the-Loop + trust. Оранжевая точка = альтернативный акцент (trust/active). Моно-лейблы «trust001/security» = язык статусов/аудита. Radar-круги = confidence/scan.

-----
**ЧАСТЬ 2 — СИНТЕЗ: ЕДИНАЯ ЭСТЕТИКА (из 27)**

**2.1 Soul statement**

WhiteBox — **белый прозрачный ящик света посреди чёрной непрозрачности рынка.** Там, где конкуренты — глитч, шум и красные аномалии скрытого решения ([П1·1]), WhiteBox — стеклянный светящийся куб, сквозь который видно каждый слой оценки ([П2·8], [П2·1]). Три управляющих слова:

- **CLARITY** — прозрачность, свет насквозь, белое на чёрном, инвертируемые «окна».
- **PRECISION** — топо-карты, HUD-разметка, миллиметровка, моно-лейблы.
- **TRUST** — рукопожатие человек↔машина, halftone×wireframe, human-touch поверх системы.

**2.2 Палитра (следствие темы: чёрная база, белое поверх)**

- **Void #050506–#0A0A0C** — primary canvas (near-black, чуть тёплый/нейтральный).
- **Ink-panel #0E0E10** — surface карточек на тёмном.
- **Белые/серые:** Paper #FFFFFF (структура, кубы), Bone #ECECEE (основной текст), серая шкала линий #9A9A9E → #55555A → #2A2A2E (контуры/бордеры, muted).
- **Инвертированные сегменты:** White #F4F4F2 фон + Ink #0A0A0C контент внутри (буквальный «белый ящик»). Лёгкая speckle/grain-текстура на белом (из DAILYMINIMAL) — чтобы белое не было стерильным.
- **Акцент — ОДИН, в двух возможных прочтениях:** 
  - **Iridescent/prism** ([П1·4], [П2·9]) — преломлённый свет сквозь прозрачный куб. Для «живых» моментов: hero-объект, active-состояния, confidence-подсветка. Реализуется как узкий holographic-градиент (cyan→violet→magenta) ТОЛЬКО на продуктовых визуалах, не в UI-хроме.
  - **Ember/orange #FF6A2E** ([П3·3]) — trust/human/active dot. Для статусов, human-in-the-loop маркеров, «точки решения».
  - *Рекомендация: iridescent — фирменный «свет», orange — функциональный «человек/действие». Не смешивать в одном элементе.*
- **Красный #E5484D** — ТОЛЬКО для bias/anomaly/a' (эхо красных вкраплений [П1·1]), негативные сигналы. Не декоративно.
- **Тёплый тауп/песок** ([П1·3], [П1·9]) — опциональный второй регистр для «человечных»/mission-разделов. Осторожно, вторично.

**2.3 Текстуры (иерархия «человечности»)**

1. **Concrete/speckle grain** (DAILYMINIMAL [П3·1],[П3·7], кубы [П1·7],[П2·6]) — на белых поверхностях и гранях куба. Анти-стерильность.
1. **Halftone/dither** ([П3·3],[П3·5]) — для фото (команда/кандидаты), «человеческое» через точки.
1. **Topographic contours** ([П2·3–5],[П1·5]) — фоновый data-слой секций, opacity 5–10%.
1. **Fine grid / миллиметровка** ([П3·6]) — тонкая сетка 1px под «инженерными» разделами.
1. **Hand-ink** ([П1·2],[П2·2],[П2·10]) — рукотворный слой для HITL/mission, точечно.

Дозировка: grain и contours — часто; halftone — на фото; ink — редко, как «подпись человека».

**2.4 Типографика (из постеров)**

- **Display grotesque** (жирный, tight tracking — «White on White» [П2·7], «Create with no…» [П3·5]) для заголовков.
- **Тонкий wide-tracking wordmark** (Dune [П1·9]) — для логотипа WHITEBOX и крупных «воздушных» заголовков.
- **Serif-italic на одном слове** ([П3·5] «*limitations*») — приём акцента внутри sans-заголовка.
- **Mono uppercase micro-labels** ([П3·3] «trust001/security», DAILYMINIMAL «NO.547·SERIE 2», HUD-координаты [П2·5],[П2·9]) — для системных лейблов, ID, статусов, аудита, номеров версий. **Это язык «рабочей составляющей».**
- Приём **рамочной типографики по краям** ([П3·2],[П2·9]): мелкие моно-строки слева/справа/сверху секции = «приборная панель».

**2.5 Сигнатурный объект и мотивы**

- **Белый прозрачный куб** ([П2·8],[П2·7],[П1·6]) — hero-объект + логотип; свет проходит насквозь = explainability одним образом.
- **Раскрытие куба на слои** ([П1·7],[П2·6]) — анимация «как ИИ пришёл к оценке».
- **Particle-облако в каркасном боксе** ([П2·9]) — кандидат = данные внутри прозрачного ящика.
- **Тоннель линий к свету** ([П3·2]) — композиция, ведущая к CTA/решению.
- **Halftone×wireframe рукопожатие** ([П3·3]) — human-in-the-loop + trust.
- **Топо-карта с HUD-узлами** ([П2·5]) — карта компетенций/кандидатов.

**2.6 Моушен (следствие изображений)**

- **Decode/echo** ([П1·10],[П1·1]) — объект оставляет data-шлейф; глитч→чистота как «непрозрачное становится ясным».
- **Cube unfold** ([П1·7],[П3·7]) — куб/панели раскрываются по слоям и по шагам.
- **Particle assemble** ([П2·9]) — точки собираются в фигуру/куб (loading → hero).
- **Contour drift** ([П2·3–5]) — медленный дрейф контурных линий на фоне.
- **Prism flash** ([П1·4]) — иридесцентный проблеск на active/hover.
- **Tunnel pull** ([П3·2]) — параллакс-глубина к светящейся точке.
-----
**ЧАСТЬ 3 — РАСКЛАДКА НА ПРОДУКТ (рабочая составляющая)**

Напоминание: это ПРОДУКТ (working app), не лендинг. Арт-слой сверху, плотная механика (из product-UI ресёрча: Linear/Attio/explainability) снизу. Ниже — где живёт каждый мотив.

- **App-shell (тёмный):** near-black #0A0A0C, sidebar + ⌘K, muted-серые линии-бордеры (Linear-логика). Моно-лейблы для ID/кодов/timestamps ([П3·3],[П2·9] язык).
- **Hero/dashboard-заставка:** белый прозрачный куб [П2·8] или particle-box [П2·9]; тонкая рамочная моно-типографика по краям.
- **Инвертированные БЕЛЫЕ сегменты** = «белые ящики»: разделы explainability/«как это работает» на белом фоне #F4F4F2 со speckle, контент чёрный, структура-wireframe видна насквозь ([П2·1]). Приём прямой: прозрачность = светлая панель, в которую видно.
- **Ranking / аналитика:** фон — топо-карта с HUD-узлами ([П2·5]) на 6% opacity; данные белые, tabular numerals; tiers как слоёная пирамида ([П3·1]).
- **Explainability-панель:** «раскрытие куба на слои» ([П1·7]) как метафора; confidence — iridescent-подсветка ([П1·4]), ranked drivers на чётком белом.
- **Human-in-the-Loop:** halftone×wireframe рукопожатие [П3·3] как раздел/иконка; ember-orange dot для «точки решения человека»; hand-ink [П2·2] для «следа человека».
- **Bias/anomaly:** красный #E5484D (эхо [П1·1]), только для аномалий.
- **Loading:** particle-assemble → куб ([П2·9]→[П2·8]); опционально ASCII-motion ([П3·4]), дозированно.
- **Переходы:** decode-echo ([П1·10]), tunnel-pull к CTA ([П3·2]), cube-unfold по шагам ([П3·7]).
-----
**КАВЕАТЫ**

- Это **вижуал-mood анализ** (что на картинках + как применить), не финальный дизайн-спек и не токены-в-пиксель. Точные hex — предложение по вайбу, финализируются на этапе дизайн-системы.
- Иридесцентный и оранжевый акценты — **альтернативы, выбрать один как primary** (рекомендация: iridescent = «свет/бренд», orange = «человек/действие»; можно оба, но с чёткими ролями).
- Тёплый тауп/Dune-регистр — вторичен; при перегрузе уводит от «precision-инструмента». Держать для mission/human-разделов.
- Часть изображений — постеры/арт (вертикальные, декоративные); переносить в ПРОДУКТ нужно их **вайб и мотив**, а не буквальную композицию — рабочие экраны требуют плотности и функции (см. product-UI ресёрч).
- Синтез опирается на 27 загруженных изображений и ранее зафиксированную тему (чёрная база, белое поверх, инвертируемые сегменты).
-----
**BOOK III — HR SCREEN SPEC**

**WHITEBOX AI — HR-SIDE DETAILED SCREEN SPEC**

**Companion to the Master Product Vision · Screen-by-screen, tab-by-tab, field-by-field, state-by-state**

**Version 1.0 · HR side (the recruiter/employer product)**

This is the exhaustive layer under Part VI of the Master doc. Every screen gets a consistent template: **Purpose · Route/entry · Layout & regions (with dimensions) · Every element top→bottom / left→right · All states (default / hover / loading / empty / error / disabled / role-variants) · Interactions & shortcuts · Data & API deps · Source (research pattern) · Visual ref · Tokens applied.**

**Reading the refs.** [research: X] = pattern carried from a studied product/article. [visual: Y] = one of the 27 mood images (batch·index). [token: --z] = from Master Part III. Options are given where a rigid pick is premature; everything is concrete, never vague.

**Global theme:** dark (--void #060608), white-on-top dominant; **inverted white-box panels** (--wb-paper #F4F4F2 + --wb-ink) used for explainability/"how it works"/trust. Accent = **iridescent** (--iris-gradient), swap-ready to --dune-gold/--ember. Elevation = 1px hairlines, not shadows. Density > whitespace on work surfaces. Respect prefers-reduced-motion.

-----
**0 · HR APP SHELL (chrome that frames every HR screen)**

**0.1 Left Sidebar — 264px (collapsible to 64px icon-rail)**

Region: fixed left, full height, --void, right edge 1px --hairline. Three stacked zones (Attio model) [research: Attio sidebar].

**Zone 1 — Control (top, 56px):** workspace switcher (org logo + name + chevron → dropdown of orgs), and a collapse toggle (« ) on the far right. Mono workspace label 12px --text-mid.

**Zone 2 — Primary nav (scrollable):** vertical list, 40px rows, 16px left pad, Lucide icon (18px) + label (14px --text-mid). Items in order: **Dashboard · Vacancies · Candidates · Analytics · Bias · Calibration · Audit**. Active item: 2px iris left-marker (--iris-gradient vertical bar), label→--text-hi, faint --surface row bg. Hover: row bg rgba(255,255,255,0.03), label→--text-hi, 150ms. Badge counts (e.g., "Needs review · 12") right-aligned as a mono pill.

**Zone 3 — Contextual (appears when inside a vacancy):** section label "THIS VACANCY" (11px mono uppercase --text-lo), then sub-nav: Ranking · Detail · Compare · Analytics · Config · Invitations. Indented 8px.

**Bottom (pinned):** Settings (gear) + user avatar (32px, 9999px radius, 1px --hairline) + role chip (mono, e.g., HR). Click avatar → menu (profile, theme, sign out).

**Collapsed state (64px):** icons only, labels as hover-tooltips; active iris-marker persists. Transition width 200ms.

**Role variants:** Observer hides Bias/Calibration/Audit-edit; Technical Interviewer sees only assigned vacancies in Vacancies.

**0.2 Top Bar — 52px, sticky, backdrop-blur, 1px bottom --hairline**

Left→right: **breadcrumb** (Workspace › Vacancy › Screen, 13px, separators --text-lo) · **global search** input (/ focus, 320px, --surface, 8px radius, magnifier icon, placeholder "Search candidates, vacancies…") · spacer · **⌘K hint chip** (mono "⌘K", --surface, 4px radius) · **notifications bell** (dot when unread, --ember dot) · **"AI processing N interviews" status chip** (mono, animated iris dot when active) · **Help (?)**.

**0.3 Command Palette (⌘K / Ctrl+K) — cmdk [research: Linear/Vercel cmdk]**

Centered modal, 640px, --surface-2, 12px radius, 1px --hairline-strong, soft shadow + faint iris top-border. Search input (mono placeholder "Type a command or search…"), fuzzy match. **Tabs:** Candidates / Vacancies / Actions. Results as rows (icon + label + right-aligned shortcut). Actions include: create vacancy, jump to candidate by ID, change status, open bias dashboard. Esc closes; ↑↓ navigate; Enter executes.

**0.4 Right Inspector Panel — 400px slide-in (contextual) [research: Attio inspector]**

Overlays right side, --surface, left edge 1px --hairline, slides in 240ms. Used for: candidate quick-view, HITL score editing, activity log. Header (title + close ×), body (inline-editable fields), footer (primary+secondary actions). Inline edit: click a value → becomes input; save = optimistic UI [research: Linear optimistic]. Activity log at bottom (append-only feed, mono timestamps).

**0.5 Global states**

- **Loading:** skeletons on containers only (tables, cards, charts) — never on buttons/toasts [research: Carbon]. Shimmer 1.2s. Skeleton for >500ms waits; instant otherwise.
- **Empty:** action-oriented, single CTA, role-aware, everything else dimmed [research: Pixxen/Webflow].
- **Error:** inline card, --neg icon, message, Retry + Contact support.
- **Toasts:** bottom-right, --surface-2, 8px radius, auto-dismiss 5s; for "score recomputed", "invites sent", "documents verified & deleted".
- **Long tasks:** corner drawer with determinate progress (interview processing, scoring, bulk invites) — non-blocking [research: Carbon/Drive].

**Signature chrome details:** corner-bracket L-marks animate in on interactive card hover (::before/::after, 0→16px, stagger 0.05s); iris focus rings on inputs; graph-paper grid at 3% under some surfaces [visual: pencil-on-grid batch3·6]; contour texture at 6% behind analytics [visual: contour+HUD batch2·5].

-----
**1 · GLOBAL DASHBOARD**

**Purpose:** single pane of glass — see all vacancies, what needs attention, key metrics at a glance [research: Ashby single-pane]. **Route:** /dashboard (default landing after login).

**Layout (3 rows)**

Full-width work surface, 32px page padding, contour texture 6% behind header.

**Header row (88px):** left — "Good morning, {name}" (h2) + date (mono --text-lo). Right — the **glowing white cube** brand anchor (r3f or static render, ~120px), hover → prism flash [visual: glowing cube batch2·8; token: --iris-gradient]. Primary CTA "Create Vacancy" (paired with secondary "Import from ATS").

**KPI strip (row 2, 6 tiles, equal columns, 12px gap):** [research: Stripe/Datadog KPI strip] Each tile: --surface, 1px --hairline, 12px radius, 20px pad. Contents: mono uppercase label (11px --text-lo) · big metric (clamp 28–48px, tabular-nums, 590) · trend (arrow + %, --pos/--neg) · optional 1-line sparkline. Tiles: **Active Vacancies · Total Candidates · Passed Threshold · In Invited List · Avg Score · Open Bias Flags** (last tile: count in --neg if >0). Count-up animation 0→value on entry [research: Amplitude/Mixpanel; token: tabular-nums].

**Body (row 3, two columns 64/36):**

- **Left — Vacancy cards grid** (2-up, responsive to 1-up): each card --surface, 12px radius, 1px hairline, hover translateY(-2px)+iris hairline+corner brackets. Card contents: vacancy title · status pill (DRAFT/LIVE/CLOSED, pastel + all-caps mono [research: Attio pills]) · competition code (mono, copyable) · candidate count · mini hiring-funnel (6 tiny segments) · "N need review" badge · quick actions (⋯ → edit/close/clone). Sort control (by recent/status/count).
- **Right — "Needs your attention" queue:** stacked list rows — scores awaiting human review, flagged anomalies (--neg dot), calibration divergences. Each row: candidate ID (mono) + reason + "Review →". This is the HITL entry funnel.

**States**

- **Empty (first login = highest-stakes):** giant centered "Create your first vacancy" CTA, cube dimmed behind, KPI strip shows zeros muted, everything else dimmed [research: Pixxen highest-stakes empty].
- **Loading:** KPI tiles + cards as skeletons; cube renders last.
- **Role:** Observer sees read-only, no "Create", no attention-queue actions.

**Data/API:** GET /dashboard/summary (KPIs), GET /vacancies?status=active, GET /review-queue. **Source:** Ashby single-pane; Stripe KPI; Amplitude count-up. **Visual:** glowing cube (anchor), contour bg. **Tokens:** --surface, --iris-gradient, tabular-nums, hairline elevation.

-----
**2 · CREATE VACANCY (Wizard + Sectioned)**

**Purpose:** turn a role into a full evaluation config, two ways [research: Ashby NL report builder; NN/g wizards]. **Route:** /vacancies/new.

**2.0 Branch selector (Step 0)**

Centered, two large choice cards on --wb-paper inverted panel (this whole flow lives in a **white box** — you're building transparency) [visual: inverted white-box batch2·1]:

- **(A) Describe in natural language** — icon + "Tell WhiteBox about the role in plain language. We'll build the evaluation config — and show you why."
- **(B) Configure manually** — "Set every parameter yourself. For power users." [research: wizards bad for power-users → offer sectioned].

**2.A Natural-language branch**

- **Big textarea** (--wb scope, mono-adjacent, 8px radius, generous height), placeholder shows the canonical example: *"Team Lead for a dev team. Leadership, decision-making, communication, conflict resolution, stress-resilience matter most. Experience important, but growth potential is high priority."*
- **"Generate config"** primary button; on click → determinate progress ("Analyzing role…", "Setting weights…", "Selecting competencies…") — plain-language steps [research: Perplexity plain-language trace].
- **Result = editable transparent config:** every generated field renders with a **"why" chip** (click → popover: rationale the AI used) — a mini-explainability moment even here [research: XAI every-explanation-maps-to-action]. Fields generated: evaluation categories, per-category weights, extra competencies, interview type, question depth, required documents, skill-check format, minimum pass thresholds. Each field is fully editable (HR overrides anything).

**2.B Manual / Sectioned branch**

Left vertical section-nav (Basics · Categories · Weights · Interview · Documents · Thresholds · Review) + right form panel. Power-user mode: jump to any section directly, no forced linear step-gating [research: sectioned for power users].

**Wizard mechanics (both branches converge)**

- **Segmented progress bar** top (Airbnb pattern), current segment iris-filled [research: wizard progress].
- **"Next" disabled until valid** (e.g., weights must sum to 100) [research: disabled-next].
- **Responsive disclosure:** advanced fields (question depth, skill-check format) appear on input [research: responsive disclosure].
- **Summary-Review step:** read-only recap of the whole config with quick-jump edit links [research: summary review].
- **Exit-confirmation modal** on abandon [research: exit-confirm].
- **On Publish:** generate unique **competition code** (mono, copy button, toast "Copied"), config saved as **version 1**; thereafter change-history + diff view [research: Ashby versioning; Vanta].

**States**

Loading (generating config = determinate), Error (generation failed → retry, or fall back to manual), Empty (fresh textarea), Disabled (Next until valid). Role: only HR/Head can create.

**Data/API:** POST /ai/nl-to-config (returns typed config + per-field rationale), POST /vacancies (persist + code + v1). **Source:** Ashby NL builder; NN/g + Airbnb wizard; weight validation. **Visual:** inverted white-box panel (building transparency). **Tokens:** --wb-paper, --wb-ink, iris progress.

-----
**3 · COMPETENCY BUILDER**

**Purpose:** define what's evaluated and how much it counts [research: Greenhouse scorecard hierarchy]. **Route:** /vacancies/{id}/config/competencies (also embedded in wizard).

**Layout (two columns 60/40)**

- **Left — hierarchy editor:** **Category → Attribute** tree (3–4 categories, 5–6 attributes each) [research: Greenhouse]. Each category = collapsible block (--surface, 12px radius). **Focus attributes** grouped at top of each category and **iris-highlighted** (replaces Greenhouse's yellow) [research: Greenhouse focus attrs; token: --iris]. Add/remove attribute inline; drag to reorder. Each attribute row: name · type tag (skill/trait/qualification) · weight field · remove (×).
- **Right — controls panel:** 
  - **Weight controls:** per-category sliders + numeric fields, with a **live sum indicator** that must equal 100% (turns --neg if not; blocks publish) [research: weight-sum validation].
  - **Threshold control:** minimum pass score slider with **live preview**: "≈ N of current candidates would pass" [research: threshold live-preview].
  - **Interview settings** (progressive disclosure): interview type, question depth, skill-check format.
  - **Question library** access: browse psychologically-validated questions, customize, attach to attributes [research: validated-question library]; **auto-generate interview** button (builds the interview from config).

**States**

Empty (no categories → "Add category" CTA), Error (weights ≠ 100 → inline --neg), Loading (question library fetch skeleton). Read-only if vacancy CLOSED [research: Greenhouse closed=read-only].

**Data/API:** GET/PUT /vacancies/{id}/config, GET /questions?competency=, POST /ai/generate-interview. **Source:** Greenhouse category→attribute + focus; weight/threshold controls; validated question bank. **Visual:** voronoi/network sketch as motif for "competency network" [visual: ink voronoi batch2·10]. **Tokens:** iris highlight, --neg validation.

-----
**4 · VACANCY MANAGEMENT**

**Purpose:** manage all vacancies across states [research: Retool table+filters]. **Route:** /vacancies.

**Layout**

Toolbar (search · filter by status · "Create Vacancy") over a **data table** or Lists-view toggle (Grid/Kanban/List — Attio) [research: Attio Lists]. **Table columns:** title · status pill · competition code (mono) · applicants · config version (mono v3) · created · updated · actions (⋯ → edit/close/clone/archive). Sticky header, pin title column, pagination 25/50/100, sort (default: updated desc) [research: data-table rules]. **Kanban columns:** Draft / Live / Closed — cards draggable between states (with confirm on Close).

**States**

Empty ("No vacancies yet" + CTA), Loading (skeleton rows), closed vacancies rendered muted + read-only badge.

**Data/API:** GET /vacancies, PATCH /vacancies/{id}/status. **Source:** Retool triad; Attio views; table rules. **Tokens:** status pills, mono codes.

-----
**5 · CANDIDATE RANKING / LEADERBOARD ★ core work surface**

**Purpose:** rank, filter, compare, and action candidates after applications close [research: HireVue tiers; Mercor leaderboard; data-table rules]. **Route:** /vacancies/{id}/ranking.

**Layout**

Full-bleed dense table. Background: contour+HUD map at 6% [visual: contour+HUD batch2·5]. Toolbar row above table: **filters** (tier, threshold pass/fail, competency, verification status, flag) · **column customization** (with mandatory Reset) · **density toggle** (comfortable/compact) · **bulk-action bar** (appears on select) · **"rows per page" 25/50/100** [research: pagination not infinite].

**Table anatomy (TanStack) [research: Superfiles/Linear table]**

- **Sticky header;** **pinned columns:** checkbox + rank + internal ID (mono) — pinned on horizontal scroll [research: pin first column].
- **Columns (left→right):** 
  - ☑ select
  - **Rank** (mono, tabular)
  - **Internal ID** (mono, e.g., CND-4A19) — anonymized [research: anonymization]
  - **Overall score** — cell = micro horizontal bar + tabular number, colored by threshold (--pos above, --text-mid below) [research: score cells with mini-viz]
  - **Per-competency mini-scores** — a compact sparkline/dot-strip (hover → tooltip names) [research: Datadog high-density; Mercor radar precursor]
  - **Tier badge** — Top / Mid / Bottom pill [research: HireVue tier placement]
  - **Doc verification** — status pill (VERIFIED/PENDING/—) [research: Vanta OK/Needs-Evidence]
  - **AI-vs-Human divergence** — flag icon if human overrode AI [research: override-rate/divergence]
  - **Integrity** — small advisory indicator (never a verdict) [research: Mercor/BrightHire advisory]
  - **Actions** (⋯ → open, compare, move to invited)
- **Row states:** hover (subtle bg, corner brackets), expandable (chevron → inline per-competency breakdown without leaving) [research: expandable rows], selected (iris left-marker + bg).
- **Bulk actions:** on multiselect → sticky bottom bar: "Move to invited · Compare · Export" [research: bulk actions].

**States**

Empty ("Applications still open" or "No candidates yet") [research: role/context empty], Loading (skeleton rows, ~10), Error (retry). Full-saturation color only on score/status/flag cells; everything else muted [research: Linear muted palette]. Closed vacancy → actions limited, still viewable.

**Data/API:** GET /vacancies/{id}/candidates?sort=score&filters=… (server-side sort/filter/paginate), POST /candidates/bulk/invite. **Source:** HireVue tiers + human/AI separation; Mercor leaderboard; Superfiles table rules; Linear density. **Visual:** contour+HUD bg; iris on select. **Tokens:** tabular-nums, --pos/--neg, pills, hairline.

-----
**6 · CANDIDATE DETAIL / SCORECARD ★ where explainability + HITL + audit converge**

**Purpose:** full record of one candidate; the single most important screen [research: Attio record page]. **Route:** /vacancies/{id}/candidates/{cid}.

**Layout**

Attio-style record page: **tab bar** across top + main content + **right inspector** (HITL + activity). Left rail shows candidate internal ID (mono), rank, overall gauge.

**Tab bar (6 tabs)**

Overview · Competencies · Interview · Documents · Audit · (Notes)

**Tab 1 — Overview**

- Anonymized identity block (internal ID, tier, applied date) — PII hidden until final stage [research: anonymization]; a locked "Reveal identity" action (permissioned, logged).
- **Overall score gauge** (large, tabular) + confidence-as-phrase beneath ("High confidence — consistent across 5 answers") [research: XAI confidence-as-phrase].
- **Radar chart** of competencies [research: Mercor radar].
- **Top strengths / weaknesses** (3 each, plain-language).
- **Quick HITL actions** (Accept / Change / Reject — equal weight) [research: HITL equal weight].

**Tab 2 — Competencies (the explainability heart)**

For each competency, an expandable block (--surface, 12px radius):

- Header: competency name · score (tabular, threshold-colored) · **confidence badge** (High/Med/Low + icon + word) [research: scite/XAI].
- **Ranked drivers** — top 3–5, plain-language, impact-ordered, principal reason first (FICO/VantageScore reason-code structure) [research: reason codes].
- **Evidence chips** — click → anchored popover with the exact interview fragment, timestamp, 1/N pagination [research: Perplexity/scite].
- **Collapsible reasoning trace** — "Completed N steps" (collapsed default) → plain-language steps; full audit → LangSmith-style tree [research: Perplexity trace / LangSmith].
- **Document-verified badge** where a claim was confirmed [research: Vanta evidence].
- Confidence expand → "what drives this confidence" (evidence count, consistency, data quality) [research: confidence patterns].

This tab visually **unfolds the white cube's layers** [visual: exploded cubes batch1·7; token: cube-unfold motion].

**Tab 3 — Interview**

- **Video player** + **synced transcript** (click line → seek).
- **Per-question notes** (not per-timecode) [research: Metaview].
- **Timeline markers** (key moments, flags).
- **Answer-dynamics** timeline.
- **Integrity signals** as advisory context strip (delays, gaze, window-switch, speech-rate, second-device) — clearly labeled "advisory, not a verdict" [research: advisory integrity].

**Tab 4 — Documents**

- Claim ↔ verification table: claim · result (VERIFIED/NOT VERIFIED) · structured extracted data · confidence.
- Notice: "Source documents auto-deleted after verification; only results retained" [research: Mercor/WhiteBox storage].

**Tab 5 — Audit**

- Append-only change history for this candidate: every AI score, every human override, reason, approver, timestamp, hash [research: hash-chained audit].
- Filter by action type; "share with auditor" flags [research: Vanta].

**Tab 6 — Notes**

- Public / Private / For-other-interviewers notes [research: Greenhouse note types]; blind until own feedback submitted [research: Ashby blind].

**Right inspector — HITL editing**

- Current score (editable) · **Accept / Change / Recompute / Reject** buttons of **equal visual weight** [research: equal-weight, design "no" first].
- Change/Reject → **reason required** field → writes to audit [research: reason required].
- Activity log feed (mono timestamps, append-only).
- Trust motif subtly present (halftone×wireframe handshake as a small section icon) [visual: trust handshake batch3·3].

**States**

Loading (tabs skeleton), Empty per tab (e.g., "No documents uploaded"), Error, Disabled (Observer: read-only, no HITL). Reveal-identity gated by role + logged.

**Data/API:** GET /candidates/{cid} (scores, drivers, confidence, evidence spans), GET /interviews/{id} (video+transcript), POST /candidates/{cid}/override (reason→audit), GET /candidates/{cid}/audit. **Source:** Attio record page; XAI/reason-codes/confidence; Perplexity/LangSmith trace; Metaview per-question; Greenhouse notes; Vanta audit; HITL rules. **Visual:** cube-unfold, trust handshake, inverted white-box for explainability sub-sections. **Tokens:** iris (confidence/active), --pos/--warn/--neg, mono IDs/timestamps.

-----
**7 · COMPARISON VIEW**

**Purpose:** decide between finalists on attributes, not gut feeling [research: Greenhouse roundup; Mercor]. **Route:** /vacancies/{id}/compare?ids=… (2–4 candidates).

**Layout**

Columns per candidate; shared rows. **Overlaid radar** (all candidates, distinct iris-family hues) + per-competency **delta table** (differences highlighted) + evidence side-by-side + verification status row. Sticky candidate-header row on scroll. Bulk "Move to invited" from here.

**States**

Empty ("Select 2–4 candidates to compare"), Loading (skeleton), max 4 enforced.

**Data/API:** GET /candidates/compare?ids=. **Source:** Greenhouse roundup; Mercor radar. **Tokens:** iris-family palette for series.

-----
**8 · ANALYTICS DASHBOARD**

**Purpose:** understand the vacancy's funnel, distributions, and criteria effectiveness [research: Amplitude/PostHog; Datadog]. **Route:** /vacancies/{id}/analytics.

**Layout**

Contour+HUD background 6% [visual: batch2·5]. High-density mode for wide monitors [research: Datadog].

- **KPI strip** (row 1).
- **Score distribution** histogram — **click a bin → the candidates in it** (Amplitude "Microscope" drill-down) [research: Amplitude drill-down].
- **Hiring funnel** (ordered, drop-off %): code → registration → profile → interview → verification → shortlist → invited; breakdown by criteria; auto-insights "largest drop-off / slowest step" [research: Amplitude funnel].
- **Criteria-effectiveness** panel (which evaluation criteria predict outcomes).
- Every chart ships an inline **"how to interpret this"** [research: Ashby built-in explainer].

**States**

Empty ("Not enough data yet"), Loading (chart skeletons), Error.

**Data/API:** GET /vacancies/{id}/analytics/\*. **Source:** Amplitude/PostHog funnel + drill-down; Datadog density; Ashby explainers. **Visual:** contour+HUD. **Tokens:** tabular, --pos/--neg deltas.

-----
**9 · BIAS DASHBOARD**

**Purpose:** monitor possible systematic bias; warn HR of anomalies [research: Fairlearn/Aequitas; Vanta status]. **Route:** /bias (org-level) and /vacancies/{id}/bias.

**Layout**

- Score distributions with **anomaly warnings** (--neg, echo of glitch-red) [visual: glitch-red batch1·1].
- Fairness metrics (demographic parity, equalized odds) as **side-by-side / heatmaps across groups** — operating only on lawfully available, post-hoc, anonymization-respecting data [research: Fairlearn/Aequitas].
- Each alert links to affected candidates.
- Real-time status + progress-style "monitoring active" indicator [research: Vanta]. Red reserved strictly for anomalies.

**States**

Empty ("No anomalies detected"), Loading, Error. Role: HR/Head only.

**Data/API:** GET /bias/metrics, GET /bias/alerts. **Source:** Fairlearn/Aequitas; Vanta status. **Visual:** glitch-red anomaly echo. **Tokens:** --neg (anomaly only).

-----
**10 · CALIBRATION**

**Purpose:** align multiple HR specialists; measure AI-vs-human divergence [research: Ashby blind; HITL override-rate]. **Route:** /calibration, /vacancies/{id}/calibration.

**Layout**

- **Blind feedback:** interviewer sees others' feedback **only after submitting their own** (Ashby verbatim) [research: Ashby blind].
- Consistency metrics across reviewers; **divergence view** (AI-vs-human = override-rate as operational signal — rising = drift; near-zero on high volume = disengagement/rubber-stamp) [research: override-rate].
- Reviewer agreement heatmap.

**States**

Empty, Loading, Error. Role-gated.

**Data/API:** GET /calibration/\*. **Source:** Ashby blind; HITL divergence. **Tokens:** heatmap in iris-family + --neg for high divergence.

-----
**11 · AUDIT & VERSIONING**

**Purpose:** tamper-evident record; config & model history [research: hash-chained audit; Ashby/Vanta versioning]. **Route:** /audit, /vacancies/{id}/config/history.

**Layout**

- **Audit log table:** append-only; columns — action ID · timestamp (mono) · actor · action (APPROVED/REJECTED/ESCALATED/OVERRIDDEN) · target · reason · model/prompt/rubric versions · prev-hash (mono, truncated). Filter by type/actor/date [research: audit fields].
- **Config change-history:** version list with **diff view** [research: versioning + diff].
- **Scoring-model versioning:** which model/prompt/rubric version produced each score.
- **"Share with auditor"** field-level flags [research: Vanta].

**States**

Read-only by nature; Loading, Empty (unlikely), Error.

**Data/API:** GET /audit, GET /vacancies/{id}/config/versions. **Source:** hash-chained audit; Vanta share-with-auditor; diff view. **Tokens:** mono everywhere, monospace hashes.

-----
**12 · FINAL SELECTION & INVITATIONS**

**Purpose:** move finalists forward and invite them [research: one-click move; email gen]. **Route:** /vacancies/{id}/invitations.

**Layout**

- **Invited list** (moved from ranking, one-click) + candidates pending.
- **Invitation composer:** template · **AI-generate** (then edit) or HR-write · preview · variables (role, next-stage date) · **explicit "Send" confirmation** (irreversible action → confirm modal) [research: irreversible confirm].
- **Schedule integration:** Teams/Zoom/Meet for next-stage live interviews.
- Toast "Invites sent" + audit entry.

**States**

Empty ("No candidates invited yet"), Loading, Error (send failed → retry per-recipient).

**Data/API:** POST /candidates/bulk/invite, POST /ai/generate-invite, POST /schedule. **Source:** one-click move; AI email gen; irreversible-action confirm. **Tokens:** iris on primary Send, ember for "human action" marker.

-----
**13 · SETTINGS & INTEGRATIONS**

**Purpose:** connect systems, manage roles, set compliance [research: Retool RBAC; Vanta]. **Route:** /settings/\*.

**Sections (left nav)**

- **Integrations:** ATS/HRIS API keys; Microsoft Teams / Zoom / Google Meet; webhooks. Connection status pills (CONNECTED/ERROR) [research: Vanta status].
- **Roles & Permissions:** manage HR / Head / Technical Interviewer / Observer; per-role module + PII visibility; feedback-visibility rule (never/always/after-own-submission) [research: Ashby feedback visibility].
- **Languages:** multi-language interview settings.
- **Compliance:** per-jurisdiction allowable criteria (NYC LL144, Illinois AIVIA, GDPR, Kazakhstan law); data-residency region; consent templates; retention (docs auto-delete) [research: compliance settings].
- **Reports:** per-interview report generation config.
- **Model settings:** which model/prompt/rubric versions are active; pin for reproducibility [research: versioning/determinism].

**States**

Loading, Error (integration test fail), Disabled (non-admin read-only).

**Data/API:** GET/PUT /settings/\*, POST /integrations/{provider}/test. **Source:** Retool RBAC; Ashby feedback visibility; Vanta; compliance. **Tokens:** connection pills, mono keys.

-----
**SELF-CHECK — coverage vs prior documents (nothing dropped)**

- **Every HR screen from Master Part VI** present: Dashboard, Create Vacancy (NL+manual), Competency Builder, Vacancy Mgmt, Ranking, Candidate Detail (all 5+1 tabs), Comparison, Analytics, Bias, Calibration, Audit/Versioning, Final Selection, Settings. ✔
- **Research patterns carried:** Ashby (single-pane, built-in explainers, blind feedback, NL builder, anonymize), HireVue (tiers, AI≠human score separation, per-competency, assessment builder), Mercor (radar, leaderboard, storage policy), Greenhouse (category→attribute, focus attrs, note types, closed=read-only, overall recommendation), Metaview (per-question notes, searchable archive), Linear (⌘K, 4px grid, muted palette, hairlines, mono IDs, optimistic, skeleton), Attio (3-zone sidebar, record page tabs+widgets, right inspector inline-edit + activity, Lists views, pastel pills), Retool (table+filters+form, RBAC, audit), Vanta (OK/Needs-Evidence, share-with-auditor, real-time status), Stripe/Datadog (KPI strip, sparkline, high-density), Amplitude/PostHog (funnel, drill-down "Microscope", insights), XAI/confidence/HITL/reason-codes (ranked drivers, phrase-confidence, evidence chips, collapsible trace, mandatory exit, equal-weight override, reason→audit, override-rate divergence, avoid rubber-stamp/fake transparency), data-table rules (sticky/pin/paginate/sort/expand/bulk/density/reset), wizard rules (branching/progress/disabled-next/summary/exit-confirm/responsive-disclosure/sectioned-for-power-users/weight-sum/threshold-preview), empty-loading-error (highest-stakes empty, container skeletons, determinate progress, toast/drawer), command palette (cmdk/tabs/fuzzy). ✔
- **Visual refs woven:** glowing white cube (dashboard anchor, loading), exploded/unfolding cubes (explainability), inverted white-box panels (create-vacancy + explainability sub-sections), contour+HUD map (ranking/analytics bg), trust handshake halftone×wireframe (HITL inspector), glitch-red (bias anomalies), voronoi/network sketch (competency builder), graph-paper grid + concrete grain (surface textures), iridescent accent (active/confidence/focus) with dune-gold/ember swap. ✔
- **Tokens:** consistent with Master Part III throughout. ✔

**CAVEATS**

- Dimensions (264px sidebar, 52px top bar, etc.) are recommended defaults — tune in design; the *relationships* (density, hierarchy, elevation-via-borders) are the fixed part.
- Where 2–3 options appear (charts lib, video provider, sectioned vs wizard), all are viable; pick per team/skill/residency.
- This spec is the HR side only. The candidate side (Master Part VII) gets its own companion doc next if wanted.
- Compliance items are technical scaffolding, validated per jurisdiction with counsel.
-----
**BOOK IV — CANDIDATE SCREEN SPEC**

**WHITEBOX AI — CANDIDATE-SIDE DETAILED SCREEN SPEC**

**Companion to the Master Product Vision & HR Screen Spec · Screen-by-screen, field-by-field, state-by-state**

**Version 1.0 · Candidate side (the applicant product)**

Exhaustive layer under Part VII of the Master doc. Same template as the HR spec: **Purpose · Route/entry · Layout & regions (dimensions) · Every element top→bottom / left→right · All states (default / hover / loading / empty / error / disabled) · Interactions & shortcuts · Data & API deps · Source (research pattern) · Visual ref · Tokens applied.**

**Refs:** [research: X] = studied product/article pattern. [visual: Y] = one of the 27 mood images (batch·index). [token: --z] = Master Part III.

**Design ethos — the inverse of the HR side.** HR is a dense, keyboard-first *instrument*; the candidate side is **calm, frictionless, reassuring, spacious, human-paced.** Same dark theme (--void #060608) + white-on-top, but generous spacing, larger type, fewer elements per screen, the **glowing white cube present as a calming anchor** [visual: glowing cube batch2·8]. One primary action per screen. The candidate **never** sees scores, rankings, other candidates, or the rubric. Everything communicates: *this process is transparent, fair, and you are safe.* This calm-clarity is itself the brand proof — the candidate experiences the "white box" as reassurance, not surveillance.

**Cross-cutting non-negotiables:** consent-first at every data step · anonymization messaging · transparent disclosure of AI use and integrity-signal collection · mobile-first (many candidates are on phones; but interview may require desktop Chromium — surfaced early) · WCAG AA · reduced-motion path · multi-language from first screen.

-----
**0 · CANDIDATE SHELL (chrome that frames every candidate screen)**

**0.1 Top bar — 56px, minimal**

Left: WhiteBox wordmark (thin, wide-tracking, small cube glyph) [visual: Dune-thin wordmark batch1·9]. Right: **language switcher** (globe + code, e.g., EN), and — once logged in — a small avatar/menu (profile, sign out). No dense nav; the candidate flow is linear, not a dashboard.

**0.2 Progress rail (contextual, appears during the application flow)**

A slim horizontal **stepper** under the top bar showing the candidate's journey: Code → Register → Profile → System Check → Interview → Documents → Done. Current step iris-marked; completed steps get a check; upcoming muted [research: wizard progress; Mercor completed-steps-never-expire]. On mobile it collapses to "Step 3 of 7" mono label. This is the candidate's map — it removes anxiety by making the whole process legible up front.

**0.3 Canvas & tone**

--void background, generous 24–32px padding, single centered content column (max ~560px for forms, full-bleed for interview). The cube anchor sits behind/above content at low presence, softly lit, slow prism drift [token: --iris-gradient, prism-flash motion]. Contour texture at 4% only, subtle [visual: contour batch2·3]. No graph-paper grid here (that's the HR "instrument" register) — the candidate register is calmer.

**0.4 Global states**

- **Loading:** gentle skeleton or a slow cube-particle assemble [visual: particle box batch2·9] for longer waits — never a harsh spinner.
- **Error:** reassuring inline card, --neg icon used sparingly, plain-language message + clear next step + support link. Never alarming.
- **Reassurance strip:** a persistent, subtle line where relevant — e.g., "Your identity is hidden from evaluators. You're assessed on your answers." [research: anonymization].
- **Autosave:** profile & progress autosave; "Saved" mono micro-toast.
- **Accessibility:** captions, keyboard, screen-reader labels; reduced-motion swaps cube animation for a static render.
-----
**1 · CODE ENTRY**

**Purpose:** enter the vacancy's competition code → land directly in that specific competition [research: unique competition code]. **Route:** / or /join.

**Layout**

Centered, spacious, cube softly lit above. Single column ~440px.

- **Headline:** "Enter your competition code" (h2, calm).
- **Sub:** one line — "Your employer shared a code for this role."
- **Code input:** large, **mono**, segmented or single field (e.g., WBX-7Q4K), auto-uppercase, generous height, iris focus ring [token: mono, --iris focus].
- **Primary button:** "Continue" (disabled until code format valid) [research: disabled-next].
- **Secondary link:** "I don't have a code" → help copy.
- **Reassurance micro-line:** "WhiteBox evaluates candidates fairly and transparently."

**States**

Default (empty), Invalid format (inline --neg, "Check the code and try again"), Not-found (code valid format but no vacancy → gentle error), Loading (validating), Success → route to Register/Login.

**Data/API:** POST /join/validate-code. **Source:** competition code. **Visual:** cube anchor, calm. **Tokens:** mono input, iris focus, --void.

-----
**2 · REGISTRATION / LOGIN**

**Purpose:** create or sign into an account; assign anonymous internal ID [research: anonymization]. **Route:** /auth (contextual to the code).

**Layout**

Two-tab or toggle: **Sign up / Log in**. Single column ~440px.

- **Sign up fields:** email · password (or magic-link / SSO options) · confirm consent checkbox ("I agree to the privacy terms and to AI-assisted evaluation") — **consent-first** [research: consent-first].
- **Log in fields:** email · password / magic-link.
- **Primary:** "Create account" / "Log in".
- **After sign-up:** an **anonymous internal ID is auto-assigned** silently; a reassurance panel appears: *"You've been assigned an anonymous ID. From here, evaluators see only your answers — not your name, photo, gender, or age — until the final stage."* [research: anonymization]. This is a **trust moment**, rendered in an inverted white-box panel [visual: inverted white-box batch2·1] — literally showing the candidate the "transparent box" they're entering.

**States**

Default, Validation errors (inline), Loading, Auth error (wrong password → clear message), Success → route to Profile. Password manager / SSO friendly (Clerk/WorkOS) [research: WorkOS/Clerk].

**Data/API:** POST /auth/signup, POST /auth/login, auto POST /candidate/assign-internal-id. **Source:** anonymization; consent-first. **Visual:** inverted white-box for the trust moment. **Tokens:** --wb-paper panel, iris.

-----
**3 · SHORT PROFILE FORM**

**Purpose:** capture only essentials; keep friction low [research: short profile]. **Route:** /profile.

**Layout**

Single column, sectioned lightly (not a wizard — one calm page with autosave):

- **Experience** (add roles: title, org, dates — minimal).
- **Education** (degree, institution, year).
- **Skills** (tag input).
- **Contacts** (email prefilled; phone optional).
- **Links** (portfolio, GitHub, LinkedIn — optional).
- **Short bio** (small textarea, "A few sentences about yourself").
- **Reassurance line:** "Only what's needed. Your identity stays hidden from evaluators." [research: anonymization].
- **Responsive disclosure:** optional fields expand on demand [research: responsive disclosure].
- **Primary:** "Save & continue"; autosave with "Saved" micro-toast.

**States**

Default (empty), Partial (autosaved), Validation (only email required; others optional — low friction), Loading, Error. Progress rail advances on continue.

**Data/API:** PUT /candidate/profile (autosave), advances on POST /candidate/profile/complete. **Source:** short profile; low-friction forms; anonymization. **Tokens:** calm inputs, iris focus.

-----
**4 · PRE-INTERVIEW SYSTEM CHECK (gate)**

**Purpose:** ensure camera/mic/(consented screen-share) work before starting; block start until ready [research: Mercor gate]. **Route:** /interview/check.

**Layout**

Centered, guided. A checklist card with live status per item:

- **Camera** — live preview thumbnail; status pill (OK / NOT DETECTED) [research: Vanta OK/Needs].
- **Microphone** — live level meter.
- **Screen-share** (if required, consented) — explicit consent + preview; clearly labeled why (proctoring, advisory) [research: Mercor screen-share; advisory integrity].
- **Browser check** — "Chromium-based browser required" surfaced if not met [research: Mercor Chromium].
- **Connection** — bandwidth check.
- **Consent block:** explicit disclosure — "This interview is AI-conducted. Integrity signals may be collected as advisory context for reviewers, never as automatic grounds for rejection." [research: advisory integrity; consent-first].
- **"Start Interview" button — DISABLED (grayed) until all checks pass** [research: Mercor disabled-start].
- **Retake policy line:** "You can retake up to a limited number of times; completed steps don't expire." [research: Mercor retakes].

**States**

Each check: pending / checking (spinner) / OK (--pos) / failed (--neg + fix hint). Start disabled until all OK. Permission-denied → guidance to enable. Loading (initializing devices).

**Data/API:** client-side device checks (MediaPipe/WebRTC probes) [research: MediaPipe/LiveKit]; POST /interview/consent. **Source:** Mercor gate + retakes + Chromium; advisory integrity; consent-first. **Visual:** trust motif subtle [visual: handshake batch3·3]. **Tokens:** --pos/--neg status, disabled-until-valid.

-----
**5 · AI VIDEO INTERVIEW ★ the main candidate experience**

**Purpose:** an adaptive, recruiter-like interview — unique to each candidate [research: adaptive interview; BrightHire Screen]. **Route:** /interview/live.

**Layout (full-bleed, calm-cinematic)**

- **Candidate video** (self-view, corner or side).
- **AI presence** — not a fake human face; a **calm visual embodiment**: the glowing cube gently pulsing/prism-shifting as it "listens" and "thinks" [visual: glowing cube batch2·8; particle box batch2·9; token: prism-flash, particle motion]. This is on-brand and less uncanny than an avatar.
- **Question display** — current question in clean large type, appearing conversationally (not a rigid numbered list) [research: adaptive, not pre-recorded].
- **Live captions / transcript** (optional toggle, accessibility).
- **Gentle progress indicator** — human-paced, no countdown pressure; approximate progress only.
- **Controls** — mic mute (with clear feedback), pause (if allowed), help.
- **Voice option** — voice-only or video; the AI interviewer speaks (TTS) and listens (STT) in real time [research: realtime pipeline; ElevenLabs/Deepgram].

**Behavior (what the AI does, felt by the candidate)**

Asks follow-ups; changes direction; checks answer consistency; returns to earlier points; asks for real examples; evaluates depth of argument; adapts difficulty; builds the interview individually — **each interview unique**, no universal answer set possible [research: adaptive interview]. Pacing is natural (streaming), never robotic.

**States**

- **Connecting** (particle-assemble loading [visual: batch2·9]).
- **Active** (AI speaking / candidate answering — clear turn indicator).
- **Thinking** (cube pulse, "…" — never a jarring wait) [research: reasoning "thinking" pattern].
- **Reconnecting** (network drop → graceful recovery, no data loss).
- **Paused / Error** (reassuring recovery).
- **Complete** → confirmation + route to Documents (or Done).

**Data/API:** LiveKit room + Agents loop; STT (Deepgram/AssemblyAI) → LLM (LangGraph adaptive agent) → TTS (ElevenLabs/Cartesia); transcript persisted; video to Mux/R2 [research: LiveKit/LangGraph/Deepgram/ElevenLabs/Mux]. **Source:** adaptive interview; BrightHire Screen; realtime AI pipeline. **Visual:** cube as AI presence; particle assemble. **Tokens:** iris (presence/active), calm dark canvas.

**5.1 Anti-AI Integrity (background, advisory — invisible-ish to candidate beyond disclosure)**

Runs during the interview: possible signs of external assistance — unusually long delays, constant gaze shifts, window switching, speech-rate mismatch, sudden answer-style changes, second-device detection (only where user-permitted) [research: advisory integrity]. **Surfaced only as advisory context to HR; never automatic rejection.** The candidate was told this up front (system-check consent); no accusatory UI is shown to the candidate mid-interview (avoids false-accusation stress) [research: reduce false accusations]. Client-side heuristics via MediaPipe where privacy-preferable [research: MediaPipe].

-----
**6 · DOCUMENT UPLOAD & VERIFICATION**

**Purpose:** let candidates substantiate claims; verify then delete [research: doc verification + auto-delete]. **Route:** /documents.

**Layout**

- Prompt: "If you mentioned a diploma, certificates, experience, or achievements, you can upload proof."
- **Upload zone** (drag-drop + browse), file-type/size hints, multiple files.
- Per-file row: name · status (Uploading → Verifying → Verified / Could not verify) · a plain-language result line.
- **Privacy notice (prominent):** "After verification, your documents are automatically deleted. Only the verification result and structured info are kept." [research: auto-delete].
- **Skip option:** "Skip — I'll rely on my interview" (documents are supportive, not mandatory unless the vacancy requires them).

**Behavior**

AI extracts info → checks against the candidate's stated claims → records result → **deletes the source document** (lifecycle + explicit delete job); only verification result + structured data retained [research: OCR + LLM cross-check + delete].

**States**

Empty (no uploads), Uploading (determinate progress), Verifying (processing), Verified (--pos), Not-verified (neutral, non-punitive tone), Error (retry). Deletion confirmed with a mono "Deleted after verification" note.

**Data/API:** POST /documents (upload), POST /ai/verify-document (OCR + LLM), auto-delete job; GET /documents/results. **Source:** doc verification + auto-delete; OCR (Textract/Document AI/Tesseract) + LLM. **Tokens:** --pos verified, determinate progress.

-----
**7 · STATUS / RESULTS**

**Purpose:** clear, calm status; optional candidate-facing insight [research: HireVue candidate insight-report]. **Route:** /status.

**Layout**

- **Current status** — one clear state: Submitted / Under review / Invited to next stage / Not moving forward (delivered gently, with dignity).
- **Timeline** of the candidate's completed steps (mirrors the progress rail).
- **Optional insight report** (only if the employer opts in): strengths / growth areas, non-punitive, empowering — never a raw score, never a rank [research: candidate insight report; no scores to candidate].
- **If invited:** next-stage details + the personalized invitation email content; scheduling link (Teams/Zoom/Meet).
- **Reassurance / fairness note:** "You were evaluated on your answers, with human review of the results." [research: HITL human-final].

**States**

Each status is a distinct calm layout. Empty (nothing yet → "We'll notify you"), Loading, Error. Notifications (email + in-app) drive candidates back here.

**Data/API:** GET /candidate/status, GET /candidate/insight-report (if enabled). **Source:** candidate insight report; HITL human-final; invitations. **Visual:** cube anchor calm. **Tokens:** status states, dignified tone.

-----
**CROSS-CUTTING CANDIDATE PRINCIPLES (applied on every screen)**

- **Anonymization visible & reassuring** — the candidate is repeatedly, calmly reminded their identity is hidden until final stage; rendered via inverted white-box "trust" panels at key moments [research: anonymization; visual: white-box].
- **Consent-first** — every data step (video, screen-share, integrity signals, documents) has explicit, plain-language consent [research: consent-first; Illinois AIVIA; GDPR].
- **No scores, no ranking, no rubric** ever shown to the candidate — protects fairness and prevents gaming [research: adaptive interview integrity].
- **Human-paced, low-pressure** — no aggressive countdowns; the AI is calm, the cube is soothing, the copy is dignified.
- **Advisory-only integrity** — never accuse mid-flow; never auto-reject [research: reduce false accusations].
- **Storage transparency** — documents auto-deleted; video/transcript retained only for evaluation, not model training, not sold [research: Mercor storage; WhiteBox policy].
- **Accessibility & i18n** — captions, keyboard, screen reader, reduced motion; multi-language interview & UI [research: multilingual].
- **Mobile-aware** — most steps mobile-friendly; interview desktop/Chromium requirement surfaced early at system check.
-----
**SELF-CHECK — coverage vs prior documents (nothing dropped)**

- **Every candidate screen from Master Part VII present:** Code Entry · Register/Login (+ anonymization) · Profile Form · Pre-Interview System Check (gate) · AI Video Interview · Anti-AI Integrity (background) · Document Upload & Verification · Multimodal Assessment (produced server-side, candidate sees status) · Status/Results (+ optional insight report) · Invitation received. ✔
- **Research patterns carried:** Mercor (system-check gate with disabled start, retakes/never-expire, Chromium, screen-share proctoring, storage policy, radar is HR-side), BrightHire Screen (rubric-driven agent, structured interview, voice/video async), adaptive-interview behavior (follow-ups, consistency checks, difficulty adaptation, unique interview), advisory integrity (surfaced to HR only, no auto-reject, reduce false accusations), doc verification (OCR + LLM cross-check + auto-delete), candidate insight report (HireVue), consent-first/anonymization/HITL-human-final (XAI/HITL + compliance), realtime AI pipeline (LiveKit/LangGraph/Deepgram/ElevenLabs/Mux/MediaPipe), reassuring empty/loading (particle-assemble, no harsh spinners), progress stepper (wizard). ✔
- **Visual refs woven:** glowing white cube as calm AI presence & anchor, particle-box for connecting/loading, inverted white-box panels for trust/anonymization moments, contour texture (subtle), thin Dune-wordmark, trust handshake at consent, iridescent accent for presence/active with dune-gold/ember swap. ✔
- **Tokens:** consistent with Master Part III; candidate register = calmer spacing, no graph-paper grid (that's HR "instrument" register). ✔
- **Note on multimodal assessment:** it is *produced* on the candidate side (their interview feeds it) but *displayed* on the HR side (scorecard) — correctly split; candidate sees only status, never scores. ✔

**CAVEATS**

- Dimensions and column widths are recommended defaults; the fixed part is the *ethos* (calm, spacious, single-action, reassurance, consent-first) and the *hierarchy*.
- Where options appear (voice-only vs video; screen-share required or not; magic-link vs password vs SSO), all are viable — pick per vacancy config and jurisdiction.
- Interview desktop/Chromium requirement is a real constraint from the realtime stack; surface it before the candidate invests time (at code entry or profile), not only at the gate.
- Compliance items (AIVIA consent, GDPR, data residency, EU AI Act high-risk transparency) are technical scaffolding; validate per jurisdiction with counsel.
- HR side is specified in its own companion doc; this doc is candidate-side only. Both sit under the Master Product Vision.
-----
**BOOK V — BUILD SEQUENCE & IMPLEMENTATION GUIDE (Claude Code)**

**Purpose & discipline.** Books I–IV already contain every precise description (screens, fields, states, tokens, patterns, AI behavior, data model). This book **does not repeat them.** It exists only to (1) collapse the "2–3 options" forks into single locked picks so an agent doesn't choose unpredictably, (2) give the agent operating rules, (3) sequence the work into codeable tickets, each **linking** to the exact section that holds its spec, (4) provide the starter scaffold prompt, and (5) order the AI prompt-engineering calls. If a ticket needs detail, the agent **reads the linked section** — it must not invent what the spec already defines.

**V.0 — LOCKED STACK (forks from Book I · Part X–XI collapsed to single picks)**

Where Book I offered alternatives, use these unless a hard blocker appears; the alternate is noted in parentheses for escape only.

- **Frontend:** Next.js 15 (App Router) + TypeScript. Styling: Tailwind + CSS custom properties (all tokens from → Book I · Part III). UI base: shadcn/ui (Radix), fully re-themed. Icons: Lucide.
- **Tables:** TanStack Table v8 + TanStack Virtual. **Server state:** TanStack Query. **Client state:** Zustand. **Forms:** React Hook Form + Zod (schema shared with backend).
- **Charts:** visx (alt: Recharts). **Command palette:** cmdk. **Motion:** GSAP + ScrollTrigger + Framer Motion + Lenis. **3D:** react-three-fiber + drei (cube/particles, lazy, with static fallback).
- **Fonts:** next/font (display grotesque + mono + body — → Book I · Part III.6). **i18n:** next-intl.
- **Realtime interview:** LiveKit + LiveKit Agents. **STT:** Deepgram. **TTS:** ElevenLabs (alt: Cartesia). **Video storage/playback:** Mux + Cloudflare R2. **Integrity heuristics:** MediaPipe Tasks Vision (client-side, advisory only).
- **Backend:** FastAPI (Python) for the AI core; Next.js Route Handlers as the BFF (alt: NestJS if TS-first team). **DB:** PostgreSQL + pgvector (alt: Qdrant at scale). ORM: Prisma (TS BFF) / SQLAlchemy (Py). **Cache/queue:** Redis. **Durable workflows:** Temporal (interview→transcription→scoring→explainability pipeline). **Object storage:** S3/R2 with lifecycle auto-delete for documents.
- **Auth/RBAC/SSO:** WorkOS (alt: Clerk). **LLM:** Claude / GPT-4-class primary; open (Llama/Qwen via vLLM) where data-residency requires. **Structured output:** Instructor or Outlines. **Agent orchestration:** LangGraph. **LLM observability:** Langfuse + OpenTelemetry; app errors: Sentry. **OCR:** Google Document AI (alt: Tesseract self-host). **Fairness:** Fairlearn / Aequitas.
- **Deploy:** Vercel (frontend) + Fly.io or Cloud Run (FastAPI + services); region-pinned storage for GDPR/Kazakhstan.

**V.1 — AGENT OPERATING RULES**

1. **Read before you write.** Before any ticket, read the linked spec section(s) and → Book I · Part III (tokens) + Book I · Part IV (components). Never invent a library, token, color, or field the spec doesn't define.
1. **Ask, don't guess.** On genuine ambiguity, ask a single sharp question rather than inventing. Everything the spec fixes is fixed; everything it leaves as an option, pick the V.0 lock.
1. **Tokens are law.** All color/spacing/radius/type come from CSS custom properties (Book I · Part III). Elevation = 1px hairlines, not shadows. Accent is token-driven (--accent-primary = iridescent) so a single flip re-skins to dune-gold/ember.
1. **Three states always.** Every container ships Empty + Loading (skeleton) + Error (→ Book III · §0.5). Optimistic UI on score edits.
1. **Mock the AI/back until its ticket.** Build UI against typed fixtures matching the data model (→ Book I · Part XII); wire real endpoints when the AI/back ticket lands.
1. **Accessibility + i18n from the start.** WCAG AA contrast, keyboard, screen-reader labels, reduced-motion path, next-intl strings (no hardcoded copy).
1. **Two registers.** HR = dense, keyboard-first, graph-paper/instrument feel. Candidate = calm, spacious, single-action, reassuring. Do not blur them.
1. **Folder structure:** /app (routes), /components/{ui,hr,candidate,viz,canvas}, /lib (api, auth, tokens), /hooks, /styles (tokens.css), /server (FastAPI), /prisma or /db, /public/models (cube GLB). Feature-first within each side.
1. **Commits:** conventional commits; one ticket = one focused PR; include the ticket ID and the Book link it implements.
1. **Definition of Done (per UI ticket):** matches the linked spec's layout + all listed fields + all states; tokens only; a11y pass; responsive; fixtures in place; story/screenshot attached.

**V.2 — PHASED TICKET SEQUENCE (P0→P4, from Book I · Part XIV)**

Each ticket = **goal · Spec link · DoD delta · Mock**. Read the link for the real detail.

**PHASE P0 — Foundation**

- **T0.1 Repo + tokens.** Next.js 15 + TS + Tailwind; implement tokens.css from → Book I · Part III and the visual DNA → Book II · §2. DoD: dark theme + inverted .wb scope render; accent swap works via one variable. Mock: none.
- **T0.2 HR app shell.** → Book III · §0 (sidebar 264px, top bar 52px, ⌘K, right inspector, global states). DoD: nav + ⌘K + inspector shell + role-gated items. Mock: nav data.
- **T0.3 Candidate shell.** → Book IV · §0 (minimal top bar, progress rail, calm canvas). DoD: linear shell + stepper. Mock: step state.
- **T0.4 Auth + RBAC.** → Book I · Part V §5.2 + Book III · §0.1 roles (HR/Head/Tech/Observer). DoD: WorkOS login, role gates enforced server-side. Mock: none.
- **T0.5 DB schema + audit skeleton.** → Book I · Part XII (entities + append-only hash-chained audit). DoD: migrations, audit-write helper. Mock: none.
- **T0.6 Component library + white-box panel.** → Book I · Part IV (buttons, inputs, cards, pills, tables, KPI, radar, gauge, confidence badge, evidence chip, timeline/trace, the inverted white-box panel). DoD: themed shadcn set + white-box primitive + corner-bracket hover. Mock: none.
- **T0.7 Three states + toasts.** → Book III · §0.5. DoD: skeleton/empty/error/toast/drawer primitives reused everywhere. Mock: none.

**PHASE P1 — Core differentiator (the reason the product exists)**

- **T1.1 Candidate ranking table.** → Book III · §5 (10 columns, pinned ID, score cells w/ mini-viz, tiers, bulk bar, contour-HUD bg, pagination). DoD: TanStack table, sort/filter/paginate server-side, expandable rows, bulk-select. Mock: candidate fixtures.
- **T1.2 Scorecard record page + tabs.** → Book III · §6 (Overview/Competencies/Interview/Documents/Audit/Notes + right inspector). DoD: tabbed record page, right inspector shell. Mock: candidate fixture.
- **T1.3 Explainability stack.** → Book III · §6 Tab 2 + Book I · Part VIII (ranked drivers top-3–5 / confidence-as-phrase+icon / evidence chips w/ popover / collapsible "Completed N steps" trace / cube-unfold motion). DoD: all four render from typed data; no bare numbers. Mock: scored-competency fixtures w/ evidence spans.
- **T1.4 HITL inspector.** → Book III · §6 inspector + Book I · Part VIII (equal-weight Accept/Change/Recompute/Reject, reason required → audit write, activity log). DoD: override writes hash-chained audit entry; override-rate captured. Mock: none (real audit).

**PHASE P2 — Two-sided flows**

- **T2.1 Vacancy creation.** → Book III · §2 + Book I · Part XI (NL→config) (branch selector, NL textarea + "why" chips, manual sectioned, wizard mechanics, competition code, v1 + versioning). DoD: both branches produce an editable config; code generated. Mock: NL→config endpoint until T-AI.
- **T2.2 Competency builder.** → Book III · §3 (category→attribute, focus attrs, weight sliders sum=100, threshold live-preview, question library, auto-generate interview). DoD: full builder with validation. Mock: question library fixtures.
- **T2.3 Candidate onboarding.** → Book IV · §1–4 (code entry, register/login + anonymization moment, profile form, system-check gate). DoD: linear flow, disabled-Start gate, anonymous internal ID assigned. Mock: device checks stubbed then real.
- **T2.4 AI video interview.** → Book IV · §5 + Book I · Part XI (interview agent) (LiveKit room + Agents loop, cube-as-presence, adaptive behavior, captions). DoD: real-time STT→LLM→TTS turn loop; transcript persisted; video to Mux. Mock: agent prompt stub until T-AI.
- **T2.5 Documents.** → Book IV · §6 + Book I · Part XI (doc verify) (upload, verify, auto-delete, results). DoD: OCR→LLM cross-check→delete source→store result. Mock: OCR stub until T-AI.

**PHASE P3 — Analytics & governance**

- **T3.1 Analytics dashboard.** → Book III · §8 (KPI strip, distribution w/ drill-down, funnel, criteria-effectiveness, inline explainers). DoD: charts (visx) + Microscope drill-down. Mock: analytics fixtures.
- **T3.2 Bias dashboard.** → Book III · §9 (distributions + anomaly warnings + fairness metrics via Fairlearn/Aequitas). DoD: metrics + alerts link to candidates. Mock: metric fixtures then real.
- **T3.3 Calibration/divergence.** → Book III · §10 (blind feedback, reviewer consistency, override-rate). DoD: blind gate + divergence view. Mock: reviewer fixtures.
- **T3.4 Audit & versioning UI.** → Book III · §11 + Book I · Part XII (audit table, config diff, model versioning, share-with-auditor flags). DoD: read-only tamper-evident views. Mock: none.
- **T3.5 Final selection + invitations.** → Book III · §12 + Book I · Part XI (email gen) (one-click move, composer, explicit Send confirm, schedule). DoD: invites + audit entry + toast. Mock: email-gen stub until T-AI.
- **T3.6 Settings/integrations/compliance.** → Book III · §13 (ATS/HRIS, Teams/Zoom/Meet, roles, languages, per-jurisdiction compliance, model settings). DoD: connection tests + role/PII visibility + retention. Mock: integration stubs.
- **T3.7 Candidate status/results.** → Book IV · §7 (status states, optional insight report, invitation view). DoD: dignified status + opt-in insight. Mock: status fixtures.

**PHASE P4 — Polish**

- **T4.1 Cube/particle hero.** → Book I · Part IX + Book II · §2.5 (r3f glowing white cube + particle-assemble, lazy, static fallback). DoD: <2MB GLB, degrades on weak devices/reduced-motion.
- **T4.2 Motion system.** → Book I · Part IX (cube-unfold, decode/echo, contour drift, prism flash, tunnel pull, white-box panel-open, count-up, base scroll anims). DoD: curves defined before layout; reduced-motion path.
- **T4.3 Micro-craft.** → Book I · Part IX (custom cursor + magnetic buttons + corner brackets + iris focus). DoD: 100–200ms tempo, no jank.

**V.3 — AI PROMPT-ENGINEERING CALL SEQUENCE (order + links, not re-description)**

Implement as isolated, versioned, structured-output calls (Instructor/Outlines), each traced in Langfuse; pin model+prompt+rubric versions per vacancy for reproducibility. Full behavior specs live in → **Book I · Part XI**; per-screen surfacing in Books III–IV.

1. **NL → config** — → Book I · Part XI.3 + Book III · §2.A. Schema: categories, weights (sum 100), competencies, interview type, depth, docs, thresholds, **plus a rationale per field** (feeds the "why" chips). Powers T2.1.
1. **Interview agent (adaptive)** — → Book I · Part XI.3 + Book IV · §5. Stateful LangGraph agent: follow-ups, consistency checks vs earlier answers, examples, difficulty adaptation, running JSON state; never reveals rubric. Powers T2.4.
1. **Per-competency scoring** — → Book I · Part XI.3 + Book III · §6 Tab 2. Output {score, ranked\_drivers[3–5], confidence\_band, confidence\_reason, evidence\_spans[]} with transcript offsets; **require evidence or abstain.** Powers T1.3.
1. **Ranked drivers (reason codes)** — → Book I · Part XI.3 (FICO/VantageScore structure: principal reason first, specific, impact-ordered). Powers T1.3 + adverse-action defensibility.
1. **Confidence calibration** — → Book I · Part XI.3 (post-hoc calibrated band, not a raw number). Powers T1.3.
1. **Document verification** — → Book I · Part XI.3 + Book IV · §6 (OCR → extract claims → LLM compare → {verified, evidence, confidence} → delete source). Powers T2.5.
1. **Anti-AI integrity** — → Book IV · §5.1 (heuristic/statistical, advisory only, never a scoring input). Powers T2.4 background.
1. **Invitation email generation** — → Book III · §12 (templated, HR-editable). Powers T3.5.
1. **Bias monitoring** — → Book III · §9 (Fairlearn/Aequitas metrics, post-hoc, anonymization-respecting). Powers T3.2.

**V.4 — STARTER SCAFFOLD PROMPT (the agent's first message)**

*"Initialize the WhiteBox AI product repo. Read → Book I · Part III (design tokens) and → Book II · §2 (visual synthesis) first, then implement T0.1: a Next.js 15 App-Router + TypeScript project with Tailwind and a styles/tokens.css implementing every token from Part III as CSS custom properties, including the dark base, the inverted .wb white-box scope, and an --accent-primary set to the iridescent gradient with a single-variable swap path to --dune-gold/--ember. Set up shadcn/ui re-themed to these tokens (elevation = 1px hairlines, radii 4/8/12/9999, mono for IDs/timestamps, tabular-nums). Establish the folder structure from Book V · §V.1.8. Do not build any screen yet; produce the token layer, the themed component base (Book I · Part IV), and the three-state primitives (Book III · §0.5). Then stop and report what's ready for T0.2."*

Thereafter, feed tickets in P0→P4 order; for each, the agent reads the linked Book section and implements to its Definition of Done.

**V.5 — DECISION THRESHOLDS THAT CHANGE THE PLAN (from Book I · Part XIV)**

- Override-rate → 0 on high volume → HITL became a rubber stamp: add review-panel context or stop pre-selecting the AI recommendation as default.
- Users can't name a score's top-3 drivers in testing → the explainability panel failed: return to ranked drivers.
- Confidence ever ships as a bare number → rewrite as a phrase.
- Product looks like Mercor/HireVue on prototype → push harder on explainability visuals (the only unoccupied territory).
- Enterprise-serious tone preferred over "techy" → flip --accent-primary from iridescent to --dune-gold.
-----
**CLOSING NOTE**

This unified document is the single source of truth. Books I–IV hold the precise "what"; Book V holds the "in what order, with which locked tools, linking where." Nothing here is a landing page; everything serves the working product and its one differentiator — **making the reasoning visible and contestable.** Where small aspects float (a chart lib, a video provider, exact pixel dimensions), all listed options are viable — pick per team, skill, and jurisdiction — but the spine (theme, white-cube metaphor, explainability + HITL + audit, two registers, tokens) is fixed.

