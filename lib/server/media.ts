import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  mkdir,
  open,
  readdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { ApiError, ValidationError } from "./http";
import { databaseConfigured, query, transaction } from "./db";
import { effectiveSecret } from "./crypto";
import { getServerEnv, isDevelopmentDemoMode } from "./env";
import { transcriptSha256 } from "./transcript-provenance";

export const MAX_RECORDING_REQUEST_BYTES = 24 * 1024 * 1024;
const RECEIPT_TTL_SECONDS = 10 * 60;
const MIN_UPLOAD_RETENTION_WINDOW_MS = 5 * 60 * 1_000;
const LOCAL_RECORDING_ROOT = path.join(process.cwd(), ".data", "recordings");
const ALLOWED_CONTENT_TYPES = ["video/webm", "video/mp4"] as const;

export type RecordingContentType = (typeof ALLOWED_CONTENT_TYPES)[number];
export type RecordingStorageProvider = "s3" | "local-demo";
export type RecordingTranscriptionStatus =
  | "pending"
  | "succeeded"
  | "unavailable";

export interface ParsedRecordingUpload {
  bytes: Buffer;
  contentType: RecordingContentType;
  expectedVersion: number;
  turnNumber: number;
  recording: File;
}

export interface StoredRecording {
  id: string;
  applicationId: string;
  organizationId: string;
  applicationVersion: number;
  turnNumber: number;
  storageProvider: RecordingStorageProvider;
  storageBucket?: string;
  storageKey: string;
  contentType: RecordingContentType;
  byteSize: number;
  contentSha256: string;
  retentionDeadline: string;
  createdAt: string;
  status: "uploading" | "stored" | "delete_pending" | "deleted";
  transcriptionStatus: RecordingTranscriptionStatus;
  providerTranscript?: string;
  providerTranscriptSha256?: string;
  providerModel?: string;
  transcribedAt?: string;
}

export interface StoreRecordingInput {
  applicationId: string;
  organizationId: string;
  applicationVersion: number;
  turnNumber: number;
  contentType: RecordingContentType;
  bytes: Buffer;
  retentionDeadline: string;
}

export interface RecordingReceiptClaims {
  version: 2;
  recordingId: string;
  applicationId: string;
  applicationVersion: number;
  turnNumber: number;
  storageKeyHash: string;
  contentSha256: string;
  issuedAt: number;
  expiresAt: number;
  transcriptionStatus: Exclude<RecordingTranscriptionStatus, "pending">;
  providerTranscriptSha256?: string;
  providerModel: string;
}

interface S3Config {
  endpoint: URL;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  forcePathStyle: boolean;
  sse: "AES256" | "aws:kms";
  kmsKeyId?: string;
}

interface DatabaseRecordingRow {
  id: string;
  application_id: string;
  organization_id: string;
  application_lock_version: number;
  turn_number: number;
  storage_provider: RecordingStorageProvider;
  storage_bucket: string | null;
  storage_key: string;
  content_type: RecordingContentType;
  byte_size: string | number;
  content_sha256: string;
  status: StoredRecording["status"];
  retention_deadline: Date | string;
  created_at: Date | string;
  transcription_status: RecordingTranscriptionStatus;
  provider_transcript: string | null;
  provider_transcript_sha256: string | null;
  provider_model: string | null;
  transcribed_at: Date | string | null;
}

interface Reservation {
  recording: StoredRecording;
  alreadyStored: boolean;
}

export function assertRecordingRequestHeaders(request: Request): void {
  const transferEncoding = request.headers.get("transfer-encoding");
  if (transferEncoding) {
    throw new ApiError(
      400,
      "AMBIGUOUS_BODY_LENGTH",
      "Transfer-Encoding is not accepted for recording uploads.",
    );
  }

  const contentEncoding = request.headers.get("content-encoding")?.trim().toLowerCase();
  if (contentEncoding && contentEncoding !== "identity") {
    throw new ApiError(
      415,
      "UNSUPPORTED_CONTENT_ENCODING",
      "Compressed recording requests are not supported.",
    );
  }

  const rawLength = request.headers.get("content-length")?.trim();
  if (!rawLength) {
    throw new ApiError(411, "LENGTH_REQUIRED", "Content-Length is required for recording uploads.");
  }
  if (!/^[0-9]+$/.test(rawLength)) {
    throw new ApiError(400, "INVALID_CONTENT_LENGTH", "Invalid Content-Length header.");
  }
  const contentLength = Number(rawLength);
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
    throw new ApiError(400, "INVALID_CONTENT_LENGTH", "Invalid Content-Length header.");
  }
  if (contentLength > MAX_RECORDING_REQUEST_BYTES) {
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      `Recording requests must not exceed ${MAX_RECORDING_REQUEST_BYTES} bytes.`,
    );
  }

  const contentType = request.headers.get("content-type")?.trim() ?? "";
  const multipart = /^multipart\/form-data;\s*boundary=(?:"([^"]{1,70})"|([!#$%&'*+\-.^_`|~0-9A-Za-z]{1,70}))$/i;
  if (!multipart.test(contentType)) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be multipart/form-data with a valid boundary.",
    );
  }
}

