import type { HrSession } from "./auth";
import { ApiError } from "./http";
import type {
  ApplicationStage,
  GovernanceConfig,
  VacancyV2,
} from "../types";

export type ReviewerCapability =
  | "aggregate_read"
  | "evaluation_run"
  | "sensitive_detail"
  | "evidence_read"
  | "assessment_review";

export type ReviewerEvidenceMode = "none" | "raw" | "deidentified";

export type ReviewerAuthorizationCode =
  | "REVIEWER_ROLE_FORBIDDEN"
  | "REVIEWER_NOT_ASSIGNED"
  | "REVIEWER_ROLE_MISMATCH"
  | "REVIEWER_CALIBRATION_REQUIRED"
  | "PII_REVEAL_REQUIRED"
  | "PII_REVEAL_STAGE_LOCKED"
  | "BLIND_REVIEW_DERIVATIVE_REQUIRED";

export interface ReviewerAuthorizationDecision {
  allowed: boolean;
  code?: ReviewerAuthorizationCode;
  status?: 403 | 409;
  message?: string;
  ownerAdministrativeOverride: boolean;
  namedAssignment: GovernanceConfig["roles"][number] | null;
  assignmentMode: GovernanceConfig["reviewPolicy"]["assignment"];
}

type ReviewerPrincipal = Pick<
  HrSession,
  "sub" | "role" | "piiReveal" | "organizationId"
>;

export interface ReviewerAuthorizationInput {
  session: ReviewerPrincipal;
  vacancy: Pick<VacancyV2, "id" | "configVersion" | "governance"> & {
    scoring: Pick<VacancyV2["scoring"], "anonymization">;
  };
  application?: {
    id: string;
    organizationId: string;
    vacancyId: string;
    vacancyVersion: number;
    stage: ApplicationStage;
  };
  capability: ReviewerCapability;
  /**
   * A calibration receipt must come from server-owned state. A vacancy toggle
   * or browser assertion is not a receipt. Until that state exists, callers
   * deliberately pass false and calibrated review actions fail closed.
   */
  calibrationVerified?: boolean;
  evidenceMode?: ReviewerEvidenceMode;
  blindReviewRequired?: boolean;
  deidentifiedEvidenceAvailable?: boolean;
}

const NON_REVIEW_ROLES = new Set<HrSession["role"]>(["Observer"]);

const DECISION_REVEAL_STAGES = new Set<ApplicationStage>([
  "submitted",
  "under_review",
  "needs_adjudication",
  "shortlisted",
  "invited",
  "offer",
  "hired",
  "not_moving_forward",
  "knocked_out",
  "withdrawn",
]);

const INVITED_REVEAL_STAGES = new Set<ApplicationStage>([
  "invited",
  "offer",
  "hired",
]);

function denied(
  input: ReviewerAuthorizationInput,
  code: ReviewerAuthorizationCode,
  status: 403 | 409,
  message: string,
  namedAssignment: GovernanceConfig["roles"][number] | null,
): ReviewerAuthorizationDecision {
  return {
    allowed: false,
    code,
    status,
    message,
    ownerAdministrativeOverride: input.session.role === "Owner",
    namedAssignment,
    assignmentMode: input.vacancy.governance.reviewPolicy.assignment,
  };
}

function revealStageReached(
  vacancy: ReviewerAuthorizationInput["vacancy"],
  stage: ApplicationStage,
): boolean {
  return vacancy.scoring.anonymization.revealAtStage === "invited"
    ? INVITED_REVEAL_STAGES.has(stage)
    : DECISION_REVEAL_STAGES.has(stage);
}

function capabilityNeedsReviewerRole(capability: ReviewerCapability): boolean {
  return capability !== "aggregate_read";
}

function capabilityNeedsCalibration(
  capability: ReviewerCapability,
): boolean {
  return (
    capability === "evaluation_run" ||
    capability === "sensitive_detail" ||
    capability === "evidence_read" ||
    capability === "assessment_review"
  );
}

/**
 * Central reviewer authorization policy.
 *
 * Owners keep tenant administration access without having to be duplicated in
 * every vacancy roster. That override never bypasses a raw-PII stage gate or a
 * blind-review derivative requirement. Every non-owner must be a named vacancy
 * assignee whose frozen vacancy role matches the authenticated tenant role.
 */
