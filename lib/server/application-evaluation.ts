import type {
  BlockResult,
  BlockRuntimeResult,
  CandidateEvaluation,
  ClaimRecord,
  CompetencyScore,
  ConfidenceBand,
  EngineStamp,
  EvidenceChip,
  EvaluationGateResult,
  IntegritySignal,
  ItemScore,
  PipelineBlock,
  VacancyV2,
} from "../types";
import { sanitizeIntegritySignals } from "../integrity-signals";
import {
  compileAssessmentBlueprint,
  type AssessmentBlueprint,
  type AssessmentMethod,
  type EvidenceItemPlan,
} from "./assessment-blueprint";
import type { ApplicationEvidenceEvaluationOutput } from "./ai-schemas";
import {
  assessmentReviewBindingHash,
  assessmentReviewRubricHash,
  resolveAssessmentReview,
  type AssessmentReviewBinding,
  type AssessmentReviewRecord,
  type AssessmentReviewResolution,
} from "./assessment-review";

type EvaluationLevel = 1 | 2 | 3 | 4 | 5;
const LEVEL_SCORE: Record<EvaluationLevel, number> = {
  1: 20,
  2: 40,
  3: 60,
  4: 75,
  5: 92,
};

export interface ApplicationEvaluationPassage {
  passageId: string;
  text: string;
  locator: string;
  question: string;
}

export type PreparedEvaluationMode =
  | "ai"
  | "deterministic"
  | "human"
  | "manual_pending"
  | "verification_resolved"
  | "verification_pending"
  | "unscored";

export interface PreparedEvaluationItem {
  evaluationItemId: string;
  blockId: string;
  blockKind: PipelineBlock["kind"];
  sourceItemId: string;
  attributeId: string;
  attributeName: string;
  attributeDefinition: string;
  method: AssessmentMethod;
  label: string;
  mode: PreparedEvaluationMode;
  required: boolean;
  normalizedWeight: number;
  bars: [string, string, string, string, string];
  passages: ApplicationEvaluationPassage[];
  deterministicScore?: number;
  deterministicReason?: string;
  evaluationContext?: Record<string, unknown>;
  reviewBinding?: AssessmentReviewBinding;
  reviewResolution?: AssessmentReviewResolution;
}

export interface ApplicationEvaluationReviewContext {
  organizationId: string;
  applicationId: string;
  reviews: AssessmentReviewRecord[];
}

export interface PreparedApplicationEvaluation {
  blueprint: AssessmentBlueprint;
  items: PreparedEvaluationItem[];
  blockResults: BlockRuntimeResult[];
  mustHaveResults: CandidateEvaluation["mustHaveResults"];
  pendingRequiredBlockIds: string[];
  reviewContext?: ApplicationEvaluationReviewContext;
}

export interface AssessmentReviewTarget {
  targetId: string;
  binding: AssessmentReviewBinding;
  blockKind: PipelineBlock["kind"];
  blockTitle: string;
  label: string;
  attributeName: string | null;
  bars: [string, string, string, string, string] | null;
  requiredReviews: number;
  independentBeforeDiscussion: boolean;
  blindReviewRequired: boolean;
  reviewable: boolean;
  unavailableReason: string | null;
  evidenceReceipts: AssessmentReviewEvidenceReceipt[];
  status: AssessmentReviewResolution["status"];
  activeReviews: AssessmentReviewRecord[];
}

export interface AssessmentReviewEvidenceReceipt {
  locator: string;
  source: AssessmentReviewRecord["evidence"]["source"];
  observedBy: AssessmentReviewRecord["evidence"]["observedBy"];
  label: string;
}

export function resolveAssessmentReviewEvidenceReceipt(
  target: Pick<
    AssessmentReviewTarget,
    "reviewable" | "evidenceReceipts"
  >,
  locator: string,
): AssessmentReviewEvidenceReceipt | null {
  if (!target.reviewable) return null;
  const normalized = locator.trim();
  return (
    target.evidenceReceipts.find(
      (receipt) => receipt.locator === normalized,
    ) ?? null
  );
}

export interface AssessmentReviewTargetView
  extends Omit<AssessmentReviewTarget, "activeReviews"> {
  detailsVisible: boolean;
  activeReviews: {
    id: string;
    reviewerUserId: string;
    reviewerRole: AssessmentReviewRecord["reviewerRole"];
    createdAt: string;
    supersedesReviewId: string | null;
    level: AssessmentReviewRecord["level"];
    verificationOutcome: AssessmentReviewRecord["verificationOutcome"];
    gateWaiverOutcome: AssessmentReviewRecord["gateWaiverOutcome"];
    evidence: AssessmentReviewRecord["evidence"] | null;
    rationale: string | null;
  }[];
}

interface FinalizedItem {
  prepared: PreparedEvaluationItem;
  itemScore: ItemScore;
  supportingPassageIds: string[];
  contradictoryPassageIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function hasSubmittedArtifact(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    nonEmptyString(value.uploadId) !== null &&
    nonEmptyString(value.mimeType) !== null &&
    typeof value.sizeBytes === "number" &&
    Number.isFinite(value.sizeBytes) &&
    value.sizeBytes > 0
  );
}

function safeArtifactKind(value: unknown): string {
  if (!isRecord(value)) return "private file";
  const mimeType = nonEmptyString(value.mimeType)?.toLowerCase();
  if (mimeType === "application/pdf") return "PDF";
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "DOCX";
  }
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "XLSX";
  }
  if (mimeType?.startsWith("image/")) return "image";
  return "private file";
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function clamp100(value: number): number {
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round(clamped * 10) / 10;
}

function levelForScore(score: number): EvaluationLevel {
  let best: EvaluationLevel = 1;
  let distance = Number.POSITIVE_INFINITY;
  for (const level of [1, 2, 3, 4, 5] as const) {
    const candidate = Math.abs(LEVEL_SCORE[level] - score);
    if (candidate < distance) {
      best = level;
      distance = candidate;
    }
  }
  return best;
}

function itemId(item: EvidenceItemPlan, attributeId: string): string {
  return `${item.id}::${attributeId}`;
}

function sourceBlock(
  vacancy: VacancyV2,
  blockId: string,
): PipelineBlock {
  const block = vacancy.pipeline.find((candidate) => candidate.id === blockId);
  if (!block) {
    throw new Error(
      `Frozen evaluation block "${blockId}" is unavailable.`,
    );
  }
  return block;
}

function resultMap(
  vacancy: VacancyV2,
  results: BlockRuntimeResult[],
): Map<string, BlockRuntimeResult> {
  const byId = new Map<string, BlockRuntimeResult>();
  for (const result of results) {
    if (byId.has(result.blockId)) {
      throw new Error(
        `Application contains duplicate block result "${result.blockId}".`,
      );
    }
    const block = sourceBlock(vacancy, result.blockId);
    if (block.kind !== result.kind) {
      throw new Error(
        `Application result "${result.blockId}" does not match the frozen block kind.`,
      );
    }
    byId.set(result.blockId, result);
  }
  return byId;
}

/**
 * Produces a non-scoring receipt/verification ledger without opening private
 * artifacts or treating candidate-supplied metadata as proof. Filenames,
 * URLs, names, email addresses, and document contents are deliberately
 * excluded because they may contain PII or unsupported claims.
 *
 * VERIFIED/NOT_VERIFIED may only come from an exact, server-owned trusted
 * review bound to this application, vacancy version, block, source item, and
 * frozen rubric. Candidate payloads can create receipts, never verification.
 */
