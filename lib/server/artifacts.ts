import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import {
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { ApiError, ValidationError } from "./http";
import { databaseConfigured, query, transaction } from "./db";
import { effectiveSecret } from "./crypto";
import { getServerEnv, isDevelopmentDemoMode } from "./env";

export const MAX_ARTIFACT_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_ARTIFACT_TOTAL_BYTES = 56 * 1024 * 1024;
export const MAX_ARTIFACT_REQUEST_BYTES = 64 * 1024 * 1024;
export const MAX_ARTIFACT_FILES = 8;

const LOCAL_ARTIFACT_ROOT = path.join(process.cwd(), ".data", "artifacts");
const SAFE_BLOCK_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/;
const SAFE_STORAGE_KEY = /^artifacts\/v1\/[a-z0-9/_-]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ZIP_ENTRIES = 2_048;
const MAX_ZIP_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_ZIP_COMPRESSION_RATIO = 200;
const MIN_UPLOAD_RETENTION_WINDOW_MS = 5 * 60 * 1_000;

export const ARTIFACT_PURPOSES = [
  "cv_intake",
  "document_check",
  "work_sample",
  "coding",
  "case_study",
  "custom",
] as const;

export type ArtifactPurpose = (typeof ARTIFACT_PURPOSES)[number];
export type ArtifactStorageProvider = "s3" | "local-demo";
export type ArtifactStatus =
  | "uploading"
  | "stored"
  | "delete_pending"
  | "deleted";

export type ArtifactContentType =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "text/plain"
  | "text/markdown"
  | "text/csv"
  | "application/json"
  | "application/zip";

type ArtifactFileKind =
  | "pdf"
  | "docx"
  | "text"
  | "markdown"
  | "csv"
  | "json"
  | "zip";

export interface ParsedArtifactFile {
  bytes: Buffer;
  fileName: string;
  contentType: ArtifactContentType;
  byteSize: number;
}

export interface ParsedArtifactMultipart {
  expectedVersion: number;
  blockId: string;
  purpose: ArtifactPurpose;
  idempotencyKey: string;
  files: ParsedArtifactFile[];
}

export interface ArtifactUploadBinding {
  /** Server-resolved frozen vacancy block id; never copy this from form data. */
  blockId: string;
  /** Server-resolved block purpose; never copy this from form data. */
  purpose: ArtifactPurpose;
}

export interface StoredArtifact {
  id: string;
  applicationId: string;
  organizationId: string;
  applicationVersion: number;
  blockId: string;
  purpose: ArtifactPurpose;
  idempotencyKeyHash: string;
  fileIndex: number;
  originalFilename?: string;
  storageProvider: ArtifactStorageProvider;
  storageBucket?: string;
  storageKey: string;
  contentType: ArtifactContentType;
  byteSize: number;
  contentSha256: string;
  status: ArtifactStatus;
  retentionDeadline: string;
  createdAt: string;
}

export interface StoreApplicationArtifactsInput {
  applicationId: string;
  organizationId: string;
  applicationVersion: number;
  blockId: string;
  purpose: ArtifactPurpose;
  idempotencyKey: string;
  files: readonly ParsedArtifactFile[];
  retentionDeadline: string;
}

export interface StoredArtifactReference {
  reference: string;
  fileName: string;
  contentType: ArtifactContentType;
  byteSize: number;
  contentSha256: string;
}

interface FileRule {
  kind: ArtifactFileKind;
  extensions: readonly string[];
  advertisedTypes: readonly string[];
  contentType: ArtifactContentType;
  purposes: readonly ArtifactPurpose[];
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

interface DatabaseArtifactRow {
  id: string;
  application_id: string;
  organization_id: string;
  application_lock_version: number;
  block_id: string;
  purpose: ArtifactPurpose;
  idempotency_key_hash: string;
  file_index: number;
  original_filename: string | null;
  storage_provider: ArtifactStorageProvider;
  storage_bucket: string | null;
  storage_key: string;
  content_type: ArtifactContentType;
  byte_size: string | number;
  content_sha256: string;
  status: ArtifactStatus;
  retention_deadline: Date | string;
  created_at: Date | string;
}

interface Reservation {
  artifact: StoredArtifact;
  alreadyStored: boolean;
}

interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
}

const ALL_PURPOSES = ARTIFACT_PURPOSES;
const DOCUMENT_PURPOSES = [
  "cv_intake",
  "document_check",
  "work_sample",
  "case_study",
  "custom",
] as const satisfies readonly ArtifactPurpose[];
const RICH_ARTIFACT_PURPOSES = [
  "work_sample",
  "coding",
  "case_study",
  "custom",
] as const satisfies readonly ArtifactPurpose[];

const FILE_RULES: readonly FileRule[] = [
  {
    kind: "pdf",
    extensions: ["pdf"],
    advertisedTypes: ["application/pdf"],
    contentType: "application/pdf",
    purposes: DOCUMENT_PURPOSES,
  },
  {
    kind: "docx",
    extensions: ["docx"],
    advertisedTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    purposes: DOCUMENT_PURPOSES,
  },
  {
    kind: "markdown",
    extensions: ["md", "markdown"],
    advertisedTypes: ["text/markdown", "text/plain"],
    contentType: "text/markdown",
    purposes: RICH_ARTIFACT_PURPOSES,
  },
  {
    kind: "csv",
    extensions: ["csv"],
    advertisedTypes: ["text/csv", "application/csv", "text/plain"],
    contentType: "text/csv",
    purposes: RICH_ARTIFACT_PURPOSES,
  },
  {
    kind: "json",
    extensions: ["json", "ipynb"],
    advertisedTypes: ["application/json", "text/json", "text/plain"],
    contentType: "application/json",
    purposes: RICH_ARTIFACT_PURPOSES,
  },
  {
    kind: "zip",
    extensions: ["zip"],
    advertisedTypes: ["application/zip", "application/x-zip-compressed"],
    contentType: "application/zip",
    purposes: RICH_ARTIFACT_PURPOSES,
  },
  {
    kind: "text",
    extensions: [
      "txt",
      "log",
      "py",
      "js",
      "jsx",
      "ts",
      "tsx",
      "java",
      "kt",
      "kts",
      "go",
      "rs",
      "rb",
      "php",
      "swift",
      "scala",
      "cs",
      "c",
      "h",
      "cc",
      "cpp",
      "hpp",
      "sql",
      "yaml",
      "yml",
      "toml",
      "xml",
      "html",
      "css",
      "scss",
      "sh",
    ],
    advertisedTypes: [
      "text/plain",
      "text/x-python",
      "text/x-java-source",
      "text/x-c",
      "text/x-c++",
      "text/x-script.python",
      "text/javascript",
      "application/javascript",
      "application/sql",
      "application/xml",
      "text/xml",
      "application/x-sh",
    ],
    contentType: "text/plain",
    purposes: ALL_PURPOSES,
  },
] as const;

export function assertArtifactRequestHeaders(request: Request): void {
  if (request.headers.get("transfer-encoding")) {
    throw new ApiError(
      400,
      "AMBIGUOUS_BODY_LENGTH",
      "Transfer-Encoding is not accepted for artifact uploads.",
    );
  }

  const contentEncoding = request.headers
    .get("content-encoding")
    ?.trim()
    .toLowerCase();
  if (contentEncoding && contentEncoding !== "identity") {
    throw new ApiError(
      415,
      "UNSUPPORTED_CONTENT_ENCODING",
      "Compressed artifact requests are not supported.",
    );
  }

  const rawLength = request.headers.get("content-length")?.trim();
  if (!rawLength) {
    throw new ApiError(
      411,
      "LENGTH_REQUIRED",
      "Content-Length is required for artifact uploads.",
    );
  }
  if (!/^[0-9]+$/.test(rawLength)) {
    throw new ApiError(
      400,
      "INVALID_CONTENT_LENGTH",
      "Invalid Content-Length header.",
    );
  }
  const contentLength = Number(rawLength);
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
    throw new ApiError(
      400,
      "INVALID_CONTENT_LENGTH",
      "Invalid Content-Length header.",
    );
  }
  if (contentLength > MAX_ARTIFACT_REQUEST_BYTES) {
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      `Artifact requests must not exceed ${MAX_ARTIFACT_REQUEST_BYTES} bytes.`,
    );
  }

  const contentType = request.headers.get("content-type")?.trim() ?? "";
  const multipart =
    /^multipart\/form-data;\s*boundary=(?:"([^"]{1,70})"|([!#$%&'*+\-.^_`|~0-9A-Za-z]{1,70}))$/i;
  if (!multipart.test(contentType)) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be multipart/form-data with a valid boundary.",
    );
  }
}

