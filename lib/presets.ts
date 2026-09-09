/* ============================================================
   BUILT-IN PRESETS — SPEC §5 (role-family presets per industry pack)
   Three complete VacancyV2 payloads with populated criteria (BARS
   per SPEC §4.3.2) and pipelines (SPEC §4.4). Method rationale is
   stated inline per built-in; every method still requires job-expert review,
   accessibility checks and validation for its actual role and population.
   instantiatePreset = deep copy + fresh ids (SPEC §5 "instantiate").
   Pure TS — no React, no side effects.
   ============================================================ */

import type {
  AccessibilityConfig,
  AttributeSpec,
  BlockSettings,
  CandidateExperienceConfig,
  CategorySpec,
  GovernanceConfig,
  IntegrityTier,
  InterviewQuestion,
  KnockoutItem,
  PipelineBlock,
  Preset,
  Rubric,
  ScoringPolicy,
  SjtItem,
  VacancyV2,
} from "./types";

/* ———————————————————————— shared builders ———————————————————————— */

type Five = [string, string, string, string, string];

const a11y = (): AccessibilityConfig => ({
  extraTimeMultiplier: 1,
  captions: true,
  screenReaderMode: false,
  alternativeFormats: false,
});

const rubric = (id: string, attributeId: string, anchors: Five): Rubric => ({
  id,
  attributeId,
  anchors,
  version: 1,
});

/* behavioral video question used by the launch-ready structured interview */
const vidQ = (
  id: string,
  attributeId: string,
  text: string,
  probes: [string, string],
  anchors: Five,
  rationale?: string,
): InterviewQuestion => ({
  id,
  text,
  attributeId,
  type: "behavioral",
  thinkTimeSec: 60,
  answerCapSec: 180,
  modality: "video",
  reRecordAttempts: 1,
  notesAllowed: false,
  probes,
  rubric: rubric(`${id}-rub`, attributeId, anchors),
  source: "bank",
  rationale,
});

/* situational text question (chat_interview, SPEC §4.4.6) */
const chatQ = (
  id: string,
  attributeId: string,
  text: string,
  probes: [string, string],
  anchors: Five,
  rationale?: string,
): InterviewQuestion => ({
  id,
  text,
  attributeId,
  type: "situational",
  thinkTimeSec: null,
  answerCapSec: 300,
  modality: "text",
  reRecordAttempts: 0,
  notesAllowed: true,
  probes,
  rubric: rubric(`${id}-rub`, attributeId, anchors),
  source: "bank",
  rationale,
});

const sjtItem = (
  id: string,
  attributeId: string,
  scenario: string,
  options: [string, number][],
): SjtItem => ({
  id,
  scenario,
  mediaKind: "text",
  options: options.map(([text, keyScore], i) => ({ id: `${id}-o${i + 1}`, text, keyScore })),
  attributeId,
  smeReviewed: true,
});

const attr = (
  id: string,
  name: string,
  kind: AttributeSpec["kind"],
  weight: number,
  definition: string,
  anchors: Five,
  opts: {
    focus?: boolean;
    mustHave?: AttributeSpec["mustHave"];
    verification?: AttributeSpec["verification"];
    rationale?: string;
  } = {},
): AttributeSpec => ({
  id,
  name,
  kind,
  definition,
  weight,
  focus: opts.focus,
  mustHave: opts.mustHave,
  scale: { anchors },
  verification: opts.verification ?? "interview",
  rationale: opts.rationale,
});

const blk = (
  id: string,
  order: number,
  title: string,
  candidateIntro: string,
  estimatedMinutes: number,
  measures: { attributeId: string; share: number }[],
  settings: BlockSettings,
  opts: {
    scored?: boolean;
    integrityTier?: IntegrityTier;
    gate?: PipelineBlock["gate"];
    deadlineOffsetHours?: number;
  } = {},
): PipelineBlock => ({
  id,
  kind: settings.kind,
  order,
  title,
  candidateIntro,
  required: true,
  scored: opts.scored ?? true,
  estimatedMinutes,
  gate: opts.gate,
  measures,
  settings,
  integrityTier: opts.integrityTier ?? 0,
  accessibility: a11y(),
  retakePolicy: 1,
  deadlineOffsetHours: opts.deadlineOffsetHours,
});

const scoringPolicy = (
  threshold: number,
  tieBreakers: ScoringPolicy["tieBreakers"],
  bandingEnabled = false,
): ScoringPolicy => ({
  topology: "hybrid", // knockouts + gates non-compensatory, rest compensatory (SPEC §4.5 default)
  weighting: "rational",
  threshold,
  banding: { enabled: bandingEnabled, sedWidth: 3 },
  tieBreakers,
  anonymization: { maskPII: true, revealAtStage: "invited" },
  abstainPolicy: { minEvidencePerAttribute: 1, onAbstain: "flag_human" },
  normalization: "absolute_rubric",
});

const experienceCfg = (
  tone: CandidateExperienceConfig["tone"],
  companyBlurb: string,
  consentCheckpoints: CandidateExperienceConfig["notices"]["consentCheckpoints"],
): CandidateExperienceConfig => ({
  landing: { showCompensation: true, companyBlurb },
  notices: {
    jurisdictionProfile: "EU",
    aiDisclosure:
      "AI helps evaluate parts of this application against published, job-related criteria. Only what you say and submit is scored — never your appearance or voice. A person reviews every decision, and you can request an explanation of your result.",
    retentionDays: 180,
    consentCheckpoints,
    version: 1,
  },
  comms: {
    confirmationEnabled: true,
    reminderCadence: 1,
    dispositionSlaDays: 5, // R-I.7 winning benchmark
    feedbackOffer: true,
    senderIdentity: "org",
  },
  tone,
});

const governanceCfg = (): GovernanceConfig => ({
  roles: [], // assigned per org at instantiation; preflight blocks publish until ≥1 reviewer
  reviewPolicy: { independentReviews: 1, assignment: "round_robin" },
  calibrationRequired: true,
  dualControlThreshold: 25,
  slaTargets: { reviewQueueHours: 48, dispositionDays: 5 },
  changeControl: { editLive: ["Owner"], pauseClose: ["Owner", "HiringManager"] },
});

/* ============================================================
   PRESET 1 — Retail Store Associate (hourly, retail_hourly pack)
   Method rationale: situational questions instead of behavioral for
   low-complexity, low-experience pools (Huffcutt moderator, R-I.2);
   behavioral-tendency SJT keeps the scenarios close to the work; any
   overt integrity module requires a named instrument, documented cash/shrink
   relevance, accessibility review and local outcome/fairness monitoring.
   ============================================================ */

const RT_CF_ANCHORS: Five = [
  "Waits to be approached and hands off any non-routine request without attempting a first step.",
  "Answers direct questions accurately but doesn't check whether the customer's problem was actually solved.",
  "Greets customers, asks what they need, and either resolves it or walks them to someone who can.",
  "Picks up unspoken signals — a customer circling an aisle or re-reading a label — offers specific help, and confirms the problem is solved before moving on.",
  "Handles several customers at once without dropping any, resolves complaints on the spot within policy, and flags recurring causes so they stop happening.",
];

const RT_COMM_ANCHORS: Five = [
  "Gives vague or contradictory information; customers walk away and re-ask someone else.",
  "Is factually accurate but leans on store jargon; customers often leave unsure what to do next.",
  "Leads with the fact the customer needs — price, aisle, return rule — and checks they understood.",
  "Rephrases, slows down, or demonstrates when the first explanation doesn't land, without being asked.",
  "Handles a tense exchange by acknowledging the issue, stating plainly what can and cannot be done, and offering a concrete next step the customer accepts.",
];