export function buildVerificationClaimLedger(
  vacancy: VacancyV2,
  blockResults: BlockRuntimeResult[],
  verificationStatuses: ReadonlyMap<
    string,
    ClaimRecord["status"]
  > = new Map(),
): ClaimRecord[] {
  const results = resultMap(vacancy, blockResults);
  const claims: ClaimRecord[] = [];
  const pushClaim = (
    block: PipelineBlock,
    sourceItemId: string,
    text: string,
    material: boolean,
    status: ClaimRecord["status"] = "UNCHECKED",
  ) => {
    claims.push({
      id:
        `claim:v${vacancy.configVersion}:` +
        `${block.id}:${sourceItemId}`,
      text,
      sourceBlockId: block.id,
      sourceItemId,
      sourceVacancyId: vacancy.id,
      sourceVacancyVersion: vacancy.configVersion,
      material,
      status,
    });
  };
  const verificationStatus = (
    blockId: string,
    sourceItemId: string,
  ) =>
    verificationStatuses.get(`${blockId}::${sourceItemId}`) ??
    "UNCHECKED";
  const orderedBlocks = [...vacancy.pipeline].sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id),
  );

  for (const block of orderedBlocks) {
    const result = results.get(block.id);
    const payload = asRecord(result?.payload);
    if (block.settings.kind === "application_form") {
      const answers = asRecord(payload.answers);
      for (const field of block.settings.fields) {
        if (field.scored || field.pii || field.type === "consent") {
          continue;
        }
        const answer = answers[field.id];
        let exactReceipt: string | null = null;
        if (
          field.type === "single_choice" ||
          field.type === "dropdown"
        ) {
          const selected = field.options?.find(
            (option) => option.id === answer,
          );
          exactReceipt = selected?.text ?? null;
        } else if (field.type === "multi_choice" && Array.isArray(answer)) {
          const selectedIds = new Set(
            answer.filter(
              (value): value is string => typeof value === "string",
            ),
          );
          const selected = (field.options ?? [])
            .filter((option) => selectedIds.has(option.id))
            .map((option) => option.text);
          exactReceipt = selected.length > 0 ? selected.join(", ") : null;
        } else if (
          field.type === "number" &&
          typeof answer === "number" &&
          Number.isFinite(answer)
        ) {
          exactReceipt = String(answer);
        } else if (
          (field.type === "short_text" ||
            field.type === "long_text" ||
            field.type === "date") &&
          nonEmptyString(answer)
        ) {
          exactReceipt = "response received (content not copied)";
        } else if (
          field.type === "url" &&
          nonEmptyString(answer)
        ) {
          exactReceipt = "link received (URL withheld)";
        } else if (
          field.type === "file" &&
          hasSubmittedArtifact(answer)
        ) {
          exactReceipt =
            `${safeArtifactKind(answer)} artifact received`;
        }
        if (!exactReceipt) continue;
        const safeLabel =
          nonEmptyString(field.label)?.slice(0, 200) ??
          "Published application field";
        pushClaim(
          block,
          `application-field:${field.id}`,
          `Non-scoring application response "${safeLabel}": ${exactReceipt}.`,
          false,
        );
      }
      continue;
    }

    if (block.settings.kind === "cv_intake") {
      const resume = payload.resume;
      if (hasSubmittedArtifact(resume)) {
        const status = verificationStatus(
          block.id,
          "parsed-job-claims",
        );
        pushClaim(
          block,
          "cv-receipt",
          `CV artifact received (${safeArtifactKind(resume)}); ` +
            (status === "VERIFIED"
              ? "a named reviewer verified the frozen review target."
              : status === "NOT_VERIFIED"
                ? "a named reviewer did not verify the frozen review target."
                : "its contents were not parsed or treated as verified evidence."),
          false,
          status,
        );
      }
      if (nonEmptyString(payload.portfolioUrl)) {
        pushClaim(
          block,
          "portfolio-receipt",
          "Portfolio link received; the external content was not opened or treated as verified evidence.",
          false,
        );
      }
      continue;
    }

    if (block.settings.kind === "doc_verification") {
      const submittedDocuments = asRecord(payload.documents);
      for (const document of block.settings.requiredDocuments) {
        const asset = submittedDocuments[document.id];
        const received = hasSubmittedArtifact(asset);
        const status = verificationStatus(block.id, document.id);
        const safeLabel =
          nonEmptyString(document.label)?.slice(0, 200) ??
          "Published document requirement";
        pushClaim(
          block,
          `document:${document.id}`,
          received
            ? `Required document "${safeLabel}" received (${safeArtifactKind(asset)}); ${
                status === "VERIFIED"
                  ? block.settings.mode === "manual_document_review"
                    ? "a named reviewer confirmed that its contents meet the frozen requirement; external authenticity was not established."
                    : "a named reviewer confirmed the connected provider result."
                  : status === "NOT_VERIFIED"
                    ? block.settings.mode === "manual_document_review"
                      ? "a named reviewer found that its contents do not meet the frozen requirement."
                      : "a named reviewer did not confirm the connected provider result."
                    : block.settings.mode === "manual_document_review"
                      ? "named content review remains pending; external authenticity is not implied."
                      : "a connected provider result remains pending; the upload alone is not verification."
              }`
            : `Required document "${safeLabel}" has no submitted artifact; ${
                block.settings.mode === "manual_document_review"
                  ? "named content review remains pending."
                  : "connected provider verification remains pending."
              }`,
          Boolean(
            block.required || document.qualificationAttributeId,
          ),
          status,
        );
      }
      continue;
    }

    if (block.settings.kind === "reference_check") {
      const submittedCount = asArray(payload.referees).filter(isRecord).length;
      pushClaim(
        block,
        "reference-receipt",
        submittedCount > 0
          ? `${submittedCount} of ${block.settings.referees.count} required referee contact record(s) received; no questionnaire response was treated as verified evidence.`
          : `${block.settings.referees.count} referee check(s) required; no verified questionnaire evidence is available.`,
        block.required || block.scored,
      );
      continue;
    }

    if (block.settings.kind === "work_sample") {
      const deliverables = asArray(payload.deliverables).filter(isRecord);
      for (const [index, deliverable] of deliverables.entries()) {
        const kind = nonEmptyString(deliverable.kind);
        if (
          (kind === "file" || kind === "spreadsheet") &&
          hasSubmittedArtifact(deliverable.asset)
        ) {
          pushClaim(
            block,
            `artifact:${index + 1}:${kind}`,
            `${kind === "spreadsheet" ? "Spreadsheet" : "Work-sample"} artifact received for "${block.title.slice(0, 200)}" (${safeArtifactKind(deliverable.asset)}); no claim was inferred from its filename or contents.`,
            false,
          );
        } else if (kind === "url" && nonEmptyString(deliverable.url)) {
          pushClaim(
            block,
            `artifact:${index + 1}:url`,
            `Work-sample link received for "${block.title.slice(0, 200)}"; the URL and external content were not copied into the claim ledger.`,
            false,
          );
        }
      }
      continue;
    }

    if (
      block.settings.kind === "coding" &&
      block.settings.environment === "take_home_repo" &&
      nonEmptyString(payload.repositoryUrl) &&
      nonEmptyString(payload.commitSha)
    ) {
      pushClaim(
        block,
        "repository-receipt",
        `Immutable repository reference received for "${block.title.slice(0, 200)}"; the URL, account identity, and repository content were not copied into the claim ledger.`,
        false,
      );
      continue;
    }

    if (block.settings.kind === "case_exercise") {
      const fileCount = asArray(payload.files).filter(
        hasSubmittedArtifact,
      ).length;
      const linkCount = asArray(payload.links).filter(
        (value) => nonEmptyString(value) !== null,
      ).length;
      if (fileCount > 0) {
        pushClaim(
          block,
          "case-file-receipt",
          `${fileCount} private case artifact(s) received for "${block.title.slice(0, 200)}"; filenames and contents were not used as claims.`,
          false,
        );
      }
      if (linkCount > 0) {
        pushClaim(
          block,
          "case-link-receipt",
          `${linkCount} case link reference(s) received for "${block.title.slice(0, 200)}"; URLs and external content were not copied into the claim ledger.`,
          false,
        );
      }
      continue;
    }

    if (block.settings.kind === "custom") {
      const fileCount = asArray(payload.files).filter(
        hasSubmittedArtifact,
      ).length;
      const recordingCount = asArray(payload.recordings).filter(
        (value) => nonEmptyString(value) !== null,
      ).length;
      if (fileCount > 0) {
        pushClaim(
          block,
          "custom-file-receipt",
          `${fileCount} private artifact(s) received for "${block.title.slice(0, 200)}"; filenames and contents were not used as claims.`,
          false,
        );
      }
      if (recordingCount > 0) {
        pushClaim(
          block,
          "custom-recording-receipt",
          `${recordingCount} recording reference(s) received for "${block.title.slice(0, 200)}"; no visual, vocal, emotional, accent, or reading-behaviour inference was made.`,
          false,
        );
      }
    }
  }

  return claims;
}

function attributeMap(
  vacancy: VacancyV2,
): Map<
  string,
  {
    name: string;
    definition: string;
    anchors: [string, string, string, string, string];
  }
> {
  return new Map(
    vacancy.categories.flatMap((category) =>
      category.attributes.map(
        (attribute) =>
          [
            attribute.id,
            {
              name: attribute.name,
              definition: attribute.definition,
              anchors: attribute.scale.anchors,
            },
          ] as const,
      ),
    ),
  );
}

function labelFor(block: PipelineBlock, sourceItemId: string): string {
  const settings = block.settings;
  switch (settings.kind) {
    case "application_form":
      return (
        settings.fields.find((field) => field.id === sourceItemId)?.label ??
        sourceItemId
      );
    case "knockout":
      return (
        settings.items.find((item) => item.id === sourceItemId)?.question ??
        sourceItemId
      );
    case "async_interview":
    case "live_ai_interview":
    case "chat_interview":
      return (
        settings.questions.find((question) => question.id === sourceItemId)
          ?.text ?? sourceItemId
      );
    case "sjt":
      return (
        settings.items.find((item) => item.id === sourceItemId)?.scenario ??
        sourceItemId
      );
    case "job_knowledge":
      return (
        settings.items.find((item) => item.id === sourceItemId)?.prompt ??
        sourceItemId
      );
    case "work_sample":
    case "coding":
    case "case_exercise":
    case "custom":
      return (
        settings.rubricDimensions.find(
          (dimension) => dimension.id === sourceItemId,
        )?.name ?? sourceItemId
      );
    case "reference_check":
      return (
        settings.questionnaire.find(
          (question) => question.id === sourceItemId,
        )?.text ?? sourceItemId
      );
    default:
      return sourceItemId;
  }
}

function passage(
  blockId: string,
  sourceItemId: string,
  index: number,
  text: string,
  locator: string,
  question: string,
): ApplicationEvaluationPassage {
  return {
    passageId: `${blockId}:${sourceItemId}:p${index + 1}`,
    text: text.slice(0, 30_000),
    locator,
    question,
  };
}

function interviewPassages(
  block: PipelineBlock,
  result: BlockRuntimeResult | undefined,
  sourceItemId: string,
): ApplicationEvaluationPassage[] {
  if (!result) return [];
  const question = labelFor(block, sourceItemId);
  return (result.transcript ?? [])
    .filter(
      (turn) =>
        turn.speaker === "candidate" &&
        turn.itemId === sourceItemId &&
        turn.text.trim().length > 0,
    )
    .map((turn, index) =>
      passage(
        block.id,
        sourceItemId,
        index,
        turn.text.trim(),
        turn.at,
        question,
      ),
    );
}

function applicationPassages(
  block: PipelineBlock,
  result: BlockRuntimeResult | undefined,
  sourceItemId: string,
): ApplicationEvaluationPassage[] {
  if (!result || block.settings.kind !== "application_form") return [];
  const field = block.settings.fields.find(
    (candidate) => candidate.id === sourceItemId,
  );
  if (!field || field.pii) return [];
  const answer = asRecord(asRecord(result.payload).answers)[sourceItemId];
  const text = nonEmptyString(answer);
  if (!text) return [];
  return [
    passage(
      block.id,
      sourceItemId,
      0,
      text,
      `field:${sourceItemId}`,
      field.label,
    ),
  ];
}

function jobKnowledgePassages(
  block: PipelineBlock,
  result: BlockRuntimeResult | undefined,
  sourceItemId: string,
): ApplicationEvaluationPassage[] {
  if (!result || block.settings.kind !== "job_knowledge") return [];
  const item = block.settings.items.find(
    (candidate) => candidate.id === sourceItemId,
  );
  if (
    !item ||
    (item.type !== "short_answer" &&
      item.type !== "true_false_justify")
  ) {
    return [];
  }
  const answer = asRecord(asRecord(result.payload).answers)[sourceItemId];
  const text =
    item.type === "short_answer"
      ? nonEmptyString(answer)
      : isRecord(answer)
        ? nonEmptyString(answer.justification)
        : null;
  if (!text) return [];
  return [
    passage(
      block.id,
      sourceItemId,
      0,
      text,
      `item:${sourceItemId}`,
      item.prompt,
    ),
  ];
}