export async function parseRecordingMultipart(request: Request): Promise<ParsedRecordingUpload> {
  assertRecordingRequestHeaders(request);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError(400, "INVALID_MULTIPART", "The multipart request could not be parsed.");
  }

  const allowedFields = new Set(["recording", "expectedVersion", "turnNumber"]);
  for (const key of form.keys()) {
    if (!allowedFields.has(key)) {
      throw new ValidationError(`body.${key}`, "is not allowed");
    }
  }

  const recordings = form.getAll("recording");
  const versions = form.getAll("expectedVersion");
  const turns = form.getAll("turnNumber");
  if (recordings.length !== 1) {
    throw new ValidationError("body.recording", "must be provided exactly once");
  }
  if (versions.length !== 1) {
    throw new ValidationError("body.expectedVersion", "must be provided exactly once");
  }
  if (turns.length !== 1) {
    throw new ValidationError("body.turnNumber", "must be provided exactly once");
  }

  const recording = recordings[0];
  if (typeof recording === "string") {
    throw new ValidationError("body.recording", "must be a file");
  }
  const contentType = recording.type.trim().toLowerCase().split(";", 1)[0];
  if (!isRecordingContentType(contentType)) {
    throw new ValidationError(
      "body.recording",
      `must use one of: ${ALLOWED_CONTENT_TYPES.join(", ")}`,
    );
  }
  if (recording.size < 1 || recording.size > MAX_RECORDING_REQUEST_BYTES) {
    throw new ValidationError(
      "body.recording",
      `must contain between 1 and ${MAX_RECORDING_REQUEST_BYTES} bytes`,
    );
  }

  const expectedVersion = parsePositiveIntegerField(versions[0], "body.expectedVersion", 1_000_000);
  const turnNumber = parsePositiveIntegerField(turns[0], "body.turnNumber", 2_000);
  const bytes = Buffer.from(await recording.arrayBuffer());
  if (bytes.byteLength !== recording.size) {
    throw new ApiError(400, "INCOMPLETE_RECORDING", "The recording upload was incomplete.");
  }
  assertMediaSignature(bytes, contentType);

  return {
    bytes,
    contentType,
    expectedVersion,
    turnNumber,
    recording,
  };
}

function parsePositiveIntegerField(
  value: FormDataEntryValue,
  pathName: string,
  max: number,
): number {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new ValidationError(pathName, "must be a positive integer");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > max) {
    throw new ValidationError(pathName, `must be at most ${max}`);
  }
  return parsed;
}

function isRecordingContentType(value: string): value is RecordingContentType {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(value);
}

function assertMediaSignature(bytes: Buffer, contentType: RecordingContentType): void {
  if (contentType === "video/mp4") {
    const isIsoBaseMedia =
      bytes.byteLength >= 12 &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70;
    if (!isIsoBaseMedia) {
      throw new ValidationError("body.recording", "does not contain a valid MP4 signature");
    }
    return;
  }

  const hasEbmlHeader =
    bytes.byteLength >= 8 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3;
  const headerText = bytes.subarray(0, Math.min(bytes.byteLength, 4_096)).toString("latin1");
  if (!hasEbmlHeader || !headerText.includes("webm")) {
    throw new ValidationError("body.recording", "does not contain a valid WebM signature");
  }
}

export async function storePrivateRecording(
  input: StoreRecordingInput,
): Promise<{ recording: StoredRecording; reused: boolean }> {
  if (
    !input.applicationId ||
    !input.organizationId ||
    !Number.isSafeInteger(input.applicationVersion) ||
    input.applicationVersion < 1 ||
    !Number.isSafeInteger(input.turnNumber) ||
    input.turnNumber < 1
  ) {
    throw new Error("Invalid recording storage input.");
  }
  if (input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_RECORDING_REQUEST_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "The recording exceeds the storage limit.");
  }

  const retentionDeadline = new Date(input.retentionDeadline);
  if (
    !Number.isFinite(retentionDeadline.getTime()) ||
    retentionDeadline.getTime() <= Date.now() + MIN_UPLOAD_RETENTION_WINDOW_MS
  ) {
    throw new ApiError(410, "RETENTION_EXPIRED", "This application's retention window has expired.");
  }

  const s3 = resolveS3Config();
  if (s3 && !databaseConfigured()) {
    throw new ApiError(
      503,
      "MEDIA_METADATA_NOT_CONFIGURED",
      "PostgreSQL is required when S3-compatible recording storage is enabled.",
    );
  }
  const storageProvider: RecordingStorageProvider = s3 ? "s3" : requireLocalDemoStorage();
  const id = randomUUID();
  const contentSha256 = sha256Hex(input.bytes);
  const storageKey = makeStorageKey(input, id);
  let candidate: StoredRecording = {
    id,
    applicationId: input.applicationId,
    organizationId: input.organizationId,
    applicationVersion: input.applicationVersion,
    turnNumber: input.turnNumber,
    storageProvider,
    storageBucket: s3?.bucket,
    storageKey,
    contentType: input.contentType,
    byteSize: input.bytes.byteLength,
    contentSha256,
    retentionDeadline: retentionDeadline.toISOString(),
    createdAt: new Date().toISOString(),
    status: "uploading",
    transcriptionStatus: "pending",
  };

  const reservation = databaseConfigured()
    ? await reserveDatabaseRecording(candidate)
    : await reserveLocalRecording(candidate);
  candidate = reservation.recording;
  if (reservation.alreadyStored) return { recording: candidate, reused: true };

  try {
    if (candidate.storageProvider === "s3") {
      if (!s3) throw mediaConfigurationError();
      await putS3Object(s3, candidate, input.bytes);
    } else {
      await putLocalObject(candidate, input.bytes);
    }

    const stored = { ...candidate, status: "stored" as const };
    if (databaseConfigured()) await finalizeDatabaseRecording(stored);
    else await writeLocalMetadata(stored);
    return { recording: stored, reused: false };
  } catch (error) {
    try {
      await markReservationDeletePending(candidate);
    } catch {
      // Object cleanup is still attempted when metadata persistence is down.
    }
    try {
      await deleteRecordingObject(candidate);
      await releaseFailedReservation(candidate);
    } catch (cleanupError) {
      try {
        await markReservationDeletePending(candidate);
      } catch (requeueError) {
        console.error("[media:cleanup] failed to persist a recording cleanup retry", {
          recordingId: candidate.id,
          cleanupError:
            cleanupError instanceof Error ? cleanupError.name : "UnknownError",
          requeueError:
            requeueError instanceof Error ? requeueError.name : "UnknownError",
        });
      }
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, "MEDIA_STORAGE_UNAVAILABLE", "Recording storage is temporarily unavailable.");
  }
}

