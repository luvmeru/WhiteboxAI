import type { VacancyV2 } from "@/lib/types";

export const OPENAI_REQUIRED_POLICY_VERSION = "openai-required-v1" as const;

export type VacancyAiExecutionMode =
  | "legacy_deterministic"
  | "openai_required";

export function vacancyAiExecutionMode(
  vacancy: Pick<VacancyV2, "aiExecution">,
): VacancyAiExecutionMode {
  return vacancy.aiExecution?.mode === "openai_required"
    ? "openai_required"
    : "legacy_deterministic";
}

export function applicationAiExecutionMode(
  mode: VacancyAiExecutionMode | undefined,
): VacancyAiExecutionMode {
  // Applications created before the rollout have no snapshot field. Treating
  // absence as legacy is the compatibility boundary; never infer mode from the
  // current environment or from a mutable current vacancy version.
  return mode === "openai_required"
    ? "openai_required"
    : "legacy_deterministic";
}

export function applyPublicationAiPolicy(
  draft: VacancyV2,
  existingVacancy: VacancyV2 | null,
  assignedAt = new Date().toISOString(),
): VacancyV2 {
  if (existingVacancy) {
    // A later version of an existing vacancy must keep the first publication's
    // execution boundary. The client cannot silently upgrade historical
    // candidate results by adding a field to a publish payload.
    if (existingVacancy.aiExecution?.mode === "openai_required") {
      return {
        ...draft,
        aiExecution: existingVacancy.aiExecution,
      };
    }
    const legacyDraft = { ...draft };
    delete legacyDraft.aiExecution;
    return legacyDraft;
  }

  return {
    ...draft,
    aiExecution: {
      mode: "openai_required",
      policyVersion: OPENAI_REQUIRED_POLICY_VERSION,
      assignedAt,
    },
  };
}
