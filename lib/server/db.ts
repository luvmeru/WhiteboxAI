import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { getServerEnv } from "./env";

declare global {
  var __whiteboxPool: Pool | undefined;
}

export function databaseConfigured(): boolean {
  return Boolean(getServerEnv().DATABASE_URL);
}

export function getPool(): Pool {
  const connectionString = getServerEnv().DATABASE_URL;
  if (!connectionString) {
    throw new Error("PostgreSQL is not configured. Set DATABASE_URL or enable development demo mode.");
  }
  if (!globalThis.__whiteboxPool) {
    globalThis.__whiteboxPool = new Pool({
      connectionString,
      max: Number(process.env.WBX_DB_POOL_SIZE || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: process.env.WBX_DB_SSL === "false" ? false : { rejectUnauthorized: process.env.WBX_DB_SSL_REJECT_UNAUTHORIZED !== "false" },
      application_name: "whitebox-ai",
    });
  }
  return globalThis.__whiteboxPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, values);
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function pingDatabase(): Promise<boolean> {
  if (!databaseConfigured()) return false;
  try {
    const result = await query<{ ok: number }>("SELECT 1 AS ok");
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}