export function authorizeReviewer(
  input: ReviewerAuthorizationInput,
): ReviewerAuthorizationDecision {
  const { session, vacancy, application, capability } = input;
  const namedAssignment =
    vacancy.governance.roles.find((entry) => entry.userId === session.sub) ??
    null;
  const ownerAdministrativeOverride = session.role === "Owner";

  if (!application && capability !== "aggregate_read") {
    return denied(
      input,
      "REVIEWER_NOT_ASSIGNED",
      403,
      "The review action is not bound to an exact tenant-scoped application.",
      namedAssignment,
    );
  }

  if (
    application &&
    (session.organizationId !== application.organizationId ||
      vacancy.id !== application.vacancyId ||
      vacancy.configVersion !== application.vacancyVersion)
  ) {
    return denied(
      input,
      "REVIEWER_NOT_ASSIGNED",
      403,
      "The reviewer is not assigned to this tenant-scoped frozen application.",
      namedAssignment,
    );
  }

  if (!ownerAdministrativeOverride) {
    if (!namedAssignment) {
      return denied(
        input,
        "REVIEWER_NOT_ASSIGNED",
        403,
        "Only a reviewer named on the exact frozen vacancy may access this application.",
        null,
      );
    }
    if (namedAssignment.role !== session.role) {
      return denied(
        input,
        "REVIEWER_ROLE_MISMATCH",
        403,
        "The authenticated role does not match the reviewer's frozen vacancy assignment.",
        namedAssignment,
      );
    }
  }

  if (
    capabilityNeedsReviewerRole(capability) &&
    NON_REVIEW_ROLES.has(namedAssignment?.role ?? session.role)
  ) {
    return denied(
      input,
      "REVIEWER_ROLE_FORBIDDEN",
      403,
      "The assigned role does not permit candidate evidence review.",
      namedAssignment,
    );
  }

  if (
    !ownerAdministrativeOverride &&
    vacancy.governance.calibrationRequired &&
    capabilityNeedsCalibration(capability) &&
    input.calibrationVerified !== true
  ) {
    return denied(
      input,
      "REVIEWER_CALIBRATION_REQUIRED",
      409,
      "A server-verified frame-of-reference calibration receipt is required before this review action.",
      namedAssignment,
    );
  }

  const evidenceMode = input.evidenceMode ?? "none";
  if (input.blindReviewRequired) {
    if (
      evidenceMode === "raw" ||
      (evidenceMode === "deidentified" &&
        input.deidentifiedEvidenceAvailable !== true)
    ) {
      return denied(
        input,
        "BLIND_REVIEW_DERIVATIVE_REQUIRED",
        409,
        "Blind review is required, but no server-produced de-identified evidence derivative is available.",
        namedAssignment,
      );
    }
  }

  if (evidenceMode === "raw" || capability === "sensitive_detail") {
    const assignmentAllowsPii =
      ownerAdministrativeOverride || namedAssignment?.piiReveal === true;
    if (!session.piiReveal || !assignmentAllowsPii) {
      return denied(
        input,
        "PII_REVEAL_REQUIRED",
        403,
        "This reviewer does not have PII reveal permission for the frozen vacancy.",
        namedAssignment,
      );
    }
    if (!application || !revealStageReached(vacancy, application.stage)) {
      return denied(
        input,
        "PII_REVEAL_STAGE_LOCKED",
        409,
        `Candidate identity and raw evidence remain locked until the configured ${vacancy.scoring.anonymization.revealAtStage} stage.`,
        namedAssignment,
      );
    }
  }

  return {
    allowed: true,
    ownerAdministrativeOverride,
    namedAssignment,
    assignmentMode: vacancy.governance.reviewPolicy.assignment,
  };
}

export function assertReviewerAuthorized(
  input: ReviewerAuthorizationInput,
): ReviewerAuthorizationDecision {
  const decision = authorizeReviewer(input);
  if (!decision.allowed) {
    throw new ApiError(
      decision.status ?? 403,
      decision.code ?? "REVIEWER_ROLE_FORBIDDEN",
      decision.message ?? "Reviewer access is not permitted.",
    );
  }
  return decision;
}
