import type { Role } from "@/lib/types";
import { sha256 } from "./crypto";

export const ASSESSMENT_REVIEW_SCHEMA_VERSION =
  "assessment-review-v1" as const;

export type AssessmentReviewKind =
  | "manual_bars"
  | "verification"
  | "gate_waiver";

export type AssessmentVerificationOutcome =
  | "verified"
  | "not_verified";

export type AssessmentGateWaiverOutcome = "waived" | "upheld";

export interface AssessmentReviewEvidence {
  summary: string;
  locator: string;
  source:
    | "submitted_text"
    | "submitted_artifact"
    | "external_questionnaire"
    | "live_observation"
    | "validated_provider_report"
    | "frozen_gate";
  observedBy:
    | "named_reviewer"
    | "external_participant"
    | "validated_provider";
}

export interface AssessmentReviewBinding {
  organizationId: string;
  applicationId: string;
  vacancyId: string;
  vacancyVersion: number;
  blockId: string;
  sourceItemId: string;
  attributeId: string | null;
  kind: AssessmentReviewKind;
  rubricHash: string;
}

export interface AssessmentReviewRecord
  extends AssessmentReviewBinding {
  schemaVersion: typeof ASSESSMENT_REVIEW_SCHEMA_VERSION;
  id: string;
  idempotencyKeyHash: string;
  inputHash: string;
  level: 1 | 2 | 3 | 4 | 5 | null;
  verificationOutcome: AssessmentVerificationOutcome | null;
  gateWaiverOutcome: AssessmentGateWaiverOutcome | null;
  evidence: AssessmentReviewEvidence;
  rationale: string;
  reviewerUserId: string;
  reviewerEmail: string;
  reviewerRole: Role;
  supersedesReviewId: string | null;
  createdAt: string;
}

export type AssessmentReviewResolution =
  | {
      status: "pending";
      activeReviews: AssessmentReviewRecord[];
      requiredReviews: number;
    }
  | {
      status: "conflict";
      activeReviews: AssessmentReviewRecord[];
      requiredReviews: number;
    }
  | {
      status: "resolved";
      activeReviews: AssessmentReviewRecord[];
      requiredReviews: number;
      level: 1 | 2 | 3 | 4 | 5 | null;
      verificationOutcome: AssessmentVerificationOutcome | null;
      gateWaiverOutcome: AssessmentGateWaiverOutcome | null;
    };

export interface AssessmentReviewScope {
  organizationId: string;
  applicationId: string;
  vacancyId: string;
  vacancyVersion: number;
}

export function assessmentReviewBindingMatchesScope(
  binding: AssessmentReviewBinding,
  scope: AssessmentReviewScope,
): boolean {
  return (
    binding.organizationId === scope.organizationId &&
    binding.applicationId === scope.applicationId &&
    binding.vacancyId === scope.vacancyId &&
    binding.vacancyVersion === scope.vacancyVersion
  );
}

export class AssessmentReviewMutationError extends Error {
  constructor(
    readonly code:
      | "IDEMPOTENCY_CONFLICT"
      | "VERSION_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "AssessmentReviewMutationError";
  }
}

export type AssessmentReviewWriteResolution =
  | { action: "create" }
  | { action: "replay"; review: AssessmentReviewRecord };

/**
 * Resolves retry semantics before a write. An exact idempotent replay wins
 * even when the caller's optimistic-lock version is now stale; reusing the
 * key for different content fails closed.
 */
export function resolveAssessmentReviewWrite(
  reviews: readonly AssessmentReviewRecord[],
  input: {
    idempotencyKeyHash: string;
    inputHash: string;
    currentLockVersion: number;
    expectedLockVersion: number;
  },
): AssessmentReviewWriteResolution {
  const existing = reviews.find(
    (review) =>
      review.idempotencyKeyHash === input.idempotencyKeyHash,
  );
  if (existing) {
    if (existing.inputHash !== input.inputHash) {
      throw new AssessmentReviewMutationError(
        "IDEMPOTENCY_CONFLICT",
        "Assessment review idempotency key was already used for different content.",
      );
    }
    return { action: "replay", review: existing };
  }
  if (input.currentLockVersion !== input.expectedLockVersion) {
    throw new AssessmentReviewMutationError(
      "VERSION_CONFLICT",
      "Application was updated by another request.",
    );
  }
  return { action: "create" };
}