function resolveS3Config(): S3Config | null {
  const env = getServerEnv();
  const values = [
    env.WBX_MEDIA_S3_ENDPOINT,
    env.WBX_MEDIA_S3_REGION,
    env.WBX_MEDIA_S3_BUCKET,
    env.WBX_MEDIA_S3_ACCESS_KEY_ID,
    env.WBX_MEDIA_S3_SECRET_ACCESS_KEY,
  ];
  const configured = values.filter(Boolean).length;
  if (configured === 0) return null;
  if (configured !== values.length) throw mediaConfigurationError();

  const endpoint = new URL(env.WBX_MEDIA_S3_ENDPOINT!);
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    (env.NODE_ENV === "production" && endpoint.protocol !== "https:")
  ) {
    throw mediaConfigurationError();
  }
  const sse = env.WBX_MEDIA_S3_SSE ?? "AES256";
  if (sse === "aws:kms" && !env.WBX_MEDIA_S3_KMS_KEY_ID) {
    throw mediaConfigurationError();
  }
  return {
    endpoint,
    region: env.WBX_MEDIA_S3_REGION!,
    bucket: env.WBX_MEDIA_S3_BUCKET!,
    accessKeyId: env.WBX_MEDIA_S3_ACCESS_KEY_ID!,
    secretAccessKey: env.WBX_MEDIA_S3_SECRET_ACCESS_KEY!,
    sessionToken: env.WBX_MEDIA_S3_SESSION_TOKEN,
    forcePathStyle: env.WBX_MEDIA_S3_FORCE_PATH_STYLE !== "false",
    sse,
    kmsKeyId: env.WBX_MEDIA_S3_KMS_KEY_ID,
  };
}

function requireLocalDemoStorage(): "local-demo" {
  if (!isDevelopmentDemoMode()) throw mediaConfigurationError();
  return "local-demo";
}

function mediaConfigurationError(): ApiError {
  return new ApiError(
    503,
    "MEDIA_STORAGE_NOT_CONFIGURED",
    "Private recording storage is not configured.",
  );
}

function makeStorageKey(input: StoreRecordingInput, id: string): string {
  const organization = sha256Hex(input.organizationId).slice(0, 20);
  const application = sha256Hex(input.applicationId).slice(0, 24);
  return `media/v1/${organization}/${application}/v${input.applicationVersion}/t${input.turnNumber}/${id}`;
}

