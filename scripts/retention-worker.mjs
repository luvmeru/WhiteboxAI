import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import auditCanonical from "../lib/server/audit-canonical.cjs";
import {
  APPLICATION_RETENTION_BATCH_SIZE,
  ARTIFACT_DELETE_BATCH_SIZE,
  RECORDING_DELETE_BATCH_SIZE,
  artifactDeleteRetryDelaySeconds,
  recordingDeleteRetryDelaySeconds,
} from "./retention-policy.mjs";

const WORKER_LOCK_NAME = "whitebox-retention-worker";
const STALE_UPLOAD_LEASE = "15 minutes";
const { canonicalAuditEvent, stableJsonStringify } = auditCanonical;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
if (process.env.NODE_ENV !== "production") {
  throw new Error("The retention worker is production-only.");
}
const rawAuditSecret = process.env.WBX_AUDIT_SECRET;
const auditSecret = rawAuditSecret?.trim();
if (rawAuditSecret !== undefined && rawAuditSecret !== auditSecret) {
  throw new Error(
    "WBX_AUDIT_SECRET must not contain leading or trailing whitespace.",
  );
}
if (!auditSecret || auditSecret.length < 32) {
  throw new Error(
    "WBX_AUDIT_SECRET with at least 32 characters is required by the retention worker.",
  );
}

const pool = new pg.Pool({
  connectionString,
  ssl: process.env.WBX_DB_SSL === "false"
    ? false
    : { rejectUnauthorized: process.env.WBX_DB_SSL_REJECT_UNAUTHORIZED !== "false" },
});

await run();

async function run() {
  const client = await pool.connect();
  let lockHeld = false;
  try {
    const lock = await client.query(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [WORKER_LOCK_NAME],
    );
    lockHeld = lock.rows[0]?.locked === true;
    if (!lockHeld) {
      process.stderr.write(
        "Retention worker could not acquire its advisory lock; another run may be stuck.\n",
      );
      process.exitCode = 75;
      return;
    }

    await verifyRetentionDatabaseRole(client);
    const recoveredUploadLeases =
      await recoverStaleUploadReservations(client);
    const relationalFailures = [];
    const applicationBatch = [];
    for (const group of await selectExpiredApplicationGroups(client)) {
      try {
        applicationBatch.push(
          ...(await anonymizeExpiredApplicationBatch(
            client,
            group.organizationId,
            group.applicationIds,
          )),
        );
      } catch (error) {
        relationalFailures.push({
          organizationId: group.organizationId,
          phase: "expiry",
          message: safeErrorMessage(error),
        });
      }
    }
    let residualRedactions = 0;
    for (const group of await selectResidualApplicationGroups(client)) {
      try {
        residualRedactions +=
          await redactPreviouslyExpiredRelationalData(
            client,
            group.organizationId,
            group.applicationIds,
          );
      } catch (error) {
        relationalFailures.push({
          organizationId: group.organizationId,
          phase: "residual",
          message: safeErrorMessage(error),
        });
      }
    }
    let storageFailure = null;
    try {
      await verifyS3RetentionConfiguration();
    } catch (error) {
      storageFailure = safeErrorMessage(error);
    }
    const recordingDeletion = storageFailure
      ? { attempted: 0, deleted: 0, failures: [] }
      : await retryPendingRecordingDeletes(client);
    const artifactDeletion = storageFailure
      ? { attempted: 0, deleted: 0, failures: [] }
      : await retryPendingArtifactDeletes(client);
    const deletion = {
      attempted: recordingDeletion.attempted + artifactDeletion.attempted,
      deleted: recordingDeletion.deleted + artifactDeletion.deleted,
      failures: [
        ...recordingDeletion.failures.map((failure) => ({
          ...failure,
          kind: "Recording",
        })),
        ...artifactDeletion.failures.map((failure) => ({
          ...failure,
          kind: "Artifact",
        })),
      ],
    };
    const finalized = await finalizeApplications(client);
    await client.query(
      `DELETE FROM api_rate_limits
        WHERE reset_at < now() - interval '1 day'`,
    );

    const completedInBatch = applicationBatch.filter(
      ({ retention_status: status }) => status === "complete",
    ).length;
    process.stdout.write(
      `Anonymized ${applicationBatch.length} expired application(s); ` +
      `recovered ${recoveredUploadLeases} stale upload lease(s); ` +
      `attempted ${deletion.attempted} private object deletion(s), ` +
       `deleted ${deletion.deleted}, and completed ` +
      `${completedInBatch + finalized} application retention record(s); ` +
      `cleaned ${residualRedactions} previously expired relational record set(s).\n`,
    );

    for (const failure of deletion.failures) {
      process.stderr.write(`${failure.kind} ${failure.id}: ${failure.message}\n`);
    }
    for (const failure of relationalFailures) {
      process.stderr.write(
        `Relational retention ${failure.phase} failed for organization ` +
        `${sha256Hex(failure.organizationId).slice(0, 12)}: ` +
        `${failure.message}\n`,
      );
    }
    if (storageFailure) {
      process.stderr.write(
        `Private-object deletion gate failed: ${storageFailure}\n`,
      );
    }
    if (
      deletion.failures.length > 0 ||
      relationalFailures.length > 0 ||
      storageFailure
    ) {
      process.exitCode = 1;
    }
  } finally {
    if (lockHeld) {
      try {
        await client.query(
          "SELECT pg_advisory_unlock(hashtext($1))",
          [WORKER_LOCK_NAME],
        );
      } catch (error) {
        process.stderr.write(
          `Could not release the retention advisory lock: ${safeErrorMessage(error)}\n`,
        );
        process.exitCode = 1;
      }
    }
    client.release();
    await pool.end();
  }
}

function groupApplicationRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const current = groups.get(row.organization_id) ?? [];
    current.push(row.id);
    groups.set(row.organization_id, current);
  }
  return [...groups.entries()].map(
    ([organizationId, applicationIds]) => ({
      organizationId,
      applicationIds,
    }),
  );
}

async function selectExpiredApplicationGroups(client) {
  const selected = await client.query(
    `WITH ranked AS (
       SELECT id,
              organization_id,
              retention_deadline,
              row_number() OVER (
                PARTITION BY organization_id
                ORDER BY
                  CASE WHEN retention_status = 'processing' THEN 0 ELSE 1 END,
                  retention_deadline,
                  id
              ) AS tenant_ordinal
         FROM applications
        WHERE retention_deadline <= now()
          AND retention_status IN ('active', 'processing')
          AND NOT EXISTS (
            SELECT 1
              FROM application_recordings recording
             WHERE recording.application_id = applications.id
               AND recording.status = 'uploading'
               AND recording.created_at > now() - interval '5 minutes'
          )
          AND NOT EXISTS (
            SELECT 1
              FROM application_artifacts artifact
             WHERE artifact.application_id = applications.id
               AND artifact.status = 'uploading'
               AND artifact.created_at > now() - interval '5 minutes'
          )
     )
     SELECT id, organization_id
       FROM ranked
      WHERE tenant_ordinal <= 50
      ORDER BY retention_deadline, organization_id, id
      LIMIT $1`,
    [APPLICATION_RETENTION_BATCH_SIZE],
  );
  return groupApplicationRows(selected.rows);
}

async function selectResidualApplicationGroups(client) {
  const selected = await client.query(
    `WITH ranked AS (
       SELECT application.id,
              application.organization_id,
              application.anonymized_at,
              row_number() OVER (
                PARTITION BY application.organization_id
                ORDER BY application.anonymized_at, application.id
              ) AS tenant_ordinal
         FROM applications application
        WHERE application.retention_status IN (
          'object_delete_pending',
          'complete'
        )
          AND (
            EXISTS (
              SELECT 1 FROM candidate_identities identity
               WHERE identity.application_id = application.id
            )
            OR application.state <> jsonb_build_object(
              'retentionTombstoneVersion',
              1
            )
            OR EXISTS (
              SELECT 1 FROM consent_events consent
               WHERE consent.application_id = application.id
            )
            OR EXISTS (
              SELECT 1 FROM human_decisions decision
               WHERE decision.application_id = application.id
            )
            OR EXISTS (
              SELECT 1 FROM audit_events audit
               WHERE audit.target_type = 'application'
                 AND audit.target_id = application.id
                 AND audit.payload ? 'reason'
            )
            OR EXISTS (
              SELECT 1 FROM interview_turns turn
               WHERE turn.application_id = application.id
            )
            OR EXISTS (
              SELECT 1 FROM evaluation_runs evaluation
               WHERE evaluation.application_id = application.id
                 AND evaluation.output IS NOT NULL
            )
            OR EXISTS (
              SELECT 1 FROM reference_check_invitations invitation
               WHERE invitation.application_id = application.id
            )
            OR EXISTS (
              SELECT 1 FROM reference_check_responses response
               WHERE response.application_id = application.id
            )
            OR EXISTS (
              SELECT 1 FROM application_recordings recording
               WHERE recording.application_id = application.id
                 AND (
                   recording.status <> 'deleted'
                   OR recording.provider_transcript IS NOT NULL
                   OR recording.provider_transcript_sha256 IS NOT NULL
                 )
            )
            OR EXISTS (
              SELECT 1 FROM application_artifacts artifact
               WHERE artifact.application_id = application.id
                 AND (
                   artifact.status <> 'deleted'
                   OR artifact.original_filename IS NOT NULL
                 )
            )
          )
     )
     SELECT id, organization_id
       FROM ranked
      WHERE tenant_ordinal <= 50
      ORDER BY anonymized_at, organization_id, id
      LIMIT $1`,
    [APPLICATION_RETENTION_BATCH_SIZE],
  );
  return groupApplicationRows(selected.rows);
}

