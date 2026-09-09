import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  ClipboardCheck,
  Gauge,
  Users,
} from "lucide-react";
import { StatusPill } from "@/components/ui/primitives";
import { requireHrSession } from "@/lib/server/auth";
import {
  listTenantApplications,
  listTenantVacancies,
} from "@/lib/server/repository";

export default async function Dashboard() {
  const session = await requireHrSession();
  const vacancies = await listTenantVacancies(session.organizationId);
  const applicationsByVacancy = await Promise.all(
    vacancies.map(async (vacancy) => ({
      vacancy,
      applications: await listTenantApplications(vacancy.id, session.organizationId),
    })),
  );
  const applications = applicationsByVacancy.flatMap((item) => item.applications);
  const reviewApplications = applications.filter((application) =>
    ["under_review", "needs_adjudication"].includes(application.stage),
  );
  const metrics = [
    {
      label: "Open vacancies",
      value: vacancies.filter((vacancy) => vacancy.status === "LIVE").length,
      icon: Briefcase,
      accent: "var(--iris-b)",
    },
    {
      label: "Candidates",
      value: applications.length,
      icon: Users,
      accent: "var(--iris-c)",
    },
    {
      label: "Need review",
      value: reviewApplications.length,
      icon: ClipboardCheck,
      accent: "var(--warn)",
    },
    {
      label: "Evaluated",
      value: applications.filter((application) => application.evaluation).length,
      icon: Gauge,
      accent: "var(--pos)",
    },
  ];
  const displayName = session.email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return (
    <div className="contour-bg contour-bg-soft min-h-[calc(100vh-52px)] p-4 sm:p-6 xl:p-8">
      <div className="relative min-h-40 overflow-hidden rounded-2xl border border-hairline-strong bg-surface">
        <div
          className="absolute inset-y-0 right-0 w-[54%] bg-cover bg-center opacity-[0.22]"
          style={{ backgroundImage: "url(/textures/engraving-cube.jpeg)" }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--surface)_0%,var(--surface)_47%,rgba(15,15,17,.35)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-px iris-line opacity-70" />
        <div className="relative flex min-h-40 items-center justify-between gap-6 p-6">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-irisc">
              {session.organizationName} · secure workspace
            </div>
            <h1 className="mt-2 font-display text-[30px] font-medium tracking-[-0.02em] text-hi">
              Welcome, {displayName}
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-mid">
              Standardize the first interview without adding recruiter calls. Review comparable evidence, focus live time on the strongest matches, and reuse the workflow as hiring volume grows.
            </p>
            <div className="mt-3 font-mono text-[10px] text-lo">
              {reviewApplications.length
                ? `${reviewApplications.length} application${reviewApplications.length === 1 ? "" : "s"} ready for human review`
                : "Review queue is clear"}
            </div>
          </div>
          <Link
            href="/vacancies/new"
            className="self-end rounded-lg bg-paper px-4 py-2.5 text-[13px] font-medium text-void shadow-[0_0_30px_rgba(255,255,255,.08)]"
          >
            Create vacancy
          </Link>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon, accent }) => (
          <div
            key={label}
            className="card-hover relative overflow-hidden rounded-xl border border-hairline bg-surface p-4"
          >
            <span
              className="absolute inset-x-0 top-0 h-px opacity-80"
              style={{ background: accent }}
            />
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-mid">{label}</span>
              <span className="grid size-7 place-items-center rounded-lg bg-white/[0.035]">
                <Icon className="size-3.5" style={{ color: accent }} strokeWidth={1.5} />
              </span>
            </div>
            <div className="mt-3 font-display text-[28px] leading-none text-hi">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-7 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-medium text-hi">Recent vacancies</h2>
            <Link href="/vacancies" className="flex items-center gap-1 text-[12px] text-mid hover:text-hi">
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
            {applicationsByVacancy.slice(0, 5).map(({ vacancy, applications: vacancyApplications }) => (
              <Link
                key={vacancy.id}
                href={`/vacancies/${vacancy.id}/ranking`}
                className="group grid grid-cols-[minmax(0,1fr)_92px_100px_18px] items-center gap-4 border-b border-hairline px-5 py-4 last:border-0 hover:bg-white/[0.025]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium text-hi">{vacancy.profile.title}</div>
                  <div className="mt-1 font-mono text-[10px] text-lo">{vacancy.code || "DRAFT"}</div>
                </div>
                <StatusPill label={vacancy.status} />
                <div className="text-right">
                  <div className="font-mono text-[12px] text-hi">{vacancyApplications.length}</div>
                  <div className="text-[10px] text-lo">candidates</div>
                </div>
                <ArrowRight className="size-3.5 text-lo group-hover:text-hi" />
              </Link>
            ))}
            {vacancies.length === 0 && (
              <div className="p-8 text-center text-[13px] text-lo">
                No vacancies yet. Create and publish the first structured interview.
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-medium text-hi">Needs review</h2>
            <span className="rounded-full bg-warn/10 px-2 py-0.5 font-mono text-[10px] text-warn">
              {reviewApplications.length}
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
            {reviewApplications.slice(0, 5).map((application) => (
              <Link
                key={application.id}
                href={
                  application.evaluation
                    ? `/vacancies/${application.vacancyId}/candidates/${application.internalCandidateId}`
                    : `/vacancies/${application.vacancyId}/ranking`
                }
                className="group flex items-start gap-3 border-b border-hairline px-4 py-4 last:border-0 hover:bg-white/[0.025]"
              >
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] text-hi">{application.internalCandidateId}</div>
                  <div className="mt-1 text-[12px] leading-relaxed text-mid">
                    {application.evaluation
                      ? "AI evidence package is ready for human adjudication."
                      : "Interview submitted; evaluation has not been run yet."}
                  </div>
                </div>
                <ArrowRight className="mt-1 size-3.5 shrink-0 text-lo group-hover:text-hi" />
              </Link>
            ))}
            {reviewApplications.length === 0 && (
              <div className="p-8 text-center text-[12px] text-lo">
                The review queue is clear.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
