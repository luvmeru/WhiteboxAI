"use strict";

function normalizeJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ||
      typeof item === "function" ||
      typeof item === "symbol"
        ? null
        : normalizeJson(item),
    );
  }
  if (typeof value === "object") {
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (
        item === undefined ||
        typeof item === "function" ||
        typeof item === "symbol"
      ) {
        continue;
      }
      normalized[key] = normalizeJson(item);
    }
    return normalized;
  }
  throw new TypeError("Audit values must be JSON-serializable.");
}

function stableJsonStringify(value) {
  return JSON.stringify(normalizeJson(value));
}

function canonicalAuditEvent(input) {
  return stableJsonStringify({
    id: input.id,
    organizationId: input.organizationId,
    hashVersion: input.hashVersion,
    sequence: input.sequence,
    actor: input.actor,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    requestId: input.requestId ?? null,
    payload: input.payload ?? {},
    previousHash: input.previousHash,
    createdAt: input.createdAt,
  });
}

module.exports = {
  canonicalAuditEvent,
  stableJsonStringify,
};
