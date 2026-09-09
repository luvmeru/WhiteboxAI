"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, Check, ChevronRight, CircleHelp, Copy,
  Eye, GripVertical, Library, Lock, Plus, RotateCcw, ShieldCheck,
  Sparkles, Trash2, WandSparkles, X,
} from "lucide-react";
import { useStudio } from "./StudioProvider";
import { BLOCK_GROUPS, BLOCK_LIBRARY, createBlock, estimateMinutes } from "@/lib/blocks";
import { BUILT_IN_PRESETS, instantiatePreset } from "@/lib/presets";
import {
  coverageMatrix, distributeEqually, effectiveWeights, fmtMinutes, impactSummary,
  preflight, rebalanceWeights,
} from "@/lib/studio";
import BlockSettingsEditor from "./BlockSettingsEditor";
import CriterionDetailEditor from "./CriterionDetailEditor";
import type {
  AttributeKind, BlockKind, CategorySpec, EmploymentType, IndustryPack, PipelineBlock,
  InterviewQuestion, PositionProfile, Role, Seniority, VacancyV2, WorkMode,
} from "@/lib/types";

const STEPS = [
  ["Position Profile", "Role identity & logistics"],
  ["Criteria", "Weighted KSAO architecture"],
  ["Pipeline Composer", "Methods, mappings & gates"],
  ["Scoring & Ranking", "Visible composite math"],
  ["Candidate Experience", "Landing, notices & consent"],
  ["Team & Governance", "Human review controls"],
  ["Preflight / Publish", "Validate, preview, open"],
] as const;

const INPUT = "iris-focus w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-[13px] text-hi";
const LABEL = "mb-1.5 block font-mono text-[10px] uppercase tracking-[.08em] text-lo";
const CARD = "rounded-xl border border-hairline bg-surface";
const BTN = "iris-focus rounded-lg border border-hairline px-3 py-2 text-[12px] text-mid hover:border-hairline-strong hover:text-hi";
type AssessmentDesign = NonNullable<VacancyV2["assessmentDesign"]>;

const SHOWCASE_ROLE_TITLE = "Technical Support Specialist - B2B SaaS";
const SHOWCASE_DEMO_ANSWERS = [
  "I would capture one failed event ID and confirm the exact customer impact. I would verify the source record with a read-only SQL query, compare timestamps, then inspect the webhook response and retry logs. If delivery returns 401, I would test credentials in a sandbox, give the customer a safe workaround and next update time, then escalate with the event ID, logs, and steps already tried.",
  "When I joined support I could write simple filters but struggled with SQL joins. My lead showed me how to break a query into smaller checks. I practiced on test data, used the method in later tickets, and asked for another review. I can now isolate where records diverge before escalating, and I documented the steps for the team.",
  "I keep customer updates short and specific: what we know, what I am checking next, any safe workaround, and the time of the next update. For engineering I include reproduction steps, timestamps, request IDs, expected versus actual behavior, sanitized logs, and the business impact so they can start from evidence instead of repeating discovery.",
  "I separate containment from diagnosis. First I reduce the immediate customer impact without changing production data unsafely. Then I reproduce the issue, test one hypothesis at a time, and record what each check rules in or out. I escalate when permissions, security, or code ownership require it, but I stay responsible for communication until resolution.",
  "I prioritize by customer impact, number of affected accounts, security or data risk, and whether a workaround exists. I acknowledge every case quickly, group related incidents, and make the queue visible to the team. If priorities conflict, I explain the trade-off and ask the incident owner to confirm it rather than silently guessing.",
  "I have not handled that exact situation in production. I would state the gap, use the runbook and a sandbox to learn safely, ask a teammate to review the risky step, and keep a clear evidence trail. Afterward I would turn the confirmed approach into a checklist so the next response is faster and more consistent.",
];
const SHOWCASE_ROLE_BRIEF = `Almaty, Kazakhstan. Full-time hybrid role supporting business customers in English across chat and email.

The specialist owns first response and resolution for product, account, integration, authentication, API, webhook, and data issues. They reproduce problems, inspect logs, run basic SQL queries, test REST endpoints with Postman or curl, document findings clearly, keep customers updated, and escalate complex defects to engineering with complete evidence.

Required: 1-3 years in technical support or SaaS operations; practical understanding of HTTP status codes, JSON, REST APIs, SQL SELECT and JOIN queries, browser developer tools, and structured troubleshooting. Strong written communication, prioritization, customer empathy, and the ability to learn from feedback are essential.

Strong performance means resolving routine cases efficiently, reducing avoidable escalations, producing engineering-ready incident notes, and helping customers reach value sooner. Assess technical diagnosis, communication, escalation judgment, ownership, and learning agility.

Keep this first screen concise: use one structured recorded interview containing a job-relevant troubleshooting scenario and a growth-through-feedback question, followed only by named-human review. Do not add a separate work sample, reference check, document check, personality test, or any other candidate-controlled stage. Keep the human stage unscored and use English for all vacancy and candidate content.`;

const DEFAULT_ASSESSMENT_DESIGN: AssessmentDesign = {
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
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className={LABEL}>{label}</span>{children}</label>;
}