function artifactTextPassages(
  block: PipelineBlock,
  result: BlockRuntimeResult | undefined,
  sourceItemId: string,
): ApplicationEvaluationPassage[] {
  if (!result) return [];
  const payload = asRecord(result.payload);
  const question = labelFor(block, sourceItemId);
  if (block.settings.kind === "work_sample") {
    return asArray(payload.deliverables)
      .flatMap((deliverable) => {
        if (!isRecord(deliverable) || deliverable.kind !== "rich_text") {
          return [];
        }
        const text = nonEmptyString(deliverable.text);
        return text ? [text] : [];
      })
      .map((text, index) =>
        passage(
          block.id,
          sourceItemId,
          index,
          text,
          `deliverable:rich_text:${index + 1}`,
          question,
        ),
      );
  }
  if (block.settings.kind === "coding") {
    const code = nonEmptyString(payload.code);
    const notes = nonEmptyString(payload.notes);
    return [code, notes]
      .filter((text): text is string => Boolean(text))
      .map((text, index) =>
        passage(
          block.id,
          sourceItemId,
          index,
          text,
          index === 0 && code ? "submitted-code" : "candidate-notes",
          question,
        ),
      );
  }
  if (block.settings.kind === "case_exercise") {
    const text = nonEmptyString(payload.responseText);
    return text
      ? [
          passage(
            block.id,
            sourceItemId,
            0,
            text,
            "case-response",
            question,
          ),
        ]
      : [];
  }
  if (block.settings.kind === "custom") {
    const text = nonEmptyString(payload.text);
    return text
      ? [
          passage(
            block.id,
            sourceItemId,
            0,
            text,
            "custom-text-response",
            question,
          ),
        ]
      : [];
  }
  return [];
}

function passagesFor(
  block: PipelineBlock,
  result: BlockRuntimeResult | undefined,
  item: EvidenceItemPlan,
): ApplicationEvaluationPassage[] {
  switch (block.settings.kind) {
    case "async_interview":
    case "live_ai_interview":
    case "chat_interview":
      return interviewPassages(block, result, item.sourceItemId);
    case "application_form":
      return applicationPassages(block, result, item.sourceItemId);
    case "job_knowledge":
      return jobKnowledgePassages(block, result, item.sourceItemId);
    case "work_sample":
    case "coding":
    case "case_exercise":
    case "custom":
      return artifactTextPassages(block, result, item.sourceItemId);
    default:
      return [];
  }
}

function visibleAnswer(
  block: PipelineBlock,
  sourceItemId: string,
  value: unknown,
): string {
  if (block.settings.kind === "application_form") {
    const field = block.settings.fields.find(
      (candidate) => candidate.id === sourceItemId,
    );
    const options = new Map(
      (field?.options ?? []).map((option) => [option.id, option.text]),
    );
    if (typeof value === "string") return options.get(value) ?? value;
    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => options.get(item) ?? item)
        .join(", ");
    }
  }
  if (block.settings.kind === "knockout") {
    const item = block.settings.items.find(
      (candidate) => candidate.id === sourceItemId,
    );
    const options = new Map(
      (item?.options ?? []).map((option) => [option.id, option.text]),
    );
    if (typeof value === "string") return options.get(value) ?? value;
    if (Array.isArray(value)) {
      return value
        .filter((candidate): candidate is string => typeof candidate === "string")
        .map((candidate) => options.get(candidate) ?? candidate)
        .join(", ");
    }
  }
  if (block.settings.kind === "sjt") {
    const item = block.settings.items.find(
      (candidate) => candidate.id === sourceItemId,
    );
    const options = new Map(
      (item?.options ?? []).map((option) => [option.id, option.text]),
    );
    if (typeof value === "string") return options.get(value) ?? value;
    return JSON.stringify(value);
  }
  if (block.settings.kind === "job_knowledge") {
    const item = block.settings.items.find(
      (candidate) => candidate.id === sourceItemId,
    );
    const options = new Map(
      (item?.options ?? []).map((option) => [option.id, option.text]),
    );
    if (typeof value === "string") return options.get(value) ?? value;
    if (Array.isArray(value)) {
      return value
        .filter((candidate): candidate is string => typeof candidate === "string")
        .map((candidate) => options.get(candidate) ?? candidate)
        .join(", ");
    }
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}

function normalizePoints(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || maximum <= minimum) return 0;
  return clamp100(((value - minimum) / (maximum - minimum)) * 100);
}

function applicationDeterministicScore(
  block: PipelineBlock,
  result: BlockRuntimeResult | undefined,
  sourceItemId: string,
): { score: number; reason: string; answer: string } | null {
  if (!result || block.settings.kind !== "application_form") return null;
  const field = block.settings.fields.find(
    (candidate) => candidate.id === sourceItemId,
  );
  if (!field?.scored || !field.options?.length) return null;
  const points = field.options.map((option) => option.points);
  if (points.some((value) => typeof value !== "number")) return null;
  const answer = asRecord(asRecord(result.payload).answers)[sourceItemId];
  if (typeof answer === "string") {
    const selected = field.options.find((option) => option.id === answer);
    if (selected?.points === undefined) return null;
    return {
      score: normalizePoints(
        selected.points,
        Math.min(...(points as number[])),
        Math.max(...(points as number[])),
      ),
      reason: "Server applied the frozen rational-biodata option key.",
      answer: visibleAnswer(block, sourceItemId, answer),
    };
  }
  if (Array.isArray(answer)) {
    const selected = new Set(
      answer.filter((value): value is string => typeof value === "string"),
    );
    const values = field.options.map((option) => option.points ?? 0);
    const actual = field.options.reduce(
      (sum, option) => sum + (selected.has(option.id) ? option.points ?? 0 : 0),
      0,
    );
    const minimum = values.filter((value) => value < 0).reduce((a, b) => a + b, 0);
    const maximum = values.filter((value) => value > 0).reduce((a, b) => a + b, 0);
    return {
      score: normalizePoints(actual, minimum, maximum),
      reason: "Server applied the frozen multi-select rational-biodata key.",
      answer: visibleAnswer(block, sourceItemId, answer),
    };
  }
  return null;
}

function sjtDeterministicScore(
  block: PipelineBlock,
  result: BlockRuntimeResult | undefined,
  sourceItemId: string,
): { score: number; reason: string; answer: string } | null {
  if (!result || block.settings.kind !== "sjt") return null;
  const item = block.settings.items.find(
    (candidate) => candidate.id === sourceItemId,
  );
  if (!item?.smeReviewed || block.settings.pilotMode) return null;
  const answer = asRecord(asRecord(result.payload).answers)[sourceItemId];
  const byId = new Map(item.options.map((option) => [option.id, option]));
  const values = item.options.map((option) => option.keyScore);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  let fraction: number | null = null;
  if (block.settings.format === "pick_best" && typeof answer === "string") {
    const selected = byId.get(answer);
    if (selected) {
      fraction = normalizePoints(selected.keyScore, minimum, maximum) / 100;
    }
  } else if (
    block.settings.format === "pick_best_worst" &&
    isRecord(answer) &&
    typeof answer.bestId === "string" &&
    typeof answer.worstId === "string"
  ) {
    const best = byId.get(answer.bestId);
    const worst = byId.get(answer.worstId);
    if (best && worst && maximum > minimum) {
      fraction =
        ((best.keyScore - minimum) / (maximum - minimum) +
          (maximum - worst.keyScore) / (maximum - minimum)) /
        2;
    }
  } else if (
    block.settings.format === "rank_all" &&
    Array.isArray(answer)
  ) {
    const ranking = answer.filter(
      (value): value is string => typeof value === "string",
    );
    const ideal = [...item.options]
      .sort((left, right) => right.keyScore - left.keyScore)
      .map((option) => option.id);
    if (ranking.length === ideal.length) {
      let concordant = 0;
      let pairs = 0;
      for (let left = 0; left < ideal.length; left += 1) {
        for (let right = left + 1; right < ideal.length; right += 1) {
          const leftScore = byId.get(ideal[left])?.keyScore;
          const rightScore = byId.get(ideal[right])?.keyScore;
          if (leftScore === rightScore) continue;
          pairs += 1;
          if (ranking.indexOf(ideal[left]) < ranking.indexOf(ideal[right])) {
            concordant += 1;
          }
        }
      }
      fraction = pairs > 0 ? concordant / pairs : null;
    }
  } else if (
    block.settings.format === "rate_each" &&
    isRecord(answer)
  ) {
    const distances = item.options.flatMap((option) => {
      const rating = answer[option.id];
      if (typeof rating !== "number") return [];
      const expected =
        maximum > minimum
          ? 1 + ((option.keyScore - minimum) / (maximum - minimum)) * 4
          : 3;
      return [Math.abs(rating - expected) / 4];
    });
    if (distances.length === item.options.length) {
      fraction =
        1 - distances.reduce((sum, value) => sum + value, 0) / distances.length;
    }
  }
  if (fraction === null) return null;
  return {
    score: clamp100(fraction * 100),
    reason: "Server applied the frozen SME-reviewed SJT response key.",
    answer: visibleAnswer(block, sourceItemId, answer),
  };
}

function knowledgeDeterministicScore(
  block: PipelineBlock,
  result: BlockRuntimeResult | undefined,
  sourceItemId: string,
): { score: number; reason: string; answer: string } | null {
  if (!result || block.settings.kind !== "job_knowledge") return null;
  const item = block.settings.items.find(
    (candidate) => candidate.id === sourceItemId,
  );
  if (
    !item ||
    item.type === "short_answer" ||
    item.type === "true_false_justify" ||
    item.type === "image_hotspot"
  ) {
    return null;
  }
  const answer = asRecord(asRecord(result.payload).answers)[sourceItemId];
  let fraction: number | null = null;
  if (item.type === "mcq_single" && typeof answer === "string") {
    const option = item.options?.find((candidate) => candidate.id === answer);
    fraction = option ? (option.correct ? 1 : 0) : null;
  } else if (item.type === "mcq_multi" && Array.isArray(answer)) {
    const selected = new Set(
      answer.filter((value): value is string => typeof value === "string"),
    );
    const correct = new Set(
      (item.options ?? [])
        .filter((option) => option.correct)
        .map((option) => option.id),
    );
    if (correct.size > 0) {
      const truePositive = [...selected].filter((id) => correct.has(id)).length;
      const falsePositive = [...selected].filter((id) => !correct.has(id)).length;
      fraction = Math.max(0, (truePositive - falsePositive) / correct.size);
    }
  } else if (item.type === "sequence" && Array.isArray(answer)) {
    const submitted = answer.filter(
      (value): value is string => typeof value === "string",
    );
    const expected = (item.options ?? []).map((option) => option.id);
    if (submitted.length === expected.length && expected.length > 1) {
      let matches = 0;
      for (let index = 0; index < expected.length; index += 1) {
        if (submitted[index] === expected[index]) matches += 1;
      }
      fraction = matches / expected.length;
    }
  }
  if (fraction === null) return null;
  return {
    score: clamp100(fraction * 100),
    reason: "Server applied the frozen job-knowledge answer key.",
    answer: visibleAnswer(block, sourceItemId, answer),
  };
}

