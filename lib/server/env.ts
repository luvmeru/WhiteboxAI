import { z } from "zod";
import { readLocalOpenAIKey } from "./local-api-key";

const optionalUrl = z.string().url().optional();
const optionalTrimmed = (minimum: number, maximum: number) =>
  z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(minimum).max(maximum).optional(),
  );

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: optionalUrl,
  WBX_AUTH_SECRET: z.string().min(32).optional(),
  WBX_AUDIT_SECRET: z.string().min(32).optional(),
  WBX_ADMIN_EMAIL: z.string().email().optional(),
  WBX_ADMIN_PASSWORD_HASH: z.string().startsWith("scrypt$").optional(),
  WBX_DEMO_MODE: z.enum(["true", "false"]).optional(),
  OPENAI_API_KEY: z.string().min(20).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-5.6-terra"),
  OPENAI_TRANSCRIBE_MODEL: z.string().min(1).default("gpt-4o-transcribe"),
  AI_PROVIDER: z.enum(["openai", "disabled"]).optional(),
  NEXT_PUBLIC_APP_URL: optionalUrl,
  WBX_MEDIA_RECEIPT_SECRET: z.string().min(32).optional(),
  WBX_MEDIA_S3_ENDPOINT: optionalUrl,
  WBX_MEDIA_S3_REGION: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/).optional(),
  WBX_MEDIA_S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/).optional(),
  WBX_MEDIA_S3_ACCESS_KEY_ID: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,255}$/).optional(),
  WBX_MEDIA_S3_SECRET_ACCESS_KEY: z.string().min(16).max(1024).optional(),
  WBX_MEDIA_S3_SESSION_TOKEN: optionalTrimmed(8, 4096),
  WBX_MEDIA_S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).optional(),
  WBX_MEDIA_S3_SSE: z.enum(["AES256", "aws:kms"]).optional(),
  WBX_MEDIA_S3_KMS_KEY_ID: optionalTrimmed(1, 2048),
  WBX_FFPROBE_PATH: optionalTrimmed(1, 1024),
  WBX_TRUSTED_PROXY_HEADER: z.enum([
    "cf-connecting-ip",
    "x-vercel-forwarded-for",
    "x-real-ip",
    "x-forwarded-for",
  ]).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

const PLACEHOLDER_VALUE =
  /(?:replace[-_ ]?with|change[-_ ]?me|generated[-_ ]?value|example\.com)/i;

