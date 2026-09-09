import { isIP } from "node:net";
import {
  consumeRateLimit,
  rateLimitHeaders,
  type RateLimitPolicy,
  type RateLimitResult,
} from "./rate-limit";
import { getHrSession } from "./auth";
import { getServerEnv } from "./env";

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
const MAX_JSON_DEPTH = 40;
const MAX_JSON_NODES = 100_000;
const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const BASE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly expose: boolean;

  constructor(status: number, code: string, message: string, expose = true) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.expose = expose;
  }
}

export class ValidationError extends ApiError {
  constructor(path: string, expectation: string) {
    super(422, "VALIDATION_ERROR", `Invalid request body: ${path} ${expectation}.`);
    this.name = "ValidationError";
  }
}

export interface ApiPrincipal {
  subject: string;
  roles?: readonly string[];
  organizationId?: string;
  demo?: boolean;
  piiReveal?: boolean;
}

export interface HrAuthContext {
  requestId: string;
  routeId: string;
}

/**
 * Override the application's standard session/RBAC check at server bootstrap.
 * Returning null denies the request. By default, the normal HR cookie session
 * is used; development demo mode supplies its existing demo Owner session.
 */
export type HrApiAuthGuard = (
  request: Request,
  context: HrAuthContext,
) => ApiPrincipal | null | Promise<ApiPrincipal | null>;

const AUTH_GUARD_KEY = Symbol.for("whitebox.api.hr-auth-guard.v1");
type GlobalWithAuthGuard = typeof globalThis & {
  [AUTH_GUARD_KEY]?: HrApiAuthGuard;
};

export function setHrApiAuthGuard(guard: HrApiAuthGuard | null): void {
  const root = globalThis as GlobalWithAuthGuard;
  if (guard) root[AUTH_GUARD_KEY] = guard;
  else delete root[AUTH_GUARD_KEY];
}

export async function authorizeHrApiRequest(
  request: Request,
  context: HrAuthContext,
): Promise<ApiPrincipal> {
  const installedHrAuthGuard = (globalThis as GlobalWithAuthGuard)[AUTH_GUARD_KEY];
  if (installedHrAuthGuard) {
    const principal = await installedHrAuthGuard(request, context);
    if (!principal?.subject) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication is required.");
    }
    return principal;
  }

  const session = await getHrSession();
  if (!session) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication is required.");
  }

  return {
    subject: session.sub,
    roles: [session.role],
    organizationId: session.organizationId,
    demo: session.sub === "usr-demo-owner",
    piiReveal: session.piiReveal,
  };
}

export interface JsonApiContext<TBody> {
  request: Request;
  requestId: string;
  body: TBody;
  principal?: ApiPrincipal;
}

interface JsonApiOptions<TBody> {
  routeId: string;
  validate: (value: unknown) => TBody;
  access?: "public" | "hr";
  sameOrigin?: boolean;
  roles?: readonly string[];
  maxBodyBytes?: number;
  rateLimit: Omit<RateLimitPolicy, "namespace">;
}

export function createJsonApiRoute<TBody, TResult>(
  options: JsonApiOptions<TBody>,
  handler: (context: JsonApiContext<TBody>) => TResult | Response | Promise<TResult | Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const requestId = getRequestId(request);
    let limiter: RateLimitResult | undefined;

    try {
      if (request.method !== "POST") {
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
      }

      try {
        limiter = await consumeRateLimit(getClientKey(request), {
          ...options.rateLimit,
          namespace: options.routeId,
        });
      } catch {
        throw new ApiError(
          503,
          "RATE_LIMIT_STORE_UNAVAILABLE",
          "Request protection is temporarily unavailable. Please retry shortly.",
        );
      }
      if (!limiter.allowed) {
        throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please try again later.");
      }

      if (options.access === "hr" || options.sameOrigin) {
        assertSameOriginBrowserRequest(request);
      }
      const principal =
        options.access === "hr"
          ? await authorizeHrApiRequest(request, { requestId, routeId: options.routeId })
          : undefined;
      if (
        options.roles?.length &&
        !principal?.roles?.some((role) => options.roles!.includes(role))
      ) {
        throw new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action.");
      }
      const input = await readJsonBody(request, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
      const body = options.validate(input);
      const result = await handler({ request, requestId, body, principal });
      if (result instanceof Response) {
        return decorateResponse(result, requestId, limiter);
      }
      return jsonResponse(result, 200, requestId, limiter);
    } catch (error) {
      const normalized = normalizeError(error);
      if (!normalized.expected) {
        const errorName = error instanceof Error ? error.name : "UnknownError";
        const developmentDetail =
          process.env.NODE_ENV !== "production" && error instanceof Error
            ? `: ${error.message.slice(0, 500)}`
            : "";
        console.error(
          `[api:${options.routeId}] request ${requestId} failed (${errorName})${developmentDetail}`,
        );
      }
      return jsonResponse(
        {
          error: normalized.message,
          code: normalized.code,
          requestId,
        },
        normalized.status,
        requestId,
        limiter,
        normalized.status === 405
          ? { Allow: "POST" }
          : normalized.status === 401
            ? { "WWW-Authenticate": 'Bearer realm="WhiteBox API"' }
            : undefined,
      );
    }
  };
}

