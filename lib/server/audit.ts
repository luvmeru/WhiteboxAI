import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getServerEnv } from "./env";
import { hmacSha256, sha256 } from "./crypto";
import { canonicalAuditEvent } from "./audit-canonical.cjs";

export interface AuditActor {
  type: "user" | "candidate" | "system";
  id: string;
}

export interface AuditInput {
  organizationId: string;
  actor: AuditActor;
  action: string;
  targetType: string;
  targetId: string;
  requestId?: string;
  payload?: Record<string, unknown>;
}

export async function appendAuditEvent(client: PoolClient, input: AuditInput): Promise<string> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.organizationId]);
  const previous = await client.query<{ hash: string; sequence: string | number }>(
    `SELECT hash, sequence
       FROM audit_events
      WHERE organization_id = $1
      ORDER BY sequence DESC
      LIMIT 1
      FOR UPDATE`,
    [input.organizationId],
  );

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const previousHash = previous.rows[0]?.hash ?? "genesis";
  const sequence = Number(previous.rows[0]?.sequence ?? 0) + 1;
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("The organization audit sequence is invalid.");
  }
  const payload = input.payload ?? {};
  const canonical = canonicalAuditEvent({
    id,
    organizationId: input.organizationId,
    hashVersion: 2,
    sequence,
    actor: input.actor,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    requestId: input.requestId ?? null,
    payload,
    previousHash,
    createdAt,
  });
  const env = getServerEnv();
  const secret = env.WBX_AUDIT_SECRET || env.WBX_AUTH_SECRET;
  if (secret && secret !== secret.trim()) {
    throw new Error(
      "The audit HMAC secret must not contain leading or trailing whitespace.",
    );
  }
  if (env.NODE_ENV === "production" && !secret) {
    throw new Error("WBX_AUDIT_SECRET or WBX_AUTH_SECRET is required in production.");
  }
  const hash = secret ? hmacSha256(canonical, secret) : sha256(canonical);

  await client.query(
    `INSERT INTO audit_events
       (id, organization_id, actor_type, actor_id, action, target_type, target_id,
        request_id, payload, previous_hash, hash, created_at, sequence,
        hash_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, 2)`,
    [
      id,
      input.organizationId,
      input.actor.type,
      input.actor.id,
      input.action,
      input.targetType,
      input.targetId,
      input.requestId ?? null,
      JSON.stringify(payload),
      previousHash,
      hash,
      createdAt,
      sequence,
    ],
  );
  return hash;
}