export async function parseArtifactMultipart(
  request: Request,
  binding: ArtifactUploadBinding,
): Promise<ParsedArtifactMultipart> {
  if (
    !SAFE_BLOCK_ID.test(binding.blockId) ||
    !isArtifactPurpose(binding.purpose)
  ) {
    throw new Error("Invalid server-owned artifact upload binding.");
  }
  assertArtifactRequestHeaders(request);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError(
      400,
      "INVALID_MULTIPART",
      "The multipart request could not be parsed.",
    );
  }

  const allowedFields = new Set([
    "files",
    "expectedVersion",
    "idempotencyKey",
  ]);
  for (const key of form.keys()) {
    if (!allowedFields.has(key)) {
      throw new ValidationError(`body.${key}`, "is not allowed");
    }
  }

  const expectedVersion = parseSinglePositiveInteger(
    form,
    "expectedVersion",
    1_000_000,
  );
  const idempotencyKey = parseSingleString(form, "idempotencyKey");
  if (!SAFE_IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw new ValidationError(
      "body.idempotencyKey",
      "must contain 16-200 safe identifier characters",
    );
  }

  const entries = form.getAll("files");
  if (entries.length < 1 || entries.length > MAX_ARTIFACT_FILES) {
    throw new ValidationError(
      "body.files",
      `must contain between 1 and ${MAX_ARTIFACT_FILES} files`,
    );
  }

  const files: ParsedArtifactFile[] = [];
  let totalBytes = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (typeof entry === "string") {
      throw new ValidationError(`body.files[${index}]`, "must be a file");
    }
    if (entry.size < 1 || entry.size > MAX_ARTIFACT_FILE_BYTES) {
      throw new ValidationError(
        `body.files[${index}]`,
        `must contain between 1 and ${MAX_ARTIFACT_FILE_BYTES} bytes`,
      );
    }
    totalBytes += entry.size;
    if (totalBytes > MAX_ARTIFACT_TOTAL_BYTES) {
      throw new ValidationError(
        "body.files",
        `must not exceed ${MAX_ARTIFACT_TOTAL_BYTES} bytes in total`,
      );
    }

    const fileName = normalizeOriginalFilename(
      entry.name,
      `body.files[${index}].name`,
    );
    const advertisedType = entry.type
      .trim()
      .toLowerCase()
      .split(";", 1)[0];
    const rule = selectFileRule(
      fileName,
      advertisedType,
      binding.purpose,
      `body.files[${index}]`,
    );
    const bytes = Buffer.from(await entry.arrayBuffer());
    if (bytes.byteLength !== entry.size) {
      throw new ApiError(
        400,
        "INCOMPLETE_ARTIFACT",
        `Artifact file ${index + 1} was incomplete.`,
      );
    }
    assertArtifactSignature(bytes, rule, `body.files[${index}]`);
    files.push({
      bytes,
      fileName,
      contentType: rule.contentType,
      byteSize: bytes.byteLength,
    });
  }

  return {
    expectedVersion,
    blockId: binding.blockId,
    purpose: binding.purpose,
    idempotencyKey,
    files,
  };
}

export async function storePrivateArtifacts(
  input: StoreApplicationArtifactsInput,
): Promise<
  {
    artifact: StoredArtifact;
    receipt: StoredArtifactReference;
    reused: boolean;
  }[]