async function verifyRetentionDatabaseRole(client) {
  const role = await client.query(
    `SELECT role.rolsuper,
            role.rolcreatedb,
            role.rolcreaterole,
            role.rolreplication,
            role.rolbypassrls,
            role.rolinherit,
            session_user = current_user AS is_session_role,
            has_schema_privilege(current_user, 'public', 'CREATE')
              AS can_create_in_public
       FROM pg_roles role
      WHERE role.rolname = current_user`,
  );
  const current = role.rows[0];
  if (
    !current ||
    current.rolsuper ||
    current.rolcreatedb ||
    current.rolcreaterole ||
    current.rolreplication ||
    current.rolbypassrls ||
    current.rolinherit ||
    !current.is_session_role ||
    current.can_create_in_public
  ) {
    throw new Error(
      "Retention DATABASE_URL must use the dedicated non-owner worker role.",
    );
  }
  const memberships = await client.query(
    `SELECT granted_role.rolname
       FROM pg_auth_members membership
       JOIN pg_roles member_role
         ON member_role.oid = membership.member
       JOIN pg_roles granted_role
         ON granted_role.oid = membership.roleid
      WHERE member_role.rolname = current_user
      ORDER BY granted_role.rolname`,
  );
  if (memberships.rowCount > 0) {
    throw new Error(
      "The retention database role must not be a member of any other PostgreSQL role.",
    );
  }
  const owned = await client.query(
    `SELECT 1
       FROM pg_tables
      WHERE schemaname = 'public'
        AND tableowner = current_user
      LIMIT 1`,
  );
  if (owned.rowCount) {
    throw new Error("The retention database role must not own public tables.");
  }
  const requiredPrivileges = [
    ["applications", "SELECT"],
    ["applications", "UPDATE"],
    ["application_recordings", "SELECT"],
    ["application_recordings", "UPDATE"],
    ["application_recordings", "DELETE"],
    ["application_artifacts", "SELECT"],
    ["application_artifacts", "UPDATE"],
    ["application_artifacts", "DELETE"],
    ["audit_events", "SELECT"],
    ["audit_events", "UPDATE"],
    ["audit_chain_checkpoints", "SELECT"],
    ["audit_chain_checkpoints", "INSERT"],
    ["candidate_identities", "DELETE"],
    ["interview_turns", "DELETE"],
    ["consent_events", "DELETE"],
    ["human_decisions", "DELETE"],
    ["reference_check_responses", "DELETE"],
    ["reference_check_invitations", "DELETE"],
    ["evaluation_runs", "UPDATE"],
    ["api_rate_limits", "DELETE"],
  ];
  for (const [table, privilege] of requiredPrivileges) {
    const grant = await client.query(
      "SELECT has_table_privilege(current_user, $1, $2) AS allowed",
      [`public.${table}`, privilege],
    );
    if (grant.rows[0]?.allowed !== true) {
      throw new Error(
        `Retention database role is missing ${privilege} on ${table}.`,
      );
    }
  }
  for (const [table, column] of [
    ["candidate_identities", "application_id"],
    ["interview_turns", "application_id"],
    ["consent_events", "application_id"],
    ["human_decisions", "application_id"],
    ["reference_check_responses", "application_id"],
    ["reference_check_invitations", "application_id"],
    ["evaluation_runs", "application_id"],
    ["evaluation_runs", "output"],
    ["api_rate_limits", "reset_at"],
  ]) {
    const grant = await client.query(
      "SELECT has_column_privilege(current_user, $1, $2, 'SELECT') AS allowed",
      [`public.${table}`, column],
    );
    if (grant.rows[0]?.allowed !== true) {
      throw new Error(
        `Retention database role is missing SELECT on ${table}.${column}.`,
      );
    }
  }
  const allowedMutation = new Set(
    requiredPrivileges
      .filter(([, privilege]) => privilege !== "SELECT")
      .map(([table, privilege]) => `${table}:${privilege}`),
  );
  const tables = await client.query(
    `SELECT tablename
       FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename`,
  );
  for (const { tablename: table } of tables.rows) {
    for (const privilege of [
      "INSERT",
      "UPDATE",
      "DELETE",
      "TRUNCATE",
      "REFERENCES",
      "TRIGGER",
    ]) {
      const columnCapable = [
        "INSERT",
        "UPDATE",
        "REFERENCES",
      ].includes(privilege);
      const grant = await client.query(
        columnCapable
          ? "SELECT has_any_column_privilege(current_user, $1, $2) AS allowed"
          : "SELECT has_table_privilege(current_user, $1, $2) AS allowed",
        [`public.${table}`, privilege],
      );
      if (
        grant.rows[0]?.allowed === true &&
        !allowedMutation.has(`${table}:${privilege}`)
      ) {
        throw new Error(
          `Retention database role has forbidden ${privilege} on ${table}.`,
        );
      }
    }
  }
}

async function recoverStaleUploadReservations(client) {
  await client.query("BEGIN");
  try {
    const recordings = await client.query(
      `WITH stale AS (
         SELECT id
           FROM application_recordings
          WHERE status = 'uploading'
            AND created_at <= now() - $1::interval
          ORDER BY created_at, id
          LIMIT $2
          FOR UPDATE SKIP LOCKED
       )
       UPDATE application_recordings recording
          SET status = 'delete_pending',
              provider_transcript = NULL,
              delete_attempts = 0,
              delete_next_attempt_at = now(),
              delete_last_error = NULL
         FROM stale
        WHERE recording.id = stale.id
        RETURNING recording.id`,
      [STALE_UPLOAD_LEASE, RECORDING_DELETE_BATCH_SIZE],
    );
    const artifacts = await client.query(
      `WITH stale AS (
         SELECT id
           FROM application_artifacts
          WHERE status = 'uploading'
            AND created_at <= now() - $1::interval
          ORDER BY created_at, id
          LIMIT $2
          FOR UPDATE SKIP LOCKED
       )
       UPDATE application_artifacts artifact
          SET status = 'delete_pending',
              original_filename = NULL,
              delete_attempts = 0,
              delete_next_attempt_at = now(),
              delete_last_error = NULL
         FROM stale
        WHERE artifact.id = stale.id
        RETURNING artifact.id`,
      [STALE_UPLOAD_LEASE, ARTIFACT_DELETE_BATCH_SIZE],
    );
    await client.query("COMMIT");
    return recordings.rows.length + artifacts.rows.length;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original database error.
    }
    throw error;
  }
}

