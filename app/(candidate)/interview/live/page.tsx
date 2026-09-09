"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Camera,
  CircleHelp,
  RotateCcw,
  Square,
  Video,
} from "lucide-react";
import { Cube } from "@/components/ui/primitives";
import type {
  CandidateRepairCapabilities,
  InterviewQuestionStrategy,
  InterviewStepResponse,
  InterviewTurn,
} from "@/lib/ai-contracts";
import type { CandidateBlockControlSnapshot } from "@/lib/server/assessment-controls";
import { candidateInterviewMayStartAttempt } from "@/lib/candidate-assessment-view";
import { countNaturalLanguageWords } from "@/lib/word-count";

type Phase = "connecting" | "thinking" | "answering" | "complete";
type CandidateRequest = "rephrase" | "alternate";
type CaptureState =
  | "idle"
  | "authorizing"
  | "recording"
  | "recorded"
  | "processing"
  | "ready";

interface CandidateApplicationSnapshot {
  id: string;
  code: string;
  title: string;
  stage: string;
  progress: number;
  lockVersion: number;
  interviewMode: "video" | "text_accommodation";
  history: InterviewTurn[];
  turnNumber: number;
  currentTurnNumber?: number | null;
  currentQuestion: InterviewTurn | null;
  repairCapabilities: CandidateRepairCapabilities;
  interviewControls?: CandidateBlockControlSnapshot;
  interviewPolicy?:
    | {
        kind: "chat_interview";
        minAnswerWords: number;
        maxAnswerWords: number;
        pastePolicy: "allow" | "warn" | "block";
      }
    | { kind: "async_interview" }
    | { kind: "live_ai_interview"; personaName: string };
}

type CandidateApplicationState = Omit<
  CandidateApplicationSnapshot,
  "currentTurnNumber"
> & {
  currentTurnNumber: number | null;
};

interface TurnResponse {
  step?: InterviewStepResponse;
  application?: {
    lockVersion: number;
    stage: string;
    currentTurnNumber: number | null;
    nextEntry?: "assessment" | "status";
    repairCapabilities: CandidateRepairCapabilities;
    interviewControls?: CandidateBlockControlSnapshot;
  };
  error?: string;
  code?: string;
}

class TurnRequestError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
    readonly stateMayHaveChanged: boolean,
  ) {
    super(message);
    this.name = "TurnRequestError";
  }
}

const NO_REPAIR_CAPABILITIES: CandidateRepairCapabilities = {
  rephrase: false,
  alternate: false,
  repairRemaining: 0,
  blockedReason: "no_open_question",
};

const QUESTION_STRATEGY_LABELS: Record<InterviewQuestionStrategy, string> = {
  published_main: "PUBLISHED MAIN",
  evidence_probe: "EVIDENCE PROBE",
  clarification: "CLARIFICATION",
  situational_alternative: "SITUATIONAL ALTERNATIVE",
};

function questionStrategyLabel(turn: InterviewTurn): string {
  const strategy =
    turn.strategy ?? (turn.kind === "followup" ? "evidence_probe" : "published_main");
  return QUESTION_STRATEGY_LABELS[strategy];
}

interface RecordingResponse {
  transcript?: string;
  warning?: string;
  receipt?: string;
  receiptExpiresAt?: string;
  recording?: { id: string; receipt?: string };
  transcription?: {
    status: "succeeded" | "unavailable";
    providerModel?: string;
    providerTranscriptSha256?: string;
  };
  error?: string;
}

interface DemoTtsCapture {
  audioTrack: MediaStreamTrack;
  context: AudioContext;
  recordingStream: MediaStream;
  source: AudioBufferSourceNode;
}

const DEMO_TTS_ENABLED_KEY = "whitebox.demo.tts.enabled";
const DEMO_TTS_ANSWER_KEY = "whitebox.demo.tts.answer";
const DEMO_TTS_ANSWERS_KEY = "whitebox.demo.tts.answers";
const DEMO_TTS_ANSWERS_INDEX_KEY = "whitebox.demo.tts.answers.index";
const DEMO_TTS_ANSWERS_REVISION_KEY = "whitebox.demo.tts.answers.revision";
const DEMO_TTS_ACTIVE_PREFIX = "whitebox.demo.tts.active.";

function parseDemoAnswerQueue(value: string | null): string[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length < 1 ||
      parsed.length > 20 ||
      !parsed.every(
        (item) =>
          typeof item === "string" &&
          item.trim().length >= 2 &&
          item.trim().length <= 4_096,
      )
    ) {
      return null;
    }
    return parsed.map((item) => (item as string).trim());
  } catch {
    return null;
  }
}

function nextQueuedDemoAnswer(
  applicationId: string,
  turnNumber: number,
): string {
  const answers = parseDemoAnswerQueue(
    sessionStorage.getItem(DEMO_TTS_ANSWERS_KEY),
  );
  const revision = sessionStorage.getItem(DEMO_TTS_ANSWERS_REVISION_KEY);
  if (!answers || !revision) return "";

  const activeKey = `${DEMO_TTS_ACTIVE_PREFIX}${applicationId}`;
  try {
    const activeRaw = sessionStorage.getItem(activeKey);
    const active = activeRaw
      ? (JSON.parse(activeRaw) as {
          revision?: unknown;
          turnNumber?: unknown;
          text?: unknown;
        })
      : null;
    if (
      active?.revision === revision &&
      active.turnNumber === turnNumber &&
      typeof active.text === "string"
    ) {
      return active.text;
    }
  } catch {
    sessionStorage.removeItem(activeKey);
  }

  const storedIndex = Number(
    sessionStorage.getItem(DEMO_TTS_ANSWERS_INDEX_KEY) ?? "0",
  );
  const index = Number.isSafeInteger(storedIndex) && storedIndex >= 0
    ? storedIndex
    : 0;
  const text = answers[index] ?? "";
  if (!text) return "";
  sessionStorage.setItem(
    activeKey,
    JSON.stringify({ revision, turnNumber, text }),
  );
  sessionStorage.setItem(DEMO_TTS_ANSWERS_INDEX_KEY, String(index + 1));
  return text;
}

async function prepareDemoTtsCapture(
  cameraStream: MediaStream,
  applicationId: string,
  text: string,
): Promise<DemoTtsCapture> {
  const context = new AudioContext();
  try {
    await context.resume();
    const response = await fetch("/api/demo/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId, text }),
    });
    if (!response.ok) {
      let message = "Demo speech could not be prepared.";
      try {
        const body = (await response.json()) as { error?: string };
        message = body.error || message;
      } catch {
        // Keep the stable client-safe message for a non-JSON provider failure.
      }
      throw new Error(message);
    }
    const audio = await context.decodeAudioData(await response.arrayBuffer());
    const destination = context.createMediaStreamDestination();
    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = 0.94;
    source.buffer = audio;
    source.connect(gain);
    gain.connect(destination);
    const audioTrack = destination.stream.getAudioTracks()[0];
    if (!audioTrack) throw new Error("Demo speech produced no audio track.");
    return {
      audioTrack,
      context,
      recordingStream: new MediaStream([
        ...cameraStream.getVideoTracks(),
        audioTrack,
      ]),
      source,
    };
  } catch (error) {
    void context.close();
    throw error;
  }
}

