"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Cube } from "@/components/ui/primitives";
import {
  buildCandidateJourneySteps,
  candidateAssessmentPercent,
  candidateContinuation,
  type CandidateAssessmentSnapshot,
  type CandidateJourneyStep,
} from "@/lib/candidate-assessment-view";

interface CandidateSnapshot {
  id: string;
  title: string;
  code: string;
  stage: string;
  progress: number;
  consentAt?: string | null;
  assessment?: CandidateAssessmentSnapshot;
  candidateRejectionTexts?: string[];
}

const FINAL_STAGES = new Set([
  "shortlisted",
  "invited",
  "offer",
  "hired",
  "not_moving_forward",
  "knocked_out",
  "withdrawn",
]);

function statusCopy(application: CandidateSnapshot): {
  eyebrow: string;
  title: string;
  body: string;
} {
  const current = application.assessment?.currentBlock;
  if (application.stage === "in_progress") {
    if (application.assessment && !application.consentAt) {
      return {
        eyebrow: "Published plan ready",
        title: "Review your assessment plan",
        body:
          "The exact vacancy version, stages, AI notice and retention period are ready for your review before any evidence is collected.",
      };
    }
    return {
      eyebrow: current ? "Your next stage" : "Application in progress",
      title: current?.title ?? "Continue your structured interview",
      body:
        current?.candidateIntro ??
        "Your secure interview is still open. Unfinished evidence is never treated as a hiring decision.",
    };
  }
  if (application.stage === "shortlisted") {
    return {
      eyebrow: "Human-reviewed outcome",
      title: "You have been shortlisted",
      body:
        "A named reviewer advanced your application. The hiring team will contact you with the next step.",
    };
  }
  if (application.stage === "invited") {
    return {
      eyebrow: "Human-reviewed outcome",
      title: "You are invited to the next stage",
      body:
        "Follow the scheduling or preparation instructions sent by the hiring organization.",
    };
  }
  if (application.stage === "offer") {
    return {
      eyebrow: "Human-reviewed outcome",
      title: "An offer stage was recorded",
      body:
        "The hiring organization will provide the formal details directly. This status page is not an employment contract.",
    };
  }
  if (application.stage === "hired") {
    return {
      eyebrow: "Human-reviewed outcome",
      title: "Your application was marked hired",
      body:
        "The hiring organization will contact you with onboarding information.",
    };
  }
  if (
    application.stage === "not_moving_forward" ||
    application.stage === "knocked_out"
  ) {
    return {
      eyebrow: "Human-reviewed outcome",
      title: "Your application will not move forward",
      body:
        application.candidateRejectionTexts?.length
          ? "A named reviewer recorded the final outcome. The published eligibility explanation is shown below; you may ask the hiring organization about its available appeal process."
          : "You may ask the hiring organization for its available explanation or appeal process.",
    };
  }
  if (application.stage === "withdrawn") {
    return {
      eyebrow: "Application closed",
      title: "Your application is withdrawn",
      body:
        "No further hiring action will be taken unless the hiring organization confirms a new application.",
    };
  }
  if (application.stage === "needs_adjudication") {
    return {
      eyebrow: "Named review required",
      title: "The application is paused for human review",
      body:
        "A reviewer must resolve an evidence, eligibility or process question. No automated rejection has occurred.",
    };
  }
  if (application.stage === "under_review") {
    return {
      eyebrow: "Hiring-team stage",
      title: current?.title ?? "Your evidence is under review",
      body: current
        ? `${current.candidateIntro} The hiring team now owns the next action.`
        : "AI may structure job-related evidence, while named human reviewers retain every final employment decision.",
    };
  }
  return {
    eyebrow: "Evidence submitted",
    title: "Candidate-controlled stages are complete",
    body:
      "Your submitted evidence is waiting for the configured verification and named human review.",
  };
}