function deterministicScore(
  block: PipelineBlock,
  result: BlockRuntimeResult | undefined,
  sourceItemId: string,
): { score: number; reason: string; answer: string } | null {
  return (
    applicationDeterministicScore(block, result, sourceItemId) ??
    sjtDeterministicScore(block, result, sourceItemId) ??
    knowledgeDeterministicScore(block, result, sourceItemId)
  );
}

function knockoutResults(
  block: PipelineBlock,
  result: BlockRuntimeResult | undefined,
): CandidateEvaluation["mustHaveResults"] {
  if (!result || block.settings.kind !== "knockout") return [];
  const answers = asRecord(asRecord(result.payload).answers);
  return block.settings.items.map((item) => {
    const answer = answers[item.id];
    let passed = false;
    if (item.type === "yes_no") {
      passed = typeof answer === "boolean" && answer === item.passValue;
    } else if (item.type === "numeric_threshold") {
      passed =
        typeof answer === "number" &&
        Number.isFinite(answer) &&
        typeof item.threshold === "number" &&
        answer >= item.threshold;
    } else if (item.type === "single_choice") {
      passed =
        typeof answer === "string" &&
        !item.options?.find((option) => option.id === answer)?.disqualifies;
    } else if (item.type === "multi_must_include") {
      const selected = new Set(
        Array.isArray(answer)
          ? answer.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
      );
      passed =
        (item.options ?? [])
          .filter((option) => option.mustInclude)
          .every((option) => selected.has(option.id)) &&
        !(item.options ?? []).some(
          (option) => option.disqualifies && selected.has(option.id),
        );
    }
    return {
      id: item.mustHaveId ?? item.id,
      passed,
      evidence:
        `Server evaluated the response to frozen eligibility item "${item.id}". ` +
        (item.allowAppeal
          ? "A candidate explanation remains available for human adjudication."
          : "A named human reviewer must confirm the outcome."),
    };
  });
}

function evaluationContext(
  block: PipelineBlock,
  sourceItemId: string,
): Record<string, unknown> | undefined {
  if (block.settings.kind === "job_knowledge") {
    const item = block.settings.items.find(
      (candidate) => candidate.id === sourceItemId,
    );
    if (!item) return undefined;
    return {
      itemType: item.type,
      modelAnswer: item.modelAnswer ?? null,
      keyPoints: item.keyPoints ?? [],
      difficulty: item.difficulty,
      openBook: block.settings.openBook,
    };
  }
  if (
    block.settings.kind === "work_sample" ||
    block.settings.kind === "coding" ||
    block.settings.kind === "case_exercise" ||
    block.settings.kind === "custom"
  ) {
    return {
      task:
        block.settings.kind === "work_sample"
          ? block.settings.brief
          : block.settings.kind === "coding"
            ? block.settings.brief
            : block.settings.kind === "case_exercise"
              ? block.settings.materials
              : block.settings.instructions,
      assessorInstructions: block.assessorInstructions ?? null,
    };
  }
  return undefined;
}

function aiEligible(
  block: PipelineBlock,
  item: EvidenceItemPlan,
  passages: ApplicationEvaluationPassage[],
): boolean {
  if (
    !item.eligibleForScoring ||
    passages.length === 0 ||
    block.validation?.scoreUse === "context_only" ||
    item.scoringActor !== "model_assisted_human_review"
  ) {
    return false;
  }
  return [
    "application_form",
    "async_interview",
    "live_ai_interview",
    "chat_interview",
    "job_knowledge",
    "work_sample",
    "coding",
    "case_exercise",
    "custom",
  ].includes(block.kind);
}

function pendingMode(
  block: PipelineBlock,
  item: EvidenceItemPlan,
): PreparedEvaluationMode {
  if (
    block.kind === "reference_check" ||
    item.scoringRule === "verification_only" ||
    item.scoringActor === "verification_with_human_adjudication"
  ) {
    return "verification_pending";
  }
  if (
    item.eligibleForScoring &&
    (item.scoringActor === "independent_human_review" ||
      item.scoringActor === "validated_instrument")
  ) {
    return "manual_pending";
  }
  return "unscored";
}

function reviewBindingForItem(
  vacancy: VacancyV2,
  context: ApplicationEvaluationReviewContext,
  block: PipelineBlock,
  item: EvidenceItemPlan,
  attributeId: string,
  bars: [string, string, string, string, string],
  mode: PreparedEvaluationMode,
  hasRuntimeResult: boolean,
): AssessmentReviewBinding | null {
  if (
    mode !== "manual_pending" &&
    mode !== "verification_pending"
  ) {
    return null;
  }
  if (!hasRuntimeResult && block.kind !== "human_stage") {
    return null;
  }
  if (
    block.kind === "human_stage" &&
    !block.scored
  ) {
    return null;
  }
  const kind =
    block.kind === "reference_check" ||
    mode === "manual_pending"
      ? "manual_bars"
      : "verification";
  return {
    organizationId: context.organizationId,
    applicationId: context.applicationId,
    vacancyId: vacancy.id,
    vacancyVersion: vacancy.configVersion,
    blockId: block.id,
    sourceItemId: item.sourceItemId,
    attributeId: kind === "manual_bars" ? attributeId : null,
    kind,
    rubricHash: assessmentReviewRubricHash(
      kind === "manual_bars"
        ? {
            normalization: "absolute_rubric",
            anchors: bars,
          }
        : {
            scoringRule: item.scoringRule,
            scoringActor: item.scoringActor,
            sourceItemId: item.sourceItemId,
          },
    ),
  };
}

export function prepareApplicationEvaluation(
  vacancy: VacancyV2,
  blockResults: BlockRuntimeResult[],
  reviewContext?: ApplicationEvaluationReviewContext,
): PreparedApplicationEvaluation {
  const blueprint = compileAssessmentBlueprint(vacancy);
  if (
    blueprint.vacancyId !== vacancy.id ||
    blueprint.vacancyVersion !== vacancy.configVersion
  ) {
    throw new Error("Assessment blueprint does not match the frozen vacancy.");
  }
  if (!blueprint.ready) {
    throw new Error(
      `Frozen assessment blueprint is not evaluation-ready: ${blueprint.issues
        .filter((issue) => issue.severity === "blocker")
        .map((issue) => issue.code)
        .join(", ") || "unknown blocker"}.`,
    );
  }
  const results = resultMap(vacancy, blockResults);
  const attributes = attributeMap(vacancy);
  const prepared: PreparedEvaluationItem[] = [];
  const mustHaveResults: CandidateEvaluation["mustHaveResults"] = [];
  const pendingRequiredBlockIds = new Set<string>();

  for (const blockPlan of blueprint.blocks) {
    const block = sourceBlock(vacancy, blockPlan.blockId);
    const result = results.get(block.id);
    if (block.settings.kind === "knockout") {
      mustHaveResults.push(...knockoutResults(block, result));
    }
    for (const item of blockPlan.items.filter((candidate) => !candidate.conditional)) {
      for (const attributeId of item.attributeIds) {
        const attribute = attributes.get(attributeId);
        if (!attribute) {
          throw new Error(
            `Evidence item "${item.id}" refers to an unknown frozen attribute.`,
          );
        }
        const passages = passagesFor(block, result, item);
        const bars = item.rubric?.anchors ?? attribute.anchors;
        const deterministic =
          item.scoringActor === "deterministic_key"
            ? deterministicScore(block, result, item.sourceItemId)
            : null;
        let mode: PreparedEvaluationMode;
        if (
          deterministic &&
          item.eligibleForScoring &&
          block.validation?.scoreUse !== "context_only"
        ) {
          mode = "deterministic";
        } else if (aiEligible(block, item, passages)) {
          mode = "ai";
        } else {
          mode = pendingMode(block, item);
        }
        const reviewBinding = reviewContext
          ? reviewBindingForItem(
              vacancy,
              reviewContext,
              block,
              item,
              attributeId,
              bars,
              mode,
              Boolean(result),
            )
          : null;
        const reviewResolution = reviewBinding
          ? resolveAssessmentReview(
              reviewContext?.reviews ?? [],
              reviewBinding,
              blockPlan.review.minimumIndependentReviews,
            )
          : undefined;
        if (
          reviewResolution?.status === "resolved" &&
          reviewBinding?.kind === "manual_bars" &&
          reviewResolution.level !== null
        ) {
          mode = "human";
        } else if (
          reviewResolution?.status === "resolved" &&
          reviewBinding?.kind === "verification" &&
          reviewResolution.verificationOutcome !== null
        ) {
          mode = "verification_resolved";
        }
        const requiredVerificationStage =
          block.required &&
          (block.kind === "doc_verification" ||
            block.kind === "reference_check");
        if (
          (mode === "manual_pending" ||
            mode === "verification_pending") &&
          (block.scored || requiredVerificationStage)
        ) {
          pendingRequiredBlockIds.add(block.id);
        }
        prepared.push({
          evaluationItemId: itemId(item, attributeId),
          blockId: block.id,
          blockKind: block.kind,
          sourceItemId: item.sourceItemId,
          attributeId,
          attributeName: attribute.name,
          attributeDefinition: attribute.definition,
          method: item.method,
          label: labelFor(block, item.sourceItemId),
          mode,
          required: item.required,
          normalizedWeight: item.normalizedWeight,
          bars,
          passages:
            deterministic && passages.length === 0
              ? [
                  passage(
                    block.id,
                    item.sourceItemId,
                    0,
                    deterministic.answer,
                    `item:${item.sourceItemId}`,
                    labelFor(block, item.sourceItemId),
                  ),
                ]
              : passages,
          ...(deterministic
            ? {
                deterministicScore: deterministic.score,
                deterministicReason: deterministic.reason,
              }
            : {}),
          ...(evaluationContext(block, item.sourceItemId)
            ? {
                evaluationContext: evaluationContext(
                  block,
                  item.sourceItemId,
                ),
              }
            : {}),
          ...(reviewBinding ? { reviewBinding } : {}),
          ...(reviewResolution ? { reviewResolution } : {}),
        });
      }
    }
  }

  return {
    blueprint,
    items: prepared,
    blockResults: [...blockResults],
    mustHaveResults,
    pendingRequiredBlockIds: [...pendingRequiredBlockIds],
    ...(reviewContext ? { reviewContext } : {}),
  };
}

