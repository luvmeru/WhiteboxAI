import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { Candidate } from "@/lib/types";
import { StatusPill } from "@/components/ui/primitives";

export default function IneligibleEvaluations({
  candidates,
  vacancyId,
}: {
  candidates: Candidate[];
  vacancyId: string;
}) {
  if (candidates.length === 0) return null;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-warn/25 bg-surface">
      <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-[14px] font-medium text-hi">
            <AlertTriangle className="size-4 text-warn" />
            Evidence review queue
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-mid">
            These applications stay outside the ranking until required evidence
            and governed review are complete. Missing evidence is never treated
            as a failed requirement.
          </p>
        </div>
        <span className="font-mono text-[10px] text-warn">
          {candidates.length} TO REVIEW
        </span>
      </div>
      <div className="divide-y divide-hairline">
        {candidates.map((candidate) => (
          <div
            key={candidate.internalId}
            className="flex flex-wrap items-center gap-4 px-5 py-3.5"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/vacancies/${encodeURIComponent(vacancyId)}/candidates/${encodeURIComponent(candidate.internalId)}`}
                className="font-mono text-[12px] text-hi hover:underline"
              >
                {candidate.internalId}
              </Link>
              <div className="mt-1 font-mono text-[9px] uppercase text-lo">
                APPLIED {candidate.appliedAt} ·{" "}
                {candidate.evaluationCoverage ?? 0}% EVIDENCE COVERAGE
              </div>
            </div>
            <StatusPill label="HUMAN REVIEW" />
            <Link
              href={`/vacancies/${encodeURIComponent(vacancyId)}/candidates/${encodeURIComponent(candidate.internalId)}`}
              className="rounded-lg border border-hairline bg-surface px-3.5 py-2 text-[12px] text-mid hover:text-hi"
            >
              Review evidence
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