async function reserveDatabaseRecording(recording: StoredRecording): Promise<Reservation> {
  try {
    const result = await query<DatabaseRecordingRow>(
      `INSERT INTO application_recordings
         (id, application_id, organization_id, application_lock_version, turn_number,
          storage_provider, storage_bucket, storage_key, content_type, byte_size,
          content_sha256, status, retention_deadline)
       SELECT $1::uuid, a.id, a.organization_id, $4, $5,
              $6, $7, $8, $9, $10, $11, 'uploading', a.retention_deadline
         FROM applications a
        WHERE a.id = $2
          AND a.organization_id = $3
          AND a.lock_version = $4
          AND a.retention_deadline > now() + interval '5 minutes'
          AND a.retention_status = 'active'
       RETURNING *`,
      [
        recording.id,
        recording.applicationId,
        recording.organizationId,
        recording.applicationVersion,
        recording.turnNumber,
        recording.storageProvider,
        recording.storageBucket ?? null,
        recording.storageKey,
        recording.contentType,
        recording.byteSize,
        recording.contentSha256,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ApiError(
        409,
        "VERSION_CONFLICT",
        "Interview state changed or its retention window expired.",
      );
    }
    return { recording: databaseRowToRecording(row), alreadyStored: false };
  } catch (error) {
    if (!isPostgresUniqueViolation(error)) throw error;
    const existing = await findDatabaseRecording(
      recording.applicationId,
      recording.applicationVersion,
      recording.turnNumber,
    );
    if (
      existing?.status === "stored" &&
      existing.contentSha256 === recording.contentSha256 &&
      existing.contentType === recording.contentType
    ) {
      return { recording: existing, alreadyStored: true };
    }
    throw new ApiError(
      409,
      "RECORDING_ALREADY_EXISTS",
      "A recording already exists for this interview turn and version.",
    );
  }
}

async function findDatabaseRecording(
  applicationId: string,
  applicationVersion: number,
  turnNumber: number,
): Promise<StoredRecording | null> {
  const result = await query<DatabaseRecordingRow>(
    `SELECT *
       FROM application_recordings
      WHERE application_id = $1
        AND application_lock_version = $2
        AND turn_number = $3
      LIMIT 1`,
    [applicationId, applicationVersion, turnNumber],
  );
  return result.rows[0] ? databaseRowToRecording(result.rows[0]) : null;
}

export async function findStoredRecordingForTurn(input: {
  applicationId: string;
  organizationId: string;
  applicationVersion: number;
  turnNumber: number;
}): Promise<StoredRecording | null> {
  let recording: StoredRecording | null;
  if (databaseConfigured()) {
    const result = await query<DatabaseRecordingRow>(
      `SELECT *
         FROM application_recordings
        WHERE application_id = $1
          AND organization_id = $2
          AND application_lock_version = $3
          AND turn_number = $4
          AND status = 'stored'
          AND retention_deadline > now()
        LIMIT 1`,
      [
        input.applicationId,
        input.organizationId,
        input.applicationVersion,
        input.turnNumber,
      ],
    );
    recording = result.rows[0] ? databaseRowToRecording(result.rows[0]) : null;
  } else {
    recording = await readLocalMetadata(localMetadataPath(input));
  }
  if (
    !recording ||
    recording.status !== "stored" ||
    recording.applicationId !== input.applicationId ||
    recording.organizationId !== input.organizationId ||
    recording.applicationVersion !== input.applicationVersion ||
    recording.turnNumber !== input.turnNumber ||
    Date.parse(recording.retentionDeadline) <= Date.now()
  ) {
    return null;
  }
  return recording;
}

function databaseRowToRecording(row: DatabaseRecordingRow): StoredRecording {
  const iso = (value: Date | string): string =>
    value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  return {
    id: row.id,
    applicationId: row.application_id,
    organizationId: row.organization_id,
    applicationVersion: row.application_lock_version,
    turnNumber: row.turn_number,
    storageProvider: row.storage_provider,
    storageBucket: row.storage_bucket ?? undefined,
    storageKey: row.storage_key,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    contentSha256: row.content_sha256,
    retentionDeadline: iso(row.retention_deadline),
    createdAt: iso(row.created_at),
    status: row.status,
    transcriptionStatus: row.transcription_status,
    providerTranscript: row.provider_transcript ?? undefined,
    providerTranscriptSha256: row.provider_transcript_sha256 ?? undefined,
    providerModel: row.provider_model ?? undefined,
    transcribedAt: row.transcribed_at ? iso(row.transcribed_at) : undefined,
  };
}

async function finalizeDatabaseRecording(recording: StoredRecording): Promise<void> {
  const result = await query(
    `UPDATE application_recordings
        SET status = 'stored', stored_at = now()
      WHERE id = $1::uuid AND status = 'uploading'`,
    [recording.id],
  );
  if (!result.rowCount) {
    throw new ApiError(503, "MEDIA_METADATA_FAILED", "Recording metadata could not be finalized.");
  }
}

export async function finalizeRecordingTranscription(
  recording: StoredRecording,
  input:
    | { status: "succeeded"; transcript: string; providerModel: string }
    | { status: "unavailable"; providerModel: string },
): Promise<StoredRecording> {
  if (recording.status !== "stored") {
    throw new Error("Only a stored recording can receive transcription metadata.");
  }
  const providerModel = input.providerModel.trim();
  const providerTranscript =
    input.status === "succeeded" ? input.transcript.trim() : undefined;
  if (
    !providerModel ||
    providerModel.length > 200 ||
    (input.status === "succeeded" &&
      (!providerTranscript || providerTranscript.length > 50_000))
  ) {
    throw new Error("Invalid recording transcription metadata.");
  }
  const providerTranscriptSha256 = providerTranscript
    ? transcriptSha256(providerTranscript)
    : undefined;
  const transcribedAt = new Date().toISOString();

  if (databaseConfigured()) {
    const result = await query<DatabaseRecordingRow>(
      `UPDATE application_recordings
          SET transcription_status = $2,
              provider_transcript = $3,
              provider_transcript_sha256 = $4,
              provider_model = $5,
              transcribed_at = $6
        WHERE id = $1::uuid
          AND status = 'stored'
          AND transcription_status = 'pending'
        RETURNING *`,
      [
        recording.id,
        input.status,
        providerTranscript ?? null,
        providerTranscriptSha256 ?? null,
        providerModel,
        transcribedAt,
      ],
    );
    if (result.rows[0]) return databaseRowToRecording(result.rows[0]);
    const existing = await query<DatabaseRecordingRow>(
      `SELECT *
         FROM application_recordings
        WHERE id = $1::uuid
          AND application_id = $2
          AND organization_id = $3
        LIMIT 1`,
      [recording.id, recording.applicationId, recording.organizationId],
    );
    const resolved = existing.rows[0]
      ? databaseRowToRecording(existing.rows[0])
      : null;
    if (
      resolved &&
      resolved.status === "stored" &&
      resolved.transcriptionStatus === input.status &&
      resolved.providerTranscriptSha256 === providerTranscriptSha256 &&
      resolved.providerModel === providerModel
    ) {
      return resolved;
    }
    throw new ApiError(
      409,
      "TRANSCRIPTION_ALREADY_FINALIZED",
      "The immutable provider transcript was already finalized.",
    );
  }

  const current =
    (await readLocalMetadata(localMetadataPath(recording))) ?? recording;
  if (current.transcriptionStatus !== "pending") {
    if (
      current.transcriptionStatus === input.status &&
      current.providerTranscriptSha256 === providerTranscriptSha256 &&
      current.providerModel === providerModel
    ) {
      return current;
    }
    throw new ApiError(
      409,
      "TRANSCRIPTION_ALREADY_FINALIZED",
      "The immutable provider transcript was already finalized.",
    );
  }
  const next: StoredRecording = {
    ...current,
    transcriptionStatus: input.status,
    providerTranscript,
    providerTranscriptSha256,
    providerModel,
    transcribedAt,
  };
  await writeLocalMetadata(next);
  return next;
}

async function reserveLocalRecording(recording: StoredRecording): Promise<Reservation> {
  await mkdir(LOCAL_RECORDING_ROOT, { recursive: true, mode: 0o700 });
  const metadataPath = localMetadataPath(recording);
  try {
    await writeFile(metadataPath, `${JSON.stringify(recording)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    return { recording, alreadyStored: false };
  } catch (error) {
    if (!isFileExistsError(error)) throw error;
    const existing = await readLocalMetadata(metadataPath);
    if (
      existing?.status === "stored" &&
      existing.contentSha256 === recording.contentSha256 &&
      existing.contentType === recording.contentType
    ) {
      return { recording: existing, alreadyStored: true };
    }
    throw new ApiError(
      409,
      "RECORDING_ALREADY_EXISTS",
      "A recording already exists for this interview turn and version.",
    );
  }
}

async function readLocalMetadata(metadataPath: string): Promise<StoredRecording | null> {
  try {
    const value = JSON.parse(await readFile(metadataPath, "utf8")) as Partial<StoredRecording>;
    if (
      typeof value.id !== "string" ||
      typeof value.applicationId !== "string" ||
      typeof value.organizationId !== "string" ||
      typeof value.applicationVersion !== "number" ||
      typeof value.turnNumber !== "number" ||
      value.storageProvider !== "local-demo" ||
      typeof value.storageKey !== "string" ||
      !isRecordingContentType(value.contentType ?? "") ||
      typeof value.byteSize !== "number" ||
      typeof value.contentSha256 !== "string" ||
      typeof value.retentionDeadline !== "string" ||
      typeof value.createdAt !== "string" ||
      !["uploading", "stored", "delete_pending", "deleted"].includes(value.status ?? "")
    ) {
      return null;
    }
    const transcriptionStatus =
      value.transcriptionStatus === "succeeded" ||
      value.transcriptionStatus === "unavailable"
        ? value.transcriptionStatus
        : "pending";
    return { ...value, transcriptionStatus } as StoredRecording;
  } catch {
    return null;
  }
}

async function writeLocalMetadata(recording: StoredRecording): Promise<void> {
  await writeFile(localMetadataPath(recording), `${JSON.stringify(recording)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function localMetadataPath(recording: Pick<
  StoredRecording,
  "organizationId" | "applicationId" | "applicationVersion" | "turnNumber"
>): string {
  const id = sha256Hex(
    `${recording.organizationId}\0${recording.applicationId}\0${recording.applicationVersion}\0${recording.turnNumber}`,
  );
  return path.join(LOCAL_RECORDING_ROOT, `${id}.json`);
}

async function putLocalObject(recording: StoredRecording, bytes: Buffer): Promise<void> {
  if (recording.storageProvider !== "local-demo") throw new Error("Invalid local recording.");
  const target = localObjectPath(recording.storageKey);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  try {
    await writeFile(target, bytes, { mode: 0o600, flag: "wx" });
  } catch (error) {
    if (isFileExistsError(error)) {
      throw new ApiError(409, "RECORDING_ALREADY_EXISTS", "The recording object already exists.");
    }
    throw error;
  }
}

function localObjectPath(storageKey: string): string {
  if (!/^media\/v1\/[a-z0-9/_-]+$/.test(storageKey)) {
    throw new Error("Unsafe recording storage key.");
  }
  const resolvedRoot = path.resolve(LOCAL_RECORDING_ROOT);
  const resolved = path.resolve(LOCAL_RECORDING_ROOT, ...storageKey.split("/"));
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Unsafe recording storage path.");
  }
  return resolved;
}

async function putS3Object(config: S3Config, recording: StoredRecording, bytes: Buffer): Promise<void> {
  const headers: Record<string, string> = {
    "content-length": String(bytes.byteLength),
    "content-type": recording.contentType,
    "x-amz-content-sha256": recording.contentSha256,
    "x-amz-meta-content-sha256": recording.contentSha256,
    "x-amz-meta-recording-id": recording.id,
    "x-amz-meta-retention-deadline": recording.retentionDeadline,
    "x-amz-server-side-encryption": config.sse,
  };
  if (config.sse === "aws:kms" && config.kmsKeyId) {
    headers["x-amz-server-side-encryption-aws-kms-key-id"] = config.kmsKeyId;
  }
  const response = await signedS3Request(
    config,
    "PUT",
    recording.storageKey,
    headers,
    bytes,
  );
  if (response.headers.has("x-amz-version-id")) {
    await response.body?.cancel();
    throw new ApiError(
      503,
      "MEDIA_STORAGE_VERSIONING_UNSAFE",
      "Recording storage returned a versioned object; retention-safe storage is required.",
    );
  }
  await response.body?.cancel();
}

async function signedS3Request(
  config: S3Config,
  method: "PUT" | "DELETE" | "GET",
  storageKey: string,
  headers: Record<string, string>,
  body?: Buffer,
  allowNotFound = false,
): Promise<Response> {
  const { url, canonicalUri } = s3ObjectUrl(config, storageKey);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = amzDate.slice(0, 8);
  const payloadHash = headers["x-amz-content-sha256"] ?? sha256Hex(Buffer.alloc(0));
  const signingHeaders: Record<string, string> = {
    ...headers,
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (config.sessionToken) {
    signingHeaders["x-amz-security-token"] = config.sessionToken;
  }

  const headerNames = Object.keys(signingHeaders).map((name) => name.toLowerCase()).sort();
  const normalizedHeaders = new Map<string, string>();
  for (const [name, value] of Object.entries(signingHeaders)) {
    normalizedHeaders.set(name.toLowerCase(), value.trim().replace(/\s+/g, " "));
  }
  const canonicalHeaders = headerNames
    .map((name) => `${name}:${normalizedHeaders.get(name)}`)
    .join("\n");
  const signedHeaders = headerNames.join(";");
  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${shortDate}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const dateKey = hmac(Buffer.from(`AWS4${config.secretAccessKey}`, "utf8"), shortDate);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = hmac(signingKey, stringToSign).toString("hex");
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const requestHeaders = new Headers();
  for (const [name, value] of normalizedHeaders) {
    if (name !== "host") requestHeaders.set(name, value);
  }
  requestHeaders.set("authorization", authorization);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? (body as unknown as BodyInit) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new ApiError(503, "MEDIA_STORAGE_UNAVAILABLE", "Recording storage is temporarily unavailable.");
  }
  if (!response.ok && !(allowNotFound && response.status === 404)) {
    await response.body?.cancel();
    throw new ApiError(503, "MEDIA_STORAGE_UNAVAILABLE", "Recording storage rejected the upload.");
  }
  return response;
}

function s3ObjectUrl(config: S3Config, storageKey: string): { url: URL; canonicalUri: string } {
  if (!/^media\/v1\/[a-z0-9/_-]+$/.test(storageKey)) {
    throw new Error("Unsafe recording storage key.");
  }
  const url = new URL(config.endpoint.toString());
  const baseSegments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const keySegments = storageKey.split("/");
  const segments = config.forcePathStyle
    ? [...baseSegments, config.bucket, ...keySegments]
    : [...baseSegments, ...keySegments];
  if (!config.forcePathStyle) url.hostname = `${config.bucket}.${url.hostname}`;
  const canonicalUri = `/${segments.map(awsUriEncode).join("/")}`;
  url.pathname = canonicalUri;
  url.search = "";
  url.hash = "";
  return { url, canonicalUri: url.pathname };
}

function awsUriEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function hmac(key: Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isPostgresUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505",
  );
}

function isFileExistsError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST",
  );
}

function isCanonicalUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function findStoredRecordingById(input: {
  id: string;
  applicationId: string;
  organizationId: string;
}): Promise<StoredRecording | null> {
  if (!isCanonicalUuid(input.id)) return null;

  let recording: StoredRecording | null = null;
  if (databaseConfigured()) {
    const result = await query<DatabaseRecordingRow>(
      `SELECT *
         FROM application_recordings
        WHERE id = $1::uuid
          AND application_id = $2
          AND organization_id = $3
          AND status = 'stored'
          AND retention_deadline > now()
        LIMIT 1`,
      [input.id, input.applicationId, input.organizationId],
    );
    recording = result.rows[0] ? databaseRowToRecording(result.rows[0]) : null;
  } else if (isDevelopmentDemoMode()) {
    let entries;
    try {
      entries = await readdir(LOCAL_RECORDING_ROOT, { withFileTypes: true });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === "ENOENT"
      ) {
        return null;
      }
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const candidate = await readLocalMetadata(
        path.join(LOCAL_RECORDING_ROOT, entry.name),
      );
      if (
        candidate?.id === input.id &&
        candidate.applicationId === input.applicationId &&
        candidate.organizationId === input.organizationId
      ) {
        recording = candidate;
        break;
      }
    }
  }

  if (
    !recording ||
    recording.status !== "stored" ||
    Date.parse(recording.retentionDeadline) <= Date.now()
  ) {
    return null;
  }
  return recording;
}

