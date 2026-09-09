import { NextResponse } from "next/server";

/**
 * The prototype endpoint accepted the complete interview plan and history from
 * the browser. It is intentionally retired: candidate interviews now use the
 * authenticated, server-owned `/api/candidate/interviews/:id/turn` endpoint.
 */
export function POST() {
  return NextResponse.json(
    {
      error: "This endpoint has been retired. Resume the interview through the secure candidate session.",
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