function isUsableConfiguredValue(value: string | undefined): value is string {
  return Boolean(value && !PLACEHOLDER_VALUE.test(value));
}

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const localOpenAIKey =
    process.env.OPENAI_API_KEY || process.env.NODE_ENV === "production"
      ? undefined
      : readLocalOpenAIKey();
  const result = serverEnvSchema.safeParse({
    ...process.env,
    ...(localOpenAIKey ? { OPENAI_API_KEY: localOpenAIKey } : {}),
  });
  if (!result.success) {
    const summary = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server configuration: ${summary}`);
  }
  cached = result.data;
  return cached;
}

export function isDemoMode(): boolean {
  const env = getServerEnv();
  return env.NODE_ENV !== "production" && env.WBX_DEMO_MODE === "true";
}

export function isDevelopmentDemoMode(): boolean {
  return getServerEnv().NODE_ENV !== "production" && isDemoMode();
}

export function isOpenAIEnabled(): boolean {
  const env = getServerEnv();
  return (
    env.AI_PROVIDER ??
    (env.OPENAI_API_KEY ? "openai" : "disabled")
  ) === "openai";
}

export function assertOpenAIProviderConfigured(): void {
  const env = getServerEnv();
  if (
    !isOpenAIEnabled() ||
    !isUsableConfiguredValue(env.OPENAI_API_KEY)
  ) {
    throw new Error(
      "This operation requires the real OpenAI provider; configure a server-only API key and AI_PROVIDER=openai.",
    );
  }
}

export interface ReadinessCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export function productionReadiness(): ReadinessCheck[] {
  const env = getServerEnv();
  const demo = isDemoMode();
  const aiProvider =
    env.AI_PROVIDER ?? (env.OPENAI_API_KEY ? "openai" : "disabled");
  const databaseReady = isUsableConfiguredValue(env.DATABASE_URL);
  const authSecretReady = isUsableConfiguredValue(env.WBX_AUTH_SECRET);
  const auditSecretReady = isUsableConfiguredValue(
    env.WBX_AUDIT_SECRET ?? env.WBX_AUTH_SECRET,
  );
  const adminReady =
    isUsableConfiguredValue(env.WBX_ADMIN_EMAIL) &&
    isUsableConfiguredValue(env.WBX_ADMIN_PASSWORD_HASH);
  const openAiReady =
    aiProvider === "openai" &&
    isUsableConfiguredValue(env.OPENAI_API_KEY);
  const publicAppUrlReady = Boolean(
    env.NEXT_PUBLIC_APP_URL &&
      env.NEXT_PUBLIC_APP_URL.startsWith("https://") &&
      isUsableConfiguredValue(env.NEXT_PUBLIC_APP_URL),
  );
  const mediaStorageReady = Boolean(
    isUsableConfiguredValue(env.WBX_MEDIA_S3_ENDPOINT) &&
    env.WBX_MEDIA_S3_REGION &&
    env.WBX_MEDIA_S3_BUCKET &&
    isUsableConfiguredValue(env.WBX_MEDIA_S3_ACCESS_KEY_ID) &&
    isUsableConfiguredValue(env.WBX_MEDIA_S3_SECRET_ACCESS_KEY) &&
    env.WBX_MEDIA_S3_ENDPOINT.startsWith("https://"),
  );
  const mediaReceiptReady = isUsableConfiguredValue(
    env.WBX_MEDIA_RECEIPT_SECRET ?? env.WBX_AUTH_SECRET,
  );

  return [
    {
      id: "database",
      ok: databaseReady || demo,
      detail: databaseReady ? "PostgreSQL configured." : demo ? "Development file store enabled." : "A non-placeholder DATABASE_URL is required.",
    },
    {
      id: "auth-secret",
      ok: authSecretReady || demo,
      detail: authSecretReady ? "Session signing secret configured." : demo ? "Development-only secret in use." : "A non-placeholder WBX_AUTH_SECRET is required.",
    },
    {
      id: "audit-secret",
      ok: auditSecretReady || demo,
      detail: auditSecretReady ? "Audit HMAC secret configured." : demo ? "Development-only secret in use." : "A non-placeholder WBX_AUDIT_SECRET or WBX_AUTH_SECRET is required.",
    },
    {
      id: "admin",
      ok: adminReady || demo,
      detail: adminReady ? "Bootstrap administrator configured." : demo ? "Development administrator enabled." : "Non-placeholder administrator credentials are required.",
    },
    {
      id: "ai-provider",
      ok: openAiReady || demo,
      detail: openAiReady
        ? `OpenAI ${env.OPENAI_MODEL} and ${env.OPENAI_TRANSCRIBE_MODEL} configured.`
        : demo
          ? "AI generation is disabled; only frozen development fixtures are available."
          : "OPENAI_API_KEY and AI_PROVIDER=openai are required.",
    },
    {
      id: "public-app-url",
      ok: publicAppUrlReady || env.NODE_ENV !== "production",
      detail: publicAppUrlReady
        ? "Public HTTPS application origin configured."
        : env.NODE_ENV !== "production"
          ? "Development may use a local HTTP application origin."
          : "A non-placeholder HTTPS NEXT_PUBLIC_APP_URL is required.",
    },
    {
      id: "demo-disabled",
      ok: env.NODE_ENV !== "production" || env.WBX_DEMO_MODE !== "true",
      detail:
        env.NODE_ENV === "production" && env.WBX_DEMO_MODE === "true"
          ? "WBX_DEMO_MODE=true is forbidden in production."
          : demo
            ? "Development demo mode is active."
            : "Demo mode is disabled.",
    },
    {
      id: "media-storage",
      ok: mediaStorageReady || env.NODE_ENV !== "production",
      detail: mediaStorageReady
        ? "Private S3-compatible recording storage configured."
        : env.NODE_ENV !== "production"
          ? "Development-only private filesystem recording storage enabled."
          : "HTTPS S3-compatible recording storage credentials are required.",
    },
    {
      id: "media-receipts",
      ok: mediaReceiptReady || demo,
      detail: isUsableConfiguredValue(env.WBX_MEDIA_RECEIPT_SECRET)
        ? "Dedicated recording receipt secret configured."
        : authSecretReady
          ? "Recording receipts use the authentication signing secret."
          : demo
            ? "Development-only receipt secret in use."
            : "WBX_MEDIA_RECEIPT_SECRET or WBX_AUTH_SECRET is required.",
    },
    {
      id: "media-probe",
      ok: true,
      detail:
        env.NODE_ENV !== "production"
          ? "Development demo accepts browser-generated synthetic media."
          : "FFprobe availability is verified by the readiness endpoint.",
    },
    {
      id: "client-identity",
      ok: Boolean(env.WBX_TRUSTED_PROXY_HEADER) || env.NODE_ENV !== "production",
      detail: env.WBX_TRUSTED_PROXY_HEADER
        ? `Rate limits use the trusted, proxy-overwritten ${env.WBX_TRUSTED_PROXY_HEADER} header.`
        : env.NODE_ENV !== "production"
          ? "Development rate limits use a local browser identity."
          : "WBX_TRUSTED_PROXY_HEADER is required behind a proxy that strips and overwrites that header.",
    },
  ];
}

export function assertProductionReady(): void {
  if (getServerEnv().NODE_ENV !== "production") return;
  const failed = productionReadiness().filter((check) => !check.ok);
  if (failed.length) {
    throw new Error(`Production configuration is incomplete: ${failed.map((check) => check.detail).join(" ")}`);
  }
}
