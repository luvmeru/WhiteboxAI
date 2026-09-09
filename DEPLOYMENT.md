# Production deployment runbook

A successful build is not sufficient authorization to process real hiring data.
WhiteBox AI handles candidate recordings, transcripts, evaluations, and employment
decision support. Promote it only after the technical gates and jurisdictional
privacy, employment, accessibility, and AI-governance reviews below are complete.

## Release architecture

The shipped application is a Next.js 15 standalone Node.js service. Production
state must live outside the web container:

- PostgreSQL 17 for organizations, users, vacancy versions, applications,
  recording metadata, evaluations, decisions, and audit events;
- a private S3-compatible bucket for recorded answers;
- OpenAI for structured interview/evaluation requests and transcription;
- FFprobe in the web runtime for server-side A/V track and duration validation;
- the shipped dedicated retention scheduler/worker (or an equivalent managed
  scheduled job);
- centralized logs, metrics, alerts, secrets, and backups.

The container and primary CI jobs use Node.js 24. Pin that release family across
CI, build, migration, worker, and web runtimes.

## Required environment

Start from `.env.example`, place production values in the deployment secret store,
and inject them at runtime. Do not commit `.env.production.local`.

| Variable | Production requirement |
| --- | --- |
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_APP_URL` | Canonical public HTTPS origin |
| `WBX_DEMO_MODE` | Explicitly `false` |
| `WBX_MIGRATION_DATABASE_URL` | Schema-owner URL, exposed only to migration/provisioning jobs |
| `DATABASE_URL` | Least-privileged web runtime PostgreSQL URL |
| `WBX_RETENTION_DATABASE_URL` | Separate least-privileged retention-worker URL |
| `WBX_DB_APP_USER`, `WBX_DB_APP_PASSWORD` | Credentials provisioned for the web runtime role |
| `WBX_DB_RETENTION_USER`, `WBX_DB_RETENTION_PASSWORD` | Independent credentials provisioned for the retention role |
| `WBX_DB_SSL` | Enable for external PostgreSQL; the supplied private Compose network uses `false` |
| `WBX_DB_SSL_REJECT_UNAUTHORIZED` | Keep `true` with a valid database certificate |
| `WBX_DB_POOL_SIZE` | Per-instance pool size; include all replicas in capacity planning |
| `WBX_AUTH_SECRET` | Independent random value, at least 32 characters |
| `WBX_AUDIT_SECRET` | Independent random value, at least 32 characters |
| `WBX_MEDIA_RECEIPT_SECRET` | Independent random value, at least 32 characters |
| `WBX_ADMIN_EMAIL` | Bootstrap organization owner |
| `WBX_ADMIN_PASSWORD_HASH` | `scrypt$...` output from the repository helper |
| `WBX_ORGANIZATION_ID` | Stable bootstrap tenant ID |
| `WBX_ORGANIZATION_NAME` | Bootstrap tenant display name |
| `AI_PROVIDER` | `openai` |
| `OPENAI_API_KEY` | Server-only API key |
| `OPENAI_MODEL` | Structured authoring, interview routing, and evidence-evaluation model |
| `OPENAI_TRANSCRIBE_MODEL` | Audio transcription model; default `gpt-4o-transcribe` |
| `WBX_FFPROBE_PATH` | FFprobe executable; defaults to `ffprobe` on `PATH` |
| `WBX_TRUSTED_PROXY_HEADER` | Client-IP header that the trusted ingress strips and overwrites; required for production rate limits |
| `WBX_MEDIA_S3_ENDPOINT` | HTTPS S3-compatible endpoint |
| `WBX_MEDIA_S3_REGION` | Signing region |
| `WBX_MEDIA_S3_BUCKET` | Private recording bucket |
| `WBX_MEDIA_S3_ACCESS_KEY_ID` | Narrowly scoped workload identity/access key |
| `WBX_MEDIA_S3_SECRET_ACCESS_KEY` | Corresponding secret |
| `WBX_MEDIA_S3_SESSION_TOKEN` | Optional temporary-credential token |
| `WBX_MEDIA_S3_FORCE_PATH_STYLE` | `true` for providers that require path-style addressing |
| `WBX_MEDIA_S3_SSE` | `AES256` or `aws:kms`; defaults to `AES256` |
| `WBX_MEDIA_S3_KMS_KEY_ID` | Required when `WBX_MEDIA_S3_SSE=aws:kms` |
| `WBX_RETENTION_INTERVAL_SECONDS` | Dedicated worker interval, 60–86400 seconds |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Docker Compose database owner only |

`API.md` is a local-development bridge only. It is ignored by Git, excluded from
the Docker context, and never read when `NODE_ENV=production`. Production must
inject `OPENAI_API_KEY` through the platform secret store.

New vacancy IDs are stamped server-side with `aiExecution.mode =
openai_required` at first publication. Publication is rejected unless the real
provider is configured. All later versions preserve that first policy, and
applications snapshot it at creation. Historical configs and applications with
no marker remain on the deterministic compatibility path; do not backfill the
field unless a separately approved migration is intended to change their
results. For `openai_required` applications, authoring, interview turns,
transcription, and evaluation have no deterministic fallback.

Although the runtime can fall back from the audit and media-receipt secrets to the
authentication secret, production should use three independent values so each can
be rotated and scoped separately.

Generate the bootstrap password hash:

```sh
npm run auth:hash-password -- "use-a-unique-password-of-at-least-12-characters"
```

The helper currently accepts the password as a command argument, which can enter
shell history. Use an ephemeral administrative environment and remove the command
from history after securely storing the generated hash.
When using Compose `--env-file`, store the full generated hash in single quotes:
`WBX_ADMIN_PASSWORD_HASH='scrypt$...$...'`. This prevents Compose from treating
the two dollar-delimited hash fields as environment substitutions.

### Private bucket policy

Block all public access. The application identity needs object `PUT`, `GET`, and
`DELETE` only for the configured bucket prefixes (`media/v1/` and
`artifacts/v1/`). Do not grant public
ACL management, bucket-policy administration, or access to unrelated prefixes.

Use a dedicated bucket that has never had versioning enabled and has Object Lock
disabled. Startup and retention fail when versioning is `Enabled` or
`Suspended`: an unversioned `DELETE` cannot prove physical removal of an older
version. The worker also rejects delete-marker/version-id responses and confirms
a signed `GET` returns 404 before metadata can become `deleted`.

Uploads request S3 server-side encryption (`AES256` or the configured KMS key).
Require TLS, deny unencrypted writes at the bucket policy, enable access logging,
and alert on access outside the application identity. Configure a lifecycle
expiration as a defense-in-depth upper bound, not as a substitute for exact
per-application deletion.

## Database migrations

Migrations are sorted by filename, recorded in `schema_migrations`, protected by a
PostgreSQL advisory lock, and applied transactionally:

- `001_initial.sql` creates tenant, application, transcript, evaluation, decision,
  consent, outbox, and hash-chained audit tables.
- `002_application_recordings.sql` creates private recording metadata, uniqueness
  constraints, content hashes, status, receipt expiry, and retention indexes.
- `003_video_only_recordings.sql` narrows stored recording content types to
  `video/webm` and `video/mp4`; audio-only uploads are no longer valid.
- `004_shared_rate_limits.sql` creates atomic PostgreSQL counters shared by all
  application instances.
- `005_retention_state_machine.sql` adds explicit application retention states
  and completion timestamps plus persisted recording-delete retry metadata.
- `006_transcript_provenance.sql` stores immutable provider transcript metadata,
  separate candidate corrections, reviewed text, hashes, and review attribution.
- `007_application_artifacts.sql` stores private assessment-artifact metadata,
  tenant/application/version/block bindings, idempotency, and deletion retries.
- `008_reference_checks.sql` stores opaque, expiring, single-use reference
  invitations and append-only structured questionnaire responses bound to the
  exact tenant, application, vacancy version, block, and questionnaire hash.
- `009_audit_sequence.sql` adds a tenant-scoped monotonic v2 HMAC sequence and
  append-only signed redaction checkpoints. It refuses to auto-sign
  unverifiable legacy events; those require an approved externally anchored
  upgrade.
- `010_pending_object_pii_redaction.sql` removes raw transcripts and candidate
  filenames as soon as object deletion becomes pending, even while S3 retries.

Run before starting the new application artifact:

```sh
npm ci
npm run db:migrate
node scripts/provision-database-roles.mjs
```

The migration command also creates or updates the bootstrap owner when
`WBX_ADMIN_EMAIL` and `WBX_ADMIN_PASSWORD_HASH` are set. Back up PostgreSQL and
test the migration against a production-like staging copy before promotion.

## Build and release gates

Run from a clean checkout with the committed lockfile:

```sh
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm audit --omit=dev --audit-level=high
ffprobe -version
```

Run the browser journey against a started release candidate:

```sh
npm run start
npm run test:e2e
```

CI uses synthetic Chromium camera and microphone devices. Add storage-provider
integration tests against a non-production private bucket before launch.

The production launcher also performs fail-closed live probes before importing
the web server: the full migration manifest plus critical triggers/constraints,
a non-owner runtime database role, `pgcrypto`, FFprobe, minimal real Responses
and transcription calls, bucket versioning/Object Lock state, and signed
encrypted PUT/GET/DELETE/absence canaries in both private storage prefixes. It
removes the canaries before startup succeeds.

Required non-automated gates:

- product-owner review of video, re-recording, transcript correction, text
  accommodation, resume, and HR adjudication;
- threat-model and tenant-isolation review;
- privacy/legal approval of recording, transcription, assessment methods, provider
  processing, and the actual retention period for every launch jurisdiction;
- job-relatedness and bias validation for every scoring configuration;
- accessibility testing with camera/microphone denied and text mode enabled;
- database restore, recording deletion, candidate erasure, and rollback drills;
- on-call ownership and incident/data-breach procedures.

## Deployment

### Standalone Node.js

After migrations and release gates:

```sh
npm run build
npm run start
```

The supplied Compose file binds the app only to `127.0.0.1:3000`. Put a
same-host reverse proxy in front of it, terminate TLS there, and configure that
proxy to strip and overwrite `WBX_TRUSTED_PROXY_HEADER`. Do not expose the
container port directly to untrusted clients.

`npm run start` copies `public/` and `.next/static/` into the generated
standalone bundle, completes the production preflight, and only then imports
`.next/standalone/server.js`. It reads
`PORT` directly from the process environment on every supported platform and
defaults to `3000`; no shell-specific environment assignment is required.
The Docker entrypoint uses the same ordering. Missing or placeholder secrets,
an incomplete/unreachable PostgreSQL schema, unavailable FFprobe, or an
unreachable private-storage endpoint exits non-zero before the HTTP server binds.

Install a maintained FFprobe build in the production runtime and ensure the
configured executable path is available to the non-root application user. The
repository Docker image currently installs the FFmpeg package that includes
FFprobe; apply operating-system security updates and rebuild the image regularly.

Terminate TLS at a trusted ingress, preserve the canonical `Host`, strip any
client-supplied value of `WBX_TRUSTED_PROXY_HEADER`, and overwrite it with the
verified peer address. Apply request-rate and body-size limits at the edge and
keep recording uploads below the application's 24 MiB total-request limit. The
application also uses atomic PostgreSQL counters, so limits remain consistent
across restarts and replicas.

### Docker Compose reference

Create `.env.production.local` in the deployment environment, then:

```sh
docker compose --env-file .env.production.local build
docker compose --env-file .env.production.local up -d
```

The `migrate` service receives only the owner URL and bootstrap values. The
`provision` service then creates or rotates separate non-owner web and retention
roles, forces `NOINHERIT`, removes every inherited role membership, and grants
their bounded DML privileges. Both runtime processes refuse to start if their
login role can inherit or switch to another role, differs from `session_user`,
or owns elevated capabilities. The database container receives only
`POSTGRES_*`; the worker does not receive authentication, administrator, or
OpenAI secrets; the read-only app starts only after provisioning succeeds. The
Compose file is a reference topology, not a complete highly available platform.

Verify both probes:

```sh
curl --fail https://your-origin.example/api/health/live
curl --fail https://your-origin.example/api/health/ready
```

The readiness endpoint must report every check as ready. In production this
includes executing FFprobe. Startup preflight is the first fail-closed gate;
the readiness probe remains the continuous gate used by the orchestrator after
the process has started.

## Recorded-answer pipeline

For each open interview turn:

1. The browser records camera and microphone with `MediaRecorder` for at most
   three minutes.
2. The persisted application mode controls the server contract: video mode
   requires a valid recording receipt for each answer, while
   `text_accommodation` rejects recorded media and uses the same questions and
   rubric without visual analysis. Consent and later mode changes persist the
   choice; changes use optimistic locking and create audit events.
3. The candidate can review and re-record locally. Only after **Use recording**
   does the browser send `recording`, `expectedVersion`, `turnNumber`, and the
   frozen-question binding as same-origin multipart form data.
4. The server requires `Content-Length`, rejects transfer/content encodings,
   rate-limits the candidate session, validates turn/version/consent, allows only
   WebM/MP4 media, and checks the container signature.
5. Outside development demo mode, FFprobe must decode metadata that includes both
   video and audio tracks and a duration from 0.5 through 301 seconds. The
   published per-question answer cap is enforced with a one-second tolerance.
6. The server does not extract frames or accept browser-supplied frames. Camera
   imagery is not used to infer reading, gaze, emotion, appearance, identity, or
   personality.
7. The entire multipart request is limited to 24 MiB; each recording is also
   limited to 24 MiB. Multipart boundaries and metadata share that total, so
   the practical maximum recording payload is slightly smaller.
8. Production writes the object to the private S3-compatible bucket and records
   its SHA-256 and retention deadline in `application_recordings`.
9. `OPENAI_TRANSCRIBE_MODEL` produces an immutable provider transcript. The
   server stores its canonical SHA-256 with the recording before issuing a
   receipt. Candidate corrections are separate records with their own hash,
   correction reason, and compact diff metadata.
10. A signed, ten-minute recording receipt binds object ID, application version,
    turn, media hash, and provider-transcript hash/status/model. A
    transcription outage or candidate correction remains ineligible for scoring
    until an authorized HR reviewer compares the video and records a
    human-verified selected transcript and reason.
11. Both production and deterministic evaluation endpoints fail closed if any
    recorded turn lacks a provider-verified or human-verified transcript. The AI
    evaluator receives only the server-selected reviewed text.

Production probing writes the upload to a private temporary directory with
owner-only file permissions. The temporary clip is removed in a `finally`
cleanup. Confirm
provider data-use and retention terms contractually; `store: false` is set for
the Responses request but is not, by itself, a complete data-retention agreement.

## Private playback

Recordings are not public. HR playback uses:

`GET /api/hr/applications/:applicationId/recordings/:recordingId`

The route requires an HR session with PII-reveal permission, resolves the
application inside the session's organization, verifies that interview history
references the recording, checks retention, and records an access audit event.
Full responses verify byte size and SHA-256. Valid byte ranges are forwarded as
bounded signed S3 range reads (or bounded local reads), with expected content
range, length, and stored hash metadata checks. Responses are private/no-store;
the object key and public/presigned URLs are never revealed.

## Retention and deletion

The published vacancy supplies `retentionDays`; applications and recording rows
receive a concrete `retention_deadline`. The candidate notice displays that period.
Backups, logs, analytics, support exports, and provider-side copies must follow the
same approved policy or a separately disclosed legal schedule.

Compose ships a dedicated non-root scheduler service. To execute one worker pass
manually for a controlled drill or from an equivalent managed scheduler, run:

```sh
npm run retention:run
```

The scheduler runs immediately and then at
`WBX_RETENTION_INTERVAL_SECONDS`; its health check fails when successful runs
become stale. The worker holds a PostgreSQL advisory lock for the full run. In one transaction
it claims up to 500 expired `active` or crash-recovery `processing`
applications, marks outstanding recordings and artifacts `delete_pending`,
removes identities, interview turns, consent telemetry, candidate-linked
free-text human decisions, reference invitations and reference responses, clears
evaluation output, invalidates the candidate session,
replaces the complete application JSON (answers, block results, reviews,
decisions, evidence, and transcript history) with a versioned non-identifying
tombstone, and advances the optimistic-lock version so an in-flight stale write
cannot restore erased data. Applications with outstanding objects move to
`object_delete_pending`; they are not selected again as new work, so an old S3
failure cannot starve later expiry batches.

Audit events never duplicate a review or decision reason: only its SHA-256 is
recorded. Before a legacy raw reason is redacted, the worker verifies every v2
sequence, link, and HMAC fail-closed. It rebuilds the chain under the same
organization lock and writes a signed append-only checkpoint containing the old
and new roots. A residual pass re-anonymizes stale `complete` records, removes
leftover identities, rotates candidate sessions, and returns any surviving
private object to `object_delete_pending`.

An independent queue retries due `delete_pending` objects. Each failure persists
an attempt counter, a safe bounded error, and a capped exponential
`delete_next_attempt_at`, while the anonymized application remains
`object_delete_pending`. A successful delete is idempotent, including an already
missing S3 object, and sets the recording `deleted`. Only an application with no
recording whose status differs from `deleted` moves to `complete` and receives
`retention_completed_at`. An attempted object failure makes the command exit
non-zero.

Upload reservations older than 15 minutes are treated as abandoned leases,
moved to the same durable deletion queue, and cleaned even when the
application's normal retention deadline is years away.

Run the read-only implementation check in CI and during release verification:

```sh
npm run retention:verify
```

Production operation must:

1. schedule the command frequently enough to meet the disclosed deadline;
2. alert on every non-zero exit, overdue `delete_pending` row, and stale
   `processing` or `object_delete_pending` application;
3. rerun safely until transient S3 failures clear;
4. reconcile orphan objects and metadata independently;
5. support candidate erasure requests without waiting for scheduled expiry;
6. preserve non-PII deletion evidence and pass a staging erasure drill;
7. define how backups age out without silently restoring erased recordings.

Treat a successful staging drill—not the presence of the script—as the release
gate for recording retention.

## Production smoke tests

Use synthetic candidates and verify:

- camera/microphone consent, denial, re-enable, re-record, and text accommodation;
- persistence and audit of consent-time and mid-interview mode changes, rejection
  of media in text accommodation, and receipt enforcement in video mode;
- 24 MiB rejection, audio-only and unsupported types, invalid signatures,
  undecodable/missing A/V tracks, over-duration clips, duplicate turn uploads,
  expired sessions, invalid receipts, and cross-origin requests;
- production readiness failure when FFprobe is unavailable;
- private S3 storage, requested server-side encryption, and absence of public URLs;
- transcription success, immutable provider hash, candidate correction diff and
  reason, manual fallback, fail-closed evaluation, HR verification, and rejection
  of transcript mutation after evaluation;
- uploads containing an unexpected `frames` multipart field are rejected;
- no reading, gaze, emotion, appearance, voice-identity, or accent signal appears
  in evaluation or ranking payloads;
- HR users cannot play another tenant's recording;
- playback returns no-store headers and valid range responses;
- expired, paused, closed, unknown, and already-submitted applications fail safely;
- evaluation abstentions and advisories reach a named human reviewer;
- database restore and end-to-end candidate deletion.

## Observability

Record request ID, organization ID, release SHA, non-PII application identifier,
latency, response class, model/prompt version, object byte count, and deletion job
state. Never log raw transcripts, recordings, submitted artifacts, candidate names,
session cookies, receipts, S3 keys, provider payloads, or API credentials.

Alert on:

- recording upload, transcription, artifact-storage, or playback failure rates;
- unexpected S3 `GET`, `PUT`, or `DELETE` actors;
- nearing the 120-second recording-route execution limit;
- `delete_pending` growth and any missed retention deadline;
- authentication/rate-limit spikes and cross-tenant denials;
- material scoring, abstention, confidence, or fairness changes.

## Rollback and go-live

On authorization leakage, incorrect scoring, media loss, uncontrolled provider
failure, or missed deletion:

1. disable new interview invitations and provider calls;
2. preserve audit evidence without copying candidate content into incident tools;
3. roll traffic back to the last compatible artifact;
4. keep the expanded database schema and avoid destructive down-migrations;
5. reconcile in-flight receipts, recordings, evaluations, and deletion jobs;
6. notify privacy/legal owners when candidate data or outcomes may be affected.

Record the release SHA, image digest, migration set, model names, prompt/rubric
versions, approvers, known limitations, rollback owner, deletion-drill evidence,
and monitoring links in the release ticket. Start with a synthetic/internal pilot
and require explicit human review of every outcome.
