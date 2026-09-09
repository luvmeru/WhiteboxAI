import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const connectionString =
  process.env.WBX_MIGRATION_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("WBX_MIGRATION_DATABASE_URL or DATABASE_URL is required.");
}

const pool = new pg.Pool({
  connectionString,
  ssl: process.env.WBX_DB_SSL === "false"
    ? false
    : { rejectUnauthorized: process.env.WBX_DB_SSL_REJECT_UNAUTHORIZED !== "false" },
});

const directory = path.join(process.cwd(), "db", "migrations");
const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();

const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(hashtext('whitebox-schema-migrations'))");
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const name of files) {
    await client.query("BEGIN");
    try {
      const exists = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name = $1 FOR UPDATE",
        [name],
      );
      if (!exists.rowCount) {
        const sql = await readFile(path.join(directory, name), "utf8");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        process.stdout.write(`Applied ${name}\n`);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  const adminEmail = process.env.WBX_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPasswordHash = process.env.WBX_ADMIN_PASSWORD_HASH;
  if (adminEmail && adminPasswordHash) {
    if (!/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(adminPasswordHash)) {
      throw new Error("WBX_ADMIN_PASSWORD_HASH must be generated with npm run auth:hash-password.");
    }
    const organizationId = process.env.WBX_ORGANIZATION_ID || "org-primary";
    const organizationName = process.env.WBX_ORGANIZATION_NAME || "WhiteBox Organization";
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO organizations (id, name)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [organizationId, organizationName],
      );
      const user = await client.query(
        `INSERT INTO users (id, email, password_hash, display_name)
         VALUES ('usr-bootstrap-owner', $1, $2, $3)
         ON CONFLICT (email) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               display_name = EXCLUDED.display_name
         RETURNING id`,
        [adminEmail, adminPasswordHash, adminEmail.split("@")[0]],
      );
      await client.query(
        `INSERT INTO memberships (organization_id, user_id, role, pii_reveal)
         VALUES ($1, $2, 'Owner', true)
         ON CONFLICT (organization_id, user_id)
         DO UPDATE SET role = EXCLUDED.role, pii_reveal = EXCLUDED.pii_reveal`,
        [organizationId, user.rows[0].id],
      );
      await client.query("COMMIT");
      process.stdout.write(`Bootstrap owner synchronized for ${organizationId}\n`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(hashtext('whitebox-schema-migrations'))");
  } finally {
    client.release();
    await pool.end();
  }
}
