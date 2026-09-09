import { NextResponse } from "next/server";
import { databaseConfigured, pingDatabase } from "@/lib/server/db";
import { getServerEnv, productionReadiness } from "@/lib/server/env";
import { videoProbeAvailable } from "@/lib/server/video-analysis";

export async function GET() {
  const checks = productionReadiness();
  if (databaseConfigured()) {
    const database = checks.find((check) => check.id === "database");
    if (database) {
      database.ok = await pingDatabase();
      database.detail = database.ok ? "PostgreSQL reachable." : "PostgreSQL is configured but unreachable.";
    }
  }
  if (getServerEnv().NODE_ENV === "production") {
    const mediaProbe = checks.find((check) => check.id === "media-probe");
    if (mediaProbe) {
      mediaProbe.ok = await videoProbeAvailable();
      mediaProbe.detail = mediaProbe.ok
        ? "FFprobe is available for server-side audio/video track and duration validation."
        : "FFprobe is required for production video validation.";
    }
  }
  const ready = checks.every((check) => check.ok);
  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      environment: getServerEnv().NODE_ENV,
      checks,
      timestamp: new Date().toISOString(),
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