async function anonymizeExpiredApplicationBatch(
  client,
  organizationId,
  candidateApplicationIds,
) {
  await client.query("BEGIN");
  try {
    const claimed = await client.query(
       `WITH batch AS (
         SELECT id
           FROM applications
          WHERE organization_id = $1
            AND id = ANY($2::text[])
            AND retention_deadline <= now()
            AND retention_status IN ('active', 'processing')
            AND NOT EXISTS (
              SELECT 1
                FROM application_recordings recording
               WHERE recording.application_id = applications.id
                 AND recording.status = 'uploading'
                 AND recording.created_at > now() - interval '5 minutes'
            )
            AND NOT EXISTS (
              SELECT 1
                FROM application_artifacts artifact
               WHERE artifact.application_id = applications.id
                 AND artifact.status = 'uploading'
                 AND artifact.created_at > now() - interval '5 minutes'
            )
          ORDER BY
                CASE WHEN retention_status = 'processing' THEN 0 ELSE 1 END,
                retention_deadline,
                id
          FOR UPDATE SKIP LOCKED
       )
       UPDATE applications application
          SET retention_status = 'processing',
              retention_started_at = COALESCE(retention_started_at, now())
         FROM batch
        WHERE application.id = batch.id
        RETURNING application.id`,
      [organizationId, candidateApplicationIds],
    );
    const applicationIds = claimed.rows.map(({ id }) => id);

    if (applicationIds.length > 0) {
      await client.query(
        `UPDATE application_recordings
            SET status = 'delete_pending',
                provider_transcript = NULL,
                delete_attempts = CASE
                                    WHEN status = 'delete_pending'
                                      THEN delete_attempts
                                    ELSE 0
                                  END,
                delete_next_attempt_at = CASE
                                           WHEN status = 'delete_pending'
                                             THEN COALESCE(
                                               delete_next_attempt_at,
                                               now()
                                             )
                                           ELSE now()
                                         END,
                delete_last_error = CASE
                                      WHEN status = 'delete_pending'
                                        THEN delete_last_error
                                      ELSE NULL
                                    END
          WHERE application_id = ANY($1::text[])
            AND status IN ('uploading', 'stored', 'delete_pending')`,
        [applicationIds],
      );
      await client.query(
        `UPDATE application_artifacts
            SET status = 'delete_pending',
                original_filename = NULL,
                delete_attempts = CASE
                                    WHEN status = 'delete_pending'
                                      THEN delete_attempts
                                    ELSE 0
                                  END,
                delete_next_attempt_at = CASE
                                           WHEN status = 'delete_pending'
                                             THEN COALESCE(
                                               delete_next_attempt_at,
                                               now()
                                             )
                                           ELSE now()
                                         END,
                delete_last_error = CASE
                                      WHEN status = 'delete_pending'
                                        THEN delete_last_error
                                      ELSE NULL
                                    END
          WHERE application_id = ANY($1::text[])
            AND status IN ('uploading', 'stored', 'delete_pending')`,
        [applicationIds],
      );
      await client.query(
        "DELETE FROM candidate_identities WHERE application_id = ANY($1::text[])",
        [applicationIds],
      );
      await client.query(
        "DELETE FROM interview_turns WHERE application_id = ANY($1::text[])",
        [applicationIds],
      );
      await client.query(
        "DELETE FROM consent_events WHERE application_id = ANY($1::text[])",
        [applicationIds],
      );
      await client.query(
        "DELETE FROM human_decisions WHERE application_id = ANY($1::text[])",
        [applicationIds],
      );
      await client.query(
        "DELETE FROM reference_check_responses WHERE application_id = ANY($1::text[])",
        [applicationIds],
      );
      await client.query(
        "DELETE FROM reference_check_invitations WHERE application_id = ANY($1::text[])",
        [applicationIds],
      );
      await lockApplicationOrganizations(client, applicationIds);
      await client.query(
        `UPDATE evaluation_runs
            SET output = NULL
          WHERE application_id = ANY($1::text[])`,
        [applicationIds],
      );
      await redactAuditReasons(client, applicationIds);

      const anonymized = await client.query(
        `WITH object_state AS (
           SELECT selected.id AS application_id,
                  EXISTS (
                    SELECT 1
                      FROM application_recordings recording
                     WHERE recording.application_id = selected.id
                       AND recording.status <> 'deleted'
                  )
                  OR EXISTS (
                    SELECT 1
                      FROM application_artifacts artifact
                     WHERE artifact.application_id = selected.id
                       AND artifact.status <> 'deleted'
                  ) AS has_pending_objects
             FROM unnest($1::text[]) AS selected(id)
         )
         UPDATE applications application
            SET session_token_hash = encode(gen_random_bytes(32), 'hex'),
                state = jsonb_build_object(
                  'retentionTombstoneVersion', 1
                ),
                lock_version = lock_version + 1,
                anonymized_at = COALESCE(anonymized_at, now()),
                retention_status = CASE
                  WHEN COALESCE(object_state.has_pending_objects, false)
                    THEN 'object_delete_pending'
                  ELSE 'complete'
                END,
                retention_completed_at = CASE
                  WHEN COALESCE(object_state.has_pending_objects, false)
                    THEN NULL
                  ELSE COALESCE(retention_completed_at, now())
                END,
                updated_at = now()
           FROM unnest($1::text[]) AS selected(id)
           LEFT JOIN object_state
             ON object_state.application_id = selected.id
          WHERE application.id = selected.id
            AND application.retention_status = 'processing'
          RETURNING application.id, application.retention_status`,
        [applicationIds],
      );
      if (anonymized.rows.length !== applicationIds.length) {
        throw new Error("Retention batch changed while it was being anonymized.");
      }
      await client.query("COMMIT");
      return anonymized.rows;
    }

    await client.query("COMMIT");
    return [];
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original database error.
    }
    throw error;
  }
}