function decorateResponse(
  response: Response,
  requestId: string,
  limiter?: RateLimitResult,
): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(BASE_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  headers.set("X-Request-Id", requestId);
  if (limiter) {
    for (const [key, value] of Object.entries(rateLimitHeaders(limiter))) {
      if (value !== undefined) headers.set(key, String(value));
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function readJsonBody(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("maxBodyBytes must be a positive integer.");
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (
    !contentType ||
    (contentType !== "application/json" && !contentType.endsWith("+json"))
  ) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
  }

  const contentEncoding = request.headers.get("content-encoding")?.trim().toLowerCase();
  if (contentEncoding && contentEncoding !== "identity") {
    throw new ApiError(415, "UNSUPPORTED_CONTENT_ENCODING", "Compressed request bodies are not supported.");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new ApiError(400, "INVALID_CONTENT_LENGTH", "Invalid Content-Length header.");
    }
    if (length > maxBytes) {
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", `Request body must not exceed ${maxBytes} bytes.`);
    }
  }

  if (!request.body) {
    throw new ApiError(400, "EMPTY_BODY", "A JSON request body is required.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "PAYLOAD_TOO_LARGE", `Request body must not exceed ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "BODY_READ_FAILED", "The request body could not be read.");
  }

  if (total === 0) {
    throw new ApiError(400, "EMPTY_BODY", "A JSON request body is required.");
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ApiError(400, "INVALID_ENCODING", "The request body must be valid UTF-8.");
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "The request body contains invalid JSON.");
  }

  assertSafeJsonTree(value);
  return value;
}

function assertSafeJsonTree(root: unknown): void {
  const stack: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }];
  let nodes = 0;

  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > MAX_JSON_NODES) {
      throw new ApiError(413, "JSON_TOO_COMPLEX", "The JSON request body is too complex.");
    }
    if (current.depth > MAX_JSON_DEPTH) {
      throw new ApiError(413, "JSON_TOO_DEEP", "The JSON request body is nested too deeply.");
    }
    if (!current.value || typeof current.value !== "object") continue;

    if (Array.isArray(current.value)) {
      for (const value of current.value) stack.push({ value, depth: current.depth + 1 });
      continue;
    }

    for (const [key, value] of Object.entries(current.value)) {
      if (FORBIDDEN_OBJECT_KEYS.has(key)) {
        throw new ApiError(400, "UNSAFE_JSON_KEY", "The JSON request body contains a forbidden key.");
      }
      stack.push({ value, depth: current.depth + 1 });
    }
  }
}

function normalizeError(error: unknown): {
  status: number;
  code: string;
  message: string;
  expected: boolean;
} {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.expose ? error.message : "The request could not be completed.",
      expected: true,
    };
  }
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "The request could not be completed.",
    expected: false,
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  requestId: string,
  limiter?: RateLimitResult,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(BASE_HEADERS);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Request-Id", requestId);
  if (limiter) {
    for (const [key, value] of Object.entries(rateLimitHeaders(limiter))) {
      if (value !== undefined) headers.set(key, String(value));
    }
  }
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export function getRequestId(request: Request): string {
  const inbound = request.headers.get("x-request-id")?.trim();
  if (inbound && SAFE_REQUEST_ID.test(inbound)) return inbound;
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function assertSameOriginBrowserRequest(request: Request): void {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") {
    throw new ApiError(403, "CROSS_SITE_REQUEST", "Cross-site requests are not allowed.");
  }

  const origin = request.headers.get("origin");
  if (!origin) return;
  if (origin === "null") {
    throw new ApiError(403, "INVALID_ORIGIN", "The request origin is not allowed.");
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new ApiError(403, "INVALID_ORIGIN", "The request origin is not allowed.");
  }

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || requestUrl.host;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  const protocol = forwardedProtocol || requestUrl.protocol.replace(":", "");
  const expectedOrigin = `${protocol}://${host}`;

  if (parsedOrigin.origin !== expectedOrigin) {
    throw new ApiError(403, "INVALID_ORIGIN", "The request origin is not allowed.");
  }
}

