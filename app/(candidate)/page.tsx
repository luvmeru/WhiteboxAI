"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock3, Layers3, ShieldCheck } from "lucide-react";
import { Cube } from "@/components/ui/primitives";

interface CompetitionPreview {
  title: string;
  code: string;
  entry: "assessment" | "interview" | "status";
  noticeVersion: number;
  role: {
    title: string;
    mission: string;
    primaryLanguage: string;
  };
  assessment: {
    totalEstimatedMinutes: number;
    finalDecisionByNamedHuman: boolean;
    blocks: {
      id: string;
      order: number;
      title: string;
      kind: string;
      required: boolean;
      estimatedMinutes: number;
      deliveryState: string;
      scoringUse: string;
    }[];
  };
  notice: {
    aiDisclosure: string;
    retentionDays: number;
  };
}

const DEMO_TTS_ENABLED_KEY = "whitebox.demo.tts.enabled";
const DEMO_TTS_ANSWER_KEY = "whitebox.demo.tts.answer";
const DEMO_TTS_ANSWERS_KEY = "whitebox.demo.tts.answers";
const DEMO_TTS_ANSWERS_INDEX_KEY = "whitebox.demo.tts.answers.index";
const DEMO_TTS_ANSWERS_REVISION_KEY = "whitebox.demo.tts.answers.revision";

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