export function buildAssessmentReviewTargets(
  vacancy: VacancyV2,
  blockResults: BlockRuntimeResult[],
  reviewContext: ApplicationEvaluationReviewContext,
): AssessmentReviewTarget[] {
  const prepared = prepareApplicationEvaluation(
    vacancy,
    blockResults,
    reviewContext,
  );
  const blockPlans = new Map(
    prepared.blueprint.blocks.map((block) => [block.blockId, block]),
  );
  const targets = new Map<string, AssessmentReviewTarget>();
  for (const item of prepared.items) {
    if (!item.reviewBinding || !item.reviewResolution) continue;
    const targetId = assessmentReviewBindingHash(item.reviewBinding);
    if (targets.has(targetId)) continue;
    const block = sourceBlock(vacancy, item.blockId);
    const runtimeResult = prepared.blockResults.find(
      (result) => result.blockId === item.blockId,
    );
    const evidenceReceipts = reviewEvidenceReceipts(
      block,
      runtimeResult,
      item.reviewBinding.kind,
      item.sourceItemId,
    );
    const unavailableReason =
      evidenceReceipts.length > 0
        ? null
        : trustedReviewUnavailableReason(
            block,
            item.reviewBinding.kind,
          );
    const blockPlan = blockPlans.get(item.blockId);
    if (!blockPlan) {
      throw new Error(
        `Frozen review target "${targetId}" has no block policy.`,
      );
    }
    targets.set(targetId, {
      targetId,
      binding: item.reviewBinding,
      blockKind: block.kind,
      blockTitle: block.title,
      label: item.label,
      attributeName:
        item.reviewBinding.attributeId === null
          ? null
          : item.attributeName,
      bars:
        item.reviewBinding.kind === "manual_bars"
          ? item.bars
          : null,
      requiredReviews:
        blockPlan.review.minimumIndependentReviews,
      independentBeforeDiscussion:
        blockPlan.review.independentBeforeDiscussion,
      blindReviewRequired: blockPlan.review.blindReviewRequired,
      reviewable: evidenceReceipts.length > 0,
      unavailableReason,
      evidenceReceipts,
      status: item.reviewResolution.status,
      activeReviews: item.reviewResolution.activeReviews,
    });
  }
  return [...targets.values()].sort(
    (left, right) =>
      (blockPlans.get(left.binding.blockId)?.order ?? 0) -
        (blockPlans.get(right.binding.blockId)?.order ?? 0) ||
      left.label.localeCompare(right.label) ||
      left.targetId.localeCompare(right.targetId),
  );
}

function artifactReceipt(
  blockId: string,
  value: unknown,
  label: string,
): AssessmentReviewEvidenceReceipt | null {
  if (!isRecord(value)) return null;
  const uploadId = nonEmptyString(value.uploadId);
  if (
    !uploadId ||
    nonEmptyString(value.fileName) === null ||
    nonEmptyString(value.mimeType) === null ||
    typeof value.sizeBytes !== "number" ||
    !Number.isFinite(value.sizeBytes) ||
    value.sizeBytes <= 0
  ) {
    return null;
  }
  return {
    locator: `artifact:${blockId}:${uploadId}`,
    source: "submitted_artifact",
    observedBy: "named_reviewer",
    label,
  };
}

function reviewEvidenceReceipts(
  block: PipelineBlock,
  result: BlockRuntimeResult | undefined,
  kind: AssessmentReviewBinding["kind"],
  sourceItemId?: string,
): AssessmentReviewEvidenceReceipt[] {
  if (kind === "gate_waiver") {
    return [
      {
        locator: `gate:${block.id}`,
        source: "frozen_gate",
        observedBy: "named_reviewer",
        label: "Exact frozen gate and recorded outcome",
      },
    ];
  }
  if (
    kind === "manual_bars" &&
    result &&
    sourceItemId &&
    block.settings.kind === "reference_check"
  ) {
    const responses = [
      ...(result.serverEvidence?.referenceResponses ?? []),
    ].filter(
      (receipt) =>
        receipt.sourceItemIds.includes(sourceItemId) &&
        /^[0-9a-f]{64}$/u.test(receipt.questionnaireHash) &&
        /^[0-9a-f]{64}$/u.test(receipt.responseHash) &&
        receipt.receiptId.length > 0 &&
        receipt.receiptId.length <= 100,
    );
    if (
      new Set(
        responses.map((receipt) => receipt.refereeOrdinal),
      ).size < block.settings.referees.count
    ) {
      return [];
    }
    return responses.map((receipt, index) => ({
      locator: `reference-response:${receipt.receiptId}:${sourceItemId}`,
      source: "external_questionnaire",
      observedBy: "external_participant",
      label: `Structured referee response ${index + 1} of ${responses.length}`,
    }));
  }
  if (
    kind === "verification" &&
    result &&
    block.settings.kind === "doc_verification"
  ) {
    if (block.settings.mode === "auto_extract_match") {
      if (!sourceItemId) return [];
      return (result.serverEvidence?.documentVerifications ?? [])
        .filter(
          (receipt) =>
            receipt.sourceItemIds.includes(sourceItemId) &&
            /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(
              receipt.receiptId,
            ) &&
            /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(
              receipt.providerId,
            ) &&
            receipt.providerVersion.length > 0 &&
            receipt.providerVersion.length <= 100 &&
            /^[0-9a-f]{64}$/u.test(receipt.responseHash) &&
            Number.isFinite(Date.parse(receipt.verifiedAt)),
        )
        .map((receipt, index) => ({
          locator:
            `document-provider:${receipt.receiptId}:` +
            sourceItemId,
          source: "validated_provider_report" as const,
          observedBy: "validated_provider" as const,
          label: `Connected provider result ${index + 1}`,
        }));
    }
    const documents = asRecord(asRecord(result.payload).documents);
    return block.settings.requiredDocuments.flatMap((document) => {
      if (document.id !== sourceItemId) return [];
      const receipt = artifactReceipt(
        block.id,
        documents[document.id],
        `Submitted content for requirement review · ${document.label}`,
      );
      return receipt ? [receipt] : [];
    });
  }
  if (kind !== "manual_bars" || !result) return [];
  const payload = asRecord(result.payload);
  const receipts: AssessmentReviewEvidenceReceipt[] = [];
  const addText = (value: unknown, locator: string, label: string) => {
    if (nonEmptyString(value) === null) return;
    receipts.push({
      locator,
      source: "submitted_text",
      observedBy: "named_reviewer",
      label,
    });
  };
  if (block.settings.kind === "work_sample") {
    asArray(payload.deliverables).forEach((candidate, index) => {
      const deliverable = asRecord(candidate);
      addText(
        deliverable.text,
        `submission:${block.id}:deliverables:${index}:text`,
        `Submitted work-sample text ${index + 1}`,
      );
      const artifact = artifactReceipt(
        block.id,
        deliverable.asset,
        `Submitted work-sample artifact ${index + 1}`,
      );
      if (artifact) receipts.push(artifact);
    });
  } else if (block.settings.kind === "coding") {
    addText(
      payload.code,
      `submission:${block.id}:code`,
      "Submitted source code",
    );
    addText(
      payload.notes,
      `submission:${block.id}:notes`,
      "Candidate implementation notes",
    );
  } else if (block.settings.kind === "case_exercise") {
    addText(
      payload.responseText,
      `submission:${block.id}:responseText`,
      "Submitted case response",
    );
    asArray(payload.files).forEach((candidate, index) => {
      const artifact = artifactReceipt(
        block.id,
        candidate,
        `Submitted case artifact ${index + 1}`,
      );
      if (artifact) receipts.push(artifact);
    });
  } else if (block.settings.kind === "custom") {
    addText(
      payload.text,
      `submission:${block.id}:text`,
      "Submitted custom-assessment text",
    );
    asArray(payload.files).forEach((candidate, index) => {
      const artifact = artifactReceipt(
        block.id,
        candidate,
        `Submitted custom-assessment artifact ${index + 1}`,
      );
      if (artifact) receipts.push(artifact);
    });
  } else if (block.settings.kind === "human_stage") {
    asArray(payload.observations).forEach((candidate, index) => {
      const observation = asRecord(candidate);
      const observationId = nonEmptyString(observation.observationId);
      const notes = nonEmptyString(observation.notes);
      const observerUserId = nonEmptyString(observation.observerUserId);
      const observedAt = nonEmptyString(observation.observedAt);
      if (!observationId || !notes || !observerUserId || !observedAt) {
        return;
      }
      receipts.push({
        locator: `observation:${block.id}:${observationId}`,
        source: "live_observation",
        observedBy: "named_reviewer",
        label: `Structured human-stage observation ${index + 1}`,
      });
    });
  }
  return [...new Map(receipts.map((receipt) => [receipt.locator, receipt])).values()];
}

function trustedReviewUnavailableReason(
  block: PipelineBlock,
  kind: AssessmentReviewBinding["kind"],
): string {
  if (block.settings.kind === "reference_check") {
    return "Awaiting a server-owned reference questionnaire response. Candidate-supplied referee contacts are not evidence.";
  }
  if (
    block.settings.kind === "doc_verification" &&
    block.settings.mode === "auto_extract_match"
  ) {
    return "Awaiting a connected provider result. A candidate upload alone does not establish document authenticity.";
  }
  if (
    block.settings.kind === "doc_verification" &&
    block.settings.mode === "manual_document_review"
  ) {
    return "Awaiting the submitted document. A named reviewer may assess its contents against the published requirement, but not claim external authenticity.";
  }
  if (kind === "verification") {
    return "Awaiting a connected document/provider verification receipt. A reviewer cannot self-attest external verification.";
  }
  if (
    [
      "cognitive",
      "personality",
      "integrity_test",
      "language_test",
      "sjt",
    ].includes(block.kind)
  ) {
    return "Awaiting a server-owned result from the exact validated instrument version.";
  }
  if (block.kind === "human_stage") {
    return "Awaiting a server-owned interview/observation receipt.";
  }
  return "No server-verified submitted text or artifact is bound to this target.";
}

export function buildGateWaiverReviewBinding(
  vacancy: VacancyV2,
  context: Pick<
    ApplicationEvaluationReviewContext,
    "organizationId" | "applicationId"
  >,
  blockId: string,
): AssessmentReviewBinding {
  const block = sourceBlock(vacancy, blockId);
  const effectiveGate = effectiveFrozenGate(block);
  if (!effectiveGate) {
    throw new Error(
      `Block "${blockId}" has no frozen gate to adjudicate.`,
    );
  }
  return {
    organizationId: context.organizationId,
    applicationId: context.applicationId,
    vacancyId: vacancy.id,
    vacancyVersion: vacancy.configVersion,
    blockId,
    sourceItemId: "gate",
    attributeId: null,
    kind: "gate_waiver",
    rubricHash: assessmentReviewRubricHash({
      topology: vacancy.scoring.topology,
      gate: effectiveGate,
      knockoutItems:
        block.settings.kind === "knockout"
          ? block.settings.items.filter((item) => item.mustHaveId)
          : [],
    }),
  };
}