const RT_DEP_ANCHORS: Five = [
  "Frequently late or absent without notice; tasks are left for the next shift to discover.",
  "Attendance is fine but tasks need chasing; 'I didn't get to it' is a routine answer.",
  "On time, completes the assigned list, and reports what's done and what isn't at shift end.",
  "Notices undone work outside their own list — an unfaced shelf, a full bin — and handles it without being asked.",
  "Is the person the shift lead builds the plan around: gives early notice of any conflict, covers gaps, and leaves the next shift set up to start clean.",
];

const RT_HON_ANCHORS: Five = [
  "Bends register or discount rules when it feels harmless or a customer pushes hard enough.",
  "Follows rules when observed, but takes shortcuts when the queue is long or the manager is away.",
  "Follows cash and discount procedures consistently and asks before deviating, even under pressure.",
  "Reports discrepancies — a till that doesn't balance, a write-off that looks wrong — even when raising it is uncomfortable.",
  "Surfaces integrity risks early, including a colleague's, through the right channel — and is trusted with keys, cash, and voids because of it.",
];

const RT_TEAM_ANCHORS: Five = [
  "'Not my section' — sticks to own tasks while a colleague is visibly drowning.",
  "Helps when directly asked but never offers; keeps a mental ledger of favors owed.",
  "Offers help when own tasks are done and asks for help early instead of falling behind silently.",
  "Watches the whole floor's workload — jumps on the second register, takes the delivery — before the shift lead asks.",
  "Coordinates the team through crunch moments: proposes who takes what, keeps new colleagues afloat, and is named by others as the reason the shift ran smoothly.",
];

const RT_COMP_ANCHORS: Five = [
  "Visibly flustered by a queue or a raised voice; snaps at customers or freezes.",
  "Stays polite but accuracy drops — wrong change, missed items — when the pace rises.",
  "Keeps tone and accuracy steady through a normal rush; asks for help when actually needed.",
  "Triages under pressure — states wait times, sequences tasks aloud, keeps the line informed — and recovers quickly from a hostile exchange.",
  "Becomes the calm center of a bad shift: de-escalates an aggressive customer within policy, keeps colleagues steady, and holds accuracy to the end of the shift.",
];

const RETAIL_CATEGORIES: CategorySpec[] = [
  {
    id: "rt-cat-service",
    name: "Customer Service",
    weight: 35,
    rationale: "The job is the person in front of you — service quality drives store revenue and repeat visits.",
    attributes: [
      attr(
        "rt-att-cf", "Customer Focus", "skill", 60,
        "Notices what a customer needs and acts to resolve it fully before moving on.",
        RT_CF_ANCHORS,
        { focus: true, rationale: "Core of the role; measured twice (interview + SJT) for triangulation." },
      ),
      attr(
        "rt-att-comm", "Communication Clarity", "skill", 40,
        "Explains prices, policies, and directions in plain words the customer can act on immediately.",
        RT_COMM_ANCHORS,
      ),
    ],
  },
  {
    id: "rt-cat-reliability",
    name: "Reliability & Integrity",
    weight: 35,
    rationale: "Register and stock responsibility: dependability and rule adherence are where hourly hires fail most.",
    attributes: [
      attr(
        "rt-att-dep", "Dependability", "trait", 50,
        "Arrives on time for scheduled shifts and completes assigned tasks without reminders.",
        RT_DEP_ANCHORS,
        { focus: true },
      ),
      attr(
        "rt-att-hon", "Honesty & Rule Adherence", "trait", 50,
        "Follows cash, discount, and inventory procedures exactly and reports irregularities rather than absorbing them.",
        RT_HON_ANCHORS,
        {
          verification: "test",
          rationale:
            "If used, verify with a named job-related instrument and monitor local outcomes and subgroup impact; keep it supporting rather than dispositive.",
        },
      ),
    ],
  },
  {
    id: "rt-cat-team",
    name: "Teamwork & Composure",
    weight: 30,
    attributes: [
      attr(
        "rt-att-team", "Team Cooperation", "trait", 50,
        "Offers and asks for help so the shift's work gets done regardless of whose task it is.",
        RT_TEAM_ANCHORS,
      ),
      attr(
        "rt-att-comp", "Composure Under Pressure", "trait", 50,
        "Stays polite and accurate during rushes, complaints, and short-staffed shifts.",
        RT_COMP_ANCHORS,
      ),
    ],
  },
];

const RETAIL_KNOCKOUTS: KnockoutItem[] = [
  {
    id: "rt-ko-auth",
    question: "Are you legally authorized to work in the country where this store is located?",
    type: "yes_no",
    passValue: true,
    immediate: true,
    rejectionText:
      "This role requires current authorization to work in the store's country, so we can't move your application forward for this opening. Thank you for your interest.",
    allowAppeal: true,
  },
  {
    id: "rt-ko-avail",
    question: "Can you regularly work at least three shifts per week, including one weekend shift?",
    type: "yes_no",
    passValue: true,
    immediate: false, // routes to the knockout review tray, not the void
    rejectionText:
      "This opening needs availability of at least three shifts per week including a weekend shift, which your answers don't currently match. A reviewer will take a look before anything is final.",
    allowAppeal: true,
  },
];

const RETAIL_CHAT_QUESTIONS: InterviewQuestion[] = [
  chatQ(
    "rt-q1", "rt-att-cf",
    "A customer comes to you upset because an item rang up higher than the shelf price. The store is busy and two more people are waiting behind them. What would you do, step by step?",
    [
      "What exactly would you say to the two customers waiting behind them?",
      "If the shelf price was much lower and you weren't sure of the policy, what would you do?",
    ],
    [
      "Would tell the customer the register price is final, or send them elsewhere without checking the shelf tag.",
      "Would apologize but pass the whole situation to a manager without attempting any step themselves.",
      "Would check the shelf tag, honor or escalate it per policy, and apologize for the wait.",
      "Resolves the price check quickly, keeps the waiting customers informed, and stays within discount policy.",
      "Resolves it for the upset customer, manages the queue with a clear time expectation, and flags the mislabeled tag so it doesn't recur.",
    ],
    "Situational format: hourly candidates often lack directly comparable past experience (Huffcutt moderator, R-I.2).",
  ),
  chatQ(
    "rt-q2", "rt-att-comm",
    "A customer asks you to explain the return policy for an opened electronics item. The policy allows returns within 14 days but with a restocking fee. How would you explain it to them?",
    [
      "The customer says the fee is unfair and gets louder. What exactly would you say next?",
      "How would you check that the customer actually understood the policy?",
    ],
    [
      "Would recite the policy word-for-word or hand over a leaflet without explanation.",
      "Explains accurately but in policy jargon, without checking the customer understood.",
      "States the two facts that matter — the 14-day window and that the fee comes off the refund — and checks understanding.",
      "Leads with what the customer can do, gives a concrete number for the fee on their item, and presents the choice clearly.",
      "Explains plainly, anticipates the objection to the fee, offers a legitimate alternative within policy (exchange or store credit), and leaves the customer feeling fairly treated.",
    ],
  ),
  chatQ(
    "rt-q3", "rt-att-comp",
    "It's the evening rush, your colleague called in sick, a line is forming at your register, and you've just been asked to handle a spill in aisle 3. What would you do first, and why?",
    [
      "What would you say to the customers in the line while you deal with the spill?",
      "Who would you tell about the situation, and what exactly would you ask for?",
    ],
    [
      "Freezes or picks one task and silently ignores the other.",
      "Tries to do everything at once; both the line and the spill get half attention.",
      "Sequences sensibly — safety hazard contained, then the register — and can explain the reasoning.",
      "Contains the spill hazard immediately with a sign, returns to the register, tells the queue what's happening, and calls for backup with a specific ask.",
      "Does all of that and adds recovery: explicit priorities, time estimates for waiting customers, and flags the staffing gap to the shift lead afterwards.",
    ],
  ),
  chatQ(
    "rt-q4", "rt-att-team",
    "You notice a new coworker struggling to close their register while your own closing tasks are done. You're tired and your shift ends in ten minutes. What would you do?",
    [
      "Where is the line between helping and staying too late? What would you actually do at minute fifteen?",
      "What would you do the next day so this doesn't happen again?",
    ],
    [
      "Would clock out — their register, their problem.",
      "Would tell them to ask the manager, and leave.",
      "Would help with the parts they know within the remaining time and hand off clearly.",
      "Offers specific help unprompted and shows the coworker the steps rather than silently doing it for them.",
      "Helps, teaches the closing routine so tomorrow is easier, and flags to the shift lead that closing training is needed — without blaming the coworker.",
    ],
  ),
];

