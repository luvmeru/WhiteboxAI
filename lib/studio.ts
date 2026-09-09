/* ============================================================
   VACANCY STUDIO LOGIC — pure TS, no React.
   Weight rebalancing (SPEC §4.3.1), coverage matrix (§4.3.4),
   effective weights (§4.5), impact summary + preflight (§4.8),
   competition-code minting (§4.8 Publish, §6).
   The preflight validator is the ONLY gatekeeper to publishing;
   the step rail is navigation, never a wizard lock (§4.1).
   ============================================================ */

import type { PipelineBlock, PreflightIssue, VacancyV2 } from "./types";
import { estimateMinutes } from "./blocks";
import { compileAssessmentBlueprint } from "./server/assessment-blueprint";

const round1 = (n: number): number => Math.round(n * 10) / 10;

/* ---------- empty draft (mirrors components/hr/studio/StudioProvider) ---------- */

export function createEmptyDraft(): VacancyV2 {
  const draftId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? `vac-${globalThis.crypto.randomUUID()}`
      : `vac-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id: draftId,
    code: "",
    status: "DRAFT",
    configVersion: 1,
    profile: {
      title: "",
      openings: 1,
      seniority: "Middle",
      employmentType: "full_time",
      workMode: "hybrid",
      locations: [],
      mission: "",
      responsibilities: [],
      industryPack: "tech",
      languages: { primary: "en", alternates: [] },
    },
    categories: [],
    pipeline: [],
    scoring: {
      topology: "hybrid",
      weighting: "rational",
      threshold: 65,
      banding: { enabled: false, sedWidth: 4 },
      tieBreakers: ["focus_attributes"],
      anonymization: { maskPII: true, revealAtStage: "decision" },
      abstainPolicy: { minEvidencePerAttribute: 1, onAbstain: "flag_human" },
      normalization: "absolute_rubric",
      aggregation: {
        acrossSources: "evidence_weighted_mean",
        contradictoryEvidence: "flag_human",
        optionalBlocks: "include_when_completed",
        minimumCoveragePct: 80,
      },
    },
    experience: {
      landing: { showCompensation: false, companyBlurb: "" },
      notices: {
        jurisdictionProfile: "EU",
        aiDisclosure:
          "Parts of this process are AI-assisted. Only the language content of your answers is scored — never your face, voice tone, appearance, or emotion. A named human reviews and decides.",
        retentionDays: 180,
        consentCheckpoints: ["entry", "recorded_blocks"],
        version: 1,
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
    governance: {
      roles: [],
      reviewPolicy: { independentReviews: 1, assignment: "round_robin" },
      calibrationRequired: true,
      dualControlThreshold: 25,
      slaTargets: { reviewQueueHours: 48, dispositionDays: 5 },
      changeControl: { editLive: ["Owner"], pauseClose: ["Owner", "HiringManager"] },
    },
    assessmentDesign: {
      purpose: "selection",
      jobAnalysis: {
        method: "mixed",
        sources: [],
        criticalWorkOutputs: [],
      },
      validation: {
        monitoringMode: "prelaunch_review",
        outcomeCriteria: [],
        reviewCadenceDays: 180,
        minimumSampleForAnalysis: 100,
        adverseImpactMonitoring: true,
      },
      decisionPolicy: {
        humanFinalDecision: true,
        allowAutomatedRejection: false,
        requireReasonCode: true,
        requireEvidenceCitation: true,
      },
    },
    distribution: [],
    window: { opensAt: "", closesAt: "", timezone: "Asia/Almaty" },
    rollingReview: true,
    audit: [],
    createdAt: "",
  };
}

/* ---------- weight editing (SPEC §4.3.1: locks + proportional rebalance) ---------- */

/* Set one item's weight, keep locked items untouched, scale the remaining
   unlocked items proportionally so the total stays exactly 100 (integers;
   rounding remainder goes to the largest unlocked item). */
export function rebalanceWeights<T extends { id: string; weight: number }>(
  items: T[],
  changedId: string,
  newWeight: number,
  lockedIds: Set<string>,
): T[] {
  if (!items.some((i) => i.id === changedId)) return items;

  const lockedSum = items
    .filter((i) => i.id !== changedId && lockedIds.has(i.id))
    .reduce((a, i) => a + i.weight, 0);
  const available = Math.max(0, 100 - lockedSum);
  const others = items.filter((i) => i.id !== changedId && !lockedIds.has(i.id));
  /* no unlocked neighbors: the changed item must absorb all remaining budget */
  const target = others.length === 0 ? available : Math.min(available, Math.max(0, Math.round(newWeight)));
  const remaining = available - target;
  const otherSum = others.reduce((a, i) => a + i.weight, 0);

  const scaled = new Map<string, number>();
  let acc = 0;
  for (const o of others) {
    const raw = otherSum > 0 ? (o.weight / otherSum) * remaining : remaining / others.length;
    const w = Math.floor(raw);
    scaled.set(o.id, w);
    acc += w;
  }
  const rem = remaining - acc;
  if (rem > 0 && others.length > 0) {
    const largest = [...others].sort(
      (a, b) => (scaled.get(b.id) ?? 0) - (scaled.get(a.id) ?? 0) || b.weight - a.weight,
    )[0];
    scaled.set(largest.id, (scaled.get(largest.id) ?? 0) + rem);
  }

  return items.map((i) => {
    if (i.id === changedId) return { ...i, weight: target };
    if (lockedIds.has(i.id)) return { ...i };
    return { ...i, weight: scaled.get(i.id) ?? i.weight };
  });
}

/* "Distribute equally" — unit weighting is defensible (R-I.5). */
export function distributeEqually<T extends { id: string; weight: number }>(items: T[]): T[] {
  if (items.length === 0) return [];
  const base = Math.floor(100 / items.length);
  const rem = 100 - base * items.length;
  return items.map((i, idx) => ({ ...i, weight: base + (idx < rem ? 1 : 0) }));
}

/* ---------- coverage matrix (SPEC §4.3.4 — the traceability artifact) ---------- */

export interface CoverageCell {
  attributeId: string;
  attributeName: string;
  focus: boolean;
  blockIds: string[]; // every block that maps this attribute (dot in the matrix)
  requiredSources: number;
  ok: boolean;
}

export function coverageMatrix(draft: VacancyV2): CoverageCell[] {
  const cells: CoverageCell[] = [];
  for (const cat of draft.categories) {
    for (const attr of cat.attributes) {
      const measuring = draft.pipeline.filter((b) =>
        b.measures.some((m) => m.attributeId === attr.id),
      );
      const scoredCount = measuring.filter((b) => b.scored).length;
      const requiredSources = Math.max(
        1,
        attr.evidenceRequirement?.minIndependentSources ??
          (attr.focus ? 2 : 1),
      );
      cells.push({
        attributeId: attr.id,
        attributeName: attr.name,
        focus: !!attr.focus,
        blockIds: measuring.map((b) => b.id),
        requiredSources,
        ok: scoredCount >= requiredSources,
      });
    }
  }
  return cells;
}

/* ---------- effective weights (SPEC §4.5 — catches silent double-counting) ---------- */

export interface EffectiveWeights {
  attributes: { attributeId: string; name: string; pct: number }[];
  blocks: { blockId: string; title: string; pct: number }[];
}

/* True % of the final composite: category weight × attribute weight within
   category, distributed over the scored blocks measuring that attribute in
   proportion to their measure shares. */
export function effectiveWeights(draft: VacancyV2): EffectiveWeights {
  const scoredBlocks = draft.pipeline.filter((b) => b.scored);
  const blockPct = new Map<string, number>(scoredBlocks.map((b) => [b.id, 0]));
  const attributes: EffectiveWeights["attributes"] = [];
  const attributeCount = draft.categories.reduce(
    (sum, category) => sum + category.attributes.length,
    0,
  );

  for (const cat of draft.categories) {
    for (const attr of cat.attributes) {
      const pct =
        draft.scoring.weighting === "unit" && attributeCount > 0
          ? 100 / attributeCount
          : (cat.weight / 100) * attr.weight; // (cat/100) × (attr/100) × 100
      attributes.push({ attributeId: attr.id, name: attr.name, pct: round1(pct) });

      const measuring = scoredBlocks
        .map((b) => ({ b, share: b.measures.find((m) => m.attributeId === attr.id)?.share ?? 0 }))
        .filter((x) => x.share > 0);
      const shareTotal = measuring.reduce((a, x) => a + x.share, 0);
      for (const { b, share } of measuring) {
        blockPct.set(b.id, (blockPct.get(b.id) ?? 0) + pct * (share / shareTotal));
      }
    }
  }

  return {
    attributes,
    blocks: scoredBlocks.map((b) => ({
      blockId: b.id,
      title: b.title,
      pct: round1(blockPct.get(b.id) ?? 0),
    })),
  };
}

/* ---------- shared caution computations (SPEC §4.8, R-I.1/I.6) ---------- */

function effectivePctByKind(draft: VacancyV2, kind: PipelineBlock["kind"]): number {
  const ew = effectiveWeights(draft);
  const kindOf = new Map(draft.pipeline.map((b) => [b.id, b.kind]));
  return round1(
    ew.blocks.filter((b) => kindOf.get(b.blockId) === kind).reduce((a, b) => a + b.pct, 0),
  );
}

/* Conservative design-review trigger. This is a product governance guardrail,
   not a universal effect-size claim: subgroup outcomes must be measured for
   the actual instrument, role, population and decision rule. */
function cognitiveCaution(draft: VacancyV2): string | null {
  const ordered = [...draft.pipeline].sort((a, b) => a.order - b.order);
  const idx = ordered.findIndex((b) => b.kind === "cognitive");
  if (idx < 0) return null;
  const pct = effectivePctByKind(draft, "cognitive");
  const firstHalf = idx < ordered.length / 2;
  if (pct <= 15 && !firstHalf) return null;
  const cause =
    pct > 15 && firstHalf
      ? `carries ${pct}% of the composite and sits in the first half of the pipeline`
      : pct > 15
        ? `carries ${pct}% of the composite`
        : `sits in the first half of the pipeline`;
  return `A cognitive instrument ${cause}. WhiteBox uses this as a conservative review trigger: document the exact validated instrument, job relevance, accommodation plan and local subgroup/outcome monitoring before it affects selection.`;
}

/* ---------- impact summary (time, validation readiness, fairness, lint) ---------- */

export interface ImpactSummary {
  totalMinutes: number;
  validationReadiness: {
    passed: number;
    total: number;
    status: "not_ready" | "prelaunch" | "operational";
    missing: string[];
  };
  adverseImpactNotes: string[];
  lint: { blockers: number; warnings: number };
}

export function impactSummary(draft: VacancyV2): ImpactSummary {
  const totalMinutes = draft.pipeline
    .filter(
      (b) =>
        b.required &&
        !(
          b.settings.kind === "human_stage" &&
          !b.scored &&
          !b.settings.selfBooking
        ),
    )
    .reduce((a, b) => a + estimateMinutes(b), 0);

  const design = draft.assessmentDesign;
  const coverage = coverageMatrix(draft);
  const scoredBlocks = draft.pipeline.filter((block) => block.scored);
  const readinessChecks = [
    {
      ok: Boolean(
        design?.jobAnalysis.sources.length &&
          design.jobAnalysis.criticalWorkOutputs.length,
      ),
      missing:
        "Document job-analysis sources and the critical work outputs this assessment samples.",
    },
    {
      ok:
        draft.categories.flatMap((category) => category.attributes).length > 0 &&
        draft.categories
          .flatMap((category) => category.attributes)
          .every(
            (attribute) =>
              attribute.definition.trim().length >= 10 &&
              attribute.scale.anchors.length === 5 &&
              attribute.scale.anchors.every(
                (anchor) => anchor.trim().length >= 3,
              ),
          ),
      missing:
        "Define every criterion observably and provide five usable BARS anchors.",
    },
    {
      ok: coverage.length > 0 && coverage.every((item) => item.ok),
      missing:
        "Cover every criterion with the required number of independent scored sources.",
    },
    {
      ok:
        scoredBlocks.length > 0 &&
        scoredBlocks.every(
          (block) =>
            Boolean(block.validation) &&
            block.validation?.status !== "draft" &&
            Boolean(block.validation?.reviewedBy) &&
            Boolean(block.validation?.reviewedAt) &&
            (block.validation?.evidenceRefs.length ?? 0) > 0,
        ),
      missing:
        "Record job-expert review, date and evidence references for every scored method.",
    },
    {
      ok: Boolean(
        design?.validation.outcomeCriteria.length &&
          design.validation.reviewCadenceDays > 0 &&
          design.validation.minimumSampleForAnalysis > 0 &&
          design.validation.adverseImpactMonitoring,
      ),
      missing:
        "Define outcome criteria, review cadence, minimum analysis sample and adverse-impact monitoring.",
    },
    {
      ok:
        new Set(
          draft.governance.roles
            .filter((role) => role.role !== "Observer")
            .map((role) => role.userId),
        ).size >= draft.governance.reviewPolicy.independentReviews,
      missing:
        "Assign enough distinct accountable reviewers for the selected review policy.",
    },
  ];
  const missing = readinessChecks
    .filter((check) => !check.ok)
    .map((check) => check.missing);
  const passed = readinessChecks.length - missing.length;
  const locallyValidated =
    scoredBlocks.length > 0 &&
    scoredBlocks.every(
      (block) => block.validation?.status === "locally_validated",
    ) &&
    design?.validation.monitoringMode === "operational";
  const validationReadiness: ImpactSummary["validationReadiness"] = {
    passed,
    total: readinessChecks.length,
    status:
      missing.length > 0
        ? "not_ready"
        : locallyValidated
          ? "operational"
          : "prelaunch",
    missing,
  };

  const adverseImpactNotes: string[] = [];
  const cog = cognitiveCaution(draft);
  if (cog) adverseImpactNotes.push(cog);
  const persPct = effectivePctByKind(draft, "personality");
  if (persPct > 20) {
    adverseImpactNotes.push(
      `A personality instrument carries ${persPct}% of the composite. This exceeds WhiteBox's conservative supporting-signal review trigger; document the exact instrument, permitted use and local monitoring.`,
    );
  }

  const issues = preflight(draft);
  return {
    totalMinutes,
    validationReadiness,
    adverseImpactNotes,
    lint: {
      blockers: issues.filter((i) => i.severity === "blocker").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
    },
  };
}

