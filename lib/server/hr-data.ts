import type { Candidate, VacancyStatus, VacancyV2 } from "../types";
import { isDevelopmentDemoMode } from "./env";
import {
  getTenantVacancy,
  getTenantVacancyVersion,
  listTenantApplications,
  type TenantApplicationSummary,
} from "./repository";
import {
  buildVacancyVersionCohorts,
  selectVacancyVersion,
} from "./vacancy-version";

export interface HrVacancyRankingData {
  source: "repository" | "fixture";
  vacancy: {
    id: string;
    title: string;
    code: string;
    status: VacancyStatus;
    version: number;
  };
  versionCohorts: { version: number; applications: number }[];
  threshold: number;
  /** Complete evaluations with substantive tiers and ordinal ranks. */
  candidates: Candidate[];
  /** Evaluations withheld from ranking by the frozen completeness policy. */
  ineligibleCandidates: Candidate[];
  totalApplications: number;
  pendingEvaluations: number;
  pendingApplications: {
    id: string;
    internalCandidateId: string;
    stage: string;
    lockVersion: number;
    createdAt: string;
  }[];
}

/**
 * Ranking surfaces need aggregate, pseudonymous scores only. Free-text model
 * output can quote a candidate answer (and therefore contain volunteered PII),
 * so it must not enter a ranking API or client-component payload.
 */
export function rankingSummaryView(
  ranking: HrVacancyRankingData,
): HrVacancyRankingData {
  return {
    ...ranking,
    candidates: ranking.candidates.map((candidate) => {
      const summary: Candidate = {
        ...candidate,
        confidencePhrase: `${candidate.confidence} confidence based on frozen evidence coverage.`,
        competencies: candidate.competencies.map((competency) => ({
          ...competency,
          drivers: [],
          confidenceReason: `${competency.confidence} confidence based on frozen evidence coverage.`,
          evidence: [],
          trace: [],
        })),
        strengths: [],
        weaknesses: [],
        audit: [],
      };
      delete summary.applicationId;
      return summary;
    }),
    ineligibleCandidates: ranking.ineligibleCandidates.map((candidate) => {
      const summary: Candidate = {
        ...candidate,
        confidencePhrase: `${candidate.confidence} confidence based on frozen evidence coverage.`,
        competencies: candidate.competencies.map((competency) => ({
          ...competency,
          drivers: [],
          confidenceReason: `${competency.confidence} confidence based on frozen evidence coverage.`,
          evidence: [],
          trace: [],
        })),
        strengths: [],
        weaknesses: [],
        audit: [],
      };
      delete summary.applicationId;
      return summary;
    }),
  };
}

type EvaluatedApplication = TenantApplicationSummary & {
  evaluation: NonNullable<TenantApplicationSummary["evaluation"]>;
};

function applicationToCandidate(
  application: EvaluatedApplication,
  rank: number | null,
): Candidate {
  const evaluation = application.evaluation;
  const complete = evaluation.complete ?? true;
  const verified = evaluation.claims.some((claim) => claim.status === "VERIFIED");
  const pendingVerification = evaluation.claims.some(
    (claim) => claim.material && claim.status !== "VERIFIED",
  );

  return {
    applicationId: application.id,
    internalId: application.internalCandidateId,
    rank: complete ? rank : null,
    overall: evaluation.overall,
    tier: complete ? evaluation.tier : null,
    confidence: evaluation.confidence,
    confidencePhrase: evaluation.confidencePhrase,
    verification: verified ? "VERIFIED" : pendingVerification ? "PENDING" : "—",
    divergence: false,
    appliedAt: application.createdAt.slice(0, 10),
    evaluationComplete: complete,
    evaluationCoverage: evaluation.coverage ?? 100,
    competencies: evaluation.attributeScores,
    strengths: evaluation.synthesis.strengths,
    weaknesses: evaluation.synthesis.risks,
    audit: [],
  };
}

