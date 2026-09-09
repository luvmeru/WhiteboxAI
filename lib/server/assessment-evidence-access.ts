import { sha256 } from "./crypto";

export interface AssessmentEvidenceAccessBinding {
  organizationId: string;
  applicationId: string;
  targetId: string;
  blockId: string;
  receiptIndex: number;
  receiptLocatorHash: string;
  actorUserId: string;
}

export interface AssessmentEvidenceAccessAttestation
  extends AssessmentEvidenceAccessBinding {
  accessedAt?: string;
}

export function assessmentEvidenceAccessBinding(input: {
  organizationId: string;
  applicationId: string;
  targetId: string;
  blockId: string;
  receiptIndex: number;
  receiptLocator: string;
  actorUserId: string;
}): AssessmentEvidenceAccessBinding {
  if (
    !input.organizationId ||
    !input.applicationId ||
    !/^[a-f0-9]{64}$/u.test(input.targetId) ||
    !input.blockId ||
    !Number.isSafeInteger(input.receiptIndex) ||
    input.receiptIndex < 0 ||
    !input.receiptLocator ||
    !input.actorUserId
  ) {
    throw new Error("Invalid assessment evidence access binding.");
  }
  return {
    organizationId: input.organizationId,
    applicationId: input.applicationId,
    targetId: input.targetId,
    blockId: input.blockId,
    receiptIndex: input.receiptIndex,
    receiptLocatorHash: sha256(input.receiptLocator),
    actorUserId: input.actorUserId,
  };
}

export function assessmentEvidenceAccessMatches(
  attestation: AssessmentEvidenceAccessAttestation,
  expected: AssessmentEvidenceAccessBinding,
): boolean {
  return (
    attestation.organizationId === expected.organizationId &&
    attestation.applicationId === expected.applicationId &&
    attestation.targetId === expected.targetId &&
    attestation.blockId === expected.blockId &&
    attestation.receiptIndex === expected.receiptIndex &&
    attestation.receiptLocatorHash === expected.receiptLocatorHash &&
    attestation.actorUserId === expected.actorUserId
  );
}

export function hasAssessmentEvidenceAccess(
  attestations: readonly AssessmentEvidenceAccessAttestation[],
  expected: AssessmentEvidenceAccessBinding,
): boolean {
  return attestations.some((attestation) =>
    assessmentEvidenceAccessMatches(attestation, expected),
  );
}