function Toggle({ checked, onChange, label, help, disabled = false }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; help?: string; disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? "cursor-not-allowed opacity-65" : "cursor-pointer"}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 h-5 w-9 rounded-full border p-0.5 transition-colors ${checked ? "border-irisb bg-irisb/20" : "border-hairline-strong bg-void2"}`}
      >
        <span className={`block size-3.5 rounded-full transition-transform ${checked ? "translate-x-4 bg-irisb" : "bg-lo"}`} />
      </button>
      <span>
        <span className="block text-[13px] text-hi">{label}</span>
        {help && <span className="mt-0.5 block text-[11px] leading-relaxed text-lo">{help}</span>}
      </span>
    </label>
  );
}

function LinesField({
  label,
  value,
  onChange,
  placeholder,
  minHeight = "min-h-24",
}: {
  label: string;
  value?: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  minHeight?: string;
}) {
  return (
    <Field label={label}>
      <textarea
        className={`${INPUT} ${minHeight} leading-relaxed`}
        value={(value ?? []).join("\n")}
        onChange={(event) => onChange(event.target.value.split("\n"))}
        onBlur={(event) => onChange(
          event.target.value
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        )}
        placeholder={placeholder}
      />
    </Field>
  );
}

function AdvancedSummary({ title, text }: { title: string; text: string }) {
  return (
    <summary className="iris-focus flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-1 py-1">
      <span>
        <span className="block text-[12px] font-medium text-hi">{title}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-lo">{text}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-lo transition-transform group-open:rotate-90" />
    </summary>
  );
}

function Why({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <span className="group relative inline-flex">
      <CircleHelp className="size-3.5 text-lo" />
      <span className="pointer-events-none absolute right-0 top-5 z-30 hidden w-64 rounded-lg border border-hairline bg-void2 p-3 text-[11px] leading-relaxed text-mid group-hover:block">
        {text}
      </span>
    </span>
  );
}

function Entry() {
  const { draft, hydrated, replace, setEntered, setStep } = useStudio();
  const [mode, setMode] = useState<"choose" | "describe" | "preset" | "clone">("choose");
  const [title, setTitle] = useState(SHOWCASE_ROLE_TITLE);
  const [description, setDescription] = useState(SHOWCASE_ROLE_BRIEF);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [clones, setClones] = useState<VacancyV2[]>([]);
  const [cloneLoadError, setCloneLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/hr/vacancies", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load vacancies.");
        return response.json() as Promise<{ vacancies?: VacancyV2[] }>;
      })
      .then((body) => {
        if (!cancelled) setClones(body.vacancies ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setClones([]);
          setCloneLoadError(
            "Saved vacancies could not be loaded from the server. Reload and try again.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enter = (draft: VacancyV2) => {
    replace(draft);
    setEntered(true);
    setStep(1);
  };

  const resumable = hydrated && (
    draft.profile.title.trim().length > 0 ||
    draft.categories.length > 0 ||
    draft.pipeline.length > 0
  );

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ai/vacancy-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not generate the vacancy.");
      enter(body.draft as VacancyV2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the vacancy.");
    } finally {
      setBusy(false);
    }
  };

  if (mode === "describe") {
    return (
      <div className="mx-auto max-w-3xl px-8 py-14">
        <button className={BTN} onClick={() => setMode("choose")}>← Entry modes</button>
        <div className={`${CARD} mt-5 p-7`}>
          <div className="hud-label">AI vacancy authoring</div>
          <h1 className="mt-3 font-display text-[26px]">Describe the role in your own words.</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-mid">
            WhiteBox turns the hiring brief into an editable role profile, criteria, interview plan, and evidence rubric.
          </p>
          <div className="mt-6 space-y-4">
            <Field label="Position title"><input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Technical Support Specialist" /></Field>
            <Field label="Role description">
              <textarea className={`${INPUT} min-h-56 leading-relaxed`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the work, outcomes, tools, stakeholders, requirements, and what distinguishes strong performance." />
            </Field>
          </div>
          {error && <p className="mt-3 text-[12px] text-neg">{error}</p>}
          <button
            onClick={generate}
            disabled={busy || title.trim().length < 2 || description.trim().length < 20}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-paper px-4 py-2.5 text-[13px] font-medium text-void disabled:opacity-40"
          >
            <WandSparkles className="size-4" />{busy ? "Authoring the vacancy..." : "Generate with AI"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "preset") {
    return (
      <div className="mx-auto max-w-5xl px-8 py-12">
        <button className={BTN} onClick={() => setMode("choose")}>← Entry modes</button>
        <h1 className="mt-5 font-display text-[27px]">Start from a reviewable role-family template.</h1>
        <div className="mt-6 grid grid-cols-3 gap-4">
          {BUILT_IN_PRESETS.map((preset) => (
            <button key={preset.id} onClick={() => enter(instantiatePreset(preset))} className={`${CARD} brackets p-5 text-left`}>
              <div className="flex items-center justify-between"><Library className="size-4 text-irisb" /><span className="font-mono text-[9px] text-lo">v{preset.version}</span></div>
              <div className="mt-4 text-[15px] font-medium text-hi">{preset.name}</div>
              <p className="mt-2 line-clamp-6 text-[11px] leading-relaxed text-mid">{preset.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-[11px] text-irisc">Use preset <ChevronRight className="size-3" /></span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (mode === "clone") {
    return (
      <div className="mx-auto max-w-4xl px-8 py-12">
        <button className={BTN} onClick={() => setMode("choose")}>← Entry modes</button>
        <h1 className="mt-5 font-display text-[27px]">Clone an existing vacancy.</h1>
        <div className="mt-6 space-y-3">
          {cloneLoadError && <div role="alert" className={`${CARD} border-neg/30 p-6 text-[13px] text-neg`}>{cloneLoadError}</div>}
          {!cloneLoadError && clones.length === 0 && <div className={`${CARD} p-6 text-[13px] text-mid`}>No published vacancies are available to clone.</div>}
          {clones.map((v) => (
            <button
              key={v.id}
              onClick={() => enter({ ...structuredClone(v), id: uid("vac"), code: "", status: "DRAFT", configVersion: 1, audit: [], createdAt: "", publishedAt: undefined })}
              className={`${CARD} flex w-full items-center justify-between p-5 text-left`}
            >
              <span><span className="block text-[14px] text-hi">{v.profile.title}</span><span className="mt-1 block font-mono text-[10px] text-lo">{v.code} · CONFIG V{v.configVersion}</span></span>
              <ChevronRight className="size-4 text-lo" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  const choices = [
    { title: "Describe", text: "Turn a hiring brief into a complete, editable vacancy with AI.", icon: Sparkles, action: () => setMode("describe") },
    { title: "Manual", text: "A clean scaffold with the compliance and governance defaults already in place.", icon: GripVertical, action: () => setEntered(true) },
    { title: "From preset", text: "Role-family blueprints with the method rationale embedded in every block.", icon: Library, action: () => setMode("preset") },
    { title: "Clone vacancy", text: "Deep-copy a local vacancy without candidates, dates or competition code.", icon: Copy, action: () => setMode("clone") },
  ];

  return (
    <div className="grid min-h-[calc(100vh-52px)] place-items-center px-8 py-12">
      <div className="w-full max-w-5xl">
        <div className="hud-label">Vacancy Studio</div>
        <h1 className="mt-3 max-w-3xl font-display text-[34px] leading-tight tracking-[-.025em]">
          Build a structured interview from one hiring brief.
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-mid">
          Define the role, verify job-relevant skills, and give reviewers a consistent evidence package for every candidate.
        </p>
        {resumable && (
          <div className={`${CARD} mt-7 flex items-center justify-between gap-5 p-5`}>
            <div>
              <div className="hud-label">Saved draft</div>
              <div className="mt-1.5 text-[14px] text-hi">{draft.profile.title || "Untitled vacancy"}</div>
              <p className="mt-1 text-[11px] text-mid">
                {draft.categories.length} criteria groups, {draft.pipeline.length} interview stages
              </p>
            </div>
            <button onClick={() => setEntered(true)} className="shrink-0 rounded-lg bg-paper px-4 py-2.5 text-[13px] font-medium text-void">
              Resume
            </button>
          </div>
        )}
        <div className="mt-8 grid grid-cols-4 gap-4">
          {choices.map(({ title: choiceTitle, text, icon: Icon, action }) => (
            <button key={choiceTitle} onClick={action} className={`${CARD} brackets min-h-48 p-5 text-left`}>
              <Icon className="size-5 text-irisb" />
              <div className="mt-8 text-[16px] font-medium text-hi">{choiceTitle}</div>
              <p className="mt-2 text-[12px] leading-relaxed text-mid">{text}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileStep() {
  const { draft, update } = useStudio();
  const p = draft.profile;
  const design = draft.assessmentDesign ?? DEFAULT_ASSESSMENT_DESIGN;
  const patch = (next: Partial<PositionProfile>) => update((d) => ({ ...d, profile: { ...d.profile, ...next } }));
  const patchDesign = (next: Partial<AssessmentDesign>) => update((d) => ({
    ...d,
    assessmentDesign: {
      ...(d.assessmentDesign ?? DEFAULT_ASSESSMENT_DESIGN),
      ...next,
    },
  }));
  const patchJobAnalysis = (next: Partial<AssessmentDesign["jobAnalysis"]>) => update((d) => {
    const current = d.assessmentDesign ?? DEFAULT_ASSESSMENT_DESIGN;
    return {
      ...d,
      assessmentDesign: {
        ...current,
        jobAnalysis: { ...current.jobAnalysis, ...next },
      },
    };
  });
  const patchValidation = (next: Partial<AssessmentDesign["validation"]>) => update((d) => {
    const current = d.assessmentDesign ?? DEFAULT_ASSESSMENT_DESIGN;
    return {
      ...d,
      assessmentDesign: {
        ...current,
        validation: { ...current.validation, ...next },
      },
    };
  });
  return (
    <section>
      <StepHeading eyebrow="01 · Position Profile" title="Define the concrete workplace." text="This context seeds criteria, question banks, candidate copy and evaluation prompts." />
      <div className="grid grid-cols-2 gap-4">
        <div className={`${CARD} col-span-2 grid grid-cols-2 gap-4 p-5`}>
          <Field label="Role title"><input className={INPUT} value={p.title} onChange={(e) => patch({ title: e.target.value })} /></Field>
          <Field label="Internal requisition ID"><input className={INPUT} value={p.requisitionId ?? ""} onChange={(e) => patch({ requisitionId: e.target.value })} placeholder="REQ-2026-041" /></Field>
          <Field label="Department / team"><input className={INPUT} value={p.department ?? ""} onChange={(e) => patch({ department: e.target.value })} /></Field>
          <Field label="Hiring manager"><input className={INPUT} value={p.hiringManager ?? ""} onChange={(e) => patch({ hiringManager: e.target.value })} /></Field>
        </div>
        <div className={`${CARD} grid grid-cols-2 gap-4 p-5`}>
          <Field label="Seniority">
            <select className={INPUT} value={p.seniority} onChange={(e) => patch({ seniority: e.target.value as Seniority })}>
              {["Intern", "Junior", "Middle", "Senior", "Lead", "Head", "Executive"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Openings"><input className={INPUT} type="number" min={1} value={p.openings} onChange={(e) => patch({ openings: Number(e.target.value) })} /></Field>
          <Field label="Employment">
            <select className={INPUT} value={p.employmentType} onChange={(e) => patch({ employmentType: e.target.value as EmploymentType })}>
              {["full_time", "part_time", "contract", "internship", "seasonal", "shift"].map((x) => <option key={x} value={x}>{x.replaceAll("_", " ")}</option>)}
            </select>
          </Field>
          <Field label="Work mode">
            <select className={INPUT} value={p.workMode} onChange={(e) => patch({ workMode: e.target.value as WorkMode })}>
              {["on_site", "hybrid", "remote_country", "remote_global"].map((x) => <option key={x} value={x}>{x.replaceAll("_", " ")}</option>)}
            </select>
          </Field>
          <Field label="Location(s)"><input className={INPUT} value={p.locations.join(", ")} onChange={(e) => patch({ locations: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field>
          <Field label="Time-zone overlap"><input className={INPUT} value={p.timezoneOverlap ?? ""} onChange={(e) => patch({ timezoneOverlap: e.target.value })} placeholder="UTC+3 to UTC+7" /></Field>
        </div>
        <div className={`${CARD} grid grid-cols-2 gap-4 p-5`}>
          <Field label="Industry pack">
            <select className={INPUT} value={p.industryPack} onChange={(e) => patch({ industryPack: e.target.value as IndustryPack })}>
              {["tech", "sales_cs", "healthcare", "finance", "retail_hourly", "manufacturing", "logistics", "creative", "public_sector", "education", "custom"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Primary language"><input className={INPUT} value={p.languages.primary} onChange={(e) => patch({ languages: { ...p.languages, primary: e.target.value } })} /></Field>
          <Field label="Application opens"><input className={INPUT} type="datetime-local" value={draft.window.opensAt.slice(0, 16)} onChange={(e) => update((d) => ({ ...d, window: { ...d.window, opensAt: e.target.value } }))} /></Field>
          <Field label="Application closes"><input className={INPUT} type="datetime-local" value={draft.window.closesAt.slice(0, 16)} onChange={(e) => update((d) => ({ ...d, window: { ...d.window, closesAt: e.target.value } }))} /></Field>
        </div>
        <div className={`${CARD} col-span-2 p-5`}>
          <Field label="Mission of the role"><textarea className={`${INPUT} min-h-24`} value={p.mission} onChange={(e) => patch({ mission: e.target.value })} /></Field>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Responsibilities · one per line"><textarea className={`${INPUT} min-h-28`} value={p.responsibilities.join("\n")} onChange={(e) => patch({ responsibilities: e.target.value.split("\n").filter(Boolean) })} /></Field>
            <Field label="Team context"><textarea className={`${INPUT} min-h-28`} value={p.teamContext ?? ""} onChange={(e) => patch({ teamContext: e.target.value })} /></Field>
          </div>
        </div>
      </div>
      <details
        className={`${CARD} group mt-4 p-5`}
        onToggle={(event) => {
          if (event.currentTarget.open && !draft.assessmentDesign) patchDesign({});
        }}
      >
        <AdvancedSummary
          title="Advanced role and review details"
          text="Success outcomes, operating context, source notes, and the ongoing quality-review plan."
        />
        <div className="mt-5 space-y-6 border-t border-hairline pt-5">
          <div>
            <div className="hud-label">Role context · what strong performance must produce</div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <LinesField
                label="Success outcomes · one per line"
                value={p.successOutcomes}
                onChange={(successOutcomes) => patch({ successOutcomes })}
                placeholder="A measurable result expected after 3–12 months"
              />
              <LinesField
                label="Operating constraints · one per line"
                value={p.operatingConstraints}
                onChange={(operatingConstraints) => patch({ operatingConstraints })}
                placeholder="Regulation, budget, shift, legacy-system or safety constraints"
              />
              <LinesField
                label="Stakeholder groups · one per line"
                value={p.stakeholderGroups}
                onChange={(stakeholderGroups) => patch({ stakeholderGroups })}
                placeholder="Customers, regulators, engineering, operations…"
              />
              <LinesField
                label="Special requirements · one per line"
                value={p.specialRequirements}
                onChange={(specialRequirements) => patch({ specialRequirements })}
                placeholder="Only requirements demonstrably connected to the work"
              />
              <LinesField
                label="Internal comments · never candidate-facing"
                value={p.internalComments}
                onChange={(internalComments) => patch({ internalComments })}
                placeholder="Context for the hiring team; do not include protected information"
              />
              <Field label="Internal tags · comma-separated">
                <input
                  className={INPUT}
                  value={(p.tags ?? []).join(", ")}
                  onChange={(event) => patch({ tags: event.target.value.split(",").map((item) => item.trimStart()) })}
                  onBlur={(event) => patch({
                    tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                  })}
                  placeholder="critical-hire, regulated, leadership"
                />
              </Field>
            </div>
          </div>
          <div className="border-t border-hairline pt-5">
            <div className="hud-label">Job analysis · source of the assessment blueprint</div>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <Field label="Assessment purpose">
                <select
                  className={INPUT}
                  value={design.purpose}
                  onChange={(event) => patchDesign({ purpose: event.target.value as AssessmentDesign["purpose"] })}
                >
                  <option value="selection">Selection</option>
                  <option value="screening">Screening</option>
                  <option value="internal_mobility">Internal mobility</option>
                  <option value="development">Development</option>
                </select>
              </Field>
              <Field label="Job-analysis method">
                <select
                  className={INPUT}
                  value={design.jobAnalysis.method}
                  onChange={(event) => patchJobAnalysis({ method: event.target.value as AssessmentDesign["jobAnalysis"]["method"] })}
                >
                  <option value="mixed">Mixed evidence</option>
                  <option value="structured_workshop">Structured SME workshop</option>
                  <option value="critical_incidents">Critical incidents</option>
                  <option value="task_inventory">Task inventory</option>
                  <option value="competency_model">Competency model</option>
                </select>
              </Field>
              <Field label="Approved by">
                <input
                  className={INPUT}
                  value={design.jobAnalysis.approvedBy ?? ""}
                  onChange={(event) => patchJobAnalysis({ approvedBy: event.target.value || undefined })}
                  placeholder="Name and role"
                />
              </Field>
              <div className="col-span-2">
                <LinesField
                  label="Evidence sources · one per line"
                  value={design.jobAnalysis.sources}
                  onChange={(sources) => patchJobAnalysis({ sources })}
                  placeholder="SME workshop 2026-07-10; task inventory v3; incident review…"
                />
              </div>
              <Field label="Approval date">
                <input
                  className={INPUT}
                  type="datetime-local"
                  value={design.jobAnalysis.approvedAt?.slice(0, 16) ?? ""}
                  onChange={(event) => patchJobAnalysis({ approvedAt: event.target.value || undefined })}
                />
              </Field>
              <div className="col-span-3">
                <LinesField
                  label="Critical work outputs · one per line"
                  value={design.jobAnalysis.criticalWorkOutputs}
                  onChange={(criticalWorkOutputs) => patchJobAnalysis({ criticalWorkOutputs })}
                  placeholder="Concrete work products or decisions that the role must deliver"
                />
              </div>
            </div>
          </div>
          <div className="border-t border-hairline pt-5">
            <div className="hud-label">Ongoing quality review</div>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <Field label="Monitoring phase">
                <select
                  className={INPUT}
                  value={design.validation.monitoringMode}
                  onChange={(event) => patchValidation({ monitoringMode: event.target.value as AssessmentDesign["validation"]["monitoringMode"] })}
                >
                  <option value="prelaunch_review">Prelaunch review</option>
                  <option value="pilot">Pilot</option>
                  <option value="operational">Operational</option>
                </select>
              </Field>
              <Field label="Review cadence · days">
                <input
                  className={INPUT}
                  type="number"
                  min={1}
                  value={design.validation.reviewCadenceDays}
                  onChange={(event) => patchValidation({ reviewCadenceDays: Number(event.target.value) })}
                />
              </Field>
              <Field label="Minimum sample before trend review">
                <input
                  className={INPUT}
                  type="number"
                  min={1}
                  value={design.validation.minimumSampleForAnalysis}
                  onChange={(event) => patchValidation({ minimumSampleForAnalysis: Number(event.target.value) })}
                />
              </Field>
              <div className="col-span-2">
                <LinesField
                  label="Outcome criteria · one per line"
                  value={design.validation.outcomeCriteria}
                  onChange={(outcomeCriteria) => patchValidation({ outcomeCriteria })}
                  placeholder="90-day quality metric; manager BARS; retention milestone…"
                />
              </div>
              <div className="pt-5">
                <Toggle
                  checked={design.validation.adverseImpactMonitoring}
                  onChange={(adverseImpactMonitoring) => patchValidation({ adverseImpactMonitoring })}
                  label="Monitor selection-rate differences"
                  help="Review outcomes by legally permissible groups and investigate material differences."
                />
              </div>
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}

function CriteriaStep() {
  const { draft, update } = useStudio();
  const [busy, setBusy] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const coverage = coverageMatrix(draft);
  const suggest = async () => {
    setBusy(true);
    setSuggestError("");
    try {
      const res = await fetch("/api/ai/suggest-criteria", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: draft.profile }) });
      const body = (await res.json()) as { categories?: CategorySpec[]; error?: string };
      if (!res.ok || !body.categories) {
        throw new Error(body.error || "The criteria service returned an incomplete result.");
      }
      update((d) => ({ ...d, categories: body.categories ?? d.categories }));
    } catch (error) {
      setSuggestError(
        error instanceof Error
          ? error.message
          : "Criteria could not be generated.",
      );
    } finally {
      setBusy(false);
    }
  };
  const setCategoryWeight = (id: string, weight: number) => update((d) => ({ ...d, categories: rebalanceWeights(d.categories, id, weight, locked) }));
  const setAttrWeight = (catId: string, attrId: string, weight: number) => update((d) => ({
    ...d,
    categories: d.categories.map((c) => c.id === catId ? { ...c, attributes: rebalanceWeights(c.attributes, attrId, weight, locked) } : c),
  }));
  const focusCount = draft.categories.flatMap((c) => c.attributes).filter((a) => a.focus).length;
  return (
    <section>
      <StepHeading eyebrow="02 · Criteria Architecture" title="Define what “good” means." text="Weights sum to 100 at both levels. Knockouts stay separate from scored criteria." action={
        <button className={`${BTN} inline-flex items-center gap-2`} onClick={suggest} disabled={busy || !draft.profile.title}><Sparkles className="size-3.5" />{busy ? "Drafting…" : "Suggest attributes"}</button>
      } />
      {suggestError && <p role="alert" className="mb-4 rounded-lg border border-neg/30 bg-neg/10 p-3 text-[11px] text-neg">{suggestError}</p>}
      {draft.categories.length === 0 && <div className={`${CARD} p-10 text-center text-[13px] text-mid`}>Start with “Suggest attributes” or add a category manually.</div>}
      <div className="space-y-4">
        {draft.categories.map((cat) => (
          <div key={cat.id} className={`${CARD} overflow-hidden`}>
            <div className="flex items-center gap-3 border-b border-hairline bg-surface2 px-4 py-3">
              <input className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-hi outline-none" value={cat.name} onChange={(e) => update((d) => ({ ...d, categories: d.categories.map((c) => c.id === cat.id ? { ...c, name: e.target.value } : c) }))} />
              <Why text={cat.rationale} />
              <input type="range" min={0} max={100} className="w-28 accent-[var(--iris-b)]" value={cat.weight} onChange={(e) => setCategoryWeight(cat.id, Number(e.target.value))} />
              <input className="w-14 rounded border border-hairline bg-void2 px-2 py-1 text-right font-mono text-[11px]" type="number" value={cat.weight} onChange={(e) => setCategoryWeight(cat.id, Number(e.target.value))} />
              <button onClick={() => setLocked((s) => { const n = new Set(s); if (n.has(cat.id)) n.delete(cat.id); else n.add(cat.id); return n; })}><Lock className={`size-3.5 ${locked.has(cat.id) ? "text-irisb" : "text-lo"}`} /></button>
              <button onClick={() => update((d) => ({ ...d, categories: distributeEqually(d.categories) }))} className="font-mono text-[9px] text-lo">EQUAL</button>
            </div>
            <div className="divide-y divide-hairline">
              {cat.attributes.map((attr) => {
                const cell = coverage.find((x) => x.attributeId === attr.id);
                return (
                  <div key={attr.id}>
                    <div className="grid grid-cols-[1fr_108px_120px_56px_72px_28px] items-center gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <input className="min-w-0 flex-1 bg-transparent text-[13px] text-hi outline-none" value={attr.name} onChange={(e) => update((d) => ({ ...d, categories: d.categories.map((c) => c.id === cat.id ? { ...c, attributes: c.attributes.map((a) => a.id === attr.id ? { ...a, name: e.target.value } : a) } : c) }))} />
                          <Why text={attr.rationale} />
                        </div>
                        <input className="mt-1 w-full bg-transparent text-[11px] text-lo outline-none" value={attr.definition} onChange={(e) => update((d) => ({ ...d, categories: d.categories.map((c) => c.id === cat.id ? { ...c, attributes: c.attributes.map((a) => a.id === attr.id ? { ...a, definition: e.target.value } : a) } : c) }))} />
                      </div>
                      <select className={`${INPUT} py-1.5`} value={attr.kind} onChange={(e) => update((d) => ({ ...d, categories: d.categories.map((c) => c.id === cat.id ? { ...c, attributes: c.attributes.map((a) => a.id === attr.id ? { ...a, kind: e.target.value as AttributeKind } : a) } : c) }))}>
                        {["skill", "trait", "knowledge", "qualification", "experience", "language"].map((x) => <option key={x}>{x}</option>)}
                      </select>
                      <input type="range" className="accent-[var(--iris-b)]" min={0} max={100} value={attr.weight} onChange={(e) => setAttrWeight(cat.id, attr.id, Number(e.target.value))} />
                      <input className="rounded border border-hairline bg-void2 px-2 py-1 text-right font-mono text-[11px]" type="number" value={attr.weight} onChange={(e) => setAttrWeight(cat.id, attr.id, Number(e.target.value))} />
                      <button
                        disabled={!attr.focus && focusCount >= 5}
                        onClick={() => update((d) => ({ ...d, categories: d.categories.map((c) => c.id === cat.id ? { ...c, attributes: c.attributes.map((a) => a.id === attr.id ? { ...a, focus: !a.focus || undefined } : a) } : c) }))}
                        className={`rounded-full border px-2 py-1 font-mono text-[9px] ${attr.focus ? "border-irisb/50 text-irisc" : "border-hairline text-lo"}`}
                      >FOCUS</button>
                      <span
                        title={
                          cell?.ok
                            ? `Coverage complete · ${cell.blockIds.length}/${cell.requiredSources} sources`
                            : `Needs ${cell?.requiredSources ?? 1} independent scored source(s)`
                        }
                        className={`size-2 rounded-full ${cell?.ok ? "bg-pos" : "bg-warn"}`}
                      />
                    </div>
                    <CriterionDetailEditor
                      attribute={attr}
                      onChange={(nextAttribute) => update((d) => ({
                        ...d,
                        categories: d.categories.map((category) =>
                          category.id === cat.id
                            ? {
                                ...category,
                                attributes: category.attributes.map((item) =>
                                  item.id === attr.id ? nextAttribute : item,
                                ),
                              }
                            : category,
                        ),
                      }))}
                      onDelete={() => update((d) => ({
                        ...d,
                        categories: d.categories.map((category) =>
                          category.id === cat.id
                            ? {
                                ...category,
                                attributes: distributeEqually(
                                  category.attributes.filter(
                                    (item) => item.id !== attr.id,
                                  ),
                                ),
                              }
                            : category,
                        ),
                      }))}
                    />
                  </div>
                );
              })}
            </div>
            <button onClick={() => update((d) => ({ ...d, categories: d.categories.map((c) => c.id === cat.id ? { ...c, attributes: distributeEqually([...c.attributes, { id: uid("attr"), name: "New attribute", kind: "skill", definition: "Describe observable behavior.", weight: 0, scale: { anchors: ["No evidence", "Limited evidence", "Adequate evidence", "Strong evidence", "Exceptional evidence"] }, verification: "interview" }]) } : c) }))} className="m-3 inline-flex items-center gap-1 text-[11px] text-lo hover:text-hi"><Plus className="size-3" /> Add attribute</button>
          </div>
        ))}
      </div>
      <button onClick={() => update((d) => ({ ...d, categories: distributeEqually([...d.categories, { id: uid("cat"), name: "New category", weight: 0, attributes: [] }]) }))} className={`${BTN} mt-4 inline-flex items-center gap-2`}><Plus className="size-3.5" /> Add category</button>
    </section>
  );
}

function PipelineStep() {
  const { draft, update } = useStudio();
  const [library, setLibrary] = useState(false);
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null);
  const [generatingKind, setGeneratingKind] = useState<BlockKind | null>(null);
  const [generationError, setGenerationError] = useState("");
  const attrs = draft.categories.flatMap((c) => c.attributes);
  const add = async (kind: BlockKind) => {
    const block = createBlock(kind, draft.pipeline.length);
    const isInterview = [
      "async_interview",
      "live_ai_interview",
      "chat_interview",
    ].includes(kind);
    const measuredAttributes = isInterview ? attrs.slice(0, 12) : attrs;
    if (block.scored && measuredAttributes.length) {
      block.measures = distributeEqually(measuredAttributes.map((a) => ({ id: a.id, attributeId: a.id, weight: 0 }))).map((x) => ({ attributeId: x.attributeId, share: x.weight }));
    }
    if (isInterview && "questions" in block.settings) {
      setGeneratingKind(kind);
      setGenerationError("");
      try {
        const questions = await Promise.all(
          measuredAttributes.map(async (attribute) => {
            const response = await fetch("/api/ai/draft-question", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                attribute,
                type:
                  draft.profile.seniority === "Junior"
                    ? "situational"
                    : attribute.kind === "knowledge"
                      ? "job_knowledge"
                      : "behavioral",
                seniority: draft.profile.seniority,
              }),
            });
            const body = (await response.json()) as {
              error?: string;
              question?: InterviewQuestion;
            };
            if (!response.ok || !body.question) {
              throw new Error(
                body.error || "AI question authoring did not return a complete question.",
              );
            }
            return body.question;
          }),
        );
        block.settings.questions = questions;
        block.estimatedMinutes = estimateMinutes(block);
      } catch (error) {
        setGenerationError(
          error instanceof Error
            ? error.message
            : "AI question authoring could not complete this interview block.",
        );
        return;
      } finally {
        setGeneratingKind(null);
      }
    }
    update((d) => ({ ...d, pipeline: [...d.pipeline, block] }));
    setExpandedBlock(block.id);
    setLibrary(false);
  };
  const mutateBlock = (id: string, patch: Partial<PipelineBlock>) => update((d) => ({ ...d, pipeline: d.pipeline.map((b) => b.id === id ? { ...b, ...patch } : b) }));
  const move = (index: number, delta: number) => update((d) => {
    const next = [...d.pipeline];
    const target = index + delta;
    if (target < 0 || target >= next.length) return d;
    [next[index], next[target]] = [next[target], next[index]];
    return { ...d, pipeline: next.map((b, i) => ({ ...b, order: i })) };
  });
  return (
    <section>
      <StepHeading eyebrow="03 · Interview plan" title="Choose the evidence candidates provide." text="Each stage shows what candidates complete, which criteria it covers, and how reviewers use the result." action={<button onClick={() => setLibrary(true)} className="inline-flex items-center gap-2 rounded-lg bg-paper px-3 py-2 text-[12px] text-void"><Plus className="size-3.5" /> Add stage</button>} />
      <div className="space-y-3">
        {draft.pipeline.length === 0 && <button onClick={() => setLibrary(true)} className={`${CARD} w-full border-dashed p-12 text-center text-[13px] text-mid`}>Open the 19-method Block Library</button>}
        {draft.pipeline.map((block, index) => {
          const meta = BLOCK_LIBRARY[block.kind];
          const expanded = expandedBlock === block.id;
          const internalHumanReview =
            block.settings.kind === "human_stage" &&
            !block.scored &&
            !block.settings.selfBooking;
          const validation: NonNullable<PipelineBlock["validation"]> = block.validation ?? {
            strategy: "content",
            status: "draft",
            scoreUse: block.scored ? "decision_support" : "context_only",
            evidenceRefs: [],
          };
          const patchGate = (patch: Partial<NonNullable<PipelineBlock["gate"]>>) => {
            const next = { ...block.gate, ...patch };
            const hasMinimum = typeof next.minBlockScore === "number";
            const hasMustHaves = (next.mustHaveIds?.length ?? 0) > 0;
            mutateBlock(block.id, { gate: hasMinimum || hasMustHaves ? next : undefined });
          };
          return (
            <div key={block.id}>
              <div className={`${CARD} overflow-hidden`}>
                <div className={`grid grid-cols-[32px_1fr_auto] items-center gap-3 p-4 ${expanded ? "border-b border-hairline" : ""}`}>
                  <GripVertical className="size-4 text-lo" />
                  <div>
                    {expanded ? (
                      <input aria-label={`Block title ${index + 1}`} className="w-full bg-transparent text-[14px] font-medium text-hi outline-none" value={block.title} onChange={(e) => mutateBlock(block.id, { title: e.target.value })} />
                    ) : (
                      <div className="text-[14px] font-medium text-hi">{block.title}</div>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-lo">
                      <span>{internalHumanReview ? "Internal reviewer step" : fmtMinutes(estimateMinutes(block))}</span><span>·</span>
                      <span>{internalHumanReview ? "Reviewer-only" : block.required ? "Required" : "Optional"}</span><span>·</span>
                      <span>{block.scored ? "Scored" : "Not scored"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button aria-label={expanded ? `Done editing ${block.title}` : `Edit ${block.title}`} className={`${BTN} min-w-14 text-[10px]`} onClick={() => setExpandedBlock(expanded ? null : block.id)}>{expanded ? "Done" : "Edit"}</button>
                    <button className={BTN} onClick={() => move(index, -1)} aria-label={`Move ${block.title} up`}><ArrowUp className="size-3.5" /></button>
                    <button className={BTN} onClick={() => move(index, 1)} aria-label={`Move ${block.title} down`}><ArrowDown className="size-3.5" /></button>
                    <button className={BTN} onClick={() => { setExpandedBlock((current) => current === block.id ? null : current); update((d) => ({ ...d, pipeline: d.pipeline.filter((b) => b.id !== block.id).map((b, i) => ({ ...b, order: i })) })); }} aria-label={`Delete ${block.title}`}><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
                {expanded && <div className="p-4">
                  <div className="grid grid-cols-[1.25fr_.75fr] gap-5">
                    <div>
                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-[9px] text-lo">
                          STRUCTURED EVIDENCE
                        </span>
                      </div>
                      <Field label="Candidate instructions">
                        <textarea className={`${INPUT} min-h-24 leading-relaxed`} value={block.candidateIntro} onChange={(e) => mutateBlock(block.id, { candidateIntro: e.target.value })} />
                      </Field>
                      {block.scored && (
                        <div className="mt-4">
                          <span className={LABEL}>Attribute mapping · click to include</span>
                          <div className="flex flex-wrap gap-1.5">
                            {attrs.map((attr) => {
                              const active = block.measures.some((m) => m.attributeId === attr.id);
                              return (
                                <button
                                  key={attr.id}
                                  onClick={() => {
                                    const ids = active ? block.measures.filter((m) => m.attributeId !== attr.id).map((m) => m.attributeId) : [...block.measures.map((m) => m.attributeId), attr.id];
                                    const measures = distributeEqually(ids.map((id) => ({ id, weight: 0 }))).map((x) => ({ attributeId: x.id, share: x.weight }));
                                    mutateBlock(block.id, { measures });
                                  }}
                                  className={`rounded-full border px-2.5 py-1 text-[10px] ${active ? "border-irisb/50 bg-irisb/10 text-irisc" : "border-hairline text-lo"}`}
                                >{attr.focus ? "◉ " : ""}{attr.name}</button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 content-start gap-3">
                      <Toggle checked={block.required} onChange={(required) => mutateBlock(block.id, { required })} label="Required" />
                      <Toggle checked={block.scored} onChange={(scored) => mutateBlock(block.id, { scored })} label="Scored" />
                      <Field label="Session integrity">
                        <select className={`${INPUT} py-2`} value={block.integrityTier} onChange={(e) => mutateBlock(block.id, { integrityTier: Number(e.target.value) as 0 | 1 })}>
                          <option value={0}>Off</option>
                          <option value={1}>Disclosed interaction log</option>
                        </select>
                      </Field>
                      <Field label="Retakes"><select className={`${INPUT} py-2`} value={block.retakePolicy} onChange={(e) => mutateBlock(block.id, { retakePolicy: Number(e.target.value) as 0 | 1 | 2 })}><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option></select></Field>
                      <div><span className={LABEL}>Candidate time</span><div className="rounded-lg border border-hairline bg-void2 px-3 py-2 text-[12px] text-mid">{internalHumanReview ? "No candidate action" : fmtMinutes(estimateMinutes(block))}</div></div>
                    </div>
                  </div>
                  <div className="mt-5 rounded-xl border border-hairline bg-surface2/45 p-4">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="hud-label">Stage settings · {meta.label}</div>
                        <p className="mt-1 max-w-3xl text-[10px] leading-relaxed text-lo">{meta.description}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-hairline px-2 py-1 font-mono text-[9px] text-lo">{block.settings.kind}</span>
                    </div>
                    <BlockSettingsEditor
                      block={block}
                      attributes={attrs}
                      onChange={(settings) => mutateBlock(block.id, { settings })}
                    />
                  </div>
                  <details
                    className="group mt-4 rounded-xl border border-hairline bg-surface2/45 p-4"
                    onToggle={(event) => {
                      if (!event.currentTarget.open) return;
                      if (!block.validation || !block.evidenceRole) {
                        mutateBlock(block.id, {
                          validation,
                          evidenceRole: block.evidenceRole ?? (block.scored ? "primary" : "context"),
                        });
                      }
                    }}
                  >
                    <AdvancedSummary
                      title="Advanced delivery and review controls"
                      text="Candidate accommodations, deadlines, hurdle logic, assessor guidance, and permitted score use."
                    />
                    <div className="mt-4 space-y-5 border-t border-hairline pt-4">
                      <div className="grid grid-cols-3 gap-4">
                        <Field label="Evidence role">
                          <select
                            className={INPUT}
                            value={block.evidenceRole ?? (block.scored ? "primary" : "context")}
                            onChange={(event) => mutateBlock(block.id, { evidenceRole: event.target.value as NonNullable<PipelineBlock["evidenceRole"]> })}
                          >
                            <option value="primary">Primary evidence</option>
                            <option value="corroborating">Corroborating</option>
                            <option value="verification">Verification</option>
                            <option value="context">Context only</option>
                          </select>
                        </Field>
                        <Field label="Language override">
                          <input
                            className={INPUT}
                            value={block.languageOverride ?? ""}
                            onChange={(event) => mutateBlock(block.id, { languageOverride: event.target.value || undefined })}
                            placeholder={draft.profile.languages.primary || "Use vacancy language"}
                          />
                        </Field>
                        <Field label="Deadline after invitation · hours">
                          <input
                            className={INPUT}
                            type="number"
                            min={1}
                            value={block.deadlineOffsetHours ?? ""}
                            onChange={(event) => mutateBlock(block.id, {
                              deadlineOffsetHours: event.target.value ? Number(event.target.value) : undefined,
                            })}
                            placeholder="No block-specific deadline"
                          />
                        </Field>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Assessor instructions · internal">
                          <textarea
                            className={`${INPUT} min-h-28 leading-relaxed`}
                            value={block.assessorInstructions ?? ""}
                            onChange={(event) => mutateBlock(block.id, { assessorInstructions: event.target.value || undefined })}
                            placeholder="What evidence to seek, how to apply the rubric and when to abstain."
                          />
                        </Field>
                        <LinesField
                          label="Internal notes · one per line"
                          value={block.internalNotes}
                          onChange={(internalNotes) => mutateBlock(block.id, { internalNotes })}
                          placeholder="Operational notes that are never candidate-facing"
                          minHeight="min-h-28"
                        />
                      </div>
                      <Field label="Block tags · comma-separated">
                        <input
                          className={INPUT}
                          value={(block.tags ?? []).join(", ")}
                          onChange={(event) => mutateBlock(block.id, { tags: event.target.value.split(",").map((item) => item.trimStart()) })}
                          onBlur={(event) => mutateBlock(block.id, {
                            tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                          })}
                          placeholder="high-signal, regulated, specialist-review"
                        />
                      </Field>
                      <div className="border-t border-hairline pt-4">
                        <div className="hud-label">Accessibility & delivery</div>
                        <div className="mt-4 grid grid-cols-4 gap-4">
                          <Field label="Extra time">
                            <select
                              className={INPUT}
                              value={String(block.accessibility.extraTimeMultiplier)}
                              onChange={(event) => mutateBlock(block.id, {
                                accessibility: {
                                  ...block.accessibility,
                                  extraTimeMultiplier: event.target.value === "untimed"
                                    ? "untimed"
                                    : Number(event.target.value) as 1 | 1.25 | 1.5 | 2,
                                },
                              })}
                            >
                              <option value="1">Standard</option>
                              <option value="1.25">1.25×</option>
                              <option value="1.5">1.5×</option>
                              <option value="2">2×</option>
                              <option value="untimed">Untimed</option>
                            </select>
                          </Field>
                          <Toggle
                            checked={block.accessibility.captions}
                            onChange={(captions) => mutateBlock(block.id, { accessibility: { ...block.accessibility, captions } })}
                            label="Captions"
                          />
                          <Toggle
                            checked={block.accessibility.screenReaderMode}
                            onChange={(screenReaderMode) => mutateBlock(block.id, { accessibility: { ...block.accessibility, screenReaderMode } })}
                            label="Screen-reader mode"
                          />
                          <Toggle
                            checked={block.accessibility.alternativeFormats}
                            onChange={(alternativeFormats) => mutateBlock(block.id, { accessibility: { ...block.accessibility, alternativeFormats } })}
                            label="Alternative formats"
                          />
                        </div>
                      </div>
                      <div className="border-t border-hairline pt-4">
                        <div className="hud-label">Hurdle · use only when job analysis supports it</div>
                        <div className="mt-4 grid grid-cols-2 gap-4">
                          <Field label="Minimum block score">
                            <input
                              className={INPUT}
                              type="number"
                              min={0}
                              max={100}
                              value={block.gate?.minBlockScore ?? ""}
                              onChange={(event) => patchGate({
                                minBlockScore: event.target.value ? Number(event.target.value) : undefined,
                              })}
                              placeholder="No score hurdle"
                            />
                          </Field>
                          <Field label="Must-have attributes · multi-select">
                            <select
                              multiple
                              className={`${INPUT} min-h-24`}
                              value={block.gate?.mustHaveIds ?? []}
                              onChange={(event) => patchGate({
                                mustHaveIds: Array.from(event.currentTarget.selectedOptions, (option) => option.value),
                              })}
                            >
                              {attrs.map((attribute) => (
                                <option key={attribute.id} value={attribute.id}>{attribute.name}</option>
                              ))}
                            </select>
                          </Field>
                        </div>
                      </div>
                      <div className="border-t border-hairline pt-4">
                        <div className="hud-label">Method review and permitted use</div>
                        <div className="mt-4 grid grid-cols-3 gap-4">
                          <Field label="Evidence review approach">
                            <select
                              className={INPUT}
                              value={validation.strategy}
                              onChange={(event) => mutateBlock(block.id, {
                                validation: { ...validation, strategy: event.target.value as NonNullable<PipelineBlock["validation"]>["strategy"] },
                              })}
                            >
                              <option value="content">Job-content review</option>
                              <option value="criterion">Outcome comparison</option>
                              <option value="construct">Criterion definition review</option>
                              <option value="transport">Prior evidence review</option>
                            </select>
                          </Field>
                          <Field label="Evidence status">
                            <select
                              className={INPUT}
                              value={validation.status}
                              onChange={(event) => mutateBlock(block.id, {
                                validation: { ...validation, status: event.target.value as NonNullable<PipelineBlock["validation"]>["status"] },
                              })}
                            >
                              <option value="draft">Draft</option>
                              <option value="sme_reviewed">SME reviewed</option>
                              <option value="pilot">Pilot</option>
                              <option value="locally_validated">Reviewed with local outcomes</option>
                            </select>
                          </Field>
                          <Field label="Permitted score use">
                            <select
                              className={INPUT}
                              value={validation.scoreUse}
                              onChange={(event) => mutateBlock(block.id, {
                                validation: { ...validation, scoreUse: event.target.value as NonNullable<PipelineBlock["validation"]>["scoreUse"] },
                              })}
                            >
                              <option value="context_only">Context only</option>
                              <option value="decision_support">Decision support</option>
                              <option value="selection">Selection</option>
                            </select>
                          </Field>
                          <div className="col-span-2">
                            <LinesField
                              label="Review evidence references · one per line"
                              value={validation.evidenceRefs}
                              onChange={(evidenceRefs) => mutateBlock(block.id, { validation: { ...validation, evidenceRefs } })}
                              placeholder="Study, SME sign-off, vendor manual or local analysis reference"
                            />
                          </div>
                          <Field label="Reviewed by">
                            <input
                              className={INPUT}
                              value={validation.reviewedBy ?? ""}
                              onChange={(event) => mutateBlock(block.id, {
                                validation: { ...validation, reviewedBy: event.target.value || undefined },
                              })}
                              placeholder="Name and role"
                            />
                          </Field>
                          <Field label="Reviewed at">
                            <input
                              className={INPUT}
                              type="datetime-local"
                              value={validation.reviewedAt?.slice(0, 16) ?? ""}
                              onChange={(event) => mutateBlock(block.id, {
                                validation: { ...validation, reviewedAt: event.target.value || undefined },
                              })}
                            />
                          </Field>
                          <div className="col-span-2">
                            <Field label="Applicability note">
                              <textarea
                                className={`${INPUT} min-h-20 leading-relaxed`}
                                value={validation.applicabilityNote ?? ""}
                                onChange={(event) => mutateBlock(block.id, {
                                  validation: { ...validation, applicabilityNote: event.target.value || undefined },
                                })}
                                placeholder="Why the evidence applies to this role, population and decision."
                              />
                            </Field>
                          </div>
                        </div>
                      </div>
                    </div>
                  </details>
                </div>}
              </div>
              {index < draft.pipeline.length - 1 && <div className="ml-8 h-3 border-l border-dashed border-hairline-strong" />}
            </div>
          );
        })}
      </div>
      {library && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/65" onMouseDown={(e) => { if (e.target === e.currentTarget) setLibrary(false); }}>
          <div className="h-full w-[560px] overflow-y-auto border-l border-hairline bg-void p-6">
            {generationError && <p role="alert" className="mb-4 rounded-lg border border-neg/30 bg-neg/10 p-3 text-[11px] leading-relaxed text-neg">{generationError}</p>}
            <div className="flex items-start justify-between"><div><div className="hud-label">Assessment library</div><h2 className="mt-2 font-display text-[24px]">What should candidates complete?</h2></div><button aria-label="Close block library" onClick={() => setLibrary(false)} className={BTN}><X className="size-4" /></button></div>
            {BLOCK_GROUPS.map((group) => (
              <div key={group.id} className="mt-7">
                <div className="hud-label">{group.label}</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {group.kinds.map((kind) => {
                    const meta = BLOCK_LIBRARY[kind];
                    return (
                      <button key={kind} disabled={generatingKind !== null} onClick={() => void add(kind)} className={`${CARD} brackets p-4 text-left disabled:cursor-wait disabled:opacity-50`}>
                        <div className="flex items-center justify-between"><span className="text-[12px] font-medium text-hi">{meta.label}</span><Plus className="size-3.5 text-irisb" /></div>
                        <p className="mt-2 text-[10px] leading-relaxed text-mid">{meta.description}</p>
                        <div className="mt-3 flex gap-2 font-mono text-[9px] text-lo">
                          <span>{meta.defaultMinutes} min</span>
                          <span>job-related evidence</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ScoringStep() {
  const { draft, update } = useStudio();
  const ew = effectiveWeights(draft);
  const aggregation = draft.scoring.aggregation ?? {
    acrossSources: "evidence_weighted_mean" as const,
    contradictoryEvidence: "flag_human" as const,
    optionalBlocks: "exclude_if_missing" as const,
    minimumCoveragePct: 70,
  };
  const decisionPolicy = (draft.assessmentDesign ?? DEFAULT_ASSESSMENT_DESIGN).decisionPolicy;
  const patchAggregation = (next: Partial<NonNullable<VacancyV2["scoring"]["aggregation"]>>) => update((d) => ({
    ...d,
    scoring: {
      ...d.scoring,
      aggregation: {
        ...(d.scoring.aggregation ?? aggregation),
        ...next,
      },
    },
  }));
  return (
    <section>
      <StepHeading eyebrow="04 · Match and ranking" title="Turn interview evidence into an explainable match." text="AI links each answer to the published role criteria. Configured weights combine the evidence, and the hiring team keeps the final decision." />
      <div className="grid grid-cols-2 gap-4">
        <div className={`${CARD} space-y-5 p-5`}>
          <Field label="Combination topology">
            <select className={INPUT} value={draft.scoring.topology} onChange={(e) => update((d) => ({ ...d, scoring: { ...d.scoring, topology: e.target.value as VacancyV2["scoring"]["topology"] } }))}>
              <option value="hybrid">Hybrid · knockouts + composite</option><option value="compensatory">Compensatory</option><option value="multiple_hurdle">Multiple hurdle</option>
            </select>
          </Field>
          <Field label="Weighting mode">
            <select className={INPUT} value={draft.scoring.weighting} onChange={(e) => update((d) => ({ ...d, scoring: { ...d.scoring, weighting: e.target.value as VacancyV2["scoring"]["weighting"] } }))}>
              <option value="rational">Configured · documented priorities</option>
              <option value="unit">Unit · equal across criteria</option>
            </select>
          </Field>
          <Field label={`Pass threshold · ${draft.scoring.threshold}/100`}><input className="w-full accent-[var(--iris-b)]" type="range" min={0} max={100} value={draft.scoring.threshold} onChange={(e) => update((d) => ({ ...d, scoring: { ...d.scoring, threshold: Number(e.target.value) } }))} /></Field>
          <Toggle checked={draft.scoring.anonymization.maskPII} onChange={(maskPII) => update((d) => ({ ...d, scoring: { ...d.scoring, anonymization: { ...d.scoring.anonymization, maskPII } } }))} label="Blind review by default" help="Identity stays separate from scoring and is revealed only at the configured decision gate." />
        </div>
        <div className={`${CARD} p-5`}>
          <div className="hud-label">Effective weight · actual contribution</div>
          <div className="mt-4 space-y-3">
            {ew.blocks.length === 0 && <p className="text-[12px] text-mid">Add scored, mapped blocks to calculate effective weights.</p>}
            {ew.blocks.map((b) => (
              <div key={b.blockId}>
                <div className="flex justify-between text-[11px]"><span className="text-mid">{b.title}</span><span className="font-mono text-hi">{b.pct}%</span></div>
                <div className="mt-1 h-1 overflow-hidden rounded bg-surface2"><div className="h-full bg-irisb" style={{ width: `${Math.min(100, b.pct)}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-6 border-t border-hairline pt-4">
            <div className="hud-label">Attribute weights</div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {ew.attributes.map((a) => <div key={a.attributeId} className="flex justify-between text-[10px]"><span className="truncate text-lo">{a.name}</span><span className="font-mono text-mid">{a.pct}%</span></div>)}
            </div>
          </div>
        </div>
      </div>
      <details
        className={`${CARD} group mt-4 p-5`}
        onToggle={(event) => {
          if (!event.currentTarget.open || draft.assessmentDesign) return;
          update((d) => ({ ...d, assessmentDesign: DEFAULT_ASSESSMENT_DESIGN }));
        }}
      >
        <AdvancedSummary
          title="Advanced evidence aggregation & decision safeguards"
          text="Define how independent sources combine, when the system abstains and which controls remain human-owned."
        />
        <div className="mt-5 grid grid-cols-2 gap-6 border-t border-hairline pt-5">
          <div>
            <div className="hud-label">Aggregation across evidence sources</div>
            <div className="mt-4 space-y-4">
              <Field label="Cross-source rule">
                <select
                  className={INPUT}
                  value={aggregation.acrossSources}
                  onChange={(event) => patchAggregation({
                    acrossSources: event.target.value as NonNullable<VacancyV2["scoring"]["aggregation"]>["acrossSources"],
                  })}
                >
                  <option value="evidence_weighted_mean">Evidence-quality weighted mean</option>
                  <option value="conservative_floor">Conservative floor</option>
                  <option value="highest_quality_source">Highest-confidence eligible source</option>
                </select>
              </Field>
              <Field label="Contradictory evidence">
                <select
                  className={INPUT}
                  value={aggregation.contradictoryEvidence}
                  onChange={(event) => patchAggregation({
                    contradictoryEvidence: event.target.value as NonNullable<VacancyV2["scoring"]["aggregation"]>["contradictoryEvidence"],
                  })}
                >
                  <option value="flag_human">Flag for human review</option>
                  <option value="use_lower_confidence">Retain with lower confidence</option>
                </select>
              </Field>
              <Field label="Optional blocks">
                <select
                  className={INPUT}
                  value={aggregation.optionalBlocks}
                  onChange={(event) => patchAggregation({
                    optionalBlocks: event.target.value as NonNullable<VacancyV2["scoring"]["aggregation"]>["optionalBlocks"],
                  })}
                >
                  <option value="exclude_if_missing">Exclude when missing</option>
                  <option value="include_when_completed">Include only when completed</option>
                </select>
              </Field>
              <Field label={`Minimum evidence coverage · ${aggregation.minimumCoveragePct}%`}>
                <input
                  className="w-full accent-[var(--iris-b)]"
                  type="range"
                  min={1}
                  max={100}
                  value={aggregation.minimumCoveragePct}
                  onChange={(event) => patchAggregation({ minimumCoveragePct: Number(event.target.value) })}
                />
              </Field>
            </div>
          </div>
          <div>
            <div className="hud-label">Abstention & final decision</div>
            <div className="mt-4 space-y-5">
              <Field label="Minimum independent evidence items per attribute">
                <input
                  className={INPUT}
                  type="number"
                  min={1}
                  max={10}
                  value={draft.scoring.abstainPolicy.minEvidencePerAttribute}
                  onChange={(event) => update((d) => ({
                    ...d,
                    scoring: {
                      ...d.scoring,
                      abstainPolicy: {
                        ...d.scoring.abstainPolicy,
                        minEvidencePerAttribute: Number(event.target.value),
                      },
                    },
                  }))}
                />
              </Field>
              <div className="rounded-lg border border-hairline bg-void2 p-4">
                <div className="font-mono text-[9px] uppercase tracking-[.08em] text-lo">Enforced decision policy</div>
                <div className="mt-4 space-y-4">
                  <Toggle
                    checked={draft.scoring.abstainPolicy.onAbstain === "flag_human"}
                    onChange={() => undefined}
                    label="Abstentions create a human-review task"
                    disabled
                  />
                  <Toggle
                    checked={decisionPolicy.humanFinalDecision}
                    onChange={() => undefined}
                    label="Named human makes the final decision"
                    help="AI evidence and arithmetic support the decision; they do not become the accountable decision-maker."
                    disabled
                  />
                  <Toggle
                    checked={!decisionPolicy.allowAutomatedRejection}
                    onChange={() => undefined}
                    label="Automated rejection is disabled"
                    disabled
                  />
                  <Toggle
                    checked={decisionPolicy.requireReasonCode}
                    onChange={() => undefined}
                    label="Decision reason code is required"
                    disabled
                  />
                  <Toggle
                    checked={decisionPolicy.requireEvidenceCitation}
                    onChange={() => undefined}
                    label="Evidence citation is required"
                    disabled
                  />
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-lo">
                If coverage is insufficient or evidence conflicts, the system abstains and creates a human-review task; it never invents a neutral score.
              </p>
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}