const RETAIL_SJT_ITEMS: SjtItem[] = [
  sjtItem(
    "rt-sjt-1", "rt-att-hon",
    "A friendly regular is 40 cents short at the register and says 'just let it go, I'm here every day.' Store policy is exact payment. Your manager is on break.",
    [
      ["Cover the 40 cents from your own pocket so the till balances and the customer leaves happy.", 1],
      ["Waive it — 40 cents is nothing compared to a regular customer's loyalty.", 0],
      ["Politely explain you can't short the till, and offer options: remove an item, pay by card, or set the item aside until they return.", 3],
      ["Ask the customer to wait until the manager is back to decide.", 2],
    ],
  ),
  sjtItem(
    "rt-sjt-2", "rt-att-cf",
    "A customer has been circling the same aisle for several minutes, picking up and putting back boxes. You're halfway through restocking a shelf that must be done before the delivery arrives.",
    [
      ["Finish the restock first — they'll ask if they need help.", 1],
      ["Pause, ask 'What are you looking for? I can check the back too,' and return to restocking once they're sorted.", 3],
      ["Point them toward the aisle signs so they can orient themselves.", 0],
      ["Call a colleague over the intercom to assist them while you keep restocking.", 2],
    ],
  ),
  sjtItem(
    "rt-sjt-3", "rt-att-dep",
    "You wake up with a heavy cold two hours before your opening shift. You could probably push through the day. Two colleagues are already off this week.",
    [
      ["Push through and say nothing — the team is short-staffed as it is.", 1],
      ["Call the shift lead now, describe your state honestly, and propose cover options for them to decide.", 3],
      ["Text a coworker asking to swap and assume it's handled if they don't reply.", 0],
      ["Decide to stay home and inform the store an hour before opening.", 1],
    ],
  ),
  sjtItem(
    "rt-sjt-4", "rt-att-team",
    "Fifteen minutes before closing, a large delivery arrives that is officially the morning crew's job to shelve. Your own closing tasks are done.",
    [
      ["Clock out — it's assigned to the morning crew for a reason.", 0],
      ["Start on the delivery so the morning crew gets a head start, and leave a note for the shift lead on what's left.", 3],
      ["Stay only if the shift lead explicitly asks and approves the extra minutes.", 2],
      ["Move the pallets out of the walkway for safety and leave the rest.", 1],
    ],
  ),
  sjtItem(
    "rt-sjt-5", "rt-att-comp",
    "A customer is shouting that the promotion price didn't apply and calls you personally useless. A line is forming behind them.",
    [
      ["Tell them firmly to calm down or you won't help them.", 0],
      ["Acknowledge the frustration, say you'll fix it right now, check the promotion, and involve the shift lead if the register can't apply it.", 3],
      ["Apply whatever discount stops the shouting fastest.", 1],
      ["Process the sale at the register price and tell them to take it up with customer service.", 1],
    ],
  ),
  sjtItem(
    "rt-sjt-6", "rt-att-hon",
    "You see a colleague scanning their own loyalty card on customers' purchases to collect the points. They say everyone does it and the customers don't care.",
    [
      ["Ignore it — it doesn't directly cost the store money.", 0],
      ["Tell them you're not comfortable with it and it should stop; if it continues, raise it with the shift lead.", 3],
      ["Report them to management immediately without saying anything to them first.", 2],
      ["Start doing the same — the points would otherwise go to waste.", 0],
    ],
  ),
  sjtItem(
    "rt-sjt-7", "rt-att-comm",
    "An elderly customer at self-checkout can't get the machine to accept a coupon and is getting embarrassed as people wait behind them.",
    [
      ["Take over the screen and finish the transaction for them quickly.", 2],
      ["Step in, say 'these machines are fussy — let's do it together,' walk them through the two steps, and open the next machine for the queue.", 3],
      ["Tell them the coupon probably isn't valid at self-checkout and to try a staffed register.", 1],
      ["Announce to the queue that it will be a while and continue your other task.", 0],
    ],
  ),
  sjtItem(
    "rt-sjt-8", "rt-att-cf",
    "A customer wants to return a kettle without a receipt. Policy allows a store-credit return with ID for items found in the system. They're visibly annoyed and expect cash.",
    [
      ["Refuse — no receipt, no return — and move to the next customer.", 0],
      ["Give cash back to avoid the conflict; the amount is small.", 0],
      ["Explain the store-credit option, look the item up in the system, process it with their ID, and explain how a receipt makes cash refunds possible next time.", 3],
      ["Send them to the customer-service desk without checking anything yourself.", 1],
    ],
  ),
];

