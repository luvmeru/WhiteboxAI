import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalAuditEvent } from "../lib/server/audit-canonical.cjs";

function event(payload: Record<string, unknown>) {
  return {
    id: "123e4567-e89b-42d3-a456-426614174000",
    organizationId: "org-test",
    hashVersion: 2 as const,
    sequence: 7,
    actor: { type: "user", id: "usr-test" },
    action: "TESTED",
    targetType: "application",
    targetId: "app-test",
    requestId: null,
    payload,
    previousHash: "genesis",
    createdAt: "2026-07-31T00:00:00.000Z",
  };
}

test("audit canonicalization is stable across nested JSON key order", () => {
  const left = canonicalAuditEvent(
    event({ z: 1, nested: { beta: true, alpha: "x" }, a: 2 }),
  );
  const right = canonicalAuditEvent(
    event({ a: 2, nested: { alpha: "x", beta: true }, z: 1 }),
  );
  assert.equal(left, right);
  assert.match(left, /"hashVersion":2/);
  assert.match(left, /"sequence":7/);
});

test("audit canonicalization preserves JSON array positions", () => {
  const canonical = canonicalAuditEvent(
    event({ values: [1, undefined, 3] }),
  );
  assert.match(canonical, /"values":\[1,null,3\]/);
});
