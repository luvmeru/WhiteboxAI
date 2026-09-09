# WhiteBox AI — Hiring Research Dossier

**The evidence base behind the vacancy builder, interview pipeline, and evaluation engine specified in [SPEC.md](SPEC.md).**

Compiled July 2026 from the industrial-organizational (I/O) psychology literature, vendor documentation, independent reviews, litigation records, and regulation. Four parts:

- **Part I — The science of selection.** Which hiring methods actually predict job performance, and by how much.
- **Part II — Competitor teardown: AI interview platforms.** HireVue, Sapia, Paradox, micro1, Mercor, Apriora, Willo, myInterview, Spark Hire, VidCruiter, the voice-AI crop, and the aggregators.
- **Part III — Competitor teardown: assessment platforms & structured-hiring ATSs.** TestGorilla, Vervoe, Harver, SHL, Criteria, the psychometrics-first crop, the technical screens, Greenhouse, Ashby, Lever/Workable/SmartRecruiters/Teamtailor, and job-board native flows.
- **Part IV — Regulation & operational patterns.** EU AI Act, NYC LL144, GDPR Art. 22, EEOC, candidate access patterns, proctoring, and outreach infrastructure.
- **Part V — Synthesis.** Where the whitespace is and the design principles WhiteBox derives from all of it.

---

# Part I — The Science of Selection

## I.1 Predictive validity: the league table

Two meta-analytic anchors define the field. **Schmidt & Hunter (1998)** synthesized 85 years of research across 19 selection procedures and made GMA (general mental ability) the canonical best predictor. **Sackett, Zhang, Berry & Lievens (2022, *Journal of Applied Psychology*)** overturned that hierarchy by showing prior estimates were inflated by systematic overcorrection for range restriction. The current consensus league table (operational validity against job performance):

| Method | Sackett et al. 2022 | Schmidt & Hunter 1998 |
|---|---|---|
| Structured interviews | **.42** | .51 |
| Job knowledge tests | **.40** | .48 |
| Empirically keyed biodata | **.38** | .35 |
| Work sample tests | **.33** | .54 |
| Cognitive ability (GMA) | **.31** | .51 |
| Integrity tests | **.31** | .41 |
| Assessment centers | **.29** | .37 |
| Situational judgment tests (knowledge) | **.26** | — |
| Interests (congruence-scored) | ≈.24 | .10 |
| Conscientiousness | ≈.19–.22 | .31 |
| Unstructured interviews | **.19** | .38 |
| Years of experience / education | ≤.10 | .18 / .10 |

Sackett et al. also paired validity with **subgroup differences (d)**: GMA carries d ≈ .7–.8 (largest adverse-impact potential), while structured interviews (d ≈ .2–.3), biodata (≈.3), personality (≈.0–.1), and integrity tests (≈.0) combine respectable validity with far smaller group differences. **Structured interviews are now the best validity-per-unit-of-adverse-impact predictor** — which is why they are the flagship block of the WhiteBox pipeline. Multi-predictor composites gain substantial incremental validity because predictor intercorrelations are modest (interview + job-knowledge + biodata is a canonical high-validity stack).

**→ Product implication:** show recruiters an estimated composite validity and adverse-impact profile for their configured block sequence; default templates to structured interview + job-knowledge/work-sample; flag GMA-heavy pipelines for diversity risk.

## I.2 Structured interviews

**Campion, Palmer & Campion (1997)** is the definitive taxonomy — **15 components of structure**. Content components: (1) base questions on job analysis, (2) ask identical questions of every candidate, (3) limit ad-lib prompting, (4) use better question types, (5) longer interviews / more questions, (6) control ancillary information (no résumé leakage into the interview), (7) defer candidate questions until after scoring. Evaluation components: (8) rate each answer separately, (9) use anchored rating scales, (10) take detailed notes, (11) multiple interviewers, (12) same interviewer(s) across candidates, (13) no discussion between interviews, (14) train interviewers, (15) combine ratings **statistically, not judgmentally**.

- **Question typology:** *Behavioral* (past-oriented; behavioral event interviewing, McClelland) elicits answers organized via **STAR** (Situation–Task–Action–Result) and variants (PARLA, SOAR, CARL). *Situational* questions (Latham et al. 1980) pose future hypotheticals scored against a key. Huffcutt et al. (2001): past-behavior questions retain validity for **high-complexity jobs**; situational items work well for lower-complexity, low-experience pools.
- **BARS** (behaviorally anchored rating scales; Smith & Kendall 1963): each scale point (typically 1–5) is anchored with a concrete behavioral exemplar derived from critical incidents. The US OPM structured-interview guide operationalizes this with per-question benchmark answers at low/medium/high levels.
- **Reliability:** Conway, Jako & Goodman (1995) — interrater reliability **.74 for panel interviews vs .44 for separate interviewers**; standardization of questions and of response evaluation are the strongest reliability moderators. Reliability caps validity (validity ≤ √reliability).
- **Mechanical beats clinical:** Kuncel et al. (2013) — holistic/judgmental combination of the same data loses roughly half the achievable validity versus algorithmic combination, even when the judges are experts. Highhouse (2008) documents the profession's "stubborn reliance on intuition."

**→ Product implication:** enforce structure by construction — locked question sets per vacancy version, per-question BARS, independent per-answer ratings, evidence capture, automatic mechanical aggregation. Never a single "overall gut score" field.

## I.3 Competency modeling & job analysis

The unit of measurement is the **KSAO** (Knowledge, Skills, Abilities, Other characteristics). Job analysis feeds competency models via the **critical incident technique** (Flanagan 1954) — behaviorally specific episodes of effective/ineffective performance, clustered into dimensions, doubling as BARS anchors and behavioral questions — plus task inventories with importance-frequency ratings. Best practice (Campion et al. 2011, "Doing competencies well"): 5–12 competencies per role, each with 3–5 behavioral proficiency levels.

Reference frameworks a platform should interoperate with:

- **SHL Universal Competency Framework / "Great Eight"** (Bartram 2005): Leading & Deciding; Supporting & Cooperating; Interacting & Presenting; Analysing & Interpreting; Creating & Conceptualising; Organising & Executing; Adapting & Coping; Enterprising & Performing — decomposed into 20 dimensions / 96+ components.
- **Korn Ferry Leadership Architect** (ex-Lominger, 38 competencies) — dominant in leadership assessment.
- **SFIA 9** (Oct 2024): 147 skills, 672 skill-level descriptions across 7 levels of responsibility — the de facto standard for tech roles.
- **O*NET-SOC** (1,016 occupations with KSAO data) and **ESCO v1.2** (3,039 occupations, ~13,900 skills, multilingual) — public taxonomies for auto-suggesting KSAOs from a job title/description.

**→ Product implication:** competency is a first-class entity; auto-draft a competency model from the JD via taxonomy lookup; every question, SJT item, and rating scale traces to a competency — that traceability is also the audit trail regulators expect.

## I.4 Psychometric assessments

- **Personality (Big Five / HEXACO):** conscientiousness is the generalizable Big Five predictor (Barrick & Mount 1991; ≈.19–.22 in Sackett 2022; contextualized "at-work" phrasing scores higher). HEXACO's Honesty-Humility incrementally predicts counterproductive work behavior. Applicant faking is real; mitigations: **forced-choice formats with Thurstonian IRT scoring** (e.g., OPQ32r), contextualization, verification probes in interview.
- **GMA:** validity rises with job complexity; cheap and predictive but the primary adverse-impact driver (d ≈ .8) — use late-stage, low-weight, or via job-knowledge proxies.
- **Integrity tests:** validity ≈.31 (Sackett 2022; the Ones vs. Van Iddekinge debate spans .18–.41); overt tests predict counterproductivity better than covert; near-zero subgroup differences.
- **SJTs:** low-fidelity simulations, validity ≈.26 (McDaniel et al. 2007). *Knowledge* instructions ("what is the best response?") load on GMA; *behavioral-tendency* instructions ("what would you do?") load on personality. Scoring keys: SME/expert, empirical, consensus, and hybrid — hybrid scoring yields the highest item validities. Lievens & Motowidlo (2016) reframe SJTs as measures of general domain knowledge, licensing context-light item writing.
- **Work samples / job tryouts:** "samples over signs" (Wernimont & Campbell 1968); validity .33 with excellent face validity and applicant reactions.
- **Assessment centers:** multi-exercise simulations — in-basket/e-tray, leaderless group discussion, role-play, case analysis, presentation — scored via the ORCE discipline (Observe–Record–Classify–Evaluate). The **exercise effect** (Sackett & Dreher 1982): variance clusters by exercise, not dimension — score exercises, aggregate mechanically.
- **Game-based assessments:** engagement and completion benefits documented; independent criterion validity thin relative to vendor claims — treat as experimental, demand local validation.

**→ Product implication:** every assessment block declares its constructs, instruction type, scoring key, and an **evidence level** ("meta-analytic / vendor-validated / experimental") visible to the recruiter at configuration time.

## I.5 Rating & scoring science

- **Reliability metrics:** ICC for continuous ratings; Cohen's/Fleiss kappa for categorical decisions; ≥.70 working floor. Independent pre-discussion ratings prevent conformity cascades.
- **Rater error taxonomy:** halo, leniency/severity, central tendency, contrast effects, similar-to-me, primacy/recency, confirmatory questioning. Idiosyncratic rater effects account for over half the variance in multi-rater ratings (Scullen et al. 2000) — the rater is the biggest instrument error.
- **Frame-of-reference (FOR) training:** best-evidenced fix — d = .83 for rating accuracy (Woehr & Huffcutt 1994; confirmed by Roch et al. 2012). FOR = teach a shared performance theory: dimension definitions, anchored exemplars, practice ratings with feedback.
- **Weighting:** **unit weights are robust** (Dawes 1979; Bobko, Roth & Buster 2007) — unit-weighted composites match regression weights in cross-validation unless N is very large. Rational/SME importance weights are acceptable and legally defensible when documented.
- **Combination models:** *compensatory* (weighted composite) vs **multiple-hurdle** (sequential non-compensatory cutoffs — cheaper, enforces must-have minima) vs *hybrid* (knockout hurdles, compensatory ranking after). Cut scores via the **Angoff method**. **Top-down selection** maximizes utility (Brogden–Cronbach–Gleser) but also maximizes adverse impact when subgroup d > 0; **banding** (Cascio et al. 1991) treats scores within a standard-error-of-difference band as statistically indistinguishable.