export default function CodeEntry() {
  const [code, setCode] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<CompetitionPreview | null>(null);
  const router = useRouter();
  const valid = useMemo(() => /^WBX-[A-Z0-9]{4}$/.test(code), [code]);
  const candidateBlocks = useMemo(
    () =>
      preview?.assessment.blocks.filter(
        (block) =>
          !(block.kind === "human_stage" && block.scoringUse === "context"),
      ) ?? [],
    [preview],
  );
  const candidateEffortMinutes = useMemo(
    () =>
      candidateBlocks
        .filter((block) => block.required)
        .reduce((total, block) => total + block.estimatedMinutes, 0),
    [candidateBlocks],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedCode = params.get("code")?.trim().toUpperCase();
    const mode = params.get("wbxDemoTts");
    const scriptedAnswer = params.get("wbxDemoAnswer")?.trim();
    const scriptedAnswers = parseDemoAnswerQueue(
      params.get("wbxDemoAnswers"),
    );
    if (requestedCode) setCode(requestedCode.slice(0, 8));
    try {
      if (mode === "0") {
        sessionStorage.removeItem(DEMO_TTS_ENABLED_KEY);
        sessionStorage.removeItem(DEMO_TTS_ANSWER_KEY);
        sessionStorage.removeItem(DEMO_TTS_ANSWERS_KEY);
        sessionStorage.removeItem(DEMO_TTS_ANSWERS_INDEX_KEY);
        sessionStorage.removeItem(DEMO_TTS_ANSWERS_REVISION_KEY);
        return;
      }
      if (mode === "1") {
        sessionStorage.setItem(DEMO_TTS_ENABLED_KEY, "1");
      }
      if (scriptedAnswer) {
        sessionStorage.setItem(DEMO_TTS_ANSWER_KEY, scriptedAnswer);
      }
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
      }
    } catch {
      // Demo activation is optional; storage restrictions must not affect candidates.
    }
  }, []);

  const lookup = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setNotFound(false);
    setFailureMessage(null);
    try {
      const response = await fetch(
        `/api/public/competitions/${encodeURIComponent(code)}`,
        { headers: { Accept: "application/json" } },
      );
      const body = (await response.json()) as {
        competition?: CompetitionPreview;
      };
      if (!response.ok || !body.competition) {
        setNotFound(true);
        setFailureMessage(null);
        return;
      }
      setPreview(body.competition);
    } catch {
      setNotFound(true);
    } finally {
      setBusy(false);
    }
  };

  const enter = async () => {
    if (!preview || preview.code !== code || busy) return;
    setBusy(true);
    setNotFound(false);
    setFailureMessage(null);
    try {
      const response = await fetch("/api/candidate/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await response.json()) as {
        error?: string;
        application?: {
          id: string;
          entry: "assessment" | "interview" | "status";
        };
      };
      if (!response.ok || !body.application) {
        setNotFound(true);
        setFailureMessage(
          body.error ??
            "We couldn't open this competition. Ask the employer whether it is still accepting applications.",
        );
        return;
      }
      const query = new URLSearchParams({
        applicationId: body.application.id,
        code,
      });
      router.push(
        body.application.entry === "status"
          ? `/status?${query}`
          : body.application.entry === "assessment"
            ? `/assessment?${query}`
            : `/interview/check?${query}`,
      );
    } catch {
      setNotFound(true);
      setFailureMessage(
        "We couldn't verify this competition right now. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
      <Cube size={120} />
      <h1 className="mt-10 text-center font-display text-[clamp(24px,3vw,36px)] font-medium tracking-[-0.015em] text-hi">
        {preview ? preview.role.title : "Enter your competition code"}
      </h1>
      <p className="mt-2.5 max-w-[64ch] text-center text-[15px] leading-relaxed text-mid">
        {preview
          ? preview.role.mission
          : "Your employer shared a code for this role."}
      </p>

      <form
        className={`mt-9 w-full ${preview ? "max-w-[760px]" : "max-w-[440px]"}`}
        onSubmit={(event) => {
          event.preventDefault();
          void (preview ? enter() : lookup());
        }}
      >
        {!preview && (
          <input
            value={code}
            onChange={(event) => {
              setCode(event.target.value.toUpperCase());
              setNotFound(false);
              setPreview(null);
            }}
            placeholder="WBX-XXXX"
            maxLength={8}
            className="iris-focus w-full rounded-lg border border-hairline bg-surface px-5 py-4 text-center font-mono text-[20px] tracking-[0.35em] text-hi placeholder:text-lo"
            aria-label="competition code"
          />
        )}
        {code.length >= 8 && !valid && (
          <p className="mt-2.5 text-center text-[13px] text-neg">
            Check the code and try again — format is WBX-XXXX.
          </p>
        )}
        {notFound && (
          <p className="mt-2.5 text-center text-[13px] text-warn">
            {failureMessage ??
              "We couldn't open this competition. Check the code or ask the employer whether the application window is still open."}
          </p>
        )}

        {preview && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-hairline bg-surface p-4">
                <Clock3 className="size-4 text-irisc" />
                <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-lo">
                  Candidate effort
                </div>
                <div className="mt-1 text-[14px] text-hi">
                  About {candidateEffortMinutes} minutes
                </div>
              </div>
              <div className="rounded-xl border border-hairline bg-surface p-4">
                <Layers3 className="size-4 text-irisc" />
                <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-lo">
                  Published stages
                </div>
                <div className="mt-1 text-[14px] text-hi">
                  {candidateBlocks.length} total ·{" "}
                  {
                    candidateBlocks.filter((block) => block.required)
                      .length
                  }{" "}
                  required
                </div>
              </div>
              <div className="rounded-xl border border-hairline bg-surface p-4">
                <ShieldCheck className="size-4 text-irisc" />
                <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-lo">
                  Final decision
                </div>
                <div className="mt-1 text-[14px] text-hi">
                  Named human reviewer
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
              <div className="border-b border-hairline px-5 py-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-lo">
                  Assessment plan · notice version {preview.noticeVersion}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-mid">
                  {preview.notice.aiDisclosure}
                </p>
              </div>
              <ol className="divide-y divide-hairline">
                {candidateBlocks.map((block) => (
                  <li
                    key={block.id}
                    className="flex items-center gap-4 px-5 py-3.5"
                  >
                    <span className="w-7 font-mono text-[10px] text-lo">
                      {String(block.order).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-hi">{block.title}</div>
                      <div className="mt-0.5 font-mono text-[9px] uppercase text-lo">
                        {block.kind.replaceAll("_", " ")} ·{" "}
                        {block.required ? "required" : "optional"} ·{" "}
                        {block.scoringUse}
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-mid">
                      {block.estimatedMinutes} min
                    </span>
                  </li>
                ))}
              </ol>
              <p className="border-t border-hairline px-5 py-3 text-[10px] leading-relaxed text-lo">
                Submitted data is retained for {preview.notice.retentionDays} days
                under the published notice. Camera imagery is never evaluated for
                appearance, emotion, gaze or alleged reading behavior.
              </p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!valid || busy || Boolean(preview && preview.code !== code)}
          className="mt-4 w-full rounded-lg border border-hairline-strong bg-surface2 py-3.5 text-[15px] text-hi transition-colors hover:border-irisb/50 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {busy
            ? "Opening securely…"
            : preview
              ? "Start application"
              : "Review application"}
        </button>
        {preview && (
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              setNotFound(false);
            }}
            className="mx-auto mt-3 flex items-center gap-2 text-[12px] text-lo hover:text-mid"
          >
            <ArrowLeft className="size-3.5" /> Use a different code
          </button>
        )}
      </form>

      {!preview && (
        <button
          onClick={() => setHelp(true)}
          className="mt-5 text-[13px] text-lo hover:text-mid"
        >
          I don&apos;t have a code
        </button>
      )}
      {help && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHelp(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-hairline-strong bg-surface2 p-6">
            <h2 className="font-display text-[21px] text-hi">
              Where to find your code
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-mid">
              Your employer includes the eight-character code in the invitation
              email, SMS, job post, or QR landing page. It starts with WBX-.
            </p>
            <p className="mt-3 text-[12px] text-lo">
              If it is missing or expired, ask the recruiter who invited you.
              WhiteBox cannot identify the vacancy from personal details.
            </p>
            <button
              onClick={() => setHelp(false)}
              className="mt-5 rounded-lg border border-hairline-strong px-4 py-2 text-[12px] text-hi"
            >
              Got it
            </button>
          </div>
        </div>
      )}
      <p className="mt-10 max-w-[48ch] text-center font-mono text-[10.5px] leading-relaxed tracking-[0.06em] text-lo">
        REVIEWERS SEE AN INTERNAL CANDIDATE ID.
        <br />
        VIDEO IS COLLECTED ONLY IN DISCLOSED RECORDED STAGES. CAMERA APPEARANCE
        AND BEHAVIOR NEVER ENTER THE ASSESSMENT.
      </p>
    </div>
  );
}