function stableBindingValue(binding: AssessmentReviewBinding) {
  return {
    organizationId: binding.organizationId,
    applicationId: binding.applicationId,
    vacancyId: binding.vacancyId,
    vacancyVersion: binding.vacancyVersion,
    blockId: binding.blockId,
    sourceItemId: binding.sourceItemId,
    attributeId: binding.attributeId,
    kind: binding.kind,
    rubricHash: binding.rubricHash,
  };
}

export function assessmentReviewBindingHash(
  binding: AssessmentReviewBinding,
): string {
  return sha256(JSON.stringify(stableBindingValue(binding)));
}

export function assessmentReviewRubricHash(
  rubric: unknown,
): string {
  return sha256(JSON.stringify(rubric));
}

export function assessmentReviewInputHash(input: {
  binding: AssessmentReviewBinding;
  level: AssessmentReviewRecord["level"];
  verificationOutcome: AssessmentReviewRecord["verificationOutcome"];
  gateWaiverOutcome: AssessmentReviewRecord["gateWaiverOutcome"];
  evidence: AssessmentReviewEvidence;
  rationale: string;
  reviewerUserId: string;
  supersedesReviewId: string | null;
}): string {
  return sha256(
    JSON.stringify({
      ...stableBindingValue(input.binding),
      level: input.level,
      verificationOutcome: input.verificationOutcome,
      gateWaiverOutcome: input.gateWaiverOutcome,
      evidence: input.evidence,
      rationale: input.rationale.trim(),
      reviewerUserId: input.reviewerUserId,
      supersedesReviewId: input.supersedesReviewId,
    }),
  );
}

export function reviewMatchesBinding(
  review: AssessmentReviewRecord,
  binding: AssessmentReviewBinding,
): boolean {
  return (
    review.schemaVersion === ASSESSMENT_REVIEW_SCHEMA_VERSION &&
    assessmentReviewBindingHash(review) ===
      assessmentReviewBindingHash(binding)
  );
}

export function activeAssessmentReviews(
  reviews: readonly AssessmentReviewRecord[],
  binding: AssessmentReviewBinding,
): AssessmentReviewRecord[] {
  const matching = reviews.filter((review) =>
    reviewMatchesBinding(review, binding),
  );
  const supersededIds = new Set(
    matching.flatMap((review) =>
      review.supersedesReviewId
        ? [review.supersedesReviewId]
        : [],
    ),
  );
  return matching
    .filter((review) => !supersededIds.has(review.id))
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );
}

export function resolveAssessmentReview(
  reviews: readonly AssessmentReviewRecord[],
  binding: AssessmentReviewBinding,
  requiredReviews: number,
): AssessmentReviewResolution {
  const required = Math.max(1, Math.min(3, Math.trunc(requiredReviews)));
  const activeReviews = activeAssessmentReviews(reviews, binding);
  const reviewerIds = new Set(
    activeReviews.map((review) => review.reviewerUserId),
  );
  if (
    activeReviews.length < required ||
    reviewerIds.size < required
  ) {
    return {
      status: "pending",
      activeReviews,
      requiredReviews: required,
    };
  }
  if (binding.kind === "manual_bars") {
    const levels = new Set(
      activeReviews.flatMap((review) =>
        review.level === null ? [] : [review.level],
      ),
    );
    if (levels.size !== 1) {
      return {
        status: "conflict",
        activeReviews,
        requiredReviews: required,
      };
    }
    return {
      status: "resolved",
      activeReviews,
      requiredReviews: required,
      level: [...levels][0] ?? null,
      verificationOutcome: null,
      gateWaiverOutcome: null,
    };
  }
  if (binding.kind === "verification") {
    const outcomes = new Set(
      activeReviews.flatMap((review) =>
        review.verificationOutcome
          ? [review.verificationOutcome]
          : [],
      ),
    );
    if (outcomes.size !== 1) {
      return {
        status: "conflict",
        activeReviews,
        requiredReviews: required,
      };
    }
    return {
      status: "resolved",
      activeReviews,
      requiredReviews: required,
      level: null,
      verificationOutcome: [...outcomes][0] ?? null,
      gateWaiverOutcome: null,
    };
  }
  const outcomes = new Set(
    activeReviews.flatMap((review) =>
      review.gateWaiverOutcome
        ? [review.gateWaiverOutcome]
        : [],
    ),
  );
  if (outcomes.size !== 1) {
    return {
      status: "conflict",
      activeReviews,
      requiredReviews: required,
    };
  }
  return {
    status: "resolved",
    activeReviews,
    requiredReviews: required,
    level: null,
    verificationOutcome: null,
    gateWaiverOutcome: [...outcomes][0] ?? null,
  };
}
