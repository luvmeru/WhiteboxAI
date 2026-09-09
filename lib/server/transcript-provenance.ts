import { createHash } from "node:crypto";
import type {
  TranscriptCorrectionDiff,
  TranscriptProvenance,
} from "@/lib/ai-contracts";

const MAX_TRANSCRIPT_LENGTH = 50_000;

export interface RecordingTranscriptSource {
  id: string;
  contentSha256: string;
  transcriptionStatus: "pending" | "succeeded" | "unavailable";
  providerTranscript?: string;
  providerTranscriptSha256?: string;
  providerModel?: string;
}

export function canonicalTranscript(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function transcriptSha256(value: string): string {
  return createHash("sha256")
    .update(canonicalTranscript(value), "utf8")
    .digest("hex");
}

export function correctionDiff(
  originalValue: string,
  correctedValue: string,
): TranscriptCorrectionDiff {
  const original = canonicalTranscript(originalValue);
  const corrected = canonicalTranscript(correctedValue);
  const maximumPrefix = Math.min(original.length, corrected.length);
  let commonPrefixLength = 0;
  while (
    commonPrefixLength < maximumPrefix &&
    original[commonPrefixLength] === corrected[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  const maximumSuffix =
    Math.min(original.length, corrected.length) - commonPrefixLength;
  let commonSuffixLength = 0;
  while (
    commonSuffixLength < maximumSuffix &&
    original[original.length - 1 - commonSuffixLength] ===
      corrected[corrected.length - 1 - commonSuffixLength]
  ) {
    commonSuffixLength += 1;
  }

  return {
    originalLength: original.length,
    correctedLength: corrected.length,
    commonPrefixLength,
    commonSuffixLength,
    removedLength:
      original.length - commonPrefixLength - commonSuffixLength,
    addedLength:
      corrected.length - commonPrefixLength - commonSuffixLength,
  };
}

export function buildSubmittedTranscript(
  recording: RecordingTranscriptSource,
  candidateAnswerValue: string,
  correctionReasonValue: string | undefined,
  submittedAt = new Date().toISOString(),
): TranscriptProvenance {
  const candidateAnswer = canonicalTranscript(candidateAnswerValue);
  if (!candidateAnswer || candidateAnswer.length > MAX_TRANSCRIPT_LENGTH) {
    throw new Error("The submitted transcript is outside the accepted length.");
  }
  if (recording.transcriptionStatus === "pending") {
    throw new Error("The provider transcript has not been finalized.");
  }
  if (
    recording.transcriptionStatus === "succeeded" &&
    (!recording.providerTranscript ||
      !recording.providerTranscriptSha256 ||
      !recording.providerModel)
  ) {
    throw new Error("The provider transcript metadata is incomplete.");
  }
  if (
    recording.transcriptionStatus === "succeeded" &&
    transcriptSha256(recording.providerTranscript!) !==
      recording.providerTranscriptSha256
  ) {
    throw new Error("The immutable provider transcript hash is invalid.");
  }
  if (!recording.providerModel) {
    throw new Error("The transcription provider model is missing.");
  }

  const providerTranscript =
    recording.transcriptionStatus === "succeeded"
      ? canonicalTranscript(recording.providerTranscript!)
      : "";
  const unchanged =
    recording.transcriptionStatus === "succeeded" &&
    candidateAnswer === providerTranscript;
  const correctionReason = correctionReasonValue?.trim();
  if (!unchanged && (!correctionReason || correctionReason.length < 8)) {
    throw new Error(
      "Explain the transcript correction in at least 8 characters.",
    );
  }

  const base: TranscriptProvenance = {
    recordingId: recording.id,
    recordingSha256: recording.contentSha256,
    providerStatus: recording.transcriptionStatus,
    providerModel: recording.providerModel,
    ...(recording.transcriptionStatus === "succeeded"
      ? {
          providerTranscript,
          providerTranscriptSha256: recording.providerTranscriptSha256,
        }
      : {}),
    submittedAt,
    reviewStatus: unchanged
      ? "provider_verified"
      : recording.transcriptionStatus === "succeeded"
        ? "candidate_correction_pending"
        : "provider_unavailable",
  };

  if (unchanged) {
    return {
      ...base,
      reviewedTranscript: providerTranscript,
      reviewedTranscriptSha256: recording.providerTranscriptSha256,
    };
  }

  return {
    ...base,
    candidateCorrection: candidateAnswer,
    candidateCorrectionSha256: transcriptSha256(candidateAnswer),
    correctionReason,
    correctionDiff: correctionDiff(providerTranscript, candidateAnswer),
  };
}

export function transcriptReadyForEvaluation(
  provenance: TranscriptProvenance | undefined,
): boolean {
  if (!provenance) return false;
  if (
    provenance.reviewStatus !== "provider_verified" &&
    provenance.reviewStatus !== "human_verified"
  ) {
    return false;
  }
  if (
    !provenance.reviewedTranscript ||
    !provenance.reviewedTranscriptSha256
  ) {
    return false;
  }
  if (
    transcriptSha256(provenance.reviewedTranscript) !==
    provenance.reviewedTranscriptSha256
  ) {
    return false;
  }
  if (
    provenance.providerStatus === "succeeded" &&
    (!provenance.providerTranscript ||
      !provenance.providerTranscriptSha256 ||
      transcriptSha256(provenance.providerTranscript) !==
        provenance.providerTranscriptSha256)
  ) {
    return false;
  }
  if (
    provenance.candidateCorrection &&
    (!provenance.candidateCorrectionSha256 ||
      transcriptSha256(provenance.candidateCorrection) !==
        provenance.candidateCorrectionSha256)
  ) {
    return false;
  }
  return true;
}

export function selectedTranscriptForEvaluation(
  provenance: TranscriptProvenance | undefined,
): string | null {
  return transcriptReadyForEvaluation(provenance)
    ? canonicalTranscript(provenance!.reviewedTranscript!)
    : null;
}

/**
 * Adaptive interviewing may use the immutable provider transcript while a
 * candidate correction awaits review. It must never use an unverified manual
 * fallback or the pending correction itself.
 */
export function transcriptForInterviewContinuation(
  provenance: TranscriptProvenance | undefined,
): string | null {
  const reviewed = selectedTranscriptForEvaluation(provenance);
  if (reviewed) return reviewed;
  if (
    provenance?.providerStatus === "succeeded" &&
    provenance.providerTranscript &&
    provenance.providerTranscriptSha256 &&
    transcriptSha256(provenance.providerTranscript) ===
      provenance.providerTranscriptSha256
  ) {
    return canonicalTranscript(provenance.providerTranscript);
  }
  return null;
}

export function humanVerifyTranscript(
  provenance: TranscriptProvenance,
  reviewedTranscriptValue: string,
  input: {
    reviewerId: string;
    reason: string;
    reviewedAt?: string;
  },
): TranscriptProvenance {
  const reviewedTranscript = canonicalTranscript(reviewedTranscriptValue);
  const reason = input.reason.trim();
  if (!reviewedTranscript || reviewedTranscript.length > MAX_TRANSCRIPT_LENGTH) {
    throw new Error("The reviewed transcript is outside the accepted length.");
  }
  if (!input.reviewerId || reason.length < 8) {
    throw new Error("Human transcript verification requires a reviewer and reason.");
  }
  const next: TranscriptProvenance = {
    ...provenance,
    reviewStatus: "human_verified",
    reviewedTranscript,
    reviewedTranscriptSha256: transcriptSha256(reviewedTranscript),
    reviewedAt: input.reviewedAt ?? new Date().toISOString(),
    reviewedBy: input.reviewerId,
    reviewReason: reason,
  };
  if (!transcriptReadyForEvaluation(next)) {
    throw new Error("The transcript provenance chain could not be verified.");
  }
  return next;
}
