import type {
  BlockRuntimeResult,
  EvaluationGateResult,
} from "../types";
import type {
  AssessmentReviewEvidenceReceipt,
  AssessmentReviewTarget,
} from "./application-evaluation";
import type {
  ArtifactContentType,
  ArtifactPurpose,
} from "./artifacts";

export interface PersistedTextReviewEvidence {
  kind: "text";
  label: string;
  text: string;
}

export interface PersistedArtifactReviewEvidence {
  kind: "artifact";
  label: string;
  reference: string;
  applicationVersion: number;
  purpose: ArtifactPurpose;
  expectedContentType: ArtifactContentType;
  expectedByteSize: number;
}

export type PersistedReviewEvidence =
  | PersistedTextReviewEvidence
  | PersistedArtifactReviewEvidence;

interface SubmittedArtifactBinding {
  reference: string;
  applicationVersion: number;
  contentType: ArtifactContentType;
  byteSize: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null;
}

function artifactPurpose(
  blockKind: AssessmentReviewTarget["blockKind"],
): ArtifactPurpose | null {
  switch (blockKind) {
    case "doc_verification":
      return "document_check";
    case "work_sample":
      return "work_sample";
    case "coding":
      return "coding";
    case "case_exercise":
      return "case_study";
    case "custom":
      return "custom";
    default:
      return null;
  }
}

function artifactBinding(value: unknown): SubmittedArtifactBinding | null {
  const candidate = record(value);
  const reference = nonEmptyText(candidate.uploadId);
  const applicationVersion = positiveInteger(candidate.applicationVersion);
  const contentType = nonEmptyText(candidate.mimeType);
  const byteSize = positiveInteger(candidate.sizeBytes);
  if (
    !reference ||
    applicationVersion === null ||
    !contentType ||
    byteSize === null
  ) {
    return null;
  }
  if (
    ![
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
      "application/zip",
    ].includes(contentType)
  ) {
    return null;
  }
  return {
    reference,
    applicationVersion,
    contentType: contentType as ArtifactContentType,
    byteSize,
  };
}

function submittedText(
  target: AssessmentReviewTarget,
  payload: unknown,
  receipt: AssessmentReviewEvidenceReceipt,
): string | null {
  const value = record(payload);
  const prefix = `submission:${target.binding.blockId}:`;
  if (!receipt.locator.startsWith(prefix)) return null;
  const path = receipt.locator.slice(prefix.length);

  if (target.blockKind === "work_sample") {
    const match = /^deliverables:(\d+):text$/u.exec(path);
    if (!match) return null;
    const index = Number(match[1]);
    if (!Number.isSafeInteger(index)) return null;
    return nonEmptyText(
      record(array(value.deliverables)[index]).text,
    );
  }
  if (target.blockKind === "coding") {
    if (path === "code") return nonEmptyText(value.code);
    if (path === "notes") return nonEmptyText(value.notes);
    return null;
  }
  if (target.blockKind === "case_exercise" && path === "responseText") {
    return nonEmptyText(value.responseText);
  }
  if (target.blockKind === "custom" && path === "text") {
    return nonEmptyText(value.text);
  }
  return null;
}

function submittedArtifacts(
  target: AssessmentReviewTarget,
  payload: unknown,
): SubmittedArtifactBinding[] {
  const value = record(payload);
  if (target.blockKind === "doc_verification") {
    const document = artifactBinding(
      record(value.documents)[target.binding.sourceItemId],
    );
    return document ? [document] : [];
  }
  if (target.blockKind === "work_sample") {
    return array(value.deliverables)
      .map((candidate) => artifactBinding(record(candidate).asset))
      .filter(
        (candidate): candidate is SubmittedArtifactBinding =>
          candidate !== null,
      );
  }
  if (
    target.blockKind === "case_exercise" ||
    target.blockKind === "custom"
  ) {
    return array(value.files)
      .map(artifactBinding)
      .filter(
        (candidate): candidate is SubmittedArtifactBinding =>
          candidate !== null,
      );
  }
  return [];
}

function humanObservation(
  target: AssessmentReviewTarget,
  payload: unknown,
  receipt: AssessmentReviewEvidenceReceipt,
): PersistedTextReviewEvidence | null {
  if (
    target.blockKind !== "human_stage" ||
    receipt.source !== "live_observation"
  ) {
    return null;
  }
  const prefix = `observation:${target.binding.blockId}:`;
  if (!receipt.locator.startsWith(prefix)) return null;
  const observationId = receipt.locator.slice(prefix.length);
  if (!observationId) return null;
  const observation = array(record(payload).observations)
    .map(record)
    .find((candidate) => candidate.observationId === observationId);
  if (!observation) return null;
  const notes = nonEmptyText(observation.notes);
  const observedAt = nonEmptyText(observation.observedAt);
  const observerUserId = nonEmptyText(observation.observerUserId);
  if (!notes || !observedAt || !observerUserId) return null;
  return {
    kind: "text",
    label: receipt.label,
    // The reviewer identity stays in the immutable server record but is not
    // needed to apply the BARS anchors and is therefore not disclosed here.
    text: `Observed at: ${observedAt}\n\n${notes}`,
  };
}

