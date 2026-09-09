import { execFile } from "node:child_process";
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import auditCanonical from "../lib/server/audit-canonical.cjs";

const { canonicalAuditEvent, stableJsonStringify } = auditCanonical;

const execFileAsync = promisify(execFile);
const PLACEHOLDER =
  /(?:replace[-_ ]?with|change[-_ ]?me|generated[-_ ]?value|example\.com)/i;
const TRUSTED_PROXY_HEADERS = new Set([
  "cf-connecting-ip",
  "x-vercel-forwarded-for",
  "x-real-ip",
  "x-forwarded-for",
]);
const REQUIRED_TABLES = [
  "schema_migrations",
  "organizations",
  "users",
  "memberships",
  "vacancies",
  "vacancy_versions",
  "applications",
  "candidate_identities",
  "consent_events",
  "interview_turns",
  "evaluation_runs",
  "human_decisions",
  "audit_events",
  "audit_chain_checkpoints",
  "application_recordings",
  "application_artifacts",
  "reference_check_invitations",
  "reference_check_responses",
  "api_rate_limits",
  "outbox_events",
];
const REQUIRED_MIGRATIONS = [
  "001_initial.sql",
  "002_application_recordings.sql",
  "003_video_only_recordings.sql",
  "004_shared_rate_limits.sql",
  "005_retention_state_machine.sql",
  "006_transcript_provenance.sql",
  "007_application_artifacts.sql",
  "008_reference_checks.sql",
  "009_audit_sequence.sql",
  "010_pending_object_pii_redaction.sql",
];
const REQUIRED_COLUMNS = [
  ["applications", "retention_status"],
  ["applications", "anonymized_at"],
  ["application_recordings", "provider_transcript_sha256"],
  ["interview_turns", "reviewed_content_sha256"],
  ["application_artifacts", "content_sha256"],
  ["reference_check_responses", "response_hash"],
  ["audit_events", "sequence"],
  ["audit_events", "hash_version"],
];
const REQUIRED_TRIGGERS = [
  "application_artifacts_redact_filename",
  "application_recordings_redact_transcript",
  "reference_response_append_only",
  "audit_chain_checkpoints_append_only",
];
const REQUIRED_CONSTRAINTS = [
  "application_artifacts_filename_retention_check",
  "application_recordings_transcription_shape_check",
];

function required(name, minimum = 1) {
  const raw = process.env[name];
  const value = raw?.trim();
  if (raw !== undefined && raw !== value) {
    throw new Error(`${name} must not contain leading or trailing whitespace.`);
  }
  if (!value || value.length < minimum || PLACEHOLDER.test(value)) {
    throw new Error(`${name} is missing or contains a placeholder value.`);
  }
  return value;
}