const RETAIL_PIPELINE: PipelineBlock[] = [
  blk(
    "rt-blk-knockout", 0, "Basics check",
    "Two quick questions to confirm the basics for this role — work authorization and shift availability. If something doesn't match, a person reviews it before anything is final.",
    2, [],
    { kind: "knockout", items: RETAIL_KNOCKOUTS, placement: "before_form" },
    { scored: false },
  ),
  blk(
    "rt-blk-chat", 1, "Written interview",
    "A short written interview — no camera, no timer pressure. Everyone applying for this role answers the same four questions about real store situations. Answers are scored only on what you write, against the same criteria for everyone.",
    15,
    [
      { attributeId: "rt-att-cf", share: 30 },
      { attributeId: "rt-att-comm", share: 25 },
      { attributeId: "rt-att-comp", share: 25 },
      { attributeId: "rt-att-team", share: 20 },
    ],
    {
      kind: "chat_interview",
      questions: RETAIL_CHAT_QUESTIONS,
      minAnswerWords: 30,
      maxAnswerWords: 150,
      typingTelemetry: false,
      pastePolicy: "warn",
      followUpPolicy: 1,
      tone: "warm",
    },
    { integrityTier: 1 },
  ),
  blk(
    "rt-blk-sjt", 2, "Store situations",
    "Eight short store situations. Pick what you would most likely do — there are no trick questions, and the scenarios reflect the judgment this job actually needs.",
    6,
    [
      { attributeId: "rt-att-cf", share: 25 },
      { attributeId: "rt-att-hon", share: 25 },
      { attributeId: "rt-att-dep", share: 13 },
      { attributeId: "rt-att-team", share: 13 },
      { attributeId: "rt-att-comp", share: 12 },
      { attributeId: "rt-att-comm", share: 12 },
    ],
    {
      kind: "sjt",
      instruction: "behavioral_tendency",
      format: "pick_best",
      keyType: "hybrid",
      items: RETAIL_SJT_ITEMS,
      timing: "untimed",
      randomizeOrder: false,
      pilotMode: false,
    },
    { integrityTier: 1 },
  ),
  blk(
    "rt-blk-integrity", 3, "Reliability questionnaire",
    "A short questionnaire about workplace rules and reliability. It's part of this role because associates handle the register and stock — and it's never the only reason for a decision.",
    5,
    [
      { attributeId: "rt-att-hon", share: 70 },
      { attributeId: "rt-att-dep", share: 30 },
    ],
    {
      kind: "integrity_test",
      domains: ["rule_adherence", "dependability", "cwb_attitudes"],
      criterionMappings: [
        { unit: "rule_adherence", attributeId: "rt-att-hon" },
        { unit: "dependability", attributeId: "rt-att-dep" },
        { unit: "cwb_attitudes", attributeId: "rt-att-hon" },
      ],
      lengthItems: 18,
      format: "likert",
    },
    { integrityTier: 1 },
  ),
  blk(
    "rt-blk-form", 4, "Contact & availability",
    "Last step: contact details and your availability, so we can plan shifts fairly. Availability answers are collected for planning and are not scored.",
    4, [],
    {
      kind: "application_form",
      fields: [
        { id: "rt-fld-name", label: "Full name", type: "short_text", required: true, pii: true, scored: false },
        { id: "rt-fld-email", label: "Email", type: "short_text", required: true, pii: true, scored: false },
        { id: "rt-fld-phone", label: "Phone number", type: "short_text", required: true, pii: true, scored: false },
        {
          id: "rt-fld-days", label: "Days you can regularly work", type: "multi_choice", required: true, pii: false, scored: false,
          options: [
            { id: "rt-fld-days-mon", text: "Monday" }, { id: "rt-fld-days-tue", text: "Tuesday" },
            { id: "rt-fld-days-wed", text: "Wednesday" }, { id: "rt-fld-days-thu", text: "Thursday" },
            { id: "rt-fld-days-fri", text: "Friday" }, { id: "rt-fld-days-sat", text: "Saturday" },
            { id: "rt-fld-days-sun", text: "Sunday" },
          ],
        },
        {
          id: "rt-fld-hours", label: "Preferred hours", type: "single_choice", required: true, pii: false, scored: false,
          options: [
            { id: "rt-fld-hours-am", text: "Mornings (07:00–13:00)" },
            { id: "rt-fld-hours-pm", text: "Afternoons (13:00–19:00)" },
            { id: "rt-fld-hours-eve", text: "Evenings (16:00–22:00)" },
            { id: "rt-fld-hours-any", text: "Flexible / any" },
          ],
        },
        { id: "rt-fld-start", label: "Earliest start date", type: "date", required: true, pii: false, scored: false },
        {
          id: "rt-fld-consent",
          label: "I confirm my availability answers are accurate and agree they may be used for shift planning.",
          type: "consent", required: true, pii: false, scored: false,
        },
      ],
      prefillFromCv: false,
    },
    { scored: false },
  ),
];

const RETAIL_VACANCY: VacancyV2 = {
  id: "rt-vacancy",
  code: "",
  status: "DRAFT",
  configVersion: 1,
  profile: {
    title: "Retail Store Associate",
    openings: 4,
    seniority: "Junior",
    employmentType: "shift",
    workMode: "on_site",
    locations: ["In-store"],
    compensation: { min: 14, max: 17, currency: "USD", period: "hour", visible: true },
    taxonomyRef: { system: "ONET", code: "41-2031.00", label: "Retail Salespersons" },
    mission: "Keep the store running and the customer in front of you looked after — registers, shelves, returns, and the moments in between.",
    responsibilities: [
      "Serve customers at the register and on the floor",
      "Keep shelves stocked, faced, and priced correctly",
      "Handle returns and basic complaints within policy",
      "Support opening, closing, and delivery routines",
    ],
    teamContext: "Reports to the shift lead; works alongside 4–8 associates per shift.",
    industryPack: "retail_hourly",
    languages: { primary: "en", alternates: [] },
  },
  categories: RETAIL_CATEGORIES,
  pipeline: RETAIL_PIPELINE,
  scoring: scoringPolicy(60, ["focus_attributes", "earlier_submission"]),
  experience: experienceCfg(
    "warm",
    "A neighborhood store team that trains on the job and promotes from the floor.",
    ["entry"], // chat-only pipeline: no recorded blocks
  ),
  governance: governanceCfg(),
  distribution: [],
  window: { opensAt: "", closesAt: "", timezone: "UTC" },
  rollingReview: true, // hourly volume: review as applications arrive
  audit: [],
  createdAt: "2026-07-01T00:00:00.000Z",
};

/* ============================================================
   PRESET 2 — Senior Backend Engineer (tech pack)
   Method rationale: triangulates standardized behavioral evidence, a
   representative coding work sample and independent human review. The CV is
   kept as context and a source of claims to verify. AI use in the coding task is
   disclosed-and-allowed and probed at the panel (R-IV.4).
   ============================================================ */

const BE_DESIGN_ANCHORS: Five = [
  "Describes systems only in framework terms; cannot say why this database, this queue, or what breaks first under load.",
  "Names components correctly but choices are inherited — 'that's what we used' — with no articulated trade-offs.",
  "Explains one shipped design end to end: the constraint, the alternatives weighed, and why the chosen shape fit the load.",
  "Names the rejected alternative and the specific failure mode it would have caused; quantifies the load the design was built for versus what it actually hit.",
  "Shows designs that survived production growth: anticipated the bottleneck, built in the migration path, and cites the numbers before and after.",
];

const BE_QUALITY_ANCHORS: Five = [
  "Working-but-tangled code; tests absent or testing the mock; naming needs the author present to decode.",
  "Tests cover the happy path only; structure mixes concerns so small changes ripple widely.",
  "Clear separation of concerns, meaningful names, and tests that would catch a realistic regression.",
  "Tests document behavior including edge and failure cases; the code anticipates the next change without speculative abstraction.",
  "Code a reviewer approves in one pass: edge cases handled and tested, invariants explicit, and the diff teaches the reader the domain.",
];

const BE_EXP_ANCHORS: Five = [
  "Under two years, or experience limited to tutorials and internal tools without production users.",
  "Two to four years shipping features into production systems owned by others.",
  "Five-plus years, including services they owned in production end to end.",
  "Five-plus years across more than one stack or domain, including scaling or migration work they led.",
  "A decade-class track record: systems still in production years later, staff-level scope, and scars they can narrate from memory.",
];

const BE_DECIDE_ANCHORS: Five = [
  "Decisions happen to them — deadlines or louder colleagues decide; no rationale can be reconstructed.",
  "Gathers information indefinitely; ships late rather than deciding with what's known.",
  "Names a decision, the options weighed, and the outcome, with a sensible information cut-off.",
  "Names the decision, the information they lacked, the reversible/irreversible framing they applied, and the measured outcome.",
  "Shows a repeatable decision system — explicit framing, time-boxed deliberation, cheap reversibility tests — with post-decision reviews that changed later calls.",
];

const BE_OPS_ANCHORS: Five = [
  "Ships and moves on; incidents are someone else's problem; cannot describe their service's dashboards.",
  "Responds when paged but firefights only — no root-cause follow-through.",
  "Runs a competent incident response: triage, mitigation, communication, and a postmortem with actions.",
  "Describes an incident where they led the first thirty minutes, names the root cause, and the specific change that made recurrence impossible.",
  "Prevents whole classes of incidents: alerts on leading indicators they defined, runbooks others use, and a measurable reliability trend they can cite.",
];

