import { NextResponse } from "next/server";
import { expiredSessionCookie } from "@/lib/server/auth";
import {
  ApiError,
  assertSameOriginBrowserRequest,
  sameOriginRedirectTarget,
} from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    assertSameOriginBrowserRequest(request);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof ApiError ? error.message : "The request origin is not allowed.",
        code: "INVALID_ORIGIN",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const response = NextResponse.redirect(
    sameOriginRedirectTarget(request, "/login"),
    303,
  );
  response.cookies.set(expiredSessionCookie());
  response.headers.set("Cache-Control", "no-store");
  return response;
}