function ExperienceStep() {
  const { draft, update } = useStudio();
  const e = draft.experience;
  return (
    <section>
      <StepHeading eyebrow="05 · Candidate Experience" title="Explain the process before it begins." text="Job-relatedness, notice, consent, accommodation and a disposition promise are product surfaces." />
      <div className="grid grid-cols-2 gap-4">
        <div className={`${CARD} space-y-4 p-5`}>
          <div className="hud-label">Landing & brand</div>
          <Field label="Company blurb"><textarea className={`${INPUT} min-h-24`} value={e.landing.companyBlurb} onChange={(ev) => update((d) => ({ ...d, experience: { ...d.experience, landing: { ...d.experience.landing, companyBlurb: ev.target.value } } }))} /></Field>
          <Field label="Published bias-audit URL"><input className={INPUT} value={e.landing.biasAuditUrl ?? ""} onChange={(ev) => update((d) => ({ ...d, experience: { ...d.experience, landing: { ...d.experience.landing, biasAuditUrl: ev.target.value } } }))} placeholder="https://…" /></Field>
          <Toggle checked={e.landing.showCompensation} onChange={(showCompensation) => update((d) => ({ ...d, experience: { ...d.experience, landing: { ...d.experience.landing, showCompensation } } }))} label="Show compensation on landing" />
          <Field label="Candidate-facing tone"><select className={INPUT} value={e.tone} onChange={(ev) => update((d) => ({ ...d, experience: { ...d.experience, tone: ev.target.value as VacancyV2["experience"]["tone"] } }))}><option>formal</option><option>neutral</option><option>warm</option></select></Field>
        </div>
        <div className={`${CARD} space-y-4 p-5`}>
          <div className="hud-label">Notice & consent · v{e.notices.version}</div>
          <Field label="Jurisdiction profile"><select className={INPUT} value={e.notices.jurisdictionProfile} onChange={(ev) => update((d) => ({ ...d, experience: { ...d.experience, notices: { ...d.experience.notices, jurisdictionProfile: ev.target.value } } }))}><option>EU</option><option>US-NYC</option><option>US-IL</option><option>US-CA</option><option>KZ</option><option>Custom</option></select></Field>
          <Field label="Plain-language AI disclosure"><textarea className={`${INPUT} min-h-32 leading-relaxed`} value={e.notices.aiDisclosure} onChange={(ev) => update((d) => ({ ...d, experience: { ...d.experience, notices: { ...d.experience.notices, aiDisclosure: ev.target.value } } }))} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Retention · days"><input className={INPUT} type="number" value={e.notices.retentionDays} onChange={(ev) => update((d) => ({ ...d, experience: { ...d.experience, notices: { ...d.experience.notices, retentionDays: Number(ev.target.value) } } }))} /></Field>
            <Field label="Disposition SLA · days"><input className={INPUT} type="number" value={e.comms.dispositionSlaDays} onChange={(ev) => update((d) => ({ ...d, experience: { ...d.experience, comms: { ...d.experience.comms, dispositionSlaDays: Number(ev.target.value) } } }))} /></Field>
          </div>
          <Toggle checked={e.comms.feedbackOffer} onChange={(feedbackOffer) => update((d) => ({ ...d, experience: { ...d.experience, comms: { ...d.experience.comms, feedbackOffer } } }))} label="Offer on-request structured feedback" />
        </div>
      </div>
    </section>
  );
}