function documentProviderResult(
  target: AssessmentReviewTarget,
  result: BlockRuntimeResult,
  receipt: AssessmentReviewEvidenceReceipt,
): PersistedTextReviewEvidence | null {
  if (
    target.blockKind !== "doc_verification" ||
    receipt.source !== "validated_provider_report"
  ) {
    return null;
  }
  const prefix = "document-provider:";
  const suffix = `:${target.binding.sourceItemId}`;
  if (
    !receipt.locator.startsWith(prefix) ||
    !receipt.locator.endsWith(suffix)
  ) {
    return null;
  }
  const receiptId = receipt.locator.slice(
    prefix.length,
    receipt.locator.length - suffix.length,
  );
  const provider = result.serverEvidence?.documentVerifications?.find(
    (candidate) =>
      candidate.receiptId === receiptId &&
      candidate.sourceItemIds.includes(target.binding.sourceItemId),
  );
  if (
    !provider ||
    !/^[0-9a-f]{64}$/u.test(provider.responseHash) ||
    !Number.isFinite(Date.parse(provider.verifiedAt))
  ) {
    return null;
  }
  return {
    kind: "text",
    label: receipt.label,
    text: [
      `Connected provider: ${provider.providerId}`,
      `Provider/version: ${provider.providerVersion}`,
      `Recorded at: ${provider.verifiedAt}`,
      `Provider result: ${provider.outcome.replaceAll("_", " ")}`,
      "",
      "A named reviewer must adjudicate this server-owned result. It does not make an automatic employment decision.",
    ].join("\n"),
  };
}

/**
 * Resolves only a receipt already present on a server-built frozen review
 * target. The returned artifact binding intentionally omits candidate-provided
 * filenames and every storage-provider detail.
 */
export function resolvePersistedReviewEvidence(
  target: AssessmentReviewTarget,
  blockResults: readonly BlockRuntimeResult[],
  receiptIndex: number,
): PersistedReviewEvidence | null {
  if (
    !target.reviewable ||
    !Number.isSafeInteger(receiptIndex) ||
    receiptIndex < 0
  ) {
    return null;
  }
  const receipt = target.evidenceReceipts[receiptIndex];
  if (!receipt) return null;
  const result = blockResults.find(
    (candidate) =>
      candidate.blockId === target.binding.blockId &&
      candidate.kind === target.blockKind,
  );
  if (!result) return null;

  if (receipt.source === "submitted_text") {
    const text = submittedText(target, result.payload, receipt);
    return text === null
      ? null
      : { kind: "text", label: receipt.label, text };
  }
  if (receipt.source === "live_observation") {
    return humanObservation(target, result.payload, receipt);
  }
  if (receipt.source === "validated_provider_report") {
    return documentProviderResult(target, result, receipt);
  }
  if (receipt.source !== "submitted_artifact") return null;

  const locatorPrefix = `artifact:${target.binding.blockId}:`;
  if (!receipt.locator.startsWith(locatorPrefix)) return null;
  const reference = receipt.locator.slice(locatorPrefix.length);
  if (!reference) return null;
  const binding = submittedArtifacts(target, result.payload).find(
    (candidate) => candidate.reference === reference,
  );
  const purpose = artifactPurpose(target.blockKind);
  if (!binding || !purpose) return null;
  return {
    kind: "artifact",
    label: receipt.label,
    reference: binding.reference,
    applicationVersion: binding.applicationVersion,
    purpose,
    expectedContentType: binding.contentType,
    expectedByteSize: binding.byteSize,
  };
}

export function renderFrozenGateEvidence(
  target: AssessmentReviewTarget,
  gateResults: readonly EvaluationGateResult[] | undefined,
): PersistedTextReviewEvidence | null {
  const receipt = target.evidenceReceipts[0];
  if (
    target.binding.kind !== "gate_waiver" ||
    receipt?.source !== "frozen_gate"
  ) {
    return null;
  }
  const gate = gateResults?.find(
    (candidate) => candidate.blockId === target.binding.blockId,
  );
  if (!gate || gate.status !== "failed") return null;
  const lines = [
    `Frozen block: ${gate.blockTitle}`,
    `Recorded gate status: ${gate.status}`,
    `Minimum block score: ${gate.minimumBlockScore ?? "not configured"}`,
    `Recorded block score: ${gate.actualBlockScore ?? "not available"}`,
    `Required must-have criteria: ${gate.mustHaveIds.length > 0 ? gate.mustHaveIds.join(", ") : "none"}`,
    `Failed must-have criteria: ${gate.failedMustHaveIds.length > 0 ? gate.failedMustHaveIds.join(", ") : "none"}`,
    `Pending must-have criteria: ${gate.pendingMustHaveIds.length > 0 ? gate.pendingMustHaveIds.join(", ") : "none"}`,
    `Recorded reason: ${gate.reason}`,
  ];
  return {
    kind: "text",
    label: receipt.label,
    text: lines.join("\n"),
  };
}
