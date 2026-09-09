import type { IntegritySignal } from "./types";

const ALLOWED_INTEGRITY_KINDS = new Set<IntegritySignal["kind"]>([
  "tab_switch",
  "paste",
  "latency",
  "similarity",
  "liveness",
  "ai_text",
  "typing_pattern",
]);

const ALLOWED_INTEGRITY_LEVELS = new Set<IntegritySignal["level"]>([
  "none",
  "low",
  "medium",
]);

/**
 * Treat integrity telemetry as untrusted input. In particular, legacy
 * `reading_pattern` records are intentionally not part of the public contract
 * and are discarded before any runtime, evaluation, or reviewer response can
 * use them.
 */
export function sanitizeIntegritySignals(input: unknown): IntegritySignal[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((candidate): IntegritySignal[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.kind !== "string" ||
      typeof record.level !== "string" ||
      typeof record.note !== "string" ||
      !ALLOWED_INTEGRITY_KINDS.has(
        record.kind as IntegritySignal["kind"],
      ) ||
      !ALLOWED_INTEGRITY_LEVELS.has(
        record.level as IntegritySignal["level"],
      )
    ) {
      return [];
    }

    return [
      {
        id: record.id.slice(0, 200),
        kind: record.kind as IntegritySignal["kind"],
        level: record.level as IntegritySignal["level"],
        note: record.note.slice(0, 1_000),
      },
    ];
  });
}