/* ---------- preflight validator (SPEC §4.8 — runs continuously) ---------- */

/* Scored items must bind to one criterion. A single-criterion rubric can be
   migrated safely by inference; multi-criterion rubrics require an explicit
   attributeId on every dimension so one rating never scores several constructs. */
function checkBindings(b: PipelineBlock): { unbound: number; needsMeasures: boolean } {
  const s = b.settings;
  let unbound = 0;
  let needsMeasures = false;
  switch (s.kind) {
    case "application_form":
      if (b.measures.length !== 1) {
        for (const field of s.fields) {
          if (field.scored && !field.attributeId) unbound++;
        }
      }
      break;
    case "async_interview":
    case "live_ai_interview":
    case "chat_interview":
      for (const q of s.questions) if (!q.attributeId || !q.rubric.attributeId) unbound++;
      break;
    case "sjt":
      for (const item of s.items) if (!item.attributeId) unbound++;
      break;
    case "job_knowledge":
      for (const item of s.items) if (!item.attributeId) unbound++;
      break;
    case "cognitive":
      if (b.measures.length !== 1) {
        for (const unit of s.subtests) {
          if (
            !(s.criterionMappings ?? []).some(
              (mapping) => mapping.unit === unit && mapping.attributeId,
            )
          ) {
            unbound++;
          }
        }
      }
      break;
    case "integrity_test":
      if (b.measures.length !== 1) {
        for (const unit of s.domains) {
          if (
            !(s.criterionMappings ?? []).some(
              (mapping) => mapping.unit === unit && mapping.attributeId,
            )
          ) {
            unbound++;
          }
        }
      }
      break;
    case "language_test":
      if (b.measures.length !== 1) {
        for (const unit of s.skills) {
          if (
            !(s.criterionMappings ?? []).some(
              (mapping) => mapping.unit === unit && mapping.attributeId,
            )
          ) {
            unbound++;
          }
        }
      }
      break;
    case "work_sample":
    case "coding":
    case "case_exercise":
    case "custom":
      needsMeasures = s.rubricDimensions.length > 0 && b.measures.length === 0;
      if (b.measures.length !== 1) {
        for (const dimension of s.rubricDimensions) {
          if (!dimension.attributeId) unbound++;
        }
      }
      break;
    default:
      break;
  }
  return { unbound, needsMeasures };
}

