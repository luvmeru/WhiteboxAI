import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ARTIFACT_DELETE_BATCH_SIZE,
  RECORDING_DELETE_RETRY_MAX_SECONDS,
  artifactDeleteRetryDelaySeconds,
  recordingDeleteRetryDelaySeconds,
} from "./retention-policy.mjs";

const migration = await readFile(
  new URL("../db/migrations/005_retention_state_machine.sql", import.meta.url),
  "utf8",
);
const worker = await readFile(
  new URL("./retention-worker.mjs", import.meta.url),
  "utf8",
);
const artifactMigration = await readFile(
  new URL("../db/migrations/007_application_artifacts.sql", import.meta.url),
  "utf8",
);
const referenceMigration = await readFile(
  new URL("../db/migrations/008_reference_checks.sql", import.meta.url),
  "utf8",
);

for (const status of [
  "active",
  "processing",
  "object_delete_pending",
  "complete",
]) {
  assert.match(
    migration,
    new RegExp(`'${status}'`),
    `migration is missing the ${status} application retention state`,
  );
}
for (const column of [
  "retention_started_at",
  "anonymized_at",
  "retention_completed_at",
  "delete_attempts",
  "delete_next_attempt_at",
  "delete_last_error",
]) {
  assert.match(
    migration,
    new RegExp(`\\b${column}\\b`),
    `migration is missing ${column}`,
  );
}

