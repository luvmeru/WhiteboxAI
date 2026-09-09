/**
 * Fixed-window limiter for the Next.js route handlers.
 *
 * Development demo mode uses a bounded in-process store. Whenever PostgreSQL is
 * configured, counters are updated atomically in the shared database so restarts
 * and multiple application instances cannot reset or split the security limit.
 */

import { databaseConfigured, query } from "./db";

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
  namespace: string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
  touchedAt: number;
}

interface RateLimitState {
  entries: Map<string, RateLimitEntry>;
  operations: number;
}

const STORE_KEY = Symbol.for("whitebox.api.rate-limit.v1");
const MAX_ENTRIES = 10_000;
const SWEEP_INTERVAL = 250;

type GlobalWithRateLimit = typeof globalThis & {
  [STORE_KEY]?: RateLimitState;
};

function state(): RateLimitState {
  const root = globalThis as GlobalWithRateLimit;
  root[STORE_KEY] ??= { entries: new Map(), operations: 0 };
  return root[STORE_KEY];
}

function prune(store: RateLimitState, now: number): void {
  for (const [key, entry] of store.entries) {
    if (entry.resetAt <= now) store.entries.delete(key);
  }

  if (store.entries.size <= MAX_ENTRIES) return;

  const overflow = store.entries.size - MAX_ENTRIES;
  const oldest = [...store.entries.entries()]
    .sort(([, a], [, b]) => a.touchedAt - b.touchedAt)
    .slice(0, overflow);
  for (const [key] of oldest) store.entries.delete(key);
}

function consumeMemoryRateLimit(
  clientKey: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): RateLimitResult {
  if (!Number.isSafeInteger(policy.limit) || policy.limit < 1) {
    throw new Error("Rate-limit policy must have a positive integer limit.");
  }
  if (!Number.isSafeInteger(policy.windowMs) || policy.windowMs < 1_000) {
    throw new Error("Rate-limit policy window must be at least one second.");
  }

  const store = state();
  store.operations += 1;
  if (store.operations % SWEEP_INTERVAL === 0 || store.entries.size > MAX_ENTRIES) {
    prune(store, now);
  }

  const key = `${policy.namespace}:${clientKey}`;
  const current = store.entries.get(key);
  const entry =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + policy.windowMs, touchedAt: now }
      : current;

  entry.touchedAt = now;
  if (entry.count >= policy.limit) {
    store.entries.set(key, entry);
    return {
      allowed: false,
      limit: policy.limit,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count += 1;
  store.entries.set(key, entry);
  return {
    allowed: true,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - entry.count),
    resetAt: entry.resetAt,
  };
}

export async function consumeRateLimit(
  clientKey: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): Promise<RateLimitResult> {
  if (!Number.isSafeInteger(policy.limit) || policy.limit < 1) {
    throw new Error("Rate-limit policy must have a positive integer limit.");
  }
  if (!Number.isSafeInteger(policy.windowMs) || policy.windowMs < 1_000) {
    throw new Error("Rate-limit policy window must be at least one second.");
  }
  if (!databaseConfigured()) {
    return consumeMemoryRateLimit(clientKey, policy, now);
  }

  const result = await query<{
    count: number;
    reset_at_ms: string | number;
  }>(
    `INSERT INTO api_rate_limits
       (namespace, client_key, request_count, reset_at, updated_at)
     VALUES (
       $1,
       $2,
       1,
       to_timestamp($3::double precision / 1000.0)
         + ($4::bigint * interval '1 millisecond'),
       now()
     )
     ON CONFLICT (namespace, client_key)
     DO UPDATE SET
       request_count = CASE
         WHEN api_rate_limits.reset_at <= to_timestamp($3::double precision / 1000.0)
           THEN 1
         ELSE least(
           api_rate_limits.request_count::bigint + 1,
           2147483647
         )::integer
       END,
       reset_at = CASE
         WHEN api_rate_limits.reset_at <= to_timestamp($3::double precision / 1000.0)
           THEN to_timestamp($3::double precision / 1000.0)
             + ($4::bigint * interval '1 millisecond')
         ELSE api_rate_limits.reset_at
       END,
       updated_at = now()
     RETURNING
       request_count AS count,
       extract(epoch FROM reset_at) * 1000 AS reset_at_ms`,
    [policy.namespace, clientKey, now, policy.windowMs],
  );
  const row = result.rows[0];
  const count = Number(row?.count);
  const resetAt = Number(row?.reset_at_ms);
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    !Number.isFinite(resetAt)
  ) {
    throw new Error("The shared rate-limit store returned an invalid result.");
  }
  return {
    allowed: count <= policy.limit,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - count),
    resetAt,
  };
}

export function rateLimitHeaders(result: RateLimitResult, now = Date.now()): HeadersInit {
  const resetSeconds = Math.max(1, Math.ceil((result.resetAt - now) / 1_000));
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(resetSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1_000)),
    ...(result.allowed ? {} : { "Retry-After": String(resetSeconds) }),
  };
}