> {
  assertStoreInput(input);
  const retentionDeadline = new Date(input.retentionDeadline);
  if (
    !Number.isFinite(retentionDeadline.getTime()) ||
    retentionDeadline.getTime() <= Date.now() + MIN_UPLOAD_RETENTION_WINDOW_MS
  ) {
    throw new ApiError(
      410,
      "RETENTION_EXPIRED",
      "This application's retention window has expired.",
    );
  }

  const s3 = resolveS3Config();
  if (s3 && !databaseConfigured()) {
    throw new ApiError(
      503,
      "ARTIFACT_METADATA_NOT_CONFIGURED",
      "PostgreSQL is required when S3-compatible artifact storage is enabled.",
    );
  }
  const storageProvider: ArtifactStorageProvider = s3
    ? "s3"
    : requireLocalDemoStorage();
  const idempotencyKeyHash = sha256Hex(input.idempotencyKey);
  const stored: {
    artifact: StoredArtifact;
    receipt: StoredArtifactReference;
    reused: boolean;
  }[] = [];

  for (let fileIndex = 0; fileIndex < input.files.length; fileIndex += 1) {
    const file = input.files[fileIndex];
    assertParsedFileForStorage(file, input.purpose, fileIndex);
    const id = deterministicArtifactId({
      organizationId: input.organizationId,
      applicationId: input.applicationId,
      applicationVersion: input.applicationVersion,
      blockId: input.blockId,
      idempotencyKeyHash,
      fileIndex,
    });
    let candidate: StoredArtifact = {
      id,
      applicationId: input.applicationId,
      organizationId: input.organizationId,
      applicationVersion: input.applicationVersion,
      blockId: input.blockId,
      purpose: input.purpose,
      idempotencyKeyHash,
      fileIndex,
      originalFilename: file.fileName,
      storageProvider,
      storageBucket: s3?.bucket,
      storageKey: makeStorageKey(input, id),
      contentType: file.contentType,
      byteSize: file.bytes.byteLength,
      contentSha256: sha256Hex(file.bytes),
      status: "uploading",
      retentionDeadline: retentionDeadline.toISOString(),
      createdAt: new Date().toISOString(),
    };

    const reservation = databaseConfigured()
      ? await reserveDatabaseArtifact(candidate)
      : await reserveLocalArtifact(candidate);
    candidate = reservation.artifact;
    if (!reservation.alreadyStored) {
      try {
        if (candidate.storageProvider === "s3") {
          if (!s3) throw artifactConfigurationError();
          await putS3Object(s3, candidate, file.bytes);
        } else {
          await putLocalObject(candidate, file.bytes);
        }
        const finalized = { ...candidate, status: "stored" as const };
        if (databaseConfigured()) await finalizeDatabaseArtifact(finalized);
        else await writeLocalMetadata(finalized);
        candidate = finalized;
      } catch (error) {
        try {
          await markReservationDeletePending(candidate);
        } catch {
          // Object cleanup is still attempted when metadata persistence is down.
        }
        try {
          await deleteArtifactObject(candidate);
          await releaseFailedReservation(candidate);
        } catch (cleanupError) {
          try {
            await markReservationDeletePending(candidate);
          } catch (requeueError) {
            console.error(
              "[artifact:cleanup] failed to persist an artifact cleanup retry",
              {
                artifactId: candidate.id,
                cleanupError:
                  cleanupError instanceof Error
                    ? cleanupError.name
                    : "UnknownError",
                requeueError:
                  requeueError instanceof Error
                    ? requeueError.name
                    : "UnknownError",
              },
            );
          }
        }
        if (error instanceof ApiError) throw error;
        throw new ApiError(
          503,
          "ARTIFACT_STORAGE_UNAVAILABLE",
          "Artifact storage is temporarily unavailable.",
        );
      }
    }

    stored.push({
      artifact: candidate,
      receipt: artifactPublicReference(candidate),
      reused: reservation.alreadyStored,
    });
  }

  return stored;
}

export function issueArtifactReference(artifact: StoredArtifact): string {
  if (
    artifact.status !== "stored" ||
    !UUID_PATTERN.test(artifact.id) ||
    !SAFE_STORAGE_KEY.test(artifact.storageKey)
  ) {
    throw new Error("Only a valid stored artifact can receive a reference.");
  }
  const locator = artifact.id.replaceAll("-", "").toLowerCase();
  const signature = createHmac("sha256", artifactReferenceSecret())
    .update(artifactReferenceMacInput(artifact), "utf8")
    .digest("base64url");
  return `art1.${locator}.${signature}`;
}

export function verifyArtifactReference(
  reference: string,
  artifact: StoredArtifact,
  now = Date.now(),
): boolean {
  const id = artifactIdFromReference(reference);
  if (
    !id ||
    id !== artifact.id.toLowerCase() ||
    artifact.status !== "stored" ||
    Date.parse(artifact.retentionDeadline) <= now
  ) {
    return false;
  }
  const signature = reference.split(".")[2] ?? "";
  const expected = createHmac("sha256", artifactReferenceSecret())
    .update(artifactReferenceMacInput(artifact), "utf8")
    .digest("base64url");
  return constantTimeEqual(signature, expected);
}

/**
 * Resolves an opaque submission reference against server-owned binding data.
 * No client-decoded field is trusted and no storage URL is returned.
 */
export async function resolveArtifactReference(
  reference: string,
  expected: {
    organizationId: string;
    applicationId: string;
    applicationVersion: number;
    blockId: string;
    purposes?: readonly ArtifactPurpose[];
  },
): Promise<StoredArtifact | null> {
  const id = artifactIdFromReference(reference);
  if (
    !id ||
    !expected.organizationId ||
    !expected.applicationId ||
    !Number.isSafeInteger(expected.applicationVersion) ||
    expected.applicationVersion < 1 ||
    !SAFE_BLOCK_ID.test(expected.blockId)
  ) {
    return null;
  }

  let artifact: StoredArtifact | null;
  if (databaseConfigured()) {
    const result = await query<DatabaseArtifactRow>(
      `SELECT *
         FROM application_artifacts
        WHERE id = $1::uuid
          AND organization_id = $2
          AND application_id = $3
          AND application_lock_version = $4
          AND block_id = $5
          AND status = 'stored'
          AND retention_deadline > now()
        LIMIT 1`,
      [
        id,
        expected.organizationId,
        expected.applicationId,
        expected.applicationVersion,
        expected.blockId,
      ],
    );
    artifact = result.rows[0]
      ? databaseRowToArtifact(result.rows[0])
      : null;
  } else {
    artifact = await readLocalMetadata(localMetadataPath(id));
    if (
      artifact?.organizationId !== expected.organizationId ||
      artifact.applicationId !== expected.applicationId ||
      artifact.applicationVersion !== expected.applicationVersion ||
      artifact.blockId !== expected.blockId
    ) {
      artifact = null;
    }
  }

  if (
    !artifact ||
    (expected.purposes &&
      !expected.purposes.includes(artifact.purpose)) ||
    !verifyArtifactReference(reference, artifact)
  ) {
    return null;
  }
  return artifact;
}