export async function readPrivateRecording(
  recording: StoredRecording,
): Promise<Buffer> {
  if (
    recording.status !== "stored" ||
    recording.byteSize < 1 ||
    recording.byteSize > MAX_RECORDING_REQUEST_BYTES ||
    Date.parse(recording.retentionDeadline) <= Date.now()
  ) {
    throw new ApiError(410, "RECORDING_UNAVAILABLE", "The recording is no longer available.");
  }

  let bytes: Buffer;
  if (recording.storageProvider === "local-demo") {
    if (!isDevelopmentDemoMode()) throw mediaConfigurationError();
    bytes = await readFile(localObjectPath(recording.storageKey));
  } else {
    const current = resolveS3Config();
    if (!current || !recording.storageBucket) throw mediaConfigurationError();
    const response = await signedS3Request(
      { ...current, bucket: recording.storageBucket },
      "GET",
      recording.storageKey,
      { "x-amz-content-sha256": sha256Hex(Buffer.alloc(0)) },
    );
    const announcedLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(announcedLength) &&
      (announcedLength !== recording.byteSize ||
        announcedLength > MAX_RECORDING_REQUEST_BYTES)
    ) {
      await response.body?.cancel();
      throw new ApiError(
        503,
        "MEDIA_INTEGRITY_FAILED",
        "The recording failed its integrity check.",
      );
    }
    bytes = Buffer.from(await response.arrayBuffer());
  }

  if (
    bytes.byteLength !== recording.byteSize ||
    sha256Hex(bytes) !== recording.contentSha256
  ) {
    throw new ApiError(
      503,
      "MEDIA_INTEGRITY_FAILED",
      "The recording failed its integrity check.",
    );
  }
  return bytes;
}

