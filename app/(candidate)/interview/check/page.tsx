"use client";

/* Consent-first camera/microphone compatibility gate. Device access is requested
   only after the candidate presses the check button; the preview stays live until
   the candidate starts the interview, retries, or leaves this page. */

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, Globe2, Mic, Wifi } from "lucide-react";

type CheckState = "pending" | "checking" | "ok" | "failed" | "skipped";

const CHECKS = [
  { id: "camera", label: "Camera", icon: Camera, hint: "Live video track for recorded answers" },
  { id: "mic", label: "Microphone", icon: Mic, hint: "Live audio track for transcription" },
  { id: "browser", label: "Supported browser", icon: Globe2, hint: "Secure recording APIs are available" },
  { id: "connection", label: "Connection", icon: Wifi, hint: "Secure application endpoint is reachable" },
] as const;

function mediaAccessMessage(reason: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Camera and microphone require HTTPS, localhost, or 127.0.0.1. Reopen this application through a secure address.";
  }
  const name =
    reason instanceof DOMException
      ? reason.name
      : typeof reason === "object" && reason !== null && "name" in reason
        ? String((reason as { name?: unknown }).name ?? "")
        : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Device permission is blocked for this site. Allow camera and microphone in the browser address bar, then run the check again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No working camera or microphone was found. Connect both devices, or use the text accessibility mode.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "A camera or microphone is already in use by another tab or application. Close it there, then retry.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "The connected device cannot provide the requested media format. Try another device or use text mode.";
  }
  return "The browser could not start the camera and microphone. Check site permissions, close other camera apps, and retry.";
}