/**
 * Internal-only object read for later malware scanning or rubric evaluation.
 * Callers must first resolve the receipt with `resolveArtifactReference`.
 */
export async function readPrivateArtifact(
  artifact: StoredArtifact,
): Promise<Buffer> {
  if (
    artifact.status !== "stored" ||
    artifact.byteSize < 1 ||
    artifact.byteSize > MAX_ARTIFACT_FILE_BYTES ||
    Date.parse(artifact.retentionDeadline) <= Date.now()
  ) {
    throw new ApiError(
      410,
      "ARTIFACT_UNAVAILABLE",
      "The artifact is no longer available.",
    );
  }

  let bytes: Buffer;
  if (artifact.storageProvider === "local-demo") {
    if (!isDevelopmentDemoMode()) throw artifactConfigurationError();
    bytes = await readFile(localObjectPath(artifact.storageKey));
  } else {
    const current = resolveS3Config();
    if (!current || !artifact.storageBucket) {
      throw artifactConfigurationError();
    }
    const response = await signedS3Request(
      { ...current, bucket: artifact.storageBucket },
      "GET",
      artifact.storageKey,
      { "x-amz-content-sha256": sha256Hex(Buffer.alloc(0)) },
    );
    const announcedLength = Number(
      response.headers.get("content-length") ?? Number.NaN,
    );
    if (
      !Number.isSafeInteger(announcedLength) ||
      announcedLength !== artifact.byteSize
    ) {
      await response.body?.cancel();
      throw new ApiError(
        409,
        "ARTIFACT_INTEGRITY_ERROR",
        "The artifact failed its integrity check.",
      );
    }
    bytes = Buffer.from(await response.arrayBuffer());
  }

  if (
    bytes.byteLength !== artifact.byteSize ||
    sha256Hex(bytes) !== artifact.contentSha256
  ) {
    throw new ApiError(
      409,
      "ARTIFACT_INTEGRITY_ERROR",
      "The artifact failed its integrity check.",
    );
  }
  return bytes;
}

/**
 * Deletes the private object only. Database retention workers mark the row
 * deleted after this succeeds.
 */
export async function deleteArtifactObject(
  artifact: StoredArtifact,
): Promise<void> {
  if (artifact.storageProvider === "local-demo") {
    if (!isDevelopmentDemoMode()) throw artifactConfigurationError();
    await ignoreMissingUnlink(localObjectPath(artifact.storageKey));
    return;
  }
  const current = resolveS3Config();
  if (!current || !artifact.storageBucket) {
    throw artifactConfigurationError();
  }
  const response = await signedS3Request(
    { ...current, bucket: artifact.storageBucket },
    "DELETE",
    artifact.storageKey,
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
      "ARTIFACT_STORAGE_VERSIONING_UNSAFE",
      "Artifact deletion returned versioned-object metadata.",
    );
  }
  await response.body?.cancel();
  const afterDelete = await signedS3Request(
    { ...current, bucket: artifact.storageBucket },
    "GET",
    artifact.storageKey,
    { "x-amz-content-sha256": sha256Hex(Buffer.alloc(0)) },
    undefined,
    true,
  );
  const absent = afterDelete.status === 404;
  await afterDelete.body?.cancel();
  if (!absent) {
    throw new ApiError(
      503,
      "ARTIFACT_STORAGE_DELETE_UNVERIFIED",
      "Artifact deletion could not be verified.",
    );
  }
}

export async function markArtifactDeleted(
  artifact: StoredArtifact,
): Promise<void> {
  if (databaseConfigured()) {
    await query(
      `UPDATE application_artifacts
          SET status = 'deleted',
              original_filename = NULL,
              deleted_at = now(),
              delete_next_attempt_at = NULL,
              delete_last_error = NULL
        WHERE id = $1::uuid`,
      [artifact.id],
    );
  } else {
    await ignoreMissingUnlink(localMetadataPath(artifact.id));
  }
}

export async function deletePrivateArtifact(
  artifact: StoredArtifact,
): Promise<void> {
  await deleteArtifactObject(artifact);
  await markArtifactDeleted(artifact);
}

function parseSingleString(form: FormData, field: string): string {
  const values = form.getAll(field);
  if (values.length !== 1) {
    throw new ValidationError(
      `body.${field}`,
      "must be provided exactly once",
    );
  }
  const value = values[0];
  if (typeof value !== "string") {
    throw new ValidationError(`body.${field}`, "must be a string");
  }
  return value.trim();
}

function parseSinglePositiveInteger(
  form: FormData,
  field: string,
  max: number,
): number {
  const value = parseSingleString(form, field);
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new ValidationError(
      `body.${field}`,
      "must be a positive integer",
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > max) {
    throw new ValidationError(`body.${field}`, `must be at most ${max}`);
  }
  return parsed;
}

function isArtifactPurpose(value: string): value is ArtifactPurpose {
  return (ARTIFACT_PURPOSES as readonly string[]).includes(value);
}

function normalizeOriginalFilename(value: string, pathName: string): string {
  const normalized = value.normalize("NFKC").trim();
  if (
    normalized.length < 1 ||
    normalized.length > 180 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(normalized)
  ) {
    throw new ValidationError(
      pathName,
      "must be a safe basename of at most 180 characters",
    );
  }
  return normalized;
}

function selectFileRule(
  fileName: string,
  advertisedType: string,
  purpose: ArtifactPurpose,
  pathName: string,
): FileRule {
  const extension = fileExtension(fileName);
  const rule = FILE_RULES.find(
    (candidate) =>
      candidate.extensions.includes(extension) &&
      candidate.advertisedTypes.includes(advertisedType) &&
      candidate.purposes.includes(purpose),
  );
  if (!rule) {
    throw new ValidationError(
      pathName,
      "uses a filename, MIME type, or artifact purpose that is not allowlisted",
    );
  }
  return rule;
}

function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 && dot < fileName.length - 1
    ? fileName.slice(dot + 1).toLowerCase()
    : "";
}