/**
 * Builds a redirect target on the browser-visible origin after the caller has
 * applied the same-origin request check. In local development and behind some
 * reverse proxies, `request.url` can contain an internal host (for example
 * `localhost`) even though the browser reached the app through 127.0.0.1 or a
 * public hostname. Redirecting against that internal URL would cross origins,
 * lose host-only cookies, and be rejected by CSP `form-action 'self'`.
 */
export function sameOriginRedirectTarget(request: Request, path: string): URL {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\")
  ) {
    throw new Error("Redirect target must be a root-relative path.");
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    assertSameOriginBrowserRequest(request);
    const baseOrigin = new URL(origin).origin;
    const target = new URL(path, `${baseOrigin}/`);
    if (target.origin !== baseOrigin) {
      throw new Error("Redirect target must remain on the request origin.");
    }
    return target;
  }

  const baseOrigin = new URL(request.url).origin;
  const target = new URL(path, `${baseOrigin}/`);
  if (target.origin !== baseOrigin) {
    throw new Error("Redirect target must remain on the request origin.");
  }
  return target;
}

export function safeRootRelativePath(value: string, fallback: string): string {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return fallback;
  }
  try {
    const base = "https://whitebox.invalid";
    const target = new URL(value, `${base}/`);
    return target.origin === base
      ? `${target.pathname}${target.search}${target.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

export function getClientKey(request: Request): string {
  const trustedHeader = getServerEnv().WBX_TRUSTED_PROXY_HEADER;
  const forwarded = trustedHeader
    ? request.headers.get(trustedHeader)?.split(",", 1)[0]?.trim()
    : undefined;
  const address =
    forwarded && forwarded.length <= 64 && isIP(forwarded)
      ? forwarded
      : undefined;
  const userAgent = request.headers.get("user-agent")?.slice(0, 256) ?? "unknown";
  return hashKey(
    address ??
      `${trustedHeader && forwarded ? "invalid-proxy-address" : "local-client"}\u0000${userAgent}`,
  );
}

function hashKey(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function expectObject(value: unknown, path = "body"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(path, "must be an object");
  }
  return value as Record<string, unknown>;
}

export function expectOnlyKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  path = "body",
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(object).find((key) => !allowedSet.has(key));
  if (unknown) throw new ValidationError(`${path}.${unknown}`, "is not allowed");
}

export interface StringOptions {
  min?: number;
  max?: number;
  trim?: boolean;
}

export function expectString(value: unknown, path: string, options: StringOptions = {}): string {
  if (typeof value !== "string") throw new ValidationError(path, "must be a string");
  const normalized = options.trim === false ? value : value.trim();
  if (options.min !== undefined && normalized.length < options.min) {
    throw new ValidationError(path, `must contain at least ${options.min} characters`);
  }
  if (options.max !== undefined && normalized.length > options.max) {
    throw new ValidationError(path, `must contain at most ${options.max} characters`);
  }
  return normalized;
}

export function optionalString(
  value: unknown,
  path: string,
  options: StringOptions = {},
): string | undefined {
  return value === undefined ? undefined : expectString(value, path, options);
}

export function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new ValidationError(path, "must be a boolean");
  return value;
}

export function expectNumber(
  value: unknown,
  path: string,
  options: { min?: number; max?: number; integer?: boolean } = {},
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(path, "must be a finite number");
  }
  if (options.integer && !Number.isSafeInteger(value)) {
    throw new ValidationError(path, "must be an integer");
  }
  if (options.min !== undefined && value < options.min) {
    throw new ValidationError(path, `must be at least ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new ValidationError(path, `must be at most ${options.max}`);
  }
  return value;
}

export function expectArray(
  value: unknown,
  path: string,
  options: { min?: number; max?: number } = {},
): unknown[] {
  if (!Array.isArray(value)) throw new ValidationError(path, "must be an array");
  if (options.min !== undefined && value.length < options.min) {
    throw new ValidationError(path, `must contain at least ${options.min} item(s)`);
  }
  if (options.max !== undefined && value.length > options.max) {
    throw new ValidationError(path, `must contain at most ${options.max} item(s)`);
  }
  return value;
}

export function expectEnum<const T extends readonly string[]>(
  value: unknown,
  path: string,
  allowed: T,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ValidationError(path, `must be one of: ${allowed.join(", ")}`);
  }
  return value as T[number];
}