const BE_COMM_ANCHORS: Five = [
  "Explanations are jargon walls or evasions; stakeholders decide blind.",
  "Accurate but unranked detail; the listener must extract what matters themselves.",
  "Leads with the decision-relevant facts and adjusts register when asked.",
  "Translates the trade-off into the listener's terms — cost, risk, time — unprompted, and confirms the decision was understood.",
  "Turns a hostile disagreement into an aligned decision: names the other side's concern accurately, quantifies both paths, and documents the agreement so it sticks.",
];

const BE_MENTOR_ANCHORS: Five = [
  "Reviews rubber-stamp or nitpick; no one around them gets better.",
  "Gives correct feedback that lands poorly or too late to matter.",
  "Reviews teach: comments explain the why, and mentees can name concrete things they learned.",
  "Invests deliberately in someone's growth — scoped stretch work, paired reviews — and names the observable change in their output.",
  "Builds engineers who no longer need them: a named mentee took over a system or was promoted on work traceable to the mentorship.",
];

const BE_CATEGORIES: CategorySpec[] = [
  {
    id: "be-cat-craft",
    name: "Technical Craft",
    weight: 40,
    rationale: "Senior scope: design and code quality carry the largest share, verified by a work sample.",
    attributes: [
      attr(
        "be-att-design", "Backend System Design", "skill", 40,
        "Designs services whose data models, failure modes, and scaling limits are chosen deliberately for the load and constraints at hand.",
        BE_DESIGN_ANCHORS,
        { focus: true, verification: "interview" },
      ),
      attr(
        "be-att-quality", "Code Quality & Testing", "skill", 35,
        "Writes code whose structure, naming, and tests let a stranger change it safely six months later.",
        BE_QUALITY_ANCHORS,
        { verification: "test", rationale: "Measured directly by the coding work sample, not by self-report." },
      ),
      attr(
        "be-att-exp", "Backend Engineering Experience", "experience", 25,
        "Years of professional backend development with production ownership, verified against CV and interview claims.",
        BE_EXP_ANCHORS,
        {
          verification: "self_report",
          mustHave: {
            rule: "min_years",
            value: 5,
            label: "At least 5 years of professional backend development experience",
            humanRecoverable: true,
          },
          rationale:
            "Experience is an eligibility and context requirement here, not a performance score; material claims require verification.",
        },
      ),
    ],
  },
  {
    id: "be-cat-judgment",
    name: "Engineering Judgment",
    weight: 30,
    attributes: [
      attr(
        "be-att-decide", "Decision-Making Under Uncertainty", "skill", 55,
        "Makes timely technical calls with incomplete information and can reconstruct the reasoning afterward.",
        BE_DECIDE_ANCHORS,
        { focus: true },
      ),
      attr(
        "be-att-ops", "Operational Ownership", "trait", 45,
        "Treats the running service as their responsibility: monitoring, incident response, and follow-through on root causes.",
        BE_OPS_ANCHORS,
      ),
    ],
  },
  {
    id: "be-cat-collab",
    name: "Collaboration",
    weight: 30,
    attributes: [
      attr(
        "be-att-comm", "Technical Communication", "skill", 60,
        "Explains technical trade-offs so that non-experts can make an informed decision.",
        BE_COMM_ANCHORS,
      ),
      attr(
        "be-att-mentor", "Mentorship & Review", "skill", 40,
        "Raises other engineers' output through reviews, pairing, and deliberate teaching.",
        BE_MENTOR_ANCHORS,
      ),
    ],
  },
];

const BE_KNOCKOUTS: KnockoutItem[] = [
  {
    id: "be-ko-auth",
    question: "Are you authorized to work in the country stated for this role, or eligible for the visa support described in the posting?",
    type: "yes_no",
    passValue: true,
    immediate: true,
    rejectionText:
      "This role requires work authorization we can't currently provide, so we can't move your application forward for this opening. Thank you for your interest.",
    allowAppeal: true,
  },
  {
    id: "be-ko-years",
    question: "How many years of professional backend development experience do you have?",
    type: "numeric_threshold",
    threshold: 5,
    immediate: false,
    rejectionText:
      "This opening asks for at least five years of professional backend experience. Your answer is below that bar, so a reviewer will look at your application before anything is final.",
    allowAppeal: true,
    mustHaveId: "be-att-exp", // generated from the criteria must-have floor (§4.3.2)
  },
  {
    id: "be-ko-prod",
    question: "Have you owned a service in production — deploys, monitoring, incident response — for at least a year?",
    type: "yes_no",
    passValue: true,
    immediate: false,
    rejectionText:
      "This role centers on running services in production, and your answers don't currently show that experience. A reviewer will check your application before anything is final.",
    allowAppeal: true,
  },
];

const BE_QUESTIONS: InterviewQuestion[] = [
  vidQ(
    "be-q1", "be-att-design",
    "Tell me about the most complex system you designed and shipped. What were the key constraints, and how did they shape the design?",
    [
      "What alternative design did you reject, and why?",
      "What broke or surprised you after launch, and what did you change?",
    ],
    BE_DESIGN_ANCHORS,
    "Structured past-work evidence is job-related here; job experts must confirm content coverage and use the same question, probes, and rubric for every candidate.",
  ),
  vidQ(
    "be-q2", "be-att-decide",
    "Walk me through a hard technical decision you made with incomplete information. How did you decide when to stop deliberating?",
    [
      "What information did you most wish you had, and how did you compensate for not having it?",
      "If you faced it again tomorrow, what would you do differently?",
    ],
    BE_DECIDE_ANCHORS,
  ),
  vidQ(
    "be-q3", "be-att-ops",
    "Tell me about a production incident where you were the responder. What did you do in the first thirty minutes?",
    [
      "What was the root cause, and what specifically did you change so it couldn't recur?",
      "What was your role versus the team's in the resolution?",
    ],
    BE_OPS_ANCHORS,
  ),
  vidQ(
    "be-q4", "be-att-comm",
    "Describe a time you had to convince a non-engineering stakeholder to accept a technical trade-off they didn't like. How did you approach it?",
    [
      "What exactly did they disagree with, in their words?",
      "How did you know they genuinely accepted it rather than just gave in?",
    ],
    BE_COMM_ANCHORS,
  ),
  vidQ(
    "be-q5", "be-att-mentor",
    "Tell me about an engineer you helped level up. What did you actually do, and what changed in their work?",
    [
      "What was your specific role in that — what did you personally decide or do?",
      "What was the measurable outcome, and how do you know?",
    ],
    BE_MENTOR_ANCHORS,
  ),
];