export function rankTenantApplications(
  applications: TenantApplicationSummary[],
  vacancy?: VacancyV2,
): Candidate[] {
  const evaluated = applications.filter(
    (application): application is EvaluatedApplication =>
      application.evaluation !== undefined,
  );
  const bandByApplication = new Map<string, number>();
  if (vacancy?.scoring.banding?.enabled) {
    const width = Math.max(0, vacancy.scoring.banding.sedWidth);
    let band = -1;
    let anchor: number | undefined;
    for (const application of evaluated
      .filter((item) => item.evaluation.complete ?? true)
      .sort(
        (left, right) =>
          right.evaluation.overall - left.evaluation.overall ||
          left.internalCandidateId.localeCompare(
            right.internalCandidateId,
          ),
      )) {
      if (
        anchor === undefined ||
        anchor - application.evaluation.overall > width
      ) {
        band += 1;
        anchor = application.evaluation.overall;
      }
      bandByApplication.set(application.id, band);
    }
  }
  const focusAttributeIds = new Set(
    vacancy?.categories.flatMap((category) =>
      category.attributes
        .filter((attribute) => attribute.focus)
        .map((attribute) => attribute.id),
    ) ?? [],
  );
  const workBlockIds = new Set(
    vacancy?.pipeline
      .filter((block) =>
        ["work_sample", "coding", "case_exercise"].includes(block.kind),
      )
      .map((block) => block.id) ?? [],
  );
  const weightedAverage = (
    values: { score: number; weight: number }[],
  ): number => {
    const weight = values.reduce(
      (sum, value) => sum + Math.max(0.0001, value.weight),
      0,
    );
    return weight > 0
      ? values.reduce(
          (sum, value) =>
            sum + value.score * Math.max(0.0001, value.weight),
          0,
        ) / weight
      : -1;
  };
  const focusScore = (application: EvaluatedApplication): number =>
    weightedAverage(
      application.evaluation.attributeScores
        .filter(
          (score) =>
            !score.abstained && focusAttributeIds.has(score.id),
        )
        .map((score) => ({ score: score.score, weight: score.weight })),
    );
  const workSampleScore = (
    application: EvaluatedApplication,
  ): number =>
    weightedAverage(
      application.evaluation.perBlock
        .filter(
          (block) =>
            workBlockIds.has(block.blockId) &&
            block.itemScores.some((score) => !score.abstained),
        )
        .map((block) => ({ score: block.blockScore, weight: 1 })),
    );
  const configuredTieBreakers =
    vacancy?.scoring.tieBreakers ?? ["earlier_submission"];

  let eligibleOrdinal = 0;
  return evaluated
    .sort(
      (left, right) => {
        const leftComplete = left.evaluation.complete ?? true;
        const rightComplete = right.evaluation.complete ?? true;
        const completionOrder =
          Number(rightComplete) - Number(leftComplete);
        if (completionOrder !== 0) return completionOrder;
        if (leftComplete && rightComplete) {
          const bandOrder =
            vacancy?.scoring.banding?.enabled
              ? (bandByApplication.get(left.id) ?? 0) -
                (bandByApplication.get(right.id) ?? 0)
              : 0;
          if (bandOrder !== 0) return bandOrder;
          const scoreOrder = vacancy?.scoring.banding?.enabled
            ? 0
            : right.evaluation.overall - left.evaluation.overall;
          if (scoreOrder !== 0) return scoreOrder;
          for (const tieBreaker of configuredTieBreakers) {
            if (tieBreaker === "focus_attributes") {
              const order = focusScore(right) - focusScore(left);
              if (order !== 0) return order;
            } else if (tieBreaker === "work_sample") {
              const order =
                workSampleScore(right) - workSampleScore(left);
              if (order !== 0) return order;
            } else {
              const order = left.createdAt.localeCompare(
                right.createdAt,
              );
              if (order !== 0) return order;
            }
          }
        }
        return left.internalCandidateId.localeCompare(
          right.internalCandidateId,
        );
      },
    )
    .map((application) => {
      const eligible =
        (application.evaluation.complete ?? true) &&
        application.evaluation.tier !== null;
      return applicationToCandidate(
        application,
        eligible ? ++eligibleOrdinal : null,
      );
    });
}

