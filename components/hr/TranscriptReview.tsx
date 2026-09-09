"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShieldCheck, Video } from "lucide-react";
import type { InterviewTurn } from "@/lib/ai-contracts";

function statusLabel(turn: InterviewTurn): string {
  switch (turn.transcript?.reviewStatus) {
    case "provider_verified":
      return "PROVIDER TRANSCRIPT VERIFIED";
    case "human_verified":
      return "HUMAN VERIFIED";
    case "candidate_correction_pending":
      return "CORRECTION NEEDS VERIFICATION";
    case "provider_unavailable":
      return "MANUAL TRANSCRIPT NEEDS VERIFICATION";
    default:
      return "NO RECORDING TRANSCRIPT";
  }
}

export default function TranscriptReview({
  applicationId,
  initialLockVersion,
  initialHistory,
}: {
  applicationId: string;
  initialLockVersion: number;
  initialHistory: InterviewTurn[];
}) {
  const router = useRouter();
  const [history, setHistory] = useState(initialHistory);
  const [version, setVersion] = useState(initialLockVersion);
  const recordedTurns = useMemo(
    () =>
      history
        .map((turn, index) => ({ turn, turnNumber: index + 1 }))
        .filter(({ turn }) => Boolean(turn.recordingId)),
    [history],
  );
  const [selectedTurnNumber, setSelectedTurnNumber] = useState(
    recordedTurns[0]?.turnNumber ?? 1,
  );
  const selected = recordedTurns.find(
    ({ turnNumber }) => turnNumber === selectedTurnNumber,
  );
  const [reviewedTranscript, setReviewedTranscript] = useState(
    selected?.turn.transcript?.candidateCorrection ??
      selected?.turn.transcript?.providerTranscript ??
      selected?.turn.answer ??
      "",
  );
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const chooseTurn = (turnNumber: number, turn: InterviewTurn) => {
    setSelectedTurnNumber(turnNumber);
    setReviewedTranscript(
      turn.transcript?.candidateCorrection ??
        turn.transcript?.providerTranscript ??
        turn.answer ??
        "",
    );
    setReason("");
    setError("");
    setNotice("");
  };

  const verify = async () => {
    if (
      !selected ||
      pending ||
      !reviewedTranscript.trim() ||
      reason.trim().length < 8
    ) {
      return;
    }
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/hr/applications/${encodeURIComponent(applicationId)}/transcripts/${selected.turnNumber}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewedTranscript: reviewedTranscript.trim(),
            reason: reason.trim(),
            expectedVersion: version,
          }),
        },
      );
      const body = (await response.json()) as {
        application?: { lockVersion: number };
        transcript?: InterviewTurn["transcript"];
        answer?: string;
        error?: string;
      };
      if (!response.ok || !body.application || !body.transcript) {
        throw new Error(body.error || "Transcript verification failed.");
      }
      setVersion(body.application.lockVersion);
      setHistory((turns) =>
        turns.map((turn, index) =>
          index === selected.turnNumber - 1
            ? {
                ...turn,
                answer: body.answer ?? reviewedTranscript.trim(),
                transcript: body.transcript,
              }
            : turn,
        ),
      );
      setNotice(
        `Turn ${selected.turnNumber} is human-verified and eligible for evidence evaluation.`,
      );
      setReason("");
      router.refresh();
    } catch (reasonValue) {
      setError(
        reasonValue instanceof Error
          ? reasonValue.message
          : "Transcript verification failed.",
      );
    } finally {
      setPending(false);
    }
  };

  if (!selected) {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-8 text-center text-[13px] text-mid">
        This application has no recorded interview turns to verify.
      </div>
    );
  }

  const provenance = selected.turn.transcript;
  const reviewRequired =
    provenance?.reviewStatus === "candidate_correction_pending" ||
    provenance?.reviewStatus === "provider_unavailable";

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.3fr)]">
      <aside
        data-testid="transcript-turn-list"
        className="h-fit overflow-hidden rounded-xl border border-hairline bg-surface"
      >
        <div className="border-b border-hairline px-4 py-3">
          <div className="hud-label">RECORDED TURNS</div>
        </div>
        <div className="divide-y divide-hairline">
          {recordedTurns.map(({ turn, turnNumber }) => (
            <button
              key={turnNumber}
              type="button"
              data-turn-number={turnNumber}
              aria-pressed={turnNumber === selectedTurnNumber}
              onClick={() => chooseTurn(turnNumber, turn)}
              className={`block w-full px-4 py-3 text-left ${
                turnNumber === selectedTurnNumber
                  ? "bg-white/[0.04]"
                  : "hover:bg-white/[0.02]"
              }`}
            >
              <div className="font-mono text-[10px] text-lo">
                TURN {turnNumber} · {turn.topic.toUpperCase()}
              </div>
              <div className="mt-1 text-[12px] text-hi">
                {statusLabel(turn)}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="space-y-5">
        <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
          <div className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-4">
            <div>
              <div className="hud-label">
                TURN {selected.turnNumber} · PROVENANCE REVIEW
              </div>
              <p className="mt-1 text-[13px] text-hi">
                {selected.turn.question}
              </p>
            </div>
            <span className="font-mono text-[9px] text-lo">
              {statusLabel(selected.turn)}
            </span>
          </div>
          <div className="aspect-video bg-black">
            {selected.turn.recordingId ? (
              <video
                controls
                playsInline
                preload="metadata"
                aria-label={`Recorded answer for interview turn ${selected.turnNumber}`}
                src={`/api/hr/applications/${encodeURIComponent(applicationId)}/recordings/${encodeURIComponent(selected.turn.recordingId)}`}
                className="size-full bg-black object-contain"
              />
            ) : (
              <div className="grid size-full place-items-center">
                <Video className="size-8 text-lo" />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-hairline bg-surface p-5">
            <div className="hud-label">IMMUTABLE PROVIDER TRANSCRIPT</div>
            <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-mid">
              {provenance?.providerTranscript ||
                "The transcription provider returned no usable transcript."}
            </p>
            <p className="mt-3 break-all font-mono text-[9px] text-lo">
              SHA-256 · {provenance?.providerTranscriptSha256 ?? "UNAVAILABLE"}
            </p>
            <p className="mt-1 break-all font-mono text-[9px] text-lo">
              MODEL · {provenance?.providerModel ?? "UNAVAILABLE"}
            </p>
          </div>
          <div className="rounded-xl border border-hairline bg-surface p-5">
            <div className="hud-label">CANDIDATE CORRECTION · SEPARATE</div>
            <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-mid">
              {provenance?.candidateCorrection ||
                "No candidate correction was submitted."}
            </p>
            {provenance?.correctionReason && (
              <p className="mt-3 rounded-lg border border-hairline bg-void2 p-3 text-[11px] leading-relaxed text-lo">
                Reason: {provenance.correctionReason}
              </p>
            )}
            {provenance?.correctionDiff && (
              <p className="mt-3 font-mono text-[9px] text-lo">
                DIFF · {provenance.correctionDiff.removedLength} REMOVED ·{" "}
                {provenance.correctionDiff.addedLength} ADDED
              </p>
            )}
          </div>
        </div>

        {reviewRequired ? (
          <div className="rounded-xl border border-warn/30 bg-warn/5 p-5">
            <div className="flex items-center gap-2 text-[13px] text-warn">
              <ShieldCheck className="size-4" />
              Verify the selected transcript against the recording
            </div>
            <label
              htmlFor="reviewed-transcript"
              className="mt-4 block font-mono text-[9px] uppercase tracking-[0.06em] text-lo"
            >
              Server-selected reviewed transcript
            </label>
            <textarea
              id="reviewed-transcript"
              value={reviewedTranscript}
              onChange={(event) => setReviewedTranscript(event.target.value)}
              rows={7}
              className="iris-focus mt-2 w-full rounded-lg border border-hairline bg-void2 p-3 text-[13px] leading-relaxed text-hi"
            />
            <label
              htmlFor="verification-reason"
              className="mt-4 block font-mono text-[9px] uppercase tracking-[0.06em] text-lo"
            >
              Verification reason · required
            </label>
            <textarea
              id="verification-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={2_000}
              placeholder="I compared the complete clip with the text and corrected only transcription errors."
              className="iris-focus mt-2 w-full rounded-lg border border-hairline bg-void2 p-3 text-[12px] leading-relaxed text-hi placeholder:text-lo"
            />
            <button
              type="button"
              disabled={
                pending ||
                !reviewedTranscript.trim() ||
                reason.trim().length < 8
              }
              onClick={() => void verify()}
              className="mt-4 rounded-lg border border-hairline-strong bg-surface2 px-5 py-2.5 text-[13px] text-hi disabled:opacity-35"
            >
              {pending ? "Verifying…" : "Verify transcript and audit"}
            </button>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-pos/25 bg-pos/5 p-5">
            <CheckCircle2 className="mt-0.5 size-4 text-pos" />
            <div>
              <p className="text-[13px] text-hi">
                This turn is eligible for evidence evaluation.
              </p>
              <p className="mt-1 break-all font-mono text-[9px] text-lo">
                SELECTED SHA-256 ·{" "}
                {provenance?.reviewedTranscriptSha256 ?? "UNAVAILABLE"}
              </p>
            </div>
          </div>
        )}
        {notice && (
          <p role="status" className="text-[12px] text-pos">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-[12px] text-warn">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
