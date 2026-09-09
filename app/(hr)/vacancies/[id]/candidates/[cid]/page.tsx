import { notFound } from "next/navigation";
import Scorecard from "@/components/hr/Scorecard";
import { requireHrSession } from "@/lib/server/auth";
import { canAccessCandidateSensitiveDetail } from "@/lib/server/candidate-detail-access";
import { getHrVacancyRanking } from "@/lib/server/hr-data";
import {
  assessmentReviewTargetViews,
  buildAssessmentReviewTargets,
  buildGateWaiverReviewTargets,
} from "@/lib/server/application-evaluation";
import {
  getTenantApplication,
  getTenantVacancyVersion,
  listTenantApplications,
} from "@/lib/server/repository";

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ id: string; cid: string }>;
}) {
  const { id, cid } = await params;
  const session = await requireHrSession();
  if (session.role === "Observer" || !session.piiReveal) notFound();
  const applicationSummaries = await listTenantApplications(
    id,
    session.organizationId,
  );
  const applicationSummary = applicationSummaries.find(
    (application) => application.internalCandidateId === cid,
  );
  const ranking = await getHrVacancyRanking(
    id,
    session.organizationId,
    applicationSummary?.vacancyVersion,
  );
  if (!ranking || (!applicationSummary && ranking.source !== "fixture")) {
    notFound();
  }
  const candidate = [
    ...ranking.candidates,
    ...ranking.ineligibleCandidates,
  ].find((item) => item.internalId === cid);
  if (!candidate) notFound();
  const application = applicationSummary
    ? await getTenantApplication(applicationSummary.id, session.organizationId)
    : null;
  if (applicationSummary && !application) notFound();
  if (
    application &&
    (application.vacancyId !== id ||
      application.vacancyVersion !== applicationSummary?.vacancyVersion)
  ) {
    notFound();
  }
  const vacancy = application
    ? await getTenantVacancyVersion(
        application.vacancyId,
        application.vacancyVersion,
        session.organizationId,
      )
    : null;
  if (application && !vacancy) notFound();
  if (
    application &&
    vacancy &&
    !canAccessCandidateSensitiveDetail(session, vacancy, application)
  ) {
    notFound();
  }
  const assessmentReviewTargets =
    application && vacancy && application.blockResults
      ? assessmentReviewTargetViews(
          [
            ...buildAssessmentReviewTargets(
              vacancy,
              application.blockResults,
              {
                organizationId: application.organizationId,
                applicationId: application.id,
                reviews: application.assessmentReviews ?? [],
              },
            ),
            ...buildGateWaiverReviewTargets(
              vacancy,
              application.evaluation,
              {
                organizationId: application.organizationId,
                applicationId: application.id,
                reviews: application.assessmentReviews ?? [],
              },
            ),
          ],
          session.sub,
        )
      : [];
  const namedReviewer = vacancy?.governance.roles.find(
    (reviewer) => reviewer.userId === session.sub,
  );
  return (
    <Scorecard
      candidate={candidate}
      threshold={vacancy?.scoring.threshold ?? ranking.threshold}
      vacancyTitle={vacancy?.profile.title ?? ranking.vacancy.title}
      vacancyVersion={
        application?.vacancyVersion ?? ranking.vacancy.version
      }
      applicationId={application?.id}
      lockVersion={application?.lockVersion}
      stage={application?.stage}
      interviewHistory={application?.history ?? []}
      assessmentPlan={application?.assessmentPlan}
      assessmentRuns={application?.blockRuns ?? []}
      evaluation={application?.evaluation}
      decisionHistory={application?.humanDecisions ?? []}
      canFinalize={session.role === "Owner" || session.role === "HiringManager"}
      canViewRecordings={Boolean(application && vacancy)}
      requiredIndependentReviews={
        application?.requiredIndependentReviews ?? 1
      }
      currentReviewerId={session.sub}
      currentReviewerName={namedReviewer?.name ?? session.email}
      currentReviewerRole={namedReviewer?.role ?? session.role}
      assessmentReviewTargets={assessmentReviewTargets}
    />
  );
}