function effectiveFrozenGate(
  block: PipelineBlock,
): {
  minBlockScore?: number;
  mustHaveIds: string[];
} | null {
  const implicitKnockoutMustHaves =
    block.settings.kind === "knockout"
      ? block.settings.items.flatMap((item) =>
          item.mustHaveId ? [item.mustHaveId] : [],
        )
      : [];
  const mustHaveIds = [
    ...new Set([
      ...(block.gate?.mustHaveIds ?? []),
      ...implicitKnockoutMustHaves,
    ]),
  ];
  if (
    block.gate?.minBlockScore === undefined &&
    mustHaveIds.length === 0
  ) {
    return null;
  }
  return {
    ...(block.gate?.minBlockScore !== undefined
      ? { minBlockScore: block.gate.minBlockScore }
      : {}),
    mustHaveIds,
  };
}

export function buildGateWaiverReviewTargets(
  vacancy: VacancyV2,
  evaluation: Pick<CandidateEvaluation, "gateResults"> | undefined,
  reviewContext: ApplicationEvaluationReviewContext,
): AssessmentReviewTarget[] {
  if (!evaluation?.gateResults) return [];
  const blueprint = compileAssessmentBlueprint(vacancy);
  const blockPlans = new Map(
    blueprint.blocks.map((block) => [block.blockId, block]),
  );
  return evaluation.gateResults
    .filter(
      (gate) =>
        gate.configured &&
        gate.status === "failed",
    )
    .map((gate) => {
      const binding = buildGateWaiverReviewBinding(
        vacancy,
        reviewContext,
        gate.blockId,
      );
      const blockPlan = blockPlans.get(gate.blockId);
      if (!blockPlan) {
        throw new Error(
          `Frozen failed gate "${gate.blockId}" has no review policy.`,
        );
      }
      const resolution = resolveAssessmentReview(
        reviewContext.reviews,
        binding,
        blockPlan.review.minimumIndependentReviews,
      );
      return {
        targetId: assessmentReviewBindingHash(binding),
        binding,
        blockKind: sourceBlock(vacancy, gate.blockId).kind,
        blockTitle: gate.blockTitle,
        label: "Failed frozen gate adjudication",
        attributeName: null,
        bars: null,
        requiredReviews:
          blockPlan.review.minimumIndependentReviews,
        independentBeforeDiscussion:
          blockPlan.review.independentBeforeDiscussion,
        blindReviewRequired: blockPlan.review.blindReviewRequired,
        reviewable: true,
        unavailableReason: null,
        evidenceReceipts: reviewEvidenceReceipts(
          sourceBlock(vacancy, gate.blockId),
          undefined,
          "gate_waiver",
        ),
        status: resolution.status,
        activeReviews: resolution.activeReviews,
      };
    })
    .sort(
      (left, right) =>
        (blockPlans.get(left.binding.blockId)?.order ?? 0) -
          (blockPlans.get(right.binding.blockId)?.order ?? 0) ||
        left.targetId.localeCompare(right.targetId),
    );
}

/**
 * Redacts independent review content on the server before it reaches a client.
 * A reviewer sees their own active submission immediately. Peer content is
 * revealed only after they have submitted independently, or after the target
 * has entered a governed resolved/conflict state.
 */
export function assessmentReviewTargetViews(
  targets: readonly AssessmentReviewTarget[],
  currentReviewerId: string,
): AssessmentReviewTargetView[] {
  return targets.map((target) => {
    const currentReviewerSubmitted = target.activeReviews.some(
      (review) => review.reviewerUserId === currentReviewerId,
    );
    const detailsVisible =
      !target.independentBeforeDiscussion ||
      currentReviewerSubmitted ||
      target.status !== "pending";
    return {
      ...target,
      detailsVisible,
      activeReviews: target.activeReviews.map((review) => {
        const ownReview =
          review.reviewerUserId === currentReviewerId;
        const reveal = detailsVisible || ownReview;
        return {
          id: review.id,
          reviewerUserId: review.reviewerUserId,
          reviewerRole: review.reviewerRole,
          createdAt: review.createdAt,
          supersedesReviewId: review.supersedesReviewId,
          level: reveal ? review.level : null,
          verificationOutcome: reveal
            ? review.verificationOutcome
            : null,
          gateWaiverOutcome: reveal
            ? review.gateWaiverOutcome
            : null,
          evidence: reveal ? review.evidence : null,
          rationale: reveal ? review.rationale : null,
        };
      }),
    };
  });
}

function evidenceChip(
  passage: ApplicationEvaluationPassage,
  blockId: string,
  id: string,
): EvidenceChip {
  return {
    id,
    quote: passage.text.slice(0, 1_200),
    locator: passage.locator,
    blockId,
    question: passage.question,
  };
}

function validAiOutput(
  item: PreparedEvaluationItem,
  output: ApplicationEvidenceEvaluationOutput["items"][number],
): boolean {
  return (
    output.evaluationItemId === item.evaluationItemId &&
    output.blockId === item.blockId &&
    output.sourceItemId === item.sourceItemId &&
    output.attributeId === item.attributeId
  );
}

function confidenceRank(value: ConfidenceBand): number {
  return value === "High" ? 3 : value === "Medium" ? 2 : 1;
}

function aggregateScores(
  scores: { score: number; weight: number; confidence: ConfidenceBand }[],
  rule: AssessmentBlueprint["scoringPolicy"]["aggregation"],
): number {
  if (scores.length === 0) return 0;
  if (rule === "conservative_floor") {
    return Math.min(...scores.map((score) => score.score));
  }
  if (rule === "highest_quality_source") {
    return [...scores].sort(
      (left, right) =>
        confidenceRank(right.confidence) - confidenceRank(left.confidence) ||
        right.weight - left.weight,
    )[0].score;
  }
  const total = scores.reduce(
    (sum, score) => sum + Math.max(0.0001, score.weight),
    0,
  );
  return clamp100(
    scores.reduce(
      (sum, score) =>
        sum + score.score * Math.max(0.0001, score.weight),
      0,
    ) / total,
  );
}

function filteredIntegrity(
  result: BlockRuntimeResult | undefined,
): IntegritySignal[] {
  return sanitizeIntegritySignals(result?.integrityEvents);
}

