import assert from "node:assert/strict";
import { test } from "node:test";

import { sanitizeIntegritySignals } from "../lib/integrity-signals";

test("integrity telemetry accepts only the current explicit contract", () => {
  const sanitized = sanitizeIntegritySignals([
    {
      id: "legacy-reading",
      kind: "reading_pattern",
      level: "medium",
      note: "Legacy signal.",
    },
    {
      id: "unknown",
      kind: "future_unreviewed_signal",
      level: "low",
      note: "Unknown signal.",
    },
    {
      id: "tab",
      kind: "tab_switch",
      level: "low",
      note: "Candidate changed tabs; advisory context only.",
    },
    null,
  ]);

  assert.deepEqual(sanitized, [
    {
      id: "tab",
      kind: "tab_switch",
      level: "low",
      note: "Candidate changed tabs; advisory context only.",
    },
  ]);
});

