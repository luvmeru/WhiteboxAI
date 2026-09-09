import { NextResponse } from "next/server";
import { authenticateHr, encodeHrSession, sessionCookie } from "@/lib/server/auth";
import {
  ApiError,
  assertSameOriginBrowserRequest,
  getClientKey,
  getRequestId,
  safeRootRelativePath,
  sameOriginRedirectTarget,
} from "@/lib/server/http";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/server/rate-limit";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    assertSameOriginBrowserRequest(request);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "The request origin is not allowed.";
    return NextResponse.json(
      { error: message, code: "INVALID_ORIGIN", requestId },
      { status: 403, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
    );
  }

  let limiter;
  try {
    limiter = await consumeRateLimit(getClientKey(request), {
      namespace: "auth.login",
      limit: 5,
      windowMs: 15 * 60_000,
    });
  } catch {
    return NextResponse.json(
      {
        error: "Request protection is temporarily unavailable.",
        code: "RATE_LIMIT_STORE_UNAVAILABLE",
        requestId,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "5",
          "X-Request-Id": requestId,
        },
      },
    );
  }
  if (!limiter.allowed) {
    const response = NextResponse.redirect(
      sameOriginRedirectTarget(request, "/login?error=rate"),
      303,
    );
    for (const [key, value] of Object.entries(rateLimitHeaders(limiter))) {
      if (value !== undefined) response.headers.set(key, String(value));
    }
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Request-Id", requestId);
    return response;
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim();
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (
    contentType !== "application/x-www-form-urlencoded" ||
    !Number.isSafeInteger(declaredLength) ||
    declaredLength < 1 ||
    declaredLength > 8 * 1024
  ) {
    return NextResponse.json(
      { error: "Invalid sign-in request.", code: "INVALID_LOGIN_REQUEST", requestId },
      { status: 400, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
    );
  }

  const form = await request.formData();
  const email = String(form.get("email") || "").slice(0, 320);
  const password = String(form.get("password") || "").slice(0, 1024);
  const nextValue = String(form.get("next") || "/dashboard");
  const next = safeRootRelativePath(nextValue, "/dashboard");

  let session: Awaited<ReturnType<typeof authenticateHr>>;
  try {
    session = await authenticateHr(email, password);
  } catch {
    return NextResponse.redirect(
      sameOriginRedirectTarget(
        request,
        `/login?error=service&next=${encodeURIComponent(next)}`,
      ),
      303,
    );
  }
  if (!session) {
    return NextResponse.redirect(
      sameOriginRedirectTarget(
        request,
        `/login?error=credentials&next=${encodeURIComponent(next)}`,
      ),
      303,
    );
  }

  const response = NextResponse.redirect(sameOriginRedirectTarget(request, next), 303);
  response.cookies.set(sessionCookie(encodeHrSession(session)));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Request-Id", requestId);
  for (const [key, value] of Object.entries(rateLimitHeaders(limiter))) {
    if (value !== undefined) response.headers.set(key, String(value));
  }
  return response;
}
