import assert from "node:assert/strict";
import { test } from "node:test";

import { parseLocalOpenAIKey } from "../lib/server/local-api-key";

test("the development API file parser accepts the documented key name", () => {
  assert.equal(
    parseLocalOpenAIKey('open_ai_api = "test-key-that-is-long-enough"\n'),
    "test-key-that-is-long-enough",
  );
});

test("the API file parser rejects unrelated and short values", () => {
  assert.equal(parseLocalOpenAIKey('other = "test-key-that-is-long-enough"'), undefined);
  assert.equal(parseLocalOpenAIKey('open_ai_api = "short"'), undefined);
});