assert.match(
  worker,
  /retention_status IN \('active', 'processing'\)/,
  "new-application selection must exclude pending and complete applications",
);
assert.match(
  worker,
  /recording\.status = 'delete_pending'/,
  "recording retries must use the independent pending-object queue",
);
assert.match(
  worker,
  /UPDATE application_artifacts[\s\S]*SET status = 'delete_pending'[\s\S]*status IN \('uploading', 'stored', 'delete_pending'\)/,
  "application anonymization must enqueue every non-deleted artifact",
);
assert.match(
  worker,
  /UPDATE application_recordings[\s\S]*provider_transcript = NULL[\s\S]*status IN \('uploading', 'stored', 'delete_pending'\)/,
  "recording transcript PII must be removed before object deletion retries",
);
assert.match(
  worker,
  /UPDATE application_artifacts[\s\S]*original_filename = NULL[\s\S]*status IN \('uploading', 'stored', 'delete_pending'\)/,
  "artifact filename PII must be removed before object deletion retries",
);
assert.match(
  worker,
  /artifact\.status = 'delete_pending'/,
  "artifact retries must use the independent pending-object queue",
);
assert.match(
  worker,
  /DELETE FROM application_recordings recording[\s\S]*application\.retention_status = 'active'[\s\S]*application\.retention_deadline > clock_timestamp\(\)/,
  "failed active recording reservations must be released after object cleanup",
);
assert.match(
  worker,
  /DELETE FROM application_artifacts artifact[\s\S]*application\.retention_status = 'active'[\s\S]*application\.retention_deadline > clock_timestamp\(\)/,
  "failed active artifact reservations must be released after object cleanup",
);
assert.match(
  worker,
  /recording\.status = 'uploading'[\s\S]*recording\.created_at > now\(\) - interval '5 minutes'[\s\S]*artifact\.status = 'uploading'[\s\S]*artifact\.created_at > now\(\) - interval '5 minutes'/,
  "application expiry must drain active upload leases before claiming work",
);
assert.match(
  worker,
  /delete_next_attempt_at <= now\(\)/,
  "object retries must honor their next-attempt timestamp",
);
assert.match(
  worker,
  /SET delete_attempts = delete_attempts \+ 1,[\s\S]*delete_next_attempt_at =[\s\S]*delete_last_error = \$3/,
  "failed object deletions must persist retry state",
);
assert.match(
  worker,
  /retention_status = 'object_delete_pending'[\s\S]*AND NOT EXISTS \([\s\S]*recording\.status <> 'deleted'/,
  "application completion must require every recording to be deleted",
);
assert.match(
  worker,
  /recording\.status <> 'deleted'[\s\S]*AND NOT EXISTS \([\s\S]*application_artifacts artifact[\s\S]*artifact\.status <> 'deleted'/,
  "application completion must require every artifact to be deleted",
);
assert.match(
  worker,
  /UPDATE application_artifacts[\s\S]*SET delete_attempts = delete_attempts \+ 1,[\s\S]*delete_next_attempt_at =[\s\S]*delete_last_error = \$3/,
  "failed artifact deletions must persist retry state",
);
assert.match(
  worker,
  /SET status = 'deleted',[\s\S]*original_filename = NULL,[\s\S]*deleted_at = now\(\)/,
  "artifact deletion must redact the candidate-provided filename",
);
assert.match(
  worker,
  /storagePrefix: "artifacts\/v1\/"[\s\S]*isSafeStorageKey/,
  "local artifact deletion must enforce the artifact namespace",
);
assert.match(
  referenceMigration,
  /CREATE TABLE IF NOT EXISTS reference_check_responses/,
  "reference response persistence migration is missing",
);
assert.match(
  worker,
  /DELETE FROM reference_check_responses WHERE application_id = ANY\(\$1::text\[\]\)/,
  "retention must erase immutable reference answers before tombstoning the application",
);
assert.match(
  worker,
  /DELETE FROM reference_check_invitations WHERE application_id = ANY\(\$1::text\[\]\)/,
  "retention must erase hashed referee contacts and invitation bindings",
);
assert.match(
  worker,
  /DELETE FROM consent_events WHERE application_id = ANY\(\$1::text\[\]\)/,
  "retention must erase candidate consent telemetry after the disclosed period",
);
assert.match(
  worker,
  /DELETE FROM human_decisions WHERE application_id = ANY\(\$1::text\[\]\)/,
  "retention must erase candidate-linked free-text decision reasons",
);
assert.match(
  worker,
  /payload - 'reason'[\s\S]*'reasonSha256'[\s\S]*rebuildAuditChain/,
  "legacy audit reasons must be reduced to hashes and the organization chain must be rebuilt under lock",
);
assert.match(
  worker,
  /DELETE FROM reference_check_invitations[\s\S]*lockApplicationOrganizations[\s\S]*rebuildAuditChain/,
  "audit redaction must serialize with ordinary organization audit appends",
);
assert.match(
  worker,
  /canonicalAuditEvent[\s\S]*ORDER BY sequence/,
  "audit rebuilding must use the shared canonical form and monotonic sequence",
);
assert.match(
  worker,
  /digest\("base64url"\)/,
  "audit rebuilding must use the same HMAC encoding as ordinary appends",
);
assert.match(
  worker,
  /pg_try_advisory_lock/,
  "the worker must serialize full runs with a session advisory lock",
);
const tombstoneAssignment = worker.match(
  /state = jsonb_build_object\(([\s\S]*?)\),\s*lock_version = lock_version \+ 1,/,
);
assert.ok(
  tombstoneAssignment,
  "application expiry must replace state wholesale with a versioned tombstone and invalidate stale writers",
);
assert.equal(
  tombstoneAssignment[1].replace(/\s+/g, " ").trim(),
  "'retentionTombstoneVersion', 1",
  "the retained application state must contain only the non-identifying tombstone schema version",
);
assert.doesNotMatch(
  worker,
  /state\s*-\s*'history'/,
  "retention must never merge a redacted subset back into the original application state",
);
for (const sensitiveStateKey of [
  "history",
  "sessionTokenHash",
  "evaluation",
  "blockResults",
  "blockRuns",
  "assessmentReviews",
  "humanDecisions",
  "questions",
  "competencies",
  "candidate",
  "referee",
  "evidence",
]) {
  assert.doesNotMatch(
    tombstoneAssignment[1],
    new RegExp(`['"]${sensitiveStateKey}['"]`, "i"),
    `the retention tombstone must not preserve ${sensitiveStateKey}`,
  );
}

for (const column of [
  "organization_id",
  "application_id",
  "application_lock_version",
  "block_id",
  "purpose",
  "idempotency_key_hash",
  "file_index",
  "storage_provider",
  "storage_bucket",
  "storage_key",
  "content_sha256",
  "retention_deadline",
  "delete_attempts",
  "delete_next_attempt_at",
  "delete_last_error",
]) {
  assert.match(
    artifactMigration,
    new RegExp(`\\b${column}\\b`),
    `artifact migration is missing ${column}`,
  );
}
for (const contentType of [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/zip",
]) {
  assert.match(
    artifactMigration,
    new RegExp(contentType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `artifact migration is missing ${contentType}`,
  );
}
assert.match(
  artifactMigration,
  /UNIQUE \([\s\S]*organization_id,[\s\S]*application_id,[\s\S]*application_lock_version,[\s\S]*block_id,[\s\S]*idempotency_key_hash,[\s\S]*file_index[\s\S]*\)/,
  "artifact reservations must be idempotent inside their tenant/application/block binding",
);
assert.match(
  artifactMigration,
  /storage_key ~ '\^artifacts\/v1\/\[a-z0-9\/_-\]\+\$'/,
  "artifact object keys must remain inside the private artifact namespace",
);
assert.match(
  artifactMigration,
  /status = 'deleted' AND original_filename IS NULL/,
  "deleted artifact rows must not retain candidate-provided filenames",
);

assert.deepEqual(
  [1, 2, 3, 4].map(recordingDeleteRetryDelaySeconds),
  [60, 120, 240, 480],
  "recording deletion retry delay must grow exponentially",
);
assert.equal(
  recordingDeleteRetryDelaySeconds(100),
  RECORDING_DELETE_RETRY_MAX_SECONDS,
  "recording deletion retry delay must be capped",
);
assert.equal(
  ARTIFACT_DELETE_BATCH_SIZE,
  2_000,
  "artifact deletion must use a bounded batch",
);
assert.deepEqual(
  [1, 2, 3, 4].map(artifactDeleteRetryDelaySeconds),
  [60, 120, 240, 480],
  "artifact deletion retry delay must grow exponentially",
);

process.stdout.write("Retention state-machine dry verification passed.\n");