function stepIcon(step: CandidateJourneyStep) {
  if (step.candidateComplete) {
    return <Check className="size-3.5 text-pos" />;
  }
  if (step.state === "current") {
    return <ChevronRight className="size-3.5 text-hi" />;
  }
  if (step.state === "employer_action_required") {
    return <AlertTriangle className="size-3.5 text-warn" />;
  }
  if (
    step.state === "awaiting_review" ||
    step.state === "awaiting_verification" ||
    step.state === "awaiting_external_participants"
  ) {
    return <Clock3 className="size-3.5 text-mid" />;
  }
  return <Circle className="size-3.5 text-lo" />;
}

function StatusContent() {
  const params = useSearchParams();
  const applicationId = params.get("applicationId") ?? "";
  const requestedCode = params.get("code") ?? "";
  const [application, setApplication] = useState<CandidateSnapshot | null>(
    null,
  );
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!applicationId) {
      setLoadError("Open this page from your secure application session.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(
        `/api/candidate/applications/${encodeURIComponent(applicationId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as {
        application?: CandidateSnapshot;
        error?: string;
      };
      if (!response.ok || !body.application) {
        throw new Error(
          response.status === 401
            ? "This browser does not have the secure application session. Return to the code page and enter the code here."
            : body.error || "Your application status could not be loaded.",
        );
      }
      setApplication(body.application);
    } catch (reason) {
      setLoadError(
        reason instanceof Error
          ? reason.message
          : "Your application status could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const steps = useMemo(
    () =>
      application?.assessment
        ? buildCandidateJourneySteps(application.assessment)
        : [],
    [application],
  );
  const continuation = application
    ? candidateContinuation({
        applicationId: application.id,
        code: application.code || requestedCode,
        stage: application.stage,
        consentAt: application.consentAt,
        assessment: application.assessment,
      })
    : null;
  const percent = application?.assessment
    ? candidateAssessmentPercent(application.assessment)
    : application
      ? Math.round(Math.max(0, Math.min(1, application.progress || 0)) * 100)
      : 0;

  if (loading && !application) {
    return (
      <div className="grid flex-1 place-items-center">
        <LoaderCircle className="size-6 animate-spin text-mid" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 text-center">
        <ShieldCheck className="size-8 text-mid" />
        <h1 className="mt-4 font-display text-[25px] text-hi">
          Secure session required
        </h1>
        <p role="alert" className="mt-3 text-[13px] leading-relaxed text-mid">
          {loadError}
        </p>
        <Link
          href="/"
          className="mt-5 rounded-lg border border-hairline-strong px-4 py-2 text-[13px] text-hi"
        >
          Return to code entry
        </Link>
      </div>
    );
  }

  const copy = statusCopy(application);
  const code = application.code || requestedCode;
  const decisionRecorded = FINAL_STAGES.has(application.stage);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-5 pb-14 pt-5 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="hud-label">
          {code} · {application.title.toUpperCase()}
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-lg border border-hairline px-3 py-2 font-mono text-[9px] uppercase tracking-[.07em] text-mid disabled:opacity-40"
        >
          {loading ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Refresh status
        </button>
      </div>

      <section className="mt-8 grid items-center gap-7 lg:grid-cols-[150px_minmax(0,1fr)]">
        <div className="flex justify-center lg:justify-start">
          <Cube size={112} />
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[.1em] text-lo">
            {copy.eyebrow}
          </div>
          <h1 className="mt-3 font-display text-[clamp(27px,4vw,40px)] font-medium tracking-[-0.02em] text-hi">
            {copy.title}
          </h1>
          <p className="mt-3 max-w-[66ch] text-[14px] leading-relaxed text-mid">
            {copy.body}
          </p>
          {application.candidateRejectionTexts &&
            application.candidateRejectionTexts.length > 0 && (
              <div className="mt-4 max-w-[66ch] rounded-lg border border-hairline bg-surface p-4">
                <div className="font-mono text-[9px] uppercase tracking-[.08em] text-lo">
                  Published eligibility explanation
                </div>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-hi">
                  {application.candidateRejectionTexts.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </div>
            )}
          {continuation && (
            <Link
              href={continuation.href}
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-hairline-strong bg-surface2 px-5 py-2.5 text-[13px] text-hi"
            >
              {continuation.label}
              <ArrowRight className="size-4" />
            </Link>
          )}
          {loadError && (
            <p role="alert" className="mt-3 text-[12px] text-warn">
              {loadError}
            </p>
          )}
        </div>
      </section>

      {application.assessment ? (
        <section className="mt-10 overflow-hidden rounded-xl border border-hairline bg-surface">
          <div className="border-b border-hairline p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[.08em] text-lo">
                  Frozen assessment · vacancy version{" "}
                  {application.assessment.plan.source.vacancyVersion}
                </div>
                <h2 className="mt-2 text-[17px] text-hi">
                  Your published stages
                </h2>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[.07em] text-mid">
                {application.assessment.completed} /{" "}
                {application.assessment.total} candidate stages · {percent}%
              </div>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-pos transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div>
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`grid gap-3 border-b border-hairline px-4 py-4 last:border-b-0 sm:grid-cols-[28px_minmax(0,1fr)_auto] ${
                  step.active ? "bg-white/[.025]" : ""
                }`}
              >
                <span className="mt-0.5 flex size-7 items-center justify-center rounded-full border border-hairline-strong">
                  {stepIcon(step)}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] text-hi">
                      {index + 1}. {step.title}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[.06em] text-lo">
                      {step.required ? "required" : "optional"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-mid">
                    {step.candidateIntro}
                  </p>
                  <div className="mt-2 font-mono text-[9px] uppercase tracking-[.06em] text-lo">
                    {step.deliveryLabel} · {step.estimatedMinutes} min
                  </div>
                </div>
                <div
                  className={`h-fit rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[.05em] ${
                    step.state === "current"
                      ? "border-hairline-strong text-hi"
                      : step.state === "employer_action_required"
                        ? "border-warn/40 text-warn"
                        : step.candidateComplete
                          ? "border-pos/30 text-pos"
                          : "border-hairline text-lo"
                  }`}
                >
                  {step.stateLabel}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-3 border-t border-hairline-strong bg-void2 px-5 py-4">
            {decisionRecorded ? (
              <Check className="mt-0.5 size-4 text-pos" />
            ) : (
              <ShieldCheck className="mt-0.5 size-4 text-mid" />
            )}
            <div>
              <div className="text-[12.5px] text-hi">
                {decisionRecorded
                  ? "Named human outcome recorded"
                  : "Final employment decision · named human reviewer"}
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-mid">
                Deterministic keys may structure evidence or flag a gate, but
                they do not independently reject, shortlist or hire.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-10 rounded-xl border border-hairline bg-surface p-5">
          <div className="font-mono text-[10px] uppercase tracking-[.08em] text-lo">
            Historical application route
          </div>
          <h2 className="mt-2 text-[16px] text-hi">
            Published structured interview
          </h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-mid">
            This application predates multi-stage plans. Its original frozen
            interview remains unchanged and every final decision remains with a
            human reviewer.
          </p>
        </section>
      )}

      <div className="wb grain relative mt-6 overflow-hidden rounded-xl p-5">
        <div
          className="font-mono text-[10px] uppercase tracking-[0.1em]"
          style={{ color: "var(--text-lo)" }}
        >
          Inside the white box
        </div>
        <ul
          className="mt-3 space-y-2 text-[12.5px] leading-relaxed"
          style={{ color: "var(--wb-text)" }}
        >
          <li>· The status comes from your frozen assessment plan and its recorded block runs.</li>
          <li>· Missing or contradictory evidence routes to review; it is not silently converted to zero.</li>
          <li>· Appearance, emotion, gaze and alleged reading behavior do not enter the employment score.</li>
        </ul>
      </div>
    </div>
  );
}

export default function StatusPage() {
  return (
    <Suspense>
      <StatusContent />
    </Suspense>
  );
}
