# Test suite

The unit suite exercises deterministic evaluation and local persistence behavior
without a third-party test runner. Tests are written in TypeScript, compiled to
`tests/dist`, and executed by Node's built-in `node:test` runner.

Run from the repository root:

```sh
npm exec -- tsc -p tests/tsconfig.json
node --test tests/dist/tests/*.test.js
```

The generated `tests/dist` directory is ignored. CI also runs the repository-wide
typecheck and the production Next.js build.

`npm run retention:verify` is a read-only structural verification of the
retention migration and worker. It checks explicit completion state, exclusion
of processed applications from new batches, wholesale replacement of candidate
state by a versioned non-identifying tombstone, stale-writer invalidation,
persisted object retry/backoff, and the requirement that every private object be
`deleted` before application completion. The command is included in `npm test`.

Current coverage deliberately focuses on pure or isolated behavior:

- evidence-backed interview scoring and abstention;
- deterministic rollups, hurdle gates, and the legacy candidate adapter;
- legacy `reading_pattern` data being discarded at runtime and evaluation
  boundaries after the feature was removed from the public contract,
  collection, reviewer UI, and ranking;
- audit-chain immutability;
- vacancy and application local-storage behavior;
- server-side storage guards and legacy competition resolution;
- immutable transcript hashing, correction isolation, human verification, and
  tamper detection;
- application-bound vacancy-version cohorts and strict historical selection.

`e2e-test.mjs` launches Chromium with fake camera and microphone devices, grants
only those permissions to the configured application origin, verifies the secure
device check, records and uploads a real WebM answer through `MediaRecorder`, and
submits the server-issued recording receipt with the answer. It then proves that
unverified manual transcripts block evaluation, performs the authorized
per-recording HR verification flow, evaluates only the reviewed text, and opens
private playback before recording a human decision.

Run it against an already-running server:

```sh
npm run test:e2e
```

Use `WBX_BASE_URL` for a non-default origin and `WBX_E2E_CODE` to test a specific
published competition. By default the test writes screenshots under the operating
system temporary directory so Next.js does not reload when the artifacts change.
Pass a different output directory as the first positional argument when needed.
