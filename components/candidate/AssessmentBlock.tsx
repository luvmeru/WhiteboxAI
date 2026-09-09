"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  FileUp,
  LoaderCircle,
  ShieldCheck,
  SkipForward,
} from "lucide-react";
import type {
  CandidateAssessmentBlock,
  UploadedAssetRef,
} from "@/lib/server/assessment-runtime";
import type { AssessmentBlockRun } from "@/lib/server/assessment-orchestrator";
import type { CandidateBlockControlSnapshot } from "@/lib/server/assessment-controls";

const INPUT =
  "iris-focus w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-[13px] text-hi";
const LABEL =
  "mb-1.5 block font-mono text-[10px] uppercase tracking-[.08em] text-lo";

interface Props {
  applicationId: string;
  code: string;
  block: CandidateAssessmentBlock;
  run: AssessmentBlockRun;
  controls?: CandidateBlockControlSnapshot;
  lockVersion: number;
  onSaved: () => Promise<void>;
}

interface ReferenceInvitationDelivery {
  refereeOrdinal: number;
  relationship: "manager" | "peer" | "report";
  expiresAt: string;
  deliveryUrl: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordAt(
  payload: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return isRecord(payload[key]) ? (payload[key] as Record<string, unknown>) : {};
}

function arrayAt(payload: Record<string, unknown>, key: string): unknown[] {
  return Array.isArray(payload[key]) ? (payload[key] as unknown[]) : [];
}

function optionArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function formatRemaining(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function ArtifactInput({
  applicationId,
  blockId,
  lockVersion,
  label,
  accept,
  onUploaded,
}: {
  applicationId: string;
  blockId: string;
  lockVersion: number;
  label: string;
  accept?: string;
  onUploaded: (asset: UploadedAssetRef) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("files", file, file.name);
      form.append("expectedVersion", String(lockVersion));
      form.append("idempotencyKey", `artifact-${crypto.randomUUID()}`);
      const response = await fetch(
        `/api/candidate/applications/${encodeURIComponent(applicationId)}/blocks/${encodeURIComponent(blockId)}/artifacts`,
        { method: "POST", body: form },
      );
      const body = (await response.json()) as {
        asset?: UploadedAssetRef;
        error?: string;
      };
      if (!response.ok || !body.asset) {
        throw new Error(body.error || "The file could not be uploaded.");
      }
      onUploaded(body.asset);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The file could not be uploaded.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <span className={LABEL}>{label}</span>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-hairline-strong bg-surface px-4 py-3 text-[12px] text-mid hover:text-hi">
        {busy ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <FileUp className="size-4" />
        )}
        {busy ? "Uploading privately…" : "Choose a file"}
        <input
          type="file"
          accept={accept}
          disabled={busy}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {error && (
        <p role="alert" className="mt-1.5 text-[11px] text-warn">
          {error}
        </p>
      )}
    </div>
  );
}

export default function AssessmentBlock({
  applicationId,
  code,
  block,
  run,
  controls,
  lockVersion,
  onSaved,
}: Props) {
  const router = useRouter();
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [referenceDeliveries, setReferenceDeliveries] = useState<
    ReferenceInvitationDelivery[] | null
  >(null);
  const [retakeOpen, setRetakeOpen] = useState(false);
  const [retakeReason, setRetakeReason] = useState("");
  const [remainingSec, setRemainingSec] = useState<number | undefined>(
    controls?.remainingSec,
  );

  useEffect(() => {
    setPayload({});
    setError("");
    setReferenceDeliveries(null);
    setRetakeOpen(false);
    setRetakeReason("");
  }, [block.id, run.attempts]);

  useEffect(() => {
    setRemainingSec(controls?.remainingSec);
    if (!controls?.timerExpiresAt) return;
    const serverOffsetMs = Date.parse(controls.serverNow) - Date.now();
    const update = () => {
      setRemainingSec(
        Math.max(
          0,
          Math.ceil(
            (Date.parse(controls.timerExpiresAt!) -
              (Date.now() + serverOffsetMs)) /
              1_000,
          ),
        ),
      );
    };
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [
    controls?.remainingSec,
    controls?.serverNow,
    controls?.timerExpiresAt,
  ]);

  const answers = useMemo(() => recordAt(payload, "answers"), [payload]);
  const setAnswer = (id: string, value: unknown) => {
    setPayload((current) => ({
      ...current,
      answers: { ...recordAt(current, "answers"), [id]: value },
    }));
  };
  const toggleAnswer = (id: string, optionId: string) => {
    const selected = optionArray(answers[id]);
    setAnswer(
      id,
      selected.includes(optionId)
        ? selected.filter((candidate) => candidate !== optionId)
        : [...selected, optionId],
    );
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/candidate/applications/${encodeURIComponent(applicationId)}/blocks/${encodeURIComponent(block.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: lockVersion, payload }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        result?: {
          referenceInvitations?: ReferenceInvitationDelivery[];
          deliveryMode?: "candidate_manual_delivery";
        };
      };
      if (!response.ok) {
        throw new Error(body.error || "This stage could not be submitted.");
      }
      if (
        block.kind === "reference_check" &&
        body.result?.deliveryMode ===
          "candidate_manual_delivery" &&
        body.result.referenceInvitations?.length
      ) {
        setReferenceDeliveries(
          body.result.referenceInvitations,
        );
        return;
      }
      await onSaved();
    } catch (reason) {
      if (block.kind === "reference_check") {
        try {
          const recovery = await fetch(
            `/api/candidate/applications/${encodeURIComponent(applicationId)}/reference-invitations`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ blockId: block.id }),
            },
          );
          const recovered = (await recovery.json()) as {
            deliveryMode?: "candidate_manual_delivery";
            referenceCollectionComplete?: boolean;
            referenceInvitations?: ReferenceInvitationDelivery[];
          };
          if (
            recovery.ok &&
            recovered.referenceCollectionComplete
          ) {
            await onSaved();
            return;
          }
          if (
            recovery.ok &&
            recovered.deliveryMode ===
              "candidate_manual_delivery" &&
            recovered.referenceInvitations?.length
          ) {
            setReferenceDeliveries(
              recovered.referenceInvitations,
            );
            return;
          }
        } catch {
          // Preserve the original submission error. Recovery is a bounded,
          // same-origin retry for a response lost after the server commit.
        }
      }
      setError(
        reason instanceof Error
          ? reason.message
          : "This stage could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  };

  const startBlock = async (restart: boolean) => {
    if (busy) return;
    if (restart && retakeReason.trim().length < 10) {
      setError("Describe the technical reason in at least 10 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/candidate/applications/${encodeURIComponent(applicationId)}/blocks/${encodeURIComponent(block.id)}/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: lockVersion,
            restart,
            ...(restart ? { reason: retakeReason.trim() } : {}),
          }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          body.error ||
            (restart
              ? "This stage could not be restarted."
              : "This timed stage could not be started."),
        );
      }
      setRetakeOpen(false);
      setRetakeReason("");
      await onSaved();
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

  const skip = async () => {
    if (busy || block.required) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/candidate/applications/${encodeURIComponent(applicationId)}/blocks/${encodeURIComponent(block.id)}/skip`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: lockVersion }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "This optional stage could not be skipped.");
      }
      await onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "This optional stage could not be skipped.",
      );
    } finally {
      setBusy(false);
    }
  };

  const startInterview = async () => {
    const query = new URLSearchParams({ applicationId, code });
    if (block.kind === "chat_interview") {
      setBusy(true);
      setError("");
      try {
        const response = await fetch(
          `/api/candidate/applications/${encodeURIComponent(applicationId)}/accommodation`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "text_accommodation",
              expectedVersion: lockVersion,
            }),
          },
        );
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(
            body.error || "The structured text mode could not be opened.",
          );
        }
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "The structured text mode could not be opened.",
        );
        setBusy(false);
        return;
      }
      router.push(`/interview/live?${query}`);
    } else {
      router.push(`/interview/check?${query}`);
    }
  };

  const manifest = block.manifest;
  const timerExpired =
    controls?.expiredReason === "hard_timer_expired" ||
    (controls?.timerExpiresAt !== undefined && remainingSec === 0);
  const controlExpired =
    controls?.expiredReason === "deadline_expired" || timerExpired;
  const timingNotice = controls &&
    (controls.deadlineAt || controls.hardTimeLimitSec !== undefined) && (
      <div
        className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
          controlExpired
            ? "border-warn/35 bg-warn/5 text-warn"
            : "border-hairline bg-void2 text-mid"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {controls.hardTimeLimitSec !== undefined
              ? run.status === "available"
                ? `Hard timer: ${formatRemaining(controls.hardTimeLimitSec)} after you start`
                : `Server timer: ${formatRemaining(remainingSec ?? 0)} remaining`
              : "No whole-stage hard timer"}
          </span>
          {controls.deadlineAt && (
            <span>
              Deadline {new Date(controls.deadlineAt).toLocaleString()}
            </span>
          )}
        </div>
        {controlExpired && (
          <p className="mt-1">
            The published window has ended. Submission is disabled and a named
            reviewer must decide the next step.
          </p>
        )}
      </div>
    );
  const retakePanel = controls?.canRetake && (
    <div className="rounded-lg border border-hairline bg-void2 p-3">
      {!retakeOpen ? (
        <button
          type="button"
          onClick={() => setRetakeOpen(true)}
          className="text-[11px] text-mid underline underline-offset-2 hover:text-hi"
        >
          Restart this whole stage after a technical failure (
          {controls.retakesRemaining} remaining)
        </button>
      ) : (
        <>
          <label className={LABEL} htmlFor={`retake-reason-${block.id}`}>
            Technical-failure reason · audited
          </label>
          <textarea
            id={`retake-reason-${block.id}`}
            className={`${INPUT} min-h-20`}
            value={retakeReason}
            maxLength={1_000}
            onChange={(event) => setRetakeReason(event.target.value)}
            placeholder="Describe the interruption or device failure."
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void startBlock(true)}
              disabled={busy || retakeReason.trim().length < 10}
              className="rounded-lg border border-warn/40 px-3 py-2 text-[11px] text-warn disabled:opacity-40"
            >
              Use one retake
            </button>
            <button
              type="button"
              onClick={() => {
                setRetakeOpen(false);
                setRetakeReason("");
              }}
              className="px-3 py-2 text-[11px] text-mid"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
  if (referenceDeliveries) {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-good" />
          <div>
            <h2 className="text-[15px] font-medium text-hi">
              Reference invitations are ready
            </h2>
            <p className="mt-1.5 max-w-[70ch] text-[12px] leading-relaxed text-mid">
              Send each secure link only to the referee listed in the
              corresponding position. The link contains no name or email,
              expires automatically, and can be completed once.
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {referenceDeliveries.map((delivery) => (
            <div
              key={delivery.refereeOrdinal}
              className="rounded-lg border border-hairline bg-void2 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-mono text-[10px] uppercase tracking-[.06em] text-hi">
                  Referee {delivery.refereeOrdinal} ·{" "}
                  {delivery.relationship}
                </div>
                <div className="font-mono text-[9px] text-lo">
                  Expires{" "}
                  {new Date(delivery.expiresAt).toLocaleDateString()}
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  readOnly
                  aria-label={`Secure link for referee ${delivery.refereeOrdinal}`}
                  value={delivery.deliveryUrl}
                  className={`${INPUT} min-w-0 font-mono text-[10px]`}
                />
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      delivery.deliveryUrl,
                    )
                  }
                  className="shrink-0 rounded-lg border border-hairline-strong px-3 py-2 text-[11px] text-hi"
                >
                  Copy
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] leading-relaxed text-lo">
          Delivery is manual because no organization mail provider is
          connected. A contact record alone is never scored; only a completed
          frozen questionnaire becomes reviewable evidence.
        </p>
        <button
          type="button"
          onClick={() => void onSaved()}
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-hairline-strong bg-void2 px-4 py-2.5 text-[12px] text-hi"
        >
          Continue
          <ArrowRight className="size-4" />
        </button>
      </div>
    );
  }
  const interactionSchemaMissing =
    (manifest.kind === "custom" &&
      manifest.primitives.some((primitive) =>
        ["choice", "grid", "recorder"].includes(primitive),
      )) ||
    (manifest.kind === "job_knowledge" &&
      manifest.items.some(
        (item) =>
          item.type === "image_hotspot" || item.type === "sequence",
      )) ||
    (manifest.kind === "sjt" &&
      manifest.items.some((item) => item.mediaKind !== "text"));
  const externallyBlocked =
    block.delivery.availability === "blocked" ||
    block.delivery.state === "external_provider_required" ||
    block.delivery.state === "employer_configuration_required" ||
    interactionSchemaMissing;
  const coordinated =
    block.delivery.state === "human_coordination_required" ||
    block.delivery.state === "deferred_candidate_input";

  if (externallyBlocked || coordinated) {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 text-mid" />
          <div>
            <h2 className="text-[16px] text-hi">
              {block.delivery.state === "deferred_candidate_input"
                ? "This verification stage opens later"
                : block.delivery.state === "human_coordination_required"
                  ? "This stage is coordinated by the hiring team"
                  : block.delivery.state === "external_provider_required"
                    ? "A validated assessment provider is required"
                    : "This stage needs complete employer configuration"}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-mid">
              {block.delivery.state === "deferred_candidate_input"
                ? "The hiring team must explicitly unlock this published stage. No document is requested before that point."
                : block.delivery.state === "human_coordination_required"
                  ? "A named reviewer must schedule the stage and record evidence against the published scorecard."
                  : block.delivery.state === "external_provider_required"
                    ? "WhiteBox will not imitate a cognitive, personality, integrity or language score without the configured validated instrument."
                    : "The published content does not contain everything needed for a fair, reproducible interaction. No generic placeholder response will be accepted."}
            </p>
          </div>
        </div>
        {!block.required && (
          <button
            type="button"
            onClick={() => void skip()}
            disabled={busy}
            className="mt-4 flex items-center gap-2 rounded-lg border border-hairline-strong px-4 py-2 text-[12px] text-hi disabled:opacity-40"
          >
            <SkipForward className="size-4" />
            Skip optional stage
          </button>
        )}
        {error && (
          <p role="alert" className="mt-3 text-[12px] text-warn">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (
    controls &&
    (controls.hardTimeLimitSec !== undefined || block.retakePolicy > 0) &&
    run.status === "available" &&
    ![
      "async_interview",
      "live_ai_interview",
      "chat_interview",
    ].includes(manifest.kind)
  ) {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-5">
        {timingNotice}
        <h2 className="mt-4 text-[16px] text-hi">
          Start this stage when you are ready
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed text-mid">
          {controls.hardTimeLimitSec !== undefined
            ? "The hard timer starts from the server timestamp. Closing the browser does not pause it. Your published accessibility multiplier has already been applied."
            : `Starting records attempt 1 of ${controls.maxAttempts}. A whole-stage retake is available only for a documented technical failure.`}
        </p>
        <button
          type="button"
          onClick={() => void startBlock(false)}
          disabled={busy || controlExpired}
          className="mt-4 flex items-center gap-2 rounded-lg border border-hairline-strong bg-surface2 px-5 py-2.5 text-[13px] text-hi disabled:opacity-40"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
          Start stage
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
    manifest.kind === "async_interview" ||
    manifest.kind === "live_ai_interview" ||
    manifest.kind === "chat_interview"
  ) {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-5">
        {timingNotice}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className={LABEL}>Question delivery</div>
            <div className="text-[13px] text-hi">One at a time</div>
          </div>
          <div>
            <div className={LABEL}>Format</div>
            <div className="text-[13px] text-hi">
              {manifest.kind === "chat_interview"
                ? "Structured text"
                : manifest.kind === "live_ai_interview"
                  ? "Live adaptive"
                  : "Recorded structured"}
            </div>
          </div>
          <div>
            <div className={LABEL}>Scoring</div>
            <div className="text-[13px] text-hi">Published BARS + human review</div>
          </div>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-mid">
          The server applies the same published evidence-sufficiency and time
          limits to every candidate, so the number of turns may vary. If you do
          not understand a question, you can request an equivalent rephrase or
          a situational alternative. Future questions and rubric anchors are
          never sent to the browser.
        </p>
        <button
          type="button"
          onClick={() => void startInterview()}
          disabled={busy || controlExpired}
          className="mt-5 flex items-center gap-2 rounded-lg border border-hairline-strong bg-surface2 px-5 py-2.5 text-[13px] text-hi"
        >
          Start this interview <ArrowRight className="size-4" />
        </button>
        {retakePanel && <div className="mt-4">{retakePanel}</div>}
        {error && (
          <p role="alert" className="mt-3 text-[12px] text-warn">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      className="space-y-5 rounded-xl border border-hairline bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {timingNotice}
      {retakePanel}
      {manifest.kind === "application_form" &&
        manifest.fields.map((field) => (
          <div key={field.id}>
            <label className={LABEL}>
              {field.label}
              {field.required ? " · required" : ""}
            </label>
            {(field.type === "short_text" ||
              field.type === "date" ||
              field.type === "number" ||
              field.type === "url") && (
              <input
                className={INPUT}
                type={
                  field.type === "short_text"
                    ? "text"
                    : field.type === "url"
                      ? "url"
                      : field.type
                }
                required={field.required}
                value={
                  typeof answers[field.id] === "string" ||
                  typeof answers[field.id] === "number"
                    ? String(answers[field.id])
                    : ""
                }
                onChange={(event) =>
                  setAnswer(
                    field.id,
                    field.type === "number"
                      ? event.target.value === ""
                        ? undefined
                        : Number(event.target.value)
                      : event.target.value,
                  )
                }
              />
            )}
            {field.type === "long_text" && (
              <textarea
                className={`${INPUT} min-h-28`}
                required={field.required}
                value={
                  typeof answers[field.id] === "string"
                    ? (answers[field.id] as string)
                    : ""
                }
                onChange={(event) => setAnswer(field.id, event.target.value)}
              />
            )}
            {(field.type === "single_choice" ||
              field.type === "dropdown") && (
              <select
                className={INPUT}
                required={field.required}
                value={
                  typeof answers[field.id] === "string"
                    ? (answers[field.id] as string)
                    : ""
                }
                onChange={(event) => setAnswer(field.id, event.target.value)}
              >
                <option value="">Select…</option>
                {field.options?.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.text}
                  </option>
                ))}
              </select>
            )}
            {field.type === "multi_choice" && (
              <div className="space-y-2">
                {field.options?.map((option) => (
                  <label
                    key={option.id}
                    className="flex items-center gap-2 text-[13px] text-mid"
                  >
                    <input
                      type="checkbox"
                      checked={optionArray(answers[field.id]).includes(option.id)}
                      onChange={() => toggleAnswer(field.id, option.id)}
                    />
                    {option.text}
                  </label>
                ))}
              </div>
            )}
            {field.type === "consent" && (
              <label className="flex items-start gap-2 text-[13px] text-mid">
                <input
                  className="mt-0.5"
                  type="checkbox"
                  required={field.required}
                  checked={answers[field.id] === true}
                  onChange={(event) =>
                    setAnswer(field.id, event.target.checked)
                  }
                />
                I confirm this published statement.
              </label>
            )}
            {field.type === "file" && (
              <>
                <ArtifactInput
                  applicationId={applicationId}
                  blockId={block.id}
                  lockVersion={lockVersion}
                  label="Private attachment"
                  onUploaded={(asset) => setAnswer(field.id, asset)}
                />
                {isRecord(answers[field.id]) && (
                  <p className="mt-1.5 flex items-center gap-2 text-[12px] text-pos">
                    <CheckCircle2 className="size-4" />
                    {String(objectValue(answers[field.id]).fileName)} uploaded
                    privately
                  </p>
                )}
              </>
            )}
          </div>
        ))}

      {manifest.kind === "knockout" &&
        manifest.items.map((item) => (
          <div key={item.id}>
            <div className="text-[14px] leading-relaxed text-hi">
              {item.question}
            </div>
            {item.type === "yes_no" && (
              <div className="mt-2 flex gap-4">
                {[true, false].map((value) => (
                  <label key={String(value)} className="text-[13px] text-mid">
                    <input
                      className="mr-2"
                      type="radio"
                      name={item.id}
                      checked={answers[item.id] === value}
                      onChange={() => setAnswer(item.id, value)}
                    />
                    {value ? "Yes" : "No"}
                  </label>
                ))}
              </div>
            )}
            {item.type === "numeric_threshold" && (
              <input
                className={`${INPUT} mt-2`}
                type="number"
                value={
                  typeof answers[item.id] === "number"
                    ? String(answers[item.id])
                    : ""
                }
                onChange={(event) =>
                  setAnswer(
                    item.id,
                    event.target.value === ""
                      ? undefined
                      : Number(event.target.value),
                  )
                }
              />
            )}
            {item.type === "single_choice" && (
              <select
                className={`${INPUT} mt-2`}
                value={
                  typeof answers[item.id] === "string"
                    ? (answers[item.id] as string)
                    : ""
                }
                onChange={(event) => setAnswer(item.id, event.target.value)}
              >
                <option value="">Select…</option>
                {item.options?.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.text}
                  </option>
                ))}
              </select>
            )}
            {item.type === "multi_must_include" && (
              <div className="mt-2 space-y-2">
                {item.options?.map((option) => (
                  <label
                    key={option.id}
                    className="flex items-center gap-2 text-[13px] text-mid"
                  >
                    <input
                      type="checkbox"
                      checked={optionArray(answers[item.id]).includes(option.id)}
                      onChange={() => toggleAnswer(item.id, option.id)}
                    />
                    {option.text}
                  </label>
                ))}
              </div>
            )}
            {item.allowAppeal && (
              <label className="mt-3 block">
                <span className={LABEL}>
                  Optional context for a human reviewer
                </span>
                <textarea
                  className={`${INPUT} min-h-20`}
                  placeholder="Add context if a yes/no answer does not fully describe your situation."
                  value={String(recordAt(payload, "appeals")[item.id] ?? "")}
                  onChange={(event) =>
                    setPayload((current) => ({
                      ...current,
                      appeals: {
                        ...recordAt(current, "appeals"),
                        [item.id]: event.target.value,
                      },
                    }))
                  }
                />
              </label>
            )}
          </div>
        ))}

      {manifest.kind === "cv_intake" && (
        <>
          <ArtifactInput
            applicationId={applicationId}
            blockId={block.id}
            lockVersion={lockVersion}
            label={`CV / résumé · ${manifest.acceptedFormats.join(", ")} · max ${manifest.maxSizeMb} MB`}
            accept={manifest.acceptedFormats
              .map((format) => `.${format}`)
              .join(",")}
            onUploaded={(asset) =>
              setPayload((current) => ({ ...current, resume: asset }))
            }
          />
          {isRecord(payload.resume) && (
            <p className="flex items-center gap-2 text-[12px] text-pos">
              <CheckCircle2 className="size-4" />
              {String(payload.resume.fileName)} uploaded privately
            </p>
          )}
          {manifest.portfolioUrlField && (
            <label>
              <span className={LABEL}>Portfolio URL · optional</span>
              <input
                type="url"
                className={INPUT}
                value={
                  typeof payload.portfolioUrl === "string"
                    ? payload.portfolioUrl
                    : ""
                }
                onChange={(event) =>
                  setPayload((current) => ({
                    ...current,
                    portfolioUrl: event.target.value,
                  }))
                }
              />
            </label>
          )}
        </>
      )}

      {manifest.kind === "sjt" && (
        <p className="rounded-lg border border-hairline bg-surface2 px-3 py-2 text-[11px] leading-relaxed text-mid">
          {manifest.instruction === "knowledge"
            ? "Choose the response that should be taken."
            : "Choose the response you would most likely take."}{" "}
          This stage is untimed.
        </p>
      )}
      {manifest.kind === "sjt" &&
        manifest.items.map((item) => (
          <div key={item.id} className="rounded-lg border border-hairline p-4">
            <div className="text-[14px] leading-relaxed text-hi">
              {item.scenario}
            </div>
            {manifest.format === "pick_best" && (
              <div className="mt-3 space-y-2">
                {item.options.map((option) => (
                  <label
                    key={option.id}
                    className="flex items-start gap-2 text-[13px] text-mid"
                  >
                    <input
                      className="mt-0.5"
                      type="radio"
                      name={item.id}
                      checked={answers[item.id] === option.id}
                      onChange={() => setAnswer(item.id, option.id)}
                    />
                    {option.text}
                  </label>
                ))}
              </div>
            )}
            {manifest.format === "pick_best_worst" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(["bestId", "worstId"] as const).map((key) => (
                  <label key={key}>
                    <span className={LABEL}>
                      {key === "bestId" ? "Most effective" : "Least effective"}
                    </span>
                    <select
                      className={INPUT}
                      value={
                        String(
                          objectValue(answers[item.id])[key] ?? "",
                        )
                      }
                      onChange={(event) =>
                        setAnswer(item.id, {
                          ...objectValue(answers[item.id]),
                          [key]: event.target.value,
                        })
                      }
                    >
                      <option value="">Select…</option>
                      {item.options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.text}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
            {manifest.format === "rank_all" && (
              <div className="mt-3 space-y-2">
                {item.options.map((_, position) => {
                  const ranked = optionArray(answers[item.id]);
                  return (
                    <label key={position}>
                      <span className={LABEL}>Rank {position + 1}</span>
                      <select
                        className={INPUT}
                        value={ranked[position] ?? ""}
                        onChange={(event) => {
                          const next = [...ranked];
                          next[position] = event.target.value;
                          setAnswer(item.id, next);
                        }}
                      >
                        <option value="">Select a response…</option>
                        {item.options.map((option) => (
                          <option
                            key={option.id}
                            value={option.id}
                            disabled={
                              ranked.includes(option.id) &&
                              ranked[position] !== option.id
                            }
                          >
                            {option.text}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            )}
            {manifest.format === "rate_each" && (
              <div className="mt-3 space-y-2">
                {item.options.map((option) => {
                  const ratings = objectValue(answers[item.id]);
                  return (
                    <label
                      key={option.id}
                      className="grid grid-cols-[1fr_100px] items-center gap-3 text-[12px] text-mid"
                    >
                      {option.text}
                      <select
                        className={INPUT}
                        value={
                          typeof ratings[option.id] === "number"
                            ? String(ratings[option.id])
                            : ""
                        }
                        onChange={(event) =>
                          setAnswer(item.id, {
                            ...ratings,
                            [option.id]: Number(event.target.value),
                          })
                        }
                      >
                        <option value="">Rate…</option>
                        {[1, 2, 3, 4, 5].map((rating) => (
                          <option key={rating} value={rating}>
                            {rating}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ))}

      {manifest.kind === "job_knowledge" && (
        <p className="rounded-lg border border-hairline bg-surface2 px-3 py-2 text-[11px] leading-relaxed text-mid">
          {manifest.openBook
            ? "Open-book materials are allowed for this stage."
            : "This is a closed-book stage; do not use external materials."}
        </p>
      )}
      {manifest.kind === "job_knowledge" &&
        manifest.items.map((item) => (
          <div key={item.id} className="rounded-lg border border-hairline p-4">
            <div className="text-[14px] leading-relaxed text-hi">
              {item.prompt}
            </div>
            {item.type === "mcq_single" && (
              <div className="mt-3 space-y-2">
                {item.options?.map((option) => (
                  <label
                    key={option.id}
                    className="flex gap-2 text-[13px] text-mid"
                  >
                    <input
                      type="radio"
                      name={item.id}
                      checked={answers[item.id] === option.id}
                      onChange={() => setAnswer(item.id, option.id)}
                    />
                    {option.text}
                  </label>
                ))}
              </div>
            )}
            {item.type === "mcq_multi" && (
              <div className="mt-3 space-y-2">
                {item.options?.map((option) => (
                  <label
                    key={option.id}
                    className="flex gap-2 text-[13px] text-mid"
                  >
                    <input
                      type="checkbox"
                      checked={optionArray(answers[item.id]).includes(option.id)}
                      onChange={() => toggleAnswer(item.id, option.id)}
                    />
                    {option.text}
                  </label>
                ))}
              </div>
            )}
            {item.type === "true_false_justify" && (
              <div className="mt-3 space-y-3">
                <select
                  className={INPUT}
                  value={String(
                    objectValue(answers[item.id]).choice ?? "",
                  )}
                  onChange={(event) =>
                    setAnswer(item.id, {
                      ...objectValue(answers[item.id]),
                      choice: event.target.value === "true",
                    })
                  }
                >
                  <option value="">Choose true or false…</option>
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
                <textarea
                  className={`${INPUT} min-h-24`}
                  placeholder="Explain your reasoning"
                  value={String(
                    objectValue(answers[item.id]).justification ?? "",
                  )}
                  onChange={(event) =>
                    setAnswer(item.id, {
                      ...objectValue(answers[item.id]),
                      justification: event.target.value,
                    })
                  }
                />
              </div>
            )}
            {item.type === "short_answer" && (
              <textarea
                className={`${INPUT} mt-3 min-h-28`}
                value={
                  typeof answers[item.id] === "string"
                    ? (answers[item.id] as string)
                    : ""
                }
                onChange={(event) => setAnswer(item.id, event.target.value)}
              />
            )}
          </div>
        ))}

      {manifest.kind === "work_sample" && (
        <>
          <div className="rounded-lg border border-hairline bg-void2 p-4 text-[13px] leading-relaxed text-hi">
            {manifest.brief}
          </div>
          {manifest.deliverables.map((kind) =>
            kind === "rich_text" ? (
              <label key={kind}>
                <span className={LABEL}>Written deliverable</span>
                <textarea
                  className={`${INPUT} min-h-48`}
                  value={String(
                    (
                      arrayAt(payload, "deliverables").find(
                        (item) => isRecord(item) && item.kind === kind,
                      ) as Record<string, unknown> | undefined
                    )?.text ?? "",
                  )}
                  onChange={(event) => {
                    const rest = arrayAt(payload, "deliverables").filter(
                      (item) => !isRecord(item) || item.kind !== kind,
                    );
                    setPayload((current) => ({
                      ...current,
                      deliverables: [
                        ...rest,
                        { kind, text: event.target.value },
                      ],
                    }));
                  }}
                />
              </label>
            ) : kind === "url" ? (
              <label key={kind}>
                <span className={LABEL}>Deliverable URL</span>
                <input
                  type="url"
                  className={INPUT}
                  value={String(
                    (
                      arrayAt(payload, "deliverables").find(
                        (item) => isRecord(item) && item.kind === kind,
                      ) as Record<string, unknown> | undefined
                    )?.url ?? "",
                  )}
                  onChange={(event) => {
                    const rest = arrayAt(payload, "deliverables").filter(
                      (item) => !isRecord(item) || item.kind !== kind,
                    );
                    setPayload((current) => ({
                      ...current,
                      deliverables: [
                        ...rest,
                        { kind, url: event.target.value },
                      ],
                    }));
                  }}
                />
              </label>
            ) : (
              <ArtifactInput
                key={kind}
                applicationId={applicationId}
                blockId={block.id}
                lockVersion={lockVersion}
                label={kind === "spreadsheet" ? "Spreadsheet" : "Work file"}
                onUploaded={(asset) => {
                  const rest = arrayAt(payload, "deliverables").filter(
                    (item) => !isRecord(item) || item.kind !== kind,
                  );
                  setPayload((current) => ({
                    ...current,
                    deliverables: [...rest, { kind, asset }],
                  }));
                }}
              />
            ),
          )}
        </>
      )}

      {manifest.kind === "coding" && (
        <>
          <div className="rounded-lg border border-hairline bg-void2 p-4 text-[13px] leading-relaxed text-hi">
            {manifest.brief}
          </div>
          {manifest.environment === "browser_ide" ? (
            <>
              <div className="rounded-lg border border-hairline bg-surface2 px-3 py-2 text-[11px] leading-relaxed text-mid">
                Browser source editor · no execution. This stage records the
                source and your explanation for rubric-based human review; it
                does not run code or produce hidden-test results.
              </div>
              <label>
                <span className={LABEL}>Language</span>
                <select
                  className={INPUT}
                  value={
                    typeof payload.language === "string" ? payload.language : ""
                  }
                  onChange={(event) =>
                    setPayload((current) => ({
                      ...current,
                      language: event.target.value,
                    }))
                  }
                >
                  <option value="">Select…</option>
                  {manifest.languages.map((language) => (
                    <option key={language}>{language}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className={LABEL}>Source code</span>
                <textarea
                  className={`${INPUT} min-h-64 font-mono`}
                  spellCheck={false}
                  value={typeof payload.code === "string" ? payload.code : ""}
                  onChange={(event) =>
                    setPayload((current) => ({
                      ...current,
                      code: event.target.value,
                    }))
                  }
                />
              </label>
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className={LABEL}>Repository URL</span>
                <input
                  type="url"
                  className={INPUT}
                  value={
                    typeof payload.repositoryUrl === "string"
                      ? payload.repositoryUrl
                      : ""
                  }
                  onChange={(event) =>
                    setPayload((current) => ({
                      ...current,
                      repositoryUrl: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span className={LABEL}>Commit SHA</span>
                <input
                  className={`${INPUT} font-mono`}
                  value={
                    typeof payload.commitSha === "string"
                      ? payload.commitSha
                      : ""
                  }
                  onChange={(event) =>
                    setPayload((current) => ({
                      ...current,
                      commitSha: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          )}
        </>
      )}

      {manifest.kind === "case_exercise" && (
        <>
          <div className="rounded-lg border border-hairline bg-void2 p-4 text-[13px] leading-relaxed text-hi">
            {manifest.materials}
          </div>
          <textarea
            className={`${INPUT} min-h-56`}
            placeholder="Your case response"
            value={
              typeof payload.responseText === "string"
                ? payload.responseText
                : ""
            }
            onChange={(event) =>
              setPayload((current) => ({
                ...current,
                responseText: event.target.value,
              }))
            }
          />
          <ArtifactInput
            applicationId={applicationId}
            blockId={block.id}
            lockVersion={lockVersion}
            label="Optional supporting file"
            onUploaded={(asset) =>
              setPayload((current) => ({
                ...current,
                files: [...arrayAt(current, "files"), asset],
              }))
            }
          />
        </>
      )}

      {manifest.kind === "doc_verification" && (
        <>
          <p className="rounded-lg border border-hairline bg-surface px-3 py-2 text-[11px] leading-relaxed text-lo">
            {manifest.mode === "manual_document_review"
              ? "A named reviewer will check whether the submitted contents meet the published requirement. This review does not independently authenticate the document."
              : "The upload remains pending until the configured verification provider returns a server-owned result. Uploading a document alone does not verify it."}
          </p>
          {manifest.requiredDocuments.map((document) => (
            <div key={document.id}>
              <ArtifactInput
                applicationId={applicationId}
                blockId={block.id}
                lockVersion={lockVersion}
                label={document.label}
                accept={manifest.acceptedFormats
                  .map((format) => `.${format.replace(/^\./, "")}`)
                  .join(",")}
                onUploaded={(asset) =>
                  setPayload((current) => ({
                    ...current,
                    documents: {
                      ...recordAt(current, "documents"),
                      [document.id]: asset,
                    },
                  }))
                }
              />
            </div>
          ))}
        </>
      )}

      {manifest.kind === "reference_check" &&
        Array.from({ length: manifest.refereeCount }, (_, index) => {
          const referees = arrayAt(payload, "referees");
          const referee = isRecord(referees[index]) ? referees[index] : {};
          const updateReferee = (patch: Record<string, unknown>) => {
            const next = [...referees];
            next[index] = { ...referee, ...patch };
            setPayload((current) => ({ ...current, referees: next }));
          };
          return (
            <div
              key={index}
              className="grid gap-3 rounded-lg border border-hairline p-4 sm:grid-cols-2"
            >
              <div className="sm:col-span-2 text-[13px] text-hi">
                Referee {index + 1}
              </div>
              <input
                className={INPUT}
                placeholder="Full name"
                value={String(referee.name ?? "")}
                onChange={(event) =>
                  updateReferee({ name: event.target.value })
                }
              />
              <input
                className={INPUT}
                type="email"
                placeholder="Email"
                value={String(referee.email ?? "")}
                onChange={(event) =>
                  updateReferee({ email: event.target.value })
                }
              />
              <select
                className={INPUT}
                value={String(referee.relationship ?? "")}
                onChange={(event) =>
                  updateReferee({ relationship: event.target.value })
                }
              >
                <option value="">Relationship…</option>
                {manifest.allowedRelationships.map((relationship) => (
                  <option key={relationship} value={relationship}>
                    {relationship}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-[12px] text-mid">
                <input
                  type="checkbox"
                  checked={referee.consentConfirmed === true}
                  onChange={(event) =>
                    updateReferee({
                      consentConfirmed: event.target.checked,
                    })
                  }
                />
                I have permission to share this contact.
              </label>
            </div>
          );
        })}

      {(manifest.kind === "work_sample" || manifest.kind === "coding") && (
        <div className="rounded-lg border border-hairline bg-void2 p-4">
          <div className={LABEL}>Published AI-use policy</div>
          <p className="text-[12px] leading-relaxed text-mid">
            {manifest.aiPolicy === "forbidden"
              ? "AI assistance is not permitted for this exercise."
              : manifest.aiPolicy === "expected"
                ? "AI assistance is expected or welcomed; disclose exactly how it contributed."
                : "AI assistance is allowed only when disclosed."}
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            {[false, true].map((usedAi) => (
              <label
                key={String(usedAi)}
                className="flex items-center gap-2 text-[12px] text-hi"
              >
                <input
                  type="radio"
                  name={`ai-use-${block.id}`}
                  checked={recordAt(payload, "aiUse").usedAi === usedAi}
                  onChange={() =>
                    setPayload((current) => ({
                      ...current,
                      aiUse: {
                        ...recordAt(current, "aiUse"),
                        usedAi,
                      },
                    }))
                  }
                />
                {usedAi ? "I used AI tools" : "I did not use AI tools"}
              </label>
            ))}
          </div>
          {recordAt(payload, "aiUse").usedAi === true &&
            manifest.aiPolicy !== "forbidden" && (
              <textarea
                className={`${INPUT} mt-3 min-h-24`}
                maxLength={4_000}
                value={String(
                  recordAt(payload, "aiUse").details ?? "",
                )}
                onChange={(event) =>
                  setPayload((current) => ({
                    ...current,
                    aiUse: {
                      ...recordAt(current, "aiUse"),
                      details: event.target.value,
                    },
                  }))
                }
                placeholder="Name the tools and describe what they contributed."
              />
            )}
          <label className="mt-3 flex items-start gap-2 text-[12px] text-mid">
            <input
              className="mt-0.5"
              type="checkbox"
              checked={recordAt(payload, "aiUse").attested === true}
              onChange={(event) =>
                setPayload((current) => ({
                  ...current,
                  aiUse: {
                    ...recordAt(current, "aiUse"),
                    attested: event.target.checked,
                  },
                }))
              }
            />
            I confirm this AI-use statement is complete and accurate.
          </label>
        </div>
      )}

      {manifest.kind === "custom" && (
        <>
          <div className="rounded-lg border border-hairline bg-void2 p-4 text-[13px] leading-relaxed text-hi">
            {manifest.instructions}
          </div>
          {manifest.primitives.includes("text") && (
            <textarea
              className={`${INPUT} min-h-48`}
              value={typeof payload.text === "string" ? payload.text : ""}
              onChange={(event) =>
                setPayload((current) => ({
                  ...current,
                  text: event.target.value,
                }))
              }
            />
          )}
          {manifest.primitives.includes("file") && (
            <ArtifactInput
              applicationId={applicationId}
              blockId={block.id}
              lockVersion={lockVersion}
              label="Custom-stage attachment"
              onUploaded={(asset) =>
                setPayload((current) => ({
                  ...current,
                  files: [...arrayAt(current, "files"), asset],
                }))
              }
            />
          )}
          {(manifest.primitives.includes("choice") ||
            manifest.primitives.includes("grid") ||
            manifest.primitives.includes("recorder")) && (
            <p className="text-[12px] text-warn">
              This custom primitive has no complete published schema. The
              server will refuse submission until the employer configures it;
              no generic placeholder response is accepted.
            </p>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-[12px] leading-relaxed text-warn">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
        <button
          type="submit"
          disabled={busy || run.status === "blocked" || controlExpired}
          className="flex items-center gap-2 rounded-lg border border-hairline-strong bg-surface2 px-5 py-2.5 text-[13px] text-hi disabled:opacity-40"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
          Submit stage
        </button>
        {!block.required && (
          <button
            type="button"
            onClick={() => void skip()}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg border border-hairline px-4 py-2.5 text-[12px] text-mid disabled:opacity-40"
          >
            <SkipForward className="size-4" />
            Skip optional
          </button>
        )}
      </div>
    </form>
  );
}
