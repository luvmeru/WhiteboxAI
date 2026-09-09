import { NextResponse } from "next/server";
import { requireHrSession } from "@/lib/server/auth";
import { listTenantVacancies } from "@/lib/server/repository";

export async function GET() {
  const session = await requireHrSession(["Owner", "HiringManager", "TechnicalReviewer", "Observer"]);
  const vacancies = await listTenantVacancies(session.organizationId);
  return NextResponse.json(
    { vacancies },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