const BE_PIPELINE: PipelineBlock[] = [
  blk(
    "be-blk-knockout", 0, "Requirements check",
    "Three quick checks on the stated minimum requirements for this role. Anything borderline is reviewed by a person.",
    2, [],
    { kind: "knockout", items: BE_KNOCKOUTS, placement: "before_form" },
    { scored: false, deadlineOffsetHours: 48 },
  ),
  blk(
    "be-blk-cv", 1, "CV upload",
    "Upload your CV. It gives reviewers context and lets us verify claims later — it is not scored on its own, and identifying details are hidden from reviewers by default.",
    4,
    [{ attributeId: "be-att-exp", share: 100 }], // informational mapping: feeds the experience floor + claims ledger
    {
      kind: "cv_intake",
      acceptedFormats: ["pdf", "docx"],
      maxSizeMb: 10,
      parseTargets: [],
      anonymizeForReview: true,
      extractClaims: false,
      portfolioUrlField: true,
    },
    { scored: false, deadlineOffsetHours: 48 },
  ),
  blk(
    "be-blk-interview", 2, "Structured interview",
    "A structured video interview: five questions about real situations from your engineering work — the same five for every candidate. Only the transcript of what you say is scored, against published criteria for this role.",
    25,
    [
      { attributeId: "be-att-design", share: 25 },
      { attributeId: "be-att-decide", share: 20 },
      { attributeId: "be-att-ops", share: 20 },
      { attributeId: "be-att-comm", share: 20 },
      { attributeId: "be-att-mentor", share: 15 },
    ],
    {
      kind: "async_interview",
      questions: BE_QUESTIONS,
      followUpPolicy: 1,
      order: "fixed",
      introVideo: "none",
      practiceQuestion: false,
      pauseAllowance: 0,
      reviewBeforeSubmit: false,
    },
    { integrityTier: 1, gate: { minBlockScore: 55 } },
  ),
  blk(
    "be-blk-coding", 3, "Coding task",
    "A hands-on coding task in the browser, capped at 90 minutes. You may use AI assistants — just note where you did; you'll discuss your approach at the panel. Scored against a published two-part rubric: correctness and clarity.",
    90,
    [
      { attributeId: "be-att-quality", share: 60 },
      { attributeId: "be-att-design", share: 25 },
      { attributeId: "be-att-decide", share: 15 },
    ],
    {
      kind: "coding",
      environment: "browser_ide",
      languages: ["TypeScript", "Python", "Go", "Java"],
      taskSource: "custom",
      brief:
        "In the browser source editor, implement a rate-limited task queue: enqueue jobs with priorities, execute at most N concurrently, retry failures with backoff, and expose queue stats. The editor does not execute code; reviewers assess the submitted source and explanation against the frozen rubric.",
      scoringSplit: { correctness: 55, quality: 30, approach: 15 },
      timeCapMin: 90,
      aiPolicy: "disclosed", // Codility Cody pattern: allowed, attached, discussed (R-III.13)
      similarityCheck: false,
      rubricDimensions: [
        {
          id: "be-dim-correct",
          attributeId: "be-att-quality",
          codingScoringArea: "correctness",
          name: "Correctness & edge handling",
          weight: 55,
          anchors: [
            "The submitted source does not implement the core path and does not address edge cases.",
            "The source describes a plausible happy path but mishandles concurrency or retry edge cases.",
            "The source implements the primary paths and explains most edge-case handling, with one important gap.",
            "The source and explanation cover ordering, concurrency limits, retries, and the stated edge cases coherently.",
            "The source is complete against the brief and explicitly defends additional relevant failure modes such as idempotent enqueue and clean shutdown.",
          ],
        },
        {
          id: "be-dim-clarity",
          attributeId: "be-att-design",
          codingScoringArea: "quality",
          name: "Code clarity & maintainability",
          weight: 30,
          anchors: [
            "A single tangle of state; renaming one thing requires reading everything.",
            "Works, but queueing, execution, and stats logic live in one structure.",
            "Clear module boundaries and names; a reviewer can follow the flow in one pass.",
            "Invariants made explicit where it matters; tests or usage examples included unprompted.",
            "Reads like library code: minimal API surface, deliberate data structures, and the tricky concurrency part isolated and documented.",
          ],
        },
        {
          id: "be-dim-approach",
          attributeId: "be-att-decide",
          codingScoringArea: "approach",
          name: "Problem-solving approach & trade-offs",
          weight: 15,
          anchors: [
            "Cannot explain the chosen approach or its effect on the stated constraints.",
            "Names an approach after the fact but gives little decision evidence or verification.",
            "Explains a workable approach, key trade-off and a relevant check against the requirements.",
            "Compares credible alternatives, makes assumptions explicit and verifies the riskiest behavior.",
            "Uses a disciplined, economical decision process, tests failure modes and explains when a different design would be preferable.",
          ],
        },
      ],
    },
    { integrityTier: 1, gate: { minBlockScore: 60 } },
  ),
  blk(
    "be-blk-panel", 4, "Panel interview",
    "A live conversation with the hiring manager and a senior engineer. They use the same criteria as every earlier step and score independently before comparing notes. The hiring team coordinates the time with you.",
    60,
    [
      { attributeId: "be-att-design", share: 25 },
      { attributeId: "be-att-decide", share: 20 },
      { attributeId: "be-att-ops", share: 15 },
      { attributeId: "be-att-comm", share: 20 },
      { attributeId: "be-att-mentor", share: 20 },
    ],
    {
      kind: "human_stage",
      panel: ["Hiring Manager", "Staff Engineer (bar raiser)"],
      selfBooking: false,
      interviewKitAuto: false,
      independentBeforeDiscussion: true,
      aiNotetaker: false,
    },
  ),
];

const BE_VACANCY: VacancyV2 = {
  id: "be-vacancy",
  code: "",
  status: "DRAFT",
  configVersion: 1,
  profile: {
    title: "Senior Backend Engineer",
    openings: 1,
    seniority: "Senior",
    employmentType: "full_time",
    workMode: "remote_country",
    locations: ["Remote (country-wide)"],
    timezoneOverlap: "≥ 4 hours with the core team",
    compensation: { min: 140000, max: 180000, currency: "USD", period: "year", visible: true },
    taxonomyRef: { system: "SFIA", code: "PROG-5", label: "Programming / software development — level 5" },
    mission: "Own backend services end to end — design, build, run — for a product whose load doubles every year.",
    responsibilities: [
      "Design and ship backend services and the data models beneath them",
      "Own reliability: monitoring, incident response, and root-cause follow-through",
      "Raise the bar through code review and mentorship",
      "Make and document the hard technical trade-offs",
    ],
    industryPack: "tech",
    languages: { primary: "en", alternates: [] },
  },
  categories: BE_CATEGORIES,
  pipeline: BE_PIPELINE,
  scoring: scoringPolicy(65, ["focus_attributes", "work_sample"]),
  experience: experienceCfg(
    "neutral",
    "A product engineering team that runs what it ships.",
    ["entry", "recorded_blocks"],
  ),
  governance: governanceCfg(),
  distribution: [],
  window: { opensAt: "", closesAt: "", timezone: "UTC" },
  rollingReview: false,
  audit: [],
  createdAt: "2026-07-01T00:00:00.000Z",
};

/* ============================================================
   PRESET 3 — Team Lead — Platform (tech pack)
   The existing demo vacancy, formalized. Five behavioral competencies
   measured by a structured async interview — one STAR-eliciting
   question per attribute, texts identical to lib/ai.ts MAIN_TEMPLATES —
   then document verification and a human panel scoring the same BARS
   independently before discussion (R-I.2 #13).
   ============================================================ */

const TL_LEAD_ANCHORS: Five = [
  "Describes team outcomes in passive voice; cannot name a decision they personally drove.",
  "Assigns tasks but escalates every conflict upward; ownership language is 'they decided'.",
  "Names a goal they set, who they delegated to, and how they followed through to the outcome.",
  "Describes leading through a failure: took the unpopular call, communicated it, and names the measured recovery.",
  "Shows a repeatable leadership system — direction, delegation with growth intent, public ownership of wins and failures — each with named outcomes.",
];

const TL_DECIDE_ANCHORS: Five = [
  "Cannot reconstruct any recent decision; defaults to 'we discussed it as a team'.",
  "Describes decisions but not the information trade-off; deliberation time went unexamined.",
  "Names a decision, the options weighed, and the outcome, but the framing is ad hoc.",
  "Names the decision, the information they lacked, the reversible/irreversible framing they applied, and the measured outcome.",
  "Shows a consistent decision system across multiple episodes — framing, time-boxed deliberation, and post-decision review with corrections.",
];

