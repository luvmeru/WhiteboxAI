import type {
  TranscriptCorrectionDiff,
  TranscriptProvenance,
} from "@/lib/ai-contracts";
import { sha256 } from "./crypto";

export const RECORDING_PLAYBACK_ATTESTATION_MAX_AGE_MS = 30 * 60_000;
const RECORDING_PLAYBACK_CLOCK_SKEW_MS = 30_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export interface RecordingPlaybackBinding {
  organizationId: string;
  applicationId: string;
  recordingId: string;
  recordingApplicationVersion: number;
  turnNumber: number;
  recordingContentSha256: string;
  transcriptReceiptSha256: string;
  actorUserId: string;
}

export interface RecordingPlaybackAttestation
  extends RecordingPlaybackBinding {
  accessedAt: string;
}

type TranscriptReceiptSource = Pick<
  TranscriptProvenance,
  | "recordingId"
  | "recordingSha256"
  | "providerStatus"
  | "providerModel"
  | "providerTranscriptSha256"
  | "candidateCorrectionSha256"
  | "correctionReason"
  | "correctionDiff"
  | "reviewStatus"
>;

function canonicalCorrectionDiff(
  value: TranscriptCorrectionDiff | undefined,
): TranscriptCorrectionDiff | null {
  if (!value) return null;
  return {
    originalLength: value.originalLength,
    correctedLength: value.correctedLength,
    commonPrefixLength: value.commonPrefixLength,
    commonSuffixLength: value.commonSuffixLength,
    removedLength: value.removedLength,
    addedLength: value.addedLength,
  };
}

/**
 * Durable fingerprint of the immutable transcript source receipt. The
 * candidate's short-lived upload bearer receipt is deliberately not retained;
 * its server-verified recording and transcript claims are persisted instead.
 */
export function transcriptSourceReceiptSha256(
  source: TranscriptReceiptSource,
): string {
  if (
    !source.recordingId ||
    !SHA256_PATTERN.test(source.recordingSha256) ||
    !source.providerModel ||
    (source.providerTranscriptSha256 !== undefined &&
      !SHA256_PATTERN.test(source.providerTranscriptSha256)) ||
    (source.candidateCorrectionSha256 !== undefined &&
      !SHA256_PATTERN.test(source.candidateCorrectionSha256))
  ) {
    throw new Error("Invalid immutable transcript source receipt.");
  }
  return sha256(
    JSON.stringify({
      version: 1,
      recordingId: source.recordingId,
      recordingSha256: source.recordingSha256,
      providerStatus: source.providerStatus,
      providerModel: source.providerModel,
      providerTranscriptSha256: source.providerTranscriptSha256 ?? null,
      candidateCorrectionSha256: source.candidateCorrectionSha256 ?? null,
      correctionReason: source.correctionReason ?? null,
      correctionDiff: canonicalCorrectionDiff(source.correctionDiff),
      reviewStatus: source.reviewStatus,
    }),
  );
}

export function recordingPlaybackBinding(
  input: RecordingPlaybackBinding,
): RecordingPlaybackBinding {
  if (
    !input.organizationId ||
    !input.applicationId ||
    !input.recordingId ||
    !Number.isSafeInteger(input.recordingApplicationVersion) ||
    input.recordingApplicationVersion < 1 ||
    !Number.isSafeInteger(input.turnNumber) ||
    input.turnNumber < 1 ||
    !SHA256_PATTERN.test(input.recordingContentSha256) ||
    !SHA256_PATTERN.test(input.transcriptReceiptSha256) ||
    !input.actorUserId
  ) {
    throw new Error("Invalid recording playback binding.");
  }
  return { ...input };
}

export function recordingPlaybackAccessMatches(
  attestation: RecordingPlaybackAttestation,
  expected: RecordingPlaybackBinding,
  nowMs = Date.now(),
): boolean {
  const accessedAtMs = Date.parse(attestation.accessedAt);
  return (
    Number.isFinite(accessedAtMs) &&
    accessedAtMs >=
      nowMs - RECORDING_PLAYBACK_ATTESTATION_MAX_AGE_MS &&
    accessedAtMs <= nowMs + RECORDING_PLAYBACK_CLOCK_SKEW_MS &&
    attestation.organizationId === expected.organizationId &&
    attestation.applicationId === expected.applicationId &&
    attestation.recordingId === expected.recordingId &&
    attestation.recordingApplicationVersion ===
      expected.recordingApplicationVersion &&
    attestation.turnNumber === expected.turnNumber &&
    attestation.recordingContentSha256 ===
      expected.recordingContentSha256 &&
    attestation.transcriptReceiptSha256 ===
      expected.transcriptReceiptSha256 &&
    attestation.actorUserId === expected.actorUserId
  );
}

export function hasFreshRecordingPlaybackAccess(
  attestations: readonly RecordingPlaybackAttestation[],
  expected: RecordingPlaybackBinding,
  nowMs = Date.now(),
): boolean {
  return attestations.some((attestation) =>
    recordingPlaybackAccessMatches(attestation, expected, nowMs),
  );
}

export class RecordingPlaybackAccessRequiredError extends Error {
  constructor() {
    super(
      "The current reviewer must open the exact recording before verifying its transcript.",
    );
    this.name = "RecordingPlaybackAccessRequiredError";
  }
}