export function finalizeApplicationEvaluation(
  vacancy: VacancyV2,
  prepared: PreparedApplicationEvaluation,
  aiOutput: ApplicationEvidenceEvaluationOutput,
  engine: EngineStamp,
): CandidateEvaluation {
  const aiItems = prepared.items.filter((item) => item.mode === "ai");
  const outputIds = aiOutput.items.map((item) => item.evaluationItemId);
  const expectedIds = aiItems.map((item) => item.evaluationItemId);
  if (
    outputIds.length !== expectedIds.length ||
    new Set(outputIds).size !== outputIds.length ||
    outputIds.some((id) => !expectedIds.includes(id)) ||
    expectedIds.some((id) => !outputIds.includes(id))
  ) {
    throw new Error(
      "The AI provider returned an invalid multi-block evidence item set; no partial evaluation was saved.",
    );
  }
  const outputById = new Map(
    aiOutput.items.map((item) => [item.evaluationItemId, item]),
  );
  let chipNumber = 0;
  const finalized: FinalizedItem[] = [];

  for (const item of prepared.items) {
    if (
      item.mode !== "ai" &&
      item.mode !== "deterministic" &&
      item.mode !== "human"
    ) {
      continue;
    }
    if (item.mode === "deterministic") {
      const keyedScore = clamp100(item.deterministicScore ?? 0);
      const level = levelForScore(keyedScore);
      const score = LEVEL_SCORE[level];
      const chips = item.passages.map((candidate) =>
        evidenceChip(candidate, item.blockId, `E-${++chipNumber}`),
      );
      const reason =
        item.deterministicReason ??
        "Server applied the exact frozen answer key.";
      finalized.push({
        prepared: item,
        supportingPassageIds: item.passages.map(
          (candidate) => candidate.passageId,
        ),
        contradictoryPassageIds: [],
        itemScore: {
          itemId: item.evaluationItemId,
          itemLabel: item.label,
          attributeId: item.attributeId,
          level,
          score,
          evidence: chips,
          drivers: [
            {
              text: reason,
              impact: Math.max(0.01, item.normalizedWeight),
              direction: score >= 60 ? "pos" : "neg",
            },
          ],
          confidence: "High",
          confidenceReason:
            `${reason} The keyed result (${keyedScore}/100) maps mechanically to published BARS level ${level}; a human still reviews its job relevance.`,
          abstained: false,
        },
      });
      continue;
    }
    if (item.mode === "human") {
      const resolution = item.reviewResolution;
      if (
        !resolution ||
        resolution.status !== "resolved" ||
        resolution.level === null
      ) {
        throw new Error(
          `Trusted human review for "${item.evaluationItemId}" did not resolve to a frozen BARS level.`,
        );
      }
      const level = resolution.level;
      const reviewEvidence = resolution.activeReviews.map((review) => ({
        id: `E-${++chipNumber}`,
        quote: review.evidence.summary.slice(0, 1_200),
        locator:
          `trusted-review:${review.id}:` +
          review.evidence.locator,
        blockId: item.blockId,
        question: item.label,
      }));
      const supportingIds = resolution.activeReviews.map(
        (review) => `trusted-review:${review.id}`,
      );
      const score = LEVEL_SCORE[level];
      const independentReviewCount = new Set(
        resolution.activeReviews.map(
          (review) => review.reviewerUserId,
        ),
      ).size;
      finalized.push({
        prepared: item,
        supportingPassageIds: supportingIds,
        contradictoryPassageIds: [],
        itemScore: {
          itemId: item.evaluationItemId,
          itemLabel: item.label,
          attributeId: item.attributeId,
          level,
          score,
          evidence: reviewEvidence,
          drivers: [
            {
              text:
                `${independentReviewCount} named reviewer(s) independently resolved the exact frozen BARS level ${level}.`,
              impact: Math.max(0.01, item.normalizedWeight),
              direction: level >= 3 ? "pos" : "neg",
            },
          ],
          confidence:
            independentReviewCount >= 2 ? "High" : "Medium",
          confidenceReason:
            `Trusted immutable review records reached consensus on exact published BARS level ${level}. The rating is bound to the frozen vacancy, block, item, attribute, and rubric hash.`,
          abstained: false,
        },
      });
      continue;
    }

    const output = outputById.get(item.evaluationItemId);
    if (!output || !validAiOutput(item, output)) {
      throw new Error(
        `The AI provider returned an invalid binding for "${item.evaluationItemId}".`,
      );
    }
    const passages = new Map(
      item.passages.map((candidate) => [candidate.passageId, candidate]),
    );
    const references = [
      ...new Map(
        output.evidence.map((reference) => [
          reference.passageId,
          reference,
        ]),
      ).values(),
    ];
    const invalidReference = references.some(
      (reference) => !passages.has(reference.passageId),
    );
    const supporting = references
      .filter((reference) => reference.relation === "supports")
      .map((reference) => reference.passageId)
      .filter((id) => passages.has(id));
    const contradictory = references
      .filter((reference) => reference.relation === "contradicts")
      .map((reference) => reference.passageId)
      .filter((id) => passages.has(id));
    const contractValid =
      output.disposition === "scored"
        ? output.level !== null && output.abstainReason === null
        : output.level === null &&
          output.abstainReason !== null &&
          output.confidence === "Low";
    const abstained =
      !contractValid ||
      invalidReference ||
      output.disposition === "abstained" ||
      supporting.length === 0 ||
      (contradictory.length > 0 &&
        prepared.blueprint.scoringPolicy.contradictoryEvidence ===
          "flag_human");
    const level = (output.level ?? 1) as EvaluationLevel;
    const chips = references.flatMap((reference) => {
      const candidate = passages.get(reference.passageId);
      return candidate
        ? [evidenceChip(candidate, item.blockId, `E-${++chipNumber}`)]
        : [];
    });
    const abstainReason = invalidReference
      ? "unverifiable"
      : contradictory.length > 0
        ? "contradictory"
        : supporting.length === 0
          ? "insufficient"
          : output.abstainReason ?? "insufficient";
    const score = abstained ? 0 : LEVEL_SCORE[level];
    finalized.push({
      prepared: item,
      supportingPassageIds: supporting,
      contradictoryPassageIds: contradictory,
      itemScore: {
        itemId: item.evaluationItemId,
        itemLabel: item.label,
        attributeId: item.attributeId,
        level,
        score,
        evidence: chips,
        drivers: abstained
          ? []
          : [
              {
                text: output.rationale,
                impact: Math.max(0.01, item.normalizedWeight),
                direction: level >= 3 ? "pos" : "neg",
              },
            ],
        confidence: abstained ? "Low" : output.confidence,
        confidenceReason: abstained
          ? `Not scored (${abstainReason}); missing evidence is not a low performance score.`
          : `Server-validated passages support exact published BARS level ${level}; a named human must adjudicate the draft.`,
        abstained,
      },
    });
  }

  const finalizedByBlock = new Map<string, FinalizedItem[]>();
  for (const item of finalized) {
    const values = finalizedByBlock.get(item.prepared.blockId) ?? [];
    values.push(item);
    finalizedByBlock.set(item.prepared.blockId, values);
  }
  const runtimeByBlock = new Map(
    prepared.blockResults.map((result) => [result.blockId, result]),
  );
  const perBlock: BlockResult[] = prepared.blueprint.blocks.map((blockPlan) => {
    const block = sourceBlock(vacancy, blockPlan.blockId);
    const values = finalizedByBlock.get(block.id) ?? [];
    const scoredValues = values.filter(
      (value) => !value.itemScore.abstained,
    );
    const scores = scoredValues.map((value) => value.itemScore);
    const scoredWeight = scoredValues.reduce(
      (sum, value) =>
        sum + Math.max(0, value.prepared.normalizedWeight),
      0,
    );
    const blockScore =
      scores.length === 0
        ? 0
        : scoredWeight > 0
          ? clamp100(
              scoredValues.reduce(
                (sum, value) =>
                  sum +
                  value.itemScore.score *
                    Math.max(0, value.prepared.normalizedWeight),
                0,
              ) / scoredWeight,
            )
          : clamp100(
              scores.reduce((sum, score) => sum + score.score, 0) /
                scores.length,
            );
    const pending = prepared.items.filter(
      (item) =>
        item.blockId === block.id &&
        (item.mode === "manual_pending" ||
          item.mode === "verification_pending"),
    );
    const abstained = values.filter(
      (value) => value.itemScore.abstained,
    ).length;
    const confidence: ConfidenceBand =
      pending.length > 0 || abstained > 0 || scores.length === 0
        ? "Low"
        : scores.every((score) => score.confidence === "High")
          ? "High"
          : "Medium";
    const itemScores = values.map((value) => value.itemScore);
    const evidence = itemScores.flatMap((score) => score.evidence);
    return {
      blockId: block.id,
      itemScores,
      blockScore,
      confidence,
      confidenceReason:
        pending.length > 0
          ? `${pending.length} manual or verification evidence unit(s) remain pending; no performance score was synthesized for them.`
          : abstained > 0
            ? `${abstained} item(s) abstained because the frozen rubric lacked sufficient evidence.`
            : scores.length > 0
              ? "Every provisional score is bound to a frozen key or server-validated passage; human review remains required."
              : "This block is informational and produced no performance score.",
      drivers: itemScores.flatMap((score) => score.drivers).slice(0, 5),
      evidence,
      reasoning: [
        {
          step: 1,
          text: "Loaded the exact frozen block, evidence plan, answer keys, and BARS.",
        },
        {
          step: 2,
          text: "Applied deterministic keys server-side and limited AI review to submitted job-related text or code.",
        },
        {
          step: 3,
          text: "Excluded verification, manual, unavailable, and abstained evidence from the performance score.",
        },
      ],
      integrity: filteredIntegrity(runtimeByBlock.get(block.id)),
      engine,
    };
  });
  const blockResultById = new Map(
    perBlock.map((result) => [result.blockId, result]),
  );
  const gateResults: EvaluationGateResult[] =
    prepared.blueprint.blocks.map((blockPlan) => {
      const block = sourceBlock(vacancy, blockPlan.blockId);
      const effectiveGate = effectiveFrozenGate(block);
      if (!effectiveGate) {
        return {
          blockId: block.id,
          blockTitle: block.title,
          topology: vacancy.scoring.topology,
          configured: false,
          status: "not_applicable",
          minimumBlockScore: null,
          actualBlockScore: null,
          mustHaveIds: [],
          failedMustHaveIds: [],
          pendingMustHaveIds: [],
          requiresAdjudication: false,
          reason: "No frozen hurdle is configured for this block.",
          waiver: { outcome: "none", reviewIds: [] },
        };
      }
      const blockResult = blockResultById.get(block.id);
      const hasScore = Boolean(
        blockResult?.itemScores.some((item) => !item.abstained),
      );
      const actualBlockScore =
        block.scored && hasScore
          ? blockResult?.blockScore ?? null
          : null;
      const mustHaveIds = effectiveGate.mustHaveIds;
      const failedMustHaveIds = mustHaveIds.filter(
        (id) =>
          prepared.mustHaveResults.find((result) => result.id === id)
            ?.passed === false,
      );
      const pendingMustHaveIds = mustHaveIds.filter(
        (id) =>
          !prepared.mustHaveResults.some((result) => result.id === id),
      );
      const scorePending =
        effectiveGate.minBlockScore !== undefined &&
        actualBlockScore === null;
      const scoreFailed =
        effectiveGate.minBlockScore !== undefined &&
        actualBlockScore !== null &&
        actualBlockScore < effectiveGate.minBlockScore;
      const status: EvaluationGateResult["status"] =
        scoreFailed || failedMustHaveIds.length > 0
          ? "failed"
          : scorePending || pendingMustHaveIds.length > 0
            ? "pending"
            : "passed";
      const waiverBinding =
        status === "failed" && prepared.reviewContext
          ? buildGateWaiverReviewBinding(
              vacancy,
              prepared.reviewContext,
              block.id,
            )
          : null;
      const waiverResolution = waiverBinding
        ? resolveAssessmentReview(
            prepared.reviewContext?.reviews ?? [],
            waiverBinding,
            blockPlan.review.minimumIndependentReviews,
          )
        : null;
      const waiverOutcome =
        waiverResolution?.status === "conflict"
          ? "conflict"
          : waiverResolution?.status === "resolved" &&
              waiverResolution.gateWaiverOutcome
            ? waiverResolution.gateWaiverOutcome
            : "none";
      const reviewIds =
        waiverResolution?.activeReviews.map((review) => review.id) ?? [];
      const reasons = [
        ...(scoreFailed
          ? [
              `Block score ${actualBlockScore} is below the frozen floor ${effectiveGate.minBlockScore}.`,
            ]
          : scorePending
            ? ["The frozen block-score floor cannot be evaluated yet."]
            : []),
        ...(failedMustHaveIds.length > 0
          ? [
              `Failed must-have(s): ${failedMustHaveIds.join(", ")}.`,
            ]
          : []),
        ...(pendingMustHaveIds.length > 0
          ? [
              `Pending must-have(s): ${pendingMustHaveIds.join(", ")}.`,
            ]
          : []),
      ];
      return {
        blockId: block.id,
        blockTitle: block.title,
        topology: vacancy.scoring.topology,
        configured: true,
        status,
        minimumBlockScore: effectiveGate.minBlockScore ?? null,
        actualBlockScore,
        mustHaveIds,
        failedMustHaveIds,
        pendingMustHaveIds,
        requiresAdjudication:
          status === "pending" ||
          (status === "failed" && waiverOutcome !== "waived"),
        reason:
          reasons.join(" ") ||
          "Every frozen hurdle condition passed.",
        waiver: {
          outcome: waiverOutcome,
          reviewIds,
        },
      };
    });

  const finalizedByAttribute = new Map<string, FinalizedItem[]>();
  for (const item of finalized) {
    const values =
      finalizedByAttribute.get(item.prepared.attributeId) ?? [];
    values.push(item);
    finalizedByAttribute.set(item.prepared.attributeId, values);
  }
  const attributeScores: CompetencyScore[] = [];
  const scoredForOverall: {
    attributeId: string;
    categoryId: string;
    score: number;
    weight: number;
  }[] = [];
  const attributePlans = new Map(
    prepared.blueprint.attributes.map((attribute) => [
      attribute.attributeId,
      attribute,
    ]),
  );
  const totalAttributeWeight = prepared.blueprint.attributes.reduce(
    (sum, attribute) => sum + attribute.globalWeight,
    0,
  );

  for (const category of vacancy.categories) {
    for (const attribute of category.attributes) {
      const plan = attributePlans.get(attribute.id);
      if (!plan) {
        throw new Error(
          `Frozen evaluation plan omitted attribute "${attribute.id}".`,
        );
      }
      const values = finalizedByAttribute.get(attribute.id) ?? [];
      const scored = values.filter((value) => !value.itemScore.abstained);
      const effectiveEvidenceWeight = (value: FinalizedItem): number => {
        const blockPlan = prepared.blueprint.blocks.find(
          (candidate) =>
            candidate.blockId === value.prepared.blockId,
        );
        const measure = blockPlan?.measures.find(
          (candidate) => candidate.attributeId === attribute.id,
        );
        if (!blockPlan || !measure || measure.compositeWeight <= 0) {
          return 0;
        }
        const withinSourceWeight = blockPlan.items
          .filter(
            (item) =>
              item.eligibleForScoring &&
              item.attributeIds.includes(attribute.id),
          )
          .reduce(
            (sum, item) =>
              sum + Math.max(0, item.normalizedWeight),
            0,
          );
        if (withinSourceWeight <= 0) return 0;
        return (
          measure.compositeWeight *
          (Math.max(0, value.prepared.normalizedWeight) /
            withinSourceWeight)
        );
      };
      const evidenceCount = new Set(
        scored.flatMap((value) => value.supportingPassageIds),
      ).size;
      const sourceCount = new Set(
        scored.map((value) => value.prepared.blockId),
      ).size;
      const hasContradiction = values.some(
        (value) => value.contradictoryPassageIds.length > 0,
      );
      const minimumEvidence = Math.max(
        prepared.blueprint.scoringPolicy.minimumEvidencePerAttribute,
        plan.minimumCoverage.evidenceItems,
      );
      const minimumSources = plan.minimumCoverage.independentSources;
      const enough =
        scored.length > 0 &&
        evidenceCount >= minimumEvidence &&
        sourceCount >= minimumSources &&
        !(
          hasContradiction &&
          prepared.blueprint.scoringPolicy.contradictoryEvidence ===
            "flag_human"
        );
      const score = enough
        ? aggregateScores(
            scored.map((value) => ({
              score: value.itemScore.score,
              // A source's frozen allocation and the item's allocation within
              // that source both matter. Using only item.normalizedWeight
              // would silently turn, for example, an 80/20 cross-block plan
              // into an approximately equal-weight average.
              weight: effectiveEvidenceWeight(value),
              confidence: value.itemScore.confidence,
            })),
            prepared.blueprint.scoringPolicy.aggregation,
          )
        : 0;
      const confidence: ConfidenceBand = !enough
        ? "Low"
        : scored.every(
              (value) => value.itemScore.confidence === "High",
            )
          ? "High"
          : "Medium";
      const chips = scored.flatMap((value) => value.itemScore.evidence);
      const drivers = scored
        .flatMap((value) => value.itemScore.drivers)
        .sort((left, right) => right.impact - left.impact)
        .slice(0, 3);
      if (enough) {
        scoredForOverall.push({
          attributeId: attribute.id,
          categoryId: category.id,
          score,
          weight: plan.globalWeight,
        });
      }
      attributeScores.push({
        id: attribute.id,
        name: attribute.name,
        score,
        weight: plan.globalWeight,
        drivers,
        confidence,
        confidenceReason: enough
          ? `${evidenceCount} validated evidence passage(s) across ${sourceCount} independent block source(s) support the frozen BARS.`
          : `Not scored: ${evidenceCount}/${minimumEvidence} required evidence passage(s) and ${sourceCount}/${minimumSources} independent source(s) are available. Missing evidence is not a low score.`,
        evidence: chips.map((chip) => ({
          quote: chip.quote,
          timestamp: chip.locator,
          question: chip.question ?? "",
        })),
        trace: enough
          ? [
              "Resolved evidence against the exact frozen vacancy version.",
              "Combined only server-keyed or passage-backed item ratings.",
              "Queued the provisional result for named human adjudication.",
            ]
          : [
              "Resolved evidence against the exact frozen vacancy version.",
              "Excluded manual, verification, missing, and invalid evidence from scoring.",
              "Abstained and routed the criterion for named human adjudication.",
            ],
        abstained: !enough,
      });
    }
  }

  const scoredWeight = scoredForOverall.reduce(
    (sum, item) => sum + item.weight,
    0,
  );
  const overall =
    scoredWeight > 0
      ? clamp100(
          scoredForOverall.reduce(
            (sum, item) => sum + item.score * item.weight,
            0,
          ) / scoredWeight,
        )
      : 0;
  const categoryScores = vacancy.categories.map((category) => {
    const values = scoredForOverall.filter(
      (item) => item.categoryId === category.id,
    );
    const weight = values.reduce((sum, item) => sum + item.weight, 0);
    return {
      categoryId: category.id,
      score:
        weight > 0
          ? clamp100(
              values.reduce(
                (sum, item) => sum + item.score * item.weight,
                0,
              ) / weight,
            )
          : 0,
    };
  });
  const coverage =
    totalAttributeWeight > 0
      ? Math.round((scoredWeight / totalAttributeWeight) * 10_000) / 100
      : 0;
  const requiredAttributesComplete = prepared.blueprint.attributes
    .filter((attribute) => attribute.requiredForCompleteEvaluation)
    .every(
      (attribute) =>
        attributeScores.find((score) => score.id === attribute.attributeId)
          ?.abstained === false,
    );
  const pendingGateResults = gateResults.filter(
    (gate) => gate.status === "pending",
  );
  const unwaivedGateFailures = gateResults.filter(
    (gate) =>
      gate.status === "failed" &&
      gate.waiver.outcome !== "waived",
  );
  const complete =
    requiredAttributesComplete &&
    coverage >= prepared.blueprint.scoringPolicy.minimumCoveragePct &&
    prepared.pendingRequiredBlockIds.length === 0 &&
    pendingGateResults.length === 0;
  const confidence: ConfidenceBand = !complete
    ? "Low"
    : attributeScores
          .filter((attribute) => !attribute.abstained)
          .every((attribute) => attribute.confidence === "High")
      ? "High"
      : "Medium";
  const substantiveTier =
    unwaivedGateFailures.length > 0
      ? "Bottom"
      : overall >= vacancy.scoring.threshold + 10
      ? "Top"
      : overall >= vacancy.scoring.threshold
        ? "Mid"
        : "Bottom";
  const tier =
    complete ||
    prepared.blueprint.scoringPolicy.incompleteEvaluationGetsTier
      ? substantiveTier
      : null;
  const strengths = attributeScores
    .filter(
      (attribute) => !attribute.abstained && attribute.score >= 75,
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(
      (attribute) =>
        `${attribute.name}: ${attribute.drivers[0]?.text ?? "Strong frozen-rubric evidence."}`,
    );
  const risks = [
    ...attributeScores
      .filter(
        (attribute) => !attribute.abstained && attribute.score <= 40,
      )
      .slice(0, 3)
      .map(
        (attribute) =>
          `${attribute.name}: ${attribute.drivers[0]?.text ?? "Evidence supports a lower published anchor."}`,
      ),
    ...attributeScores
      .filter((attribute) => attribute.abstained)
      .slice(0, 4)
      .map(
        (attribute) =>
          `${attribute.name}: evidence is incomplete; do not interpret this as low ability.`,
      ),
    ...unwaivedGateFailures.map(
      (gate) =>
        `${gate.blockTitle}: frozen hurdle failed and requires governed adjudication. ${gate.reason}`,
    ),
  ].slice(0, 5);
  const contradictions = finalized
    .filter((item) => item.contradictoryPassageIds.length > 0)
    .slice(0, 10)
    .map((item) => {
      const byId = new Map(
        item.prepared.passages.map((candidate) => [
          candidate.passageId,
          candidate,
        ]),
      );
      const supporting = byId.get(item.supportingPassageIds[0] ?? "");
      const contradictory = byId.get(
        item.contradictoryPassageIds[0] ?? "",
      );
      return {
        claim: `${item.prepared.attributeName}: conflicting submitted evidence requires review.`,
        sourceA: supporting?.text.slice(0, 500) ?? "No supporting passage.",
        sourceB:
          contradictory?.text.slice(0, 500) ??
          "Contradictory passage was not resolvable.",
        severity: "review" as const,
      };
    });
  const verificationItems = prepared.items.filter(
    (item) => item.reviewBinding?.kind === "verification",
  );
  const verificationStatuses = new Map<
    string,
    ClaimRecord["status"]
  >();
  for (const item of verificationItems) {
    const key = `${item.blockId}::${item.sourceItemId}`;
    const siblings = verificationItems.filter(
      (candidate) =>
        candidate.blockId === item.blockId &&
        candidate.sourceItemId === item.sourceItemId,
    );
    const resolved = siblings.flatMap((candidate) =>
      candidate.reviewResolution?.status === "resolved" &&
      candidate.reviewResolution.verificationOutcome
        ? [candidate.reviewResolution.verificationOutcome]
        : [],
    );
    if (resolved.includes("not_verified")) {
      verificationStatuses.set(key, "NOT_VERIFIED");
    } else if (
      siblings.length > 0 &&
      resolved.length === siblings.length &&
      resolved.every((outcome) => outcome === "verified")
    ) {
      verificationStatuses.set(key, "VERIFIED");
    }
  }

  return {
    perBlock,
    attributeScores,
    categoryScores,
    overall,
    complete,
    coverage,
    tier,
    confidence,
    confidencePhrase: complete
      ? `${confidence} confidence — all required evidence coverage rules are satisfied; named human adjudication is still mandatory.`
      : `Low confidence — coverage is ${coverage}%; ${prepared.pendingRequiredBlockIds.length} required manual or verification block(s) and ${pendingGateResults.length} frozen gate(s) remain pending. This evaluation is not rank-eligible.`,
    synthesis: {
      strengths,
      risks,
      contradictions,
      narrative:
        `${scoredForOverall.length} of ${prepared.blueprint.attributes.length} frozen criteria have enough server-validated evidence for a provisional score. ` +
        (scoredWeight > 0
          ? `The provisional score across eligible evidence is ${overall}, with ${coverage}% weighted coverage. `
          : "No performance score is available because the evidence floor was not met. ") +
        (unwaivedGateFailures.length > 0
          ? `${unwaivedGateFailures.length} frozen hurdle(s) failed without an active governed waiver; an advance decision is blocked. `
          : "") +
        "Deterministic keys were applied only on the server. AI review was limited to job-related submitted text, code, and verified interview transcripts. Verification and manual stages received no synthetic performance score. A named human reviewer must inspect every cited passage and record the decision.",
    },
    mustHaveResults: prepared.mustHaveResults,
    gateResults,
    claims: buildVerificationClaimLedger(
      vacancy,
      prepared.blockResults,
      verificationStatuses,
    ),
    engine,
  };
}