async function redactPreviouslyExpiredRelationalData(
  client,
  organizationId,
  candidateApplicationIds,
) {
  await client.query("BEGIN");
  try {
    const residual = await client.query(
      `SELECT application.id
         FROM applications application
        WHERE application.organization_id = $1
          AND application.id = ANY($2::text[])
          AND application.retention_status IN (
          'object_delete_pending',
          'complete'
        )
          AND (
            EXISTS (
              SELECT 1
                FROM candidate_identities identity
               WHERE identity.application_id = application.id
            )
            OR application.state <> jsonb_build_object(
              'retentionTombstoneVersion',
              1
            )
            OR EXISTS (
              SELECT 1
                FROM consent_events consent
               WHERE consent.application_id = application.id
            )
            OR EXISTS (
              SELECT 1
                FROM human_decisions decision
               WHERE decision.application_id = application.id
            )
            OR EXISTS (
              SELECT 1
                FROM audit_events audit
               WHERE audit.target_type = 'application'
                 AND audit.target_id = application.id
                 AND audit.payload ? 'reason'
            )
            OR EXISTS (
              SELECT 1
                FROM interview_turns turn
               WHERE turn.application_id = application.id
            )
            OR EXISTS (
              SELECT 1
                FROM evaluation_runs evaluation
               WHERE evaluation.application_id = application.id
                 AND evaluation.output IS NOT NULL
            )
            OR EXISTS (
              SELECT 1
                FROM reference_check_invitations invitation
               WHERE invitation.application_id = application.id
            )
            OR EXISTS (
              SELECT 1
                FROM reference_check_responses response
               WHERE response.application_id = application.id
            )
            OR EXISTS (
              SELECT 1
                FROM application_recordings recording
               WHERE recording.application_id = application.id
                 AND (
                   recording.status <> 'deleted'
                   OR recording.provider_transcript IS NOT NULL
                   OR (
                     recording.status = 'deleted'
                     AND recording.provider_transcript_sha256 IS NOT NULL
                   )
                 )
            )
            OR EXISTS (
              SELECT 1
                FROM application_artifacts artifact
               WHERE artifact.application_id = application.id
                 AND (
                   artifact.status <> 'deleted'
                   OR artifact.original_filename IS NOT NULL
                 )
            )
          )
        ORDER BY application.anonymized_at, application.id
        FOR UPDATE SKIP LOCKED`,
      [organizationId, candidateApplicationIds],
    );
    const applicationIds = residual.rows.map(({ id }) => id);
    if (applicationIds.length === 0) {
      await client.query("COMMIT");
      return 0;
    }
    await client.query(
      `UPDATE application_recordings
          SET status = CASE
                WHEN status = 'deleted' THEN 'deleted'
                ELSE 'delete_pending'
              END,
              provider_transcript = NULL,
              provider_transcript_sha256 = CASE
                WHEN status = 'deleted' THEN NULL
                ELSE provider_transcript_sha256
              END,
              delete_next_attempt_at = CASE
                WHEN status = 'deleted' THEN NULL
                ELSE COALESCE(delete_next_attempt_at, now())
              END,
              delete_last_error = CASE
                WHEN status = 'deleted' THEN NULL
                ELSE delete_last_error
              END
        WHERE application_id = ANY($1::text[])
          AND (
            status <> 'deleted'
            OR provider_transcript IS NOT NULL
            OR provider_transcript_sha256 IS NOT NULL
          )`,
      [applicationIds],
    );
    await client.query(
      `UPDATE application_artifacts
          SET status = CASE
                WHEN status = 'deleted' THEN 'deleted'
                ELSE 'delete_pending'
              END,
              original_filename = NULL,
              delete_next_attempt_at = CASE
                WHEN status = 'deleted' THEN NULL
                ELSE COALESCE(delete_next_attempt_at, now())
              END,
              delete_last_error = CASE
                WHEN status = 'deleted' THEN NULL
                ELSE delete_last_error
              END
        WHERE application_id = ANY($1::text[])
          AND (
            status <> 'deleted'
            OR original_filename IS NOT NULL
          )`,
      [applicationIds],
    );
    await client.query(
      "DELETE FROM candidate_identities WHERE application_id = ANY($1::text[])",
      [applicationIds],
    );
    await client.query(
      "DELETE FROM interview_turns WHERE application_id = ANY($1::text[])",
      [applicationIds],
    );
    await client.query(
      "DELETE FROM consent_events WHERE application_id = ANY($1::text[])",
      [applicationIds],
    );
    await client.query(
      "DELETE FROM human_decisions WHERE application_id = ANY($1::text[])",
      [applicationIds],
    );
    await client.query(
      "DELETE FROM reference_check_responses WHERE application_id = ANY($1::text[])",
      [applicationIds],
    );
    await client.query(
      "DELETE FROM reference_check_invitations WHERE application_id = ANY($1::text[])",
      [applicationIds],
    );
    await client.query(
      `UPDATE evaluation_runs
          SET output = NULL
        WHERE application_id = ANY($1::text[])`,
      [applicationIds],
    );
    await lockApplicationOrganizations(client, applicationIds);
    await redactAuditReasons(client, applicationIds);
    await client.query(
      `WITH object_state AS (
         SELECT selected.id AS application_id,
                EXISTS (
                  SELECT 1
                    FROM application_recordings recording
                   WHERE recording.application_id = selected.id
                     AND recording.status <> 'deleted'
                )
                OR EXISTS (
                  SELECT 1
                    FROM application_artifacts artifact
                   WHERE artifact.application_id = selected.id
                     AND artifact.status <> 'deleted'
                ) AS has_pending_objects
           FROM unnest($1::text[]) AS selected(id)
       )
       UPDATE applications application
          SET session_token_hash = encode(gen_random_bytes(32), 'hex'),
              state = jsonb_build_object(
                'retentionTombstoneVersion',
                1
              ),
              lock_version = lock_version + 1,
              anonymized_at = COALESCE(anonymized_at, now()),
              retention_status = CASE
                WHEN object_state.has_pending_objects
                  THEN 'object_delete_pending'
                ELSE 'complete'
              END,
              retention_completed_at = CASE
                WHEN object_state.has_pending_objects
                  THEN NULL
                ELSE COALESCE(application.retention_completed_at, now())
              END,
              updated_at = now()
         FROM object_state
        WHERE application.id = object_state.application_id`,
      [applicationIds],
    );
    await client.query("COMMIT");
    return applicationIds.length;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original database error.
    }
    throw error;
  }
}

async function lockApplicationOrganizations(client, applicationIds) {
  const organizations = await client.query(
    `SELECT DISTINCT organization_id
       FROM applications
      WHERE id = ANY($1::text[])
      ORDER BY organization_id`,
    [applicationIds],
  );
  for (const { organization_id: organizationId } of organizations.rows) {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [organizationId],
    );
  }
}

