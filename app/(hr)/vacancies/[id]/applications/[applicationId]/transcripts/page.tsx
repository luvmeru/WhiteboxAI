import { notFound, redirect } from "next/navigation";
import TranscriptReview from "@/components/hr/TranscriptReview";
import { requireHrSession } from "@/lib/server/auth";
import {
  getTenantApplication,
  getTenantVacancyVersion,
} from "@/lib/server/repository";

export default async function TranscriptReviewPage({
  params,
}: {
  params: Promise<{ id: string; applicationId: string }>;
}) {
  const { id, applicationId } = await params;
  const session = await requireHrSession();
  const application = await getTenantApplication(
    applicationId,
    session.organizationId,
  );
  if (!application || application.vacancyId !== id) notFound();
  const vacancy = await getTenantVacancyVersion(
    application.vacancyId,
    application.vacancyVersion,
    session.organizationId,
  );
  if (!vacancy) notFound();

  const assigned =
    session.role === "Owner" ||
    vacancy.governance.roles.some(
      (reviewer) =>
        reviewer.userId === session.sub &&
        reviewer.role !== "Observer" &&
        reviewer.piiReveal,
    );
  if (!session.piiReveal || !assigned || session.role === "Observer") {
    redirect("/unauthorized");
  }

  const reviewRequired = application.history.filter(
    (turn) =>
      turn.recordingId &&
      (turn.transcript?.reviewStatus === "candidate_correction_pending" ||
        turn.transcript?.reviewStatus === "provider_unavailable"),
  ).length;

  return (
    <div className="contour-bg min-h-[calc(100vh-52px)] p-4 sm:p-6 xl:p-8">
      <div className="mb-6">
        <div className="hud-label">
          {application.internalCandidateId} · {vacancy.profile.title} · ROLE V
          {application.vacancyVersion}
        </div>
        <h1 className="mt-2 font-display text-[26px] font-medium tracking-[-0.015em] text-hi">
          Verify the evidence record before analysis
        </h1>
        <p className="mt-2 max-w-[76ch] text-[13px] leading-relaxed text-mid">
          The provider transcript is immutable. Candidate corrections remain
          separate, and only provider-verified or human-verified text can enter
          the role-alignment analysis. {reviewRequired} turn
          {reviewRequired === 1 ? "" : "s"} currently require human review.
        </p>
      </div>
      <TranscriptReview
        applicationId={application.id}
        initialLockVersion={application.lockVersion}
        initialHistory={application.history}
      />
    </div>
  );
}