**→ Product implication:** default to independent structured ratings + mechanically aggregated weighted composites; support hurdle/compensatory/hybrid topologies; ship FOR calibration modules; surface per-reviewer analytics (leniency, halo, drift) and agreement dashboards.

## I.6 Bias & fairness

- **Adverse impact doctrine:** *Griggs v. Duke Power* (1971) + Uniform Guidelines (1978): a facially neutral procedure with disparate impact must be job-related and consistent with business necessity. **Four-fifths rule:** flag when a subgroup's selection rate < 80% of the highest group's; supplement with statistical tests at small n.
- **Predictive bias** is assessed via the Cleary regression model (slope/intercept differences by group) — distinct from impact.
- **Blind screening:** evidence is genuinely mixed. Résumé audit studies show large name-based callback gaps (Bertrand & Mullainathan 2004: ~50%), but mandatory CV anonymization in France *reduced* minority callbacks by stripping context (Behaghel et al. 2015); the famous orchestra-audition study (Goldin & Rouse 2000) is statistically weaker than its fame suggests. Anonymization helps most at the screening stage, applied selectively.
- **Diversity–validity tradeoff:** Ployhart & Holtz (2008) — the robust strategy is **broadening the KSAO space** (add low-d valid predictors, reduce unnecessary cognitive loading), not score adjustment (within-group norming is illegal in the US since CRA 1991). **Pareto-optimal composite weighting** (De Corte, Lievens & Sackett 2007) traces the validity-diversity frontier mathematically and is directly implementable in software.
- **Criterion contamination:** if the training criterion (supervisor ratings, "hired before" labels) already encodes bias, models inherit it — the mechanism behind Amazon's abandoned 2018 résumé model. Guard the criterion, not just the predictor.

**→ Product implication:** continuous adverse-impact monitoring per stage (4/5ths + significance tests), an audit evidence-pack generator, Pareto weighting as a composite option, selective anonymization toggles at the screening stage.

## I.7 Candidate experience & applicant reactions

**Gilliland (1993)** is the backbone: applicants judge selection against **10 procedural justice rules** — job-relatedness, opportunity to perform, reconsideration opportunity, consistency, feedback, selection information, honesty, interpersonal effectiveness, two-way communication, propriety of questions — plus distributive justice. **Opportunity to perform** and **job-relatedness** are the strongest levers. Favorability ordering is stable across countries (Hausknecht et al. 2004; Anderson et al. 2010): interviews and work samples best-liked; cognitive tests intermediate; personality/integrity/biodata lower.

Benchmarks (Talent Board CandE program; industry funnel data 2025–26):

- Winning organizations hold a **3–5 day disposition SLA** (a definitive answer to every candidate).
- ~6% of job-ad clickers complete applications; abandonment concentrates at application (~14%), scheduling (~20%), and interview (~32%) stages; top withdrawal reasons: time disrespected, process too long, pay mismatch.
- **Feedback provision is the cheapest experience multiplier** — even brief individualized feedback measurably raises fairness perceptions and re-application intent; most employers provide none.

**→ Product implication:** instrument stage-level drop-off and disposition SLA timers; auto-generate competency-grounded feedback (legally templated); budget total assessment time per pipeline; every block explains its job-relatedness to the candidate.

## I.8 Modern AI-specific practice

- **Asynchronous video interviews (AVIs):** design parameters (prep time, re-record attempts, response limits) shape impression management and reactions (Lukacik, Bourdage & Roulin 2022). Reactions to AVIs are systematically worse than to synchronous interviews (no two-way communication — a Gilliland violation); mitigations: transparency about scoring, human-review guarantees, re-record allowances, warm intro videos.
- **Nonverbal scoring is dead:** HireVue retired facial-expression analysis (Jan 2021) after the EPIC FTC complaint and an ORCAA audit — visual features contributed ~0.25% of model predictive power. Consensus: **score the transcript, not the face or voice** — nonverbal channels add bias surface (appearance, accent, disability) with near-zero validity payoff. The EU AI Act now outright bans emotion inference in the workplace.
- **LLM scoring best practice (2024–26 literature):** rubric-grounded prompts tied to BARS anchors; temperature 0 / self-consistency runs; **per-competency, not holistic, scoring** to limit halo; discriminant-validity and subgroup-fairness audits; human-in-the-loop finals; stored evidence quotes. Known LLM failure modes: rubric drift, verbosity/eloquence bias, inflated cross-dimension intercorrelations.
- **AI question generation:** works for interview and SJT items but requires SME review; generate from the competency model, not the résumé, to preserve cross-candidate consistency.
- **Adaptive/branching interviews:** free branching erodes the "same questions" structure component. The compromise is **anchored probing**: fixed base questions, a constrained pre-approved probe bank, scoring only against the fixed rubric.
- **Response integrity:** candidate AI-assistance roughly doubled during 2025 (~15% → ~35%). Detection stack: response-latency signatures, gaze/screen-switch analytics, linguistic consistency, similarity checks, ID/deepfake verification. Pure AI-text detectors have unacceptable false-positive rates — **never auto-reject on them**. The robust countermeasure is design, not surveillance: experience-specific probes, live verification follow-ups, disclosed AI-use policies.

**→ Product implication:** transcript-only scoring; every AI score is a rubric-cited, human-overridable recommendation; log model + prompt versions; anchored probing instead of free branching; integrity signals are review triggers, never verdicts.

---

# Part II — Competitor Teardown: AI Interview Platforms