async function redactAuditReasons(client, applicationIds) {
  const affected = await client.query(
    `SELECT DISTINCT organization_id
       FROM audit_events
      WHERE target_type = 'application'
        AND target_id = ANY($1::text[])
        AND payload ? 'reason'
      ORDER BY organization_id`,
    [applicationIds],
  );
  for (const { organization_id: organizationId } of affected.rows) {
    const before = await loadAndVerifyAuditChain(client, organizationId);
    await client.query(
      `UPDATE audit_events
          SET payload =
            (payload - 'reason')
            || jsonb_build_object(
              'reasonSha256',
              encode(
                digest(COALESCE(payload ->> 'reason', ''), 'sha256'),
                'hex'
              ),
              'reasonRetained',
              false
            )
        WHERE organization_id = $2
          AND target_type = 'application'
          AND target_id = ANY($1::text[])
          AND payload ? 'reason'`,
      [applicationIds, organizationId],
    );
    const after = await rebuildAuditChain(client, organizationId);
    const checkpoint = {
      organizationId,
      operation: "retention_redaction",
      oldRootHash: before.rootHash,
      newRootHash: after.rootHash,
      eventCount: before.eventCount,
      firstSequence: before.firstSequence,
      lastSequence: before.lastSequence,
    };
    const signature = auditDigest(stableJsonStringify(checkpoint));
    await client.query(
      `INSERT INTO audit_chain_checkpoints
         (organization_id, operation, old_root_hash, new_root_hash,
          event_count, first_sequence, last_sequence, signature)
       VALUES ($1, 'retention_redaction', $2, $3, $4, $5, $6, $7)`,
      [
        organizationId,
        checkpoint.oldRootHash,
        checkpoint.newRootHash,
        checkpoint.eventCount,
        checkpoint.firstSequence,
        checkpoint.lastSequence,
        signature,
      ],
    );
  }
}

async function loadAuditEvents(client, organizationId) {
  const events = await client.query(
    `SELECT id,
            organization_id,
            actor_type,
            actor_id,
            action,
            target_type,
            target_id,
            request_id,
            payload,
            created_at,
            sequence,
            hash_version,
            previous_hash,
            hash
       FROM audit_events
      WHERE organization_id = $1
      ORDER BY sequence
      FOR UPDATE`,
    [organizationId],
  );
  return events.rows;
}

function auditEventCanonical(event, previousHash) {
  const sequence = Number(event.sequence);
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("Audit chain has an invalid sequence.");
  }
  const createdAt =
    event.created_at instanceof Date
      ? event.created_at.toISOString()
      : new Date(event.created_at).toISOString();
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new Error("Audit chain has an invalid timestamp.");
  }
  return canonicalAuditEvent({
    id: event.id,
    organizationId: event.organization_id,
    hashVersion: 2,
    sequence,
    actor: { type: event.actor_type, id: event.actor_id },
    action: event.action,
    targetType: event.target_type,
    targetId: event.target_id,
    requestId: event.request_id ?? null,
    payload: event.payload ?? {},
    previousHash,
    createdAt,
  });
}