function GovernanceStep() {
  const { draft, update } = useStudio();
  const g = draft.governance;
  return (
    <section>
      <StepHeading eyebrow="06 · Team & Governance" title="Name the humans in the loop." text="Independent-first review, calibration and dual control turn oversight into behavior—not a policy claim." />
      <div className="grid grid-cols-[1.2fr_.8fr] gap-4">
        <div className={`${CARD} p-5`}>
          <div className="flex items-center justify-between"><div className="hud-label">Vacancy roster</div><button aria-label="Add reviewer" className={BTN} onClick={() => update((d) => ({ ...d, governance: { ...d.governance, roles: [...d.governance.roles, { userId: uid("u"), name: "new.reviewer", role: "TechnicalReviewer", piiReveal: false }] } }))}><Plus className="size-3.5" /></button></div>
          <div className="mt-3 divide-y divide-hairline">
            {g.roles.map((person) => (
              <div key={person.userId} className="grid grid-cols-[1fr_150px_90px_28px] items-center gap-3 py-3">
                <input aria-label={`Reviewer name ${person.name}`} className="bg-transparent text-[13px] text-hi outline-none" value={person.name} onChange={(e) => update((d) => ({ ...d, governance: { ...d.governance, roles: d.governance.roles.map((r) => r.userId === person.userId ? { ...r, name: e.target.value } : r) } }))} />
                <select aria-label={`Reviewer role ${person.name}`} className={`${INPUT} py-1.5`} value={person.role} onChange={(e) => update((d) => ({ ...d, governance: { ...d.governance, roles: d.governance.roles.map((r) => r.userId === person.userId ? { ...r, role: e.target.value as Role } : r) } }))}><option>Owner</option><option>HiringManager</option><option>TechnicalReviewer</option><option>Observer</option></select>
                <button onClick={() => update((d) => ({ ...d, governance: { ...d.governance, roles: d.governance.roles.map((r) => r.userId === person.userId ? { ...r, piiReveal: !r.piiReveal } : r) } }))} className={`rounded-full border px-2 py-1 font-mono text-[9px] ${person.piiReveal ? "border-irisb/50 text-irisc" : "border-hairline text-lo"}`}>PII REVEAL</button>
                <button aria-label={`Remove reviewer ${person.name}`} onClick={() => update((d) => ({ ...d, governance: { ...d.governance, roles: d.governance.roles.filter((r) => r.userId !== person.userId) } }))}><Trash2 className="size-3.5 text-lo" /></button>
              </div>
            ))}
          </div>
        </div>
        <div className={`${CARD} space-y-5 p-5`}>
          <Field label="Independent reviews required"><select className={INPUT} value={g.reviewPolicy.independentReviews} onChange={(e) => update((d) => ({ ...d, governance: { ...d.governance, reviewPolicy: { ...d.governance.reviewPolicy, independentReviews: Number(e.target.value) as 1 | 2 | 3 } } }))}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></Field>
          <Field label="Reviewer assignment"><select className={INPUT} value={g.reviewPolicy.assignment} onChange={(e) => update((d) => ({ ...d, governance: { ...d.governance, reviewPolicy: { ...d.governance.reviewPolicy, assignment: e.target.value as "round_robin" | "by_expertise" } } }))}><option value="round_robin">Round robin</option><option value="by_expertise">By attribute expertise</option></select></Field>
          <Field label="Dual-control batch threshold"><input className={INPUT} type="number" value={g.dualControlThreshold} onChange={(e) => update((d) => ({ ...d, governance: { ...d.governance, dualControlThreshold: Number(e.target.value) } }))} /></Field>
          <Toggle checked={g.calibrationRequired} onChange={(calibrationRequired) => update((d) => ({ ...d, governance: { ...d.governance, calibrationRequired } }))} label="Require frame-of-reference calibration" help="Reviewers rate anchored practice cases before their first live review." />
        </div>
      </div>
    </section>
  );
}

