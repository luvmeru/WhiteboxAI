import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { StatusPill } from "@/components/ui/primitives";
import { requireHrSession } from "@/lib/server/auth";
import {
  listTenantApplications,
  listTenantVacancies,
} from "@/lib/server/repository";

export default async function VacanciesPage() {
  const session = await requireHrSession();
  const vacancies = await listTenantVacancies(session.organizationId);
  const rows = await Promise.all(
    vacancies.map(async (vacancy) => {
      const applications = await listTenantApplications(vacancy.id, session.organizationId);
      return {
        vacancy,
        applications,
        needsReview: applications.filter((application) =>
          ["under_review", "needs_adjudication"].includes(application.stage),
        ).length,
      };
    }),
  );

  return (
    <div className="contour-bg contour-bg-soft min-h-[calc(100vh-52px)] p-4 sm:p-6 xl:p-8">
      <div className="flex items-end justify-between gap-6">
        <div>
          <div className="hud-label">Portfolio</div>
          <h1 className="mt-2 font-display text-[29px]">Vacancies</h1>
          <p className="mt-2 text-[13px] text-mid">
            Create structured interviews, share access codes, and track every candidate through evidence-backed review.
          </p>
        </div>
        <Link
          href="/vacancies/new"
          className="inline-flex items-center gap-2 rounded-lg bg-paper px-4 py-2.5 text-[13px] font-medium text-void"
        >
          <Plus className="size-4" /> Create vacancy
        </Link>
      </div>

      <div className="mt-7 overflow-x-auto rounded-xl border border-hairline bg-surface">
        <table className="min-w-[760px] w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-hairline">
              {["POSITION", "STATUS", "CODE", "CANDIDATES", "NEEDS REVIEW", ""].map((heading) => (
                <th key={heading} className="hud-label px-5 py-3 font-normal">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ vacancy, applications, needsReview }) => (
              <tr key={vacancy.id} className="border-b border-hairline last:border-0">
                <td className="px-5 py-4">
                  <div className="text-[14px] font-medium text-hi">{vacancy.profile.title}</div>
                  <div className="mt-1 font-mono text-[10px] text-lo">
                    v{vacancy.configVersion} · {vacancy.id}
                  </div>
                </td>
                <td className="px-5"><StatusPill label={vacancy.status} /></td>
                <td className="px-5 font-mono text-mid">{vacancy.code || "—"}</td>
                <td className="px-5 font-mono text-hi">{applications.length}</td>
                <td className={`px-5 font-mono ${needsReview ? "text-warn" : "text-lo"}`}>
                  {needsReview || "—"}
                </td>
                <td className="px-5 text-right">
                  <Link
                    href={`/vacancies/${vacancy.id}/ranking`}
                    className="inline-flex items-center gap-1 text-irisc hover:text-hi"
                  >
                    Open <ArrowRight className="size-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-12 text-center">
            <div className="text-[14px] text-hi">No vacancies yet</div>
            <p className="mt-2 text-[12px] text-lo">
              Create your first vacancy and WhiteBox will turn the hiring brief into a complete interview workflow.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
