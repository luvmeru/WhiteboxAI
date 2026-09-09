import { NextResponse } from "next/server";

/**
 * Retired because the prototype endpoint accepted vacancy weights, rubrics and
 * candidate evidence from the caller. Evaluation now loads immutable server
 * records at `/api/hr/applications/:id/evaluate`.
 */
export function POST() {
  return NextResponse.json(
    {
      error: "This endpoint has been retired. Use the authenticated application evaluation command.",
      code: "ENDPOINT_RETIRED",
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
