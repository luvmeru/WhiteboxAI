# Security policy

WhiteBox AI processes hiring data, camera and microphone recordings, transcripts,
AI output, and employment decision support. A confidentiality, integrity,
availability, accessibility, or fairness failure can materially affect a person.

Do not report vulnerabilities in a public issue and never include candidate data,
credentials, session cookies, recording receipts, recordings,
transcripts, object keys, or screenshots containing personal information.

## Supported versions

| Version | Security support |
| --- | --- |
| Latest reviewed commit on `main` | Supported during active development |
| Older commits, forks, and public demo deployments | Not supported |

The repository is pre-production. Real candidate recordings must not be processed
until every release gate in [DEPLOYMENT.md](DEPLOYMENT.md) is complete, including
the deployed recording-deletion schedule, monitoring, reconciliation, and erasure
drill documented there.

## Reporting a vulnerability

Use the repository host's private vulnerability-reporting feature when available.
Otherwise contact the owner through a private channel and request an encrypted
reporting route. Do not send exploit details or personal data in the initial
message.

Include, where safe:

- affected commit, route, and storage/provider configuration;
- impact and realistic attack scenario;
- minimal reproduction using synthetic data;
- whether any data was accessed or changed;
- suggested remediation, if known;
- a secure contact method.

The owner should acknowledge a report within two business days, assign severity
within five business days, and provide a remediation target. Any cross-tenant
recording access, authentication bypass, signing-key exposure, public object,
audit tampering, silent scoring change, or failed erasure is release-blocking.

## Recorded-video data flow

1. After explicit consent, the browser requests camera and microphone through
   `getUserMedia`.
2. `MediaRecorder` creates a per-answer clip. The browser lets the candidate
   review/re-record before upload.
3. The candidate session uploads same-origin multipart data. Total request size is
   capped at 24 MiB.
4. The server validates consent, session, application version, turn number, type,
   size, and WebM/MP4 signature. In production, FFprobe must also find decodable
   video and audio tracks within the allowed duration.
5. The server does not extract frames and rejects a multipart `frames` field.
   Camera imagery is not converted into behavioral or biometric signals.
6. Production storage uses an HTTPS S3-compatible endpoint and requests
   server-side encryption. The database stores metadata and SHA-256, not a public
   object URL.
7. OpenAI transcription is finalized as immutable provider text with a canonical
   SHA-256. Candidate corrections remain separate and cannot enter scoring until
   an authorized reviewer verifies them against the recording.
8. A signed short-lived receipt binds the stored object and provider-transcript
   status/model/hash to the server-owned application turn.
9. HR playback is an authenticated, tenant-scoped, same-origin proxy. The proxy
   verifies metadata, expiry, byte size, and SHA-256 before returning private,
   no-store content.

The local `.data/recordings` backend is available only in development demo mode.
It is not an encrypted production media store and must contain synthetic data
only.

## Implemented media controls

- Camera and microphone are permitted only to the same origin by the application
  permissions policy.
- Recording upload requires a candidate session, consent, same-origin request,
  current optimistic-lock version, and the current open turn.
- Uploads require a non-ambiguous `Content-Length`; transfer encoding and
  compressed request bodies are rejected.
- Multipart fields are allowlisted. After
  `003_video_only_recordings.sql`, the server and database accept only
  `video/webm` and `video/mp4`; image/frame fields are rejected.
- Outside development demo mode, FFprobe requires decodable video and audio tracks
  and a bounded duration.
- The total multipart request and the recording object are each capped at
  24 MiB. Multipart overhead means the usable media payload is slightly smaller.
- Storage keys use hashed tenant/application segments and random recording IDs.
- S3 requests are SigV4-signed on the server; credentials and object keys are not
  sent to the candidate or HR browser.
- Objects request `AES256` or configured KMS server-side encryption.
- SHA-256, expected byte size, application version, and turn are verified on
  receipt/playback.
- Recording receipts are HMAC-signed, bound to the storage key, media SHA-256,
  immutable provider-transcript SHA-256/status/model, application version, and
  turn, and expire after ten minutes.
- HR playback checks authentication, tenant ownership, the recording reference in
  server-owned interview history, and retention expiry. Responses use
  `private, no-store`.
- Candidate and HR media endpoints are rate-limited and return non-sensitive error
  messages. Production counters are atomic in PostgreSQL and shared by replicas.
  The configured client-IP header is used only when a trusted ingress strips and
  overwrites it.