const TL_COMM_ANCHORS: Five = [
  "Explains by restating jargon louder; disagreement hardens into stalemate.",
  "Accurate but audience-blind; listeners must translate for themselves.",
  "Structures the message around the listener's question and checks that it landed.",
  "Names the disagreement accurately before arguing, adapts register mid-conversation, and converts a skeptic with evidence they accepted.",
  "Repeatedly turns opposition into alignment: steel-mans the other side, quantifies both paths, and the agreement holds because it was genuinely understood.",
];

const TL_STRESS_ANCHORS: Five = [
  "The pressure narrative is chaos or blame; coping was avoidance, and it shows in the outcome.",
  "Got through a crunch but cannot say how; recovery was luck or collapse afterwards.",
  "Names the pressure period, what they triaged first, and one deliberate coping mechanism that held.",
  "Describes the worst day concretely: what they cut, what they protected, how they communicated capacity — and what they changed afterwards to prevent a repeat.",
  "Shows a durable pressure system: early load signals, pre-agreed triage rules, honest capacity communication upward, and a team that stayed functional because of it.",
];

const TL_GROWTH_ANCHORS: Five = [
  "Cannot name a genuine professional weakness, or names one with no improvement action.",
  "Names a weakness and an intention; no evidence anything changed.",
  "Names a real weakness, the deliberate practice they applied, and a believable sign of improvement.",
  "Shows the loop closed: sought hard feedback, changed method, and cites an artifact — a passed review, a metric, a role expansion — proving the change.",
  "Serial self-correction: multiple documented weakness-to-strength conversions, each with dated evidence, and now teaches the method to others.",
];

/* category = attribute here: the demo's five competencies, formalized 1:1 */
const TL_CATEGORIES: CategorySpec[] = [
  {
    id: "tl-cat-lead",
    name: "Leadership",
    weight: 25,
    rationale: "Team-lead roles: the leadership cluster is weighted highest per the role's people responsibility.",
    attributes: [
      attr(
        "tl-att-lead", "Leadership", "skill", 100,
        "Sets direction for a team, owns outcomes publicly, and delegates so that others grow.",
        TL_LEAD_ANCHORS,
        {
          focus: true,
          mustHave: {
            rule: "min_years",
            value: 2,
            label: "At least 2 years directly leading or managing engineers",
            humanRecoverable: true,
          },
        },
      ),
    ],
  },
  {
    id: "tl-cat-decide",
    name: "Decision-Making",
    weight: 20,
    attributes: [
      attr(
        "tl-att-decide", "Decision-Making", "skill", 100,
        "Makes timely calls under incomplete information and can reconstruct the reasoning afterward.",
        TL_DECIDE_ANCHORS,
        { focus: true },
      ),
    ],
  },
  {
    id: "tl-cat-comm",
    name: "Communication",
    weight: 20,
    attributes: [
      attr(
        "tl-att-comm", "Communication", "skill", 100,
        "Explains complex topics so that skeptical or non-expert audiences can act on them, and confirms understanding.",
        TL_COMM_ANCHORS,
      ),
    ],
  },
  {
    id: "tl-cat-stress",
    name: "Stress-Resilience",
    weight: 15,
    attributes: [
      attr(
        "tl-att-stress", "Stress-Resilience", "trait", 100,
        "Maintains judgment, output, and civility through sustained pressure, and recovers deliberately rather than by avoidance.",
        TL_STRESS_ANCHORS,
      ),
    ],
  },
  {
    id: "tl-cat-growth",
    name: "Growth Potential",
    weight: 20,
    attributes: [
      attr(
        "tl-att-growth", "Growth Potential", "trait", 100,
        "Seeks disconfirming feedback and converts it into observable skill change within months, not years.",
        TL_GROWTH_ANCHORS,
        { verification: "document", rationale: "Certification and education claims route to the document-verification block." },
      ),
    ],
  },
];

/* question texts identical to lib/ai.ts MAIN_TEMPLATES (demo continuity) */
const TL_QUESTIONS: InterviewQuestion[] = [
  vidQ(
    "tl-q1", "tl-att-lead",
    "Tell me about a time you led people through something that was failing. What did you actually do?",
    [
      "What was your specific role in that — what did you personally decide or do?",
      "What was the measurable outcome, and how do you know?",
    ],
    TL_LEAD_ANCHORS,
    "STAR-eliciting behavioral question; leadership is a focus attribute and gets first position.",
  ),
  vidQ(
    "tl-q2", "tl-att-decide",
    "Walk me through a hard decision you made with incomplete information. How did you decide when to stop deliberating?",
    [
      "What information did you most wish you had, and how did you compensate?",
      "If you faced it again tomorrow, what would you do differently?",
    ],
    TL_DECIDE_ANCHORS,
  ),
  vidQ(
    "tl-q3", "tl-att-comm",
    "Describe a moment you had to explain something complex to someone who disagreed with you. How did you approach it?",
    [
      "What exactly did the other person disagree with, in their words?",
      "How did you know they actually understood, rather than just gave in?",
    ],
    TL_COMM_ANCHORS,
  ),
  vidQ(
    "tl-q4", "tl-att-stress",
    "Tell me about the most pressured period in your recent work. What did you do on the worst day of it?",
    [
      "What did you deliberately drop or postpone, and how did you communicate that?",
      "What did you change afterwards so that period wouldn't repeat?",
    ],
    TL_STRESS_ANCHORS,
  ),
  vidQ(
    "tl-q5", "tl-att-growth",
    "What is something you were genuinely bad at professionally, and how did you get good at it?",
    [
      "What did the feedback that started the change actually say?",
      "What evidence would show me the improvement — a document, a metric, a before/after?",
    ],
    TL_GROWTH_ANCHORS,
  ),
];

const TL_KNOCKOUTS: KnockoutItem[] = [
  {
    id: "tl-ko-auth",
    question: "Are you authorized to work in the country stated for this role?",
    type: "yes_no",
    passValue: true,
    immediate: true,
    rejectionText:
      "This role requires work authorization we can't currently provide, so we can't move your application forward for this opening. Thank you for your interest.",
    allowAppeal: true,
  },
  {
    id: "tl-ko-lead",
    question: "Have you directly led or managed engineers — as a team lead, tech lead with people duties, or manager — for at least two years?",
    type: "yes_no",
    passValue: true,
    immediate: false,
    rejectionText:
      "This opening asks for at least two years of directly leading engineers, which your answers don't currently show. A reviewer will look at your application before anything is final.",
    allowAppeal: true,
    mustHaveId: "tl-att-lead",
  },
];

