"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import type {
  PublicReferenceQuestionnaire,
  ReferenceQuestionSnapshot,
} from "@/lib/server/reference-checks";

interface AnswerDraft {
  questionId: string;
  unableToObserve: boolean;
  rating?: number | null;
  text?: string;
}

function initialAnswer(
  question: ReferenceQuestionSnapshot,
): AnswerDraft {
  return question.type === "rating"
    ? {
        questionId: question.id,
        unableToObserve: false,
        rating: null,
      }
    : {
        questionId: question.id,
        unableToObserve: false,
        text: "",
      };
}

export default function ReferenceQuestionnaire({
  token,
  questionnaire,
}: {
  token: string;
  questionnaire: PublicReferenceQuestionnaire;
}) {
  const [answers, setAnswers] = useState<AnswerDraft[]>(
    questionnaire.questions.map(initialAnswer),
  );
  const [consent, setConsent] = useState(false);
  const [relationshipConfirmed, setRelationshipConfirmed] =
    useState(false);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");

  const valid = useMemo(
    () =>
      consent &&
      relationshipConfirmed &&
      answers.every((answer, index) => {
        if (answer.unableToObserve) return true;
        const question = questionnaire.questions[index];
        return question?.type === "rating"
          ? Number.isInteger(answer.rating) &&
              Number(answer.rating) >= 1 &&
              Number(answer.rating) <= 5
          : (answer.text?.trim().length ?? 0) >= 20;
      }),
    [
      answers,
      consent,
      questionnaire.questions,
      relationshipConfirmed,
    ],
  );

  const patchAnswer = (
    index: number,
    patch: Partial<AnswerDraft>,
  ) => {
    setAnswers((current) =>
      current.map((answer, candidateIndex) =>
        candidateIndex === index
          ? { ...answer, ...patch }
          : answer,
      ),
    );
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/public/reference/${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            consent,
            relationshipConfirmed,
            answers: answers.map((answer, index) => {
              const question = questionnaire.questions[index];
              return question?.type === "rating"
                ? {
                    questionId: answer.questionId,
                    unableToObserve:
                      answer.unableToObserve,
                    rating: answer.unableToObserve
                      ? null
                      : answer.rating,
                  }
                : {
                    questionId: answer.questionId,
                    unableToObserve:
                      answer.unableToObserve,
                    text: answer.unableToObserve
                      ? null
                      : answer.text?.trim(),
                  };
            }),
          }),
        },
      );
      const body = (await response.json()) as {
        completed?: boolean;
        error?: string;
      };
      if (!response.ok || !body.completed) {
        throw new Error(
          body.error ||
            "The reference response could not be recorded.",
        );
      }
      setCompleted(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The reference response could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (completed) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 text-center">
        <CheckCircle2 className="size-9 text-good" />
        <h1 className="mt-4 font-display text-[28px] text-hi">
          Response recorded
        </h1>
        <p className="mt-3 max-w-[55ch] text-[13px] leading-relaxed text-mid">
          Thank you. Your response is now an immutable evidence receipt for a
          named HR reviewer. It is not automatically converted into a hiring
          score.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-5 pb-14 pt-7 sm:px-8">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.08em] text-lo">
        <ShieldCheck className="size-4" />
        Secure structured reference
      </div>
      <h1 className="mt-3 font-display text-[clamp(26px,5vw,42px)] font-medium tracking-[-0.025em] text-hi">
        Work reference for {questionnaire.roleTitle}
      </h1>
      <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-mid">
        Answer only from behavior you directly observed in a{" "}
        <span className="text-hi">
          {questionnaire.relationship}
        </span>{" "}
        working relationship. Do not include age, health, family status,
        ethnicity, religion, disability, appearance, or other personal
        information unrelated to the work.
      </p>
      <p className="mt-2 font-mono text-[9px] uppercase tracking-[.06em] text-lo">
        Expires{" "}
        {new Date(questionnaire.expiresAt).toLocaleString()}
      </p>

      <div className="mt-7 space-y-4">
        {questionnaire.questions.map((question, index) => {
          const answer = answers[index];
          return (
            <section
              key={question.id}
              className="rounded-xl border border-hairline bg-surface p-5"
            >
              <div className="font-mono text-[9px] uppercase tracking-[.06em] text-lo">
                Question {index + 1} of{" "}
                {questionnaire.questions.length}
              </div>
              <h2 className="mt-2 text-[14px] leading-relaxed text-hi">
                {question.text}
              </h2>
              {question.type === "rating" &&
                !answer?.unableToObserve && (
                  <fieldset className="mt-4">
                    <legend className="text-[10px] text-lo">
                      Extent consistently observed · 1 low, 5 high
                    </legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <label
                          key={rating}
                          className={`flex size-10 cursor-pointer items-center justify-center rounded-lg border font-mono text-[12px] ${
                            answer?.rating === rating
                              ? "border-irisb/60 bg-irisa/10 text-hi"
                              : "border-hairline bg-void2 text-mid"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`rating-${question.id}`}
                            value={rating}
                            checked={
                              answer?.rating === rating
                            }
                            onChange={() =>
                              patchAnswer(index, { rating })
                            }
                            className="sr-only"
                          />
                          {rating}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              {question.type === "open" &&
                !answer?.unableToObserve && (
                  <label className="mt-4 block">
                    <span className="font-mono text-[9px] uppercase tracking-[.06em] text-lo">
                      Specific observed example
                    </span>
                    <textarea
                      rows={5}
                      maxLength={4_000}
                      value={answer?.text ?? ""}
                      onChange={(event) =>
                        patchAnswer(index, {
                          text: event.target.value,
                        })
                      }
                      placeholder="Describe the situation, the person’s work behavior, and the observable result. Minimum 20 characters."
                      className="iris-focus mt-2 w-full rounded-lg border border-hairline bg-void2 p-3 text-[13px] leading-relaxed text-hi placeholder:text-lo"
                    />
                  </label>
                )}
              <label className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-mid">
                <input
                  type="checkbox"
                  checked={answer?.unableToObserve ?? false}
                  onChange={(event) =>
                    patchAnswer(index, {
                      unableToObserve:
                        event.target.checked,
                      ...(question.type === "rating"
                        ? { rating: null }
                        : { text: "" }),
                    })
                  }
                  className="mt-0.5"
                />
                I was unable to observe this behavior directly.
              </label>
            </section>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl border border-hairline-strong bg-surface p-5">
        <label className="flex items-start gap-2 text-[11px] leading-relaxed text-mid">
          <input
            type="checkbox"
            checked={relationshipConfirmed}
            onChange={(event) =>
              setRelationshipConfirmed(event.target.checked)
            }
            className="mt-0.5"
          />
          I confirm that I directly observed this person’s work in the
          relationship shown above.
        </label>
        <label className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-mid">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) =>
              setConsent(event.target.checked)
            }
            className="mt-0.5"
          />
          I consent to this job-related response being retained for the
          published hiring process and reviewed by authorized personnel.
        </label>
        <p className="mt-3 text-[10px] leading-relaxed text-lo">
          The invitation is single-use. The system records provenance and
          integrity metadata but does not infer personality, emotion, identity,
          or protected characteristics.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-[11px] text-warn"
        >
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={!valid || busy}
        onClick={() => void submit()}
        className="mt-5 inline-flex items-center gap-2 rounded-lg border border-hairline-strong bg-surface px-5 py-3 text-[12px] text-hi disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy && (
          <LoaderCircle className="size-4 animate-spin" />
        )}
        {busy ? "Recording response…" : "Submit once"}
      </button>
    </div>
  );
}