*(As of July 2026. Pricing figures are third-party estimates where vendors don't publish; treat as ranges.)*

## II.1 HireVue (incl. Modern Hire, Sonru)

**What it is:** the enterprise incumbent — "skill validation" platform combining async/live video interviewing, validated psychometric assessments, scheduling, and (2025–26) agentic AI hiring agents. Acquired Sonru (2020), Modern Hire (2023, Virtual Job Tryout), Hireguide technology (Mar 2026).

**Interview/assessment block types**
- OnDemand (one-way) video interviews; structured live interviews with built-in guides and feedback capture; automated scheduling.
- Game-based assessments (cognition, personality/work style).
- **Virtual Job Tryout®** — 40+ job-specific simulations/SJTs (banking, healthcare, retail, manufacturing).
- Coding/technical: CodeVue lineage — 200+ coding assessments; data-analytics and language proficiency tests.
- Text/SMS conversational engagement; new voice-based AI Interviewer agent that qualifies candidates pre-apply.

**Vacancy/interview setup flow**
- Role templates + validated interview guides built by in-house IO psychologists (1,000+ job-specific guides); Builder maps questions to competencies with adverse-impact testing.
- Per-question config: think time (~30s typical), answer length (2–3 min), retakes 0–2, 3–8 questions ≈ 20 min total.
- ATS-triggered automation (Workday, SAP SF, SmartRecruiters); assessments/text-recruiting licensed as add-on modules.

**AI evaluation:** NLP scoring of transcribed answer *content* only (facial analysis retired 2020 after the EPIC FTC complaint); validated competency scores; explainability statements, third-party bias audits (NYC LL144), real-time bias checks, audit logs, diversity dashboards. Positioning: "AI assists, humans decide."

**Candidate flow:** ATS/email/SMS invite link → device check → unscored practice question → timed responses before a deadline; mobile completion; accommodations process; retakes per employer config.

**HITL:** recruiter dashboards with ranked candidates + recordings + transcripts; shareable evaluations, structured scorecards, team ratings; automated advance/reject messaging; ATS status sync.

**Pricing:** opaque, employee-count based. ~$35k/yr floor; mid-market $40–75k; enterprise $75–150k+; implementation $15–40k; assessments are paid add-ons.

**Strengths:** deepest validated content library; full stack from sourcing conversation to technical assessment; enterprise compliance tooling; massive scale.

**Criticisms:** EPIC's 2019 FTC complaint forced the facial-analysis retirement; Illinois BIPA class action (dismissed by stipulation Jan 2026, terms undisclosed); Mar 2025 ACLU/Public Justice EEOC + Colorado CRD complaint (deaf/Indigenous applicant denied captioning, ASR alleged to misscore deaf speech); persistent "talking to a wall" candidate-anxiety baggage; high cost and upsell complexity.

## II.2 Sapia.ai

**What it is:** mobile-first, untimed **chat** interview ("Smart Interviewer") inferring competencies and personality from text; positioned as the fairest interview format.

**Blocks:** structured text chat interview (5 open behavioral questions, 20–30 min, untimed); second-stage async video module; Talent Hub review workspace; Discover Insights analytics; Phai candidate career coach; generative chatbot that explains hiring decisions.

**Setup flow:** role-family templates with behavioral question libraries mapped to competencies; recruiters configure competency weighting and score bands; deliberately no per-question timers; behavioral (not situational) questions to resist gaming.

**AI evaluation:** NLP over text only — no video, audio, face, or demographic signals; language-based personality + communication + job-fit competencies; every score carries a rationale traceable to the candidate's actual responses; FAIR™ framework with published fairness testing; proprietary AI-generated-content detector (trained on 12M+ answers; found ~20% of candidates had ≥1 ChatGPT-assisted answer) plus paste-disabling and warnings.

**Candidate flow:** apply → SMS/email link → chat on any device; **every applicant is interviewed** (no résumé screen); each candidate receives a private personality profile + coaching tip; 9/10 satisfaction; strong accessibility (no camera, no timer).

**HITL:** ranked explainable shortlist in Talent Hub or inside the ATS; recruiters compare insights and decide who advances; automated status comms; real-time fairness dashboard.

**Pricing:** enterprise annual license (undisclosed). Customers: Woolworths, Qantas, Starbucks, BT, Holland & Barrett.

**Strengths:** best-in-class candidate experience + inclusion narrative; interviews 100% of applicants; explainability depth; text = cheap, fast, multilingual.

**Weaknesses:** text-only ceiling (no technical verification); the ChatGPT arms race is existential for chat format; language-based personality inference scientifically contested; small ecosystem.

## II.3 Paradox (Olivia)

**What it is:** conversational ATS built around assistant "Olivia" for high-volume hourly hiring; acquired by Workday (closed Oct 2025).

**Blocks:** SMS/WhatsApp/Messenger conversational apply + knockout screening; automated interview scheduling (multi-person, multi-location); Traitify visual personality assessments (~2 min); career-site chat; offer + onboarding automation. No native async video core.

**Setup flow:** requisition templates with per-role/location screening and knockout questions; volume caps auto-open/close jobs; calendar sync; franchise hierarchies.

**AI evaluation:** NLU intent handling + rules-based qualification (availability, certifications) rather than deep scoring; no public independent AEDT bias audit as of mid-2026.

**Candidate flow:** text-to-apply/QR entry; full apply <5 min in chat, résumé optional; 100+ languages; interview scheduled within ~10 min; no login ever.

**HITL:** hiring-manager mobile app; recruiters can take over any conversation; automated progression, offers, rejections.

**Pricing:** opaque; typical $25k–$150k+/yr, volume-based.

**Strengths:** category-best scheduling automation; "90% of hiring process automated"; dominant QSR/retail logos (McDonald's, Chipotle, GM); hours-to-hire outcomes.

**Weaknesses:** the 2025 McHire breach (~64M chat records exposed via "123456" admin credentials); screening too shallow for professional/judgment roles; opaque pricing; post-Workday roadmap uncertainty; missing bias-audit transparency.

## II.4 micro1

**What it is:** AI recruitment engine + expert marketplace whose interviewer **Zara** conducts real-time technical vetting; also standalone SaaS.

**Blocks:** conversational AI interview (voice+video, 20–40 min) with adaptive follow-ups; live in-browser coding; system-design discussion; auto-generated mock/practice interview; soft-skills assessment; **Ava** proctoring layer (gaze, tab focus, browser activity) + ID verification.

**Setup flow:** pick role template/skills; Zara generates JD- and résumé-tailored questions dynamically; 20+ languages; configurable integrity threshold (Integrity Score must clear 70% or auto-fail); composite "Vetting Score" = technical accuracy + communication clarity + integrity.

**AI evaluation:** LLM-based feedback system (published research); structured skills report — technical rubric + CEFR-style soft-skill rubric; candidates can request feedback.

**Candidate flow:** invite link, async anytime; mock first, then scored; passport/ID required at registration (friction).

**HITL:** marketplace placements get human expert calibration interviews before client submission; SaaS buyers get transcripts, recordings, ranked dashboards.

**Pricing:** marketplace embeds margin in contractor rates; SaaS ~$89/mo → $399/mo → custom enterprise.

**Strengths:** deepest technical vetting of the AI-native crop; adaptive questioning + strongest anti-cheat stack; frontier-lab credibility.

**Weaknesses:** Trustpilot/worker complaints (interview-harvesting job posts, ghosting, invasive ID); hiring managers report AI-passed candidates failing real interviews (calibration gap); little feedback to rejected candidates.

## II.5 Mercor

**What it is:** AI talent marketplace matching contractors (especially AI-training experts) via one reusable AI interview plus résumé parsing and semantic matching.

**Blocks:** ~20-min AI video interview generated from résumé + JD; résumé parsing into structured profiles; deep semantic search over résumés, GitHub, portfolios; persistent talent pools; interview reuse across roles.

**Setup flow:** employer-side is search/brief driven, not a recruiter-configured question-bank product; the engine assembles ranked shortlists automatically.

**AI evaluation:** transcription + LLM scoring fused with parsed profile + public-web signals into match rankings; minimal published explainability or bias-audit story.

**Candidate flow:** sign up → PDF résumé → single AI interview → auto-matched to paid work; transparent hourly rates.

**HITL:** client-side final interviews; little classic recruiter tooling.

**Pricing:** marketplace take-rate (~30% reported).

**Strengths:** speed and scale of matching; interview-once/apply-everywhere; explosive frontier-lab revenue.

**Weaknesses:** Scale AI trade-secrets lawsuit (Sept 2025); reported contractor wage cuts (Nov 2025); **major breach Mar 2026** (LiteLLM supply-chain attack, ~4TB stolen incl. SSNs and 40k+ candidate interview videos) → five lawsuits in a week; privacy criticism of aggressive profile scraping.

## II.6 Apriora ("Alex", now Alex AI)

**What it is:** real-time conversational AI interviewer — live two-way video/voice screening end-to-end; rebranded after reputational damage.

**Blocks:** live adaptive AI video interview; AI phone interview; technical screening Q&A; scheduling, reminders, email/SMS follow-ups; fraud detection + identity verification.

**Setup flow:** recruiter defines role, criteria, questions (or templates); Alex adapts follow-ups in real time; multilingual; screening criteria become the scoring rubric.

**AI evaluation:** per-criterion scores, transcripts, recordings, auto-summaries, rankings; cheating/identity flags.

**Candidate flow:** interview immediately after applying, 24/7, browser-based, employer-branded.

**HITL:** recruiter dashboards + shortlists + reports; ATS integrations.

**Pricing:** opaque, demo-led annual contracts.

**Strengths:** genuinely real-time conversational interviewing; zero scheduling latency.

**Weaknesses:** the viral 2024 "vertical bar Pilates" glitch loop (called "creepy"/"dystopian"; NBC covered AI-interview glitches); rebrand read as damage control; reported degradation with accents; general candidate resistance to bot interviewers.

## II.7 Willo

**What it is:** affordable async video/audio screening (Glasgow), used in 200+ countries; deliberately human-decision, light-AI.

**Blocks:** one-way video; audio-only; typed answers; multiple choice; file upload — mixable per interview; 1,500+ ready-made question sets; add-on digital identity, right-to-work, and criminal-background checks in the same flow. No live interviews.

**Setup flow:** templates or scratch; per-question format, answer duration caps, retake limits, thinking-time controls; deadlines; branded invites; custom scorecards (Scale tier); Greenhouse/Ashby/Zapier/API integrations.

**AI evaluation:** transcription (30+ languages) + AI summaries + cross-interview patterns; **no automated scoring or facial analysis by design** — humans decide.

**Candidate flow:** no account/app; link invite; any device; 18-language UI; practice/tech check; self-paced before deadline.

**HITL:** shared team review, ratings, comments, shortlist stages; bulk comms/rejections; completion analytics.

**Pricing:** Growth $209/mo; Scale $307/mo (annual billing); nonprofit discounts.

**Strengths:** price/simplicity; global multilingual reach; bundled identity/right-to-work verification; candidate-friendly.

**Weaknesses:** no AI ranking → manual review burden at volume; surface-level analytics; no live mode.

## II.8 myInterview

**What it is:** video screening with ML shortlisting for volume hiring; folded into Radancy's Talent Acquisition Cloud (2024–25).

**Blocks:** one-way video Q&A; text and multiple-choice questions; careers-widget and WhatsApp apply; Smart Shortlisting™ ML ranking; Word Cloud™ phrase filtering.

**Setup flow:** templates + question library; per-question time limits and retakes; embeddable widget; Greenhouse/Workable/JobAdder integrations.

**AI evaluation:** ML/NLP on transcripts ranks against desired qualities (historically Big-Five-flavored + keyword signals); no facial analysis claimed.

**Candidate flow:** no app/account, mobile-first, anytime.

**HITL:** stage-based shortlist buckets; multi-stakeholder ratings; shareable candidate sets; automated comms.

**Pricing:** legacy freemium ~$19–59/mo + enterprise; now unpublished under Radancy.

**Strengths:** frictionless candidate UX; early ML ranking for SMB.

**Weaknesses:** uncertain standalone future inside Radancy; reviewers say ML evidence is weak enough they still watch most videos; no depth (coding/live/assessments).

## II.9 Spark Hire

**What it is:** SMB/mid-market one-way + live video interviewing, expanded into a hiring suite (Comeet-based ATS, Chally assessments).

**Blocks:** one-way video; recorded live interviews; Chally behavioral assessment; AI-generated questions + scorecards from the JD; panel scheduling; branded video messages.

**Setup flow:** role question sets (manual or AI-generated); per-question think time, answer length, takes; deadlines; branded intro/outro; scorecard templates (Growth tier+).

**AI evaluation:** deliberately **no automated candidate scoring** — AI assists content creation and transcripts; evaluation is human ratings on structured scorecards.

**Candidate flow:** invite link + self-scheduling; practice question; **requires candidate account creation** (major friction; ~20–25% reported drop-off).

**HITL:** 5-star ratings + shareable scorecards, comments/tags, client-share links (agency-friendly), rejection emails, 40+ ATS integrations.

**Pricing:** Video Interviews from $299/mo; Growth $499/mo; Recruit ATS $299–499+/mo; annual billing.

**Strengths:** mature, easy, strong agency workflows; relatively transparent pricing; 6,000+ customers.

**Weaknesses:** account-creation drop-off; candidate stress about one-way format; recording glitches reported; scorecards paywalled.

## II.10 VidCruiter

**What it is:** modular enterprise hiring platform (Canada) — pre-recorded + live interview "rooms," scheduling, skills testing, automated reference checks, built around defensible structured rating.

**Blocks:** pre-recorded video; live rooms (panel support, branded waiting room with tech checks); audio interviews; scheduling; skills testing; in-person rating via mobile; **automated reference checks** (role-matched questionnaires, reminders, per-question weighting, fraud protection via IP/device matching).

**Setup flow:** deeply configurable multi-stage workflows; preset HR-approved questions with **structured rating guides (anchored scales) per question**; per-question weighting; auto-advance rules based on scores; per-question timing/retakes.

**AI evaluation:** intentionally light — structured human rating over algorithmic scoring (compliance positioning for government/education/healthcare); transcription assists; real-time scoring dashboards + audit trails.

**Candidate flow:** personalized waiting rooms, tech checks, reminders; multi-language; strong WCAG posture.

**HITL:** panel scorecards, comparison views, role-based permissions, full audit logs; references automated end-to-end.

**Pricing:** unpublished; ~$5k/yr entry per third-party data; modules priced separately; realistic $15k+.

**Strengths:** most defensible structured-rating story; unique reference-check automation; public-sector fit.

**Weaknesses:** dated UX, slow loads; steep setup needing vendor help; conspicuously light on AI for 2026.

## II.11 Voice-AI interviewer roundup

- **HeyMilo:** agentic voice+video AI for high-volume/staffing; phone or browser, 14+ languages, 24/7; per-question scoring vs. recruiter criteria; active proctoring + cheating classifier producing a **trust score**; ATS sync.
- **Ribbon (Recruit AI):** AI recruiter across voice/email/SMS; 1M+ interviews; auto summaries, rankings; 30+ ATS integrations, white-label; pay-per-completed-interview then tiers.
- **ConverzAI:** "Virtual Recruiter" for **staffing firms** (Microsoft-backed); sources from the agency's own database, then voice+text screens, qualifies, schedules, submits; SOC 2 II, HIPAA; claims AI bias audits.
- **Classet:** AI voice recruiter "Joy" for skilled trades/hourly; instant calls + texts on apply; no-code interview templates with custom tone, questions, FAQs.
- **Tengai:** Swedish "unbiased interview robot" (physical robot → digital avatar); structured blind screening replacing CV + phone screen; validated Five-Factor question set; psychometrician-validated; Nordic niche.

**Takeaway:** voice-AI commoditizes the phone screen (instant, 24/7, multilingual, per-interview pricing); differentiation shifts to proctoring/trust scores, staffing-workflow depth, and validated question science.

## II.12 Aggregators: LinkedIn Hiring Assistant / Indeed Smart Sourcing

- **LinkedIn Hiring Assistant** (GA late Sept 2025, bundled with Recruiter): conversational intake builds sourcing strategy → surfaces pipelines (career trajectory, skill adjacency) → pre-screens applicants → drafts outreach + follow-ups → learns from feedback; Feb 2026 added Teams collaboration. Claims: 81% fewer profiles reviewed per qualified match, 66% higher InMail acceptance. Microsoft disclosed ~$450M annualized run-rate for LinkedIn's agentic hiring products (Apr 2026). No interview block yet — it absorbs everything upstream of the interview.
- **Indeed Smart Sourcing:** 370M+ profiles; blended AI-matched + applicant lists; AI candidate summaries; **Sourcing Assistant** (May 2026) — agentic 24/7 find-engage-deliver. Pricing transparent: ~$120/mo Standard, ~$400/mo Professional, enterprise pooled.
- **Implication:** aggregators bundle agentic sourcing/screening with distribution they own. Interview platforms win only where aggregators stop: **structured, validated, explainable interview/assessment blocks, HITL scoring workflows, compliance-grade audit trails.**

---

# Part III — Competitor Teardown: Assessment Platforms & ATSs

## III.1 TestGorilla

**What it is:** self-serve multi-measure pre-hire testing; the volume leader in "assemble an assessment from a test library" UX.

**Role/assessment configuration UX:** create assessment → name + job role (suggests a recommended bundle) → pick **up to 5 tests** from **350–400+** (cognitive, Big-5/DISC/16-types personality, culture add, language, SJT, programming, software skills, typing) → add **up to 20 custom questions** (video-response, essay, multiple-choice, file-upload, coding) → **up to 5 untimed "qualifying questions"** up front acting as knockouts (auto-filter) → per-assessment settings: deadline, extra-time % (accessibility), snapshot toggle, ID verification. Library tests are fixed-form (~10 min), not editable. 2026: one-way and conversational AI video interviews, AI résumé scoring.

**Scoring & ranking:** % per test + weighted overall; **percentile vs. a comparison group** (disabled when extra time granted); benchmark bar vs. your pool and best performer; ranked table; stage labels.

**Team workflow/HITL:** multiple reviewers, 1–5 stars + notes on human-graded responses; bulk invite; bulk rejection with templated emails; ATS integrations.

**Anti-cheating (signature):** webcam snapshots every 30s, full-screen exit tracking, tab-switch logging, paste detection, devtools logging, IP/location dedup, integrity "tiers."

**Branding:** logo + brand color on landing, custom intro/outro video; logo removal is paid.

**Templates/presets:** role-based templates, clone assessments, saved custom-question sets.

**Pricing:** free plan; Core ~$1.6–1.7k/yr; Plus ~$4.8k/yr (custom tests, video, ATS/API, branding removal).

**Strengths/weaknesses:** + fastest time-to-first-assessment; strong knockout + anti-cheat defaults. – 5-test cap and fixed-form MCQ items feel shallow; 2026 reviews openly question MCQ testing in the AI-cheating era.

## III.2 Vervoe

**What it is:** AI-graded "skill trial" platform — simulates real job tasks and machine-grades open-ended work.

**Configuration UX:** start from **300+ I/O-built templates** or the **AI Assessment Builder** (paste a JD → bespoke assessment); fully editable. Question types are its moat: text, MCQ, video, audio, file upload, code (8 languages, auto-test-runner), and **immersive tasks inside live Google Docs/Sheets/Slides and Excel** plus customer-service simulations.

**Scoring & ranking:** three ML models — **"How"** (interaction telemetry), **"What"** (response content), **"Preference"** (learns the employer's grading taste). **Employers train the grader: score ~10 sample responses 1–10 and the model replicates the standard** (~80% claimed agreement). Auto-grades everything into a ranked leaderboard; manual override allowed.

**HITL:** customizable pipeline (invite → assess → shortlist → interview), auto-progression, team comments; human regrade loop feeds model improvement.

**Pricing:** freemium; ~$19–79/mo entry; enterprise custom.

**Strengths/weaknesses:** + closest existing analog to AI-graded realistic trials and employer-trained rubrics — study closely. – AI-grading explainability is its recurring criticism; weaker validated psychometrics; lighter anti-cheat.

## III.3 Harver (absorbed pymetrics + Outmatch)

**What it is:** enterprise **volume-hiring** assessment suite (retail, contact centers, logistics).

**Configuration UX:** solution-configured candidate **flows composed of modules**: cognitive tests, **pymetrics neuroscience game battery (12 games, 90+ traits)**, **SJTs with custom-branded scenario videos**, **culture-fit questionnaires with weighted value matrices**, typing/language, one-way video, scheduling, reference checking. 450+ validated assessments, 42 languages; embedded in the ATS apply flow via API.

**Scoring & ranking:** single **matching score vs. a role profile** (historically trained on incumbent top performers); funnel dashboards; adverse-impact/4-5ths monitoring; NYC LL144-friendly posture.

**HITL:** built for scale — auto-advance/auto-reject thresholds, bulk actions, automated comms; recruiters manage exceptions. 98% claimed completion on gamified flows.

**Branding:** fully white-labeled journey incl. branded SJT video content (a paid production service).

**Pricing:** enterprise annual (~$5k floor, typically far higher).

**Strengths/weaknesses:** + the reference for high-volume flow design and weighted culture matrices. – zero SMB self-serve; games are opaque to candidates and hiring managers (an explainability gap WhiteBox attacks).

## III.4 SHL

**What it is:** legacy enterprise psychometrics leader; the defensibility benchmark.

**Configuration UX:** anchored on the **Universal Competency Framework** ("Great 8" → 20 dimensions → 96+ components); setup = **job profiling** (job analysis with stakeholders) producing a **success profile** → in TalentCentral create a project, select and sequence instruments: **Verify** adaptive cognitive suite (with supervised re-test verification of unproctored sits), **OPQ32** personality (104 forced-choice blocks, 32 traits), motivation (MQ), SJTs, simulations, coding, video interviews.

**Scoring & ranking:** sten/percentile vs. **global norm groups** by industry/level/geography; OPQ auto-generates the Universal Competency Report predicting the Great 8; per-competency weighting in the success profile; auto-generated **interviewer guides** targeting weak/flagged competencies.

**HITL:** enterprise roles/permissions, batch invites, talent analytics.

**Pricing:** quote-based credits or annual license; expensive.

**Strengths/weaknesses:** + unmatched validity evidence, norms, legal defensibility, competency taxonomy (the model for WhiteBox's criteria ontology). – dated UX; consultant-led setup measured in weeks.

## III.5 Criteria Corp

**What it is:** mid-market testing (CCAT et al.) with flat-fee unlimited testing; now bundling structured video interviewing.

**Configuration UX:** pick position → platform **recommends a test battery + suggested score ranges from its job-norm database**; assemble from: CCAT (50 items/15 min; 10M+ administrations), game-based **Cognify** (cognitive) and **Emotify** (emotional intelligence), EPP/DISC personality, values alignment, risk/integrity, skills tests. **Interview Intelligence** (Alcami acquisition): structured interview guides — per-question rubrics and rating scales, one-way or live video, panel assignments, AI transcription/highlights.

**Scoring & ranking:** raw + percentile vs. norms; **suggested score ranges per role** act as soft cutoffs (a good pattern for cutoff UX); ranked lists; combined multi-test views.

**Pricing:** subscription with unlimited testing; ~$3–10k+/yr SMB reports.

**Strengths/weaknesses:** + validated aptitude + honest per-role score-range guidance; flat pricing removes per-test anxiety. – limited custom content/simulations.

## III.6 Psychometrics-first roundup

- **Plum:** one 25-min behavioral+cognitive survey per candidate, ever; role config = hiring team completes a **Role Model questionnaire** (vs. a 40k-job benchmark DB) → **Plum Match Score 0–100** per candidate per role; profiles reusable across roles.
- **Bryq:** single 20–30-min assessment (16PF-lineage + cognitive) + hard-skills tests; config: **Ideal Candidate Profile generated from the JD or calibrated on your top performers**; LL144-audit-friendly.
- **Alva Labs:** adaptive logic test + Big-5; pick one of 10 job-family test profiles; output = overall role-fit % with separate logic-fit and personality-fit %.
- **Arctic Shores:** **task-based (not self-report) gamified assessment** — 10–18 neuroscience mini-tasks, 25–35 min; marketed as inherently **GenAI-cheat-resistant**; 91% completion claim.
- **Equalture:** neuro-games benchmarking candidates **against your current team** (team members play the same games) to define the target profile.

**Shared pattern:** all reduce a role to a **target profile → single match %** — the primitive WhiteBox generalizes *with explainability*.

## III.7 Technical screens: HackerRank / CodeSignal / Codility / CoderPad

- **HackerRank:** **Screen** — role-based Certified Assessments (standardized, benchmarked, rotating items), largest question library, or **paste a JD for instant AI test generation**; question types: coding (auto-tested), MCQ, approximation, fill-in-blank, SQL, front-end, project-based; per-question scores/weights, duration, custom instructions. Anti-cheat: MOSS similarity + proprietary AI plagiarism model (93% accuracy claim), AI proctoring (2025), Secure Mode (full-screen lock, paste block, tab alerts). **Interview** live pads with **Scorecard Assist auto-filling structured rubrics from transcript/code/tests**; AI Interviewer product; community benchmark percentiles. Pricing: Starter $199/mo, Pro $449/mo, enterprise custom. Weakness: LeetCode-style leak-prone items; candidate-hostile reputation.
- **CodeSignal:** **Pre-Screen** with Certified Evaluations (e.g., GCA) — standardized, psychometrically calibrated, dynamic rotation; published **cut-score-setting guide**; composite score on a 200–600 framework scale + subskills. Integrity: Suspicion Score, **LeakSweep** (scans the web for leaked items), full proctoring with human review. Published data: cheating attempts 16% (2024) → **35% (2025)**, 40% entry-level. Weakness: standardized ≠ your job's tasks.
- **Codility:** **CodeCheck** async tests by stack/difficulty with role/seniority templates; **CodeLive** interviews; similarity check vs. 12M+ historical solutions + known AI patterns; device integrity scans (2026). Notable pivot: **Cody AI assistant inside the test — evaluates *how* candidates use AI** + auto-generated follow-up questions probing originality.
- **CoderPad:** interview-first; shared Question Bank (same materials per role); Take-Homes with time limits; **keystroke playback** for review; Screen (ex-CodinGame) auto-scored reports with comparative benchmarks. Simple per-seat pricing.

## III.8 Toggl Hire / Maki People / Xobin / iMocha

- **Toggl Hire:** skills-test-first **funnel builder** — role templates generate auto-scored quizzes; **pass-threshold auto-advances/auto-rejects**; async video intros; kanban pipeline; free tier. The closest to "assessment *is* the application form."
- **Maki People:** enterprise **conversational-AI screening layer on top of the ATS** — 300+ modular tests, **24/7 voice-AI screening in 45+ languages**, **Tomo interview copilot** (joins interviews, runs a competency-based structured plan, live-guides the interviewer, outputs competency-level evidence reports). 80+ Fortune-2000 clients (H&M, PwC, Deloitte). Watch closely — nearest to "AI-run structured evaluation as a service."
- **Xobin:** value-priced breadth — 3,000+ skill tests, 2,500 role assessments, psychometrics, video interviews, ATS-lite.
- **iMocha:** enterprise "skills intelligence" — 10,000+ test library (largest claimed), live coding, proctoring, and a **skills-ontology layer** (role → skills mapping, gap analysis) spanning hiring + upskilling.

## III.9 Greenhouse

**What it is:** the category-defining structured-hiring ATS; its vocabulary (scorecards, kits) is the industry lingua franca.

**Role configuration UX (the model to study):**
1. **Job kickoff** intake before opening the role — now accelerated by a **Job Kickoff Agent** that builds the job setup from notes/docs.
2. Define the **scorecard**: attributes grouped into **categories** (defaults: Skills, Personality Traits, Qualifications, Details; custom allowed), best practice ≤5–6 attributes/category.
3. Build the **interview plan**: stages, each with an **Interview Kit** = interviewer prep, question list mapped to attributes, note fields.
4. Assign **Focus Attributes** per interview (3–5 recommended; Greenhouse's own data: 31–38% higher scorecard comparability when used).
5. **Take-home test stages** with emailed instructions, time expectations, **grader anonymization**.
6. Custom application questions per job post (required/optional per board variant); job & offer **approval chains**.

**Scoring & ranking:** per-attribute ratings + overall verdict on **Strong No / No / Mixed / Yes / Strong Yes**; scorecard-completion tracking; hiring-decision rationale captured at offer; deliberately **no numeric composite ranking** — philosophy: structured human judgment over auto-scores.

**DE&I:** AI résumé anonymization, anonymized take-home grading, demographic surveys, inclusive job-post templates, DE&I reports.

**Templates/presets:** copy jobs with full scorecard/kit inheritance; office/department defaults; template libraries.

**Pricing:** Core/Plus/Pro, quote-based (historically ~$6.5k+/yr entry).

**Strengths/weaknesses:** + the canonical criteria taxonomy and interview-to-attribute mapping — WhiteBox's rubric builder should map cleanly onto scorecard/attribute/focus-attribute concepts. – assessments are integration-only; admin-heavy; no native quantitative ranking.

## III.10 Ashby

**What it is:** AI-native all-in-one (ATS + CRM + scheduling + analytics).

**Role configuration UX:** job setup wizard creates **job structure → interview plan (stages) → feedback forms → scheduling activities** in one flow; feedback forms are per-stage with configurable competencies and rating scales (typically 1–4), schema'd via API; **Candidate Reviews** module for structured hiring-manager screens.

**Scoring & ranking:** per-competency ratings aggregated in debrief views; **AI application review scores applicants against job criteria**; best-in-class pipeline analytics.

**AI (2026):** application review, candidate context retrieval, content generation, sourcing personalization, scheduling, note-taking, analytics; **AI Notetaker**; **auto-drafted feedback-form submissions (human reviews/edits/approves — the clean HITL pattern)**; AI debrief summaries; agents + MCP support.

**Pricing:** ~$400+/mo SMB reported; quote-based upward.

**Strengths/weaknesses:** + fastest role-setup flow in ATS-land; data-model rigor; credible AI layering. – no native assessments; scoring is interview-feedback-centric.

## III.11 Lever / Workable / SmartRecruiters / Teamtailor

- **Lever:** ATS+CRM; pipeline stages + Interview Plans with per-interview feedback forms (1–4 skill ratings); automation hub (stage-change triggers, auto-archive); **AI Screened integration pattern: auto-advance above a score threshold (default >4.0), auto-skip below (<3.0), per-role tunable**. Strength: sourcing/CRM nurture. Weakness: structure optional; assessments thin.
- **Workable:** SMB all-in-one with the most complete self-serve job flow: AI JD writer → post editor → **200+ board one-click distribution** → **screening questions with knockout auto-disqualify** (+ delayed auto-rejection emails) → Workable Assessments add-on ($59/mo) → AI Screening Assistant (scores/summarizes every applicant) → auto-generated **interview kits + scorecards**; 700+ JD templates; branded careers-page builder. Pricing public: $99/job; Starter $149/mo; Standard $299/mo; Premier $599/mo. Strength: end-to-end SMB flow incl. knockouts. Weakness: shallow assessments; add-on sprawl.
- **SmartRecruiters:** enterprise TA suite; job-ad builder + huge distribution marketplace; knockout screening with auto-reject; conditional screening questions rolling out; **SmartAssistant** AI match scores; ~600-vendor assessment marketplace rather than native tests. Strength: enterprise scale. Weakness: evaluation logic delegated to partners.
- **Teamtailor:** branding-first SMB/mid ATS; **best-in-class career-site builder** (block-based pages, cover images/video), job-ad editor with visual customization; **Triggers** on stage entry: send email/SMS/NPS, tag, send partner assessment, **Smart Move (auto-advance on screening answers)**, timed auto-reject emails; nurture campaigns; Copilot AI. Pricing by company size, ~$2,750/yr entry. Strength: candidate-facing polish + no-code automation. Weakness: light scoring rigor — "vibes + triggers."

## III.12 Job boards' native flows (the distribution layer WhiteBox plugs into)

- **Indeed:** posting attaches **screener questions**; library questions can be marked **"deal-breaker" → auto-move non-matches to Rejected** (recoverable, optional auto-rejection emails); custom-written questions cannot auto-reject. **Indeed discontinued its native Assessments module (Oct–Nov 2024, phased out through 2025) with no replacement** — no native skills testing on the world's biggest job site. Apply routes: **Indeed Apply** (native; ~30% more clicks; favored by ranking/pricing) vs. external redirect (loses tracking, converts worse).
- **LinkedIn:** screening questions from a template list (work authorization, years of experience, education, certifications, language, location) plus custom yes/no or numeric with an "ideal answer"; **"Must-have qualification"** filters; optional **auto-archive + automatic rejection email** (immediate or delayed); candidates bucketed Good fit / Maybe / Not a fit; Hiring Assistant pre-screens against qualifications. Easy Apply vs. external URL has the same redirect penalty.
- **Cross-board takeaway:** boards natively support only binary/numeric knockouts + auto-reject emails. Everything deeper must live at an external destination reached by link/invite — exactly WhiteBox's "job ad links to a destination with an access code" model. Design first-class: post-apply invite automation, codes that survive the redirect hop, completion telemetry, score write-back.

## III.13 Cross-cutting patterns worth stealing

1. **The universal config grammar:** role → criteria taxonomy (categories → attributes) → instruments mapped to criteria → weights → cutoffs/knockouts → ranked output. **No vendor exposes this whole chain transparently in one builder — that is WhiteBox's white-box opening.**
2. **Knockouts are always separate from scored items** (TestGorilla qualifying questions, Indeed deal-breakers, Workable disqualifiers) and always human-recoverable.
3. **Employer-trained grading** (Vervoe's grade-10-samples loop) and **AI-drafted-human-approved artifacts** (Ashby feedback drafts, HackerRank Scorecard Assist) are the accepted HITL patterns of 2026.
4. **Anti-cheat is table stakes** and shifting from "block AI" to "observe AI use" (Codility Cody); cheating attempts doubled to 35% in 2025.
5. **Cutoff guidance beats raw cutoffs** (Criteria's suggested ranges, CodeSignal's methodology); percentiles get suppressed when accommodations change conditions.
6. **Templates everywhere:** role-based presets + clone is baseline; JD-to-assessment generation is the 2026 standard for "step one" of a vacancy builder.

---

# Part IV — Regulation & Operational Patterns (July 2026)

## IV.1 The regulatory map

**EU AI Act (Reg. 2024/1689).** Employment/recruitment AI is **high-risk under Annex III(4)** (targeted ads, screening/filtering, candidate evaluation, promotion/termination decisions). Timeline as amended: prohibitions live since Feb 2, 2025 — **including the Art. 5(1)(f) ban on emotion-inference AI in the workplace** (directly bars emotion analysis of interview video). The **Digital Omnibus** (agreed May–June 2026) **postpones Annex III high-risk obligations from Aug 2, 2026 to Dec 2, 2027**, but **Art. 50 transparency duties (disclose AI interaction, mark AI content) still apply from Aug 2, 2026.** High-risk obligations to build for: risk management (Art. 9), data governance & bias examination (Art. 10), technical documentation (Art. 11), **automatic event logging** (Art. 12; logs ≥6 months), human oversight designed-in (Art. 14 — the overseer must understand the system, watch for automation bias, and be able to override/stop), accuracy/robustness (Art. 15). Deployer duties (Art. 26): competent human oversight, inform workers before use, inform affected persons, retain logs. **Art. 86 right to explanation:** an adversely affected person can demand "clear and meaningful explanations of the role of the AI system in the decision-making procedure and the main elements of the decision." Penalties to €35M/7% (prohibited practices).

**GDPR Art. 22 — applies now.** Prohibits decisions based solely on automated processing with significant effect (a hiring rejection qualifies) unless safeguarded: human intervention, right to express a view, right to contest. **CJEU SCHUFA (C-634/21, 2023):** a score that plays a "determining role" downstream *is itself* an Art. 22 automated decision — vendor scoring engines cannot hide behind the employer's formal sign-off, and **human review must be substantive, not ratification**.

**US federal:** EEOC ADA guidance (2022) — AI that "screens out" disabled candidates; duty of reasonable accommodation/alternative format. Title VII guidance (2023) — employer liable for vendors' tools; **four-fifths rule** as a rule of thumb. The **Uniform Guidelines (1978)** require validation (criterion/content/construct) of any selection procedure with adverse impact. Post-2025 the federal posture softened, but **private plaintiffs drive enforcement** and state law stands.

**States/cities:**
- **NYC Local Law 144** (enforced since July 2023): AEDTs require an **annual independent bias audit** with published **impact ratios** by sex, race/ethnicity, and intersectional categories; a **public results summary** on the careers site; **candidate notice ≥10 business days before use** including the qualifications/characteristics assessed and instructions to request an **alternative selection process or accommodation**. Penalties $500–$1,500/day.
- **Illinois:** AI Video Interview Act (since 2020) — pre-interview notice + explanation of how the AI works + written consent; video shared only with necessary evaluators; **deletion within 30 days of request** incl. backups. **HB 3773 (effective Jan 1, 2026):** civil-rights violation to use AI that discriminates (incl. ZIP-code proxies); notice required whenever AI is used "to influence or facilitate" employment decisions.
- **Colorado AI Act (SB 24-205):** duty of reasonable care, impact assessments, pre-decision notice, right to explanation + **appeal with human review**; effective date shifted to June 30, 2026, then paused by a federal court Apr 2026 — unsettled, but its notice/appeal architecture is the design target.
- **California:** FEHA ADS regulations (effective Oct 1, 2025) — discrimination via automated systems unlawful *even when a human makes the final call*; **anti-bias testing is a defense, its absence is evidence against you**; **retain ADS data/criteria/outputs 4 years**. CCPA ADMT regulations: hiring is a "significant decision"; pre-use notice, opt-out, access rights phase in Jan–Apr 2027.
- Others: Texas TRAIGA (Jan 2026, intent-based), NJ AG guidance (NJLAD reaches algorithmic discrimination), Maryland/Washington facial-recognition consent statutes.

**Litigation to design against:**
- **Mobley v. Workday:** court held an AI screening **vendor can be liable as an "agent" of employers** (2024); ADEA disparate-impact collective certified 2025; **nationwide notice authorized Feb 2026** (~1.1B applications in scope); Mar 2026: ADEA disparate-impact protects applicants. **The platform vendor is now a primary litigation target.**
- **EEOC v. iTutorGroup** (2023): $365K settlement — code auto-rejected women 55+/men 60+.
- **ACLU actions:** FTC complaint vs. Aon ("bias-free" marketing of personality tests); 2025 EEOC + Colorado CRD charge vs. Intuit/HireVue (Deaf Indigenous candidate denied CART captioning, downgraded by automated analysis).

## IV.2 What a compliant AI-hiring product must include

- **Notice & consent engine:** templated, versioned candidate disclosures with timestamps; jurisdiction rules (NYC 10-day clock, IL written consent, CA pre-use notice, EU "you are interacting with an AI system"); plain-language, translated, screen-reader-accessible.
- **Alternative process & accommodations:** a visible request path on every invite; requests tracked as first-class objects with SLAs; human-review track and format alternatives (untimed, oral, captioned). The Intuit/HireVue charge is the failure mode.
- **Bias-audit exports:** one-click dataset for independent auditors — selection/scoring rates, impact ratios, category sample sizes; publishable audit-summary page generator.
- **Human oversight that isn't rubber-stamping** (SCHUFA + Art. 14): the reviewer must see underlying evidence, not just the score; written rationale to confirm or override; UI friction against bulk-accepting recommendations; **instrument override rates and review dwell time** — 100% agreement in 3 seconds each is discoverable evidence of no meaningful review.
- **Retention schedule matrix:** per-artifact, per-jurisdiction retention (CA 4 years; IL video deletion ≤30 days on request; EU logs ≥6 months; GDPR minimization pulls the other way) with legal-hold override.
- **Model/prompt versioning:** every decision record pins model ID, prompt/rubric version, weights, threshold config; append-only audit log; re-scoring after a model change is a new, logged event.
- **Explainability artifacts:** per-candidate "main elements of the decision" in exportable human-readable form — not SHAP dumps. (CDT's critique of HireVue's "AI Explainability Statement": vague PDFs don't count.)
- **Risk management scaffolding:** templated impact assessments, annual review cadence, incident register.

## IV.3 Candidate access patterns

- **Unique invite links** are the dominant pattern (TestGorilla per-candidate URLs, Greenhouse take-home links); the link doubles as identity and resumes the session. **Access codes** suit scheduled, proctored, high-stakes events (Pearson VUE exam codes); a hybrid (link + short code printed on a poster/job ad) covers both.
- **Expiry/deadline windows:** assessment-level expiration + per-candidate deadlines; deadline stated in the invite; **max two reminder emails** (first within 48h if not started).
- **Re-entry after disconnect:** autosave + reopen-the-link resume for low stakes ("right where you left off"); human-approved reset/extension for proctored stages.
- **Tech-check/practice step is universal:** camera/mic permission check, unscored practice question, system test before any recorded step.
- **Accessibility:** WCAG 2.2 AA baseline (notably 3.3.8 Accessible Authentication — favors copy-pasteable codes and magic links); extra-time multipliers; untimed variants; captions + CART for video; keyboard-only operability; screen-reader-tested flows. HireVue lets any candidate request extra time regardless of employer settings. EU: EN 301 549 / European Accessibility Act (since June 2025).

## IV.4 Assessment integrity / proctoring

- **ID verification:** government ID capture + selfie facial comparison + human fallback — proportionate for finalist stages only.
- **Lockdown vs signal-based:** lockdown (forced fullscreen, paste block, multi-monitor block) prevents; signal-based (tab-focus/blur, paste logging, webcam snapshots, missing-face/multiple-face detection) records and flags for human review. Industry default post-2025: signals on, lockdown opt-in.
- **The AI-answer arms race:** typing-cadence and time-to-completion detectors are defeatable (timing-forgery demonstrated in 2026); transcription from a phone is undetectable by cadence. **Countermeasures that hold up:** honeypot content invisible to humans, "Trojan" constraints a copy-paster misses, and **live adaptive verification follow-ups ("why that choice over the standard alternative?")** — verification-by-questioning beats output detection. Detection is probabilistic evidence for a human reviewer, never auto-rejection (that would itself be an Art. 22 automated decision).
- **Deepfake/identity fraud:** Gartner predicts 1 in 4 candidate profiles fake by 2028; North Korean IT-worker fraud made it mainstream. Detection: liveness challenges (turn head, hand across face breaks overlays), lip-sync/blink artifacts, voice-liveness, device/IP forensics, consistency between typed and spoken performance.
- **Proportionality:** surveillance-heavy proctoring elevates test anxiety and distorts scores independent of ability; it's also an ADA trap (flagging atypical eye movement penalizes disabled candidates). Pre-communicate exactly what is monitored; match modality to stakes; skip emotion/eye-tracking entirely.

## IV.5 Results → outreach patterns

- **Bulk decisioning:** ATS norm is stage-based bulk advance/reject with templated emails. Under SCHUFA/Art. 22, an auto-send on threshold without human confirmation is a "solely automated decision" — the compliant pattern is **queue → human batch-confirm → dispatch**.
- **Rejection feedback:** written feedback is a discoverable record; risk rules: never reference protected characteristics or proxies; keep reasons tied to documented job criteria. GDPR/AI Act create an explanation right *on request* — so the pattern is **neutral rejection email + on-request structured explanation** generated from the audit log so the letter and the record never diverge.
- **Email infrastructure:** Google/Yahoo bulk-sender rules (enforced 2024, tightened Nov 2025) for 5k+ msgs/day: SPF + DKIM, **DMARC with From-domain alignment**, one-click List-Unsubscribe, **spam-complaint rate <0.1%**. Gmail API sending caps ~2,000/day (Workspace) — suits recruiter-voice low-volume mail with replies in the recruiter's real inbox; transactional providers (Postmark/SendGrid/SES) on a **dedicated sending subdomain** suit volume; warm up, suppression lists, DMARC ramp.
- **Mail-merge mechanics:** merge fields ({{first_name}}, {{job_name}}, {{assessment_link}}, {{deadline}}); invalid-token validation before send; scheduled sends in recipient-local business hours; batch cancel; reply detection via threading or inbound-parse webhook; open tracking is decaying signal (Apple MPP) — prefer click + reply.

## IV.6 Job-ad → external assessment flow

- **Post on boards, assess off-board:** LinkedIn "Apply" can redirect externally but must carry a **source-tracking code** (`src=`, `gh_src=` conventions); Indeed strongly favors native Indeed Apply, so the compliant funnel is **native quick-apply on the board → confirmation email/SMS carrying the unique assessment invite link + code**. Redirects must retain UTM parameters end-to-end or attribution dies.
- **Per-channel codes / source quality:** one code per board/campaign (LinkedIn, Indeed, niche boards, referral, QR-poster); measure applicants → assessment-started → passed → hired per channel; reinvest by cost-per-quality-applicant. Store utm_source/medium/campaign on the candidate record at first touch.
- **QR codes for hourly hiring:** poster/QR/text-to-apply; scan → a few qualifying questions in <60s → SMS with the assessment link; vendors report up to 8x application lift; each physical location gets its own code.
- **Employer-branded landing pages:** Teamtailor's model — drag-and-drop editor with brand tokens, reusable job-ad templates with image/video blocks, campaign pages per audience/channel. The landing page is also where the LL144 audit-summary link, AI-use notice, and accommodation route naturally live.

---

# Part V — Synthesis: The Whitespace

**Where every competitor falls short, in one sentence each:**

- **HireVue** scores opaquely at enterprise prices; explainability is a PDF, not a product.
- **Sapia** explains well but only does chat — no technical verification, no pipeline composition.
- **Paradox** automates logistics, not evaluation.
- **micro1/Mercor/Apriora** are marketplaces or point interviewers with thin employer-side configurability and weak governance stories (and, in Mercor's case, a catastrophic breach).
- **Willo/Spark Hire/myInterview** are recorders with ratings — no evaluation engine at all.
- **VidCruiter** has the structure but almost no AI.
- **TestGorilla** caps at 5 fixed-form tests; **Vervoe** grades opaquely; **Harver/SHL** need consultants and weeks.
- **Greenhouse/Ashby** own the structured-hiring vocabulary but delegate all measurement to integrations.
- **Job boards** offer binary knockouts only — and Indeed killed its own assessments product.

**The opening (nobody does all of these at once):**

1. **One transparent chain:** role → weighted criteria taxonomy → blocks mapped to criteria → per-question rubrics → per-block scores with evidence → composite with visible math → human decision with reasons → audit log. Every vendor exposes fragments; none exposes the chain.
2. **Blocks as named HR methods** with declared validity evidence (Part I's league table in the UI), not as generic "tests."
3. **Explainability as the product** — ranked drivers, evidence chips, reasoning traces, confidence phrases — which is precisely the existing WhiteBox differentiator.
4. **Compliance as architecture** (append-only audit, model/prompt pinning, notice engine, meaningful-review instrumentation) rather than a marketing page — Mobley v. Workday makes this the strongest sales argument.
5. **Structured-by-construction AI interviewing** — anchored probing, BARS-scored transcripts, mechanical aggregation — implementing the I/O gold standard that human processes fail to sustain at scale.

**Design principles carried into [SPEC.md](SPEC.md):**

1. Structured interview is the flagship block (best validity-per-adverse-impact).
2. Categories → attributes → weights (sum 100) is the criteria grammar; knockouts are separate from scored criteria and always human-recoverable.
3. BARS anchors on every scored question; per-competency scoring; mechanical aggregation; compensatory/hurdle/hybrid topologies.
4. Transcript-only AI scoring; no emotion inference anywhere; integrity signals advise, humans decide.
5. Every AI artifact is drafted-by-AI, approved-by-human.
6. Blocks declare their method basis, evidence level, and time cost; the pipeline shows total candidate time and a validity/adverse-impact estimate.
7. Presets, cloning, and JD-to-config generation are the entry points; everything stays editable with a visible "why."
8. Distribution designed for the board-redirect reality: landing page + per-channel codes + post-apply invite automation.
9. Queue → human batch-confirm → dispatch for all outbound decisions; disposition SLA timers; on-request structured explanations from the audit log.
10. The audit log is the source of truth for scores, decisions, notices, and exports.

---

## Sources

**Selection science:** Sackett et al. 2022 ([PubMed](https://pubmed.ncbi.nlm.nih.gov/34968080/), [PDF](https://filiplievens.squarespace.com/s/APL-2022-4078_R3.pdf)); [SIOP commentary](https://www.siop.org/tip-article/is-cognitive-ability-the-best-predictor-of-job-performance-new-research-says-its-time-to-think-again/); [Schmidt & Hunter 1998 summary](https://firstpersonnel.org/wp-content/uploads/2013/10/Summary-Schmidt-Hunter-1998.pdf); [Campion et al. 1997](https://onlinelibrary.wiley.com/doi/10.1111/j.1744-6570.1997.tb00709.x); [Levashina et al. 2014](http://www.morgeson.com/downloads/levashina_hartwell_morgeson_campion_2014.pdf); [OPM structured interviews](https://www.opm.gov/policy-data-oversight/assessment-and-selection/other-assessment-methods/structured-interviews/); [Kuncel et al. 2013](https://gwern.net/doc/statistics/prediction/2013-kuncel.pdf); [Conway et al. 1995](https://www.semanticscholar.org/paper/A-meta-analysis-of-interrater-and-internal-of-Conway-Jako/fe8803595807ee4da181798cfcea27c8d3aa4066); [Bartram 2005](https://pubmed.ncbi.nlm.nih.gov/16316273/); [SHL UCF whitepaper](https://www.shl.com/assets/campaigns/global/competency-fit/universal-competency-framework-whitepaper-en.pdf); [SFIA 9](https://sfia-online.org/en/sfia-9/sfia-9); [ESCO](https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/esco-v12); [O*NET](https://www.onetcenter.org/taxonomy.html); [McDaniel et al. 2007](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1744-6570.2007.00065.x); [SJT scoring](https://www.sciencedirect.com/science/article/abs/pii/S0001879117301422); [Kepes et al. 2025](https://journals.sagepub.com/doi/10.1177/01492063241288545); [Lievens & Motowidlo](https://www.cambridge.org/core/journals/industrial-and-organizational-psychology/article/situational-judgment-tests-from-measures-of-situational-judgment-to-measures-of-general-domain-knowledge/718BE0B998FE9FE2E91EF670879A4B82); [Barrick & Mount 1991](https://gwern.net/doc/psychology/personality/conscientiousness/1991-barrick.pdf); [HEXACO & CWB](https://sacsconsult.com.au/wp-content/uploads/2021/02/HEXACO-personality-predicts-counterproductive-work-behavior-and-organizational-citizenship-behavior-in-low-stakes-and-job-applicant-contexts.pdf); [Van Iddekinge et al.](https://pubmed.ncbi.nlm.nih.gov/21319880/); [Arthur et al. 2003](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1744-6570.2003.tb00146.x); [Roch et al. 2012](https://bpspsychub.onlinelibrary.wiley.com/doi/abs/10.1111/j.2044-8325.2011.02045.x); [Bobko et al. 2007](https://journals.sagepub.com/doi/abs/10.1177/1094428106294734); [Ployhart & Holtz 2008](https://onlinelibrary.wiley.com/doi/10.1111/j.1744-6570.2008.00109.x); [Goldin & Rouse](https://www.aeaweb.org/articles?id=10.1257%2Faer.90.4.715) + [Gelman critique](https://statmodeling.stat.columbia.edu/2019/05/11/did-blind-orchestra-auditions-really-benefit-women/); [Bauer et al. 2001 SPJS](https://onlinelibrary.wiley.com/doi/10.1111/j.1744-6570.2001.tb00097.x); [CandE benchmark](https://api.eremedia.com/wp-content/uploads/2024/02/2023-Global-CandE-Benchmark-Research-Report_FINAL.pdf); [3–5 day disposition rule](https://www.candidate-experience-institute.com/cande-2025-benchmark-the-3-to-5-day-decision-rule-that-separates-award-winners-from-everyone-else); [drop-off rates](https://www.pin.com/blog/applicant-drop-off-rates/); [SHRM on HireVue facial analysis](https://www.shrm.org/topics-tools/news/talent-acquisition/hirevue-discontinues-facial-analysis-screening); [Lukacik et al. AVI](https://onlinelibrary.wiley.com/doi/10.1111/ijsa.12511); [LLM interview scoring](https://www.researchgate.net/publication/403780997_Scoring_employment_interviews_with_large_language_models_Evaluation_design_components_validity_investigations_and_best_practice_recommendations); [LLM HR transcripts](https://arxiv.org/pdf/2504.05683); [LLM SJT items](https://arxiv.org/pdf/2412.12144).

**AI interview platforms:** [HireVue platform](https://www.hirevue.com/platform/online-video-interviewing-software) · [assessments](https://www.hirevue.com/platform/assessment-software) · [VJT](https://www.hirevue.com/platform/assessment-software/virtual-job-tryout) · [AI agents](https://www.hirevue.com/platform/ai-hiring-agents) · [Hireguide acquisition](https://www.hirevue.com/press-release/hirevue-acquires-hireguide-technology-to-accelerate-agentic-ai-hiring) · [EPIC complaint](https://epic.org/documents/in-re-hirevue/) · [HireVue lawsuits](https://legalclarity.org/hirevue-lawsuit-every-major-legal-challenge-so-far/) · [ACLU/Intuit charge](https://www.hrdive.com/news/ai-intuit-hirevue-deaf-indigenous-employee-discrimination-aclu/743273/) · [Sapia interview](https://sapia.ai/platform/interview/) · [Sapia explainer](https://sapia.ai/candidate-explainer/) · [Sapia on ChatGPT cheating](https://sapia.ai/resources/blog/mitigating-the-risk-of-cheating-with-chatgpt-in-online-chat-interviews/) · [Paradox](https://www.paradox.ai/products/conversational-ats) · [micro1 interview guide](https://www.micro1.ai/ai-interview-guide) · [Zara research](https://www.micro1.ai/research/zara-an-llm-based-candidate-interview-feedback-system) · [Mercor data policy](https://talent.docs.mercor.com/policies/data-ai-usage) · [Mercor breach](https://kaizenailab.com/blog/mercor-data-breach-five-lawsuits-ai-training-contractor-risk-2026/) · [Scale v. Mercor](https://www.techbuzz.ai/articles/scale-ai-sues-rival-mercor-over-alleged-customer-theft) · [Apriora](https://www.apriora.ai/) · [NBC on AI interview glitches](https://www.nbcnews.com/tech/innovation/ai-job-recruiters-used-top-companies-glitches-rcna215128) · [Willo pricing](https://www.willo.video/pricing) · [Willo Intelligence](https://www.willo.video/intelligence) · [myInterview review](https://www.hiretruffle.com/blog/myinterview) · [Spark Hire](https://www.sparkhire.com/one-way-video-interview/) · [VidCruiter](https://vidcruiter.com/recruitment-automation/software/) · [HeyMilo](https://www.heymilo.ai/product-feature/ai-voice-interview) · [Ribbon](https://www.ribbon.ai/) · [ConverzAI](https://www.converzai.com/virtual-recruiter/) · [Classet](https://www.classet.ai/) · [Tengai](https://tengai.io/resources/tengai-robot/) · [LinkedIn Hiring Assistant](https://business.linkedin.com/hire/hiring-assistant) · [Indeed Smart Sourcing](https://www.indeed.com/employers/smart-sourcing).

**Assessment & ATS:** [TestGorilla tests guide](https://support.testgorilla.com/hc/en-us/articles/9027723634331-Comprehensive-guide-to-tests) · [anti-cheating](https://support.testgorilla.com/hc/en-us/articles/9028797639451-Understanding-anti-cheating-measures-and-behavior-tiers) · [pricing](https://www.testgorilla.com/pricing/) · [Vervoe AI](https://help.vervoe.com/hc/en-us/articles/4407259075732-How-Vervoe-s-AI-Works) · [question types](https://help.vervoe.com/hc/en-us/articles/22941758548244-Question-Types) · [Harver](https://harver.com/gamified-assessments/) · [SHL OPQ](https://www.shl.com/products/assessments/personality-assessment/shl-occupational-personality-questionnaire-opq/) · [SHL UCF](https://connectingcredentials.org/wp-content/uploads/2015/02/The-SHL-Universal-Competency-Framework.pdf) · [Criteria CCAT](https://www.criteriacorp.com/assess/cognitive-aptitude/criteria-cognitive-aptitude-test-ccat) · [Plum](https://www.plum.io/plum-for-hiring) · [Bryq](https://www.bryq.com/) · [Alva Labs](https://help.alvalabs.io/en/articles/2812347-how-to-review-the-candidate-assessment-results) · [Arctic Shores](https://www.arcticshores.com/) · [Equalture](https://www.equalture.com/blog/comparison-between-alva-labs-test-gorilla-arctic-shores-equalture/) · [HackerRank Screen](https://www.hackerrank.com/products/screen) · [AI plagiarism](https://support.hackerrank.com/articles/8000786908-ai-plagiarism-detection) · [CodeSignal fraud](https://codesignal.com/cheating-and-fraud/) · [cut scores](https://support.codesignal.com/hc/en-us/articles/23458723018391-Guide-to-Setting-Cut-Scores) · [Codility similarity](https://support.codility.com/hc/en-us/articles/360043825273-Similarity-Check-and-what-to-do) · [Codility AI-cheating](https://www.codility.com/blog/detecting-ai-cheating-technical-assessment-integrity/) · [CoderPad question bank](https://coderpad.io/resources/docs/interview/question-bank/) · [Maki People](https://www.makipeople.com/) · [iMocha](https://www.imocha.io/) · [Greenhouse structured hiring](https://support.greenhouse.io/hc/en-us/articles/360039539772-Structured-hiring-guide) · [scorecards](https://support.greenhouse.io/hc/en-us/articles/4414777492891-Scorecard-overview) · [focus attributes](https://www.greenhouse.com/guidance/how-focus-attributes-improve-comparability-of-interview-scorecards) · [DE&I features](https://support.greenhouse.io/hc/en-us/articles/360004977491-DE-I-interviewing-features) · [Ashby AI](https://docs.ashbyhq.com/ai-features-in-ashby) · [Candidate Reviews](https://www.ashbyhq.com/product-updates/candidate-reviews) · [Lever AI Screened](https://help.lever.co/hc/en-us/articles/21614057853341-Enabling-and-using-the-AI-Screened-integration) · [Workable pricing](https://www.pin.com/blog/workable-pricing/) · [SmartRecruiters AI](https://www.smartrecruiters.com/recruiting-software/ai-recruiting-technology/) · [Teamtailor triggers](https://support.teamtailor.com/en/articles/1475768-triggers) · [Smart Move](https://support.teamtailor.com/en/articles/2144054-use-smart-move) · [Indeed screener questions](https://www.indeed.com/hire/resources/howtohub/how-to-use-screener-questions-on-indeed) · [Indeed assessments discontinued](https://support.indeed.com/hc/en-us/articles/30539516013837-Product-Update-Indeed-is-Discontinuing-Assessments) · [LinkedIn screening questions](https://www.linkedin.com/help/linkedin/answer/a519651/add-screening-questions-to-your-job-post).

**Regulation & patterns:** [AI Act Annex III](https://artificialintelligenceact.eu/annex/3/) · [Art. 26](https://artificialintelligenceact.eu/article/26/) · [Art. 86](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-86) · [Digital Omnibus](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/) · [SCHUFA rulings](https://iapp.org/news/a/key-takeaways-from-the-cjeus-recent-automated-decision-making-rulings) · [NYC DCWP AEDT](https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page) · [NY Comptroller LL144 audit](https://www.osc.ny.gov/state-agencies/audits/2025/12/02/enforcement-local-law-144-automated-employment-decision-tools) · [820 ILCS 42](https://www.ilga.gov/Legislation/ILCS/Articles?ActID=4015&ChapterID=68) · [IL HB 3773](https://natlawreview.com/article/illinois-anti-discrimination-law-address-ai-goes-effect-1-january-2026) · [Colorado SB 24-205](https://leg.colorado.gov/bills/sb24-205) · [CO delay](https://www.theemployerreport.com/2026/05/ai-regulation-on-hold-in-colorado-but-employer-risk-isnt/) · [CA ADMT](https://cppa.ca.gov/announcements/2025/20250923.html) · [CA FEHA ADS](https://calcivilrights.ca.gov/2025/06/30/civil-rights-council-secures-approval-for-regulations-to-protect-against-employment-discrimination-related-to-artificial-intelligence/) · [EEOC Title VII AI guidance](https://www.mayerbrown.com/en/insights/publications/2023/07/eeoc-issues-title-vii-guidance-on-employer-use-of-ai-other-algorithmicdecisionmaking-tools) · [Mobley v. Workday](https://clearinghouse.net/case/44074/) · [Mobley analysis](https://www.maynardnexsen.com/publication-emerging-liability-for-ai-driven-hiring-tools-key-developments-in-mobley-v-workday-inc) · [ACLU v. Aon](https://www.aclu.org/press-releases/aclu-files-ftc-complaint-against-major-hiring-technology-vendor-for-deceptively-marketing-online-hiring-tests-as-bias-free) · [TestGorilla invites](https://candidates.testgorilla.com/hc/en-us/articles/30851952223387-Common-questions-about-invitations-and-emails) · [OnVUE](https://www.pearsonvue.com/us/en/onvue/tips.html) · [magic links](https://supertokens.com/blog/magiclinks) · [HackerRank proctor mode](https://support.hackerrank.com/articles/5663779659-proctor-mode) · [keystroke forgery](https://arxiv.org/pdf/2601.17280) · [Pindrop deepfakes](https://www.pindrop.com/article/growing-trend-of-deepfakes-in-interviews/) · [NK IT-worker fraud](https://www.axios.com/2025/08/19/north-korea-it-worker-fraud-fortune-500) · [proctoring review](https://onlinelibrary.wiley.com/doi/10.1111/hequ.12506) · [Campion 2025 remote proctoring](https://onlinelibrary.wiley.com/doi/full/10.1002/hrm.22297) · [HireVue accessibility](https://www.hirevue.com/blog/hiring/ensuring-accessibility-accommodations-in-your-hiring-software) · [CDT on HireVue explainability](https://cdt.org/insights/hirevue-ai-explainability-statement-mostly-fails-to-explain-what-it-does/) · [Greenhouse bulk actions](https://support.greenhouse.io/hc/en-us/articles/360050950892-Email-candidates-in-bulk) · [Gmail sender guidelines](https://support.google.com/a/answer/14229414) · [LinkedIn source tracking](https://www.linkedin.com/help/recruiter/answer/a1431748) · [Indeed ATS integration](https://www.indeed.com/hire/ats-integration) · [text-to-apply](https://www.workstream.us/blog/text-apply-software-hourly-hiring) · [QR recruitment](https://bitly.com/blog/qr-codes-for-recruitment/) · [Teamtailor career sites](https://www.teamtailor.com/en/employer-branding/).