function candidatePreviewSignature(draft: VacancyV2) {
  return JSON.stringify({
    profile: draft.profile,
    pipeline: draft.pipeline.map((block) => ({
      id: block.id,
      order: block.order,
      title: block.title,
      candidateIntro: block.candidateIntro,
      required: block.required,
      estimatedMinutes: block.estimatedMinutes,
      accessibility: block.accessibility,
      languageOverride: block.languageOverride,
      deadlineOffsetHours: block.deadlineOffsetHours,
    })),
    experience: draft.experience,
    window: draft.window,
  });
}

function CandidatePreview({ onClose, onAcknowledge }: { onClose: () => void; onAcknowledge: () => void }) {
  const { draft } = useStudio();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-8" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="wb relative w-full max-w-3xl overflow-hidden rounded-2xl border border-black/10 p-8">
        <button aria-label="Close candidate preview" onClick={onClose} className="absolute right-5 top-5"><X className="size-4" /></button>
        <div className="font-mono text-[10px] uppercase tracking-[.1em] text-black/45">Candidate experience preview</div>
        <h2 className="mt-5 max-w-xl font-display text-[34px] leading-tight">{draft.profile.title || "Untitled position"}</h2>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-black/65">{draft.profile.mission || "The role mission will appear here."}</p>
        <div className="mt-7 grid grid-cols-3 gap-3">
          {draft.pipeline
            .filter(
              (b) =>
                b.required &&
                !(
                  b.settings.kind === "human_stage" &&
                  !b.scored &&
                  !b.settings.selfBooking
                ),
            )
            .map((b, i) => <div key={b.id} className="rounded-xl border border-black/10 bg-white p-4"><div className="font-mono text-[9px] text-black/40">STEP {String(i + 1).padStart(2, "0")}</div><div className="mt-2 text-[12px] font-medium">{b.title}</div><div className="mt-1 text-[10px] text-black/50">{fmtMinutes(estimateMinutes(b))}</div></div>)}
        </div>
        <div className="mt-6 rounded-xl bg-black p-5 text-white"><div className="font-mono text-[9px] text-white/45">WHAT AI DOES — AND NEVER DOES</div><p className="mt-2 text-[12px] leading-relaxed text-white/75">{draft.experience.notices.aiDisclosure}</p></div>
        <div className="mt-6 flex items-center justify-between gap-4">
          <span className="text-[11px] text-black/50">Accommodation or alternative-process request available at every step.</span>
          <div className="flex shrink-0 gap-2">
            <button onClick={onClose} className="rounded-lg border border-black/15 px-4 py-2.5 text-[12px] text-black/65">Close</button>
            <button onClick={onAcknowledge} className="rounded-lg bg-black px-4 py-2.5 text-[12px] text-white">I reviewed this experience</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreflightStep() {
  const {
    draft,
    replace,
    resetBlank,
    reviewedPreviewSignature,
    setReviewedPreviewSignature,
  } = useStudio();
  const issues = preflight(draft);
  const blockers = issues.filter((i) => i.severity === "blocker");
  const [preview, setPreview] = useState(false);
  const previewSignature = candidatePreviewSignature(draft);
  const previewed = reviewedPreviewSignature === previewSignature;
  const [published, setPublished] = useState<VacancyV2 | null>(null);
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const publish = async () => {
    if (blockers.length || !previewed) return;
    setPublishing(true);
    setPublishError("");
    try {
      const response = await fetch("/api/hr/vacancies/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacancy: draft, previewed: true }),
      });
      const body = (await response.json()) as { vacancy?: VacancyV2; error?: string };
      if (!response.ok || !body.vacancy) throw new Error(body.error || "Publishing failed.");
      replace(body.vacancy);
      setPublished(body.vacancy);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "Publishing failed.");
    } finally {
      setPublishing(false);
    }
  };
  return (
    <section>
      <StepHeading eyebrow="07 · Review and publish" title={published ? "Vacancy is live." : "Run the final checks."} text="Confirm that the candidate experience is complete and every result reaches a named human reviewer." action={<button className={`${BTN} inline-flex items-center gap-2`} onClick={() => setPreview(true)}><Eye className="size-3.5" /> Preview as candidate</button>} />
      {published ? (
        <div className={`${CARD} p-8 text-center`}>
          <div className="mx-auto grid size-12 place-items-center rounded-full border border-pos/40 bg-pos/10"><Check className="size-5 text-pos" /></div>
          <div className="mt-5 font-mono text-[10px] text-lo">LIVE · CONFIG V{published.configVersion} · HASH-CHAINED AUDIT</div>
          <h2 className="mt-2 font-display text-[28px]">{published.profile.title}</h2>
          <p className="mx-auto mt-2 max-w-lg text-[12px] leading-relaxed text-mid">
            Share this access code with candidates. Their responses will appear in this workspace as a structured evidence package.
          </p>
          <button
            aria-label={`Copy competition code ${published.code}`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(published.code);
              } catch {
                // The code remains visible when clipboard access is blocked.
              }
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            }}
            className="mx-auto mt-6 flex items-center gap-3 rounded-xl border border-hairline bg-surface2 px-6 py-4 font-mono text-[25px] tracking-[.2em]"
          >
            <span>{published.code}</span><Copy className="size-4 text-lo" />
          </button>
          <div aria-live="polite" className={`mt-2 min-h-4 font-mono text-[10px] ${copied ? "text-pos" : "text-transparent"}`}>{copied ? "COPIED TO CLIPBOARD" : "COPY READY"}</div>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href={`/?code=${encodeURIComponent(published.code)}&wbxDemoTts=1&wbxDemoAnswers=${encodeURIComponent(JSON.stringify(SHOWCASE_DEMO_ANSWERS))}`}
              className="rounded-lg bg-paper px-4 py-2.5 text-[12px] font-medium text-void"
            >
              Open candidate portal
            </Link>
            <button onClick={() => resetBlank()} className={BTN}><RotateCcw className="mr-2 inline size-3.5" />Create another</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_300px] gap-4">
          <div className={`${CARD} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <div className="hud-label">Launch checklist</div>
              <span className={`font-mono text-[10px] ${blockers.length ? "text-neg" : "text-pos"}`}>{blockers.length ? `${blockers.length} TO RESOLVE` : "READY"}</span>
            </div>
            <div className="divide-y divide-hairline">
              {issues.length === 0 && <div className="flex items-center gap-3 p-5 text-[13px] text-pos"><ShieldCheck className="size-4" /> The vacancy is complete and ready to publish.</div>}
              {issues.map((issue) => (
                <div key={issue.id} className="flex items-start gap-3 p-4">
                  {issue.severity === "blocker" ? <X className="mt-0.5 size-4 shrink-0 text-neg" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />}
                  <div><div className="font-mono text-[9px] uppercase text-lo">Step {issue.step} · {issue.severity}</div><p className="mt-1 text-[12px] leading-relaxed text-mid">{issue.message}</p></div>
                </div>
              ))}
            </div>
          </div>
          <div className={`${CARD} h-fit p-5`}>
            <div className="hud-label">Ready to publish</div>
            <div className="mt-4 space-y-3 text-[12px]">
              <div className="flex items-center justify-between"><span className="text-mid">Configuration checks</span><span className={blockers.length ? "text-neg" : "text-pos"}>{blockers.length ? blockers.length : "complete"}</span></div>
              <div className="flex items-center justify-between"><span className="text-mid">Candidate preview</span><span className={previewed ? "text-pos" : "text-warn"}>{previewed ? "reviewed" : "required"}</span></div>
              <div className="flex items-center justify-between"><span className="text-mid">Human reviewer</span><span className={draft.governance.roles.some((r) => r.role !== "Observer") ? "text-pos" : "text-neg"}>{draft.governance.roles.some((r) => r.role !== "Observer") ? "assigned" : "missing"}</span></div>
            </div>
            <button disabled={blockers.length > 0 || !previewed || publishing} onClick={() => void publish()} className="mt-5 w-full rounded-lg bg-paper px-4 py-3 text-[13px] font-medium text-void disabled:cursor-not-allowed disabled:opacity-25">
              {publishing ? "Publishing…" : "Freeze config & publish"}
            </button>
            {publishError && <p role="alert" className="mt-3 text-[11px] leading-relaxed text-neg">{publishError}</p>}
            <p className="mt-3 text-[10px] leading-relaxed text-lo">Publishing freezes criteria, rubrics, prompts and notices into config version {draft.configVersion}. Later edits create a new version.</p>
          </div>
        </div>
      )}
      {preview && (
        <CandidatePreview
          onClose={() => setPreview(false)}
          onAcknowledge={() => {
              setReviewedPreviewSignature(previewSignature);
            setPreview(false);
          }}
        />
      )}
    </section>
  );
}

function StepHeading({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-5">
      <div><div className="hud-label">{eyebrow}</div><h1 className="mt-2 font-display text-[28px] tracking-[-.02em]">{title}</h1><p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-mid">{text}</p></div>
      {action}
    </div>
  );
}

function ImpactPanel() {
  const { draft } = useStudio();
  const impact = impactSummary(draft);
  const coverage = coverageMatrix(draft);
  const covered = coverage.filter((item) => item.ok).length;
  const issueCount = impact.lint.blockers + impact.lint.warnings;
  return (
    <aside className="sticky top-[72px] h-fit">
      <div className={`${CARD} p-4`}>
        <div className="text-[12px] font-medium text-hi">Quick check</div>
        <div className="mt-4 space-y-3 text-[12px]">
          <div className="flex items-center justify-between"><span className="text-mid">Candidate time</span><span className={impact.totalMinutes > 45 ? "text-warn" : "text-hi"}>{fmtMinutes(impact.totalMinutes)}</span></div>
          <div className="flex items-center justify-between"><span className="text-mid">Criteria covered</span><span className="text-hi">{covered} of {coverage.length}</span></div>
          <div className="flex items-center justify-between">
            <span className="text-mid">Launch readiness</span>
            <span
              title={impact.validationReadiness.missing.join(" ")}
              className={
                impact.validationReadiness.status === "operational"
                  ? "text-pos"
                  : impact.validationReadiness.status === "prelaunch"
                    ? "text-hi"
                    : "text-warn"
              }
            >
              {impact.validationReadiness.passed} of{" "}
              {impact.validationReadiness.total}
            </span>
          </div>
          <div className="flex items-center justify-between"><span className="text-mid">Issues to review</span><span className={impact.lint.blockers ? "text-neg" : issueCount ? "text-warn" : "text-pos"}>{issueCount || "None"}</span></div>
          <div className="flex gap-1 pt-1">{coverage.map((item) => <span key={item.attributeId} title={item.attributeName} className={`h-1 flex-1 rounded ${item.ok ? "bg-pos" : "bg-warn"}`} />)}</div>
        </div>
      </div>
    </aside>
  );
}

export default function VacancyStudio() {
  const { draft, entered, hydrated, savedAt, step, setStep, resetBlank } = useStudio();
  const issues = useMemo(() => preflight(draft), [draft]);
  if (!hydrated) {
    return (
      <div className="grid min-h-[calc(100vh-52px)] place-items-center bg-void2">
        <div className="flex items-center gap-3 text-[12px] text-mid">
          <Sparkles className="size-4 text-irisb" /> Preparing vacancy studio...
        </div>
      </div>
    );
  }
  if (!entered) return <Entry />;
  const resetWithConfirmation = () => {
    if (!window.confirm("Discard this vacancy draft and return to the entry modes? This cannot be undone.")) return;
    resetBlank();
  };
  const panels = [
    <ProfileStep key="p" />,
    <CriteriaStep key="c" />,
    <PipelineStep key="pl" />,
    <ScoringStep key="s" />,
    <ExperienceStep key="e" />,
    <GovernanceStep key="g" />,
    <PreflightStep key="pf" />,
  ];
  return (
    <div className="grid min-h-[calc(100vh-52px)] grid-cols-[214px_minmax(0,1fr)] bg-void2">
      <nav className="border-r border-hairline bg-void px-3 py-5">
        <div className="px-3">
          <div className="hud-label">Vacancy Studio</div>
          <div className="mt-2 truncate text-[13px] text-hi">{draft.profile.title || "Untitled vacancy"}</div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[9px] text-lo">
            <span>DRAFT · CONFIG V{draft.configVersion}</span>
            {savedAt && <span className="text-pos">SAVED</span>}
          </div>
        </div>
        <div className="mt-6 space-y-1">
          {STEPS.map(([name, sub], i) => {
            const count = issues.filter((x) => x.step === i + 1 && x.severity === "blocker").length;
            return (
              <button key={name} onClick={() => setStep(i + 1)} className={`w-full rounded-lg border px-3 py-2.5 text-left ${step === i + 1 ? "border-hairline-strong bg-surface" : "border-transparent hover:bg-surface/60"}`}>
                <div className="flex items-center gap-2"><span className={`font-mono text-[9px] ${step === i + 1 ? "text-irisc" : "text-lo"}`}>{String(i + 1).padStart(2, "0")}</span><span className={`text-[11px] ${step === i + 1 ? "text-hi" : "text-mid"}`}>{name}</span>{count > 0 && <span className="ml-auto size-1.5 rounded-full bg-neg" />}</div>
                {step === i + 1 && <div className="ml-6 mt-0.5 text-[9px] text-lo">{sub}</div>}
              </button>
            );
          })}
        </div>
        <button onClick={resetWithConfirmation} className="mt-6 flex w-full items-center gap-2 px-3 py-2 text-[10px] text-lo hover:text-hi"><RotateCcw className="size-3" /> Change entry mode</button>
      </nav>
      <div className="grid grid-cols-[minmax(0,1fr)_210px] gap-5 px-6 py-7">
        <main className="min-w-0">{panels[step - 1]}</main>
        <ImpactPanel />
      </div>
    </div>
  );
}