const PROXY_RISK = /zip|address|graduation year|age|born/i;
const INTERVIEW_KINDS = new Set<PipelineBlock["kind"]>([
  "async_interview",
  "live_ai_interview",
  "chat_interview",
]);

function normalizedSentinel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/u, "")
    .replace(/\s+/gu, " ");
}

const GENERIC_ANCHOR_SETS = [
  [
    "no evidence",
    "limited evidence",
    "adequate evidence",
    "strong evidence",
    "exceptional evidence",
  ],
  [
    "no usable evidence",
    "limited evidence",
    "meets the minimum",
    "strong evidence",
    "exceptional evidence",
  ],
] as const;

function hasUntouchedGenericAnchors(anchors: readonly string[]): boolean {
  const normalized = anchors.map(normalizedSentinel);
  return GENERIC_ANCHOR_SETS.some(
    (sentinels) =>
      sentinels.length === normalized.length &&
      sentinels.every((sentinel, index) => normalized[index] === sentinel),
  );
}

function isGenericOption(value: string): boolean {
  return /^(?:response\s+)?option\s+(?:[a-z]|\d+)$/iu.test(
    normalizedSentinel(value),
  );
}

export function preflight(draft: VacancyV2): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const blocker = (id: string, step: PreflightIssue["step"], message: string) =>
    issues.push({ id, severity: "blocker", step, message, overridable: false });
  const warning = (id: string, step: PreflightIssue["step"], message: string) =>
    issues.push({ id, severity: "warning", step, message, overridable: true });

  const ordered = [...draft.pipeline].sort((a, b) => a.order - b.order);

  /* — step 1 · profile — */
  if (draft.profile.title.trim() === "") {
    blocker("pf-title", 1, "Give the position a title — prompts, the landing page, and notices are all generated from it.");
  }

  /* — step 2 · criteria weights sum to 100 at every level — */
  if (draft.categories.length === 0) {
    blocker("pf-categories-empty", 2, "No criteria defined yet — add at least one category of attributes so the pipeline has something to measure.");
  } else {
    const catSum = draft.categories.reduce((a, c) => a + c.weight, 0);
    if (catSum !== 100) {
      blocker("pf-category-weights", 2, `Category weights must sum to 100 — they currently sum to ${catSum}.`);
    }
    for (const cat of draft.categories) {
      if (normalizedSentinel(cat.name) === "new category") {
        blocker(
          `pf-placeholder-category-${cat.id}`,
          2,
          'Replace the untouched "New category" label with a job-related criterion group.',
        );
      }
      const attrSum = cat.attributes.reduce((a, x) => a + x.weight, 0);
      if (attrSum !== 100) {
        blocker(`pf-attr-weights-${cat.id}`, 2, `Attribute weights in "${cat.name}" must sum to 100 — they currently sum to ${attrSum}.`);
      }
      for (const attribute of cat.attributes) {
        if (normalizedSentinel(attribute.name) === "new attribute") {
          blocker(
            `pf-placeholder-attribute-name-${attribute.id}`,
            2,
            'Replace the untouched "New attribute" label with a job-related criterion.',
          );
        }
        if (
          normalizedSentinel(attribute.definition) ===
          "describe observable behavior"
        ) {
          blocker(
            `pf-placeholder-attribute-definition-${attribute.id}`,
            2,
            `"${attribute.name}" still has the editor's generic definition. Define the observable work behavior and its boundaries.`,
          );
        }
        if (hasUntouchedGenericAnchors(attribute.scale.anchors)) {
          blocker(
            `pf-placeholder-attribute-anchors-${attribute.id}`,
            2,
            `"${attribute.name}" still has generic scale anchors. Replace all five with job-specific, behaviorally distinguishable evidence levels.`,
          );
        }
      }
    }
  }

  /* — step 3 · pipeline exists — */
  if (draft.pipeline.length === 0) {
    blocker("pf-pipeline-empty", 3, "The pipeline is empty — add at least one block for candidates to complete.");
  }

  /* — step 3 · coverage: every scored attribute ≥1 scored block, focus ≥2 — */
  if (draft.pipeline.length > 0) {
    const positions = draft.pipeline
      .map((block) => block.order)
      .sort((left, right) => left - right);
    if (positions.some((position, index) => position !== index + 1)) {
      blocker(
        "pf-pipeline-order",
        3,
        "Pipeline order must be unique and continuous from 1. Reorder the stages before publishing so candidate progress and evidence provenance are deterministic.",
      );
    }
  }

  for (const cell of coverageMatrix(draft)) {
    const scoredCount = draft.pipeline.filter(
      (b) => b.scored && b.measures.some((m) => m.attributeId === cell.attributeId),
    ).length;
    if (scoredCount < 1) {
      blocker(`pf-coverage-${cell.attributeId}`, 3, `"${cell.attributeName}" is weighted but no scored block measures it — map it in a block's attribute mapping.`);
    } else if (scoredCount < cell.requiredSources) {
      warning(
        `pf-coverage-sources-${cell.attributeId}`,
        3,
        `"${cell.attributeName}" has ${scoredCount} of ${cell.requiredSources} configured independent evidence sources. Keep it in mandatory human review or add another job-related method.`,
      );
    }
  }

  /* — step 3 · every scored question / item / rubric dimension bound — */
  for (const b of ordered.filter((x) => x.scored)) {
    const { unbound, needsMeasures } = checkBindings(b);
    if (unbound > 0) {
      blocker(`pf-binding-${b.id}`, 3, `${unbound} scored item${unbound === 1 ? " is" : "s are"} not bound to an attribute in "${b.title}" — every scored item needs a rubric tied to exactly one attribute.`);
    }
    if (needsMeasures) {
      blocker(`pf-measures-${b.id}`, 3, `"${b.title}" scores rubric dimensions but measures no attribute — add an attribute mapping so its scores roll up.`);
    }
    if (b.settings.kind === "application_form") {
      for (const field of b.settings.fields.filter((candidate) => candidate.scored)) {
        const points = (field.options ?? []).map((option) => option.points);
        const keyed =
          ["single_choice", "multi_choice", "dropdown"].includes(field.type) &&
          points.length >= 2 &&
          points.every(
            (value): value is number =>
              typeof value === "number" && Number.isFinite(value),
          ) &&
          new Set(points).size >= 2;
        if (!keyed) {
          blocker(
            `pf-form-key-${b.id}-${field.id}`,
            3,
            `"${field.label}" is marked scored but has no complete rational response key. Use at least two choice options with explicit, different points or keep the field context-only.`,
          );
        }
      }
    }
  }
  for (const b of ordered) {
    const settings = b.settings;
    if (settings.kind === "application_form") {
      for (const field of settings.fields) {
        if (normalizedSentinel(field.label) === "new field") {
          blocker(
            `pf-placeholder-form-field-${b.id}-${field.id}`,
            3,
            `"${b.title}" contains an untouched form-field label. Name the exact information requested.`,
          );
        }
        if (
          (field.options ?? []).some((option) =>
            isGenericOption(option.text),
          )
        ) {
          blocker(
            `pf-placeholder-form-options-${b.id}-${field.id}`,
            3,
            `"${field.label}" contains generic response options. Replace every option with substantive candidate-facing choices.`,
          );
        }
      }
    }
    if (settings.kind === "knockout") {
      for (const item of settings.items) {
        if (
          normalizedSentinel(item.question) === "untitled requirement" ||
          (item.options ?? []).some((option) =>
            isGenericOption(option.text),
          )
        ) {
          blocker(
            `pf-placeholder-knockout-${b.id}-${item.id}`,
            3,
            `"${b.title}" contains an untouched requirement or generic option. Publish the exact job-essential rule and substantive responses.`,
          );
        }
      }
    }
    if (
      settings.kind === "async_interview" ||
      settings.kind === "live_ai_interview" ||
      settings.kind === "chat_interview"
    ) {
      for (const question of settings.questions) {
        if (
          normalizedSentinel(question.text) ===
            "untitled structured question" ||
          hasUntouchedGenericAnchors(question.rubric.anchors)
        ) {
          blocker(
            `pf-placeholder-interview-${b.id}-${question.id}`,
            3,
            `"${b.title}" contains an untouched question or generic BARS. Author a job-specific prompt and five evidence anchors.`,
          );
        }
      }
    }
    if (settings.kind === "sjt") {
      for (const item of settings.items) {
        if (
          normalizedSentinel(item.scenario) === "untitled scenario" ||
          item.options.some((option) => isGenericOption(option.text))
        ) {
          blocker(
            `pf-placeholder-sjt-${b.id}-${item.id}`,
            3,
            `"${b.title}" contains an untouched SJT scenario or generic response option. Replace it with SME-reviewed, job-specific content.`,
          );
        }
      }
    }
    if (settings.kind === "job_knowledge") {
      for (const item of settings.items) {
        if (
          normalizedSentinel(item.prompt) === "untitled item" ||
          (item.options ?? []).some((option) =>
            isGenericOption(option.text),
          )
        ) {
          blocker(
            `pf-placeholder-knowledge-${b.id}-${item.id}`,
            3,
            `"${b.title}" contains an untouched knowledge item or generic response option. Publish substantive job-knowledge content and a defensible key.`,
          );
        }
      }
    }
    if (
      settings.kind === "work_sample" ||
      settings.kind === "coding" ||
      settings.kind === "case_exercise" ||
      settings.kind === "custom"
    ) {
      for (const dimension of settings.rubricDimensions) {
        if (
          normalizedSentinel(dimension.name) === "new evidence dimension" ||
          hasUntouchedGenericAnchors(dimension.anchors)
        ) {
          blocker(
            `pf-placeholder-rubric-${b.id}-${dimension.id}`,
            3,
            `"${b.title}" contains an untouched rubric dimension or generic anchors. Replace them with evidence levels specific to the task.`,
          );
        }
      }
    }
    if (
      settings.kind === "doc_verification" &&
      settings.requiredDocuments.some(
        (document) =>
          normalizedSentinel(document.label) === "required document",
      )
    ) {
      blocker(
        `pf-placeholder-document-${b.id}`,
        3,
        `"${b.title}" contains the generic "Required document" label. Name the exact qualification evidence requested.`,
      );
    }
    if (
      b.settings.kind === "application_form" &&
      !b.scored &&
      b.settings.fields.some((field) => field.scored)
    ) {
      blocker(
        `pf-form-block-unscored-${b.id}`,
        3,
        `"${b.title}" contains scored fields while the block itself is context-only. Enable block scoring or keep every field unscored.`,
      );
    }
    if (b.settings.kind === "human_stage") {
      if (
        b.settings.selfBooking &&
        (!b.settings.bookingUrl ||
          !b.settings.bookingUrl.startsWith("https://"))
      ) {
        blocker(
          `pf-human-booking-${b.id}`,
          3,
          `"${b.title}" enables candidate self-booking but has no HTTPS scheduling URL. Add the exact employer-controlled booking link or let the employer schedule the stage.`,
        );
      }
      if (b.settings.aiNotetaker) {
        blocker(
          `pf-human-notetaker-${b.id}`,
          3,
          `"${b.title}" enables an AI notetaker, but no consented human-interview recording provider is connected. Disable it until that provider and retention path are configured.`,
        );
      }
      if (b.settings.interviewKitAuto) {
        blocker(
          `pf-human-interview-kit-${b.id}`,
          3,
          `"${b.title}" enables automatic evidence-gap interview-kit generation, but no server-owned generated kit, approval receipt or frozen delivery contract exists. Disable it and author the structured panel protocol explicitly.`,
        );
      }
    }
  }

  /* A configured control must have a complete frozen execution and review
     contract. Until then publication fails explicitly instead of presenting a
     checkbox that silently does nothing or imitating a third-party service. */
  for (const b of ordered) {
    const settings = b.settings;
    if (settings.kind === "async_interview") {
      if (settings.order === "randomized") {
        blocker(
          `pf-runtime-async-order-${b.id}`,
          3,
          `"${b.title}" requests randomized main-question order, but no per-application frozen order is produced for recorded interviews. Use fixed order until that specialization is implemented.`,
        );
      }
      if (settings.introVideo !== "none") {
        blocker(
          `pf-runtime-async-intro-${b.id}`,
          3,
          `"${b.title}" enables an intro video without an uploaded, versioned media asset and playback receipt. Select no intro video until that delivery contract exists.`,
        );
      }
      if (settings.practiceQuestion) {
        blocker(
          `pf-runtime-async-practice-${b.id}`,
          3,
          `"${b.title}" promises an unscored practice response, but the current candidate runtime only performs device preview. Disable practice until a discardable practice capture and confirmation flow is implemented.`,
        );
      }
      if (settings.pauseAllowance > 0) {
        blocker(
          `pf-runtime-async-pauses-${b.id}`,
          3,
          `"${b.title}" grants pauses, but pause state and server timestamps are not part of the frozen attempt contract. Set pause allowance to none.`,
        );
      }
      if (settings.reviewBeforeSubmit) {
        blocker(
          `pf-runtime-async-review-${b.id}`,
          3,
          `"${b.title}" enables answer review, but recorded answers are submitted turn by turn and cannot yet be reviewed as a complete draft. Disable review before submit.`,
        );
      }
    }
    if (settings.kind === "live_ai_interview") {
      if (settings.adaptivity === "probe_reorder") {
        blocker(
          `pf-runtime-live-reorder-${b.id}`,
          3,
          `"${b.title}" enables main-question reordering, but the runtime only adapts approved follow-up probes around the frozen main sequence. Select probe-only adaptivity.`,
        );
      }
      if (settings.latencyFallback !== "async") {
        blocker(
          `pf-runtime-live-fallback-${b.id}`,
          3,
          `"${b.title}" selects chat fallback, but the current recovery path preserves the attempt through recorded asynchronous retry. Select recorded async fallback.`,
        );
      }
      if (settings.bargeInAllowed) {
        blocker(
          `pf-runtime-live-barge-in-${b.id}`,
          3,
          `"${b.title}" enables interruption of streamed speech, but the interviewer has no interruptible TTS stream. Disable barge-in.`,
        );
      }
    }
    if (settings.kind === "application_form" && settings.prefillFromCv) {
      blocker(
        `pf-runtime-cv-prefill-${b.id}`,
        3,
        `"${b.title}" enables CV prefill, but no frozen field-to-CV mapping and candidate confirmation contract is configured. Disable prefill until that mapping is implemented.`,
      );
    }
    if (
      settings.kind === "cv_intake" &&
      (settings.parseTargets.length > 0 || settings.extractClaims)
    ) {
      blocker(
        `pf-runtime-cv-parse-${b.id}`,
        3,
        `"${b.title}" requests CV parsing or a claims ledger, but no configured parser, immutable extraction schema and candidate correction flow are bound to this vacancy. Plain private CV upload remains available when both controls are disabled.`,
      );
    }
    if (
      settings.kind === "job_knowledge" &&
      settings.timing === "per_item"
    ) {
      blocker(
        `pf-runtime-knowledge-item-time-${b.id}`,
        3,
        `"${b.title}" selects per-item timing without publishing a time cap for each item. Use a total timer or add a complete item-timing schema before publishing.`,
      );
    }
    if (
      settings.kind === "chat_interview" &&
      settings.typingTelemetry
    ) {
      blocker(
        `pf-runtime-typing-telemetry-${b.id}`,
        3,
        `"${b.title}" enables typing telemetry without a frozen event schema, purpose limitation, retention rule and candidate-visible review contract. Disable it until those safeguards are configured.`,
      );
    }
    if (settings.kind === "sjt" && settings.timing === "soft_per_item") {
      blocker(
        `pf-runtime-sjt-soft-timing-${b.id}`,
        3,
        `"${b.title}" enables per-item timing, but item-open and item-submit server receipts are not captured. Use untimed delivery until that telemetry contract exists.`,
      );
    }
    if (settings.kind === "work_sample" && settings.originalityCheck) {
      blocker(
        `pf-runtime-originality-${b.id}`,
        3,
        `"${b.title}" enables an originality advisory without a configured provider, comparison corpus, threshold policy or human adjudication contract. Disable it until those controls are bound.`,
      );
    }
    if (settings.kind === "work_sample" && settings.defenseFollowUp) {
      blocker(
        `pf-runtime-defense-${b.id}`,
        3,
        `"${b.title}" promises defense follow-ups, but the exact follow-up questions and their target interview block are not frozen in the vacancy. Disable it or publish an explicit structured interview question plan.`,
      );
    }
    if (settings.kind === "coding" && settings.similarityCheck) {
      blocker(
        `pf-runtime-similarity-${b.id}`,
        3,
        `"${b.title}" enables similarity checking without a configured provider, comparison corpus, threshold policy or human adjudication contract. Disable it until those controls are bound.`,
      );
    }
    if (settings.kind === "coding") {
      const scoringAreas = [
        "correctness",
        "quality",
        "approach",
      ] as const;
      const splitTotal = scoringAreas.reduce(
        (sum, area) => sum + settings.scoringSplit[area],
        0,
      );
      if (Math.abs(splitTotal - 100) > 0.000001) {
        blocker(
          `pf-runtime-coding-split-${b.id}`,
          3,
          `"${b.title}" scoring-area weights must total 100; they currently total ${splitTotal}.`,
        );
      }
      for (const area of scoringAreas) {
        if (
          settings.scoringSplit[area] > 0 &&
          !settings.rubricDimensions.some(
            (dimension) => dimension.codingScoringArea === area,
          )
        ) {
          blocker(
            `pf-runtime-coding-area-${b.id}-${area}`,
            3,
            `"${b.title}" assigns ${settings.scoringSplit[area]}% to ${area} without a rubric dimension mapped to that area.`,
          );
        }
      }
      for (const dimension of settings.rubricDimensions) {
        if (!dimension.codingScoringArea) {
          blocker(
            `pf-runtime-coding-dimension-area-${b.id}-${dimension.id}`,
            3,
            `"${dimension.name}" must be assigned to correctness, quality, or approach so the published scoring split actually governs evaluation.`,
          );
        }
      }
    }
    if (
      settings.kind === "coding" &&
      settings.environment === "take_home_repo"
    ) {
      blocker(
        `pf-runtime-take-home-repo-${b.id}`,
        3,
        `"${b.title}" accepts only a repository URL and commit identifier, but repository contents are not ingested into the immutable evidence receipt or reviewer workspace. Use the browser source editor until exact commit evidence is captured.`,
      );
    }
    if (settings.kind === "coding" && settings.taskSource !== "custom") {
      blocker(
        `pf-runtime-coding-provenance-${b.id}`,
        3,
        `"${b.title}" claims a validated bank or SME-reviewed task without a frozen bank item/version or named SME approval receipt. Use custom task source until that provenance is recorded.`,
      );
    }
    if (settings.kind === "case_exercise" && settings.format === "in_basket") {
      blocker(
        `pf-runtime-in-basket-${b.id}`,
        3,
        `"${b.title}" sets an in-basket item count without freezing the individual items, response schema and item-level receipts. Use case analysis until the item contract is implemented.`,
      );
    }
    if (settings.kind === "case_exercise" && settings.format === "role_play") {
      blocker(
        `pf-runtime-role-play-${b.id}`,
        3,
        `"${b.title}" includes a counterpart script, but no disclosed, recorded role-play runtime consumes it. Use case analysis until the counterpart interaction and evidence receipt are implemented.`,
      );
    }
    if (
      settings.kind === "case_exercise" &&
      settings.format === "presentation"
    ) {
      blocker(
        `pf-runtime-presentation-${b.id}`,
        3,
        `"${b.title}" is configured as a presentation, but the current stage only collects text, files or links and does not capture a timed presentation recording. Use case analysis until presentation capture is implemented.`,
      );
    }
    if (
      settings.kind === "doc_verification" &&
      settings.acceptedFormats.some(
        (format) => !["pdf", "docx"].includes(format.toLowerCase()),
      )
    ) {
      blocker(
        `pf-runtime-document-format-${b.id}`,
        3,
        `"${b.title}" lists a format that the private artifact upload service cannot ingest. Limit document evidence to PDF and DOCX.`,
      );
    }
    if (
      settings.kind === "doc_verification" &&
      settings.mode === "auto_extract_match"
    ) {
      blocker(
        `pf-runtime-document-provider-${b.id}`,
        3,
        `"${b.title}" selects automatic extraction and matching, but no verification provider is bound to this vacancy. Use named manual content review until a provider receipt contract is configured.`,
      );
    }
    if (settings.kind === "doc_verification" && settings.idCheck) {
      blocker(
        `pf-runtime-document-id-${b.id}`,
        3,
        `"${b.title}" enables identity checking without a disclosed identity provider and adjudication contract. Disable identity check.`,
      );
    }
    if (
      settings.kind === "reference_check" &&
      settings.anonymizedAggregation
    ) {
      blocker(
        `pf-runtime-reference-aggregation-${b.id}`,
        3,
        `"${b.title}" promises an anonymous aggregate, but the current reference runtime stores individually attributable response receipts and has no server-owned minimum-cell aggregation contract. Disable anonymous aggregation before publishing.`,
      );
    }
  }

  const applicationForms = ordered.filter(
    (block) => block.settings.kind === "application_form",
  );
  for (const block of ordered.filter(
    (candidate) => candidate.settings.kind === "knockout",
  )) {
    if (block.settings.kind !== "knockout") continue;
    if (applicationForms.length === 0) {
      warning(
        `pf-knockout-placement-no-form-${block.id}`,
        3,
        `"${block.title}" has a placement relative to an application form, but this pipeline has no application-form stage. Candidate execution follows pipeline order.`,
      );
      continue;
    }
    const placementMatchesOrder =
      block.settings.placement === "before_form"
        ? applicationForms.every(
            (applicationForm) => block.order < applicationForm.order,
          )
        : applicationForms.every(
            (applicationForm) => block.order > applicationForm.order,
          );
    if (!placementMatchesOrder) {
      blocker(
        `pf-knockout-placement-${block.id}`,
        3,
        `"${block.title}" is marked ${block.settings.placement === "before_form" ? "before form" : "after form"}, but its pipeline position contradicts that setting. Reorder the stage or change the placement; runtime follows pipeline order.`,
      );
    }
  }

  /* Interaction-event logging is the only implemented integrity mode. Camera
     behavior, liveness and identity inference are deliberately not simulated. */
  for (const b of ordered) {
    if (b.integrityTier >= 2) {
      blocker(
        `pf-integrity-provider-${b.id}`,
        3,
        `"${b.title}" references legacy integrity tier ${b.integrityTier}. WhiteBox does not imitate liveness, identity, gaze or camera-behaviour analysis; select tier 0 or the disclosed interaction-event tier 1.`,
      );
    }
  }

  /* — step 5 · notices pack complete — */
  if (
    draft.experience.notices.aiDisclosure.trim() === "" ||
    draft.experience.notices.jurisdictionProfile.trim() === ""
  ) {
    blocker("pf-notices", 5, "The notice pack is incomplete — set a jurisdiction profile and the AI-use disclosure before publishing.");
  }

  /* — step 6 · at least one human reviewer — */
  if (!draft.governance.roles.some((r) => r.role !== "Observer")) {
    blocker("pf-reviewer", 6, "Assign at least one human reviewer — every decision needs a named human, and Observers are read-only.");
  }
  const independentReviewerCount = new Set(
    draft.governance.roles
      .filter((role) => role.role !== "Observer")
      .map((role) => role.userId),
  ).size;
  if (
    independentReviewerCount <
    draft.governance.reviewPolicy.independentReviews
  ) {
    blocker(
      "pf-independent-reviewers",
      6,
      `Assign at least ${draft.governance.reviewPolicy.independentReviews} distinct non-observer reviewers to enforce the selected independent-review policy.`,
    );
  }

  /* — step 7 · window sanity — */
  if (draft.window.opensAt && draft.window.closesAt) {
    if (new Date(draft.window.closesAt).getTime() <= new Date(draft.window.opensAt).getTime()) {
      blocker("pf-window-order", 7, "The application window closes before it opens — check the dates.");
    }
  }

  /* — warnings (overridable with a logged reason) — */

  const totalMinutes = draft.pipeline
    .filter(
      (b) =>
        b.required &&
        !(
          b.settings.kind === "human_stage" &&
          !b.scored &&
          !b.settings.selfBooking
        ),
    )
    .reduce((a, b) => a + estimateMinutes(b), 0);
  if (totalMinutes > 45) {
    warning("pf-time-budget", 3, `Required blocks total ${fmtMinutes(totalMinutes)}, above the configured 45-minute burden review trigger. Confirm proportionality, accessibility and whether any stage can be delayed or optional.`);
  }

  const persPct = effectivePctByKind(draft, "personality");
  if (persPct > 20) {
    warning("pf-personality-weight", 4, `A personality instrument carries ${persPct}% of the composite, above WhiteBox's conservative supporting-signal review trigger. Document the exact instrument, permitted use and local validation before proceeding.`);
  }

  const cog = cognitiveCaution(draft);
  if (cog) warning("pf-cognitive-caution", 4, cog);

  for (const b of ordered) {
    if (b.settings.kind !== "knockout") continue;
    for (const item of b.settings.items) {
      if (PROXY_RISK.test(item.question)) {
        const excerpt = item.question.length > 60 ? item.question.slice(0, 57) + "…" : item.question;
        warning(`pf-proxy-${item.id}`, 3, `Knockout item "${excerpt}" may proxy for a protected characteristic (address or age signals) — rephrase it or route it to human review (IL HB 3773).`);
      }
    }
  }

  if (draft.pipeline.length > 0 && !draft.pipeline.some((b) => INTERVIEW_KINDS.has(b.kind))) {
    warning("pf-no-interview", 3, "No structured interview is present. Confirm that every required criterion still has standardized, job-related evidence and an accountable review path.");
  }

  const blueprint = compileAssessmentBlueprint(draft);
  for (const issue of blueprint.issues) {
    const id = `pf-blueprint-${issue.code}-${issue.blockId ?? issue.attributeId ?? "vacancy"}`;
    const step: PreflightIssue["step"] = issue.attributeId ? 2 : 3;
    if (issue.severity === "blocker") {
      blocker(id, step, issue.message);
    } else {
      warning(id, step, issue.message);
    }
  }

  return issues;
}

