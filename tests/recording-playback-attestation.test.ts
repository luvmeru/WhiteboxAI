import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type { TranscriptProvenance } from "../lib/ai-contracts";
import {
  hasFreshRecordingPlaybackAccess,
  recordingPlaybackBinding,
  RECORDING_PLAYBACK_ATTESTATION_MAX_AGE_MS,
  transcriptSourceReceiptSha256,
  type RecordingPlaybackAttestation,
} from "../lib/server/recording-playback-access";

const transcript: TranscriptProvenance = {
  recordingId: "recording-1",
  recordingSha256: "a".repeat(64),
  providerStatus: "succeeded",
  providerModel: "transcribe-test",
  providerTranscript: "I restored service in twenty minutes.",
  providerTranscriptSha256: "b".repeat(64),
  candidateCorrection: "I restored service in twenty-three minutes.",
  candidateCorrectionSha256: "c".repeat(64),
  correctionReason: "The provider misheard the recovery time.",
  correctionDiff: {
    originalLength: 39,
    correctedLength: 44,
    commonPrefixLength: 30,
    commonSuffixLength: 9,
    removedLength: 0,
    addedLength: 5,
  },
  submittedAt: "2026-07-31T12:00:00.000Z",
  reviewStatus: "candidate_correction_pending",
};

function exactBinding() {
  return recordingPlaybackBinding({
    organizationId: "org-1",
    applicationId: "app-1",
    recordingId: "recording-1",
    recordingApplicationVersion: 7,
    turnNumber: 3,
    recordingContentSha256: transcript.recordingSha256,
    transcriptReceiptSha256: transcriptSourceReceiptSha256(transcript),
    actorUserId: "reviewer-1",
  });
}

function attestation(
  override: Partial<RecordingPlaybackAttestation> = {},
): RecordingPlaybackAttestation {
  return {
    ...exactBinding(),
    accessedAt: "2026-07-31T12:10:00.000Z",
    ...override,
  };
}

test("playback attestation fails closed without an exact fresh server event", () => {
  const expected = exactBinding();
  const now = Date.parse("2026-07-31T12:20:00.000Z");
  assert.equal(
    hasFreshRecordingPlaybackAccess([], expected, now),
    false,
    "no playback must be rejected",
  );
  assert.equal(
    hasFreshRecordingPlaybackAccess([attestation()], expected, now),
    true,
    "the exact fresh server attestation must succeed",
  );
  assert.equal(
    hasFreshRecordingPlaybackAccess(
      [attestation({ actorUserId: "reviewer-2" })],
      expected,
      now,
    ),
    false,
    "another reviewer's playback must not authorize this reviewer",
  );
  assert.equal(
    hasFreshRecordingPlaybackAccess(
      [attestation({ recordingId: "recording-2" })],
      expected,
      now,
    ),
    false,
    "another recording must be rejected",
  );
  assert.equal(
    hasFreshRecordingPlaybackAccess(
      [attestation({ turnNumber: 4 })],
      expected,
      now,
    ),
    false,
    "another turn must be rejected",
  );
  assert.equal(
    hasFreshRecordingPlaybackAccess(
      [attestation({ recordingContentSha256: "d".repeat(64) })],
      expected,
      now,
    ),
    false,
    "another media hash must be rejected",
  );
  assert.equal(
    hasFreshRecordingPlaybackAccess(
      [attestation({ transcriptReceiptSha256: "e".repeat(64) })],
      expected,
      now,
    ),
    false,
    "another immutable transcript receipt must be rejected",
  );
  assert.equal(
    hasFreshRecordingPlaybackAccess(
      [
        attestation({
          accessedAt: new Date(
            now - RECORDING_PLAYBACK_ATTESTATION_MAX_AGE_MS - 1,
          ).toISOString(),
        }),
      ],
      expected,
      now,
    ),
    false,
    "a stale playback must be rejected",
  );
});

test("transcript receipt fingerprint is deterministic and binds corrections", () => {
  const exact = transcriptSourceReceiptSha256(transcript);
  assert.equal(transcriptSourceReceiptSha256({ ...transcript }), exact);
  assert.notEqual(
    transcriptSourceReceiptSha256({
      ...transcript,
      candidateCorrectionSha256: "f".repeat(64),
    }),
    exact,
  );
  assert.notEqual(
    transcriptSourceReceiptSha256({
      ...transcript,
      recordingSha256: "0".repeat(64),
    }),
    exact,
  );
});

test("recording GET and transcript verification enforce the server-owned boundary", async () => {
  const [recordingRoute, verifyRoute, repository] = await Promise.all([
    readFile(
      path.join(
        process.cwd(),
        "app/api/hr/applications/[id]/recordings/[recordingId]/route.ts",
      ),
      "utf8",
    ),
    readFile(
      path.join(
        process.cwd(),
        "app/api/hr/applications/[id]/transcripts/[turnNumber]/verify/route.ts",
      ),
      "utf8",
    ),
    readFile(
      path.join(process.cwd(), "lib/server/repository.ts"),
      "utf8",
    ),
  ]);

  const mediaRead = recordingRoute.indexOf(
    "await readPrivateRecording(recording)",
  );
  const playbackWrite = recordingRoute.indexOf(
    "await recordRecordingPlayback(",
  );
  assert.ok(mediaRead >= 0);
  assert.ok(
    playbackWrite > mediaRead,
    "an unsuccessful media read must never create a playback attestation",
  );
  assert.match(
    recordingRoute,
    /recording\.turnNumber !== turnNumber[\s\S]*recordingSha256 !== recording\.contentSha256/,
  );

  assert.match(
    verifyRoute,
    /findStoredRecordingById\([\s\S]*recording\.turnNumber !== turnNumber[\s\S]*recording\.contentSha256 !== turn\.transcript\.recordingSha256/,
  );
  assert.match(verifyRoute, /RECORDING_PLAYBACK_REQUIRED/);
  assert.match(
    verifyRoute,
    /expectedLockVersion: body\.expectedVersion,[\s\S]*recording,/,
  );
  assert.match(
    verifyRoute,
    /expectOnlyKeys\(body, \["reviewedTranscript", "reason", "expectedVersion"\]\)/,
  );
  assert.doesNotMatch(
    verifyRoute,
    /body\.viewed|["']viewed["']/,
    "the client must not be able to claim that media was viewed",
  );

  assert.match(
    repository,
    /databaseHasFreshRecordingPlaybackAccess\([\s\S]*FROM application_recordings r[\s\S]*JOIN interview_turns t[\s\S]*FOR SHARE OF r, t/,
  );
  assert.match(
    repository,
    /action = 'RECORDING_ACCESSED'[\s\S]*recordingContentSha256[\s\S]*transcriptReceiptSha256[\s\S]*created_at >=/,
  );
  assert.match(
    repository,
    /transaction\(async \(client\) => \{\s*requireFreshRecordingPlaybackAccess\([\s\S]*databaseHasFreshRecordingPlaybackAccess[\s\S]*UPDATE applications/,
  );
  assert.match(
    repository,
    /hasFreshRecordingPlaybackAccess\([\s\S]*data\.audit\.flatMap[\s\S]*event\.recordingPlayback/,
  );
});
