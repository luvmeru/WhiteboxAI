import type { CandidateEvaluation } from "@/lib/types";

export type HumanDecisionPolicyKind =
  | "advance"
  | "hold"
  | "reject"
  | "request_rescore";

type EvaluationDecisionState = Pick<
  CandidateEvaluation,
  "complete" | "gateResults"
> & {
  mustHaveResults?: CandidateEvaluation["mustHaveResults"];
};

export type HumanDecisionPolicyErrorCode =
  | "EVALUATION_REQUIRED"
  | "EVIDENCE_INCOMPLETE"
  | "GATE_ADJUDICATION_REQUIRED"
  | "FAILED_ASSESSMENT_GATE";

export class HumanDecisionPolicyError extends Error {
  constructor(
    readonly code: HumanDecisionPolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HumanDecisionPolicyError";
  }
}

export function blockingAdvanceGateIds(
  evaluation: EvaluationDecisionState | undefined,
): string[] {
  return (
    evaluation?.gateResults
      ?.filter(
        (gate) =>
          gate.status === "failed" &&
          !(
            gate.waiver.outcome === "waived" &&
            gate.waiver.reviewIds.length > 0
          ),
      )
      .map((gate) => gate.blockId) ?? []
  );
}

export function unadjudicatedFailedGateIds(
  evaluation: EvaluationDecisionState | undefined,
): string[] {
  return (
    evaluation?.gateResults
      ?.filter((gate) => {
        if (gate.status !== "failed") return false;
        const governedOutcome =
          (gate.waiver.outcome === "waived" ||
            gate.waiver.outcome === "upheld") &&
          gate.waiver.reviewIds.length > 0;
        return !governedOutcome;
      })
      .map((gate) => gate.blockId) ?? []
  );
}

export function unadjudicatedFailedMustHaveIds(
  evaluation: EvaluationDecisionState | undefined,
): string[] {
  return (
    evaluation?.mustHaveResults
      ?.filter((mustHave) => !mustHave.passed)
      .filter((mustHave) => {
        const governingGate = evaluation.gateResults?.find(
          (gate) =>
            gate.status === "failed" &&
            gate.mustHaveIds.includes(mustHave.id),
        );
        return !(
          governingGate &&
          (governingGate.waiver.outcome === "waived" ||
            governingGate.waiver.outcome === "upheld") &&
          governingGate.waiver.reviewIds.length > 0
        );
      })
      .map((mustHave) => mustHave.id) ?? []
  );
}

export function upheldFailedGateIds(
  evaluation: EvaluationDecisionState | undefined,
): string[] {
  return (
    evaluation?.gateResults
      ?.filter(
        (gate) =>
          gate.configured &&
          gate.status === "failed" &&
          gate.waiver.outcome === "upheld" &&
          gate.waiver.reviewIds.length > 0,
      )
      .map((gate) => gate.blockId) ?? []
  );
}

export function assertHumanDecisionEvaluationPolicy(
  decision: HumanDecisionPolicyKind,
  evaluation: EvaluationDecisionState | undefined,
  options: { evaluationRequired?: boolean } = {},
): void {
  const finalDisposition = decision === "advance" || decision === "reject";
  if (finalDisposition && options.evaluationRequired && !evaluation) {
    throw new HumanDecisionPolicyError(
      "EVALUATION_REQUIRED",
      "A current frozen-version evaluation is required before a final disposition.",
    );
  }
  const unadjudicatedGateIds = unadjudicatedFailedGateIds(evaluation);
  const unadjudicatedMustHaveIds =
    unadjudicatedFailedMustHaveIds(evaluation);
  if (
    finalDisposition &&
    (unadjudicatedGateIds.length > 0 ||
      unadjudicatedMustHaveIds.length > 0)
  ) {
    const blockers = [
      ...unadjudicatedGateIds.map((id) => `gate:${id}`),
      ...unadjudicatedMustHaveIds.map((id) => `must-have:${id}`),
    ];
    throw new HumanDecisionPolicyError(
      "GATE_ADJUDICATION_REQUIRED",
      `A named trusted review must adjudicate every failed frozen gate or must-have before a final disposition: ${blockers.join(", ")}.`,
    );
  }
  if (finalDisposition && evaluation?.complete === false) {
    const conclusiveEarlyRejection =
      decision === "reject" && upheldFailedGateIds(evaluation).length > 0;
    if (!conclusiveEarlyRejection) {
      throw new HumanDecisionPolicyError(
        "EVIDENCE_INCOMPLETE",
        "A final disposition requires complete rubric evidence or a trusted upheld failed gate for early rejection.",
      );
    }
  }
  if (decision !== "advance") return;

  const blockingGateIds = blockingAdvanceGateIds(evaluation);
  if (blockingGateIds.length > 0) {
    throw new HumanDecisionPolicyError(
      "FAILED_ASSESSMENT_GATE",
      `The application cannot advance while frozen assessment gates remain failed without a governed waiver: ${blockingGateIds.join(", ")}.`,
    );
  }
}