const TL_PIPELINE: PipelineBlock[] = [
  blk(
    "tl-blk-knockout", 0, "Requirements check",
    "Two quick checks on the stated minimum requirements for this role. Anything borderline is reviewed by a person.",
    2, [],
    { kind: "knockout", items: TL_KNOCKOUTS, placement: "before_form" },
    { scored: false, deadlineOffsetHours: 48 },
  ),
  blk(
    "tl-blk-cv", 1, "CV upload",
    "Upload your CV. It gives reviewers context and lets us verify claims later — it is not scored on its own, and identifying details are hidden from reviewers by default.",
    4, [],
    {
      kind: "cv_intake",
      acceptedFormats: ["pdf", "docx"],
      maxSizeMb: 10,
      parseTargets: [],
      anonymizeForReview: true,
      extractClaims: false,
      portfolioUrlField: false,
    },
    { scored: false, deadlineOffsetHours: 48 },
  ),
  blk(
    "tl-blk-interview", 2, "Structured interview",
    "A structured recorded video interview: five questions, one per competency, the same for every candidate. Camera and microphone answers are transcribed; only reviewed answer evidence is scored. No frame, gaze, appearance, voice or alleged reading inference is produced, and a text accommodation remains available.",
    25,
    [
      { attributeId: "tl-att-lead", share: 25 },
      { attributeId: "tl-att-decide", share: 20 },
      { attributeId: "tl-att-comm", share: 20 },
      { attributeId: "tl-att-stress", share: 15 },
      { attributeId: "tl-att-growth", share: 20 },
    ],
    {
      kind: "async_interview",
      questions: TL_QUESTIONS,
      followUpPolicy: 1,
      order: "fixed",
      introVideo: "none",
      practiceQuestion: false,
      pauseAllowance: 0,
      reviewBeforeSubmit: false,
    },
    { integrityTier: 1, gate: { minBlockScore: 60 } },
  ),
  blk(
    "tl-blk-docs", 3, "Documents",
    "Upload PDF or DOCX documents whose contents address the published qualification requirement. A named reviewer checks the contents; this stage does not independently verify the issuer or authenticity.",
    6,
    [{ attributeId: "tl-att-growth", share: 100 }], // informational: verified claims lift confidence on Growth Potential
    {
      kind: "doc_verification",
      requiredDocuments: [
        { id: "tl-doc-diploma", label: "Diploma / degree certificate" },
        { id: "tl-doc-cert", label: "Certifications named in the interview" },
      ],
      acceptedFormats: ["pdf", "docx"],
      mode: "manual_document_review",
      idCheck: false,
      placement: "post_shortlist",
    },
    { scored: false },
  ),
  blk(
    "tl-blk-panel", 4, "Panel interview",
    "A live conversation with the hiring manager and the engineering director. They use the same five competencies and the same anchored scales as every earlier step, and score independently before comparing notes. The hiring team coordinates the time with you.",
    60,
    [
      { attributeId: "tl-att-lead", share: 25 },
      { attributeId: "tl-att-decide", share: 20 },
      { attributeId: "tl-att-comm", share: 20 },
      { attributeId: "tl-att-stress", share: 15 },
      { attributeId: "tl-att-growth", share: 20 },
    ],
    {
      kind: "human_stage",
      panel: ["Hiring Manager", "Engineering Director"],
      selfBooking: false,
      interviewKitAuto: false,
      independentBeforeDiscussion: true,
      aiNotetaker: false,
    },
  ),
];

const TL_VACANCY: VacancyV2 = {
  id: "tl-vacancy",
  code: "",
  status: "DRAFT",
  configVersion: 1,
  profile: {
    title: "Team Lead — Platform",
    openings: 1,
    seniority: "Lead",
    employmentType: "full_time",
    workMode: "hybrid",
    locations: ["HQ + remote days"],
    compensation: { min: 120000, max: 160000, currency: "USD", period: "year", visible: true },
    mission: "Lead the platform team through its next scale step: set direction, make the hard calls, and grow the engineers who ship it.",
    responsibilities: [
      "Set and communicate technical direction for the platform team",
      "Own delivery: priorities, trade-offs, and the decisions in between",
      "Grow engineers through delegation, feedback, and review",
      "Keep the team functional under load — including your own",
    ],
    teamContext: "6–8 platform engineers; reports to the Engineering Director.",
    industryPack: "tech",
    languages: { primary: "en", alternates: ["ru"] },
  },
  categories: TL_CATEGORIES,
  pipeline: TL_PIPELINE.filter((block) => block.kind === "async_interview"),
  scoring: scoringPolicy(65, ["focus_attributes", "earlier_submission"]),
  experience: experienceCfg(
    "neutral",
    "A platform team that owns its systems and its decisions.",
    ["entry", "recorded_blocks"],
  ),
  governance: governanceCfg(),
  distribution: [],
  window: { opensAt: "", closesAt: "", timezone: "UTC" },
  rollingReview: false,
  audit: [],
  createdAt: "2026-07-01T00:00:00.000Z",
};

/* ———————————————————————— the built-ins (SPEC §5) ———————————————————————— */

export const BUILT_IN_PRESETS: Preset[] = [
  {
    id: "preset-retail-associate",
    scope: "vacancy",
    name: "Retail Store Associate — hourly",
    description:
      "Hourly retail pipeline: knockout → written structured interview → SME-reviewed situational-judgment pilot → configured overt integrity instrument for the documented register/shrink requirement → availability form. Instrument evidence, accessibility and local subgroup outcomes must be reviewed before selection use. About 30 minutes of candidate time, camera-free throughout.",
    version: "1.0.0",
    builtIn: true,
    payload: RETAIL_VACANCY,
  },
  {
    id: "preset-senior-backend",
    scope: "vacancy",
    name: "Senior Backend Engineer",
    description:
      "Senior engineering pipeline triangulating job-related evidence: knockout → CV intake (context and claims, not a score) → five-question structured behavioral interview → representative browser coding work sample with a disclosed AI-use policy and a two-dimension rubric → human panel scoring the frozen BARS independently before discussion. Local outcome and fairness monitoring remain required.",
    version: "1.0.0",
    builtIn: true,
    payload: BE_VACANCY,
  },
  {
    id: "preset-team-lead-platform",
    scope: "vacancy",
    name: "Team Lead — Platform",
    description:
      "Launch-ready recorded video interview: five job-related competencies, one structured evidence question per attribute, transcript review, no camera-behaviour inference, and named human review of every outcome.",
    version: "1.0.0",
    provenance: "derived from vacancy vac-001 (Team Lead — Core Platform demo)",
    builtIn: true,
    payload: TL_VACANCY,
  },
];

/* ———————————————————————— instantiation (SPEC §5 "instantiate") ———————————————————————— */

const mkId = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

/* register a fresh id for every object that carries a string `id` */
function collectIds(node: unknown, map: Map<string, string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectIds(item, map);
    return;
  }
  if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    const id = rec.id;
    if (typeof id === "string" && !map.has(id)) {
      const prefix = id.includes("-") ? id.slice(0, id.indexOf("-")) : "id";
      map.set(id, mkId(prefix));
    }
    for (const value of Object.values(rec)) collectIds(value, map);
  }
}

/* rewrite every exact-match reference: attributeId, rubric bindings,
   measures, mustHaveIds, gate targets — all stay consistent */
function remapIds(node: unknown, map: Map<string, string>): void {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const value: unknown = node[i];
      if (typeof value === "string" && map.has(value)) node[i] = map.get(value);
      else remapIds(value, map);
    }
    return;
  }
  if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      const value = rec[key];
      if (typeof value === "string" && map.has(value)) rec[key] = map.get(value);
      else remapIds(value, map);
    }
  }
}

export function instantiatePreset(preset: Preset): VacancyV2 {
  /* deep copy — the stored preset payload is never mutated */
  const clone = JSON.parse(JSON.stringify(preset.payload)) as VacancyV2;

  const idMap = new Map<string, string>();
  collectIds(clone, idMap);
  remapIds(clone, idMap);

  clone.id = mkId("vac");
  clone.code = ""; // Competition Code is minted at publish (SPEC §4.8)
  clone.status = "DRAFT";
  clone.configVersion = 1;
  clone.audit = [];
  clone.createdAt = new Date().toISOString();
  delete clone.publishedAt;

  return clone;
}
