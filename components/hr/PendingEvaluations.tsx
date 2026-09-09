"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileSearch, LoaderCircle, Play } from "lucide-react";

interface PendingApplication {
  id: string;
  internalCandidateId: string;
  stage: string;
  lockVersion: number;
  createdAt: string;
}

export default function PendingEvaluations({
  applications,
  canEvaluate,
  canReviewTranscripts,
  vacancyId,
}: {
  applications: PendingApplication[];
  canEvaluate: boolean;
  canReviewTranscripts: boolean;
  vacancyId: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (applications.length === 0) return null;

  const evaluate = async (application: PendingApplication) => {
    if (running || application.stage === "in_progress") return;
    setRunning(application.id);
    setError("");
    try {
      const response = await fetch(
        `/api/hr/applications/${encodeURIComponent(application.id)}/evaluate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: application.lockVersion }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Evaluation could not be completed.");
      }
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Evaluation could not be completed.",
      );
    } finally {
      setRunning(null);
    }
  };

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-hairline bg-surface">
      <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
        <div>
          <h2 className="text-[14px] font-medium text-hi">
            Ready for evidence analysis
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-mid">
            The submitted interview is ready to compare with the vacancy&apos;s
            frozen requirements. A reviewer starts the analysis; every outcome
            still requires a named human action.
          </p>
        </div>
        <span className="font-mono text-[10px] text-lo">
          {applications.length} PENDING
        </span>
      </div>
      <div className="divide-y divide-hairline">
        {applications.map((application) => {
          const ready = application.stage !== "in_progress";
          return (
            <div
              key={application.id}
              data-application-id={application.id}
              className="flex flex-wrap items-center gap-4 px-5 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[12px] text-hi">
                  {application.internalCandidateId}
                </div>
                <div className="mt-1 font-mono text-[9px] uppercase text-lo">
                  {application.stage.replaceAll("_", " ")} ·{" "}
                  {new Date(application.createdAt).toLocaleString()}
                </div>
              </div>
              {ready && canReviewTranscripts && (
                <Link
                  href={`/vacancies/${encodeURIComponent(vacancyId)}/applications/${encodeURIComponent(application.id)}/transcripts`}
                  aria-label="Review transcripts"
                  className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3.5 py-2 text-[12px] text-mid hover:text-hi"
                >
                  <FileSearch className="size-3.5" />
                  Verify transcript
                </Link>
              )}
              <button
                type="button"
                aria-label="Evaluate submitted evidence"
                disabled={!ready || !canEvaluate || running !== null}
                onClick={() => void evaluate(application)}
                title={
                  !canEvaluate
                    ? "Your role cannot run an evaluation."
                    : !ready
                      ? "The candidate is still interviewing."
                      : undefined
                }
                className="flex items-center gap-2 rounded-lg border border-hairline-strong bg-surface2 px-3.5 py-2 text-[12px] text-hi disabled:cursor-not-allowed disabled:opacity-35"
              >
                {running === application.id ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
                {ready ? "Analyze candidate evidence" : "Assessment in progress"}
              </button>
            </div>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="border-t border-warn/20 px-5 py-3 text-[11px] text-warn">
          {error}
        </p>
      )}
    </section>
  );
}
