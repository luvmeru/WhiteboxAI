import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSubmittedTranscript,
  correctionDiff,
  humanVerifyTranscript,
  selectedTranscriptForEvaluation,
  transcriptForInterviewContinuation,
  transcriptReadyForEvaluation,
  transcriptSha256,
} from "../lib/server/transcript-provenance";

const recording = {
  id: "recording-1",
  contentSha256: "a".repeat(64),
  transcriptionStatus: "succeeded" as const,
  providerTranscript: "I restored service in twenty minutes.",
  providerTranscriptSha256: transcriptSha256(
    "I restored service in twenty minutes.",
  ),
  providerModel: "transcribe-test",
};

test("unchanged provider transcript is immediately eligible for evaluation", () => {
  const provenance = buildSubmittedTranscript(
    recording,
    recording.providerTranscript,
    undefined,
    "2026-07-30T12:00:00.000Z",
  );

  assert.equal(provenance.reviewStatus, "provider_verified");
  assert.equal(transcriptReadyForEvaluation(provenance), true);
  assert.equal(
    selectedTranscriptForEvaluation(provenance),
    recording.providerTranscript,
  );
  assert.equal(provenance.candidateCorrection, undefined);
});

test("candidate correction remains separate and cannot enter scoring before review", () => {
  const corrected = "I restored service in twenty-three minutes.";
  const provenance = buildSubmittedTranscript(
    recording,
    corrected,
    "The provider misheard the measured recovery time.",
  );

  assert.equal(provenance.reviewStatus, "candidate_correction_pending");
  assert.equal(provenance.providerTranscript, recording.providerTranscript);
  assert.equal(provenance.candidateCorrection, corrected);
  assert.equal(transcriptReadyForEvaluation(provenance), false);
  assert.equal(selectedTranscriptForEvaluation(provenance), null);
  assert.equal(
    transcriptForInterviewContinuation(provenance),
    recording.providerTranscript,
    "adaptive follow-ups may use only the immutable provider text",
  );
  assert.deepEqual(
    provenance.correctionDiff,
    correctionDiff(recording.providerTranscript, corrected),
  );
});

test("manual fallback fails closed until a human verifies it", () => {
  const pending = buildSubmittedTranscript(
    {
      id: "recording-2",
      contentSha256: "b".repeat(64),
      transcriptionStatus: "unavailable",
      providerModel: "transcribe-test",
    },
    "I entered the answer from my recording.",
    "Automatic transcription was unavailable.",
  );

  assert.equal(pending.reviewStatus, "provider_unavailable");
  assert.equal(transcriptForInterviewContinuation(pending), null);
  assert.equal(selectedTranscriptForEvaluation(pending), null);

  const verified = humanVerifyTranscript(
    pending,
    "I entered the answer from my recording.",
    {
      reviewerId: "reviewer-1",
      reason: "Compared the complete audio track against the submitted text.",
      reviewedAt: "2026-07-30T12:05:00.000Z",
    },
  );
  assert.equal(verified.reviewStatus, "human_verified");
  assert.equal(transcriptReadyForEvaluation(verified), true);
  assert.equal(
    selectedTranscriptForEvaluation(verified),
    "I entered the answer from my recording.",
  );
});

test("hash tampering makes an otherwise reviewed transcript ineligible", () => {
  const provenance = buildSubmittedTranscript(
    recording,
    recording.providerTranscript,
    undefined,
  );
  assert.equal(
    transcriptReadyForEvaluation({
      ...provenance,
      reviewedTranscript: "A different answer.",
    }),
    false,
  );
  assert.throws(
    () =>
      buildSubmittedTranscript(
        { ...recording, providerTranscriptSha256: "0".repeat(64) },
        recording.providerTranscript,
        undefined,
      ),
    /hash is invalid/,
  );
});