export async function readPrivateRecordingRange(
  recording: StoredRecording,
  start: number,
  end: number,
): Promise<Buffer> {
  if (
    recording.status !== "stored" ||
    recording.byteSize < 1 ||
    recording.byteSize > MAX_RECORDING_REQUEST_BYTES ||
    Date.parse(recording.retentionDeadline) <= Date.now()
  ) {
    throw new ApiError(
      410,
      "RECORDING_UNAVAILABLE",
      "The recording is no longer available.",
    );
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    end >= recording.byteSize
  ) {
    throw new ApiError(416, "INVALID_RANGE", "The requested byte range is invalid.");
  }
  const expectedLength = end - start + 1;

  if (recording.storageProvider === "local-demo") {
    if (!isDevelopmentDemoMode()) throw mediaConfigurationError();
    const handle = await open(localObjectPath(recording.storageKey), "r");
    try {
      const bytes = Buffer.alloc(expectedLength);
      const result = await handle.read(bytes, 0, expectedLength, start);
      if (result.bytesRead !== expectedLength) {
        throw new ApiError(
          503,
          "MEDIA_INTEGRITY_FAILED",
          "The recording range could not be read completely.",
        );
      }
      return bytes;
    } finally {
      await handle.close();
    }
  }

  const current = resolveS3Config();
  if (!current || !recording.storageBucket) throw mediaConfigurationError();
  const response = await signedS3Request(
    { ...current, bucket: recording.storageBucket },
    "GET",
    recording.storageKey,
    {
      range: `bytes=${start}-${end}`,
      "x-amz-content-sha256": sha256Hex(Buffer.alloc(0)),
    },
  );
  if (response.status !== 206) {
    await response.body?.cancel();
    throw new ApiError(
      503,
      "MEDIA_RANGE_UNAVAILABLE",
      "Private storage did not honor the bounded media request.",
    );
  }
  const contentRange = response.headers.get("content-range");
  const metadataHash = response.headers.get("x-amz-meta-content-sha256");
  const announcedLength = Number(response.headers.get("content-length"));
  if (
    contentRange !== `bytes ${start}-${end}/${recording.byteSize}` ||
    metadataHash !== recording.contentSha256 ||
    announcedLength !== expectedLength
  ) {
    await response.body?.cancel();
    throw new ApiError(
      503,
      "MEDIA_INTEGRITY_FAILED",
      "The recording range failed its metadata integrity check.",
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength !== expectedLength) {
    throw new ApiError(
      503,
      "MEDIA_INTEGRITY_FAILED",
      "The recording range was incomplete.",
    );
  }
  return bytes;
}

async function markReservationDeletePending(recording: StoredRecording): Promise<void> {
  if (databaseConfigured()) {
    await transaction(async (client) => {
      const marked = await client.query<{
        application_id: string;
        organization_id: string;
      }>(
        `UPDATE application_recordings
            SET status = 'delete_pending',
                deleted_at = NULL,
                delete_next_attempt_at = now(),
                delete_last_error = 'Upload cleanup is queued for retry'
          WHERE id = $1::uuid
            AND status IN ('uploading', 'delete_pending', 'deleted')
          RETURNING application_id, organization_id`,
        [recording.id],
      );
      const row = marked.rows[0];
      if (row) {
        await client.query(
          `UPDATE applications
              SET retention_status = 'object_delete_pending',
                  retention_completed_at = NULL,
                  updated_at = now()
            WHERE id = $1
              AND organization_id = $2
              AND retention_status IN ('processing', 'complete')`,
          [row.application_id, row.organization_id],
        );
      }
    });
  } else {
    await writeLocalMetadata({ ...recording, status: "delete_pending" });
  }
}

async function releaseFailedReservation(recording: StoredRecording): Promise<void> {
  if (databaseConfigured()) {
    await query(
      `DELETE FROM application_recordings
        WHERE id = $1::uuid AND status IN ('uploading', 'delete_pending')`,
      [recording.id],
    );
  } else {
    await ignoreMissingUnlink(localMetadataPath(recording));
  }
}

/**
 * Deletes the private object only. Retention workers should then mark the
 * application_recordings row deleted with `markRecordingDeleted`.
 */
export async function deleteRecordingObject(recording: StoredRecording): Promise<void> {
  if (recording.storageProvider === "local-demo") {
    if (!isDevelopmentDemoMode()) throw mediaConfigurationError();
    await ignoreMissingUnlink(localObjectPath(recording.storageKey));
    return;
  }

  const current = resolveS3Config();
  if (!current || !recording.storageBucket) throw mediaConfigurationError();
  const config = { ...current, bucket: recording.storageBucket };
  const response = await signedS3Request(
    config,
    "DELETE",
    recording.storageKey,
    { "x-amz-content-sha256": sha256Hex(Buffer.alloc(0)) },
    undefined,
    true,
  );
  if (
    response.headers.get("x-amz-delete-marker") === "true" ||
    response.headers.has("x-amz-version-id")
  ) {
    await response.body?.cancel();
    throw new ApiError(
      503,
      "MEDIA_STORAGE_VERSIONING_UNSAFE",
      "Recording deletion returned versioned-object metadata.",
    );
  }
  await response.body?.cancel();
  const afterDelete = await signedS3Request(
    config,
    "GET",
    recording.storageKey,
    { "x-amz-content-sha256": sha256Hex(Buffer.alloc(0)) },
    undefined,
    true,
  );
  const absent = afterDelete.status === 404;
  await afterDelete.body?.cancel();
  if (!absent) {
    throw new ApiError(
      503,
      "MEDIA_STORAGE_DELETE_UNVERIFIED",
      "Recording deletion could not be verified.",
    );
  }
}

export async function markRecordingDeleted(recording: StoredRecording): Promise<void> {
  if (databaseConfigured()) {
    await query(
      `UPDATE application_recordings
          SET status = 'deleted', deleted_at = now()
        WHERE id = $1::uuid`,
      [recording.id],
    );
  } else {
    await ignoreMissingUnlink(localMetadataPath(recording));
  }
}

export async function deletePrivateRecording(recording: StoredRecording): Promise<void> {
  await deleteRecordingObject(recording);
  await markRecordingDeleted(recording);
}

async function ignoreMissingUnlink(target: string): Promise<void> {
  try {
    await unlink(target);
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      (error as { code?: unknown }).code !== "ENOENT"
    ) {
      throw error;
    }
  }
}

