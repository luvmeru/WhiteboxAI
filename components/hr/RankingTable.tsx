"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Flag,
  Columns3,
  ListFilter,
  Target,
  ShieldCheck,
} from "lucide-react";
import type { Candidate } from "@/lib/types";
import { ConfidenceBadge, MiniScores, ScoreCell, StatusPill, TierBadge } from "@/components/ui/primitives";

interface RankingTableProps {
  candidates: Candidate[];
  threshold: number;
  vacancyId: string;
  vacancyTitle: string;
  vacancyVersion: number;
  totalApplications: number;
  pendingEvaluations: number;
}

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function CompetencySummary({
  competencies,
  threshold,
}: {
  competencies: Candidate["competencies"];
  threshold: number;
}) {
  const scored = competencies.filter((competency) => !competency.abstained);
  const abstained = competencies.filter((competency) => competency.abstained);
  return (
    <div className="flex items-center gap-2">
      {scored.length > 0 && (
        <MiniScores
          scores={scored.map((competency) => ({
            name: competency.name,
            score: competency.score,
          }))}
          threshold={threshold}
        />
      )}
      {abstained.length > 0 && (
        <span
          className="font-mono text-[9px] text-warn"
          title={abstained
            .map((competency) => `${competency.name}: NOT SCORED`)
            .join(" · ")}
        >
          {abstained.length} NOT SCORED
        </span>
      )}
    </div>
  );
}

