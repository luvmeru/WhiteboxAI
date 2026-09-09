"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown, ChevronRight, Check, Pause, RefreshCw, X,
  Quote, FileCheck2, Layers3, Video, Download, FileText,
  ShieldCheck, Target, UserRoundCheck, Sparkles,
} from "lucide-react";
import type { InterviewTurn } from "@/lib/ai-contracts";
import type {
  ApplicationStage,
  Candidate,
  CandidateEvaluation,
  CompetencyScore,
  EvidenceSpan,
} from "@/lib/types";
import type {
  CandidateAssessmentBlock,
  CandidateAssessmentPlan,
} from "@/lib/server/assessment-runtime";
import type { AssessmentBlockRun } from "@/lib/server/assessment-orchestrator";
import type { AssessmentReviewTargetView } from "@/lib/server/application-evaluation";
import {
  ConfidenceBadge,
  StatusPill,
  TierBadge,
} from "@/components/ui/primitives";

const TABS = [
  "Overview",
  "Competencies",
  "Assessment",
  "Interview",
  "Documents",
  "Audit",
] as const;
type Tab = (typeof TABS)[number];

type DecisionKind = "advance" | "hold" | "reject" | "request_rescore";

interface DecisionRecord {
  id: string;
  decision: DecisionKind;
  reason: string;
  actorUserId: string;
  actorEmail: string;
  resultingStage: ApplicationStage;
  createdAt: string;
}

/* ---------- radar (SVG, iris stroke) ---------- */
function Radar({ comps }: { comps: CompetencyScore[] }) {
  const n = comps.length;
  const abstained = comps.filter((comp) => comp.abstained);
  const allScored = abstained.length === 0;
  const R = 74;
  const cx = 210, cy = 106;
  const pt = (i: number, r: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const ring = (f: number) => comps.map((_, i) => pt(i, R * f).join(",")).join(" ");
  const data = comps.map((c, i) => pt(i, (c.score / 100) * R).join(",")).join(" ");
  return (
    <div className="w-full max-w-[440px]">
      <svg viewBox="0 0 420 212" className="w-full">
        {[0.33, 0.66, 1].map((f) => (
          <polygon key={f} points={ring(f)} fill="none" stroke="var(--line-soft)" strokeWidth="1" />
        ))}
        {comps.map((_, i) => {
          const [x, y] = pt(i, R);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line-soft)" strokeWidth="0.5" />;
        })}
        {allScored && (
          <polygon points={data} fill="rgba(255,106,46,0.12)" stroke="var(--iris-b)" strokeWidth="1.25" />
        )}
        {comps.map((c, i) => {
          if (c.abstained) return null;
          const [x, y] = pt(i, (c.score / 100) * R);
          return <circle key={c.id} cx={x} cy={y} r="2" fill="var(--iris-a)" />;
        })}
        {comps.map((c, i) => {
          const [x, y] = pt(i, R + 14);
          const anchor = Math.abs(x - cx) < 12 ? "middle" : x > cx ? "start" : "end";
          return (
            <text
              key={c.id}
              x={x}
              y={y + 2.5}
              textAnchor={anchor}
              className={c.abstained ? "fill-[var(--warn)]" : "fill-[var(--text-lo)]"}
              fontSize="8"
              fontFamily="var(--font-jetbrains)"
              letterSpacing="0.06em"
            >
              {c.name.toUpperCase()}
            </text>
          );
        })}
      </svg>
      {abstained.length > 0 && (
        <p className="px-4 text-center font-mono text-[10px] text-warn">
          NOT SCORED · {abstained.map((comp) => comp.name).join(", ")}
        </p>
      )}
    </div>
  );
}