function assertParsedFileForStorage(
  file: ParsedArtifactFile,
  purpose: ArtifactPurpose,
  index: number,
): void {
  if (
    !Buffer.isBuffer(file.bytes) ||
    file.bytes.byteLength < 1 ||
    file.bytes.byteLength > MAX_ARTIFACT_FILE_BYTES ||
    file.byteSize !== file.bytes.byteLength
  ) {
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      `Artifact file ${index + 1} exceeds the storage limit.`,
    );
  }
  const fileName = normalizeOriginalFilename(
    file.fileName,
    `files[${index}].fileName`,
  );
  const extension = fileExtension(fileName);
  const rule = FILE_RULES.find(
    (candidate) =>
      candidate.extensions.includes(extension) &&
      candidate.contentType === file.contentType &&
      candidate.purposes.includes(purpose),
  );
  if (!rule) {
    throw new ValidationError(
      `files[${index}]`,
      "does not match an allowlisted artifact type",
    );
  }
  assertArtifactSignature(file.bytes, rule, `files[${index}]`);
}

function assertArtifactSignature(
  bytes: Buffer,
  rule: FileRule,
  pathName: string,
): void {
  if (rule.kind === "pdf") {
    const header = bytes.subarray(0, Math.min(bytes.byteLength, 16)).toString("ascii");
    const trailer = bytes
      .subarray(Math.max(0, bytes.byteLength - 1_024))
      .toString("latin1");
    if (!/^%PDF-[12]\.[0-9]/.test(header) || !trailer.includes("%%EOF")) {
      throw new ValidationError(pathName, "does not contain a valid PDF signature");
    }
    return;
  }

  if (rule.kind === "docx" || rule.kind === "zip") {
    const entries = inspectZip(bytes, pathName);
    if (rule.kind === "docx") {
      const names = new Set(entries.map((entry) => entry.name));
      if (
        !names.has("[Content_Types].xml") ||
        !names.has("_rels/.rels") ||
        !names.has("word/document.xml") ||
        names.has("word/vbaProject.bin")
      ) {
        throw new ValidationError(
          pathName,
          "does not contain a macro-free DOCX package",
        );
      }
    }
    return;
  }

  const text = decodeUtf8Text(bytes, pathName);
  if (rule.kind === "json") {
    try {
      JSON.parse(stripUtf8Bom(text));
    } catch {
      throw new ValidationError(pathName, "does not contain valid JSON");
    }
  }
}

function decodeUtf8Text(bytes: Buffer, pathName: string): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ValidationError(pathName, "must contain valid UTF-8 text");
  }
  if (
    text.length < 1 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)
  ) {
    throw new ValidationError(
      pathName,
      "must contain non-empty text without binary control bytes",
    );
  }
  return text;
}

function stripUtf8Bom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function inspectZip(bytes: Buffer, pathName: string): ZipEntry[] {
  if (
    bytes.byteLength < 22 ||
    (bytes.readUInt32LE(0) !== 0x04034b50 &&
      bytes.readUInt32LE(0) !== 0x06054b50)
  ) {
    throw new ValidationError(pathName, "does not contain a valid ZIP signature");
  }

  const minimum = Math.max(0, bytes.byteLength - (65_535 + 22));
  let eocdOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      const commentLength = bytes.readUInt16LE(offset + 20);
      if (offset + 22 + commentLength === bytes.byteLength) {
        eocdOffset = offset;
        break;
      }
    }
  }
  if (eocdOffset < 0) {
    throw new ValidationError(pathName, "does not contain a complete ZIP directory");
  }

  const disk = bytes.readUInt16LE(eocdOffset + 4);
  const directoryDisk = bytes.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = bytes.readUInt16LE(eocdOffset + 8);
  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  const directorySize = bytes.readUInt32LE(eocdOffset + 12);
  const directoryOffset = bytes.readUInt32LE(eocdOffset + 16);
  if (
    disk !== 0 ||
    directoryDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount < 1 ||
    entryCount > MAX_ZIP_ENTRIES ||
    entryCount === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff ||
    directoryOffset + directorySize !== eocdOffset
  ) {
    throw new ValidationError(
      pathName,
      "uses an unsupported ZIP layout or exceeds ZIP limits",
    );
  }

  const entries: ZipEntry[] = [];
  const normalizedNames = new Set<string>();
  let offset = directoryOffset;
  let totalCompressed = 0;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > eocdOffset ||
      bytes.readUInt32LE(offset) !== 0x02014b50
    ) {
      throw new ValidationError(pathName, "contains an invalid ZIP directory entry");
    }
    const madeBy = bytes[offset + 5];
    const flags = bytes.readUInt16LE(offset + 8);
    const compression = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const externalAttributes = bytes.readUInt32LE(offset + 38);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (
      next > eocdOffset ||
      nameLength < 1 ||
      nameLength > 1_024 ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff ||
      (flags & 0x0001) !== 0 ||
      (compression !== 0 && compression !== 8) ||
      (uncompressedSize > 0 && compressedSize === 0) ||
      (compression === 0 && compressedSize !== uncompressedSize)
    ) {
      throw new ValidationError(
        pathName,
        "contains an encrypted, ZIP64, oversized, or unsupported ZIP entry",
      );
    }

    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    let name: string;
    try {
      name =
        (flags & 0x0800) !== 0
          ? new TextDecoder("utf-8", { fatal: true }).decode(nameBytes)
          : nameBytes.toString("latin1");
    } catch {
      throw new ValidationError(pathName, "contains an invalid ZIP filename");
    }
    assertSafeZipEntryName(name, pathName);
    const normalizedName = name.toLowerCase();
    if (normalizedNames.has(normalizedName)) {
      throw new ValidationError(pathName, "contains duplicate ZIP entry names");
    }
    normalizedNames.add(normalizedName);

    const unixMode = externalAttributes >>> 16;
    if (madeBy === 3 && (unixMode & 0xf000) === 0xa000) {
      throw new ValidationError(pathName, "contains a symbolic-link ZIP entry");
    }
    if (
      localOffset + 30 > directoryOffset ||
      bytes.readUInt32LE(localOffset) !== 0x04034b50
    ) {
      throw new ValidationError(pathName, "contains an invalid ZIP local entry");
    }
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localCompression = bytes.readUInt16LE(localOffset + 8);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const localDataStart =
      localNameStart + localNameLength + localExtraLength;
    if (
      localDataStart > directoryOffset ||
      localDataStart + compressedSize > directoryOffset ||
      localFlags !== flags ||
      localCompression !== compression ||
      localNameLength !== nameLength ||
      !bytes
        .subarray(localNameStart, localNameStart + localNameLength)
        .equals(nameBytes)
    ) {
      throw new ValidationError(pathName, "contains an inconsistent ZIP entry");
    }

    totalCompressed += compressedSize;
    totalUncompressed += uncompressedSize;
    if (
      totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES ||
      (totalCompressed > 0 &&
        totalUncompressed / totalCompressed > MAX_ZIP_COMPRESSION_RATIO)
    ) {
      throw new ValidationError(
        pathName,
        "exceeds the allowed ZIP expansion limits",
      );
    }
    entries.push({ name, compressedSize, uncompressedSize });
    offset = next;
  }
  if (offset !== eocdOffset) {
    throw new ValidationError(pathName, "contains trailing ZIP directory data");
  }
  return entries;
}