export async function getHrVacancyRanking(
  vacancyId: string,
  organizationId: string,
  requestedVersion?: number,
): Promise<HrVacancyRankingData | null> {
  if (
    requestedVersion !== undefined &&
    (!Number.isInteger(requestedVersion) || requestedVersion < 1)
  ) {
    return null;
  }

  const allApplications = await listTenantApplications(vacancyId, organizationId);
  const applicationCohorts =
    buildVacancyVersionCohorts(allApplications);
  const selectedApplicationVersion = selectVacancyVersion(
    applicationCohorts,
    requestedVersion,
  );
  const vacancy =
    selectedApplicationVersion === undefined
      ? await getTenantVacancy(vacancyId, organizationId)
      : await getTenantVacancyVersion(
          vacancyId,
          selectedApplicationVersion,
          organizationId,
        );
  if (vacancy) {
    const selectedVersion =
      selectedApplicationVersion ?? vacancy.configVersion;
    const applications = allApplications.filter(
      (application) => application.vacancyVersion === selectedVersion,
    );
    const evaluatedCandidates = rankTenantApplications(
      applications,
      vacancy,
    );
    const candidates = evaluatedCandidates.filter(
      (candidate) =>
        candidate.rank !== null && candidate.tier !== null,
    );
    const ineligibleCandidates = evaluatedCandidates.filter(
      (candidate) =>
        candidate.rank === null || candidate.tier === null,
    );
    const versionCohorts = applicationCohorts.some(
      (cohort) => cohort.version === selectedVersion,
    )
      ? applicationCohorts
      : [...applicationCohorts, { version: selectedVersion, applications: 0 }]
          .sort((left, right) => left.version - right.version);
    return {
      source: "repository",
      vacancy: {
        id: vacancy.id,
        title: vacancy.profile.title,
        code: vacancy.code,
        status: vacancy.status,
        version: selectedVersion,
      },
      versionCohorts,
      threshold: vacancy.scoring.threshold,
      candidates,
      ineligibleCandidates,
      totalApplications: applications.length,
      pendingEvaluations: applications.filter(
        (application) => !application.evaluation,
      ).length,
      pendingApplications: applications
        .filter((application) => !application.evaluation)
        .map((application) => ({
          id: application.id,
          internalCandidateId: application.internalCandidateId,
          stage: application.stage,
          lockVersion: application.lockVersion,
          createdAt: application.createdAt,
        })),
    };
  }

  if (
    allApplications.length > 0 ||
    (requestedVersion !== undefined && requestedVersion !== 1)
  ) {
    return null;
  }

  if (!isDevelopmentDemoMode()) return null;

  const fixtures = await import("@/lib/fixtures");
  const fixtureVacancy = fixtures.vacancies.find((candidate) => candidate.id === vacancyId);
  if (!fixtureVacancy) return null;
  const candidates = vacancyId === "vac-001" ? fixtures.candidates : [];
  return {
    source: "fixture",
    vacancy: {
      id: fixtureVacancy.id,
      title: fixtureVacancy.title,
      code: fixtureVacancy.code,
      status: fixtureVacancy.status,
      version: 1,
    },
    versionCohorts: [{ version: 1, applications: fixtureVacancy.candidates }],
    threshold: fixtures.threshold,
    candidates,
    ineligibleCandidates: [],
    totalApplications: fixtureVacancy.candidates,
    pendingEvaluations: Math.max(0, fixtureVacancy.candidates - candidates.length),
    pendingApplications: [],
  };
}