The production probe adds codec/container parsing but is not malware scanning or
content moderation. FFprobe processes untrusted media in a bounded, private
temporary directory that is deleted after processing. Keep the size and
duration caps, run the service as a non-root user, keep the media tools patched,
test malformed containers, and complete a parser/storage threat assessment before
launch.

## Prohibited camera and microphone inference

Recorded media exists to let the candidate provide a disclosed answer and to
produce a reviewable transcript. The product does not collect, derive, display,
or score reading behavior, gaze, face geometry, identity, expression, emotion,
voice identity, accent, background, clothing, health, disability, personality,
or protected traits from camera/microphone data. Notes, looking away, pauses,
assistive technology, and an accessibility accommodation are never misconduct
signals.

Text-only accommodation is persisted in server-owned application state at
consent or when changed, and mode changes are audited. It uses the same questions
and rubric, carries no penalty, and rejects media uploads. Conversely, video-mode
answer submission requires a valid recording receipt. Accommodation use must not
be exposed as a negative signal.

Introducing any camera- or voice-derived assessment signal would require a
separate validated instrument, job-relatedness and fairness evidence, legal and
ethical review, a new candidate notice and an explicit product release. It is
outside the current security boundary.

## AI and hiring safety

Treat candidate text and every provider response as untrusted input. Provider
output must remain schema-validated, bounded, attributable to a model/prompt/rubric
version, and reviewable against exact submitted evidence. Instructions embedded in
candidate answers must not override the server-owned rubric.

The real-provider rollout boundary is part of the immutable vacancy config.
Historical configs without `aiExecution` retain deterministic behavior. The
server stamps only new vacancy IDs as `openai_required`, preserves that policy
across later versions, and snapshots it into each application. Browser payloads
cannot select, upgrade, or downgrade the policy. A required-provider failure
must stop authoring, transcription, interview continuation, or evaluation; it
must never be replaced with a plausible-looking stub result.

Appearance, voice characteristics, disability proxies, demographic attributes,
and unrelated background signals must not enter scoring. Insufficient evidence
must abstain and route to human review; it must not silently become a low score.
The final employment action requires a human decision and an auditable reason.

### Structured reference-check boundary

Candidate-supplied referee names and email addresses are contact instructions,
not evidence. Submitting a frozen reference block creates opaque bearer links
whose server records are bound to the tenant, application, vacancy version,
block, referee ordinal and relationship, and exact questionnaire hash. The URL
contains no name, email, application ID, or vacancy ID. Only a hash of the
normalized contact is stored in the invitation record; the bearer secret is
stored only as a hash.

Links expire at the published collection deadline and accept one response.
The public form requires consent, permits “unable to observe” for every item,
rejects unknown or missing question IDs, and asks only the frozen job-related
questions. A response creates an append-only receipt and a hash-bound pointer in
the application. It does not synthesize a score. Authorized reviewers can open
only the exact question/answer bound to their frozen review target; contact
hashes, network fingerprints, consent metadata, and unrelated answers are not
returned. Source and observer provenance are assigned by the server and cannot
be asserted by a browser.

Where no mail provider is connected, the candidate receives the one-time
delivery links immediately and must deliver them manually. Do not copy bearer
links into analytics, support logs, or issue trackers. The retention worker
deletes both invitation bindings and response content before replacing an
expired application with its tombstone.

Pending links can be recovered only inside the matching candidate session. The
server regenerates the bearer secret with an HMAC over the opaque invitation ID;
plaintext tokens are not stored. Concurrent recovery returns the same active
pending link, while completed, revoked, expired, cross-tenant, or differently
bound invitations are never returned.

### Transcript provenance boundary

The recorded-video score is not allowed to consume arbitrary client text. The
transcription provider result is finalized once in private recording metadata;
its canonical SHA-256 is included in the signed receipt. Candidate edits are
stored in separate fields with a correction hash, reason, and diff metadata.

An unchanged provider transcript has `provider_verified` status. A candidate
correction has `candidate_correction_pending` status, and a transcription outage
has `provider_unavailable` status. Both pending states fail closed at the HR
evaluation endpoint. An authorized recording reviewer must compare the clip,
record the server-selected transcript and a reason, and create a
`human_verified` audit event before the text can enter either the OpenAI or
deterministic evaluation path. Once an evaluation exists, transcript
re-verification is rejected so a stored score cannot silently become stale.

Adaptive follow-up generation may use the immutable provider transcript while a
candidate correction is pending. It receives neither the pending correction nor
unverified manual fallback text. This prevents unverified text from steering
later AI questions.

Changes to models, prompts, rubrics, weights, thresholds, evidence matching,
integrity handling, or protected-data processing require tests, versioning,
documented review, fairness validation, and a rollback path.