export async function issueRecordingReceipt(
  recording: StoredRecording,
): Promise<{ receipt: string; expiresAt: string }> {
  if (recording.status !== "stored") {
    throw new Error("Only stored recordings can receive a receipt.");
  }
  if (
    recording.transcriptionStatus === "pending" ||
    !recording.providerModel ||
    (recording.transcriptionStatus === "succeeded" &&
      (!recording.providerTranscript ||
        !recording.providerTranscriptSha256 ||
        transcriptSha256(recording.providerTranscript) !==
          recording.providerTranscriptSha256))
  ) {
    throw new Error(
      "A recording receipt requires finalized, immutable transcription metadata.",
    );
  }
  const now = Math.floor(Date.now() / 1_000);
  const claims: RecordingReceiptClaims = {
    version: 2,
    recordingId: recording.id,
    applicationId: recording.applicationId,
    applicationVersion: recording.applicationVersion,
    turnNumber: recording.turnNumber,
    storageKeyHash: sha256Hex(recording.storageKey),
    contentSha256: recording.contentSha256,
    issuedAt: now,
    expiresAt: now + RECEIPT_TTL_SECONDS,
    transcriptionStatus: recording.transcriptionStatus,
    providerModel: recording.providerModel,
    ...(recording.providerTranscriptSha256
      ? { providerTranscriptSha256: recording.providerTranscriptSha256 }
      : {}),
  };
  const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = createHmac("sha256", receiptSecret())
    .update(`${body}.${recording.storageKey}`, "utf8")
    .digest("base64url");
  const expiresAt = new Date(claims.expiresAt * 1_000).toISOString();

  if (databaseConfigured()) {
    await query(
      `UPDATE application_recordings
          SET receipt_expires_at = $2
        WHERE id = $1::uuid AND status = 'stored'`,
      [recording.id, expiresAt],
    );
  }
  return { receipt: `${body}.${signature}`, expiresAt };
}