function constantTimeHashEqual(left, right) {
  const leftBytes = Buffer.from(String(left), "utf8");
  const rightBytes = Buffer.from(String(right), "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

async function loadAndVerifyAuditChain(client, organizationId) {
  const events = await loadAuditEvents(client, organizationId);
  if (events.length === 0) {
    throw new Error(
      `Audit chain for organization ${organizationId} is unexpectedly empty.`,
    );
  }
  let previousHash = "genesis";
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (
      Number(event.hash_version) !== 2 ||
      Number(event.sequence) !== index + 1 ||
      event.previous_hash !== previousHash
    ) {
      throw new Error(
        `Audit chain topology verification failed for organization ${organizationId}.`,
      );
    }
    const expectedHash = auditDigest(
      auditEventCanonical(event, previousHash),
    );
    if (!constantTimeHashEqual(event.hash, expectedHash)) {
      throw new Error(
        `Audit chain HMAC verification failed for organization ${organizationId}.`,
      );
    }
    previousHash = event.hash;
  }
  return {
    rootHash: previousHash,
    eventCount: events.length,
    firstSequence: Number(events[0].sequence),
    lastSequence: Number(events.at(-1).sequence),
  };
}

async function rebuildAuditChain(client, organizationId) {
  const events = await loadAuditEvents(client, organizationId);
  let previousHash = "genesis";
  for (const event of events) {
    const hash = auditDigest(auditEventCanonical(event, previousHash));
    await client.query(
      `UPDATE audit_events
          SET previous_hash = $2,
              hash = $3,
              hash_version = 2
        WHERE id = $1`,
      [event.id, previousHash, hash],
    );
    previousHash = hash;
  }
  return {
    rootHash: previousHash,
    eventCount: events.length,
    firstSequence: Number(events[0]?.sequence ?? 0),
    lastSequence: Number(events.at(-1)?.sequence ?? 0),
  };
}

function auditDigest(canonical) {
  return createHmac("sha256", auditSecret)
    .update(canonical, "utf8")
    .digest("base64url");
}

async function retryPendingRecordingDeletes(client) {
  const retryable = await client.query(
    `SELECT recording.id,
            recording.storage_provider,
            recording.storage_bucket,
            recording.storage_key,
            recording.delete_attempts,
            recording.application_id
       FROM application_recordings recording
       JOIN applications application
         ON application.id = recording.application_id
      WHERE recording.status = 'delete_pending'
        AND (
          recording.delete_next_attempt_at IS NULL
          OR recording.delete_next_attempt_at <= now()
        )
      ORDER BY
            recording.delete_next_attempt_at NULLS FIRST,
            recording.retention_deadline,
            recording.id
      LIMIT $1`,
    [RECORDING_DELETE_BATCH_SIZE],
  );

  let deleted = 0;
  const failures = [];
  for (const recording of retryable.rows) {
    try {
      await deleteRecordingObject(recording);
    } catch (error) {
      const attempt = Number(recording.delete_attempts) + 1;
      const message = safeErrorMessage(error);
      await client.query(
        `UPDATE application_recordings
            SET delete_attempts = delete_attempts + 1,
                delete_next_attempt_at =
                  now() + ($2::integer * interval '1 second'),
                delete_last_error = $3
          WHERE id = $1::uuid
            AND status = 'delete_pending'`,
        [recording.id, recordingDeleteRetryDelaySeconds(attempt), message],
      );
      failures.push({ id: recording.id, message });
      continue;
    }

    const released = await client.query(
      `DELETE FROM application_recordings recording
        USING applications application
        WHERE recording.id = $1::uuid
          AND recording.application_id = application.id
          AND recording.status = 'delete_pending'
          AND application.retention_status = 'active'
          AND application.retention_deadline > clock_timestamp()`,
      [recording.id],
    );
    if (released.rowCount === 1) {
      deleted += 1;
      continue;
    }
    const marked = await client.query(
      `UPDATE application_recordings
          SET status = 'deleted',
              deleted_at = now(),
              delete_next_attempt_at = NULL,
              delete_last_error = NULL
        WHERE id = $1::uuid
          AND status = 'delete_pending'`,
      [recording.id],
    );
    if (marked.rowCount !== 1) {
      throw new Error(`Recording ${recording.id} changed during object deletion.`);
    }
    deleted += 1;
  }

  return {
    attempted: retryable.rows.length,
    deleted,
    failures,
  };
}

async function retryPendingArtifactDeletes(client) {
  const retryable = await client.query(
    `SELECT artifact.id,
            artifact.storage_provider,
            artifact.storage_bucket,
            artifact.storage_key,
            artifact.delete_attempts,
            artifact.application_id
       FROM application_artifacts artifact
       JOIN applications application
         ON application.id = artifact.application_id
      WHERE artifact.status = 'delete_pending'
        AND (
          artifact.delete_next_attempt_at IS NULL
          OR artifact.delete_next_attempt_at <= now()
        )
      ORDER BY
            artifact.delete_next_attempt_at NULLS FIRST,
            artifact.retention_deadline,
            artifact.id
      LIMIT $1`,
    [ARTIFACT_DELETE_BATCH_SIZE],
  );

  let deleted = 0;
  const failures = [];
  for (const artifact of retryable.rows) {
    try {
      await deleteArtifactObject(artifact);
    } catch (error) {
      const attempt = Number(artifact.delete_attempts) + 1;
      const message = safeErrorMessage(error);
      await client.query(
        `UPDATE application_artifacts
            SET delete_attempts = delete_attempts + 1,
                delete_next_attempt_at =
                  now() + ($2::integer * interval '1 second'),
                delete_last_error = $3
          WHERE id = $1::uuid
            AND status = 'delete_pending'`,
        [artifact.id, artifactDeleteRetryDelaySeconds(attempt), message],
      );
      failures.push({ id: artifact.id, message });
      continue;
    }

    const released = await client.query(
      `DELETE FROM application_artifacts artifact
        USING applications application
        WHERE artifact.id = $1::uuid
          AND artifact.application_id = application.id
          AND artifact.status = 'delete_pending'
          AND application.retention_status = 'active'
          AND application.retention_deadline > clock_timestamp()`,
      [artifact.id],
    );
    if (released.rowCount === 1) {
      deleted += 1;
      continue;
    }
    const marked = await client.query(
      `UPDATE application_artifacts
          SET status = 'deleted',
              original_filename = NULL,
              deleted_at = now(),
              delete_next_attempt_at = NULL,
              delete_last_error = NULL
        WHERE id = $1::uuid
          AND status = 'delete_pending'`,
      [artifact.id],
    );
    if (marked.rowCount !== 1) {
      throw new Error(`Artifact ${artifact.id} changed during object deletion.`);
    }
    deleted += 1;
  }

  return {
    attempted: retryable.rows.length,
    deleted,
    failures,
  };
}

async function finalizeApplications(client) {
  const finalized = await client.query(
    `UPDATE applications application
        SET retention_status = 'complete',
            retention_completed_at = COALESCE(retention_completed_at, now()),
            updated_at = now()
      WHERE retention_status = 'object_delete_pending'
        AND NOT EXISTS (
          SELECT 1
            FROM application_recordings recording
           WHERE recording.application_id = application.id
             AND recording.status <> 'deleted'
        )
        AND NOT EXISTS (
          SELECT 1
            FROM application_artifacts artifact
           WHERE artifact.application_id = application.id
             AND artifact.status <> 'deleted'
        )
      RETURNING id`,
  );
  return finalized.rows.length;
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : "unknown deletion error";
  return message.replace(/\s+/g, " ").trim().slice(0, 500) || "unknown deletion error";
}

async function deleteRecordingObject(recording) {
  await deletePrivateObject(recording, {
    localDirectory: "recordings",
    storagePrefix: "media/v1/",
    label: "recording",
  });
}

async function deleteArtifactObject(artifact) {
  await deletePrivateObject(artifact, {
    localDirectory: "artifacts",
    storagePrefix: "artifacts/v1/",
    label: "artifact",
  });
}

async function deletePrivateObject(storedObject, policy) {
  if (storedObject.storage_provider === "local-demo") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`local-demo ${policy.label} storage is forbidden in production`);
    }
    const root = path.resolve(process.cwd(), ".data", policy.localDirectory);
    if (!isSafeStorageKey(storedObject.storage_key, policy.storagePrefix)) {
      throw new Error(`unsafe local ${policy.label} key`);
    }
    const target = path.resolve(root, ...storedObject.storage_key.split("/"));
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error(`unsafe local ${policy.label} path`);
    }
    try {
      await unlink(target);
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
    }
    return;
  }
  if (storedObject.storage_provider !== "s3" || !storedObject.storage_bucket) {
    throw new Error(`invalid ${policy.label} storage metadata`);
  }
  await deleteS3Object(
    storedObject.storage_bucket,
    storedObject.storage_key,
    policy.storagePrefix,
  );
}