## Storage and playback

Keep the S3-compatible bucket private with public access blocked. Grant the
application identity only the required `PUT`, `GET`, and `DELETE` actions on the
recording prefix. Use workload identity or short-lived credentials where
available, enforce TLS and encryption in the bucket policy, rotate credentials,
and monitor data-plane access.

Playback intentionally does not return a direct or presigned bucket URL. The
same-origin application proxy hashes and verifies full reads. Valid range requests
use bounded signed S3 range reads (or bounded local reads) and validate the
returned range, byte count, and stored object hash metadata. Keep the 24 MiB cap
and load-test playback concurrency before launch.

Do not cache recordings at the CDN, browser service worker, reverse proxy, or
observability layer. Preserve `Cache-Control: private, no-store` and never put
recording identifiers into third-party analytics.

## Retention, deletion, and provider obligations

Consent records, application rows, recording metadata, and stored objects share a
configured retention deadline. The disclosed period is a maximum, not permission
to retain data indefinitely. Support earlier candidate erasure where law or policy
requires it.

`npm run retention:run` is production-only and requires the dedicated
`WBX_AUDIT_SECRET`, PostgreSQL, and HTTPS private storage credentials. It first
removes expired relational candidate content in
an atomic batch, including consent telemetry and candidate-linked free-text
decision reasons. Audit events store reason hashes rather than duplicate free
text; legacy expired payloads are reduced to hashes and the organization chain
is rebuilt while serialized against ordinary audit appends. Applications with
outstanding private objects remain explicitly
`object_delete_pending`; object failures persist an attempt counter, bounded
error, and capped exponential next-attempt time. Only applications whose
recording rows are all `deleted` become `complete` and receive
`retention_completed_at`. An attempted object failure produces a non-zero process
exit without blocking later application batches. Production must schedule the
worker, alert on failures and stale pending states, reconcile storage against
metadata, and prove the path with a staging erasure drill.

Object deletion alone is not complete erasure. The retention design must cover:

- primary and replica databases;
- S3 objects, failed multipart/orphan objects, and lifecycle versions;
- backups and disaster-recovery copies;
- application, proxy, WAF, and storage access logs;
- support exports and incident artifacts;
- OpenAI/provider requests and any abuse-monitoring retention;
- derived transcripts, evaluations, evidence, and caches.

Responses and transcription requests set `store: false` where supported, but
provider contractual terms, data residency, subprocessors, abuse monitoring,
and deletion must still be approved. Do not claim zero provider retention unless
the deployed account and contract actually guarantee it.

## Secrets, logs, and test data

Keep authentication, audit, and recording-receipt secrets independent. Store
database, OpenAI, and S3 credentials in a managed secret store. Never use
`NEXT_PUBLIC_` for a secret, commit an environment file, or expose readiness
details publicly without considering infrastructure disclosure.

Use synthetic identities, recordings, and answers in development, CI,
screenshots, support, and security reports. Never log:

- raw recordings, transcripts, submitted artifacts, or provider content;
- names, email addresses, invite codes, or candidate session tokens;
- recording receipts, storage keys, object URLs, API keys, or credentials;
- biometric, demographic, accommodation, or inferred sensitive data.

Security logs should contain a request ID, non-PII actor/application identifier,
organization ID, action, response class, release version, byte count, and deletion
state. Access must be least-privileged, time-bounded where possible, and auditable.

## High-priority vulnerability classes

Reports are especially valuable for:

- authentication, candidate-session, role, or tenant-isolation bypass;
- insecure direct object reference in recording upload or HR playback;
- public S3 access, SigV4 errors, path traversal, or storage-key disclosure;
- malformed media causing parser, memory, or denial-of-service impact;
- receipt forgery, replay, turn substitution, or lock-version bypass;
- prompt injection that changes scoring or crosses tenant boundaries;
- any camera-, appearance-, emotion-, gaze-, reading-, accent-, or
  voice-identity inference entering review or scoring;
- bypass of consent, accommodation, retention, erasure, or no-store controls;
- score, rubric, evidence, human-decision, or hash-chain tampering;
- secrets or candidate content in source, logs, client bundles, build artifacts,
  telemetry, or provider dashboards;
- dependency and CI/CD supply-chain compromise.

## Disclosure and safe research

Allow a reasonable remediation window before public disclosure. The project will
credit reporters who request attribution, minimize personal information, and
preserve evidence needed for incident response.

This policy does not authorize access to third-party data, real candidate
recordings, destructive testing, social engineering, service disruption, or
testing against systems you do not own.