export function verifyRecordingReceipt(
  receipt: string,
  recording: StoredRecording,
  nowSeconds = Math.floor(Date.now() / 1_000),
): RecordingReceiptClaims | null {
  if (receipt.length > 4_096) return null;
  const [body, signature, ...rest] = receipt.split(".");
  if (!body || !signature || rest.length) return null;
  const expected = createHmac("sha256", receiptSecret())
    .update(`${body}.${recording.storageKey}`, "utf8")
    .digest("base64url");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<RecordingReceiptClaims>;
    if (
      claims.version !== 2 ||
      claims.recordingId !== recording.id ||
      claims.applicationId !== recording.applicationId ||
      claims.applicationVersion !== recording.applicationVersion ||
      claims.turnNumber !== recording.turnNumber ||
      claims.storageKeyHash !== sha256Hex(recording.storageKey) ||
      claims.contentSha256 !== recording.contentSha256 ||
      claims.transcriptionStatus !== recording.transcriptionStatus ||
      claims.providerTranscriptSha256 !==
        recording.providerTranscriptSha256 ||
      claims.providerModel !== recording.providerModel ||
      (claims.transcriptionStatus !== "succeeded" &&
        claims.transcriptionStatus !== "unavailable") ||
      typeof claims.providerModel !== "string" ||
      claims.providerModel.length < 1 ||
      claims.providerModel.length > 200 ||
      (claims.transcriptionStatus === "succeeded" &&
        (typeof claims.providerTranscriptSha256 !== "string" ||
          !/^[0-9a-f]{64}$/.test(claims.providerTranscriptSha256))) ||
      (claims.transcriptionStatus === "unavailable" &&
        claims.providerTranscriptSha256 !== undefined) ||
      typeof claims.issuedAt !== "number" ||
      typeof claims.expiresAt !== "number" ||
      claims.issuedAt > nowSeconds + 30 ||
      claims.expiresAt <= nowSeconds ||
      claims.expiresAt - claims.issuedAt !== RECEIPT_TTL_SECONDS
    ) {
      return null;
    }
    return claims as RecordingReceiptClaims;
  } catch {
    return null;
  }
}

/**
 * Resolves and verifies an opaque client receipt without trusting its decoded
 * fields. Callers provide the server-owned application/version/turn tuple.
 */
export async function resolveRecordingReceipt(
  receipt: string,
  expected: {
    organizationId: string;
    applicationId: string;
    applicationVersion: number;
    turnNumber: number;
  },
): Promise<{ recording: StoredRecording; claims: RecordingReceiptClaims } | null> {
  const untrusted = decodeUntrustedReceiptClaims(receipt);
  if (
    !untrusted ||
    untrusted.applicationId !== expected.applicationId ||
    untrusted.applicationVersion !== expected.applicationVersion ||
    untrusted.turnNumber !== expected.turnNumber
  ) {
    return null;
  }

  let recording: StoredRecording | null;
  if (databaseConfigured()) {
    const result = await query<DatabaseRecordingRow>(
      `SELECT *
         FROM application_recordings
        WHERE id = $1::uuid
          AND organization_id = $2
          AND application_id = $3
          AND application_lock_version = $4
          AND turn_number = $5
          AND status = 'stored'
        LIMIT 1`,
      [
        untrusted.recordingId,
        expected.organizationId,
        expected.applicationId,
        expected.applicationVersion,
        expected.turnNumber,
      ],
    );
    recording = result.rows[0] ? databaseRowToRecording(result.rows[0]) : null;
  } else {
    recording = await readLocalMetadata(localMetadataPath(expected));
    if (
      recording?.id !== untrusted.recordingId ||
      recording.organizationId !== expected.organizationId ||
      recording.status !== "stored"
    ) {
      recording = null;
    }
  }
  if (!recording) return null;
  const claims = verifyRecordingReceipt(receipt, recording);
  return claims ? { recording, claims } : null;
}

function decodeUntrustedReceiptClaims(receipt: string): RecordingReceiptClaims | null {
  if (receipt.length > 4_096) return null;
  const [body, signature, ...rest] = receipt.split(".");
  if (!body || !signature || rest.length) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<RecordingReceiptClaims>;
    if (
      claims.version !== 2 ||
      typeof claims.recordingId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        claims.recordingId,
      ) ||
      typeof claims.applicationId !== "string" ||
      typeof claims.applicationVersion !== "number" ||
      typeof claims.turnNumber !== "number" ||
      (claims.transcriptionStatus !== "succeeded" &&
        claims.transcriptionStatus !== "unavailable") ||
      typeof claims.providerModel !== "string"
    ) {
      return null;
    }
    return claims as RecordingReceiptClaims;
  } catch {
    return null;
  }
}

function receiptSecret(): string {
  const env = getServerEnv();
  if (env.NODE_ENV === "production" && !env.WBX_MEDIA_RECEIPT_SECRET && !env.WBX_AUTH_SECRET) {
    throw mediaConfigurationError();
  }
  return effectiveSecret(env.WBX_MEDIA_RECEIPT_SECRET ?? env.WBX_AUTH_SECRET);
}