function assertSafeZipEntryName(name: string, pathName: string): void {
  const withoutTrailingSlash = name.endsWith("/") ? name.slice(0, -1) : name;
  const segments = withoutTrailingSlash.split("/");
  if (
    withoutTrailingSlash.length < 1 ||
    withoutTrailingSlash.length > 1_024 ||
    name.startsWith("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    /^[A-Za-z]:/.test(name) ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        /[\u0000-\u001f\u007f]/u.test(segment),
    )
  ) {
    throw new ValidationError(pathName, "contains an unsafe ZIP entry path");
  }
}

function assertStoreInput(input: StoreApplicationArtifactsInput): void {
  if (
    !input.applicationId ||
    input.applicationId.length > 300 ||
    !input.organizationId ||
    input.organizationId.length > 300 ||
    !Number.isSafeInteger(input.applicationVersion) ||
    input.applicationVersion < 1 ||
    !SAFE_BLOCK_ID.test(input.blockId) ||
    !isArtifactPurpose(input.purpose) ||
    !SAFE_IDEMPOTENCY_KEY.test(input.idempotencyKey) ||
    input.files.length < 1 ||
    input.files.length > MAX_ARTIFACT_FILES
  ) {
    throw new Error("Invalid artifact storage input.");
  }
  const total = input.files.reduce(
    (sum, file) => sum + file.bytes.byteLength,
    0,
  );
  if (total > MAX_ARTIFACT_TOTAL_BYTES) {
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "The artifacts exceed the aggregate storage limit.",
    );
  }
}