/* ---------- competition code (SPEC §4.8 Publish, §6) ---------- */

/* No vowels, no I/O/0/1 — unambiguous when spoken or printed, profanity-safe. */
const CODE_ALPHABET = "BCDFGHJKMNPQRSTVWXYZ23456789";

export function mintCode(existing: string[]): string {
  const taken = new Set(existing.map((c) => c.toUpperCase()));
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = "WBX-";
    for (let i = 0; i < 4; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!taken.has(code)) return code;
  }
  /* store nearly saturated (28⁴ codes) — walk the space deterministically */
  for (const a of CODE_ALPHABET) {
    for (const b of CODE_ALPHABET) {
      for (const c of CODE_ALPHABET) {
        for (const d of CODE_ALPHABET) {
          const code = `WBX-${a}${b}${c}${d}`;
          if (!taken.has(code)) return code;
        }
      }
    }
  }
  return "WBX-FULL"; // unreachable in practice
}

/* ---------- candidate-facing time formatting ---------- */

export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m === 0) return "0 min";
  if (m <= 90) return `about ${m} min`;
  const halfHours = Math.round(m / 30) / 2; // nearest half hour
  const h = Number.isInteger(halfHours) ? String(halfHours) : halfHours.toFixed(1);
  return `about ${h} h`;
}