export default function RankingTable({
  candidates,
  threshold,
  vacancyId,
  vacancyTitle,
  vacancyVersion,
  totalApplications,
  pendingEvaluations,
}: RankingTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tier, setTier] = useState<"All" | "Top" | "Mid" | "Bottom">("All");
  const [aboveThreshold, setAboveThreshold] = useState(false);
  const [verification, setVerification] = useState<"All" | "VERIFIED" | "PENDING">("All");
  const [showCompetencies, setShowCompetencies] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const aboveRoleThreshold = candidates.filter(
    (candidate) =>
      candidate.evaluationComplete !== false && candidate.overall >= threshold,
  ).length;
  const highConfidence = candidates.filter(
    (candidate) => candidate.confidence === "High",
  ).length;
  const verifiedClaims = candidates.filter(
    (candidate) => candidate.verification === "VERIFIED",
  ).length;

  const filteredCandidates = candidates.filter((c) =>
    (tier === "All" ||
      (c.evaluationComplete !== false && c.tier === tier)) &&
    (!aboveThreshold ||
      (c.evaluationComplete !== false && c.overall >= threshold)) &&
    (verification === "All" || c.verification === verification),
  );
  const totalPages = Math.max(
    1,
    Math.ceil(filteredCandidates.length / rowsPerPage),
  );
  const visibleCandidates = filteredCandidates.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage,
  );

  useEffect(() => {
    setPage(1);
  }, [tier, aboveThreshold, verification, rowsPerPage]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });

  const exportSelected = () => {
    const rows = candidates.filter((c) => selected.has(c.internalId));
    const csv = [
      "candidate,complete,coverage,lower_bound,overall,tier,confidence",
      ...rows.map((candidate) => {
        const complete = candidate.evaluationComplete !== false;
        return [
          candidate.internalId,
          complete,
          candidate.evaluationCoverage ?? (complete ? 100 : 0),
          complete ? "" : candidate.overall,
          complete ? candidate.overall : "",
          complete ? (candidate.tier ?? "UNAVAILABLE") : "NEEDS_REVIEW",
          candidate.confidence,
        ].map(csvCell).join(",");
      }),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "whitebox-candidates.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${rows.length} candidate record${rows.length === 1 ? "" : "s"}.`);
  };

  return (
    <div>
      <section className="mb-5 overflow-hidden rounded-xl border border-hairline bg-surface">
        <div className="flex flex-col gap-4 border-b border-hairline px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-irisc">
              <Target className="size-3.5" />
              Evidence alignment to the frozen role
            </div>
            <h2 className="mt-1.5 text-[16px] font-medium text-hi">
              {vacancyTitle}
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-mid">
              Every candidate is compared with vacancy version {vacancyVersion}{" "}
              using the same published rubric. Rankings include complete
              evaluations only; a named reviewer makes the hiring decision.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-pos/20 bg-pos/[0.05] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-pos">
            <ShieldCheck className="size-3.5" />
            Version {vacancyVersion} locked
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-hairline sm:grid-cols-4 sm:divide-y-0">
          {[
            ["COMPLETE REVIEWS", candidates.length],
            [`AT OR ABOVE ${threshold}`, aboveRoleThreshold],
            ["HIGH CONFIDENCE", highConfidence],
            ["VERIFIED CLAIMS", verifiedClaims],
          ].map(([label, value]) => (
            <div key={label} className="px-4 py-3.5">
              <div className="tnum font-display text-[22px] font-medium text-hi">
                {value}
              </div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-lo">
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="relative flex flex-wrap items-center gap-2.5 pb-4">
        <label className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-[12px] text-mid">
          Tier
          <select aria-label="Filter by tier" value={tier} onChange={(event) => setTier(event.target.value as typeof tier)} className="bg-transparent text-hi outline-none">
            <option>All</option><option>Top</option><option>Mid</option><option>Bottom</option>
          </select>
        </label>
        <button aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)} className={`flex items-center gap-1.5 rounded-lg border bg-surface px-3 py-1.5 text-[12px] ${aboveThreshold || verification !== "All" ? "border-irisb/50 text-hi" : "border-hairline text-mid"}`}><ListFilter className="size-3" />More filters</button>
        {filtersOpen && (
          <div className="absolute left-24 top-9 z-20 w-56 rounded-xl border border-hairline-strong bg-surface2 p-3 shadow-2xl">
            <button onClick={() => setAboveThreshold((value) => !value)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[12px] ${aboveThreshold ? "bg-white/5 text-hi" : "text-mid hover:bg-white/[0.03]"}`}><span>Score at least {threshold}</span><span>{aboveThreshold ? "✓" : ""}</span></button>
            <label className="mt-1 flex items-center justify-between rounded-lg px-3 py-2 text-[12px] text-mid">
              Verification
              <select aria-label="Filter by verification" value={verification} onChange={(event) => setVerification(event.target.value as typeof verification)} className="bg-transparent text-hi outline-none">
                <option>All</option><option>VERIFIED</option><option>PENDING</option>
              </select>
            </label>
          </div>
        )}
        <button onClick={() => setShowCompetencies((value) => !value)} className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-[12px] text-mid hover:text-hi"><Columns3 className="size-3" />{showCompetencies ? "Hide scores" : "Show scores"}</button>
        <span className="w-full text-[11px] text-lo sm:ml-auto sm:w-auto">
          {filteredCandidates.length} candidates · evidence-complete reviews
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface/80">
        <table className="min-w-[920px] w-full text-left text-[13px]">
          <thead><tr className="border-b border-hairline">
            {["", "RANK", "INTERNAL ID", "ALIGNMENT"].map((heading, index) => <th key={`primary-${index}`} className="hud-label whitespace-nowrap px-3 py-3 font-normal first:w-8 first:pl-4">{heading}</th>)}
            {showCompetencies && <th className="hud-label whitespace-nowrap px-3 py-3 font-normal">COMPETENCIES</th>}
            {["EVIDENCE CONF.", "BAND", "VERIFICATION", "HUMAN OVERRIDE", ""].map((heading, index) => <th key={`detail-${index}`} className="hud-label whitespace-nowrap px-3 py-3 font-normal">{heading}</th>)}
          </tr></thead>
          <tbody>
            {visibleCandidates.map((c) => {
              const isOpen = expanded === c.internalId;
              const isSel = selected.has(c.internalId);
              return (
                <FragmentRow key={c.internalId}>
                  <tr data-application-id={c.applicationId} className={`group relative border-b border-hairline transition-colors hover:bg-white/[0.025] ${isSel ? "bg-white/[0.03]" : ""}`}>
                    <td className="py-3 pl-4 pr-3">{isSel && <span className="absolute inset-y-0 left-0 w-[2px] iris-line" />}<input type="checkbox" checked={isSel} onChange={() => toggle(c.internalId)} className="size-3.5 accent-white/80" aria-label={`select ${c.internalId}`} /></td>
                    <td className="tnum px-3 font-mono text-lo">
                      {c.rank === null
                        ? "—"
                        : String(c.rank).padStart(2, "0")}
                    </td>
                    <td className="px-3"><Link href={`/vacancies/${vacancyId}/candidates/${c.internalId}`} className="font-mono text-hi hover:underline">{c.internalId}</Link></td>
                    <td className="px-3">
                      {c.evaluationComplete === false ? (
                        <span className="font-mono text-[10px] text-warn">
                          {c.overall} LOWER BOUND · {c.evaluationCoverage ?? 0}%
                          COVERAGE
                        </span>
                      ) : (
                        <ScoreCell score={c.overall} threshold={threshold} />
                      )}
                    </td>
                    {showCompetencies && (
                      <td className="px-3">
                        <CompetencySummary
                          competencies={c.competencies}
                          threshold={threshold}
                        />
                      </td>
                    )}
                    <td className="px-3"><ConfidenceBadge band={c.confidence} compact /></td>
                    <td className="px-3">
                      {c.evaluationComplete === false || c.tier === null ? (
                        <StatusPill label="NEEDS REVIEW" />
                      ) : (
                        <TierBadge tier={c.tier} />
                      )}
                    </td>
                    <td className="px-3"><StatusPill label={c.verification} /></td>
                    <td className="px-3">{c.divergence && <Flag className="size-3.5 text-ember" aria-label="human overrode AI" />}</td>
                    <td className="px-3"><button onClick={() => setExpanded(isOpen ? null : c.internalId)} className="rounded p-1 text-lo hover:bg-white/5 hover:text-hi" aria-label={`expand ${c.internalId}`}>{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button></td>
                  </tr>
                  {isOpen && <tr className="border-b border-hairline bg-void2/60"><td colSpan={showCompetencies ? 10 : 9} className="px-6 py-4"><div className="grid grid-cols-5 gap-4">{c.competencies.map((k) => <div key={k.id} className="rounded-lg border border-hairline bg-surface p-3.5"><div className="flex items-baseline justify-between gap-3"><span className="text-[12px] text-mid">{k.name}</span><span className={`tnum whitespace-nowrap font-mono ${k.abstained ? "text-[10px] text-warn" : `text-[13px] ${k.score >= threshold ? "text-hi" : "text-lo"}`}`}>{k.abstained ? "NOT SCORED" : k.score}</span></div>{!k.abstained && <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full" style={{ width: `${k.score}%`, background: k.score >= threshold ? "var(--iris-gradient)" : "var(--line-mid)" }} /></div>}<div className="mt-2"><ConfidenceBadge band={k.confidence} compact /></div></div>)}</div></td></tr>}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
        {filteredCandidates.length === 0 && <div className="p-10 text-center text-[12px] text-lo">No candidates match the active filters.</div>}
        <div className="flex items-center justify-between border-t border-hairline px-4 py-3">
          <span className="hud-label">
            SHOWING {filteredCandidates.length === 0 ? 0 : (page - 1) * rowsPerPage + 1}–
            {Math.min(page * rowsPerPage, filteredCandidates.length)} OF{" "}
            {filteredCandidates.length} FILTERED · {candidates.length}{" "}
            EVALUATED · {totalApplications} APPLICATIONS
            {pendingEvaluations > 0 ? ` · ${pendingEvaluations} AWAITING EVALUATION` : ""} · {rowsPerPage} ROW VIEW
          </span>
          <div className="flex items-center gap-1.5 font-mono text-[12px] text-mid">
            <span className="text-lo">ROWS</span>
            {[25, 50, 100].map((n) => <button key={n} onClick={() => setRowsPerPage(n)} className={`rounded px-2 py-0.5 ${rowsPerPage === n ? "bg-white/5 text-hi" : "hover:text-hi"}`}>{n}</button>)}
            <span className="mx-2 h-4 w-px bg-hairline-strong" />
            <button
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded px-2 py-0.5 disabled:opacity-30"
            >
              ‹
            </button>
            <span className="text-hi">{page}</span>
            <span className="text-lo">/ {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              className="rounded px-2 py-0.5 disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {selected.size > 0 && <div className="fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-xl border border-hairline-strong bg-surface2 px-5 py-3 shadow-2xl sm:bottom-6"><span className="tnum font-mono text-[12px] text-hi">{selected.size} SELECTED</span><span className="h-4 w-px bg-hairline-strong" /><button onClick={exportSelected} className="rounded border border-hairline px-3 py-1.5 text-[13px] text-mid hover:text-hi">Export reviewed data</button><button onClick={() => setSelected(new Set())} className="ml-1 text-[12px] text-lo hover:text-hi">Clear</button></div>}
      {notice && <button onClick={() => setNotice("")} className="fixed bottom-6 right-6 z-40 rounded-xl border border-pos/30 bg-surface2 px-4 py-3 text-[12px] text-pos">{notice} ×</button>}
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