function recordingMimeType(): string {
  const options = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return options.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function formatBlockRemaining(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function LiveInterview() {
  const router = useRouter();
  const params = useSearchParams();
  const applicationId = params.get("applicationId") ?? "";
  const demoTtsModeParam = params.get("wbxDemoTts");
  const demoTtsAnswerParam = params.get("wbxDemoAnswer");
  const demoTtsAnswersParam = params.get("wbxDemoAnswers");
  const [textMode, setTextMode] = useState<boolean | null>(null);
  const [application, setApplication] =
    useState<CandidateApplicationState | null>(null);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [history, setHistory] = useState<InterviewTurn[]>([]);
  const [current, setCurrent] = useState<InterviewStepResponse | null>(null);
  const [answer, setAnswer] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [mediaReady, setMediaReady] = useState(false);
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recordingReceipt, setRecordingReceipt] = useState("");
  const [recordingId, setRecordingId] = useState("");
  const [receiptExpiresAt, setReceiptExpiresAt] = useState("");
  const [providerTranscript, setProviderTranscript] = useState("");
  const [providerTranscriptStatus, setProviderTranscriptStatus] = useState<
    "succeeded" | "unavailable" | ""
  >("");
  const [providerTranscriptSha256, setProviderTranscriptSha256] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [reRecordCount, setReRecordCount] = useState(0);
  const [candidateRequestPending, setCandidateRequestPending] =
    useState<CandidateRequest | null>(null);
  const [nextEntry, setNextEntry] = useState<"assessment" | "status">(
    "status",
  );
  const [pasteDetected, setPasteDetected] = useState(false);
  const [pasteAcknowledged, setPasteAcknowledged] = useState(false);
  const [interviewControls, setInterviewControls] =
    useState<CandidateBlockControlSnapshot | null>(null);
  const [blockRemainingSec, setBlockRemainingSec] = useState<
    number | undefined
  >(undefined);

  const historyRef = useRef<InterviewTurn[]>([]);
  const turnNumberRef = useRef<number | null>(null);
  const lockVersionRef = useRef(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const demoTtsCaptureRef = useRef<DemoTtsCapture | null>(null);
  const demoTtsStopTimerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingUrlRef = useRef("");
  const pendingRecordingRef = useRef<{ blob: Blob; mimeType: string } | null>(
    null,
  );
  const initialStepRequestedRef = useRef(false);

  const disposeDemoTtsCapture = useCallback(() => {
    if (demoTtsStopTimerRef.current !== null) {
      window.clearTimeout(demoTtsStopTimerRef.current);
      demoTtsStopTimerRef.current = null;
    }
    const capture = demoTtsCaptureRef.current;
    demoTtsCaptureRef.current = null;
    if (!capture) return;
    capture.source.onended = null;
    try {
      capture.source.stop();
    } catch {
      // The source may already have ended or may not have started yet.
    }
    capture.audioTrack.stop();
    void capture.context.close();
  }, []);

  useEffect(() => {
    try {
      if (demoTtsModeParam === "0") {
        sessionStorage.removeItem(DEMO_TTS_ENABLED_KEY);
        sessionStorage.removeItem(DEMO_TTS_ANSWER_KEY);
        sessionStorage.removeItem(DEMO_TTS_ANSWERS_KEY);
        sessionStorage.removeItem(DEMO_TTS_ANSWERS_INDEX_KEY);
        sessionStorage.removeItem(DEMO_TTS_ANSWERS_REVISION_KEY);
        sessionStorage.removeItem(`${DEMO_TTS_ACTIVE_PREFIX}${applicationId}`);
        return;
      }
      if (demoTtsModeParam === "1") {
        sessionStorage.setItem(DEMO_TTS_ENABLED_KEY, "1");
      }
      if (demoTtsAnswerParam?.trim()) {
        sessionStorage.setItem(
          DEMO_TTS_ANSWER_KEY,
          demoTtsAnswerParam.trim(),
        );
      }
      const scriptedAnswers = parseDemoAnswerQueue(demoTtsAnswersParam);
      if (scriptedAnswers) {
        sessionStorage.setItem(
          DEMO_TTS_ANSWERS_KEY,
          JSON.stringify(scriptedAnswers),
        );
        sessionStorage.setItem(DEMO_TTS_ANSWERS_INDEX_KEY, "0");
        sessionStorage.setItem(
          DEMO_TTS_ANSWERS_REVISION_KEY,
          window.crypto.randomUUID(),
        );
        sessionStorage.removeItem(`${DEMO_TTS_ACTIVE_PREFIX}${applicationId}`);
      }
    } catch {
      // Demo activation is optional; storage restrictions must not affect candidates.
    }
  }, [applicationId, demoTtsAnswerParam, demoTtsAnswersParam, demoTtsModeParam]);

  const resetCapture = useCallback(() => {
    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current);
      recordingUrlRef.current = "";
    }
    setRecordingUrl("");
    setRecordingReceipt("");
    setRecordingId("");
    setReceiptExpiresAt("");
    setProviderTranscript("");
    setProviderTranscriptStatus("");
    setProviderTranscriptSha256("");
    setCorrectionReason("");
    setCaptureState("idle");
    setElapsed(0);
    chunksRef.current = [];
    pendingRecordingRef.current = null;
  }, []);

  const applyCanonicalApplication = useCallback(
    (snapshot: CandidateApplicationSnapshot) => {
      const currentTurnNumber =
        snapshot.currentTurnNumber ??
        (snapshot.currentQuestion ? snapshot.turnNumber : null);
      const previousOpenQuestion = historyRef.current.at(-1);
      const preserveCurrentDraft =
        Boolean(snapshot.currentQuestion) &&
        Boolean(previousOpenQuestion && !previousOpenQuestion.answer) &&
        turnNumberRef.current === currentTurnNumber &&
        lockVersionRef.current === snapshot.lockVersion &&
        previousOpenQuestion?.questionId === snapshot.currentQuestion?.questionId &&
        previousOpenQuestion?.question === snapshot.currentQuestion?.question;
      const normalized: CandidateApplicationState = {
        ...snapshot,
        currentTurnNumber,
        repairCapabilities:
          snapshot.repairCapabilities ?? NO_REPAIR_CAPABILITIES,
      };

      setApplication(normalized);
      setInterviewControls(snapshot.interviewControls ?? null);
      setBlockRemainingSec(snapshot.interviewControls?.remainingSec);
      setTextMode(snapshot.interviewMode === "text_accommodation");
      setProgress(snapshot.progress);
      lockVersionRef.current = snapshot.lockVersion;
      turnNumberRef.current = currentTurnNumber;
      historyRef.current = snapshot.history;
      setHistory(snapshot.history);

      if (snapshot.currentQuestion) {
        setReRecordCount(
          Math.max(
            0,
            (snapshot.currentQuestion.recordingAttempts ?? 0) - 1,
          ),
        );
        setCurrent({
          done: false,
          ...snapshot.currentQuestion,
          progress: snapshot.progress,
        });

        if (!preserveCurrentDraft) {
          resetCapture();
          setAnswer("");
          setPasteDetected(false);
          setPasteAcknowledged(false);
          const pendingKey = `whitebox.pending-recording.${applicationId}`;
          try {
            const raw = sessionStorage.getItem(pendingKey);
            const pending = raw
              ? (JSON.parse(raw) as {
                  version?: number;
                  turnNumber?: number;
                  applicationVersion?: number;
                  receipt?: string;
                  recordingId?: string;
                  transcript?: string;
                  providerTranscript?: string;
                  providerTranscriptStatus?: "succeeded" | "unavailable";
                  providerTranscriptSha256?: string;
                  correctionReason?: string;
                  expiresAt?: string;
                })
              : null;
            if (
              pending?.version === 1 &&
              pending.turnNumber === currentTurnNumber &&
              pending.applicationVersion === snapshot.lockVersion &&
              typeof pending.receipt === "string" &&
              pending.receipt.length >= 16 &&
              typeof pending.expiresAt === "string" &&
              Date.parse(pending.expiresAt) > Date.now()
            ) {
              setRecordingReceipt(pending.receipt);
              setRecordingId(pending.recordingId ?? "");
              setReceiptExpiresAt(pending.expiresAt);
              setAnswer(pending.transcript ?? "");
              setProviderTranscript(pending.providerTranscript ?? "");
              setProviderTranscriptStatus(
                pending.providerTranscriptStatus ?? "unavailable",
              );
              setProviderTranscriptSha256(
                pending.providerTranscriptSha256 ?? "",
              );
              setCorrectionReason(pending.correctionReason ?? "");
              setCaptureState("ready");
            } else if (raw) {
              sessionStorage.removeItem(pendingKey);
            }
          } catch {
            sessionStorage.removeItem(pendingKey);
          }
        }
        setPhase("answering");
        return;
      }

      sessionStorage.removeItem(
        `whitebox.pending-recording.${applicationId}`,
      );
      resetCapture();
      setAnswer("");
      setReRecordCount(0);
      setCurrent(
        snapshot.stage === "in_progress"
          ? null
          : { done: true, progress: snapshot.progress },
      );
      setPhase(snapshot.stage === "in_progress" ? "connecting" : "complete");
    },
    [applicationId, resetCapture],
  );

  const loadCanonicalApplication = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(
        `/api/candidate/applications/${encodeURIComponent(applicationId)}`,
        { cache: "no-store", signal },
      );
      let body: { application?: CandidateApplicationSnapshot; error?: string };
      try {
        body = (await response.json()) as typeof body;
      } catch {
        throw new Error("The interview state response could not be read.");
      }
      if (!response.ok || !body.application) {
        throw new Error(body.error || "Candidate session expired.");
      }
      if (signal?.aborted) return null;
      applyCanonicalApplication(body.application);
      return body.application;
    },
    [applicationId, applyCanonicalApplication],
  );

  useEffect(() => {
    if (!applicationId) {
      router.replace("/");
      return;
    }
    const controller = new AbortController();
    void loadCanonicalApplication(controller.signal).catch((reason) => {
      if (controller.signal.aborted) return;
      setError(
        reason instanceof Error
          ? reason.message
          : "Candidate session unavailable.",
      );
      setPhase("connecting");
    });
    return () => controller.abort();
  }, [applicationId, loadCanonicalApplication, router]);

  useEffect(() => {
    if (textMode === null) return;
    if (textMode) {
      setMediaReady(false);
      disposeDemoTtsCapture();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMediaReady(false);
      setMediaError(
        "This browser cannot securely record camera and microphone. Use a current browser or the text accommodation.",
      );
      return;
    }

    let cancelled = false;
    setMediaReady(false);
    void navigator.mediaDevices
      .getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
        setMediaReady(true);
        setMediaError("");
      })
      .catch(() => {
        if (!cancelled) {
          setMediaReady(false);
          setMediaError("Camera or microphone is unavailable. Re-enable device access or use the text accommodation.");
        }
      });
    return () => {
      cancelled = true;
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.ondataavailable = null;
        recorderRef.current.onerror = null;
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      disposeDemoTtsCapture();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [disposeDemoTtsCapture, textMode]);

  useEffect(() => {
    if (phase !== "complete") return;
    disposeDemoTtsCapture();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setMediaReady(false);
  }, [disposeDemoTtsCapture, phase]);

  useEffect(() => {
    if (textMode || !videoRef.current || !streamRef.current) return;
    if (videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play();
    }
  }, [application, captureState, textMode]);

  useEffect(() => {
    if (captureState !== "recording") return;
    const timer = window.setInterval(() => {
      setElapsed((value) => value + 1);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [captureState]);

  useEffect(() => {
    setBlockRemainingSec(interviewControls?.remainingSec);
    if (!interviewControls?.timerExpiresAt) return;
    const serverOffsetMs =
      Date.parse(interviewControls.serverNow) - Date.now();
    const update = () =>
      setBlockRemainingSec(
        Math.max(
          0,
          Math.ceil(
            (Date.parse(interviewControls.timerExpiresAt!) -
              (Date.now() + serverOffsetMs)) /
              1_000,
          ),
        ),
      );
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [interviewControls]);

  useEffect(() => {
    if (!applicationId || !recordingReceipt || !receiptExpiresAt) return;
    const key = `whitebox.pending-recording.${applicationId}`;
    const expiresIn = Date.parse(receiptExpiresAt) - Date.now();
    const expireReceipt = () => {
      sessionStorage.removeItem(key);
      setRecordingReceipt("");
      setReceiptExpiresAt("");
      setCaptureState(pendingRecordingRef.current ? "recorded" : "idle");
      setMediaError(
        "The secure recording receipt expired. Upload the clip again before submitting.",
      );
    };
    if (expiresIn <= 0) {
      expireReceipt();
      return;
    }
    sessionStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        turnNumber: turnNumberRef.current,
        applicationVersion: lockVersionRef.current,
        receipt: recordingReceipt,
        recordingId,
        transcript: answer,
        providerTranscript,
        providerTranscriptStatus,
        providerTranscriptSha256,
        correctionReason,
        expiresAt: receiptExpiresAt,
      }),
    );
    const expiryTimer = window.setTimeout(
      expireReceipt,
      Math.min(expiresIn + 50, 2_147_000_000),
    );
    return () => window.clearTimeout(expiryTimer);
  }, [
    answer,
    applicationId,
    receiptExpiresAt,
    recordingId,
    recordingReceipt,
    providerTranscript,
    providerTranscriptSha256,
    providerTranscriptStatus,
    correctionReason,
  ]);

  const uploadRecording = useCallback(
    async (blob: Blob, mimeType: string) => {
      const turnNumber = turnNumberRef.current;
      const openQuestion = historyRef.current.at(-1);
      if (
        !applicationId ||
        !turnNumber ||
        !openQuestion ||
        openQuestion.answer
      ) {
        setCaptureState("recorded");
        setMediaError(
          "The interview question is not ready yet. Load the question before uploading an answer.",
        );
        return;
      }
      setCaptureState("processing");
      setMediaError("");
      const extension = mimeType.includes("mp4") ? "mp4" : "webm";
      const form = new FormData();
      form.append("recording", blob, `answer.${extension}`);
      form.append("expectedVersion", String(lockVersionRef.current));
      form.append("turnNumber", String(turnNumber));

      try {
        const response = await fetch(
          `/api/candidate/interviews/${encodeURIComponent(applicationId)}/recording`,
          { method: "POST", body: form },
        );
        const body = (await response.json()) as RecordingResponse;
        if (!response.ok) throw new Error(body.error || "Recording upload failed.");
        const receipt = body.receipt ?? body.recording?.receipt ?? "";
        if (!receipt) throw new Error("The recording receipt is missing.");
        setRecordingReceipt(receipt);
        setRecordingId(body.recording?.id ?? "");
        setReceiptExpiresAt(body.receiptExpiresAt ?? "");
        const rawTranscript = body.transcript?.trim() ?? "";
        setProviderTranscript(rawTranscript);
        setProviderTranscriptStatus(
          body.transcription?.status ?? (rawTranscript ? "succeeded" : "unavailable"),
        );
        setProviderTranscriptSha256(
          body.transcription?.providerTranscriptSha256 ?? "",
        );
        setCorrectionReason("");
        setAnswer(rawTranscript);
        setMediaError(body.warning ?? "");
        setCaptureState("ready");
      } catch (reason) {
        setCaptureState("recorded");
        setMediaError(
          reason instanceof Error
            ? reason.message
            : "Recording could not be processed. Try again.",
        );
      }
    },
    [applicationId],
  );

  const changeInterviewMode = useCallback(
    async (mode: "video" | "text_accommodation") => {
      if (
        !applicationId ||
        captureState === "recording" ||
        captureState === "authorizing" ||
        captureState === "processing" ||
        captureState === "ready"
      ) {
        return;
      }
      setMediaError("");
      try {
        const response = await fetch(
          `/api/candidate/applications/${encodeURIComponent(applicationId)}/accommodation`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode,
              expectedVersion: lockVersionRef.current,
            }),
          },
        );
        const body = (await response.json()) as {
          application?: {
            interviewMode: "video" | "text_accommodation";
            lockVersion: number;
          };
          error?: string;
        };
        if (!response.ok || !body.application) {
          throw new Error(body.error || "Interview mode could not be changed.");
        }
        lockVersionRef.current = body.application.lockVersion;
        setApplication((currentApplication) =>
          currentApplication
            ? {
                ...currentApplication,
                interviewMode: body.application!.interviewMode,
                lockVersion: body.application!.lockVersion,
              }
            : currentApplication,
        );
        sessionStorage.removeItem(
          `whitebox.pending-recording.${applicationId}`,
        );
        resetCapture();
        setReRecordCount(0);
        setAnswer("");
        setTextMode(body.application.interviewMode === "text_accommodation");
      } catch (reason) {
        setMediaError(
          reason instanceof Error
            ? reason.message
            : "Interview mode could not be changed.",
        );
      }
    },
    [applicationId, captureState, resetCapture],
  );

  const stopRecording = useCallback(async () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const startRecording = useCallback(async () => {
    const cameraStream = streamRef.current;
    const turnNumber = turnNumberRef.current;
    const openQuestion = historyRef.current.at(-1);
    if (
      !applicationId ||
      !cameraStream ||
      captureState === "recording" ||
      captureState === "authorizing" ||
      captureState === "processing" ||
      captureState === "ready"
    ) {
      return;
    }
    if (!turnNumber || !openQuestion || openQuestion.answer) {
      setMediaError(
        "The interview question is not ready yet. Load the question before recording an answer.",
      );
      return;
    }
    setMediaError("");
    disposeDemoTtsCapture();

    let demoScript = "";
    try {
      const demoEnabled =
        demoTtsModeParam === "1" ||
        (demoTtsModeParam !== "0" &&
          sessionStorage.getItem(DEMO_TTS_ENABLED_KEY) === "1");
      if (demoEnabled) {
        demoScript =
          nextQueuedDemoAnswer(applicationId, turnNumber) ||
          sessionStorage.getItem(DEMO_TTS_ANSWER_KEY)?.trim() ||
          demoTtsAnswerParam?.trim() ||
          "";
        if (!demoScript) {
          setMediaError(
            "The hidden demo speech mode needs an answer script before recording.",
          );
          return;
        }
      }
    } catch {
      // Storage restrictions simply leave the ordinary microphone path active.
    }

    let recordingStream = cameraStream;
    if (demoScript) {
      setCaptureState("authorizing");
      try {
        const capture = await prepareDemoTtsCapture(
          cameraStream,
          applicationId,
          demoScript,
        );
        demoTtsCaptureRef.current = capture;
        recordingStream = capture.recordingStream;
      } catch (reason) {
        setCaptureState(pendingRecordingRef.current ? "recorded" : "idle");
        setMediaError(
          reason instanceof Error
            ? reason.message
            : "Demo speech could not be prepared.",
        );
        return;
      }
    }

    const mimeType = recordingMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(recordingStream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 800_000,
        audioBitsPerSecond: 64_000,
      });
    } catch {
      disposeDemoTtsCapture();
      setMediaError(
        "The browser could not prepare a camera-and-microphone recording. Use a current browser or the text accommodation.",
      );
      return;
    }

    setCaptureState("authorizing");
    try {
      const response = await fetch(
        `/api/candidate/interviews/${encodeURIComponent(applicationId)}/attempt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: lockVersionRef.current,
            turnNumber,
          }),
        },
      );
      const body = (await response.json()) as {
        application?: { lockVersion: number };
        attempt?: {
          used: number;
          allowed: number;
          reRecordsRemaining: number;
        };
        error?: string;
      };
      if (!response.ok || !body.application || !body.attempt) {
        throw new Error(
          body.error || "The recording attempt could not be started.",
        );
      }
      lockVersionRef.current = body.application.lockVersion;
      historyRef.current = historyRef.current.map((turn, index) =>
        index === historyRef.current.length - 1
          ? { ...turn, recordingAttempts: body.attempt!.used }
          : turn,
      );
      setHistory(historyRef.current);
      setApplication((currentApplication) =>
        currentApplication
          ? {
              ...currentApplication,
              lockVersion: body.application!.lockVersion,
              history: historyRef.current,
              currentQuestion: historyRef.current.at(-1) ?? null,
            }
          : currentApplication,
      );
      setReRecordCount(Math.max(0, body.attempt.used - 1));
      sessionStorage.removeItem(
        `whitebox.pending-recording.${applicationId}`,
      );
    } catch (reason) {
      disposeDemoTtsCapture();
      setCaptureState(pendingRecordingRef.current ? "recorded" : "idle");
      setMediaError(
        reason instanceof Error
          ? reason.message
          : "The recording attempt could not be started.",
      );
      return;
    }

    resetCapture();
    setAnswer("");
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      disposeDemoTtsCapture();
      setCaptureState("idle");
      setMediaError("The browser could not record this answer. Try again or use text mode.");
    };
    recorder.onstop = () => {
      if (recorderRef.current === recorder) recorderRef.current = null;
      const type = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      disposeDemoTtsCapture();
      if (blob.size < 1_024) {
        setCaptureState("idle");
        setMediaError("The recording is empty. Check the camera and microphone, then try again.");
        return;
      }
      const url = URL.createObjectURL(blob);
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
      recordingUrlRef.current = url;
      pendingRecordingRef.current = { blob, mimeType: type };
      setRecordingUrl(url);
      setCaptureState("recorded");
    };
    recorder.start(1_000);
    setCaptureState("recording");
    setElapsed(0);
    const demoCapture = demoTtsCaptureRef.current;
    if (demoCapture) {
      demoCapture.source.onended = () => {
        demoTtsStopTimerRef.current = window.setTimeout(() => {
          demoTtsStopTimerRef.current = null;
          if (recorder.state === "recording") recorder.stop();
        }, 350);
      };
      try {
        demoCapture.source.start(demoCapture.context.currentTime + 0.45);
      } catch {
        if (recorder.state === "recording") recorder.stop();
        setMediaError("Demo speech could not be started. Please try again.");
      }
    }
  }, [
    applicationId,
    captureState,
    demoTtsAnswerParam,
    demoTtsModeParam,
    disposeDemoTtsCapture,
    resetCapture,
  ]);

  const confirmRecording = useCallback(() => {
    const pending = pendingRecordingRef.current;
    if (!pending || captureState !== "recorded") return;
    void uploadRecording(pending.blob, pending.mimeType);
  }, [captureState, uploadRecording]);

  useEffect(() => {
    const answerCap = Math.min(
      300,
      Math.max(30, historyRef.current.at(-1)?.answerCapSec ?? 180),
    );
    if (captureState === "recording" && elapsed >= answerCap) {
      void stopRecording();
    }
  }, [captureState, elapsed, stopRecording]);

  const step = useCallback(
    async (
      answerToSubmit?: string,
      receipt?: string,
      transcriptCorrectionReason?: string,
      candidateRequest?: CandidateRequest,
    ) => {
      if (!applicationId) return;
      const openingAttempt =
        !answerToSubmit &&
        !candidateRequest &&
        historyRef.current.length === 0;
      setCandidateRequestPending(candidateRequest ?? null);
      setPhase("thinking");
      setError("");
      try {
        const response = await fetch(
          `/api/candidate/interviews/${encodeURIComponent(applicationId)}/turn`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              answer: answerToSubmit,
              recordingReceipt: receipt || undefined,
              correctionReason: transcriptCorrectionReason || undefined,
              candidateRequest,
              pasteDetected:
                answerToSubmit &&
                application?.interviewPolicy?.kind === "chat_interview"
                  ? pasteDetected
                  : undefined,
              pasteAcknowledged:
                answerToSubmit &&
                application?.interviewPolicy?.kind === "chat_interview" &&
                pasteDetected
                  ? pasteAcknowledged
                  : undefined,
              expectedVersion: lockVersionRef.current,
            }),
          },
        );
        let data: TurnResponse;
        try {
          data = (await response.json()) as TurnResponse;
        } catch {
          throw new TurnRequestError(
            "The interview response could not be read.",
            undefined,
            response.ok || response.status >= 500,
          );
        }
        if (!response.ok) {
          throw new TurnRequestError(
            data.error || "Interview request failed.",
            data.code,
            response.status >= 500,
          );
        }
        if (!data.step || !data.application) {
          throw new TurnRequestError(
            "The interview response was incomplete.",
            undefined,
            true,
          );
        }
        lockVersionRef.current = data.application.lockVersion;
        turnNumberRef.current = data.application.currentTurnNumber;
        setProgress(data.step.progress);
        setCurrent(data.step);
        if (data.application.interviewControls) {
          setInterviewControls(data.application.interviewControls);
          setBlockRemainingSec(
            data.application.interviewControls.remainingSec,
          );
        }
        sessionStorage.removeItem(
          `whitebox.pending-recording.${applicationId}`,
        );
        resetCapture();
        setReRecordCount(0);
        setAnswer("");
        setPasteDetected(false);
        setPasteAcknowledged(false);
        const resolvedHistory = historyRef.current.map(
          (existingTurn, index) => {
            if (index !== historyRef.current.length - 1) {
              return existingTurn;
            }
            if (answerToSubmit) {
              return { ...existingTurn, answer: answerToSubmit };
            }
            if (candidateRequest) {
              return {
                ...existingTurn,
                resolution:
                  candidateRequest === "rephrase"
                    ? ("candidate_requested_rephrase" as const)
                    : ("candidate_requested_alternate" as const),
              };
            }
            return existingTurn;
          },
        );
        const repairCapabilities =
          data.application.repairCapabilities ?? NO_REPAIR_CAPABILITIES;
        if (data.step.done) {
          setNextEntry(data.application.nextEntry ?? "status");
          historyRef.current = resolvedHistory;
          setHistory(resolvedHistory);
          setApplication((existingApplication) =>
            existingApplication
              ? {
                  ...existingApplication,
                  stage: data.application!.stage,
                  lockVersion: data.application!.lockVersion,
                  history: resolvedHistory,
                  turnNumber: resolvedHistory.length,
                  currentTurnNumber: null,
                  currentQuestion: null,
                  repairCapabilities,
                }
              : existingApplication,
          );
          setPhase("complete");
        } else {
          const turn: InterviewTurn = {
            question: data.step.question!,
            topic: data.step.topic!,
            kind: data.step.kind!,
            questionId: data.step.questionId,
            thinkTimeSec: data.step.thinkTimeSec,
            answerCapSec: data.step.answerCapSec,
            modality: data.step.modality,
            reRecordAttempts: data.step.reRecordAttempts,
            recordingAttempts: 0,
            notesAllowed: data.step.notesAllowed,
            strategy: data.step.strategy,
          };
          historyRef.current = [...resolvedHistory, turn];
          setHistory(historyRef.current);
          setApplication((existingApplication) =>
            existingApplication
              ? {
                  ...existingApplication,
                  stage: data.application!.stage,
                  lockVersion: data.application!.lockVersion,
                  history: historyRef.current,
                  turnNumber:
                    data.application!.currentTurnNumber ??
                    historyRef.current.length,
                  currentTurnNumber: data.application!.currentTurnNumber,
                  currentQuestion: turn,
                  repairCapabilities,
                }
              : existingApplication,
          );
          setPhase("answering");
        }
        if (openingAttempt) {
          // The initial turn atomically starts the server-owned attempt. Reload
          // only after that commit so chat limits/persona and the exact current
          // manifest are never disclosed while the run is merely available.
          await loadCanonicalApplication();
        }
      } catch (reason) {
        const shouldRecoverCanonicalState =
          reason instanceof TurnRequestError
            ? reason.code === "VERSION_CONFLICT" ||
              reason.stateMayHaveChanged
            : true;
        if (shouldRecoverCanonicalState) {
          try {
            const canonical = await loadCanonicalApplication();
            if (canonical) {
              setError(
                reason instanceof TurnRequestError &&
                  reason.code === "VERSION_CONFLICT"
                  ? "The interview changed in another request. The latest saved state is now loaded."
                  : "The connection was interrupted. The latest saved interview state is now loaded.",
              );
              return;
            }
          } catch {
            // Keep the local answer or recording intact when canonical recovery
            // itself is unavailable. A manual retry remains possible.
          }
        }
        setError(
          reason instanceof Error ? reason.message : "Connection error.",
        );
        const initialQuestionFailed =
          !answerToSubmit &&
          !candidateRequest &&
          historyRef.current.length === 0;
        if (initialQuestionFailed) {
          initialStepRequestedRef.current = false;
          turnNumberRef.current = null;
          setPhase("connecting");
        } else {
          setPhase("answering");
        }
      } finally {
        setCandidateRequestPending(null);
      }
    },
    [
      application?.interviewPolicy,
      applicationId,
      loadCanonicalApplication,
      pasteAcknowledged,
      pasteDetected,
      resetCapture,
    ],
  );

  const requestQuestionAdaptation = useCallback(
    (candidateRequest: CandidateRequest) => {
      if (
        candidateRequestPending ||
        phase !== "answering" ||
        !historyRef.current.at(-1) ||
        historyRef.current.at(-1)?.answer ||
        !application?.repairCapabilities[candidateRequest] ||
        captureState !== "idle"
      ) {
        return;
      }
      void step(undefined, undefined, undefined, candidateRequest);
    },
    [application, candidateRequestPending, captureState, phase, step],
  );

  useEffect(() => {
    const deliveryReady = candidateInterviewMayStartAttempt(
      textMode,
      mediaReady,
    );
    if (
      !application ||
      application.currentQuestion ||
      application.stage !== "in_progress" ||
      !deliveryReady
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (initialStepRequestedRef.current) return;
      initialStepRequestedRef.current = true;
      setError("");
      void step();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [application, mediaReady, step, textMode]);

  const submit = () => {
    if (!application || answer.trim().length === 0) return;
    if (
      interviewControls?.expiredReason ||
      (interviewControls?.timerExpiresAt && blockRemainingSec === 0)
    ) {
      setError(
        "The published interview timer has ended. A named reviewer must decide the next step.",
      );
      return;
    }
    if (application.interviewPolicy?.kind === "chat_interview") {
      const words = countNaturalLanguageWords(answer);
      if (
        words < application.interviewPolicy.minAnswerWords ||
        words > application.interviewPolicy.maxAnswerWords
      ) {
        setError(
          `Answer must contain ${application.interviewPolicy.minAnswerWords}–${application.interviewPolicy.maxAnswerWords} words; currently ${words}.`,
        );
        return;
      }
      if (
        pasteDetected &&
        application.interviewPolicy.pastePolicy === "warn" &&
        !pasteAcknowledged
      ) {
        setError("Acknowledge the paste notice before submitting.");
        return;
      }
    }
    if (!textMode && !recordingReceipt) {
      setMediaError("Record and securely upload the answer before submitting it.");
      return;
    }
    const transcriptChanged =
      !textMode &&
      (providerTranscriptStatus !== "succeeded" ||
        answer.trim() !== providerTranscript.trim());
    if (transcriptChanged && correctionReason.trim().length < 8) {
      setMediaError(
        "Explain the manual transcript or correction in at least 8 characters.",
      );
      return;
    }
    const submittedAnswer = answer.trim();
    void step(
      submittedAnswer,
      recordingReceipt,
      transcriptChanged ? correctionReason.trim() : undefined,
    );
  };

  useEffect(
    () => () => {
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    },
    [],
  );

  if (!application || textMode === null) {
    return error ? (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-[14px] text-warn">
        {error} Return to the competition-code page and resume.
      </div>
    ) : null;
  }

  const lastQuestion = history[history.length - 1];
  const questionReady =
    Boolean(lastQuestion && !lastQuestion.answer) &&
    (turnNumberRef.current ?? 0) >= 1;
  const answerCapSec = Math.min(
    300,
    Math.max(30, lastQuestion?.answerCapSec ?? 180),
  );
  const allowedReRecords = lastQuestion?.reRecordAttempts ?? 1;
  const attemptLimitReached =
    (lastQuestion?.recordingAttempts ?? 0) >= allowedReRecords + 1;
  const transcriptCorrectionRequired =
    !textMode &&
    captureState === "ready" &&
    (providerTranscriptStatus !== "succeeded" ||
      answer.trim() !== providerTranscript.trim());
  const candidateActionsBlocked =
    candidateRequestPending !== null ||
    phase !== "answering" ||
    !questionReady ||
    captureState !== "idle";
  const minutes = Math.floor(elapsed / 60);
  const seconds = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="flex flex-1 flex-col items-center px-6 pb-8">
      <div className="hud-label mt-2">
        {application.code} · {application.title.toUpperCase()} ·{" "}
        {textMode ? "AI INTERVIEW · TEXT ACCOMMODATION" : "AI VIDEO INTERVIEW"}
        {application.interviewPolicy?.kind === "live_ai_interview"
          ? ` · ${application.interviewPolicy.personaName.toUpperCase()}`
          : ""}
      </div>
      <div className="mt-4 h-px w-full max-w-[980px] bg-white/8">
        <div
          className="h-px transition-all duration-700"
          style={{
            width: `${Math.round(progress * 100)}%`,
            background: "var(--iris-gradient)",
          }}
        />
      </div>
      {(interviewControls?.timerExpiresAt ||
        interviewControls?.deadlineAt) && (
        <div className="mt-3 flex w-full max-w-[980px] flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 font-mono text-[9px] uppercase tracking-[.05em] text-mid">
          <span>
            {interviewControls.timerExpiresAt
              ? `Server timer ${formatBlockRemaining(blockRemainingSec ?? 0)}`
              : "No whole-interview hard timer"}
          </span>
          {interviewControls.deadlineAt && (
            <span>
              Deadline{" "}
              {new Date(interviewControls.deadlineAt).toLocaleString()}
            </span>
          )}
          {interviewControls.canRetake && (
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/assessment?applicationId=${encodeURIComponent(application.id)}&code=${encodeURIComponent(application.code)}`,
                )
              }
              className="text-lo underline underline-offset-2 hover:text-hi"
            >
              Technical retake controls
            </button>
          )}
        </div>
      )}

      <div className="grid w-full max-w-[980px] flex-1 grid-cols-1 gap-6 py-6 lg:grid-cols-[minmax(280px,0.82fr)_minmax(0,1.18fr)]">
        <section className="flex min-h-[360px] flex-col overflow-hidden rounded-2xl border border-hairline bg-surface lg:min-h-[420px]">
          <div className="relative flex-1 bg-black">
            {textMode ? (
              <div className="absolute inset-0 grid place-items-center p-8 text-center">
                <div>
                  <Camera className="mx-auto size-9 text-lo" />
                  <div className="mt-4 text-[14px] text-hi">Text accommodation active</div>
                  <p className="mt-2 text-[12px] leading-relaxed text-mid">
                    The same questions and rubrics apply. No camera-based
                    behavioral analysis is performed in either mode.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  autoPlay
                  className={`absolute inset-0 size-full object-cover [transform:scaleX(-1)] ${
                    (captureState === "recorded" || captureState === "ready") &&
                    recordingUrl
                      ? "invisible"
                      : ""
                  }`}
                />
                {(captureState === "recorded" || captureState === "ready") &&
                  recordingUrl && (
                  <video
                    src={recordingUrl}
                    controls
                    playsInline
                    className="absolute inset-0 size-full bg-black object-contain"
                  />
                )}
              </>
            )}
            {!textMode && (
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 font-mono text-[10px] text-white backdrop-blur">
                <span
                  className={`size-2 rounded-full ${
                    captureState === "recording" ? "animate-pulse bg-neg" : "bg-pos"
                  }`}
                />
                {captureState === "recording"
                  ? `REC ${minutes}:${seconds} / ${Math.floor(answerCapSec / 60)}:${String(answerCapSec % 60).padStart(2, "0")}`
                  : captureState === "recorded" || captureState === "ready"
                    ? "CLIP READY"
                    : "CAMERA READY"}
              </div>
            )}
          </div>
          {(phase === "answering" || phase === "thinking") && lastQuestion && (
            <div className="border-t border-hairline bg-void2 p-4 lg:hidden">
              <div className="hud-label">
                {questionStrategyLabel(lastQuestion)} ·{" "}
                {lastQuestion.topic.toUpperCase()}
              </div>
              <p className="mt-2 text-[15px] font-medium leading-snug text-hi">
                {lastQuestion.question}
              </p>
              <p className="mt-2 font-mono text-[9px] leading-relaxed text-lo">
                ANSWER CAP {answerCapSec}s · {allowedReRecords} RE-RECORD
                {allowedReRecords === 1 ? "" : "S"} ·{" "}
                {lastQuestion.notesAllowed ? "NOTES ALLOWED" : "NO PREPARED SCRIPT"}
              </p>
            </div>
          )}
          <div className="border-t border-hairline p-4">
            {textMode ? (
              <button
                type="button"
                onClick={() => void changeInterviewMode("video")}
                className="w-full rounded-lg border border-hairline px-4 py-2.5 text-[12px] text-mid hover:text-hi"
              >
                Return to video mode
              </button>
            ) : captureState === "recording" ? (
              <button
                type="button"
                onClick={() => void stopRecording()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-neg px-4 py-3 text-[13px] font-medium text-white"
              >
                <Square className="size-4 fill-current" /> Stop answer
              </button>
            ) : captureState === "recorded" ? (
              <div className="grid grid-cols-2 gap-2">
                {reRecordCount < allowedReRecords && (
                  <button
                    type="button"
                    onClick={() => {
                      void startRecording();
                    }}
                    className="flex items-center justify-center gap-2 rounded-lg border border-hairline px-4 py-2.5 text-[12px] text-mid hover:text-hi"
                  >
                    <RotateCcw className="size-3.5" /> Re-record (
                    {allowedReRecords - reRecordCount} left)
                  </button>
                )}
                <button
                  type="button"
                  onClick={confirmRecording}
                  className={`rounded-lg border border-hairline-strong bg-surface2 px-4 py-2.5 text-[12px] text-hi hover:border-irisb/50 ${
                    reRecordCount >= allowedReRecords ? "col-span-2" : ""
                  }`}
                >
                  Use recording
                </button>
              </div>
            ) : captureState === "processing" ? (
              <div className="rounded-lg border border-hairline px-4 py-3 text-center font-mono text-[11px] text-mid">
                UPLOADING · VALIDATING SECURE MEDIA · TRANSCRIBING…
              </div>
            ) : captureState === "authorizing" ? (
              <div className="rounded-lg border border-hairline px-4 py-3 text-center font-mono text-[11px] text-mid">
                RESERVING RECORDING ATTEMPT…
              </div>
            ) : captureState === "ready" ? (
              <div className="rounded-lg border border-pos/25 bg-pos/5 px-4 py-2.5 text-center font-mono text-[10px] tracking-[0.05em] text-pos">
                {recordingUrl
                  ? "SECURELY UPLOADED · REVIEW CLIP ABOVE"
                  : "SECURE UPLOAD RESTORED · RECEIPT READY"}
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => void startRecording()}
                  disabled={
                    !mediaReady ||
                    phase !== "answering" ||
                    !questionReady ||
                    attemptLimitReached
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-hairline-strong bg-surface2 px-4 py-3 text-[13px] text-hi disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Video className="size-4" />{" "}
                  {attemptLimitReached
                    ? "Recording attempt limit reached"
                    : "Start recorded answer"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void changeInterviewMode("text_accommodation")
                  }
                  disabled={phase !== "answering" || !questionReady}
                  className="w-full px-3 py-1.5 text-[11px] text-lo underline-offset-2 hover:text-mid hover:underline disabled:opacity-35"
                >
                  Use text accessibility mode
                </button>
              </div>
            )}
            {mediaError && (
              <div className="mt-3 rounded-lg border border-warn/30 bg-warn/5 p-3 text-[11px] leading-relaxed text-warn">
                {mediaError}
                <button
                  type="button"
                  onClick={() => {
                    streamRef.current?.getTracks().forEach((track) => track.stop());
                    streamRef.current = null;
                    setMediaReady(false);
                    void changeInterviewMode("text_accommodation");
                  }}
                  className="mt-2 block underline underline-offset-2"
                >
                  Use text accommodation
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-hairline bg-void2 p-7 lg:min-h-[420px]">
          <div className={phase === "thinking" || phase === "connecting" ? "pulse-dot" : ""}>
            <Cube size={phase === "complete" ? 110 : 72} />
          </div>

          {phase === "connecting" && (
            <div className="mt-7 max-w-[46ch] text-center">
              <p className="font-mono text-[11px] tracking-[0.1em] text-lo">
                {error
                  ? "QUESTION NOT LOADED"
                  : "CONNECTING · PREPARING THE INTERVIEW…"}
              </p>
              {error && (
                <>
                  <p className="mt-3 text-[13px] leading-relaxed text-warn">
                    {error}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (!application) {
                        window.location.reload();
                        return;
                      }
                      initialStepRequestedRef.current = true;
                      setError("");
                      void step();
                    }}
                    className="mt-4 rounded-lg border border-hairline-strong bg-surface2 px-5 py-2.5 text-[13px] text-hi"
                  >
                    {application ? "Retry loading question" : "Reload interview"}
                  </button>
                </>
              )}
            </div>
          )}
          {phase === "thinking" && (
            <p className="mt-7 font-mono text-[11px] tracking-[0.1em] text-lo">
              SAVING · PREPARING THE NEXT QUESTION…
            </p>
          )}

          {(phase === "answering" || phase === "thinking") && lastQuestion && (
            <div className="mt-7 hidden w-full text-center lg:block">
              <div className="hud-label">
                {questionStrategyLabel(lastQuestion)} ·{" "}
                {lastQuestion.topic.toUpperCase()}
              </div>
              <p className="mx-auto mt-3 max-w-[36ch] font-display text-[clamp(19px,2.4vw,26px)] font-medium leading-snug tracking-[-0.01em] text-hi">
                {lastQuestion.question}
              </p>
              <p className="mt-3 font-mono text-[9px] tracking-[0.05em] text-lo">
                {lastQuestion.thinkTimeSec
                  ? `PREPARATION ALLOWANCE ${lastQuestion.thinkTimeSec}s · `
                  : ""}
                ANSWER CAP {answerCapSec}s · {allowedReRecords} RE-RECORD
                {allowedReRecords === 1 ? "" : "S"} ·{" "}
                {lastQuestion.notesAllowed ? "NOTES ALLOWED" : "NO PREPARED SCRIPT"}
              </p>
            </div>
          )}

          {phase === "answering" && (
            <div className="mt-7 w-full">
              {error && (
                <p className="mb-3 text-center text-[13px] text-warn">{error}</p>
              )}
              {questionReady && (
                <div className="mb-5">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => requestQuestionAdaptation("rephrase")}
                      disabled={
                        candidateActionsBlocked ||
                        !application.repairCapabilities.rephrase
                      }
                      className="rounded-lg border border-hairline bg-surface px-4 py-2.5 text-[12px] text-mid transition-colors hover:border-hairline-strong hover:text-hi disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Rephrase question
                    </button>
                    <button
                      type="button"
                      onClick={() => requestQuestionAdaptation("alternate")}
                      disabled={
                        candidateActionsBlocked ||
                        !application.repairCapabilities.alternate
                      }
                      className="rounded-lg border border-hairline bg-surface px-4 py-2.5 text-[12px] text-mid transition-colors hover:border-hairline-strong hover:text-hi disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Use a hypothetical scenario
                    </button>
                  </div>
                </div>
              )}
              {(textMode || captureState === "ready") && (
                <>
                  <label htmlFor="candidate-answer" className="hud-label">
                    {textMode ? "YOUR ANSWER" : "TRANSCRIPT · REVIEW AND CORRECT"}
                  </label>
                  <textarea
                    id="candidate-answer"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    onPaste={(event) => {
                      if (
                        application.interviewPolicy?.kind !==
                        "chat_interview"
                      ) {
                        return;
                      }
                      if (
                        application.interviewPolicy.pastePolicy === "block"
                      ) {
                        event.preventDefault();
                        setPasteDetected(false);
                        setPasteAcknowledged(false);
                        setError(
                          "Paste is disabled by the published response policy. Type the answer in this field.",
                        );
                      } else {
                        setPasteDetected(true);
                        setPasteAcknowledged(false);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
                    }}
                    rows={5}
                    autoFocus={textMode}
                    className="iris-focus mt-2 w-full rounded-xl border border-hairline bg-surface p-4 text-[14px] leading-relaxed text-hi placeholder:text-lo"
                    placeholder={
                      textMode
                        ? "Answer in your own words…"
                        : "The transcript appears here after secure processing. Correct transcription errors before submitting."
                    }
                  />
                  {application.interviewPolicy?.kind ===
                    "chat_interview" && (
                    <div className="mt-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-[10px] leading-relaxed text-mid">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span>
                          {countNaturalLanguageWords(answer)} words · required{" "}
                          {application.interviewPolicy.minAnswerWords}–
                          {application.interviewPolicy.maxAnswerWords}
                        </span>
                        <span>
                          Paste policy:{" "}
                          {application.interviewPolicy.pastePolicy}
                        </span>
                      </div>
                      {pasteDetected &&
                        application.interviewPolicy.pastePolicy ===
                          "warn" && (
                          <label className="mt-2 flex items-start gap-2 text-warn">
                            <input
                              className="mt-0.5"
                              type="checkbox"
                              checked={pasteAcknowledged}
                              onChange={(event) =>
                                setPasteAcknowledged(event.target.checked)
                              }
                            />
                            I acknowledge that pasted material is permitted
                            with a warning under this published response
                            policy.
                          </label>
                        )}
                    </div>
                  )}
                  {transcriptCorrectionRequired && (
                    <div className="mt-3 rounded-lg border border-warn/25 bg-warn/5 p-3">
                      <label
                        htmlFor="transcript-correction-reason"
                        className="font-mono text-[9px] uppercase tracking-[0.06em] text-warn"
                      >
                        {providerTranscriptStatus === "unavailable"
                          ? "Manual transcript explanation · required"
                          : "Transcript correction explanation · required"}
                      </label>
                      <textarea
                        id="transcript-correction-reason"
                        value={correctionReason}
                        onChange={(event) =>
                          setCorrectionReason(event.target.value)
                        }
                        rows={2}
                        maxLength={1_000}
                        className="iris-focus mt-2 w-full rounded-lg border border-hairline bg-void2 p-3 text-[12px] leading-relaxed text-hi placeholder:text-lo"
                        placeholder={
                          providerTranscriptStatus === "unavailable"
                            ? "Automatic transcription was unavailable; I entered what I said in the recording."
                            : "Describe what the automatic transcript got wrong."
                        }
                      />
                      <p className="mt-2 text-[10px] leading-relaxed text-lo">
                        The original provider transcript remains immutable. A
                        human must verify manual or corrected text against the
                        recording before AI evaluation.
                      </p>
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <CircleHelp className="size-4 text-lo" />
                      <span className="font-mono text-[9px] tracking-[0.05em] text-lo">
                        APPEARANCE AND VOICE NEVER AFFECT THE SCORE
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={submit}
                      disabled={
                        answer.trim().length === 0 ||
                        Boolean(interviewControls?.expiredReason) ||
                        Boolean(
                          interviewControls?.timerExpiresAt &&
                            blockRemainingSec === 0,
                        ) ||
                        (transcriptCorrectionRequired &&
                          correctionReason.trim().length < 8) ||
                        captureState === "recording" ||
                        captureState === "processing"
                      }
                      className="rounded-lg border border-hairline-strong bg-surface2 px-5 py-2.5 text-[13px] text-hi disabled:opacity-35"
                    >
                      Submit answer
                    </button>
                  </div>
                </>
              )}
              {!textMode && captureState !== "ready" && (
                <p className="mt-4 text-center text-[11px] leading-relaxed text-lo">
                  You may look away, use permitted notes, or use assistive
                  technology. Camera imagery is not analyzed for gaze, emotion,
                  appearance, or alleged reading behavior.
                </p>
              )}
            </div>
          )}

          {phase === "complete" && (
            <div className="mt-8 max-w-[52ch] text-center">
              <h1 className="font-display text-[clamp(22px,3vw,30px)] font-medium tracking-[-0.015em] text-hi">
                Interview complete
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-mid">
                {current?.closing ||
                  "Your answers are saved. A human reviewer remains responsible for the hiring decision."}
              </p>
              <button
                onClick={() =>
                  router.push(
                    `/${nextEntry}?applicationId=${encodeURIComponent(application.id)}&code=${encodeURIComponent(application.code)}`,
                  )
                }
                className="mt-7 rounded-lg border border-hairline-strong bg-surface2 px-7 py-3 text-[15px] text-hi"
              >
                {nextEntry === "assessment"
                  ? "Continue assessment"
                  : "Track my status"}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <LiveInterview />
    </Suspense>
  );
}
