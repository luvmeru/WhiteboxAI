import process from "node:process";
import pg from "pg";

if (process.env.NODE_ENV !== "production") {
  throw new Error("Database role provisioning is production-only.");
}

const connectionString =
  process.env.WBX_MIGRATION_DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("WBX_MIGRATION_DATABASE_URL is required.");
}

const ROLE_NAME = /^[a-z][a-z0-9_]{2,31}$/;
const PLACEHOLDER =
  /(?:replace[-_ ]?with|change[-_ ]?me|generated[-_ ]?value|example)/i;

function credential(prefix) {
  const name = process.env[`${prefix}_USER`]?.trim();
  const password = process.env[`${prefix}_PASSWORD`]?.trim();
  if (!name || !ROLE_NAME.test(name)) {
    throw new Error(`${prefix}_USER must be a lowercase PostgreSQL role name.`);
  }
  if (!password || password.length < 24 || PLACEHOLDER.test(password)) {
    throw new Error(`${prefix}_PASSWORD must be a non-placeholder value of at least 24 characters.`);
  }
  return { name, password };
}

const app = credential("WBX_DB_APP");
const worker = credential("WBX_DB_RETENTION");
if (app.name === worker.name) {
  throw new Error("Runtime and retention PostgreSQL roles must be different.");
}

const pool = new pg.Pool({
  connectionString,
  max: 1,
  ssl:
    process.env.WBX_DB_SSL === "false"
      ? false
      : {
          rejectUnauthorized:
            process.env.WBX_DB_SSL_REJECT_UNAUTHORIZED !== "false",
        },
});

async function quotedRoleSql(client, template, role) {
  const result = await client.query(
    "SELECT format($1, $2::text) AS sql",
    [template, role],
  );
  await client.query(result.rows[0].sql);
}

async function createOrRotateRole(client, role) {
  const exists = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = $1",
    [role.name],
  );
  if (!exists.rowCount) {
    const result = await client.query(
      "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS sql",
      [role.name, role.password],
    );
    await client.query(result.rows[0].sql);
  } else {
    const result = await client.query(
      "SELECT format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text) AS sql",
      [role.name, role.password],
    );
    await client.query(result.rows[0].sql);
  }
  await quotedRoleSql(
    client,
    "ALTER ROLE %I NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
    role.name,
  );
}

async function revokeRoleMemberships(client, role) {
  const statements = await client.query(
    `SELECT format(
              'REVOKE %I FROM %I',
              granted_role.rolname,
              member_role.rolname
            ) AS sql
       FROM pg_auth_members membership
       JOIN pg_roles granted_role
         ON granted_role.oid = membership.roleid
       JOIN pg_roles member_role
         ON member_role.oid = membership.member
      WHERE member_role.rolname = $1
      ORDER BY granted_role.rolname`,
    [role],
  );
  for (const { sql } of statements.rows) {
    await client.query(sql);
  }
}

async function revokeAllColumnPrivileges(client, role) {
  const statements = await client.query(
    `SELECT format(
              'REVOKE ALL PRIVILEGES (%s) ON TABLE %I.%I FROM %I',
              string_agg(
                format('%I', column_name),
                ', ' ORDER BY ordinal_position
              ),
              table_schema,
              table_name,
              $1::text
            ) AS sql
       FROM information_schema.columns
      WHERE table_schema = 'public'
      GROUP BY table_schema, table_name
      ORDER BY table_name`,
    [role],
  );
  for (const { sql } of statements.rows) {
    await client.query(sql);
  }
}

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await createOrRotateRole(client, app);
  await createOrRotateRole(client, worker);

  for (const role of [app.name, worker.name]) {
    await revokeRoleMemberships(client, role);
    await quotedRoleSql(client, "REVOKE CREATE ON SCHEMA public FROM %I", role);
    await quotedRoleSql(client, "GRANT USAGE ON SCHEMA public TO %I", role);
    await quotedRoleSql(
      client,
      "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I",
      role,
    );
    await quotedRoleSql(
      client,
      "REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I",
      role,
    );
    await revokeAllColumnPrivileges(client, role);
  }

  for (const [table, privileges] of [
    ["schema_migrations", "SELECT"],
    ["organizations", "SELECT, INSERT, UPDATE"],
    ["users", "SELECT, INSERT, UPDATE"],
    ["memberships", "SELECT, INSERT, UPDATE"],
    ["vacancies", "SELECT, INSERT, UPDATE"],
    ["vacancy_versions", "SELECT, INSERT"],
    ["applications", "SELECT, INSERT, UPDATE"],
    ["consent_events", "SELECT, INSERT"],
    ["interview_turns", "SELECT, INSERT, UPDATE"],
    ["evaluation_runs", "SELECT, INSERT, UPDATE"],
    ["human_decisions", "SELECT, INSERT"],
    ["audit_events", "SELECT, INSERT"],
    ["audit_chain_checkpoints", "SELECT"],
    ["outbox_events", "SELECT, INSERT"],
    ["application_recordings", "SELECT, INSERT, UPDATE, DELETE"],
    ["application_artifacts", "SELECT, INSERT, UPDATE, DELETE"],
    ["reference_check_invitations", "SELECT, INSERT, UPDATE"],
    ["reference_check_responses", "SELECT, INSERT"],
    ["api_rate_limits", "SELECT, INSERT, UPDATE"],
  ]) {
    await quotedRoleSql(
      client,
      `GRANT ${privileges} ON ${table} TO %I`,
      app.name,
    );
  }

  for (const table of [
    "applications",
    "application_recordings",
    "application_artifacts",
    "audit_events",
    "audit_chain_checkpoints",
  ]) {
    await quotedRoleSql(
      client,
      `GRANT SELECT ON ${table} TO %I`,
      worker.name,
    );
  }
  for (const [table, columns] of [
    ["candidate_identities", "application_id"],
    ["interview_turns", "application_id"],
    ["consent_events", "application_id"],
    ["human_decisions", "application_id"],
    ["reference_check_responses", "application_id"],
    ["reference_check_invitations", "application_id"],
    ["evaluation_runs", "application_id, output"],
    ["api_rate_limits", "reset_at"],
  ]) {
    await quotedRoleSql(
      client,
      `GRANT SELECT (${columns}) ON ${table} TO %I`,
      worker.name,
    );
  }
  for (const table of [
    "applications",
    "evaluation_runs",
    "audit_events",
  ]) {
    await quotedRoleSql(
      client,
      `GRANT UPDATE ON ${table} TO %I`,
      worker.name,
    );
  }
  for (const table of [
    "application_recordings",
    "application_artifacts",
  ]) {
    await quotedRoleSql(
      client,
      `GRANT UPDATE, DELETE ON ${table} TO %I`,
      worker.name,
    );
  }
  for (const table of [
    "candidate_identities",
    "interview_turns",
    "consent_events",
    "human_decisions",
    "reference_check_responses",
    "reference_check_invitations",
    "api_rate_limits",
  ]) {
    await quotedRoleSql(
      client,
      `GRANT DELETE ON ${table} TO %I`,
      worker.name,
    );
  }
  await quotedRoleSql(
    client,
    "GRANT INSERT ON audit_chain_checkpoints TO %I",
    worker.name,
  );

  await client.query("COMMIT");
  process.stdout.write("Provisioned separate runtime and retention database roles.\n");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
