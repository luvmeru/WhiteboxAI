import RankingTable from "@/components/hr/RankingTable";
import PendingEvaluations from "@/components/hr/PendingEvaluations";
import IneligibleEvaluations from "@/components/hr/IneligibleEvaluations";
import { StatusPill } from "@/components/ui/primitives";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHrSession } from "@/lib/server/auth";
import {
  getHrVacancyRanking,
  rankingSummaryView,
} from "@/lib/server/hr-data";
import { getTenantVacancyVersion } from "@/lib/server/repository";
import { authorizeReviewer } from "@/lib/server/reviewer-authorization";

export default async function RankingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { id } = await params;
  const { version: rawVersion } = await searchParams;
  const requestedVersion =
    rawVersion === undefined ? undefined : Number(rawVersion);
  if (
    requestedVersion !== undefined &&
    (!Number.isInteger(requestedVersion) || requestedVersion < 1)
  ) {
    notFound();
  }
  const session = await requireHrSession();
  const ranking = await getHrVacancyRanking(
    id,
    session.organizationId,
    requestedVersion,
  );
  if (!ranking) notFound();
  const frozenVacancy = await getTenantVacancyVersion(
    id,
    ranking.vacancy.version,
    session.organizationId,
  );
  if (
    !frozenVacancy ||
    !authorizeReviewer({
      session,
      vacancy: frozenVacancy,
      capability: "aggregate_read",
    }).allowed
  ) {
    notFound();
  }
  const rankingSummary = rankingSummaryView(ranking);
  const { vacancy } = rankingSummary;
  return (
    <div className="contour-bg min-h-[calc(100vh-52px)] p-4 sm:p-6 xl:p-8">
      <div className="mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[24px] font-medium tracking-[-0.015em] text-hi">{vacancy.title}</h1>
            <StatusPill label={vacancy.status} />
          </div>
          <div className="mt-1.5 font-mono text-[10px] text-lo">{vacancy.code} · {rankingSummary.totalApplications} candidates</div>
          <p className="mt-2 max-w-[72ch] text-[12px] leading-relaxed text-mid">
            Compare submitted evidence with the requirements frozen in vacancy
            version {vacancy.version}, then open any candidate to inspect the
            quoted evidence and record a human decision.
          </p>
          <nav
            aria-label="Vacancy version"
            className="mt-3 flex flex-wrap gap-2"
          >
            {rankingSummary.versionCohorts.map((cohort) => (
              <Link
                key={cohort.version}
                href={`/vacancies/${id}/ranking?version=${cohort.version}`}
                aria-current={
                  cohort.version === vacancy.version ? "page" : undefined
                }
                className={`rounded-md border px-2.5 py-1 font-mono text-[10px] ${
                  cohort.version === vacancy.version
                    ? "border-irisb/50 bg-white/5 text-hi"
                    : "border-hairline text-lo hover:text-hi"
                }`}
              >
                V{cohort.version} · {cohort.applications}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <PendingEvaluations
        applications={rankingSummary.pendingApplications}
        canEvaluate={session.role !== "Observer"}
        canReviewTranscripts={
          session.role !== "Observer" && session.piiReveal
        }
        vacancyId={vacancy.id}
      />
      <IneligibleEvaluations
        candidates={rankingSummary.ineligibleCandidates}
        vacancyId={vacancy.id}
      />
      <RankingTable
        candidates={rankingSummary.candidates}
        threshold={rankingSummary.threshold}
        vacancyId={vacancy.id}
        vacancyTitle={vacancy.title}
        vacancyVersion={vacancy.version}
        totalApplications={rankingSummary.totalApplications}
        pendingEvaluations={rankingSummary.pendingEvaluations}
      />
    </div>
  );
}