/* ---------- evidence chip + anchored popover (Perplexity model) ---------- */
function EvidenceChips({
  evidence,
  onOpenTranscript,
}: {
  evidence: EvidenceSpan[];
  onOpenTranscript: (evidence: EvidenceSpan) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="relative flex flex-wrap gap-2">
      {evidence.map((e, i) => (
        <button
          key={i}
          onClick={() => setOpen(open === i ? null : i)}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
            open === i ? "border-irisb/60 text-hi" : "border-hairline text-mid hover:border-hairline-strong hover:text-hi"
          }`}
        >
          <Quote className="size-3" />
          {e.timestamp}
        </button>
      ))}
      {open !== null && (
        <div className="absolute left-0 top-9 z-20 w-[calc(100vw-3rem)] max-w-[420px] rounded-lg border border-hairline-strong bg-surface2 p-4 shadow-xl">
          <div className="hud-label">EVIDENCE · {evidence[open].timestamp} · {open + 1}/{evidence.length}</div>
          <p className="mt-2 text-[13px] leading-relaxed text-hi">“{evidence[open].quote}”</p>
          <p className="mt-2 text-[12px] text-lo">Q: {evidence[open].question}</p>
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={() => onOpenTranscript(evidence[open])}
              className="text-[12px] text-mid hover:text-hi"
            >
              Open exact answer →
            </button>
            <div className="flex gap-1">
              <button onClick={() => setOpen((open - 1 + evidence.length) % evidence.length)} className="rounded border border-hairline px-2 text-[12px] text-mid">‹</button>
              <button onClick={() => setOpen((open + 1) % evidence.length)} className="rounded border border-hairline px-2 text-[12px] text-mid">›</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- one competency block: the explainability heart ---------- */
function CompetencyBlock({
  comp,
  threshold,
  onOpenTranscript,
  defaultOpen,
}: {
  comp: CompetencyScore;
  threshold: number;
  onOpenTranscript: (evidence: EvidenceSpan) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? comp.id === "leadership");
  const [traceOpen, setTraceOpen] = useState(false);
  const [confOpen, setConfOpen] = useState(false);
  return (
    <div className="rounded-xl border border-hairline bg-surface">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-4 px-5 py-4 text-left">
        {open ? <ChevronDown className="size-4 text-lo" /> : <ChevronRight className="size-4 text-lo" />}
        <span className="text-[14px] font-medium text-hi">{comp.name}</span>
        {comp.docVerified && (
          <span className="flex items-center gap-1 font-mono text-[10px] tracking-[0.06em] text-pos">
            <FileCheck2 className="size-3" /> DOC-VERIFIED
          </span>
        )}
        <span className="ml-auto flex items-center gap-4">
          <ConfidenceBadge band={comp.confidence} compact />
          <span className={`tnum font-mono text-[15px] ${comp.abstained ? "text-warn" : comp.score >= threshold ? "text-hi" : "text-mid"}`}>
            {comp.abstained ? "NOT SCORED" : comp.score}
          </span>
          <span className="hud-label">W {comp.weight}%</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-hairline px-5 pb-5 pt-4 pl-[52px]">
          {/* Ranked drivers — FICO reason-code model, principal reason first */}
          <div className="hud-label">RANKED DRIVERS · PRINCIPAL FIRST</div>
          <ol className="mt-2.5 space-y-2">
            {comp.drivers.map((d, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="tnum w-4 font-mono text-[11px] text-lo">{i + 1}</span>
                <span className="relative h-1 w-20 shrink-0 overflow-hidden rounded-full bg-white/8">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${d.impact * 200}%`, backgroundColor: d.direction === "pos" ? "var(--pos)" : "var(--neg)" }}
                  />
                </span>
                <span className="text-[13px] leading-snug text-hi">{d.text}</span>
              </li>
            ))}
          </ol>

          {/* Confidence as a phrase, expandable "why" */}
          <button onClick={() => setConfOpen(!confOpen)} className="mt-4 block text-left">
            <span className="text-[13px] text-mid hover:text-hi">{comp.confidenceReason}</span>
            <span className="ml-2 font-mono text-[10px] text-lo">{confOpen ? "HIDE" : "WHY?"}</span>
          </button>
          {confOpen && (
            <div className="mt-2 rounded-lg border border-hairline bg-void2 p-3.5 text-[12px] leading-relaxed text-mid">
              This band reflects the amount, independence and review state of
              the cited job-related evidence. It does not make the hiring
              decision. If the published evidence floor is not met, the system
              abstains instead of manufacturing a low score.
            </div>
          )}

          {/* Evidence chips */}
          <div className="mt-4">
            <div className="hud-label mb-2">EVIDENCE · SOURCE FRAGMENTS</div>
            <EvidenceChips evidence={comp.evidence} onOpenTranscript={onOpenTranscript} />
          </div>

          {/* Collapsible reasoning trace — "Completed N steps" */}
          <button onClick={() => setTraceOpen(!traceOpen)} className="mt-4 flex items-center gap-2 text-[12px] text-lo hover:text-mid">
            {traceOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            Completed {comp.trace.length} steps
          </button>
          {traceOpen && (
            <ol className="mt-2 space-y-1.5 border-l border-hairline pl-4">
              {comp.trace.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-[12px] leading-relaxed text-mid">
                  <span className="tnum font-mono text-[10px] text-lo">{String(i + 1).padStart(2, "0")}</span>
                  {s}
                </li>
              ))}
              <li className="pt-1 font-mono text-[10px] tracking-[0.06em] text-lo">
                EXPLANATION TRACE · SOURCE EVIDENCE IS QUOTED ABOVE
              </li>
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- named human decision, persisted server-side ---------- */
function HitlInspector({
  applicationId,
  lockVersion,
  stage,
  initialHistory,
  canFinalize,
  requiredIndependentReviews,
  currentReviewerId,
  currentReviewerName,
  currentReviewerRole,
}: {
  applicationId?: string;
  lockVersion?: number;
  stage?: ApplicationStage;
  initialHistory: DecisionRecord[];
  canFinalize: boolean;
  requiredIndependentReviews: 1 | 2 | 3;
  currentReviewerId?: string;
  currentReviewerName?: string;
  currentReviewerRole?: string;
}) {
  const [action, setAction] = useState<DecisionKind | null>(null);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState(initialHistory);
  const [version, setVersion] = useState(lockVersion);
  const [currentStage, setCurrentStage] = useState(stage);
  const [showHistory, setShowHistory] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const lastRescoreIndex = history.findLastIndex(
    (item) => item.decision === "request_rescore",
  );
  const finalReviews = history
    .slice(lastRescoreIndex + 1)
    .filter(
      (item) => item.decision === "advance" || item.decision === "reject",
    );
  const finalReviewerCount = new Set(
    finalReviews.map((item) => item.actorUserId),
  ).size;
  const conflictingReviews =
    new Set(finalReviews.map((item) => item.decision)).size > 1;
  const currentReviewerSubmitted = finalReviews.some(
    (item) => item.actorUserId === currentReviewerId,
  );
  const terminalStage = currentStage
    ? [
        "offer",
        "hired",
        "not_moving_forward",
        "knocked_out",
        "withdrawn",
      ].includes(currentStage)
    : false;

  const actions = [
    { label: "Advance", value: "advance" as const, icon: Check, final: true },
    { label: "Hold", value: "hold" as const, icon: Pause, final: false },
    {
      label: "Request rescore",
      value: "request_rescore" as const,
      icon: RefreshCw,
      final: false,
    },
    { label: "Reject", value: "reject" as const, icon: X, final: true },
  ];

  const commit = async () => {
    if (
      !applicationId ||
      version === undefined ||
      !action ||
      reason.trim().length < 8 ||
      pending
    ) {
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/hr/applications/${encodeURIComponent(applicationId)}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: action,
            reason: reason.trim(),
            expectedVersion: version,
          }),
        },
      );
      const body = (await response.json()) as {
        application?: { lockVersion: number; stage: ApplicationStage };
        decision?: DecisionRecord;
        error?: string;
      };
      if (!response.ok || !body.application || !body.decision) {
        throw new Error(body.error || "The decision could not be recorded.");
      }
      setVersion(body.application.lockVersion);
      setCurrentStage(body.application.stage);
      setHistory((items) => [...items, body.decision!]);
      setAction(null);
      setReason("");
      setShowHistory(true);
    } catch (reasonValue) {
      setError(
        reasonValue instanceof Error
          ? reasonValue.message
          : "The decision could not be recorded.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <aside className="h-fit w-full shrink-0 rounded-xl border border-hairline bg-surface xl:sticky xl:top-[76px] xl:w-[330px]">
      <div className="border-b border-hairline p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[14px] font-medium text-hi">Human review</div>
          {currentStage && (
            <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-lo">
              {currentStage.replaceAll("_", " ")}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-mid">
          The analysis organizes job-related evidence; it never finalizes an
          employment decision. Every action below requires a written reason and
          is added to the audit chain.
        </p>
        {requiredIndependentReviews > 1 && (
          <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.05em] text-lo">
            {conflictingReviews
              ? "Conflicting reviews · adjudication required"
              : `Independent final reviews ${finalReviewerCount}/${requiredIndependentReviews}`}
          </p>
        )}
      </div>

      <div className="p-5">
        {currentReviewerName && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-hairline bg-void2 p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-pos/25 bg-pos/[0.06] text-pos">
              <UserRoundCheck className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-lo">
                Named review owner
              </div>
              <div className="mt-0.5 truncate text-[12px] text-hi">
                {currentReviewerName}
              </div>
              {currentReviewerRole && (
                <div className="mt-0.5 font-mono text-[9px] uppercase text-mid">
                  {currentReviewerRole}
                </div>
              )}
            </div>
          </div>
        )}
        {!applicationId || version === undefined ? (
          <p className="rounded-lg border border-hairline bg-void2 p-3 text-[11px] leading-relaxed text-lo">
            A stored application is required before a decision can be recorded.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {actions.map((item) => {
                const disabled =
                  item.final &&
                  (!canFinalize ||
                    currentReviewerSubmitted ||
                    terminalStage);
                return (
                  <button
                    key={item.value}
                    type="button"
                    disabled={disabled || pending}
                    title={
                      disabled
                        ? !canFinalize
                          ? "Only an owner or hiring manager can record a final disposition."
                          : currentReviewerSubmitted
                            ? "A different reviewer must submit the next independent final review."
                            : "This application already has a terminal outcome."
                        : undefined
                    }
                    onClick={() =>
                      setAction(action === item.value ? null : item.value)
                    }
                    className={`flex min-h-10 items-center justify-center gap-2 rounded border px-2 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                      action === item.value
                        ? "border-irisb/60 bg-surface2 text-hi"
                        : "border-hairline-strong bg-surface2 text-hi hover:border-irisb/40"
                    }`}
                  >
                    <item.icon className="size-3.5" /> {item.label}
                  </button>
                );
              })}
            </div>

            {action && (
              <div className="mt-3">
                <label className="hud-label">
                  REASON · REQUIRED · MINIMUM 8 CHARACTERS
                </label>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={4}
                  className="iris-focus mt-1.5 w-full rounded-lg border border-hairline bg-void2 p-3 text-[13px] text-hi placeholder:text-lo"
                  placeholder="Cite the job-related evidence that supports this action."
                />
                <button
                  type="button"
                  onClick={() => void commit()}
                  disabled={pending || reason.trim().length < 8}
                  className="mt-3 w-full rounded border border-hairline-strong bg-surface2 py-2 text-[13px] text-hi transition-colors hover:border-irisb/50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending ? "Recording…" : "Confirm and audit"}
                </button>
              </div>
            )}
            {error && (
              <p role="alert" className="mt-3 text-[11px] leading-relaxed text-warn">
                {error}
              </p>
            )}
          </>
        )}

        <div className="mt-5 border-t border-hairline pt-4">
          <button
            type="button"
            onClick={() => setShowHistory((value) => !value)}
            aria-expanded={showHistory}
            className="flex w-full items-center justify-between text-[11px] text-mid hover:text-hi"
          >
            <span>Decision history</span>
            <span>{showHistory ? "Hide" : `${history.length} entries`}</span>
          </button>
          {showHistory && (
            <div className="mt-3 space-y-2.5">
              {history.length === 0 && (
                <p className="text-[11px] text-lo">No human decision recorded yet.</p>
              )}
              {history
                .slice()
                .reverse()
                .map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-hairline bg-void2 p-3"
                  >
                    <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-hi">
                      {item.decision.replaceAll("_", " ")} ·{" "}
                      {item.resultingStage.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-mid">
                      {item.reason}
                    </p>
                    <p className="mt-1.5 font-mono text-[9px] text-lo">
                      {item.actorEmail} · {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ---------- tabs content ---------- */
function Overview({
  c,
  stage,
  evaluation,
  threshold,
  vacancyTitle,
  vacancyVersion,
}: {
  c: Candidate;
  stage?: ApplicationStage;
  evaluation?: CandidateEvaluation;
  threshold: number;
  vacancyTitle: string;
  vacancyVersion: number;
}) {
  const incomplete =
    c.evaluationComplete === false || c.tier === null || c.rank === null;
  const engine = evaluation?.engine;
  const coverage = c.evaluationCoverage ?? (incomplete ? 0 : 100);
  const evidenceCount = c.competencies.reduce(
    (total, competency) => total + competency.evidence.length,
    0,
  );
  const scoredCriteria = c.competencies.filter(
    (competency) => !competency.abstained,
  ).length;
  const alignmentLabel = incomplete
    ? "REVIEW REQUIRED"
    : c.overall >= threshold
      ? "MEETS ROLE THRESHOLD"
      : "FOLLOW-UP REQUIRED";
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-hairline bg-surface">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-irisc">
              <Target className="size-3.5" />
              Evidence alignment · frozen role v{vacancyVersion}
            </div>
            <h2 className="mt-2 font-display text-[23px] font-medium tracking-[-0.015em] text-hi">
              {vacancyTitle}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-[12px] text-hi">{c.internalId}</span>
              {incomplete || c.tier === null ? (
                <StatusPill label="NEEDS REVIEW" />
              ) : (
                <TierBadge tier={c.tier} />
              )}
              {stage && (
                <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-lo">
                  {stage.replaceAll("_", " ")}
                </span>
              )}
            </div>
            <p className="mt-4 max-w-[62ch] text-[12px] leading-relaxed text-mid">
              The score summarizes cited, job-related evidence against the
              requirements locked when this vacancy was published. It supports
              review; the named hiring reviewer owns the decision.
            </p>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <div className="tnum font-display text-[58px] font-medium leading-none text-hi">
              {c.overall}
              <span className="ml-1 font-mono text-[11px] font-normal text-lo">
                /100
              </span>
            </div>
            <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.06em] text-mid">
              Evidence alignment
            </div>
            <div className={`mt-2 font-mono text-[10px] ${incomplete ? "text-warn" : c.overall >= threshold ? "text-pos" : "text-mid"}`}>
              {alignmentLabel} · ROLE FLOOR {threshold}
            </div>
          </div>
        </div>
        <div className="h-px bg-hairline">
          <div
            className="h-px iris-line"
            style={{ width: `${Math.max(0, Math.min(100, c.overall))}%` }}
          />
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-hairline sm:grid-cols-4 sm:divide-y-0">
          <div className="px-4 py-3.5">
            <div className="tnum font-display text-[21px] font-medium text-hi">
              {coverage}%
            </div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-lo">
              Evidence coverage
            </div>
          </div>
          <div className="px-4 py-3.5">
            <ConfidenceBadge band={c.confidence} compact />
            <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.06em] text-lo">
              Evidence confidence
            </div>
          </div>
          <div className="px-4 py-3.5">
            <div className="tnum font-display text-[21px] font-medium text-hi">
              {evidenceCount}
            </div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-lo">
              Transcript citations
            </div>
          </div>
          <div className="px-4 py-3.5">
            <StatusPill
              label={c.verification === "—" ? "NO CLAIM CHECKS" : c.verification}
            />
            <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.06em] text-lo">
              Claim verification
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <section className="rounded-xl border border-hairline bg-surface p-6">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-irisc">
            <Sparkles className="size-3.5" />
            Evidence synthesis
          </div>
          {evaluation?.synthesis.narrative && (
            <p className="mt-3 text-[13px] leading-[1.7] text-mid">
              {evaluation.synthesis.narrative}
            </p>
          )}
          <div className="mt-5 grid grid-cols-1 gap-5 border-t border-hairline pt-5 sm:grid-cols-2">
            <div>
              <div className="hud-label mb-2 text-pos">SUPPORTED STRENGTHS</div>
              <ul className="space-y-2 text-[13px] leading-relaxed text-hi">
                {c.strengths.map((strength) => (
                  <li key={strength} className="flex gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-pos" />
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="hud-label mb-2 text-warn">GROWTH &amp; FOLLOW-UP</div>
              <ul className="space-y-2 text-[13px] leading-relaxed text-mid">
                {c.weaknesses.map((area) => (
                  <li key={area} className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-warn">→</span>
                    <span>{area}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="grid-paper rounded-xl border border-hairline bg-surface p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="hud-label">ROLE ALIGNMENT MAP</div>
              <p className="mt-1 text-[11px] leading-relaxed text-mid">
                {scoredCriteria}/{c.competencies.length} frozen criteria have
                sufficient evidence to score.
              </p>
            </div>
            <ShieldCheck className="size-4 text-pos" />
          </div>
          <div className="mt-2 flex min-h-[250px] items-center justify-center">
            <Radar comps={c.competencies} />
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-hairline bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="hud-label">TRACEABLE CRITERIA</div>
            <p className="mt-1 text-[11px] leading-relaxed text-mid">
              Each result opens to its ranked drivers and exact quoted source.
            </p>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-lo">
            Applied {c.appliedAt}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {c.competencies.map((competency) => (
            <div
              key={competency.id}
              className="rounded-lg border border-hairline bg-void2 p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-[12px] font-medium text-hi">
                  {competency.name}
                </span>
                <span className={`tnum font-mono text-[12px] ${competency.abstained ? "text-warn" : "text-hi"}`}>
                  {competency.abstained ? "NOT SCORED" : competency.score}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.05em] text-lo">
                <span>{competency.evidence.length} quoted source{competency.evidence.length === 1 ? "" : "s"}</span>
                <span>Weight {competency.weight}%</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {engine && (
        <section className="rounded-xl border border-hairline bg-surface p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-3.5 text-pos" />
            <div className="hud-label">EVALUATION TRACE</div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["MODEL", engine.model],
              ["PROMPT", `${engine.promptId} · ${engine.promptVersion}`],
              ["RUBRIC", engine.rubricVersion],
              ["SCORED", new Date(engine.scoredAt).toLocaleString()],
              ["PROVIDER RESPONSE", engine.providerResponseId ?? "NOT RETURNED"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-hairline bg-void2 p-3">
                <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-lo">
                  {label}
                </div>
                <div className="mt-1 break-all font-mono text-[11px] text-hi">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function assessmentErrorMessage(
  error: string | { message?: string } | undefined,
): string {
  return typeof error === "string"
    ? error
    : error?.message || "The trusted review could not be recorded.";
}

function AssessmentEvidenceViewer({
  target,
  applicationId,
  receiptIndex,
}: {
  target: AssessmentReviewTargetView;
  applicationId: string;
  receiptIndex: number;
}) {
  const receipt = target.evidenceReceipts[receiptIndex];
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const route = receipt
    ? `/api/hr/applications/${encodeURIComponent(applicationId)}/assessment-evidence/${encodeURIComponent(target.targetId)}/${receiptIndex}`
    : "";
  const artifact = receipt?.source === "submitted_artifact";

  useEffect(() => {
    setText("");
    setError("");
    if (!receipt || artifact) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void fetch(route, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "text/plain" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            response.status === 409
              ? "The bound evidence is not available yet or has expired."
              : "The bound evidence could not be loaded.",
          );
        }
        return response.text();
      })
      .then((body) => setText(body))
      .catch((reasonValue: unknown) => {
        if (
          reasonValue instanceof DOMException &&
          reasonValue.name === "AbortError"
        ) {
          return;
        }
        setError(
          reasonValue instanceof Error
            ? reasonValue.message
            : "The bound evidence could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [artifact, receipt, route]);

  if (!receipt) return null;
  return (
    <section className="mt-2 rounded border border-hairline bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {artifact ? (
            <FileCheck2 className="size-3.5 text-irisb" />
          ) : (
            <FileText className="size-3.5 text-irisb" />
          )}
          <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-mid">
            Exact persisted evidence
          </span>
        </div>
        <span className="text-[10px] text-lo">{receipt.label}</span>
      </div>

      {artifact ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-[10px] leading-relaxed text-lo">
            Download the private artifact through the authenticated,
            tenant-bound receipt. The candidate-provided filename and storage
            location are intentionally hidden.
          </p>
          <a
            href={route}
            download
            className="inline-flex items-center gap-2 rounded border border-hairline-strong bg-void2 px-3 py-2 text-[10px] text-hi hover:border-irisb/50"
          >
            <Download className="size-3.5" />
            Download secured evidence
          </a>
        </div>
      ) : loading ? (
        <p className="mt-3 text-[10px] text-lo" aria-live="polite">
          Loading the bound evidence…
        </p>
      ) : error ? (
        <p
          className="mt-3 rounded border border-warn/30 bg-warn/5 px-3 py-2 text-[10px] text-warn"
          role="alert"
        >
          {error}
        </p>
      ) : (
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border border-hairline bg-void2 p-3 font-mono text-[11px] leading-relaxed text-hi">
          {text}
        </pre>
      )}
    </section>
  );
}

function AssessmentReviewEditor({
  target,
  applicationId,
  lockVersion,
  currentReviewerId,
}: {
  target: AssessmentReviewTargetView;
  applicationId: string;
  lockVersion: number;
  currentReviewerId: string;
}) {
  const ownReview = target.activeReviews.find(
    (review) => review.reviewerUserId === currentReviewerId,
  );
  const [level, setLevel] = useState<1 | 2 | 3 | 4 | 5 | null>(
    ownReview?.level ?? null,
  );
  const [verificationOutcome, setVerificationOutcome] = useState<
    "verified" | "not_verified" | null
  >(ownReview?.verificationOutcome ?? null);
  const [gateWaiverOutcome, setGateWaiverOutcome] = useState<
    "waived" | "upheld" | null
  >(ownReview?.gateWaiverOutcome ?? null);
  const [summary, setSummary] = useState(
    ownReview?.evidence?.summary ?? "",
  );
  const [locator, setLocator] = useState(
    ownReview?.evidence?.locator ??
      target.evidenceReceipts[0]?.locator ??
      "",
  );
  const [rationale, setRationale] = useState(
    ownReview?.rationale ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKey = useRef<string | null>(null);
  const outcomeSelected =
    target.binding.kind === "manual_bars"
      ? level !== null
      : target.binding.kind === "verification"
        ? verificationOutcome !== null
        : gateWaiverOutcome !== null;
  const lockedForNewReviewer =
    !target.reviewable ||
    (!ownReview &&
      (target.status === "resolved" || target.status === "conflict"));
  const canSubmit =
    outcomeSelected &&
    summary.trim().length >= 20 &&
    locator.trim().length >= 3 &&
    rationale.trim().length >= 20 &&
    target.reviewable &&
    !lockedForNewReviewer &&
    !pending;

  const submit = async () => {
    if (!canSubmit) return;
    setPending(true);
    setError("");
    try {
      idempotencyKey.current ??= window.crypto.randomUUID();
      const response = await fetch(
        `/api/hr/applications/${encodeURIComponent(applicationId)}/assessment-reviews`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetId: target.targetId,
            expectedVersion: lockVersion,
            idempotencyKey: idempotencyKey.current,
            level:
              target.binding.kind === "manual_bars"
                ? level
                : null,
            verificationOutcome:
              target.binding.kind === "verification"
                ? verificationOutcome
                : null,
            gateWaiverOutcome:
              target.binding.kind === "gate_waiver"
                ? gateWaiverOutcome
                : null,
            evidence: {
              summary: summary.trim(),
              locator: locator.trim(),
            },
            rationale: rationale.trim(),
            supersedesReviewId: ownReview?.id ?? null,
          }),
        },
      );
      const body = (await response.json()) as {
        application?: {
          lockVersion: number;
          stage: ApplicationStage;
        };
        error?: string | { message?: string };
      };
      if (!response.ok || !body.application) {
        throw new Error(assessmentErrorMessage(body.error));
      }

      // Trusted evidence and the score roll-up are separate atomic writes.
      // Refresh the roll-up immediately when the runtime is reviewable; a
      // failed refresh never rolls back or hides the immutable human record.
      if (body.application.stage !== "in_progress") {
        await fetch(
          `/api/hr/applications/${encodeURIComponent(applicationId)}/evaluate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedVersion: body.application.lockVersion,
            }),
          },
        );
      }
      window.location.reload();
    } catch (reasonValue) {
      setError(
        reasonValue instanceof Error
          ? reasonValue.message
          : "The trusted review could not be recorded.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-hairline-strong bg-void2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.05em] text-hi">
            {target.label}
          </div>
          <p className="mt-1 text-[11px] text-mid">
            {target.attributeName ?? "Governed verification"} ·{" "}
            {target.requiredReviews} independent review
            {target.requiredReviews === 1 ? "" : "s"} required
          </p>
        </div>
        <span className="rounded-full border border-hairline px-2.5 py-1 font-mono text-[9px] uppercase text-mid">
          {target.status}
        </span>
      </div>

      {target.independentBeforeDiscussion &&
        !target.detailsVisible && (
          <p className="mt-3 rounded border border-hairline bg-surface px-3 py-2 text-[11px] leading-relaxed text-lo">
            Peer ratings and rationale remain hidden until you submit
            independently. {target.activeReviews.length}/
            {target.requiredReviews} review receipts are present.
          </p>
        )}

      {!target.reviewable && (
        <p className="mt-3 rounded border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-warn">
          {target.unavailableReason ??
            "Awaiting a connected server-owned evidence receipt."}
        </p>
      )}

      {target.activeReviews.length > 0 && target.detailsVisible && (
        <div className="mt-3 space-y-2">
          {target.activeReviews.map((review) => (
            <div
              key={review.id}
              className="rounded border border-hairline bg-surface px-3 py-2"
            >
              <div className="font-mono text-[9px] uppercase text-lo">
                {review.reviewerRole} ·{" "}
                {new Date(review.createdAt).toLocaleString()}
              </div>
              <p className="mt-1 text-[11px] text-hi">
                {review.level !== null
                  ? `BARS level ${review.level}`
                  : review.verificationOutcome
                    ? review.verificationOutcome.replaceAll("_", " ")
                    : review.gateWaiverOutcome?.replaceAll("_", " ")}
              </p>
              {review.evidence && (
                <p className="mt-1 text-[11px] leading-relaxed text-mid">
                  {review.evidence.summary} · Server-bound evidence receipt
                </p>
              )}
              {review.rationale && (
                <p className="mt-1 text-[11px] leading-relaxed text-lo">
                  {review.rationale}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {target.reviewable && target.evidenceReceipts.length > 0 && (
        <div className="mt-4">
          <label className="text-[10px] text-lo">
            <span className="hud-label">
              SERVER-VERIFIED EVIDENCE RECEIPT
            </span>
            <select
              value={locator}
              onChange={(event) => setLocator(event.target.value)}
              className="iris-focus mt-1.5 w-full rounded border border-hairline bg-surface px-2.5 py-2 text-[11px] text-hi placeholder:text-lo"
            >
              {target.evidenceReceipts.map((receipt) => (
                <option key={receipt.locator} value={receipt.locator}>
                  {receipt.label}
                </option>
              ))}
            </select>
          </label>
          <AssessmentEvidenceViewer
            target={target}
            applicationId={applicationId}
            receiptIndex={Math.max(
              0,
              target.evidenceReceipts.findIndex(
                (receipt) => receipt.locator === locator,
              ),
            )}
          />
          <p className="mt-2 text-[10px] leading-relaxed text-lo">
            Inspect this persisted source before selecting an anchor. The
            browser cannot replace its source, observer attestation or frozen
            vacancy binding.
          </p>
        </div>
      )}

      {target.binding.kind === "manual_bars" && target.bars && (
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {target.bars.map((anchor, index) => {
            const candidateLevel = (index + 1) as 1 | 2 | 3 | 4 | 5;
            return (
              <button
                key={candidateLevel}
                type="button"
                disabled={lockedForNewReviewer}
                onClick={() => setLevel(candidateLevel)}
                className={`rounded border p-2 text-left text-[10px] leading-relaxed transition-colors disabled:opacity-40 ${
                  level === candidateLevel
                    ? "border-irisb/60 bg-irisa/10 text-hi"
                    : "border-hairline bg-surface text-mid hover:border-hairline-strong"
                }`}
              >
                <span className="mb-1 block font-mono text-[10px] text-hi">
                  L{candidateLevel}
                </span>
                {anchor}
              </button>
            );
          })}
        </div>
      )}

      {target.binding.kind === "verification" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {(["verified", "not_verified"] as const).map((outcome) => (
            <button
              key={outcome}
              type="button"
              disabled={lockedForNewReviewer}
              onClick={() => setVerificationOutcome(outcome)}
              className={`rounded border px-3 py-2 text-[11px] uppercase ${
                verificationOutcome === outcome
                  ? "border-irisb/60 bg-irisa/10 text-hi"
                  : "border-hairline bg-surface text-mid"
              }`}
            >
              {target.blockKind === "doc_verification"
                ? outcome === "verified"
                  ? "Contents meet requirement"
                  : "Contents do not meet requirement"
                : outcome.replaceAll("_", " ")}
            </button>
          ))}
        </div>
      )}

      {target.binding.kind === "gate_waiver" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {(["upheld", "waived"] as const).map((outcome) => (
            <button
              key={outcome}
              type="button"
              disabled={lockedForNewReviewer}
              onClick={() => setGateWaiverOutcome(outcome)}
              className={`rounded border px-3 py-2 text-[11px] uppercase ${
                gateWaiverOutcome === outcome
                  ? "border-irisb/60 bg-irisa/10 text-hi"
                  : "border-hairline bg-surface text-mid"
              }`}
            >
              {outcome}
            </button>
          ))}
        </div>
      )}

      {!lockedForNewReviewer && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="text-[10px] text-lo">
            <span className="hud-label">EVIDENCE SUMMARY</span>
            <textarea
              rows={3}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Record only job-related observed evidence (minimum 20 characters)."
              className="iris-focus mt-1.5 w-full rounded border border-hairline bg-surface p-2.5 text-[11px] text-hi placeholder:text-lo"
            />
          </label>
          <label className="text-[10px] text-lo">
            <span className="hud-label">RATIONALE</span>
            <textarea
              rows={3}
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              placeholder="Explain how the evidence maps to the exact anchor or verification outcome."
              className="iris-focus mt-1.5 w-full rounded border border-hairline bg-surface p-2.5 text-[11px] text-hi placeholder:text-lo"
            />
          </label>
          <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[10px] leading-relaxed text-lo">
              The source and observer attestation come from this immutable
              server receipt; they cannot be supplied by the browser.
            </p>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void submit()}
              className="rounded border border-hairline-strong bg-surface px-4 py-2 text-[11px] text-hi hover:border-irisb/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending
                ? "Recording…"
                : ownReview
                  ? "Replace my review"
                  : "Record independent review"}
            </button>
          </div>
        </div>
      )}
      {lockedForNewReviewer && target.reviewable && (
        <p className="mt-3 text-[10px] leading-relaxed text-lo">
          This target is closed. A reviewer who owns an active record may
          supersede that record to resolve a governed conflict.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[11px] text-warn">
          {error}
        </p>
      )}
    </div>
  );
}

function AssessmentCoordination({
  block,
  run,
  applicationId,
  lockVersion,
}: {
  block: CandidateAssessmentBlock;
  run?: AssessmentBlockRun;
  applicationId?: string;
  lockVersion?: number;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!applicationId || lockVersion === undefined || !run) return null;
  const deferredDocument =
    block.manifest.kind === "doc_verification" &&
    block.manifest.placement === "post_shortlist" &&
    run.status === "awaiting_verification";
  const humanObservation =
    block.manifest.kind === "human_stage" &&
    ["available", "awaiting_human_review"].includes(run.status);
  if (!deferredDocument && !humanObservation) return null;

  const post = async (path: string, payload: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          result.error?.message ?? "The coordination action failed.",
        );
      }
      setNotes("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The coordination action failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-hairline-strong bg-void2 p-4">
      {deferredDocument && (
        <>
          <div className="hud-label">POST-SHORTLIST DOCUMENT RELEASE</div>
          <p className="mt-2 text-[11px] leading-relaxed text-mid">
            Open the exact frozen document stage only when collection is
            proportionate. This does not verify a document or change a score.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void post(
                `/api/hr/applications/${encodeURIComponent(applicationId)}/blocks/${encodeURIComponent(block.id)}/unlock`,
                { expectedVersion: lockVersion },
              )
            }
            className="mt-3 rounded border border-hairline-strong px-3 py-2 text-[11px] text-hi disabled:opacity-40"
          >
            Open document upload for candidate
          </button>
        </>
      )}
      {humanObservation && (
        <>
          <div className="hud-label">STRUCTURED HUMAN-STAGE OBSERVATION</div>
          <p className="mt-2 text-[11px] leading-relaxed text-mid">
            Record only observable, job-related evidence from the scheduled
            interview. This creates a source receipt; independent BARS ratings
            and the final disposition remain separate actions.
          </p>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Observed situation, candidate’s own actions, decision basis, outcome and relevant follow-up evidence…"
            className="iris-focus mt-3 min-h-28 w-full rounded border border-hairline bg-surface p-3 text-[11px] leading-relaxed text-hi placeholder:text-lo"
          />
          <button
            type="button"
            disabled={busy || notes.trim().length < 20}
            onClick={() =>
              void post(
                `/api/hr/applications/${encodeURIComponent(applicationId)}/blocks/${encodeURIComponent(block.id)}/observations`,
                { expectedVersion: lockVersion, notes },
              )
            }
            className="mt-3 rounded border border-hairline-strong px-3 py-2 text-[11px] text-hi disabled:opacity-40"
          >
            Save immutable observation receipt
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[11px] text-warn">
          {error}
        </p>
      )}
    </div>
  );
}

function Assessment({
  plan,
  runs,
  evaluation,
  reviewTargets,
  applicationId,
  lockVersion,
  currentReviewerId,
}: {
  plan?: CandidateAssessmentPlan;
  runs: AssessmentBlockRun[];
  evaluation?: CandidateEvaluation;
  reviewTargets: AssessmentReviewTargetView[];
  applicationId?: string;
  lockVersion?: number;
  currentReviewerId?: string;
}) {
  if (!plan) {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-8 text-center">
        <Layers3 className="mx-auto size-7 text-lo" />
        <p className="mt-3 text-[13px] text-mid">
          This application predates the frozen multi-stage assessment plan.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-lo">
          Its interview evidence remains available in the Interview tab and is
          evaluated only against the vacancy version stored on the application.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-hairline bg-surface p-5">
        <div className="hud-label">FROZEN EVIDENCE PLAN</div>
        <p className="mt-2 text-[12px] leading-relaxed text-mid">
          Version {plan.source.vacancyVersion} ·{" "}
          {plan.source.vacancyFingerprint.slice(0, 12)}… ·{" "}
          {plan.blocks.length} published stages. Scores shown here are
          evidence-level decision support; a named reviewer remains responsible
          for the employment decision.
        </p>
      </div>
      {plan.blocks.map((block) => {
        const run = runs.find((candidate) => candidate.blockId === block.id);
        const result = evaluation?.perBlock.find(
          (candidate) => candidate.blockId === block.id,
        );
        const scoredItems =
          result?.itemScores.filter((item) => !item.abstained) ?? [];
        const blockReviewTargets = reviewTargets.filter(
          (target) => target.binding.blockId === block.id,
        );
        const interviewKit =
          block.kind === "human_stage"
            ? (evaluation?.attributeScores ?? [])
                .filter(
                  (attribute) =>
                    attribute.abstained || attribute.confidence === "Low",
                )
                .slice(0, 6)
            : [];
        return (
          <section
            key={block.id}
            className="rounded-xl border border-hairline bg-surface p-5"
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-lo">
                  {String(block.order).padStart(2, "0")} ·{" "}
                  {block.kind.replaceAll("_", " ")}
                </div>
                <h3 className="mt-1 text-[14px] font-medium text-hi">
                  {block.title}
                </h3>
                <p className="mt-1.5 text-[11px] leading-relaxed text-mid">
                  {block.candidateIntro}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="rounded-full border border-hairline px-2.5 py-1 font-mono text-[9px] uppercase text-lo">
                  {block.required ? "required" : "optional"}
                </span>
                <span className="rounded-full border border-hairline px-2.5 py-1 font-mono text-[9px] uppercase text-lo">
                  {block.scoring.use}
                </span>
                <span className="rounded-full border border-hairline-strong px-2.5 py-1 font-mono text-[9px] uppercase text-mid">
                  {(run?.status ?? "not_started").replaceAll("_", " ")}
                </span>
              </div>
            </div>
            <div className="mt-4 grid gap-3 border-t border-hairline pt-4 sm:grid-cols-3">
              <div>
                <div className="hud-label">REVIEW MODE</div>
                <p className="mt-1 text-[11px] text-mid">
                  {block.scoring.mode.replaceAll("_", " ")}
                </p>
              </div>
              <div>
                <div className="hud-label">RESULT</div>
                <p className="mt-1 font-mono text-[11px] text-hi">
                  {!result
                    ? "NOT EVALUATED"
                    : scoredItems.length === 0
                      ? "ABSTAINED / CONTEXT"
                      : `${result.blockScore} / 100`}
                </p>
              </div>
              <div>
                <div className="hud-label">EVIDENCE</div>
                <p className="mt-1 font-mono text-[11px] text-mid">
                  {result
                    ? `${result.evidence.length} CITATIONS · ${result.confidence}`
                    : "0 CITATIONS"}
                </p>
              </div>
            </div>
            {result && result.evidence.length > 0 && (
              <div className="mt-4 space-y-2">
                {result.evidence.slice(0, 4).map((evidence) => (
                  <div
                    key={evidence.id}
                    className="rounded-lg border border-hairline bg-void2 p-3"
                  >
                    <div className="font-mono text-[9px] text-lo">
                      {evidence.blockId} · {evidence.locator}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-mid">
                      “{evidence.quote}”
                    </p>
                  </div>
                ))}
              </div>
            )}
            {interviewKit.length > 0 && (
              <div className="mt-4 rounded-lg border border-hairline bg-void2 p-4">
                <div className="hud-label">
                  EVIDENCE-GAP INTERVIEW KIT
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-lo">
                  Use neutral follow-ups to seek missing job evidence, then rate
                  against the frozen anchors. Do not coach toward an answer.
                </p>
                <ul className="mt-3 space-y-2">
                  {interviewKit.map((attribute) => (
                    <li key={attribute.id} className="text-[11px] text-mid">
                      <span className="text-hi">{attribute.name}</span>
                      {" · "}
                      {attribute.confidenceReason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <AssessmentCoordination
              block={block}
              run={run}
              applicationId={applicationId}
              lockVersion={lockVersion}
            />
            {applicationId &&
              lockVersion !== undefined &&
              currentReviewerId &&
              blockReviewTargets.map((target) => (
                <AssessmentReviewEditor
                  key={target.targetId}
                  target={target}
                  applicationId={applicationId}
                  lockVersion={lockVersion}
                  currentReviewerId={currentReviewerId}
                />
              ))}
          </section>
        );
      })}
    </div>
  );
}

function Interview({
  c,
  applicationId,
  history,
  canViewRecordings,
  focusQuestion,
}: {
  c: Candidate;
  applicationId?: string;
  history: InterviewTurn[];
  canViewRecordings: boolean;
  focusQuestion?: string;
}) {
  const evidenceLines = c.competencies.flatMap((competency) =>
    competency.evidence.map((evidence) => ({
      ...evidence,
      comp: competency.name,
    })),
  );
  const [selectedTurn, setSelectedTurn] = useState(0);
  useEffect(() => {
    if (!focusQuestion) return;
    const exactTurn = history.findIndex(
      (turn) => turn.question.trim() === focusQuestion.trim(),
    );
    if (exactTurn >= 0) setSelectedTurn(exactTurn);
  }, [focusQuestion, history]);
  const selected = history[selectedTurn];
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
      <div className="overflow-hidden rounded-xl border border-hairline bg-void2">
        <div className="flex aspect-video items-center justify-center bg-black">
          {applicationId && selected?.recordingId && canViewRecordings ? (
            <video
              key={selected.recordingId}
              controls
              playsInline
              preload="metadata"
              src={`/api/hr/applications/${encodeURIComponent(applicationId)}/recordings/${encodeURIComponent(selected.recordingId)}`}
              className="size-full bg-black object-contain"
            />
          ) : (
            <div className="max-w-md px-8 text-center">
              <Video className="mx-auto size-9 text-lo" />
              <div className="hud-label mt-3">
                 {selected
                  ? selected.recordingId && !canViewRecordings
                    ? "RECORDING ACCESS RESTRICTED"
                    : "TEXT ACCOMMODATION · NO VIDEO ATTACHED"
                  : "NO REPOSITORY RECORDING AVAILABLE"}
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-mid">
                {selected?.answer ??
                  "No recorded response is linked to this evidence view."}
              </p>
            </div>
          )}
        </div>
        {selected && (
          <div className="border-t border-hairline p-4">
            <div className="font-mono text-[10px] text-irisc">
              QUESTION {selectedTurn + 1} · {selected.topic.toUpperCase()}
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-hi">
              {selected.question}
            </p>
          </div>
        )}
      </div>
      <div className="rounded-xl border border-hairline bg-surface p-5">
        <div className="hud-label mb-3">REVIEWED TRANSCRIPT · PER QUESTION</div>
        <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
          {history.map((turn, index) => (
            <button
              key={`${turn.topic}-${index}`}
              type="button"
              aria-pressed={selectedTurn === index}
              onClick={() => setSelectedTurn(index)}
              className={`block w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                selectedTurn === index
                  ? "bg-irisa/10"
                  : "hover:bg-white/[0.02]"
              }`}
            >
              <div className="font-mono text-[10px] text-lo">
                Q{index + 1} · {turn.topic.toUpperCase()} ·{" "}
                {turn.recordingId ? "VIDEO" : "TEXT"}
              </div>
              <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-mid">
                {turn.answer || "Awaiting answer"}
              </p>
            </button>
          ))}
          {history.length === 0 &&
            evidenceLines.map((line, index) => (
              <div
                key={`${line.comp}-${index}`}
                className="rounded-lg border border-hairline bg-void2 px-3 py-2.5"
              >
                <div className="font-mono text-[10px] text-lo">
                  EVIDENCE EXCERPT · {line.comp.toUpperCase()}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-mid">
                  “{line.quote}”
                </p>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function Documents({
  claims,
}: {
  claims: CandidateEvaluation["claims"];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
      {claims.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline">
                {["CLAIM", "STATUS", "SOURCE", "MATERIAL"].map((heading) => (
                  <th key={heading} className="hud-label px-5 py-3 font-normal">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id} className="border-b border-hairline last:border-0">
                  <td className="px-5 py-3.5 text-hi">{claim.text}</td>
                  <td className="px-5 font-mono text-[11px] text-mid">
                    {claim.status}
                  </td>
                  <td className="px-5 font-mono text-[10px] text-lo">
                    {claim.sourceBlockId}
                  </td>
                  <td className="px-5 text-mid">{claim.material ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center">
          <FileCheck2 className="mx-auto size-7 text-lo" />
          <p className="mt-3 text-[13px] text-mid">
            No document-backed claims are available for this application.
          </p>
        </div>
      )}
      <p className="border-t border-hairline px-5 py-3.5 font-mono text-[10px] tracking-[0.04em] text-lo">
        UNVERIFIED CLAIMS DO NOT BECOME FACTS · A HUMAN REVIEWS MATERIAL MISMATCHES
      </p>
    </div>
  );
}

function Audit({ c }: { c: Candidate }) {
  if (c.audit.length === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-8 text-center">
        <p className="text-[13px] text-mid">
          No application audit entries were loaded for this record.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-lo">
          Decision history remains visible in the human-decision inspector. Do
          not infer chain verification from an empty view.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
      <table className="min-w-[980px] w-full text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-hairline">
            {["ID", "TIMESTAMP", "ACTOR", "ACTION", "TARGET", "REASON", "VERSIONS", "PREV-HASH"].map((h) => (
              <th key={h} className="hud-label whitespace-nowrap px-4 py-3 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {c.audit.map((a) => (
            <tr key={a.id} className="border-b border-hairline last:border-b-0">
              <td className="px-4 py-3 font-mono text-[11px] text-lo">{a.id}</td>
              <td className="px-4 font-mono text-[11px] text-mid">{a.timestamp}</td>
              <td className="px-4 text-mid">{a.actor}</td>
              <td className={`px-4 font-mono text-[11px] ${a.action === "OVERRIDDEN" ? "text-ember" : a.action === "APPROVED" ? "text-pos" : "text-mid"}`}>{a.action}</td>
              <td className="px-4 text-mid">{a.target}</td>
              <td className="max-w-[240px] px-4 text-[12px] text-lo">{a.reason ?? "—"}</td>
              <td className="px-4 font-mono text-[10px] text-lo">{a.modelVer}</td>
              <td className="px-4 font-mono text-[10px] text-lo">{a.hash}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-hairline px-4 py-3 font-mono text-[10.5px] tracking-[0.04em] text-lo">
        APPEND-ONLY · EACH ENTRY HASHES THE PREVIOUS · TAMPER-EVIDENT
      </p>
    </div>
  );
}

interface ScorecardProps {
  candidate: Candidate;
  threshold: number;
  vacancyTitle: string;
  vacancyVersion: number;
  applicationId?: string;
  lockVersion?: number;
  stage?: ApplicationStage;
  interviewHistory: InterviewTurn[];
  assessmentPlan?: CandidateAssessmentPlan;
  assessmentRuns?: AssessmentBlockRun[];
  evaluation?: CandidateEvaluation;
  decisionHistory: DecisionRecord[];
  canFinalize: boolean;
  canViewRecordings: boolean;
  requiredIndependentReviews?: 1 | 2 | 3;
  currentReviewerId?: string;
  currentReviewerName?: string;
  currentReviewerRole?: string;
  assessmentReviewTargets?: AssessmentReviewTargetView[];
}

/* ---------- the page ---------- */
export default function Scorecard({
  candidate,
  threshold,
  vacancyTitle,
  vacancyVersion,
  applicationId,
  lockVersion,
  stage,
  interviewHistory,
  assessmentPlan,
  assessmentRuns = [],
  evaluation,
  decisionHistory,
  canFinalize,
  canViewRecordings,
  requiredIndependentReviews = 1,
  currentReviewerId,
  currentReviewerName,
  currentReviewerRole,
  assessmentReviewTargets = [],
}: ScorecardProps) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [transcriptTarget, setTranscriptTarget] = useState<string>();
  const incomplete =
    candidate.evaluationComplete === false ||
    candidate.tier === null ||
    candidate.rank === null;
  return (
    <div className="contour-bg flex min-h-[calc(100vh-52px)] flex-col gap-6 p-4 sm:p-6 xl:flex-row xl:p-8">
      <div className="min-w-0 flex-1">
        {/* header */}
        <div className="mb-5 flex flex-wrap items-end gap-4">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-irisc">
              AI evidence review · {vacancyTitle} · role v{vacancyVersion}
            </div>
            <h1 className="mt-1 font-display text-[24px] font-medium tracking-[-0.015em] text-hi">
              Candidate {candidate.internalId}
            </h1>
          </div>
          {incomplete || candidate.tier === null ? (
            <StatusPill label="NEEDS REVIEW" />
          ) : (
            <TierBadge tier={candidate.tier} />
          )}
          <span className="tnum font-mono text-[13px] text-mid">
            RANK{" "}
            {incomplete || candidate.rank === null
              ? "—"
              : String(candidate.rank).padStart(2, "0")}
          </span>
          <span className="tnum ml-auto text-right font-display text-[24px] font-medium text-hi">
            {candidate.overall}
            <span className="ml-2 font-mono text-[9px] font-normal text-lo">
              / 100 EVIDENCE ALIGNMENT ·{" "}
              {incomplete
                ? `LOWER BOUND · ${candidate.evaluationCoverage ?? 0}% COVERAGE`
                : `THRESHOLD ${threshold}`}
            </span>
          </span>
        </div>

        {/* tab bar */}
        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-hairline">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative px-4 pb-3 text-[13px] transition-colors ${tab === t ? "text-hi" : "text-lo hover:text-mid"}`}
            >
              {t}
              {tab === t && <span className="absolute inset-x-2 bottom-0 h-[2px] iris-line" />}
            </button>
          ))}
        </div>

        {tab === "Overview" && (
          <Overview
            c={candidate}
            stage={stage}
            evaluation={evaluation}
            threshold={threshold}
            vacancyTitle={vacancyTitle}
            vacancyVersion={vacancyVersion}
          />
        )}
        {tab === "Competencies" && (
          <div className="space-y-3">
            {candidate.competencies.map((comp, index) => (
              <CompetencyBlock
                key={comp.id}
                comp={comp}
                threshold={threshold}
                defaultOpen={index === 0}
                onOpenTranscript={(evidence) => {
                  setTranscriptTarget(evidence.question);
                  setTab(
                    interviewHistory.length > 0 ? "Interview" : "Assessment",
                  );
                }}
              />
            ))}
          </div>
        )}
        {tab === "Assessment" && (
          <Assessment
            plan={assessmentPlan}
            runs={assessmentRuns}
            evaluation={evaluation}
            reviewTargets={assessmentReviewTargets}
            applicationId={applicationId}
            lockVersion={lockVersion}
            currentReviewerId={currentReviewerId}
          />
        )}
        {tab === "Interview" && (
          <Interview
            c={candidate}
            applicationId={applicationId}
            history={interviewHistory}
            canViewRecordings={canViewRecordings}
            focusQuestion={transcriptTarget}
          />
        )}
        {tab === "Documents" && <Documents claims={evaluation?.claims ?? []} />}
        {tab === "Audit" && <Audit c={candidate} />}
      </div>

      <HitlInspector
        applicationId={applicationId}
        lockVersion={lockVersion}
        stage={stage}
        initialHistory={decisionHistory}
        canFinalize={canFinalize}
        requiredIndependentReviews={requiredIndependentReviews}
        currentReviewerId={currentReviewerId}
        currentReviewerName={currentReviewerName}
        currentReviewerRole={currentReviewerRole}
      />
    </div>
  );
}
