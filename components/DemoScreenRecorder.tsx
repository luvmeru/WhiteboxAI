"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CaptureStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "saving"
  | "saved"
  | "error";

declare global {
  interface Window {
    __whiteboxDemoCapture?: {
      start: () => Promise<void>;
      stop: () => void;
      status: () => CaptureStatus;
    };
  }
}

function safeSegmentName(value: string | null): string {
  const normalized = (value ?? "01-hr-login")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return normalized || "01-hr-login";
}

export default function DemoScreenRecorder() {
  const [enabled, setEnabled] = useState(false);
  const [segment, setSegment] = useState("01-hr-login");
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const localDemoHost = ["127.0.0.1", "localhost"].includes(
      window.location.hostname,
    );
    const recordDemo = params.get("recordDemo");
    if (recordDemo === "0") {
      window.sessionStorage.setItem("wbxDemoRecorderHidden", "1");
    } else if (recordDemo === "1") {
      window.sessionStorage.removeItem("wbxDemoRecorderHidden");
    }
    const hiddenForDirectCapture =
      recordDemo === "0" ||
      window.sessionStorage.getItem("wbxDemoRecorderHidden") === "1";
    setEnabled(localDemoHost && !hiddenForDirectCapture);
    setSegment(safeSegmentName(params.get("segment")));
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (status !== "idle" && status !== "saved" && status !== "error") return;
    setStatus("requesting");
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 30 },
          cursor: "always",
        } as MediaTrackConstraints,
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: "include",
        surfaceSwitching: "exclude",
        monitorTypeSurfaces: "exclude",
      } as DisplayMediaStreamOptions);
      streamRef.current = stream;
      const mimeType = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 6_000_000,
      });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setStatus("saving");
        try {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "video/webm",
          });
          const response = await fetch(
            `/api/demo/screen-recording?name=${encodeURIComponent(segment)}`,
            {
              method: "POST",
              headers: { "Content-Type": blob.type || "video/webm" },
              body: blob,
            },
          );
          if (!response.ok) throw new Error("capture upload failed");
          setStatus("saved");
        } catch {
          setStatus("error");
        }
      };
      stream.getVideoTracks()[0]?.addEventListener("ended", stop, { once: true });
      recorder.start(1_000);
      setStatus("recording");
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setStatus("error");
    }
  }, [segment, status, stop]);

  useEffect(() => {
    if (!enabled) return;
    window.__whiteboxDemoCapture = { start, stop, status: () => status };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.code === "KeyS") {
        event.preventDefault();
        stop();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      delete window.__whiteboxDemoCapture;
    };
  }, [enabled, start, status, stop]);

  useEffect(
    () => () => streamRef.current?.getTracks().forEach((track) => track.stop()),
    [],
  );

  if (!enabled || status === "recording" || status === "saving") return null;

  return (
    <div className="fixed right-3 top-3 z-[9999] flex items-center gap-2 rounded-md border border-white/20 bg-black/80 p-2 shadow-xl backdrop-blur">
      <select
        aria-label="Demo segment"
        data-testid="demo-capture-segment"
        value={segment}
        onChange={(event) => setSegment(event.target.value)}
        className="rounded border border-white/15 bg-black px-2 py-1.5 font-mono text-[9px] text-white/70"
      >
        <option value="01-hr-login">HR login</option>
        <option value="02-hr-studio">HR studio</option>
        <option value="03-candidate-entry">Candidate entry</option>
        <option value="04-candidate-interview">Candidate interview</option>
        <option value="05-results">Results</option>
      </select>
      <button
        type="button"
        data-testid="demo-capture-start"
        onClick={() => void start()}
        className="rounded border border-white/15 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-white/80"
      >
        {status === "requesting"
          ? "Choose this tab"
          : status === "saved"
            ? "Record next"
            : status === "error"
              ? "Retry"
              : "Record"}
      </button>
    </div>
  );
}