function requireHttpsUrl(name) {
  const value = required(name);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS.`);
  }
  return parsed;
}

function validateEnvironment() {
  if (process.env.WBX_DEMO_MODE === "true") {
    throw new Error("WBX_DEMO_MODE=true is forbidden in production.");
  }
  const databaseUrl = required("DATABASE_URL");
  let parsedDatabaseUrl;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) {
    throw new Error("DATABASE_URL must use the postgres or postgresql scheme.");
  }
  const authSecret = required("WBX_AUTH_SECRET", 32);
  const auditSecret = required("WBX_AUDIT_SECRET", 32);
  const receiptSecret = required("WBX_MEDIA_RECEIPT_SECRET", 32);
  if (new Set([authSecret, auditSecret, receiptSecret]).size !== 3) {
    throw new Error(
      "Authentication, audit, and media-receipt secrets must be independent.",
    );
  }
  const adminEmail = required("WBX_ADMIN_EMAIL");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    throw new Error("WBX_ADMIN_EMAIL must be a valid email address.");
  }
  const passwordHash = required("WBX_ADMIN_PASSWORD_HASH");
  if (!/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(passwordHash)) {
    throw new Error("WBX_ADMIN_PASSWORD_HASH must be a generated scrypt hash.");
  }
  if (process.env.AI_PROVIDER !== "openai") {
    throw new Error("AI_PROVIDER=openai is required in production.");
  }
  required("OPENAI_API_KEY", 20);
  required("OPENAI_MODEL");
  required("OPENAI_TRANSCRIBE_MODEL");
  requireHttpsUrl("NEXT_PUBLIC_APP_URL");
  const storageEndpoint = requireHttpsUrl("WBX_MEDIA_S3_ENDPOINT");
  const region = required("WBX_MEDIA_S3_REGION");
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(region)) {
    throw new Error("WBX_MEDIA_S3_REGION has an invalid format.");
  }
  const bucket = required("WBX_MEDIA_S3_BUCKET");
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error("WBX_MEDIA_S3_BUCKET has an invalid format.");
  }
  const accessKeyId = required("WBX_MEDIA_S3_ACCESS_KEY_ID", 3);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,255}$/.test(accessKeyId)) {
    throw new Error("WBX_MEDIA_S3_ACCESS_KEY_ID has an invalid format.");
  }
  const secretAccessKey = required("WBX_MEDIA_S3_SECRET_ACCESS_KEY", 16);
  if (
    process.env.WBX_MEDIA_S3_FORCE_PATH_STYLE &&
    !["true", "false"].includes(process.env.WBX_MEDIA_S3_FORCE_PATH_STYLE)
  ) {
    throw new Error("WBX_MEDIA_S3_FORCE_PATH_STYLE must be true or false.");
  }
  if (
    process.env.WBX_MEDIA_S3_SSE &&
    !["AES256", "aws:kms"].includes(process.env.WBX_MEDIA_S3_SSE)
  ) {
    throw new Error("WBX_MEDIA_S3_SSE must be AES256 or aws:kms.");
  }
  if (
    process.env.WBX_MEDIA_S3_SSE === "aws:kms" &&
    !process.env.WBX_MEDIA_S3_KMS_KEY_ID?.trim()
  ) {
    throw new Error(
      "WBX_MEDIA_S3_KMS_KEY_ID is required when WBX_MEDIA_S3_SSE=aws:kms.",
    );
  }
  const proxyHeader = required("WBX_TRUSTED_PROXY_HEADER").toLowerCase();
  if (!TRUSTED_PROXY_HEADERS.has(proxyHeader)) {
    throw new Error("WBX_TRUSTED_PROXY_HEADER is not an approved ingress header.");
  }
  return {
    storage: {
      endpoint: storageEndpoint,
      region,
      bucket,
      accessKeyId,
      secretAccessKey,
      sessionToken: process.env.WBX_MEDIA_S3_SESSION_TOKEN?.trim(),
      forcePathStyle: process.env.WBX_MEDIA_S3_FORCE_PATH_STYLE !== "false",
      sse: process.env.WBX_MEDIA_S3_SSE || "AES256",
      kmsKeyId: process.env.WBX_MEDIA_S3_KMS_KEY_ID?.trim(),
    },
  };
}

async function verifyDatabase() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 1_000,
    ssl:
      process.env.WBX_DB_SSL === "false"
        ? false
        : {
            rejectUnauthorized:
              process.env.WBX_DB_SSL_REJECT_UNAUTHORIZED !== "false",
          },
    application_name: "whitebox-production-preflight",
  });
  try {
    await pool.query("SELECT 1");
    const tables = await pool.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])`,
      [REQUIRED_TABLES],
    );
    const presentTables = new Set(tables.rows.map((row) => row.table_name));
    const missingTables = REQUIRED_TABLES.filter(
      (table) => !presentTables.has(table),
    );
    if (missingTables.length > 0) {
      throw new Error(
        `Database migrations are incomplete; missing table(s): ${missingTables.join(", ")}.`,
      );
    }
    const migrations = await pool.query(
      "SELECT name FROM schema_migrations WHERE name = ANY($1::text[])",
      [REQUIRED_MIGRATIONS],
    );
    const appliedMigrations = new Set(migrations.rows.map((row) => row.name));
    const missingMigrations = REQUIRED_MIGRATIONS.filter(
      (name) => !appliedMigrations.has(name),
    );
    if (missingMigrations.length > 0) {
      throw new Error(
        `Database migrations are incomplete; missing migration(s): ${missingMigrations.join(", ")}.`,
      );
    }
    const columns = await pool.query(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])`,
      [[...new Set(REQUIRED_COLUMNS.map(([table]) => table))]],
    );
    const presentColumns = new Set(
      columns.rows.map((row) => `${row.table_name}.${row.column_name}`),
    );
    const missingColumns = REQUIRED_COLUMNS.filter(
      ([table, column]) => !presentColumns.has(`${table}.${column}`),
    );
    if (missingColumns.length > 0) {
      throw new Error(
        `Database migrations are incomplete; missing column(s): ${missingColumns
          .map(([table, column]) => `${table}.${column}`)
          .join(", ")}.`,
      );
    }
    const extension = await pool.query(
      "SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'",
    );
    if (extension.rowCount !== 1) {
      throw new Error("Database extension pgcrypto is required.");
    }
    const triggers = await pool.query(
      `SELECT trigger.tgname
         FROM pg_trigger trigger
        WHERE NOT trigger.tgisinternal
          AND trigger.tgname = ANY($1::text[])`,
      [REQUIRED_TRIGGERS],
    );
    const presentTriggers = new Set(triggers.rows.map((row) => row.tgname));
    const missingTriggers = REQUIRED_TRIGGERS.filter(
      (name) => !presentTriggers.has(name),
    );
    if (missingTriggers.length > 0) {
      throw new Error(
        `Database schema drift detected; missing trigger(s): ${missingTriggers.join(", ")}.`,
      );
    }
    const constraints = await pool.query(
      `SELECT pc.conname
          FROM pg_constraint pc
         WHERE pc.conname = ANY($1::text[])`,
      [REQUIRED_CONSTRAINTS],
    );
    const presentConstraints = new Set(
      constraints.rows.map((row) => row.conname),
    );
    const missingConstraints = REQUIRED_CONSTRAINTS.filter(
      (name) => !presentConstraints.has(name),
    );
    if (missingConstraints.length > 0) {
      throw new Error(
        `Database schema drift detected; missing constraint(s): ${missingConstraints.join(", ")}.`,
      );
    }
    const role = await pool.query(
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
    const runtimeRole = role.rows[0];
    if (
      !runtimeRole ||
      runtimeRole.rolsuper ||
      runtimeRole.rolcreatedb ||
      runtimeRole.rolcreaterole ||
      runtimeRole.rolreplication ||
      runtimeRole.rolbypassrls ||
      runtimeRole.rolinherit ||
      !runtimeRole.is_session_role ||
      runtimeRole.can_create_in_public
    ) {
      throw new Error(
        "DATABASE_URL must use a non-owner runtime role without DDL, audit-mutation, or checkpoint-mutation privileges.",
      );
    }
    const memberships = await pool.query(
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
        "DATABASE_URL runtime role must not be a member of any other PostgreSQL role.",
      );
    }
    const owned = await pool.query(
      `SELECT tablename
         FROM pg_tables
        WHERE schemaname = 'public'
          AND tableowner = current_user
          AND tablename = ANY($1::text[])`,
      [REQUIRED_TABLES],
    );
    if (owned.rowCount > 0) {
      throw new Error(
        "DATABASE_URL runtime role must not own application tables.",
      );
    }
    const runtimePrivileges = [
      ["schema_migrations", "SELECT"],
      ["organizations", "SELECT"],
      ["organizations", "INSERT"],
      ["organizations", "UPDATE"],
      ["users", "SELECT"],
      ["users", "INSERT"],
      ["users", "UPDATE"],
      ["memberships", "SELECT"],
      ["memberships", "INSERT"],
      ["memberships", "UPDATE"],
      ["vacancies", "SELECT"],
      ["vacancies", "INSERT"],
      ["vacancies", "UPDATE"],
      ["vacancy_versions", "SELECT"],
      ["vacancy_versions", "INSERT"],
      ["applications", "SELECT"],
      ["applications", "INSERT"],
      ["applications", "UPDATE"],
      ["consent_events", "SELECT"],
      ["consent_events", "INSERT"],
      ["interview_turns", "SELECT"],
      ["interview_turns", "INSERT"],
      ["interview_turns", "UPDATE"],
      ["evaluation_runs", "SELECT"],
      ["evaluation_runs", "INSERT"],
      ["evaluation_runs", "UPDATE"],
      ["human_decisions", "SELECT"],
      ["human_decisions", "INSERT"],
      ["audit_events", "SELECT"],
      ["audit_events", "INSERT"],
      ["audit_chain_checkpoints", "SELECT"],
      ["outbox_events", "SELECT"],
      ["outbox_events", "INSERT"],
      ["application_recordings", "SELECT"],
      ["application_recordings", "INSERT"],
      ["application_recordings", "UPDATE"],
      ["application_recordings", "DELETE"],
      ["application_artifacts", "SELECT"],
      ["application_artifacts", "INSERT"],
      ["application_artifacts", "UPDATE"],
      ["application_artifacts", "DELETE"],
      ["reference_check_invitations", "SELECT"],
      ["reference_check_invitations", "INSERT"],
      ["reference_check_invitations", "UPDATE"],
      ["reference_check_responses", "SELECT"],
      ["reference_check_responses", "INSERT"],
      ["api_rate_limits", "SELECT"],
      ["api_rate_limits", "INSERT"],
      ["api_rate_limits", "UPDATE"],
    ];
    for (const [table, privilege] of runtimePrivileges) {
      const grant = await pool.query(
        "SELECT has_table_privilege(current_user, $1, $2) AS allowed",
        [`public.${table}`, privilege],
      );
      if (grant.rows[0]?.allowed !== true) {
        throw new Error(
          `DATABASE_URL runtime role is missing ${privilege} on ${table}.`,
        );
      }
    }
    const allowedMutation = new Set(
      runtimePrivileges
        .filter(([, privilege]) => privilege !== "SELECT")
        .map(([table, privilege]) => `${table}:${privilege}`),
    );
    for (const table of REQUIRED_TABLES) {
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
        const grant = await pool.query(
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
            `DATABASE_URL runtime role has forbidden ${privilege} on ${table}.`,
          );
        }
      }
    }
    const identityRead = await pool.query(
      "SELECT has_any_column_privilege(current_user, 'public.candidate_identities', 'SELECT') AS allowed",
    );
    if (identityRead.rows[0]?.allowed === true) {
      throw new Error(
        "DATABASE_URL runtime role must not read candidate identity ciphertext.",
      );
    }
    await verifyAuditState(pool);
  } finally {
    await pool.end();
  }
}

function auditHmac(value) {
  return createHmac("sha256", process.env.WBX_AUDIT_SECRET)
    .update(value, "utf8")
    .digest("base64url");
}

function constantTimeTextEqual(left, right) {
  const a = Buffer.from(String(left), "utf8");
  const b = Buffer.from(String(right), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function verifyAuditState(pool) {
  const client = await pool.connect();
  try {
    await client.query(
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
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
            previous_hash,
            hash,
            created_at,
            sequence,
            hash_version
       FROM audit_events
      ORDER BY organization_id, sequence`,
  );
  let activeOrganization = null;
  let previousHash = "genesis";
  let expectedSequence = 1;
  const knownHashes = new Map();
  for (const event of events.rows) {
    if (event.organization_id !== activeOrganization) {
      activeOrganization = event.organization_id;
      previousHash = "genesis";
      expectedSequence = 1;
      knownHashes.set(activeOrganization, new Set());
    }
    const sequence = Number(event.sequence);
    if (
      Number(event.hash_version) !== 2 ||
      sequence !== expectedSequence ||
      event.previous_hash !== previousHash
    ) {
      throw new Error(
        `Audit topology verification failed for organization ${activeOrganization}.`,
      );
    }
    const createdAt =
      event.created_at instanceof Date
        ? event.created_at.toISOString()
        : new Date(event.created_at).toISOString();
    const expectedHash = auditHmac(
      canonicalAuditEvent({
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
      }),
    );
    if (!constantTimeTextEqual(event.hash, expectedHash)) {
      throw new Error(
        `Audit HMAC verification failed for organization ${activeOrganization}.`,
      );
    }
    knownHashes.get(activeOrganization).add(event.hash);
    previousHash = event.hash;
    expectedSequence += 1;
  }

  const checkpoints = await client.query(
    `SELECT organization_id,
            operation,
            old_root_hash,
            new_root_hash,
            event_count,
            first_sequence,
            last_sequence,
            signature
       FROM audit_chain_checkpoints
      ORDER BY organization_id, created_at, id`,
  );
  const latestCheckpointRoot = new Map();
  for (const checkpoint of checkpoints.rows) {
    const signed = stableJsonStringify({
      organizationId: checkpoint.organization_id,
      operation: checkpoint.operation,
      oldRootHash: checkpoint.old_root_hash,
      newRootHash: checkpoint.new_root_hash,
      eventCount: Number(checkpoint.event_count),
      firstSequence: Number(checkpoint.first_sequence),
      lastSequence: Number(checkpoint.last_sequence),
    });
    if (
      !constantTimeTextEqual(
        checkpoint.signature,
        auditHmac(signed),
      )
    ) {
      throw new Error(
        `Audit checkpoint verification failed for organization ${checkpoint.organization_id}.`,
      );
    }
    latestCheckpointRoot.set(
      checkpoint.organization_id,
      checkpoint.new_root_hash,
    );
  }
  for (const [organizationId, rootHash] of latestCheckpointRoot) {
    if (!knownHashes.get(organizationId)?.has(rootHash)) {
      throw new Error(
        `Latest audit checkpoint is not anchored in the current chain for organization ${organizationId}.`,
      );
    }
  }
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the verification failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function verifyFfprobe() {
  const executable = process.env.WBX_FFPROBE_PATH?.trim() || "ffprobe";
  try {
    await execFileAsync(executable, ["-version"], {
      timeout: 5_000,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    });
  } catch {
    throw new Error(
      "FFprobe is unavailable; production video validation cannot start.",
    );
  }
}

