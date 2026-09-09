import { NextResponse } from "next/server";
import { requireHrSession } from "@/lib/server/auth";
import {
  getHrVacancyRanking,
  rankingSummaryView,
} from "@/lib/server/hr-data";
import { getTenantVacancyVersion } from "@/lib/server/repository";
import { authorizeReviewer } from "@/lib/server/reviewer-authorization";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireHrSession([
    "Owner",
    "HiringManager",
    "TechnicalReviewer",
    "Observer",
  ]);
  const { id } = await params;
  const rawVersion = new URL(request.url).searchParams.get("version");
  const requestedVersion =
    rawVersion === null ? undefined : Number(rawVersion);
  if (
    requestedVersion !== undefined &&
    (!Number.isInteger(requestedVersion) || requestedVersion < 1)
  ) {
    return NextResponse.json(
      { error: "Vacancy version must be a positive integer." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const ranking = await getHrVacancyRanking(
    id,
    session.organizationId,
    requestedVersion,
  );
  if (!ranking) {
    return NextResponse.json(
      { error: "Vacancy not found." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const vacancy = await getTenantVacancyVersion(
    id,
    ranking.vacancy.version,
    session.organizationId,
  );
  if (!vacancy) {
    return NextResponse.json(
      { error: "Vacancy version not found." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const reviewerAccess = authorizeReviewer({
    session,
    vacancy,
    capability: "aggregate_read",
  });
  if (!reviewerAccess.allowed) {
    return NextResponse.json(
      {
        error: reviewerAccess.message ?? "Vacancy access is not permitted.",
        code: reviewerAccess.code,
      },
      {
        status: reviewerAccess.status ?? 403,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
  return NextResponse.json(rankingSummaryView(ranking), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