function deterministicArtifactId(input: {
  organizationId: string;
  applicationId: string;
  applicationVersion: number;
  blockId: string;
  idempotencyKeyHash: string;
  fileIndex: number;
}): string {
  const digest = createHmac("sha256", artifactReferenceSecret())
    .update(
      [
        "artifact-id-v1",
        input.organizationId,
        input.applicationId,
        String(input.applicationVersion),
        input.blockId,
        input.idempotencyKeyHash,
        String(input.fileIndex),
      ].join("\0"),
      "utf8",
    )
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function makeStorageKey(
  input: Pick<
    StoreApplicationArtifactsInput,
    "organizationId" | "applicationId" | "applicationVersion" | "blockId"
  >,
  id: string,
): string {
  const organization = sha256Hex(input.organizationId).slice(0, 20);
  const application = sha256Hex(input.applicationId).slice(0, 24);
  const block = sha256Hex(input.blockId).slice(0, 20);
  return `artifacts/v1/${organization}/${application}/v${input.applicationVersion}/${block}/${id}`;
}

async function reserveDatabaseArtifact(
  artifact: StoredArtifact,
): Promise<Reservation> {
  try {
    const result = await query<DatabaseArtifactRow>(
      `INSERT INTO application_artifacts
         (id, application_id, organization_id, application_lock_version,
          block_id, purpose, idempotency_key_hash, file_index,
          original_filename, storage_provider, storage_bucket, storage_key,
          content_type, byte_size, content_sha256, status, retention_deadline)
       SELECT $1::uuid, application.id, application.organization_id, $4,
              $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
              'uploading', application.retention_deadline
         FROM applications application
        WHERE application.id = $2
          AND application.organization_id = $3
          AND application.lock_version = $4
          AND application.retention_deadline > now() + interval '5 minutes'
          AND application.retention_status = 'active'
       RETURNING *`,
      [
        artifact.id,
        artifact.applicationId,
        artifact.organizationId,
        artifact.applicationVersion,
        artifact.blockId,
        artifact.purpose,
        artifact.idempotencyKeyHash,
        artifact.fileIndex,
        artifact.originalFilename,
        artifact.storageProvider,
        artifact.storageBucket ?? null,
        artifact.storageKey,
        artifact.contentType,
        artifact.byteSize,
        artifact.contentSha256,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ApiError(
        409,
        "VERSION_CONFLICT",
        "Application state changed or its retention window expired.",
      );
    }
    return {
      artifact: databaseRowToArtifact(row),
      alreadyStored: false,
    };
  } catch (error) {
    if (!isPostgresUniqueViolation(error)) throw error;
    const existing = await findDatabaseArtifact(artifact);
    return reconcileExistingReservation(existing, artifact);
  }
}

async function findDatabaseArtifact(
  artifact: StoredArtifact,
): Promise<StoredArtifact | null> {
  const result = await query<DatabaseArtifactRow>(
    `SELECT *
       FROM application_artifacts
      WHERE organization_id = $1
        AND application_id = $2
        AND application_lock_version = $3
        AND block_id = $4
        AND idempotency_key_hash = $5
        AND file_index = $6
      LIMIT 1`,
    [
      artifact.organizationId,
      artifact.applicationId,
      artifact.applicationVersion,
      artifact.blockId,
      artifact.idempotencyKeyHash,
      artifact.fileIndex,
    ],
  );
  return result.rows[0]
    ? databaseRowToArtifact(result.rows[0])
    : null;
}

function reconcileExistingReservation(
  existing: StoredArtifact | null,
  requested: StoredArtifact,
): Reservation {
  if (
    existing?.status === "stored" &&
    existing.id === requested.id &&
    existing.purpose === requested.purpose &&
    existing.contentSha256 === requested.contentSha256 &&
    existing.contentType === requested.contentType &&
    existing.byteSize === requested.byteSize
  ) {
    return { artifact: existing, alreadyStored: true };
  }
  if (existing?.status === "uploading") {
    throw new ApiError(
      409,
      "ARTIFACT_UPLOAD_IN_PROGRESS",
      "An upload with this idempotency key is still in progress.",
    );
  }
  throw new ApiError(
    409,
    "ARTIFACT_IDEMPOTENCY_CONFLICT",
    "This idempotency key is already bound to a different artifact request.",
  );
}

async function finalizeDatabaseArtifact(
  artifact: StoredArtifact,
): Promise<void> {
  const result = await query(
    `UPDATE application_artifacts
        SET status = 'stored', stored_at = now()
      WHERE id = $1::uuid AND status = 'uploading'`,
    [artifact.id],
  );
  if (result.rowCount !== 1) {
    throw new Error("Artifact reservation changed before it was finalized.");
  }
}

function databaseRowToArtifact(row: DatabaseArtifactRow): StoredArtifact {
  return {
    id: row.id,
    applicationId: row.application_id,
    organizationId: row.organization_id,
    applicationVersion: row.application_lock_version,
    blockId: row.block_id,
    purpose: row.purpose,
    idempotencyKeyHash: row.idempotency_key_hash,
    fileIndex: row.file_index,
    originalFilename: row.original_filename ?? undefined,
    storageProvider: row.storage_provider,
    storageBucket: row.storage_bucket ?? undefined,
    storageKey: row.storage_key,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    contentSha256: row.content_sha256,
    status: row.status,
    retentionDeadline: iso(row.retention_deadline),
    createdAt: iso(row.created_at),
  };
}

async function reserveLocalArtifact(
  artifact: StoredArtifact,
): Promise<Reservation> {
  await mkdir(LOCAL_ARTIFACT_ROOT, { recursive: true, mode: 0o700 });
  const metadataPath = localMetadataPath(artifact.id);
  try {
    await writeFile(metadataPath, `${JSON.stringify(artifact)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    return { artifact, alreadyStored: false };
  } catch (error) {
    if (!isFileExistsError(error)) throw error;
    const existing = await readLocalMetadata(metadataPath);
    return reconcileExistingReservation(existing, artifact);
  }
}

async function readLocalMetadata(
  metadataPath: string,
): Promise<StoredArtifact | null> {
  try {
    const value = JSON.parse(
      await readFile(metadataPath, "utf8"),
    ) as Partial<StoredArtifact>;
    if (
      typeof value.id !== "string" ||
      !UUID_PATTERN.test(value.id) ||
      typeof value.applicationId !== "string" ||
      typeof value.organizationId !== "string" ||
      typeof value.applicationVersion !== "number" ||
      typeof value.blockId !== "string" ||
      !SAFE_BLOCK_ID.test(value.blockId) ||
      !isArtifactPurpose(value.purpose ?? "") ||
      typeof value.idempotencyKeyHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(value.idempotencyKeyHash) ||
      typeof value.fileIndex !== "number" ||
      value.fileIndex < 0 ||
      value.fileIndex >= MAX_ARTIFACT_FILES ||
      typeof value.originalFilename !== "string" ||
      value.storageProvider !== "local-demo" ||
      typeof value.storageKey !== "string" ||
      !SAFE_STORAGE_KEY.test(value.storageKey) ||
      !isArtifactContentType(value.contentType ?? "") ||
      typeof value.byteSize !== "number" ||
      value.byteSize < 1 ||
      value.byteSize > MAX_ARTIFACT_FILE_BYTES ||
      typeof value.contentSha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(value.contentSha256) ||
      !isArtifactStatus(value.status ?? "") ||
      typeof value.retentionDeadline !== "string" ||
      typeof value.createdAt !== "string"
    ) {
      return null;
    }
    return value as StoredArtifact;
  } catch {
    return null;
  }
}

async function writeLocalMetadata(artifact: StoredArtifact): Promise<void> {
  await writeFile(
    localMetadataPath(artifact.id),
    `${JSON.stringify(artifact)}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
}

function localMetadataPath(id: string): string {
  if (!UUID_PATTERN.test(id)) {
    throw new Error("Unsafe artifact metadata identifier.");
  }
  return path.join(LOCAL_ARTIFACT_ROOT, `${id.toLowerCase()}.json`);
}

async function putLocalObject(
  artifact: StoredArtifact,
  bytes: Buffer,
): Promise<void> {
  if (artifact.storageProvider !== "local-demo") {
    throw new Error("Invalid local artifact.");
  }
  const target = localObjectPath(artifact.storageKey);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  try {
    await writeFile(target, bytes, { mode: 0o600, flag: "wx" });
  } catch (error) {
    if (isFileExistsError(error)) {
      throw new ApiError(
        409,
        "ARTIFACT_ALREADY_EXISTS",
        "The artifact object already exists.",
      );
    }
    throw error;
  }
}

function localObjectPath(storageKey: string): string {
  if (!SAFE_STORAGE_KEY.test(storageKey)) {
    throw new Error("Unsafe artifact storage key.");
  }
  const resolvedRoot = path.resolve(LOCAL_ARTIFACT_ROOT);
  const resolved = path.resolve(
    LOCAL_ARTIFACT_ROOT,
    ...storageKey.split("/"),
  );
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Unsafe artifact storage path.");
  }
  return resolved;
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
  if (configured !== values.length) throw artifactConfigurationError();

  const endpoint = new URL(env.WBX_MEDIA_S3_ENDPOINT!);
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    (env.NODE_ENV === "production" && endpoint.protocol !== "https:")
  ) {
    throw artifactConfigurationError();
  }
  const sse = env.WBX_MEDIA_S3_SSE ?? "AES256";
  if (sse === "aws:kms" && !env.WBX_MEDIA_S3_KMS_KEY_ID) {
    throw artifactConfigurationError();
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
  if (!isDevelopmentDemoMode()) throw artifactConfigurationError();
  return "local-demo";
}

function artifactConfigurationError(): ApiError {
  return new ApiError(
    503,
    "ARTIFACT_STORAGE_NOT_CONFIGURED",
    "Private artifact storage is not configured.",
  );
}

async function putS3Object(
  config: S3Config,
  artifact: StoredArtifact,
  bytes: Buffer,
): Promise<void> {
  const headers: Record<string, string> = {
    "cache-control": "private, no-store",
    "content-length": String(bytes.byteLength),
    "content-type": artifact.contentType,
    "x-amz-content-sha256": artifact.contentSha256,
    "x-amz-meta-artifact-id": artifact.id,
    "x-amz-meta-block-id-hash": sha256Hex(artifact.blockId),
    "x-amz-meta-content-sha256": artifact.contentSha256,
    "x-amz-meta-retention-deadline": artifact.retentionDeadline,
    "x-amz-server-side-encryption": config.sse,
  };
  if (config.sse === "aws:kms" && config.kmsKeyId) {
    headers["x-amz-server-side-encryption-aws-kms-key-id"] =
      config.kmsKeyId;
  }
  const response = await signedS3Request(
    config,
    "PUT",
    artifact.storageKey,
    headers,
    bytes,
  );
  if (response.headers.has("x-amz-version-id")) {
    await response.body?.cancel();
    throw new ApiError(
      503,
      "ARTIFACT_STORAGE_VERSIONING_UNSAFE",
      "Artifact storage returned a versioned object; retention-safe storage is required.",
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
  const payloadHash =
    headers["x-amz-content-sha256"] ?? sha256Hex(Buffer.alloc(0));
  const signingHeaders: Record<string, string> = {
    ...headers,
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (config.sessionToken) {
    signingHeaders["x-amz-security-token"] = config.sessionToken;
  }

  const normalizedHeaders = new Map<string, string>();
  for (const [name, value] of Object.entries(signingHeaders)) {
    normalizedHeaders.set(
      name.toLowerCase(),
      value.trim().replace(/\s+/g, " "),
    );
  }
  const headerNames = [...normalizedHeaders.keys()].sort();
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
  const dateKey = hmac(
    Buffer.from(`AWS4${config.secretAccessKey}`, "utf8"),
    shortDate,
  );
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
    throw new ApiError(
      503,
      "ARTIFACT_STORAGE_UNAVAILABLE",
      "Artifact storage is temporarily unavailable.",
    );
  }
  if (
    !response.ok &&
    !((allowNotFound || method === "DELETE") && response.status === 404)
  ) {
    await response.body?.cancel();
    throw new ApiError(
      503,
      "ARTIFACT_STORAGE_UNAVAILABLE",
      "Artifact storage rejected the request.",
    );
  }
  return response;
}

function s3ObjectUrl(
  config: S3Config,
  storageKey: string,
): { url: URL; canonicalUri: string } {
  if (!SAFE_STORAGE_KEY.test(storageKey)) {
    throw new Error("Unsafe artifact storage key.");
  }
  const url = new URL(config.endpoint.toString());
  const baseSegments = url.pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  const keySegments = storageKey.split("/");
  const segments = config.forcePathStyle
    ? [...baseSegments, config.bucket, ...keySegments]
    : [...baseSegments, ...keySegments];
  if (!config.forcePathStyle) {
    url.hostname = `${config.bucket}.${url.hostname}`;
  }
  const canonicalUri = `/${segments.map(awsUriEncode).join("/")}`;
  url.pathname = canonicalUri;
  url.search = "";
  url.hash = "";
  return { url, canonicalUri: url.pathname };
}

async function markReservationDeletePending(
  artifact: StoredArtifact,
): Promise<void> {
  if (databaseConfigured()) {
    await transaction(async (client) => {
      const marked = await client.query<{
        application_id: string;
        organization_id: string;
      }>(
        `UPDATE application_artifacts
            SET status = 'delete_pending',
                original_filename = NULL,
                deleted_at = NULL,
                delete_next_attempt_at = now(),
                delete_last_error = 'Upload cleanup is queued for retry'
          WHERE id = $1::uuid
            AND status IN ('uploading', 'delete_pending', 'deleted')
          RETURNING application_id, organization_id`,
        [artifact.id],
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
    await writeLocalMetadata({
      ...artifact,
      status: "delete_pending",
    });
  }
}

async function releaseFailedReservation(
  artifact: StoredArtifact,
): Promise<void> {
  if (databaseConfigured()) {
    await query(
      `DELETE FROM application_artifacts
        WHERE id = $1::uuid
          AND status IN ('uploading', 'delete_pending')`,
      [artifact.id],
    );
  } else {
    await ignoreMissingUnlink(localMetadataPath(artifact.id));
  }
}

function artifactPublicReference(
  artifact: StoredArtifact,
): StoredArtifactReference {
  if (!artifact.originalFilename) {
    throw new Error("Stored artifact is missing its original filename.");
  }
  return {
    reference: issueArtifactReference(artifact),
    fileName: artifact.originalFilename,
    contentType: artifact.contentType,
    byteSize: artifact.byteSize,
    contentSha256: artifact.contentSha256,
  };
}

function artifactReferenceMacInput(artifact: StoredArtifact): string {
  return [
    "artifact-reference-v1",
    artifact.id,
    artifact.organizationId,
    artifact.applicationId,
    String(artifact.applicationVersion),
    artifact.blockId,
    artifact.purpose,
    artifact.idempotencyKeyHash,
    String(artifact.fileIndex),
    artifact.storageKey,
    artifact.contentSha256,
  ].join("\0");
}

function artifactIdFromReference(reference: string): string | null {
  if (reference.length > 256) return null;
  const [version, locator, signature, ...rest] = reference.split(".");
  if (
    version !== "art1" ||
    !/^[0-9a-f]{32}$/.test(locator ?? "") ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature ?? "") ||
    rest.length
  ) {
    return null;
  }
  return [
    locator.slice(0, 8),
    locator.slice(8, 12),
    locator.slice(12, 16),
    locator.slice(16, 20),
    locator.slice(20),
  ].join("-");
}

function artifactReferenceSecret(): string {
  const env = getServerEnv();
  if (
    env.NODE_ENV === "production" &&
    !env.WBX_MEDIA_RECEIPT_SECRET &&
    !env.WBX_AUTH_SECRET
  ) {
    throw artifactConfigurationError();
  }
  return effectiveSecret(
    env.WBX_MEDIA_RECEIPT_SECRET ?? env.WBX_AUTH_SECRET,
  );
}

function isArtifactContentType(value: string): value is ArtifactContentType {
  return FILE_RULES.some((rule) => rule.contentType === value);
}

function isArtifactStatus(value: string): value is ArtifactStatus {
  return ["uploading", "stored", "delete_pending", "deleted"].includes(value);
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
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

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function awsUriEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function hmac(key: Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