async function deleteS3Object(bucket, storageKey, storagePrefix) {
  const response = await signedS3Request({
    bucket,
    storageKey,
    expectedPrefix: storagePrefix,
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    await response.body?.cancel();
    throw new Error(`S3 rejected deletion with HTTP ${response.status}`);
  }
  if (
    response.headers.get("x-amz-delete-marker") === "true" ||
    response.headers.has("x-amz-version-id")
  ) {
    await response.body?.cancel();
    throw new Error(
      "S3 returned versioned-delete headers; physical object deletion is not proven.",
    );
  }
  await response.body?.cancel();
  const afterDelete = await signedS3Request({
    bucket,
    storageKey,
    expectedPrefix: storagePrefix,
    method: "GET",
  });
  if (afterDelete.status !== 404) {
    await afterDelete.body?.cancel();
    throw new Error(
      `S3 deletion verification expected HTTP 404, received ${afterDelete.status}`,
    );
  }
  await afterDelete.body?.cancel();
}

async function verifyS3RetentionConfiguration() {
  const bucket = process.env.WBX_MEDIA_S3_BUCKET;
  if (!bucket) throw new Error("WBX_MEDIA_S3_BUCKET is required.");

  const versioning = await signedS3Request({
    bucket,
    method: "GET",
    canonicalQuery: "versioning=",
  });
  if (!versioning.ok) {
    await versioning.body?.cancel();
    throw new Error(
      `S3 bucket versioning probe failed with HTTP ${versioning.status}`,
    );
  }
  const versioningXml = await versioning.text();
  if (
    !/<VersioningConfiguration(?:\s|>)/i.test(versioningXml) ||
    /<Status>\s*(?:Enabled|Suspended)\s*<\/Status>/i.test(versioningXml)
  ) {
    throw new Error(
      "Retention requires a never-versioned bucket; versioned deletion cannot be proven from current metadata.",
    );
  }

  const objectLock = await signedS3Request({
    bucket,
    method: "GET",
    canonicalQuery: "object-lock=",
  });
  if (objectLock.status === 404) {
    await objectLock.body?.cancel();
    return;
  }
  if (!objectLock.ok) {
    await objectLock.body?.cancel();
    throw new Error(
      `S3 Object Lock probe failed with HTTP ${objectLock.status}`,
    );
  }
  const objectLockXml = await objectLock.text();
  if (
    /<ObjectLockEnabled>\s*Enabled\s*<\/ObjectLockEnabled>/i.test(
      objectLockXml,
    )
  ) {
    throw new Error(
      "Retention cannot run while S3 Object Lock is enabled.",
    );
  }
  throw new Error("S3 returned an ambiguous Object Lock configuration.");
}

async function signedS3Request({
  bucket,
  storageKey = "",
  expectedPrefix,
  method,
  canonicalQuery = "",
}) {
  const endpointValue = process.env.WBX_MEDIA_S3_ENDPOINT;
  const region = process.env.WBX_MEDIA_S3_REGION;
  const accessKeyId = process.env.WBX_MEDIA_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.WBX_MEDIA_S3_SECRET_ACCESS_KEY;
  if (!endpointValue || !region || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 media credentials are incomplete");
  }
  const endpoint = new URL(endpointValue);
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.protocol !== "https:"
  ) {
    throw new Error("S3 media endpoint is invalid");
  }
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
    (
      expectedPrefix !== undefined &&
      !isSafeStorageKey(storageKey, expectedPrefix)
    )
  ) {
    throw new Error("unsafe S3 private-object metadata");
  }

  const forcePathStyle = process.env.WBX_MEDIA_S3_FORCE_PATH_STYLE !== "false";
  const baseSegments = endpoint.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const keySegments = storageKey ? storageKey.split("/") : [];
  const segments = forcePathStyle
    ? [...baseSegments, bucket, ...keySegments]
    : [...baseSegments, ...keySegments];
  if (!forcePathStyle) endpoint.hostname = `${bucket}.${endpoint.hostname}`;
  const canonicalUri = `/${segments.map(awsUriEncode).join("/")}`;
  endpoint.pathname = canonicalUri;
  if (canonicalQuery) endpoint.search = canonicalQuery;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = amzDate.slice(0, 8);
  const emptyHash = sha256Hex(Buffer.alloc(0));
  const signingHeaders = {
    host: endpoint.host,
    "x-amz-content-sha256": emptyHash,
    "x-amz-date": amzDate,
  };
  if (process.env.WBX_MEDIA_S3_SESSION_TOKEN) {
    signingHeaders["x-amz-security-token"] = process.env.WBX_MEDIA_S3_SESSION_TOKEN;
  }
  const headerNames = Object.keys(signingHeaders).sort();
  const canonicalHeaders = headerNames
    .map((name) => `${name}:${signingHeaders[name].trim().replace(/\s+/g, " ")}`)
    .join("\n");
  const signedHeaders = headerNames.join(";");
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `${canonicalHeaders}\n`,
    signedHeaders,
    emptyHash,
  ].join("\n");
  const scope = `${shortDate}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const dateKey = hmac(Buffer.from(`AWS4${secretAccessKey}`, "utf8"), shortDate);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = hmac(signingKey, stringToSign).toString("hex");
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = new Headers();
  for (const name of headerNames) {
    if (name !== "host") headers.set(name, signingHeaders[name]);
  }
  headers.set("authorization", authorization);
  const response = await fetch(endpoint, {
    method,
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  return response;
}

function isSafeStorageKey(storageKey, expectedPrefix) {
  return (
    typeof storageKey === "string" &&
    storageKey.startsWith(expectedPrefix) &&
    /^(?:media|artifacts)\/v1\/[a-z0-9/_-]+$/.test(storageKey)
  );
}

function awsUriEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}