function SystemCheck() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedCode = params.get("code") ?? "";
  const applicationId = params.get("applicationId") ?? "";
  const demoTtsModeParam = params.get("wbxDemoTts");
  const demoTtsAnswerParam = params.get("wbxDemoAnswer");
  const demoTtsAnswersParam = params.get("wbxDemoAnswers");
  const [states, setStates] = useState<Record<string, CheckState>>(
    Object.fromEntries(CHECKS.map((c) => [c.id, "pending"])),
  );
  const [consent, setConsent] = useState(false);
  const [textOnly, setTextOnly] = useState(false);
  const [checking, setChecking] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [error, setError] = useState("");
  const [application, setApplication] = useState<{
    noticeVersion: number;
    lockVersion: number;
    retentionDays: number;
    code: string;
    consentAt: string | null;
    interviewMode: "video" | "text_accommodation";
  } | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meterFrameRef = useRef<number | null>(null);

  const stopPreview = useCallback(() => {
    if (meterFrameRef.current !== null) {
      cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
    setPreviewReady(false);
    setMicrophoneLevel(0);
  }, []);

  useEffect(() => stopPreview, [stopPreview]);

  useEffect(() => {
    if (!previewReady || !previewRef.current || !streamRef.current) return;
    previewRef.current.srcObject = streamRef.current;
    void previewRef.current.play();
  }, [previewReady]);

  useEffect(() => {
    if (!applicationId) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    void fetch(`/api/candidate/applications/${encodeURIComponent(applicationId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          throw new Error(
            "This browser does not have the secure application session. Return to the code page and enter the competition code in this browser.",
          );
        }
        if (!response.ok) throw new Error("Your secure application session expired.");
        return response.json() as Promise<{
          application: {
            noticeVersion: number;
            lockVersion: number;
            retentionDays: number;
            code: string;
            consentAt: string | null;
            interviewMode: "video" | "text_accommodation";
          };
        }>;
      })
      .then((body) => {
        if (cancelled) return;
        const textAccommodation =
          body.application.interviewMode === "text_accommodation";
        setApplication(body.application);
        setConsent(Boolean(body.application.consentAt));
        setTextOnly(textAccommodation);
        setStates((current) => ({
          ...current,
          camera: textAccommodation ? "skipped" : "pending",
          mic: textAccommodation ? "skipped" : "pending",
        }));
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load the application.");
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId, router]);

  const runChecks = async () => {
    if (checking) return;
    stopPreview();
    setChecking(true);
    setError("");
    setStates(Object.fromEntries(CHECKS.map((check) => [check.id, "checking"])));

    const browserOk =
      window.isSecureContext &&
      typeof window.fetch === "function" &&
      typeof window.crypto?.getRandomValues === "function" &&
      (textOnly ||
        (typeof window.MediaRecorder !== "undefined" &&
          typeof navigator.mediaDevices?.getUserMedia === "function"));
    setStates((current) => ({ ...current, browser: browserOk ? "ok" : "failed" }));

    try {
      const startedAt = Date.now();
      const response = await fetch("/api/health/live", {
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      const connectionOk = response.ok && Date.now() - startedAt < 5_000;
      setStates((current) => ({ ...current, connection: connectionOk ? "ok" : "failed" }));
    } catch {
      setStates((current) => ({ ...current, connection: "failed" }));
    }

    if (textOnly) {
      setStates((current) => ({ ...current, camera: "skipped", mic: "skipped" }));
      setChecking(false);
      return;
    }
    if (!browserOk) {
      setStates((current) => ({ ...current, camera: "failed", mic: "failed" }));
      setChecking(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const cameraOk = stream.getVideoTracks().some((track) => track.readyState === "live");
      const microphoneOk = stream.getAudioTracks().some((track) => track.readyState === "live");
      setStates((current) => ({
        ...current,
        camera: cameraOk ? "ok" : "failed",
        mic: microphoneOk ? "ok" : "failed",
      }));
      if (!cameraOk || !microphoneOk) {
        stream.getTracks().forEach((track) => track.stop());
        setError("Both a working camera and microphone are required for video mode.");
      } else {
        streamRef.current = stream;
        setPreviewReady(true);
        try {
          const audioContext = new AudioContext();
          audioContextRef.current = audioContext;
          await audioContext.resume();
          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          const samples = new Uint8Array(analyser.fftSize);
          const updateMeter = () => {
            analyser.getByteTimeDomainData(samples);
            const rms = Math.sqrt(
              samples.reduce((sum, sample) => {
                const normalized = (sample - 128) / 128;
                return sum + normalized * normalized;
              }, 0) / samples.length,
            );
            setMicrophoneLevel(Math.min(1, rms * 8));
            meterFrameRef.current = requestAnimationFrame(updateMeter);
          };
          updateMeter();
        } catch {
          setMicrophoneLevel(0);
        }
      }
    } catch (reason) {
      setStates((current) => ({ ...current, camera: "failed", mic: "failed" }));
      setError(mediaAccessMessage(reason));
    } finally {
      setChecking(false);
    }
  };

  const allOk =
    ["browser", "connection"].every((id) => states[id] === "ok") &&
    (textOnly ||
      ["camera", "mic"].every((id) => states[id] === "ok"));
  const checksRan = CHECKS.every(
    ({ id }) => states[id] !== "pending" && states[id] !== "checking",
  );

  const startInterview = async () => {
    if (!application || !applicationId || !allOk || !consent) return;
    setError("");
    try {
      const mode = textOnly ? "text_accommodation" : "video";
      if (!application.consentAt) {
        const response = await fetch(`/api/candidate/applications/${encodeURIComponent(applicationId)}/consent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accepted: true,
            noticeVersion: application.noticeVersion,
            expectedVersion: application.lockVersion,
            mode,
          }),
        });
        const body = (await response.json()) as {
          application?: { lockVersion: number };
          error?: string;
        };
        if (!response.ok || !body.application) {
          throw new Error(body.error || "Could not record consent.");
        }
      } else if (application.interviewMode !== mode) {
        const response = await fetch(
          `/api/candidate/applications/${encodeURIComponent(applicationId)}/accommodation`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode,
              expectedVersion: application.lockVersion,
            }),
          },
        );
        const body = (await response.json()) as {
          application?: { lockVersion: number };
          error?: string;
        };
        if (!response.ok || !body.application) {
          throw new Error(body.error || "Could not update the interview mode.");
        }
      }
      const code = application.code || requestedCode;
      stopPreview();
      const query = new URLSearchParams({ applicationId, code });
      if (demoTtsModeParam === "0" || demoTtsModeParam === "1") {
        query.set("wbxDemoTts", demoTtsModeParam);
      }
      if (demoTtsAnswerParam?.trim()) {
        query.set("wbxDemoAnswer", demoTtsAnswerParam.trim());
      }
      if (demoTtsAnswersParam?.trim()) {
        query.set("wbxDemoAnswers", demoTtsAnswersParam.trim());
      }
      router.push(`/interview/live?${query}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start the interview.");
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center px-6 pb-10">
      <div className="hud-label mt-2">
        {application?.code || requestedCode || "SECURE SESSION"} · STEP 2 OF 4 ·
        SYSTEM CHECK
      </div>
      <h1 className="mt-3 font-display text-[clamp(22px,3vw,30px)] font-medium tracking-[-0.015em] text-hi">
        Let&apos;s make sure everything works
      </h1>
      <p className="mt-2 text-[14px] text-mid">Video answers use your camera and microphone. A text accommodation remains available.</p>

      <button
        type="button"
        onClick={() => void runChecks()}
        disabled={checking || !application}
        className="mt-7 w-full max-w-[560px] rounded-lg border border-hairline-strong bg-surface2 py-3 text-[13px] text-hi disabled:cursor-not-allowed disabled:opacity-35"
      >
        {checking ? "Checking devices…" : checksRan ? "Run checks again" : "Run secure device checks"}
      </button>

      <div className="mt-4 w-full max-w-[560px] overflow-hidden rounded-xl border border-hairline bg-surface">
        {CHECKS.map((c) => {
          const st = states[c.id];
          return (
            <div key={c.id} className="flex items-center gap-4 border-b border-hairline px-5 py-4 last:border-b-0">
              <c.icon className="size-[18px] text-mid" strokeWidth={1.5} />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] text-hi">{c.label}</div>
                <div className="text-[12px] text-lo">{c.hint}</div>
              </div>
              {st === "checking" && <span className="pulse-dot size-2 rounded-full iris-line" />}
              {st === "ok" && (
                <span className="font-mono text-[10px] tracking-[0.08em] text-pos">OK</span>
              )}
              {st === "pending" && <span className="font-mono text-[10px] tracking-[0.08em] text-lo">—</span>}
              {st === "skipped" && <span className="font-mono text-[10px] tracking-[0.08em] text-mid">TEXT MODE</span>}
              {st === "failed" && <span className="font-mono text-[10px] tracking-[0.08em] text-neg">CHECK</span>}
            </div>
          );
        })}
      </div>

      {!textOnly && previewReady && (
        <div className="mt-4 w-full max-w-[560px] overflow-hidden rounded-xl border border-hairline bg-surface">
          <div className="aspect-video bg-black">
            <video
              ref={previewRef}
              muted
              playsInline
              autoPlay
              className="size-full object-cover [transform:scaleX(-1)]"
            />
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between text-[11px] text-mid">
              <span>Microphone activity</span>
              <span className="font-mono text-[9px] text-lo">
                SAY A SHORT TEST PHRASE
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-pos transition-[width] duration-75"
                style={{ width: `${Math.max(2, microphoneLevel * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <label className="mt-4 flex w-full max-w-[560px] cursor-pointer items-start gap-3 rounded-xl border border-hairline bg-void2 p-4">
        <input
          type="checkbox"
          checked={textOnly}
          onChange={(event) => {
            const enabled = event.target.checked;
            stopPreview();
            setTextOnly(enabled);
            setStates((current) => ({
              ...current,
              camera: enabled ? "skipped" : "pending",
              mic: enabled ? "skipped" : "pending",
            }));
            setError("");
          }}
          className="mt-0.5 size-4 accent-white/80"
        />
        <span className="text-[12px] leading-relaxed text-mid">
          I need the text-only accessibility mode. It uses the same questions and rubrics and is not penalized.
        </span>
      </label>

      {/* consent-first — explicit, plain-language */}
      <label className="mt-5 flex w-full max-w-[560px] cursor-pointer gap-3 rounded-xl border border-hairline bg-surface p-4">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-white/80" />
        <span className="text-[12.5px] leading-relaxed text-mid">
          I consent to the disclosed AI-conducted interview. In video mode, my camera and microphone recording is
          stored for up to {application?.retentionDays ?? "the disclosed number of"} days and transcribed for job-related evaluation.
          Camera imagery is not analyzed for gaze, emotion, appearance, or
          alleged reading behavior. A human remains responsible for the decision.
        </span>
      </label>

      <button
        onClick={() => void startInterview()}
        disabled={!allOk || !consent || !application}
        className="mt-6 w-full max-w-[560px] rounded-lg border border-hairline-strong bg-surface2 py-3.5 text-[15px] text-hi transition-colors hover:border-irisb/50 disabled:cursor-not-allowed disabled:opacity-35"
      >
        Start interview
      </button>
      {error && <p role="alert" className="mt-3 max-w-[560px] text-center text-[12px] leading-relaxed text-warn">{error}</p>}
      <p className="mt-3 font-mono text-[10px] tracking-[0.06em] text-lo">
        YOUR PROGRESS IS SAVED SECURELY · YOU CAN RESUME WITH THIS BROWSER
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <SystemCheck />
    </Suspense>
  );
}
