import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  MAX_ARTIFACT_REQUEST_BYTES,
  assertArtifactRequestHeaders,
  deletePrivateArtifact,
  parseArtifactMultipart,
  readPrivateArtifact,
  resolveArtifactReference,
  storePrivateArtifacts,
  type ParsedArtifactFile,
} from "../lib/server/artifacts";
import { ApiError, ValidationError } from "../lib/server/http";

Object.assign(process.env, { WBX_DEMO_MODE: "true" });

test("multipart parser accepts allowlisted, signature-checked work artifacts", async () => {
  const request = await multipartRequest([
    new File(
      [Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n")],
      "design-review.pdf",
      { type: "application/pdf" },
    ),
    new File(
      [Buffer.from('{"decision":"ship","risks":["rollback"]}\n')],
      "evidence.json",
      { type: "application/json" },
    ),
  ], {
    purpose: "work_sample",
    blockId: "work-sample.1",
  });

  const parsed = await parseArtifactMultipart(request, {
    purpose: "work_sample",
    blockId: "work-sample.1",
  });
  assert.equal(parsed.expectedVersion, 4);
  assert.equal(parsed.blockId, "work-sample.1");
  assert.equal(parsed.purpose, "work_sample");
  assert.equal(parsed.files.length, 2);
  assert.equal(parsed.files[0].contentType, "application/pdf");
  assert.equal(parsed.files[1].contentType, "application/json");
  assert.equal(parsed.files[1].fileName, "evidence.json");
});

test("multipart parser verifies MIME, extension, and file signature together", async () => {
  const request = await multipartRequest([
    new File([Buffer.from("not a pdf")], "resume.pdf", {
      type: "application/pdf",
    }),
  ], {
    purpose: "cv_intake",
    blockId: "cv",
  });

  await assert.rejects(
    parseArtifactMultipart(request, {
      purpose: "cv_intake",
      blockId: "cv",
    }),
    (error: unknown) =>
      error instanceof ValidationError &&
      error.message.includes("valid PDF signature"),
  );
});

test("DOCX validation requires a macro-free Office package", async () => {
  const validDocx = makeZip([
    ["[Content_Types].xml", "<Types/>"],
    ["_rels/.rels", "<Relationships/>"],
    ["word/document.xml", "<w:document/>"],
  ]);
  const accepted = await multipartRequest([
    new File([asArrayBuffer(validDocx)], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  ], {
    purpose: "cv_intake",
    blockId: "cv",
  });
  assert.equal(
    (await parseArtifactMultipart(accepted, {
      purpose: "cv_intake",
      blockId: "cv",
    })).files[0].contentType,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );

  const macroDocx = makeZip([
    ["[Content_Types].xml", "<Types/>"],
    ["_rels/.rels", "<Relationships/>"],
    ["word/document.xml", "<w:document/>"],
    ["word/vbaProject.bin", "macro"],
  ]);
  const rejected = await multipartRequest([
    new File([asArrayBuffer(macroDocx)], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  ], {
    purpose: "cv_intake",
    blockId: "cv",
  });
  await assert.rejects(
    parseArtifactMultipart(rejected, {
      purpose: "cv_intake",
      blockId: "cv",
    }),
    (error: unknown) =>
      error instanceof ValidationError &&
      error.message.includes("macro-free DOCX"),
  );
});

test("ZIP validation rejects path traversal entries", async () => {
  const zip = makeZip([["../escape.ts", "export const unsafe = true;\n"]]);
  const request = await multipartRequest([
    new File([asArrayBuffer(zip)], "solution.zip", { type: "application/zip" }),
  ], {
    purpose: "coding",
    blockId: "coding",
  });

  await assert.rejects(
    parseArtifactMultipart(request, {
      purpose: "coding",
      blockId: "coding",
    }),
    (error: unknown) =>
      error instanceof ValidationError &&
      error.message.includes("unsafe ZIP entry path"),
  );
});

test("artifact request limits are enforced before multipart buffering", () => {
  const request = new Request("http://localhost/api/artifacts", {
    method: "POST",
    headers: {
      "content-length": String(MAX_ARTIFACT_REQUEST_BYTES + 1),
      "content-type": "multipart/form-data; boundary=safe-boundary",
    },
    body: Buffer.from("x"),
  });

  assert.throws(
    () => assertArtifactRequestHeaders(request),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 413 &&
      error.code === "PAYLOAD_TOO_LARGE",
  );
});

test("storage never derives a path from a candidate-supplied filename", async () => {
  const bytes = Buffer.from('{"safe":true}\n');
  await assert.rejects(
    storePrivateArtifacts({
      organizationId: "org-artifact-tests",
      applicationId: `app-${randomUUID()}`,
      applicationVersion: 1,
      blockId: "custom",
      purpose: "custom",
      idempotencyKey: `upload.${randomUUID().replaceAll("-", "")}`,
      files: [{
        bytes,
        fileName: "../escape.json",
        contentType: "application/json",
        byteSize: bytes.byteLength,
      }],
      retentionDeadline: new Date(
        Date.now() + 60 * 60 * 1_000,
      ).toISOString(),
    }),
    (error: unknown) =>
      error instanceof ValidationError &&
      error.message.includes("safe basename"),
  );
});

test("local storage is idempotent and receipts remain opaque and binding-safe", async () => {
  const nonce = randomUUID().replaceAll("-", "");
  const applicationId = `app-artifact-${nonce}`;
  const blockId = `case.${nonce}`;
  const file: ParsedArtifactFile = {
    bytes: Buffer.from('{"recommendation":"controlled rollout"}\n'),
    fileName: "recommendation.json",
    contentType: "application/json",
    byteSize: 40,
  };
  file.byteSize = file.bytes.byteLength;
  const input = {
    organizationId: "org-artifact-tests",
    applicationId,
    applicationVersion: 3,
    blockId,
    purpose: "case_study" as const,
    idempotencyKey: `upload.${nonce}`,
    files: [file],
    retentionDeadline: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
  };

  const first = await storePrivateArtifacts(input);
  const second = await storePrivateArtifacts(input);
  const artifact = first[0].artifact;
  const reference = first[0].receipt.reference;
  try {
    assert.equal(first[0].reused, false);
    assert.equal(second[0].reused, true);
    const conflictingBytes = Buffer.from('{"recommendation":"ship immediately"}\n');
    await assert.rejects(
      storePrivateArtifacts({
        ...input,
        files: [{
          ...file,
          bytes: conflictingBytes,
          byteSize: conflictingBytes.byteLength,
        }],
      }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.code === "ARTIFACT_IDEMPOTENCY_CONFLICT",
    );
    assert.match(reference, /^art1\.[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/);
    assert.equal(reference.includes(applicationId), false);
    assert.equal(reference.includes(blockId), false);
    assert.equal(reference.includes("artifacts/v1"), false);

    const resolved = await resolveArtifactReference(reference, {
      organizationId: input.organizationId,
      applicationId,
      applicationVersion: 3,
      blockId,
      purposes: ["case_study"],
    });
    assert.equal(resolved?.id, artifact.id);
    assert.deepEqual(await readPrivateArtifact(artifact), file.bytes);

    assert.equal(
      await resolveArtifactReference(reference, {
        organizationId: input.organizationId,
        applicationId,
        applicationVersion: 3,
        blockId: "wrong-block",
      }),
      null,
    );
    const tampered =
      `${reference.slice(0, -1)}${reference.endsWith("A") ? "B" : "A"}`;
    assert.equal(
      await resolveArtifactReference(tampered, {
        organizationId: input.organizationId,
        applicationId,
        applicationVersion: 3,
        blockId,
      }),
      null,
    );
  } finally {
    await deletePrivateArtifact(artifact);
  }

  assert.equal(
    await resolveArtifactReference(reference, {
      organizationId: input.organizationId,
      applicationId,
      applicationVersion: 3,
      blockId,
    }),
    null,
  );
});

async function multipartRequest(
  files: readonly File[],
  overrides: {
    purpose: string;
    blockId: string;
    expectedVersion?: string;
    idempotencyKey?: string;
  },
): Promise<Request> {
  const form = new FormData();
  form.set("expectedVersion", overrides.expectedVersion ?? "4");
  form.set(
    "idempotencyKey",
    overrides.idempotencyKey ?? "artifact-request-0001",
  );
  for (const file of files) form.append("files", file);

  const encoded = new Request("http://localhost/api/artifacts", {
    method: "POST",
    body: form,
  });
  const bytes = Buffer.from(await encoded.arrayBuffer());
  const headers = new Headers(encoded.headers);
  headers.set("content-length", String(bytes.byteLength));
  return new Request("http://localhost/api/artifacts", {
    method: "POST",
    headers,
    body: bytes,
  });
}

function makeZip(
  entries: readonly (readonly [name: string, content: string])[],
): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const [name, content] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.byteLength, 18);
    local.writeUInt32LE(data.byteLength, 22);
    local.writeUInt16LE(nameBytes.byteLength, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.byteLength, 20);
    central.writeUInt32LE(data.byteLength, 24);
    central.writeUInt16LE(nameBytes.byteLength, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBytes);

    localOffset += local.byteLength + nameBytes.byteLength + data.byteLength;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.byteLength, 12);
  eocd.writeUInt32LE(localOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function asArrayBuffer(value: Buffer): ArrayBuffer {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}
