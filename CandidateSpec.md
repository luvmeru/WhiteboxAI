**WHITEBOX AI --- CANDIDATE-SIDE DETAILED SCREEN SPEC**

**Companion to the Master Product Vision & HR Screen Spec ·
Screen-by-screen, field-by-field, state-by-state**

**Version 1.0 · Candidate side (the applicant product)**

Exhaustive layer under Part VII of the Master doc. Same template as the
HR spec: **Purpose · Route/entry · Layout & regions (dimensions) · Every
element top→bottom / left→right · All states (default / hover / loading
/ empty / error / disabled) · Interactions & shortcuts · Data & API deps
· Source (research pattern) · Visual ref · Tokens applied.**

**Refs:** \[research: X\] = studied product/article pattern. \[visual:
Y\] = one of the 27 mood images (batch·index). \[token: \--z\] = Master
Part III.

**Design ethos --- the inverse of the HR side.** HR is a dense,
keyboard-first *instrument*; the candidate side is **calm, frictionless,
reassuring, spacious, human-paced.** Same dark theme (\--void #060608) +
white-on-top, but generous spacing, larger type, fewer elements per
screen, the **glowing white cube present as a calming anchor** \[visual:
glowing cube batch2·8\]. One primary action per screen. The candidate
**never** sees scores, rankings, other candidates, or the rubric.
Everything communicates: *this process is transparent, fair, and you are
safe.* This calm-clarity is itself the brand proof --- the candidate
experiences the \"white box\" as reassurance, not surveillance.

**Cross-cutting non-negotiables:** consent-first at every data step ·
anonymization messaging · transparent disclosure of AI use and
integrity-signal collection · mobile-first (many candidates are on
phones; but interview may require desktop Chromium --- surfaced early) ·
WCAG AA · reduced-motion path · multi-language from first screen.

**0 · CANDIDATE SHELL (chrome that frames every candidate screen)**

**0.1 Top bar --- 56px, minimal**

Left: WhiteBox wordmark (thin, wide-tracking, small cube glyph)
\[visual: Dune-thin wordmark batch1·9\]. Right: **language switcher**
(globe + code, e.g., EN), and --- once logged in --- a small avatar/menu
(profile, sign out). No dense nav; the candidate flow is linear, not a
dashboard.

**0.2 Progress rail (contextual, appears during the application flow)**

A slim horizontal **stepper** under the top bar showing the candidate\'s
journey: Code → Register → Profile → System Check → Interview →
Documents → Done. Current step iris-marked; completed steps get a check;
upcoming muted \[research: wizard progress; Mercor
completed-steps-never-expire\]. On mobile it collapses to \"Step 3 of
7\" mono label. This is the candidate\'s map --- it removes anxiety by
making the whole process legible up front.

**0.3 Canvas & tone**

\--void background, generous 24--32px padding, single centered content
column (max \~560px for forms, full-bleed for interview). The cube
anchor sits behind/above content at low presence, softly lit, slow prism
drift \[token: \--iris-gradient, prism-flash motion\]. Contour texture
at 4% only, subtle \[visual: contour batch2·3\]. No graph-paper grid
here (that\'s the HR \"instrument\" register) --- the candidate register
is calmer.

**0.4 Global states**

-   **Loading:** gentle skeleton or a slow cube-particle assemble
    \[visual: particle box batch2·9\] for longer waits --- never a harsh
    spinner.

-   **Error:** reassuring inline card, \--neg icon used sparingly,
    plain-language message + clear next step + support link. Never
    alarming.

-   **Reassurance strip:** a persistent, subtle line where relevant ---
    e.g., \"Your identity is hidden from evaluators. You\'re assessed on
    your answers.\" \[research: anonymization\].

-   **Autosave:** profile & progress autosave; \"Saved\" mono
    micro-toast.

-   **Accessibility:** captions, keyboard, screen-reader labels;
    reduced-motion swaps cube animation for a static render.

**1 · CODE ENTRY**

**Purpose:** enter the vacancy\'s competition code → land directly in
that specific competition \[research: unique competition code\].
**Route:** / or /join.

**Layout**

Centered, spacious, cube softly lit above. Single column \~440px.

-   **Headline:** \"Enter your competition code\" (h2, calm).

-   **Sub:** one line --- \"Your employer shared a code for this role.\"

-   **Code input:** large, **mono**, segmented or single field (e.g.,
    WBX-7Q4K), auto-uppercase, generous height, iris focus ring \[token:
    mono, \--iris focus\].

-   **Primary button:** \"Continue\" (disabled until code format valid)
    \[research: disabled-next\].

-   **Secondary link:** \"I don\'t have a code\" → help copy.

-   **Reassurance micro-line:** \"WhiteBox evaluates candidates fairly
    and transparently.\"

**States**

Default (empty), Invalid format (inline \--neg, \"Check the code and try
again\"), Not-found (code valid format but no vacancy → gentle error),
Loading (validating), Success → route to Register/Login.

**Data/API:** POST /join/validate-code. **Source:** competition code.
**Visual:** cube anchor, calm. **Tokens:** mono input, iris focus,
\--void.

**2 · REGISTRATION / LOGIN**

**Purpose:** create or sign into an account; assign anonymous internal
ID \[research: anonymization\]. **Route:** /auth (contextual to the
code).

**Layout**

Two-tab or toggle: **Sign up / Log in**. Single column \~440px.

-   **Sign up fields:** email · password (or magic-link / SSO options) ·
    confirm consent checkbox (\"I agree to the privacy terms and to
    AI-assisted evaluation\") --- **consent-first** \[research:
    consent-first\].

-   **Log in fields:** email · password / magic-link.

-   **Primary:** \"Create account\" / \"Log in\".

-   **After sign-up:** an **anonymous internal ID is auto-assigned**
    silently; a reassurance panel appears: *\"You\'ve been assigned an
    anonymous ID. From here, evaluators see only your answers --- not
    your name, photo, gender, or age --- until the final stage.\"*
    \[research: anonymization\]. This is a **trust moment**, rendered in
    an inverted white-box panel \[visual: inverted white-box batch2·1\]
    --- literally showing the candidate the \"transparent box\" they\'re
    entering.

**States**

Default, Validation errors (inline), Loading, Auth error (wrong password
→ clear message), Success → route to Profile. Password manager / SSO
friendly (Clerk/WorkOS) \[research: WorkOS/Clerk\].

**Data/API:** POST /auth/signup, POST /auth/login, auto POST
/candidate/assign-internal-id. **Source:** anonymization; consent-first.
**Visual:** inverted white-box for the trust moment. **Tokens:**
\--wb-paper panel, iris.

**3 · SHORT PROFILE FORM**

**Purpose:** capture only essentials; keep friction low \[research:
short profile\]. **Route:** /profile.

**Layout**

Single column, sectioned lightly (not a wizard --- one calm page with
autosave):

-   **Experience** (add roles: title, org, dates --- minimal).

-   **Education** (degree, institution, year).

-   **Skills** (tag input).

-   **Contacts** (email prefilled; phone optional).

-   **Links** (portfolio, GitHub, LinkedIn --- optional).

-   **Short bio** (small textarea, \"A few sentences about yourself\").

-   **Reassurance line:** \"Only what\'s needed. Your identity stays
    hidden from evaluators.\" \[research: anonymization\].

-   **Responsive disclosure:** optional fields expand on demand
    \[research: responsive disclosure\].

-   **Primary:** \"Save & continue\"; autosave with \"Saved\"
    micro-toast.

**States**

Default (empty), Partial (autosaved), Validation (only email required;
others optional --- low friction), Loading, Error. Progress rail
advances on continue.

**Data/API:** PUT /candidate/profile (autosave), advances on POST
/candidate/profile/complete. **Source:** short profile; low-friction
forms; anonymization. **Tokens:** calm inputs, iris focus.

**4 · PRE-INTERVIEW SYSTEM CHECK (gate)**

**Purpose:** ensure camera/mic/(consented screen-share) work before
starting; block start until ready \[research: Mercor gate\]. **Route:**
/interview/check.

**Layout**

Centered, guided. A checklist card with live status per item:

-   **Camera** --- live preview thumbnail; status pill (OK / NOT
    DETECTED) \[research: Vanta OK/Needs\].

-   **Microphone** --- live level meter.

-   **Screen-share** (if required, consented) --- explicit consent +
    preview; clearly labeled why (proctoring, advisory) \[research:
    Mercor screen-share; advisory integrity\].

-   **Browser check** --- \"Chromium-based browser required\" surfaced
    if not met \[research: Mercor Chromium\].

-   **Connection** --- bandwidth check.

-   **Consent block:** explicit disclosure --- \"This interview is
    AI-conducted. Integrity signals may be collected as advisory context
    for reviewers, never as automatic grounds for rejection.\"
    \[research: advisory integrity; consent-first\].

-   **\"Start Interview\" button --- DISABLED (grayed) until all checks
    pass** \[research: Mercor disabled-start\].

-   **Retake policy line:** \"You can retake up to a limited number of
    times; completed steps don\'t expire.\" \[research: Mercor
    retakes\].

**States**

Each check: pending / checking (spinner) / OK (\--pos) / failed
(\--neg + fix hint). Start disabled until all OK. Permission-denied →
guidance to enable. Loading (initializing devices).

**Data/API:** client-side device checks (MediaPipe/WebRTC probes)
\[research: MediaPipe/LiveKit\]; POST /interview/consent. **Source:**
Mercor gate + retakes + Chromium; advisory integrity; consent-first.
**Visual:** trust motif subtle \[visual: handshake batch3·3\].
**Tokens:** \--pos/\--neg status, disabled-until-valid.

**5 · AI VIDEO INTERVIEW ★ the main candidate experience**

**Purpose:** an adaptive, recruiter-like interview --- unique to each
candidate \[research: adaptive interview; BrightHire Screen\].
**Route:** /interview/live.

**Layout (full-bleed, calm-cinematic)**

-   **Candidate video** (self-view, corner or side).

-   **AI presence** --- not a fake human face; a **calm visual
    embodiment**: the glowing cube gently pulsing/prism-shifting as it
    \"listens\" and \"thinks\" \[visual: glowing cube batch2·8; particle
    box batch2·9; token: prism-flash, particle motion\]. This is
    on-brand and less uncanny than an avatar.

-   **Question display** --- current question in clean large type,
    appearing conversationally (not a rigid numbered list) \[research:
    adaptive, not pre-recorded\].

-   **Live captions / transcript** (optional toggle, accessibility).

-   **Gentle progress indicator** --- human-paced, no countdown
    pressure; approximate progress only.

-   **Controls** --- mic mute (with clear feedback), pause (if allowed),
    help.

-   **Voice option** --- voice-only or video; the AI interviewer speaks
    (TTS) and listens (STT) in real time \[research: realtime pipeline;
    ElevenLabs/Deepgram\].

**Behavior (what the AI does, felt by the candidate)**

Asks follow-ups; changes direction; checks answer consistency; returns
to earlier points; asks for real examples; evaluates depth of argument;
adapts difficulty; builds the interview individually --- **each
interview unique**, no universal answer set possible \[research:
adaptive interview\]. Pacing is natural (streaming), never robotic.

**States**

-   **Connecting** (particle-assemble loading \[visual: batch2·9\]).

-   **Active** (AI speaking / candidate answering --- clear turn
    indicator).

-   **Thinking** (cube pulse, \"...\" --- never a jarring wait)
    \[research: reasoning \"thinking\" pattern\].

-   **Reconnecting** (network drop → graceful recovery, no data loss).

-   **Paused / Error** (reassuring recovery).

-   **Complete** → confirmation + route to Documents (or Done).

**Data/API:** LiveKit room + Agents loop; STT (Deepgram/AssemblyAI) →
LLM (LangGraph adaptive agent) → TTS (ElevenLabs/Cartesia); transcript
persisted; video to Mux/R2 \[research:
LiveKit/LangGraph/Deepgram/ElevenLabs/Mux\]. **Source:** adaptive
interview; BrightHire Screen; realtime AI pipeline. **Visual:** cube as
AI presence; particle assemble. **Tokens:** iris (presence/active), calm
dark canvas.

**5.1 Anti-AI Integrity (background, advisory --- invisible-ish to
candidate beyond disclosure)**

Runs during the interview: possible signs of external assistance ---
unusually long delays, constant gaze shifts, window switching,
speech-rate mismatch, sudden answer-style changes, second-device
detection (only where user-permitted) \[research: advisory integrity\].
**Surfaced only as advisory context to HR; never automatic rejection.**
The candidate was told this up front (system-check consent); no
accusatory UI is shown to the candidate mid-interview (avoids
false-accusation stress) \[research: reduce false accusations\].
Client-side heuristics via MediaPipe where privacy-preferable
\[research: MediaPipe\].

**6 · DOCUMENT UPLOAD & VERIFICATION**

**Purpose:** let candidates substantiate claims; verify then delete
\[research: doc verification + auto-delete\]. **Route:** /documents.

**Layout**

-   Prompt: \"If you mentioned a diploma, certificates, experience, or
    achievements, you can upload proof.\"

-   **Upload zone** (drag-drop + browse), file-type/size hints, multiple
    files.

-   Per-file row: name · status (Uploading → Verifying → Verified /
    Could not verify) · a plain-language result line.

-   **Privacy notice (prominent):** \"After verification, your documents
    are automatically deleted. Only the verification result and
    structured info are kept.\" \[research: auto-delete\].

-   **Skip option:** \"Skip --- I\'ll rely on my interview\" (documents
    are supportive, not mandatory unless the vacancy requires them).

**Behavior**

AI extracts info → checks against the candidate\'s stated claims →
records result → **deletes the source document** (lifecycle + explicit
delete job); only verification result + structured data retained
\[research: OCR + LLM cross-check + delete\].

**States**

Empty (no uploads), Uploading (determinate progress), Verifying
(processing), Verified (\--pos), Not-verified (neutral, non-punitive
tone), Error (retry). Deletion confirmed with a mono \"Deleted after
verification\" note.

**Data/API:** POST /documents (upload), POST /ai/verify-document (OCR +
LLM), auto-delete job; GET /documents/results. **Source:** doc
verification + auto-delete; OCR (Textract/Document AI/Tesseract) + LLM.
**Tokens:** \--pos verified, determinate progress.

**7 · STATUS / RESULTS**

**Purpose:** clear, calm status; optional candidate-facing insight
\[research: HireVue candidate insight-report\]. **Route:** /status.

**Layout**

-   **Current status** --- one clear state: Submitted / Under review /
    Invited to next stage / Not moving forward (delivered gently, with
    dignity).

-   **Timeline** of the candidate\'s completed steps (mirrors the
    progress rail).

-   **Optional insight report** (only if the employer opts in):
    strengths / growth areas, non-punitive, empowering --- never a raw
    score, never a rank \[research: candidate insight report; no scores
    to candidate\].

-   **If invited:** next-stage details + the personalized invitation
    email content; scheduling link (Teams/Zoom/Meet).

-   **Reassurance / fairness note:** \"You were evaluated on your
    answers, with human review of the results.\" \[research: HITL
    human-final\].

**States**

Each status is a distinct calm layout. Empty (nothing yet → \"We\'ll
notify you\"), Loading, Error. Notifications (email + in-app) drive
candidates back here.

**Data/API:** GET /candidate/status, GET /candidate/insight-report (if
enabled). **Source:** candidate insight report; HITL human-final;
invitations. **Visual:** cube anchor calm. **Tokens:** status states,
dignified tone.

**CROSS-CUTTING CANDIDATE PRINCIPLES (applied on every screen)**

-   **Anonymization visible & reassuring** --- the candidate is
    repeatedly, calmly reminded their identity is hidden until final
    stage; rendered via inverted white-box \"trust\" panels at key
    moments \[research: anonymization; visual: white-box\].

-   **Consent-first** --- every data step (video, screen-share,
    integrity signals, documents) has explicit, plain-language consent
    \[research: consent-first; Illinois AIVIA; GDPR\].

-   **No scores, no ranking, no rubric** ever shown to the candidate ---
    protects fairness and prevents gaming \[research: adaptive interview
    integrity\].

-   **Human-paced, low-pressure** --- no aggressive countdowns; the AI
    is calm, the cube is soothing, the copy is dignified.

-   **Advisory-only integrity** --- never accuse mid-flow; never
    auto-reject \[research: reduce false accusations\].

-   **Storage transparency** --- documents auto-deleted;
    video/transcript retained only for evaluation, not model training,
    not sold \[research: Mercor storage; WhiteBox policy\].

-   **Accessibility & i18n** --- captions, keyboard, screen reader,
    reduced motion; multi-language interview & UI \[research:
    multilingual\].

-   **Mobile-aware** --- most steps mobile-friendly; interview
    desktop/Chromium requirement surfaced early at system check.

**SELF-CHECK --- coverage vs prior documents (nothing dropped)**

-   **Every candidate screen from Master Part VII present:** Code Entry
    · Register/Login (+ anonymization) · Profile Form · Pre-Interview
    System Check (gate) · AI Video Interview · Anti-AI Integrity
    (background) · Document Upload & Verification · Multimodal
    Assessment (produced server-side, candidate sees status) ·
    Status/Results (+ optional insight report) · Invitation received. ✔

-   **Research patterns carried:** Mercor (system-check gate with
    disabled start, retakes/never-expire, Chromium, screen-share
    proctoring, storage policy, radar is HR-side), BrightHire Screen
    (rubric-driven agent, structured interview, voice/video async),
    adaptive-interview behavior (follow-ups, consistency checks,
    difficulty adaptation, unique interview), advisory integrity
    (surfaced to HR only, no auto-reject, reduce false accusations), doc
    verification (OCR + LLM cross-check + auto-delete), candidate
    insight report (HireVue),
    consent-first/anonymization/HITL-human-final (XAI/HITL +
    compliance), realtime AI pipeline
    (LiveKit/LangGraph/Deepgram/ElevenLabs/Mux/MediaPipe), reassuring
    empty/loading (particle-assemble, no harsh spinners), progress
    stepper (wizard). ✔

-   **Visual refs woven:** glowing white cube as calm AI presence &
    anchor, particle-box for connecting/loading, inverted white-box
    panels for trust/anonymization moments, contour texture (subtle),
    thin Dune-wordmark, trust handshake at consent, iridescent accent
    for presence/active with dune-gold/ember swap. ✔

-   **Tokens:** consistent with Master Part III; candidate register =
    calmer spacing, no graph-paper grid (that\'s HR \"instrument\"
    register). ✔

-   **Note on multimodal assessment:** it is *produced* on the candidate
    side (their interview feeds it) but *displayed* on the HR side
    (scorecard) --- correctly split; candidate sees only status, never
    scores. ✔

**CAVEATS**

-   Dimensions and column widths are recommended defaults; the fixed
    part is the *ethos* (calm, spacious, single-action, reassurance,
    consent-first) and the *hierarchy*.

-   Where options appear (voice-only vs video; screen-share required or
    not; magic-link vs password vs SSO), all are viable --- pick per
    vacancy config and jurisdiction.

-   Interview desktop/Chromium requirement is a real constraint from the
    realtime stack; surface it before the candidate invests time (at
    code entry or profile), not only at the gate.

-   Compliance items (AIVIA consent, GDPR, data residency, EU AI Act
    high-risk transparency) are technical scaffolding; validate per
    jurisdiction with counsel.

-   HR side is specified in its own companion doc; this doc is
    candidate-side only. Both sit under the Master Product Vision.