async function verifyOpenAIProvider() {
  const key = process.env.OPENAI_API_KEY;
  const models = [
    process.env.OPENAI_MODEL,
    process.env.OPENAI_TRANSCRIBE_MODEL,
  ];
  for (const model of models) {
    const response = await fetch(
      `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
      {
        headers: { authorization: `Bearer ${key}` },
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      },
    );
    await response.body?.cancel();
    if (!response.ok) {
      throw new Error(
        `OpenAI rejected required model ${model} with HTTP ${response.status}.`,
      );
    }
  }

  const inference = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL,
      instructions:
        "Return the required strict JSON object with ok set to true.",
      input: "Run the WhiteBox structured-output startup canary.",
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: "whitebox_startup_canary",
          strict: true,
          schema: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
            },
            required: ["ok"],
            additionalProperties: false,
          },
        },
      },
      max_output_tokens: 128,
      store: false,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!inference.ok) {
    const status = inference.status;
    await inference.body?.cancel();
    throw new Error(
      `OpenAI Responses smoke probe failed with HTTP ${status}.`,
    );
  }
  const inferencePayload = await inference.json();
  const outputText = Array.isArray(inferencePayload?.output)
    ? inferencePayload.output
        .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
        .find((item) => item?.type === "output_text")
        ?.text
    : undefined;
  let structuredCanary;
  try {
    structuredCanary =
      typeof outputText === "string" ? JSON.parse(outputText) : null;
  } catch {
    structuredCanary = null;
  }
  if (structuredCanary?.ok !== true) {
    throw new Error(
      "OpenAI Responses smoke probe did not satisfy the required strict structured-output contract.",
    );
  }

  const sampleRate = 8_000;
  const sampleCount = Math.round(sampleRate * 0.25);
  const wav = Buffer.alloc(44 + sampleCount * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(sampleCount * 2, 40);
  const transcriptionBody = new FormData();
  transcriptionBody.set(
    "file",
    new Blob([wav], { type: "audio/wav" }),
    "whitebox-preflight.wav",
  );
  transcriptionBody.set("model", process.env.OPENAI_TRANSCRIBE_MODEL);
  const transcription = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: transcriptionBody,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!transcription.ok) {
    const status = transcription.status;
    await transcription.body?.cancel();
    throw new Error(
      `OpenAI transcription smoke probe failed with HTTP ${status}.`,
    );
  }
  await transcription.body?.cancel();
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function awsUriEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function storageObjectUrl(config, storageKey) {
  const url = new URL(config.endpoint.toString());
  const baseSegments = url.pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  const keySegments = storageKey ? storageKey.split("/") : [];
  const segments = config.forcePathStyle
    ? [...baseSegments, config.bucket, ...keySegments]
    : [...baseSegments, ...keySegments];
  if (!config.forcePathStyle) url.hostname = `${config.bucket}.${url.hostname}`;
  const canonicalUri = `/${segments.map(awsUriEncode).join("/")}`;
  url.pathname = canonicalUri;
  url.search = "";
  url.hash = "";
  return { url, canonicalUri };
}

async function signedStorageRequest(
  config,
  method,
  storageKey,
  headers,
  body,
  options = {},
) {
  const { url, canonicalUri } = storageObjectUrl(config, storageKey);
  const canonicalQuery = options.canonicalQuery ?? "";
  if (canonicalQuery) url.search = canonicalQuery;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = amzDate.slice(0, 8);
  const payloadHash =
    headers["x-amz-content-sha256"] ?? sha256Hex(Buffer.alloc(0));
  const signingHeaders = {
    ...headers,
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (config.sessionToken) {
    signingHeaders["x-amz-security-token"] = config.sessionToken;
  }
  const normalizedHeaders = new Map();
  for (const [name, value] of Object.entries(signingHeaders)) {
    normalizedHeaders.set(
      name.toLowerCase(),
      String(value).trim().replace(/\s+/g, " "),
    );
  }
  const headerNames = [...normalizedHeaders.keys()].sort();
  const canonicalHeaders = headerNames
    .map((name) => `${name}:${normalizedHeaders.get(name)}`)
    .join("\n");
  const signedHeaders = headerNames.join(";");
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${shortDate}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const dateKey = hmac(
    Buffer.from(`AWS4${config.secretAccessKey}`, "utf8"),
    shortDate,
  );
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = hmac(signingKey, stringToSign).toString("hex");
  const requestHeaders = new Headers();
  for (const [name, value] of normalizedHeaders) {
    if (name !== "host") requestHeaders.set(name, value);
  }
  requestHeaders.set(
    "authorization",
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  );
  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`signed ${method} returned HTTP ${response.status}`);
  }
  return response;
}

async function verifyStorageRetentionSemantics(config) {
  const emptyHash = sha256Hex(Buffer.alloc(0));
  const versioning = await signedStorageRequest(
    config,
    "GET",
    "",
    { "x-amz-content-sha256": emptyHash },
    undefined,
    { canonicalQuery: "versioning=" },
  );
  const versioningXml = await versioning.text();
  if (/<Status>\s*(?:Enabled|Suspended)\s*<\/Status>/i.test(versioningXml)) {
    throw new Error(
      "the storage bucket has or had versioning enabled; an unversioned DELETE cannot prove physical retention deletion",
    );
  }
  if (!/<VersioningConfiguration(?:\s|>)/i.test(versioningXml)) {
    throw new Error(
      "the storage endpoint did not return a recognizable bucket-versioning response",
    );
  }

  let objectLock;
  try {
    objectLock = await signedStorageRequest(
      config,
      "GET",
      "",
      { "x-amz-content-sha256": emptyHash },
      undefined,
      { canonicalQuery: "object-lock=" },
    );
  } catch (error) {
    if (
      !(
        error instanceof Error &&
        /HTTP 404\b/.test(error.message)
      )
    ) {
      throw error;
    }
    return;
  }
  const objectLockXml = await objectLock.text();
  if (/<ObjectLockEnabled>\s*Enabled\s*<\/ObjectLockEnabled>/i.test(objectLockXml)) {
    throw new Error(
      "the storage bucket has Object Lock enabled; configured retention deletion cannot be guaranteed",
    );
  }
  throw new Error(
    "the storage endpoint returned an ambiguous Object Lock configuration",
  );
}

async function verifyStoragePrefix(config, prefix) {
  const storageKey = `${prefix}/v1/preflight/${randomUUID()}`;
  const bytes = Buffer.from(`whitebox-storage-preflight:${prefix}`, "utf8");
  const contentHash = sha256Hex(bytes);
  let created = false;
  try {
    const putHeaders = {
      "content-length": String(bytes.byteLength),
      "content-type": "application/octet-stream",
      "x-amz-content-sha256": contentHash,
      "x-amz-meta-content-sha256": contentHash,
      "x-amz-server-side-encryption": config.sse,
    };
    if (config.sse === "aws:kms" && config.kmsKeyId) {
      putHeaders["x-amz-server-side-encryption-aws-kms-key-id"] =
        config.kmsKeyId;
    }
    const put = await signedStorageRequest(
      config,
      "PUT",
      storageKey,
      putHeaders,
      bytes,
    );
    await put.body?.cancel();
    created = true;

    const unsignedUrl = storageObjectUrl(config, storageKey).url;
    for (const method of ["HEAD", "GET"]) {
      const unsigned = await fetch(unsignedUrl, {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      await unsigned.body?.cancel();
      const explicitPrivateStatuses =
        method === "HEAD"
          ? new Set([401, 403, 404, 405])
          : new Set([401, 403, 404]);
      if (!explicitPrivateStatuses.has(unsigned.status)) {
        throw new Error(
          unsigned.status >= 200 && unsigned.status < 400
            ? `private ${prefix} object is publicly readable via unsigned ${method}`
            : `unsigned ${method} could not prove private access (HTTP ${unsigned.status})`,
        );
      }
    }

    const get = await signedStorageRequest(config, "GET", storageKey, {
      "x-amz-content-sha256": sha256Hex(Buffer.alloc(0)),
    });
    if (get.headers.get("x-amz-server-side-encryption") !== config.sse) {
      await get.body?.cancel();
      throw new Error(
        `signed GET did not confirm ${config.sse} encryption for ${prefix}`,
      );
    }
    const received = Buffer.from(await get.arrayBuffer());
    if (!received.equals(bytes)) {
      throw new Error(`signed GET returned different bytes for ${prefix}`);
    }

    const deletion = await signedStorageRequest(config, "DELETE", storageKey, {
      "x-amz-content-sha256": sha256Hex(Buffer.alloc(0)),
    });
    await deletion.body?.cancel();
    let confirmedAbsent = false;
    try {
      const afterDelete = await signedStorageRequest(
        config,
        "GET",
        storageKey,
        { "x-amz-content-sha256": sha256Hex(Buffer.alloc(0)) },
      );
      await afterDelete.body?.cancel();
    } catch (error) {
      if (error instanceof Error && /HTTP 404\b/.test(error.message)) {
        confirmedAbsent = true;
      } else {
        throw error;
      }
    }
    if (!confirmedAbsent) {
      throw new Error(
        `signed GET still found ${prefix} bytes after DELETE`,
      );
    }
    created = false;
  } finally {
    if (created) {
      try {
        const cleanup = await signedStorageRequest(
          config,
          "DELETE",
          storageKey,
          { "x-amz-content-sha256": sha256Hex(Buffer.alloc(0)) },
        );
        await cleanup.body?.cancel();
      } catch {
        // The startup error is reported below; cleanup remains best effort.
      }
    }
  }
}

async function verifyStorageEndpoint(config) {
  try {
    await verifyStorageRetentionSemantics(config);
    await verifyStoragePrefix(config, "media");
    await verifyStoragePrefix(config, "artifacts");
  } catch (error) {
    const detail =
      error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : "";
    throw new Error(
      `Private storage CRUD probe failed${detail ? `: ${detail}` : "."}`,
    );
  }
}

export async function runProductionPreflight() {
  if (process.env.NODE_ENV !== "production") return;
  const { storage } = validateEnvironment();
  await Promise.all([
    verifyDatabase(),
    verifyFfprobe(),
    verifyOpenAIProvider(),
    verifyStorageEndpoint(storage),
  ]);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  const serverEntry = process.argv[2];
  if (process.env.NODE_ENV === undefined) {
    process.env.NODE_ENV = "production";
  }
  if (process.env.NODE_ENV !== "production") {
    process.stderr.write(
      "Production preflight failed: the standalone launcher is production-only.\n",
    );
    process.exit(1);
  }
  try {
    await runProductionPreflight();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown production preflight error";
    process.stderr.write(`Production preflight failed: ${message}\n`);
    process.exit(1);
  }
  if (serverEntry) {
    await import(pathToFileURL(path.resolve(serverEntry)).href);
  }
}
