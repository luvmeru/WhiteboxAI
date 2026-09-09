**WHITEBOX AI --- HR-SIDE DETAILED SCREEN SPEC**

**Companion to the Master Product Vision · Screen-by-screen, tab-by-tab,
field-by-field, state-by-state**

**Version 1.0 · HR side (the recruiter/employer product)**

This is the exhaustive layer under Part VI of the Master doc. Every
screen gets a consistent template: **Purpose · Route/entry · Layout &
regions (with dimensions) · Every element top→bottom / left→right · All
states (default / hover / loading / empty / error / disabled /
role-variants) · Interactions & shortcuts · Data & API deps · Source
(research pattern) · Visual ref · Tokens applied.**

**Reading the refs.** \[research: X\] = pattern carried from a studied
product/article. \[visual: Y\] = one of the 27 mood images
(batch·index). \[token: \--z\] = from Master Part III. Options are given
where a rigid pick is premature; everything is concrete, never vague.

**Global theme:** dark (\--void #060608), white-on-top dominant;
**inverted white-box panels** (\--wb-paper #F4F4F2 + \--wb-ink) used for
explainability/\"how it works\"/trust. Accent = **iridescent**
(\--iris-gradient), swap-ready to \--dune-gold/\--ember. Elevation = 1px
hairlines, not shadows. Density \> whitespace on work surfaces. Respect
prefers-reduced-motion.

**0 · HR APP SHELL (chrome that frames every HR screen)**

**0.1 Left Sidebar --- 264px (collapsible to 64px icon-rail)**

Region: fixed left, full height, \--void, right edge 1px \--hairline.
Three stacked zones (Attio model) \[research: Attio sidebar\].

**Zone 1 --- Control (top, 56px):** workspace switcher (org logo +
name + chevron → dropdown of orgs), and a collapse toggle (« ) on the
far right. Mono workspace label 12px \--text-mid.

**Zone 2 --- Primary nav (scrollable):** vertical list, 40px rows, 16px
left pad, Lucide icon (18px) + label (14px \--text-mid). Items in order:
**Dashboard · Vacancies · Candidates · Analytics · Bias · Calibration ·
Audit**. Active item: 2px iris left-marker (\--iris-gradient vertical
bar), label→\--text-hi, faint \--surface row bg. Hover: row bg
rgba(255,255,255,0.03), label→\--text-hi, 150ms. Badge counts (e.g.,
\"Needs review · 12\") right-aligned as a mono pill.

**Zone 3 --- Contextual (appears when inside a vacancy):** section label
\"THIS VACANCY\" (11px mono uppercase \--text-lo), then sub-nav: Ranking
· Detail · Compare · Analytics · Config · Invitations. Indented 8px.

**Bottom (pinned):** Settings (gear) + user avatar (32px, 9999px radius,
1px \--hairline) + role chip (mono, e.g., HR). Click avatar → menu
(profile, theme, sign out).

**Collapsed state (64px):** icons only, labels as hover-tooltips; active
iris-marker persists. Transition width 200ms.

**Role variants:** Observer hides Bias/Calibration/Audit-edit; Technical
Interviewer sees only assigned vacancies in Vacancies.

**0.2 Top Bar --- 52px, sticky, backdrop-blur, 1px bottom \--hairline**

Left→right: **breadcrumb** (Workspace › Vacancy › Screen, 13px,
separators \--text-lo) · **global search** input (/ focus, 320px,
\--surface, 8px radius, magnifier icon, placeholder \"Search candidates,
vacancies...\") · spacer · **⌘K hint chip** (mono \"⌘K\", \--surface,
4px radius) · **notifications bell** (dot when unread, \--ember dot) ·
**\"AI processing N interviews\" status chip** (mono, animated iris dot
when active) · **Help (?)**.

**0.3 Command Palette (⌘K / Ctrl+K) --- cmdk \[research: Linear/Vercel
cmdk\]**

Centered modal, 640px, \--surface-2, 12px radius, 1px
\--hairline-strong, soft shadow + faint iris top-border. Search input
(mono placeholder \"Type a command or search...\"), fuzzy match.
**Tabs:** Candidates / Vacancies / Actions. Results as rows (icon +
label + right-aligned shortcut). Actions include: create vacancy, jump
to candidate by ID, change status, open bias dashboard. Esc closes; ↑↓
navigate; Enter executes.

**0.4 Right Inspector Panel --- 400px slide-in (contextual) \[research:
Attio inspector\]**

Overlays right side, \--surface, left edge 1px \--hairline, slides in
240ms. Used for: candidate quick-view, HITL score editing, activity log.
Header (title + close ×), body (inline-editable fields), footer
(primary+secondary actions). Inline edit: click a value → becomes input;
save = optimistic UI \[research: Linear optimistic\]. Activity log at
bottom (append-only feed, mono timestamps).

**0.5 Global states**

-   **Loading:** skeletons on containers only (tables, cards, charts)
    --- never on buttons/toasts \[research: Carbon\]. Shimmer 1.2s.
    Skeleton for \>500ms waits; instant otherwise.

-   **Empty:** action-oriented, single CTA, role-aware, everything else
    dimmed \[research: Pixxen/Webflow\].

-   **Error:** inline card, \--neg icon, message, Retry + Contact
    support.

-   **Toasts:** bottom-right, \--surface-2, 8px radius, auto-dismiss 5s;
    for \"score recomputed\", \"invites sent\", \"documents verified &
    deleted\".

-   **Long tasks:** corner drawer with determinate progress (interview
    processing, scoring, bulk invites) --- non-blocking \[research:
    Carbon/Drive\].

**Signature chrome details:** corner-bracket L-marks animate in on
interactive card hover (::before/::after, 0→16px, stagger 0.05s); iris
focus rings on inputs; graph-paper grid at 3% under some surfaces
\[visual: pencil-on-grid batch3·6\]; contour texture at 6% behind
analytics \[visual: contour+HUD batch2·5\].

**1 · GLOBAL DASHBOARD**

**Purpose:** single pane of glass --- see all vacancies, what needs
attention, key metrics at a glance \[research: Ashby single-pane\].
**Route:** /dashboard (default landing after login).

**Layout (3 rows)**

Full-width work surface, 32px page padding, contour texture 6% behind
header.

**Header row (88px):** left --- \"Good morning, {name}\" (h2) + date
(mono \--text-lo). Right --- the **glowing white cube** brand anchor
(r3f or static render, \~120px), hover → prism flash \[visual: glowing
cube batch2·8; token: \--iris-gradient\]. Primary CTA \"Create Vacancy\"
(paired with secondary \"Import from ATS\").

**KPI strip (row 2, 6 tiles, equal columns, 12px gap):** \[research:
Stripe/Datadog KPI strip\] Each tile: \--surface, 1px \--hairline, 12px
radius, 20px pad. Contents: mono uppercase label (11px \--text-lo) · big
metric (clamp 28--48px, tabular-nums, 590) · trend (arrow + %,
\--pos/\--neg) · optional 1-line sparkline. Tiles: **Active Vacancies ·
Total Candidates · Passed Threshold · In Invited List · Avg Score · Open
Bias Flags** (last tile: count in \--neg if \>0). Count-up animation
0→value on entry \[research: Amplitude/Mixpanel; token: tabular-nums\].

**Body (row 3, two columns 64/36):**

-   **Left --- Vacancy cards grid** (2-up, responsive to 1-up): each
    card \--surface, 12px radius, 1px hairline, hover
    translateY(-2px)+iris hairline+corner brackets. Card contents:
    vacancy title · status pill (DRAFT/LIVE/CLOSED, pastel + all-caps
    mono \[research: Attio pills\]) · competition code (mono, copyable)
    · candidate count · mini hiring-funnel (6 tiny segments) · \"N need
    review\" badge · quick actions (⋯ → edit/close/clone). Sort control
    (by recent/status/count).

-   **Right --- \"Needs your attention\" queue:** stacked list rows ---
    scores awaiting human review, flagged anomalies (\--neg dot),
    calibration divergences. Each row: candidate ID (mono) + reason +
    \"Review →\". This is the HITL entry funnel.

**States**

-   **Empty (first login = highest-stakes):** giant centered \"Create
    your first vacancy\" CTA, cube dimmed behind, KPI strip shows zeros
    muted, everything else dimmed \[research: Pixxen highest-stakes
    empty\].

-   **Loading:** KPI tiles + cards as skeletons; cube renders last.

-   **Role:** Observer sees read-only, no \"Create\", no attention-queue
    actions.

**Data/API:** GET /dashboard/summary (KPIs), GET
/vacancies?status=active, GET /review-queue. **Source:** Ashby
single-pane; Stripe KPI; Amplitude count-up. **Visual:** glowing cube
(anchor), contour bg. **Tokens:** \--surface, \--iris-gradient,
tabular-nums, hairline elevation.

**2 · CREATE VACANCY (Wizard + Sectioned)**

**Purpose:** turn a role into a full evaluation config, two ways
\[research: Ashby NL report builder; NN/g wizards\]. **Route:**
/vacancies/new.

**2.0 Branch selector (Step 0)**

Centered, two large choice cards on \--wb-paper inverted panel (this
whole flow lives in a **white box** --- you\'re building transparency)
\[visual: inverted white-box batch2·1\]:

-   **(A) Describe in natural language** --- icon + \"Tell WhiteBox
    about the role in plain language. We\'ll build the evaluation config
    --- and show you why.\"

-   **(B) Configure manually** --- \"Set every parameter yourself. For
    power users.\" \[research: wizards bad for power-users → offer
    sectioned\].

**2.A Natural-language branch**

-   **Big textarea** (\--wb scope, mono-adjacent, 8px radius, generous
    height), placeholder shows the canonical example: *\"Team Lead for a
    dev team. Leadership, decision-making, communication, conflict
    resolution, stress-resilience matter most. Experience important, but
    growth potential is high priority.\"*

-   **\"Generate config\"** primary button; on click → determinate
    progress (\"Analyzing role...\", \"Setting weights...\", \"Selecting
    competencies...\") --- plain-language steps \[research: Perplexity
    plain-language trace\].

-   **Result = editable transparent config:** every generated field
    renders with a **\"why\" chip** (click → popover: rationale the AI
    used) --- a mini-explainability moment even here \[research: XAI
    every-explanation-maps-to-action\]. Fields generated: evaluation
    categories, per-category weights, extra competencies, interview
    type, question depth, required documents, skill-check format,
    minimum pass thresholds. Each field is fully editable (HR overrides
    anything).

**2.B Manual / Sectioned branch**

Left vertical section-nav (Basics · Categories · Weights · Interview ·
Documents · Thresholds · Review) + right form panel. Power-user mode:
jump to any section directly, no forced linear step-gating \[research:
sectioned for power users\].

**Wizard mechanics (both branches converge)**

-   **Segmented progress bar** top (Airbnb pattern), current segment
    iris-filled \[research: wizard progress\].

-   **\"Next\" disabled until valid** (e.g., weights must sum to 100)
    \[research: disabled-next\].

-   **Responsive disclosure:** advanced fields (question depth,
    skill-check format) appear on input \[research: responsive
    disclosure\].

-   **Summary-Review step:** read-only recap of the whole config with
    quick-jump edit links \[research: summary review\].

-   **Exit-confirmation modal** on abandon \[research: exit-confirm\].

-   **On Publish:** generate unique **competition code** (mono, copy
    button, toast \"Copied\"), config saved as **version 1**; thereafter
    change-history + diff view \[research: Ashby versioning; Vanta\].

**States**

Loading (generating config = determinate), Error (generation failed →
retry, or fall back to manual), Empty (fresh textarea), Disabled (Next
until valid). Role: only HR/Head can create.

**Data/API:** POST /ai/nl-to-config (returns typed config + per-field
rationale), POST /vacancies (persist + code + v1). **Source:** Ashby NL
builder; NN/g + Airbnb wizard; weight validation. **Visual:** inverted
white-box panel (building transparency). **Tokens:** \--wb-paper,
\--wb-ink, iris progress.

**3 · COMPETENCY BUILDER**

**Purpose:** define what\'s evaluated and how much it counts \[research:
Greenhouse scorecard hierarchy\]. **Route:**
/vacancies/{id}/config/competencies (also embedded in wizard).

**Layout (two columns 60/40)**

-   **Left --- hierarchy editor:** **Category → Attribute** tree (3--4
    categories, 5--6 attributes each) \[research: Greenhouse\]. Each
    category = collapsible block (\--surface, 12px radius). **Focus
    attributes** grouped at top of each category and
    **iris-highlighted** (replaces Greenhouse\'s yellow) \[research:
    Greenhouse focus attrs; token: \--iris\]. Add/remove attribute
    inline; drag to reorder. Each attribute row: name · type tag
    (skill/trait/qualification) · weight field · remove (×).

-   **Right --- controls panel:**

    -   **Weight controls:** per-category sliders + numeric fields, with
        a **live sum indicator** that must equal 100% (turns \--neg if
        not; blocks publish) \[research: weight-sum validation\].

    -   **Threshold control:** minimum pass score slider with **live
        preview**: \"≈ N of current candidates would pass\" \[research:
        threshold live-preview\].

    -   **Interview settings** (progressive disclosure): interview type,
        question depth, skill-check format.

    -   **Question library** access: browse psychologically-validated
        questions, customize, attach to attributes \[research:
        validated-question library\]; **auto-generate interview** button
        (builds the interview from config).

**States**

Empty (no categories → \"Add category\" CTA), Error (weights ≠ 100 →
inline \--neg), Loading (question library fetch skeleton). Read-only if
vacancy CLOSED \[research: Greenhouse closed=read-only\].

**Data/API:** GET/PUT /vacancies/{id}/config, GET
/questions?competency=, POST /ai/generate-interview. **Source:**
Greenhouse category→attribute + focus; weight/threshold controls;
validated question bank. **Visual:** voronoi/network sketch as motif for
\"competency network\" \[visual: ink voronoi batch2·10\]. **Tokens:**
iris highlight, \--neg validation.

**4 · VACANCY MANAGEMENT**

**Purpose:** manage all vacancies across states \[research: Retool
table+filters\]. **Route:** /vacancies.

**Layout**

Toolbar (search · filter by status · \"Create Vacancy\") over a **data
table** or Lists-view toggle (Grid/Kanban/List --- Attio) \[research:
Attio Lists\]. **Table columns:** title · status pill · competition code
(mono) · applicants · config version (mono v3) · created · updated ·
actions (⋯ → edit/close/clone/archive). Sticky header, pin title column,
pagination 25/50/100, sort (default: updated desc) \[research:
data-table rules\]. **Kanban columns:** Draft / Live / Closed --- cards
draggable between states (with confirm on Close).

**States**

Empty (\"No vacancies yet\" + CTA), Loading (skeleton rows), closed
vacancies rendered muted + read-only badge.

**Data/API:** GET /vacancies, PATCH /vacancies/{id}/status. **Source:**
Retool triad; Attio views; table rules. **Tokens:** status pills, mono
codes.

**5 · CANDIDATE RANKING / LEADERBOARD ★ core work surface**

**Purpose:** rank, filter, compare, and action candidates after
applications close \[research: HireVue tiers; Mercor leaderboard;
data-table rules\]. **Route:** /vacancies/{id}/ranking.

**Layout**

Full-bleed dense table. Background: contour+HUD map at 6% \[visual:
contour+HUD batch2·5\]. Toolbar row above table: **filters** (tier,
threshold pass/fail, competency, verification status, flag) · **column
customization** (with mandatory Reset) · **density toggle**
(comfortable/compact) · **bulk-action bar** (appears on select) ·
**\"rows per page\" 25/50/100** \[research: pagination not infinite\].

**Table anatomy (TanStack) \[research: Superfiles/Linear table\]**

-   **Sticky header;** **pinned columns:** checkbox + rank + internal ID
    (mono) --- pinned on horizontal scroll \[research: pin first
    column\].

-   **Columns (left→right):**

    1.  ☑ select

    2.  **Rank** (mono, tabular)

    3.  **Internal ID** (mono, e.g., CND-4A19) --- anonymized
        \[research: anonymization\]

    4.  **Overall score** --- cell = micro horizontal bar + tabular
        number, colored by threshold (\--pos above, \--text-mid below)
        \[research: score cells with mini-viz\]

    5.  **Per-competency mini-scores** --- a compact sparkline/dot-strip
        (hover → tooltip names) \[research: Datadog high-density; Mercor
        radar precursor\]

    6.  **Tier badge** --- Top / Mid / Bottom pill \[research: HireVue
        tier placement\]

    7.  **Doc verification** --- status pill (VERIFIED/PENDING/---)
        \[research: Vanta OK/Needs-Evidence\]

    8.  **AI-vs-Human divergence** --- flag icon if human overrode AI
        \[research: override-rate/divergence\]

    9.  **Integrity** --- small advisory indicator (never a verdict)
        \[research: Mercor/BrightHire advisory\]

    10. **Actions** (⋯ → open, compare, move to invited)

-   **Row states:** hover (subtle bg, corner brackets), expandable
    (chevron → inline per-competency breakdown without leaving)
    \[research: expandable rows\], selected (iris left-marker + bg).

-   **Bulk actions:** on multiselect → sticky bottom bar: \"Move to
    invited · Compare · Export\" \[research: bulk actions\].

**States**

Empty (\"Applications still open\" or \"No candidates yet\") \[research:
role/context empty\], Loading (skeleton rows, \~10), Error (retry).
Full-saturation color only on score/status/flag cells; everything else
muted \[research: Linear muted palette\]. Closed vacancy → actions
limited, still viewable.

**Data/API:** GET /vacancies/{id}/candidates?sort=score&filters=...
(server-side sort/filter/paginate), POST /candidates/bulk/invite.
**Source:** HireVue tiers + human/AI separation; Mercor leaderboard;
Superfiles table rules; Linear density. **Visual:** contour+HUD bg; iris
on select. **Tokens:** tabular-nums, \--pos/\--neg, pills, hairline.

**6 · CANDIDATE DETAIL / SCORECARD ★ where explainability + HITL + audit
converge**

**Purpose:** full record of one candidate; the single most important
screen \[research: Attio record page\]. **Route:**
/vacancies/{id}/candidates/{cid}.

**Layout**

Attio-style record page: **tab bar** across top + main content + **right
inspector** (HITL + activity). Left rail shows candidate internal ID
(mono), rank, overall gauge.

**Tab bar (6 tabs)**

Overview · Competencies · Interview · Documents · Audit · (Notes)

**Tab 1 --- Overview**

-   Anonymized identity block (internal ID, tier, applied date) --- PII
    hidden until final stage \[research: anonymization\]; a locked
    \"Reveal identity\" action (permissioned, logged).

-   **Overall score gauge** (large, tabular) + confidence-as-phrase
    beneath (\"High confidence --- consistent across 5 answers\")
    \[research: XAI confidence-as-phrase\].

-   **Radar chart** of competencies \[research: Mercor radar\].

-   **Top strengths / weaknesses** (3 each, plain-language).

-   **Quick HITL actions** (Accept / Change / Reject --- equal weight)
    \[research: HITL equal weight\].

**Tab 2 --- Competencies (the explainability heart)**

For each competency, an expandable block (\--surface, 12px radius):

-   Header: competency name · score (tabular, threshold-colored) ·
    **confidence badge** (High/Med/Low + icon + word) \[research:
    scite/XAI\].

-   **Ranked drivers** --- top 3--5, plain-language, impact-ordered,
    principal reason first (FICO/VantageScore reason-code structure)
    \[research: reason codes\].

-   **Evidence chips** --- click → anchored popover with the exact
    interview fragment, timestamp, 1/N pagination \[research:
    Perplexity/scite\].

-   **Collapsible reasoning trace** --- \"Completed N steps\" (collapsed
    default) → plain-language steps; full audit → LangSmith-style tree
    \[research: Perplexity trace / LangSmith\].

-   **Document-verified badge** where a claim was confirmed \[research:
    Vanta evidence\].

-   Confidence expand → \"what drives this confidence\" (evidence count,
    consistency, data quality) \[research: confidence patterns\].

This tab visually **unfolds the white cube\'s layers** \[visual:
exploded cubes batch1·7; token: cube-unfold motion\].

**Tab 3 --- Interview**

-   **Video player** + **synced transcript** (click line → seek).

-   **Per-question notes** (not per-timecode) \[research: Metaview\].

-   **Timeline markers** (key moments, flags).

-   **Answer-dynamics** timeline.

-   **Integrity signals** as advisory context strip (delays, gaze,
    window-switch, speech-rate, second-device) --- clearly labeled
    \"advisory, not a verdict\" \[research: advisory integrity\].

**Tab 4 --- Documents**

-   Claim ↔ verification table: claim · result (VERIFIED/NOT VERIFIED) ·
    structured extracted data · confidence.

-   Notice: \"Source documents auto-deleted after verification; only
    results retained\" \[research: Mercor/WhiteBox storage\].

**Tab 5 --- Audit**

-   Append-only change history for this candidate: every AI score, every
    human override, reason, approver, timestamp, hash \[research:
    hash-chained audit\].

-   Filter by action type; \"share with auditor\" flags \[research:
    Vanta\].

**Tab 6 --- Notes**

-   Public / Private / For-other-interviewers notes \[research:
    Greenhouse note types\]; blind until own feedback submitted
    \[research: Ashby blind\].

**Right inspector --- HITL editing**

-   Current score (editable) · **Accept / Change / Recompute / Reject**
    buttons of **equal visual weight** \[research: equal-weight, design
    \"no\" first\].

-   Change/Reject → **reason required** field → writes to audit
    \[research: reason required\].

-   Activity log feed (mono timestamps, append-only).

-   Trust motif subtly present (halftone×wireframe handshake as a small
    section icon) \[visual: trust handshake batch3·3\].

**States**

Loading (tabs skeleton), Empty per tab (e.g., \"No documents
uploaded\"), Error, Disabled (Observer: read-only, no HITL).
Reveal-identity gated by role + logged.

**Data/API:** GET /candidates/{cid} (scores, drivers, confidence,
evidence spans), GET /interviews/{id} (video+transcript), POST
/candidates/{cid}/override (reason→audit), GET /candidates/{cid}/audit.
**Source:** Attio record page; XAI/reason-codes/confidence;
Perplexity/LangSmith trace; Metaview per-question; Greenhouse notes;
Vanta audit; HITL rules. **Visual:** cube-unfold, trust handshake,
inverted white-box for explainability sub-sections. **Tokens:** iris
(confidence/active), \--pos/\--warn/\--neg, mono IDs/timestamps.

**7 · COMPARISON VIEW**

**Purpose:** decide between finalists on attributes, not gut feeling
\[research: Greenhouse roundup; Mercor\]. **Route:**
/vacancies/{id}/compare?ids=... (2--4 candidates).

**Layout**

Columns per candidate; shared rows. **Overlaid radar** (all candidates,
distinct iris-family hues) + per-competency **delta table** (differences
highlighted) + evidence side-by-side + verification status row. Sticky
candidate-header row on scroll. Bulk \"Move to invited\" from here.

**States**

Empty (\"Select 2--4 candidates to compare\"), Loading (skeleton), max 4
enforced.

**Data/API:** GET /candidates/compare?ids=. **Source:** Greenhouse
roundup; Mercor radar. **Tokens:** iris-family palette for series.

**8 · ANALYTICS DASHBOARD**

**Purpose:** understand the vacancy\'s funnel, distributions, and
criteria effectiveness \[research: Amplitude/PostHog; Datadog\].
**Route:** /vacancies/{id}/analytics.

**Layout**

Contour+HUD background 6% \[visual: batch2·5\]. High-density mode for
wide monitors \[research: Datadog\].

-   **KPI strip** (row 1).

-   **Score distribution** histogram --- **click a bin → the candidates
    in it** (Amplitude \"Microscope\" drill-down) \[research: Amplitude
    drill-down\].

-   **Hiring funnel** (ordered, drop-off %): code → registration →
    profile → interview → verification → shortlist → invited; breakdown
    by criteria; auto-insights \"largest drop-off / slowest step\"
    \[research: Amplitude funnel\].

-   **Criteria-effectiveness** panel (which evaluation criteria predict
    outcomes).

-   Every chart ships an inline **\"how to interpret this\"**
    \[research: Ashby built-in explainer\].

**States**

Empty (\"Not enough data yet\"), Loading (chart skeletons), Error.

**Data/API:** GET /vacancies/{id}/analytics/\*. **Source:**
Amplitude/PostHog funnel + drill-down; Datadog density; Ashby
explainers. **Visual:** contour+HUD. **Tokens:** tabular, \--pos/\--neg
deltas.

**9 · BIAS DASHBOARD**

**Purpose:** monitor possible systematic bias; warn HR of anomalies
\[research: Fairlearn/Aequitas; Vanta status\]. **Route:** /bias
(org-level) and /vacancies/{id}/bias.

**Layout**

-   Score distributions with **anomaly warnings** (\--neg, echo of
    glitch-red) \[visual: glitch-red batch1·1\].

-   Fairness metrics (demographic parity, equalized odds) as
    **side-by-side / heatmaps across groups** --- operating only on
    lawfully available, post-hoc, anonymization-respecting data
    \[research: Fairlearn/Aequitas\].

-   Each alert links to affected candidates.

-   Real-time status + progress-style \"monitoring active\" indicator
    \[research: Vanta\]. Red reserved strictly for anomalies.

**States**

Empty (\"No anomalies detected\"), Loading, Error. Role: HR/Head only.

**Data/API:** GET /bias/metrics, GET /bias/alerts. **Source:**
Fairlearn/Aequitas; Vanta status. **Visual:** glitch-red anomaly echo.
**Tokens:** \--neg (anomaly only).

**10 · CALIBRATION**

**Purpose:** align multiple HR specialists; measure AI-vs-human
divergence \[research: Ashby blind; HITL override-rate\]. **Route:**
/calibration, /vacancies/{id}/calibration.

**Layout**

-   **Blind feedback:** interviewer sees others\' feedback **only after
    submitting their own** (Ashby verbatim) \[research: Ashby blind\].

-   Consistency metrics across reviewers; **divergence view**
    (AI-vs-human = override-rate as operational signal --- rising =
    drift; near-zero on high volume = disengagement/rubber-stamp)
    \[research: override-rate\].

-   Reviewer agreement heatmap.

**States**

Empty, Loading, Error. Role-gated.

**Data/API:** GET /calibration/\*. **Source:** Ashby blind; HITL
divergence. **Tokens:** heatmap in iris-family + \--neg for high
divergence.

**11 · AUDIT & VERSIONING**

**Purpose:** tamper-evident record; config & model history \[research:
hash-chained audit; Ashby/Vanta versioning\]. **Route:** /audit,
/vacancies/{id}/config/history.

**Layout**

-   **Audit log table:** append-only; columns --- action ID · timestamp
    (mono) · actor · action (APPROVED/REJECTED/ESCALATED/OVERRIDDEN) ·
    target · reason · model/prompt/rubric versions · prev-hash (mono,
    truncated). Filter by type/actor/date \[research: audit fields\].

-   **Config change-history:** version list with **diff view**
    \[research: versioning + diff\].

-   **Scoring-model versioning:** which model/prompt/rubric version
    produced each score.

-   **\"Share with auditor\"** field-level flags \[research: Vanta\].

**States**

Read-only by nature; Loading, Empty (unlikely), Error.

**Data/API:** GET /audit, GET /vacancies/{id}/config/versions.
**Source:** hash-chained audit; Vanta share-with-auditor; diff view.
**Tokens:** mono everywhere, monospace hashes.

**12 · FINAL SELECTION & INVITATIONS**

**Purpose:** move finalists forward and invite them \[research:
one-click move; email gen\]. **Route:** /vacancies/{id}/invitations.

**Layout**

-   **Invited list** (moved from ranking, one-click) + candidates
    pending.

-   **Invitation composer:** template · **AI-generate** (then edit) or
    HR-write · preview · variables (role, next-stage date) · **explicit
    \"Send\" confirmation** (irreversible action → confirm modal)
    \[research: irreversible confirm\].

-   **Schedule integration:** Teams/Zoom/Meet for next-stage live
    interviews.

-   Toast \"Invites sent\" + audit entry.

**States**

Empty (\"No candidates invited yet\"), Loading, Error (send failed →
retry per-recipient).

**Data/API:** POST /candidates/bulk/invite, POST /ai/generate-invite,
POST /schedule. **Source:** one-click move; AI email gen;
irreversible-action confirm. **Tokens:** iris on primary Send, ember for
\"human action\" marker.

**13 · SETTINGS & INTEGRATIONS**

**Purpose:** connect systems, manage roles, set compliance \[research:
Retool RBAC; Vanta\]. **Route:** /settings/\*.

**Sections (left nav)**

-   **Integrations:** ATS/HRIS API keys; Microsoft Teams / Zoom / Google
    Meet; webhooks. Connection status pills (CONNECTED/ERROR)
    \[research: Vanta status\].

-   **Roles & Permissions:** manage HR / Head / Technical Interviewer /
    Observer; per-role module + PII visibility; feedback-visibility rule
    (never/always/after-own-submission) \[research: Ashby feedback
    visibility\].

-   **Languages:** multi-language interview settings.

-   **Compliance:** per-jurisdiction allowable criteria (NYC LL144,
    Illinois AIVIA, GDPR, Kazakhstan law); data-residency region;
    consent templates; retention (docs auto-delete) \[research:
    compliance settings\].

-   **Reports:** per-interview report generation config.

-   **Model settings:** which model/prompt/rubric versions are active;
    pin for reproducibility \[research: versioning/determinism\].

**States**

Loading, Error (integration test fail), Disabled (non-admin read-only).

**Data/API:** GET/PUT /settings/\*, POST /integrations/{provider}/test.
**Source:** Retool RBAC; Ashby feedback visibility; Vanta; compliance.
**Tokens:** connection pills, mono keys.

**SELF-CHECK --- coverage vs prior documents (nothing dropped)**

-   **Every HR screen from Master Part VI** present: Dashboard, Create
    Vacancy (NL+manual), Competency Builder, Vacancy Mgmt, Ranking,
    Candidate Detail (all 5+1 tabs), Comparison, Analytics, Bias,
    Calibration, Audit/Versioning, Final Selection, Settings. ✔

-   **Research patterns carried:** Ashby (single-pane, built-in
    explainers, blind feedback, NL builder, anonymize), HireVue (tiers,
    AI≠human score separation, per-competency, assessment builder),
    Mercor (radar, leaderboard, storage policy), Greenhouse
    (category→attribute, focus attrs, note types, closed=read-only,
    overall recommendation), Metaview (per-question notes, searchable
    archive), Linear (⌘K, 4px grid, muted palette, hairlines, mono IDs,
    optimistic, skeleton), Attio (3-zone sidebar, record page
    tabs+widgets, right inspector inline-edit + activity, Lists views,
    pastel pills), Retool (table+filters+form, RBAC, audit), Vanta
    (OK/Needs-Evidence, share-with-auditor, real-time status),
    Stripe/Datadog (KPI strip, sparkline, high-density),
    Amplitude/PostHog (funnel, drill-down \"Microscope\", insights),
    XAI/confidence/HITL/reason-codes (ranked drivers, phrase-confidence,
    evidence chips, collapsible trace, mandatory exit, equal-weight
    override, reason→audit, override-rate divergence, avoid
    rubber-stamp/fake transparency), data-table rules
    (sticky/pin/paginate/sort/expand/bulk/density/reset), wizard rules
    (branching/progress/disabled-next/summary/exit-confirm/responsive-disclosure/sectioned-for-power-users/weight-sum/threshold-preview),
    empty-loading-error (highest-stakes empty, container skeletons,
    determinate progress, toast/drawer), command palette
    (cmdk/tabs/fuzzy). ✔

-   **Visual refs woven:** glowing white cube (dashboard anchor,
    loading), exploded/unfolding cubes (explainability), inverted
    white-box panels (create-vacancy + explainability sub-sections),
    contour+HUD map (ranking/analytics bg), trust handshake
    halftone×wireframe (HITL inspector), glitch-red (bias anomalies),
    voronoi/network sketch (competency builder), graph-paper grid +
    concrete grain (surface textures), iridescent accent
    (active/confidence/focus) with dune-gold/ember swap. ✔

-   **Tokens:** consistent with Master Part III throughout. ✔

**CAVEATS**

-   Dimensions (264px sidebar, 52px top bar, etc.) are recommended
    defaults --- tune in design; the *relationships* (density,
    hierarchy, elevation-via-borders) are the fixed part.

-   Where 2--3 options appear (charts lib, video provider, sectioned vs
    wizard), all are viable; pick per team/skill/residency.

-   This spec is the HR side only. The candidate side (Master Part VII)
    gets its own companion doc next if wanted.

-   Compliance items are technical scaffolding, validated per
    jurisdiction with counsel.
