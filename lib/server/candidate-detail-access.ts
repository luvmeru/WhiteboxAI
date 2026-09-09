import type { ApplicationStage, VacancyV2 } from "@/lib/types";
import type { HrSession } from "./auth";
import { authorizeReviewer } from "./reviewer-authorization";

type CandidateDetailPrincipal = Pick<
  HrSession,
  "sub" | "role" | "piiReveal" | "organizationId"
>;

/**
 * Raw candidate answers, evidence quotes, and decision reasons are sensitive
 * review material. This compatibility wrapper delegates to the same policy as
 * the evidence APIs so an RSC page cannot become a weaker access path.
 */
export function canAccessCandidateSensitiveDetail(
  session: CandidateDetailPrincipal,
  vacancy: Pick<VacancyV2, "id" | "configVersion" | "governance"> & {
    scoring: Pick<VacancyV2["scoring"], "anonymization">;
  },
  application: {
    id: string;
    organizationId: string;
    vacancyId: string;
    vacancyVersion: number;
    stage: ApplicationStage;
  },
): boolean {
  return authorizeReviewer({
    session,
    vacancy,
    application,
    capability: "sensitive_detail",
    evidenceMode: "raw",
  }).allowed;
}
