"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronRight,
  Circle,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import AssessmentBlock from "@/components/candidate/AssessmentBlock";
import ReferenceInvitationRecovery from "@/components/candidate/ReferenceInvitationRecovery";
import {
  candidateControlledMinutes,
  candidateDeliveryLabel,
  type CandidateAssessmentSnapshot,
} from "@/lib/candidate-assessment-view";
import type { CandidateBlockControlSnapshot } from "@/lib/server/assessment-controls";

interface CandidateSnapshot {
  id: string;
  code: string;
  title: string;
  stage: string;
  noticeVersion: number;
  consentAt: string | null;
  lockVersion: number;
  progress: number;
  assessment?: CandidateAssessmentSnapshotWithControls;
}

interface CandidateAssessmentSnapshotWithControls
  extends CandidateAssessmentSnapshot {
  currentControls?: CandidateBlockControlSnapshot;
  currentCoordination?: {
    kind: "human_stage";
    selfBooking: boolean;
    bookingUrl?: string;
  };
}

function AssessmentContent() {
  const router = useRouter();
  const params = useSearchParams();
  const applicationId = params.get("applicationId") ?? "";
  const requestedCode = params.get("code") ?? "";
  const demoTtsModeParam = params.get("wbxDemoTts");
  const demoTtsAnswerParam = params.get("wbxDemoAnswer");
  const demoTtsAnswersParam = params.get("wbxDemoAnswers");
  const [application, setApplication] = useState<CandidateSnapshot | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!applicationId) {
      setError("Open the assessment from a secure application session.");
      return;
    }
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
          : body.error || "The assessment could not be loaded.",
      );
    }
    setApplication(body.application);
  }, [applicationId]);

  useEffect(() => {
    void load().catch((reason) =>
      setError(
        reason instanceof Error
          ? reason.message
          : "The assessment could not be loaded.",
      ),
    );
  }, [load]);

  const acceptNotice = async () => {
    if (!application || !consentChecked || busy) return;
    setBusy(true);
    setError("");
    try {
      const interviewKinds =
        application.assessment?.plan.blocks
          .map((block) => block.kind)
          .filter((kind) =>
            [
              "async_interview",
              "live_ai_interview",
              "chat_interview",
            ].includes(kind),
          ) ?? [];
      const textOnlyInterview =
        interviewKinds.length > 0 &&
        interviewKinds.every((kind) => kind === "chat_interview");
      const response = await fetch(
        `/api/candidate/applications/${encodeURIComponent(application.id)}/consent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accepted: true,
            noticeVersion: application.noticeVersion,
            expectedVersion: application.lockVersion,
            mode: textOnlyInterview ? "text_accommodation" : "video",
          }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Consent could not be recorded.");
      }
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Consent could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!application && !error) {
    return (
      <div className="grid flex-1 place-items-center">
        <LoaderCircle className="size-6 animate-spin text-mid" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 text-center">
        <LockKeyhole className="size-8 text-mid" />
        <h1 className="mt-4 font-display text-[25px] text-hi">
          Secure session required
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-mid">{error}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-5 rounded-lg border border-hairline-strong px-4 py-2 text-[13px] text-hi"
        >
          Return to code entry
        </button>
      </div>
    );
  }

  if (!application.assessment) {
    const query = new URLSearchParams({
      applicationId: application.id,
      code: application.code || requestedCode,
    });
    if (demoTtsModeParam === "0" || demoTtsModeParam === "1") {
      query.set("wbxDemoTts", demoTtsModeParam);
    }
    if (demoTtsAnswerParam?.trim()) {
      query.set("wbxDemoAnswer", demoTtsAnswerParam.trim());
    }
    if (demoTtsAnswersParam?.trim()) {
      query.set("wbxDemoAnswers", demoTtsAnswersParam.trim());
    }
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 text-center">
        <ShieldCheck className="size-8 text-mid" />
        <h1 className="mt-4 font-display text-[25px] text-hi">
          Your interview is ready
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-mid">
          Continue to the secure device check, then answer the published
          interview questions.
        </p>
        <button
          type="button"
          onClick={() => router.push(`/interview/check?${query}`)}
          className="mt-5 rounded-lg border border-hairline-strong px-4 py-2 text-[13px] text-hi"
        >
          Continue to interview
        </button>
      </div>
    );
  }

  const { plan, blockRuns, currentBlock, currentRun, completed, total } =
    application.assessment;
  const currentJourneyBlock =
    plan.blocks[application.assessment.currentBlockIndex] ?? null;
  const pendingReferenceRun = blockRuns.find(
    (run) =>
      run.kind === "reference_check" &&
      run.status === "awaiting_external_participants",
  );
  const pendingReferenceBlock = pendingReferenceRun
    ? plan.blocks.find(
        (block) => block.id === pendingReferenceRun.blockId,
      )
    : undefined;
  const code = application.code || requestedCode;
  const percent = total ? Math.round((completed / total) * 100) : 100;
  const currentCandidateStartable = Boolean(
    currentJourneyBlock &&
      currentJourneyBlock.delivery.availability === "ready" &&
      [
        "candidate_input",
        "interview_runtime",
        "candidate_then_external_participants",
      ].includes(currentJourneyBlock.delivery.state),
  );

  const openCurrentStage = async () => {
    if (!currentJourneyBlock || !currentRun || busy) return;
    const queryParams = new URLSearchParams({ applicationId, code });
    if (demoTtsModeParam === "0" || demoTtsModeParam === "1") {
      queryParams.set("wbxDemoTts", demoTtsModeParam);
    }
    if (demoTtsAnswerParam?.trim()) {
      queryParams.set("wbxDemoAnswer", demoTtsAnswerParam.trim());
    }
    if (demoTtsAnswersParam?.trim()) {
      queryParams.set("wbxDemoAnswers", demoTtsAnswersParam.trim());
    }
    const query = queryParams.toString();
    if (
      currentJourneyBlock.kind === "async_interview" ||
      currentJourneyBlock.kind === "live_ai_interview"
    ) {
      router.push(`/interview/check?${query}`);
      return;
    }
    if (currentJourneyBlock.kind === "chat_interview") {
      router.push(`/interview/live?${query}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/candidate/applications/${encodeURIComponent(application.id)}/blocks/${encodeURIComponent(currentJourneyBlock.id)}/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: application.lockVersion,
            restart: false,
          }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "This stage could not be started.");
      }
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "This stage could not be started.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!application.consentAt) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-5 pb-12 pt-5 sm:px-8">
        <div className="hud-label">
          {code} · {plan.role.title.toUpperCase()}
        </div>
        <h1 className="mt-3 font-display text-[clamp(25px,4vw,38px)] font-medium tracking-[-0.02em] text-hi">
          Review the complete assessment before you begin
        </h1>
        <p className="mt-3 max-w-[70ch] text-[14px] leading-relaxed text-mid">
          {plan.role.mission}
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-hairline bg-surface p-4">
            <div className="font-mono text-[9px] uppercase tracking-[.08em] text-lo">
              Stages
            </div>
            <div className="mt-2 text-[20px] text-hi">{plan.blocks.length}</div>
          </div>
          <div className="rounded-xl border border-hairline bg-surface p-4">
            <div className="font-mono text-[9px] uppercase tracking-[.08em] text-lo">
              Estimated effort
            </div>
            <div className="mt-2 text-[20px] text-hi">
              {candidateControlledMinutes(plan)} min
            </div>
          </div>
          <div className="rounded-xl border border-hairline bg-surface p-4">
            <div className="font-mono text-[9px] uppercase tracking-[.08em] text-lo">
              Final decision
            </div>
            <div className="mt-2 text-[13px] leading-relaxed text-hi">
              Named human reviewer
            </div>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-hairline bg-surface">
          {plan.blocks.map((block, index) => (
            <div
              key={block.id}
              className="flex items-start gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-hairline-strong font-mono text-[9px] text-mid">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-hi">
                  {block.title}
                  <span className="font-mono text-[9px] uppercase tracking-[.06em] text-lo">
                    {block.required ? "required" : "optional"} ·{" "}
                    {block.estimatedMinutes} min
                  </span>
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-mid">
                  {block.candidateIntro}
                </p>
                <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[.06em] text-lo">
                  {candidateDeliveryLabel(block)}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-hairline-strong bg-void2 p-5">
          <div className="font-mono text-[10px] uppercase tracking-[.08em] text-lo">
            AI and data notice · version {plan.candidateExperience.noticeVersion}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-mid">
            {plan.candidateExperience.aiDisclosure}
          </p>
          <p className="mt-3 text-[12px] leading-relaxed text-mid">
            Evidence is retained for up to{" "}
            {plan.candidateExperience.retentionDays} days. Appearance, facial
            expression, gaze, alleged reading behavior, voice identity and
            accent do not enter the score. Missing evidence causes abstention
            and human review, not a hidden zero.
          </p>
          <label className="mt-5 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(event) => setConsentChecked(event.target.checked)}
              className="mt-0.5 size-4"
            />
            <span className="text-[12.5px] leading-relaxed text-hi">
              I reviewed the stages, AI use, recording conditions where
              applicable, retention period and accessibility options, and I
              consent to begin this published vacancy version.
            </span>
          </label>
          <button
            type="button"
            disabled={!consentChecked || busy}
            onClick={() => void acceptNotice()}
            className="mt-5 flex items-center gap-2 rounded-lg border border-hairline-strong bg-surface2 px-5 py-2.5 text-[13px] text-hi disabled:opacity-40"
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Begin assessment
          </button>
          {error && (
            <p role="alert" className="mt-3 text-[12px] text-warn">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (
    application.stage === "in_progress" &&
    currentJourneyBlock &&
    currentRun?.status === "available" &&
    currentCandidateStartable &&
    !currentBlock
  ) {
    const interviewKind = [
      "async_interview",
      "live_ai_interview",
      "chat_interview",
    ].includes(currentJourneyBlock.kind);
    const deviceCheckRequired =
      currentJourneyBlock.kind === "async_interview" ||
      currentJourneyBlock.kind === "live_ai_interview";
    const hardLimitMinutes =
      application.assessment.currentControls?.hardTimeLimitSec !== undefined
        ? Math.ceil(
            application.assessment.currentControls.hardTimeLimitSec / 60,
          )
        : null;
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-10">
        <div className="hud-label">
          {code} · STAGE {application.assessment.currentBlockIndex + 1} OF{" "}
          {total}
        </div>
        <h1 className="mt-3 font-display text-[clamp(26px,4vw,38px)] font-medium tracking-[-0.02em] text-hi">
          {currentJourneyBlock.title}
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-mid">
          {currentJourneyBlock.candidateIntro}
        </p>
        <div className="mt-5 rounded-xl border border-hairline bg-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[.07em] text-lo">
            Secure attempt start
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-mid">
            Exact questions, options and task materials are released only after
            the server records this attempt as started.
            {deviceCheckRequired
              ? " Device checks happen first; the interview attempt starts when the first question opens."
              : hardLimitMinutes
                ? ` The ${hardLimitMinutes}-minute server timer starts at that moment and does not pause when the browser closes.`
                : " Your progress is then bound to this server-owned attempt."}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 font-mono text-[9px] uppercase tracking-[.06em] text-lo">
            <span>{currentJourneyBlock.estimatedMinutes} min estimated</span>
            <span>{currentJourneyBlock.required ? "required" : "optional"}</span>
            {application.assessment.currentControls?.deadlineAt && (
              <span>
                deadline{" "}
                {new Date(
                  application.assessment.currentControls.deadlineAt,
                ).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void openCurrentStage()}
          className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-hairline-strong bg-surface2 px-5 py-3 text-[14px] text-hi disabled:opacity-40"
        >
          {busy && <LoaderCircle className="size-4 animate-spin" />}
          {deviceCheckRequired
            ? "Check devices"
            : interviewKind
              ? "Start interview"
              : "Start stage"}
        </button>
        {error && (
          <p role="alert" className="mt-3 text-[12px] text-warn">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (
    application.stage !== "in_progress" ||
    !currentBlock ||
    !currentRun
  ) {
    const query = new URLSearchParams({ applicationId, code });
    const waitingCopy =
      application.stage === "needs_adjudication"
        ? {
            title: "A named reviewer must resolve this stage",
            body:
              "The workflow is paused for evidence or eligibility adjudication. No automatic rejection or hidden score has been issued.",
          }
        : application.stage === "under_review" && currentJourneyBlock
          ? {
              title: `${currentJourneyBlock.title} is with the hiring team`,
              body:
                "This published stage requires scheduling, verification or a named reviewer. You do not need to submit a placeholder response.",
            }
          : {
              title: "Candidate-controlled stages are complete",
              body:
                "Submitted evidence is waiting for the configured AI-assisted, verification or independent human review. No automated employment decision has been made.",
            };
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 text-center">
        <ShieldCheck className="size-9 text-pos" />
        <h1 className="mt-4 font-display text-[27px] text-hi">
          {waitingCopy.title}
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-mid">
          {waitingCopy.body}
        </p>
        {pendingReferenceBlock && (
          <ReferenceInvitationRecovery
            applicationId={applicationId}
            blockId={pendingReferenceBlock.id}
          />
        )}
        {application.assessment.currentCoordination?.selfBooking &&
          application.assessment.currentCoordination.bookingUrl && (
            <a
              href={application.assessment.currentCoordination.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-5 rounded-lg border border-hairline-strong bg-surface2 px-4 py-2 text-[13px] text-hi"
            >
              Open employer scheduling page
            </a>
          )}
        <button
          type="button"
          onClick={() => router.push(`/status?${query}`)}
          className="mt-5 rounded-lg border border-hairline-strong px-4 py-2 text-[13px] text-hi"
        >
          View application status
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 pb-12 pt-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-7">
      <aside className="h-fit rounded-xl border border-hairline bg-surface p-4 lg:sticky lg:top-4">
        <div className="hud-label">{code}</div>
        <div className="mt-2 text-[15px] text-hi">{application.title}</div>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-pos transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[9px] uppercase tracking-[.06em] text-lo">
          <span>
            {completed} / {total}
          </span>
          <span>{percent}%</span>
        </div>
        <div className="mt-5 space-y-1">
          {plan.blocks.map((block, index) => {
            const run = blockRuns[index];
            const done = Boolean(
              run &&
                [
                  "submitted",
                  "awaiting_ai_review",
                  "awaiting_human_review",
                  "awaiting_verification",
                  "awaiting_external_participants",
                  "skipped",
                ].includes(run.status),
            );
            const active = block.id === currentBlock.id;
            return (
              <div
                key={block.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-2 text-[11px] ${
                  active
                    ? "bg-white/5 text-hi"
                    : done
                      ? "text-mid"
                      : "text-lo"
                }`}
              >
                {done ? (
                  <Check className="size-3.5 text-pos" />
                ) : active ? (
                  <ChevronRight className="size-3.5" />
                ) : (
                  <Circle className="size-3.5" />
                )}
                <span className="min-w-0 truncate">{block.title}</span>
              </div>
            );
          })}
        </div>
        {pendingReferenceBlock && (
          <ReferenceInvitationRecovery
            applicationId={applicationId}
            blockId={pendingReferenceBlock.id}
            compact
          />
        )}
      </aside>

      <main>
        <div className="flex flex-wrap items-center gap-2">
          <div className="hud-label">
            STAGE {application.assessment.currentBlockIndex + 1} OF {total}
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[.06em] text-lo">
            {currentBlock.required ? "required" : "optional"}
          </span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(25px,4vw,36px)] font-medium tracking-[-0.02em] text-hi">
          {currentBlock.title}
        </h1>
        <p className="mt-3 max-w-[74ch] text-[14px] leading-relaxed text-mid">
          {currentBlock.candidateIntro}
        </p>
        <div className="mt-4 flex flex-wrap gap-4 font-mono text-[9px] uppercase tracking-[.06em] text-lo">
          <span className="flex items-center gap-1.5">
            <Clock3 className="size-3.5" />
            {currentBlock.estimatedMinutes} min
          </span>
          <span>{currentBlock.language}</span>
          <span>{currentBlock.scoring.mode.replaceAll("_", " ")}</span>
        </div>
        <div className="mt-6">
          <AssessmentBlock
            applicationId={application.id}
            code={code}
            block={currentBlock}
          run={currentRun}
          controls={application.assessment.currentControls}
            lockVersion={application.lockVersion}
            onSaved={load}
          />
        </div>
      </main>
    </div>
  );
}

export default function AssessmentPage() {
  return (
    <Suspense>
      <AssessmentContent />
    </Suspense>
  );
}
