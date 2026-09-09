import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  assertOpenAIProviderConfigured,
  productionReadiness,
} from "../lib/server/env";
import { vacancyV2Demo } from "../lib/fixtures";
import { nextLegacyDeterministicInterviewStep } from "../lib/server/legacy-demo-ai";

test("production readiness rejects checked-in placeholder configuration", () => {
  Object.assign(process.env, {
    NODE_ENV: "production",
    WBX_DEMO_MODE: "false",
    NEXT_PUBLIC_APP_URL: "https://whitebox.example.com",
    DATABASE_URL:
      "postgresql://whitebox:change-me@database:5432/whitebox",
    WBX_AUTH_SECRET:
      "replace-with-at-least-32-random-characters",
    WBX_AUDIT_SECRET:
      "replace-with-another-32-character-secret",
    WBX_ADMIN_EMAIL: "owner@example.com",
    WBX_ADMIN_PASSWORD_HASH:
      "scrypt$replace-with-generated-value",
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: "replace-with-openai-api-key",
    WBX_MEDIA_RECEIPT_SECRET:
      "replace-with-a-third-independent-32-character-secret",
    WBX_MEDIA_S3_ENDPOINT: "https://s3.example.com",
    WBX_MEDIA_S3_REGION: "us-east-1",
    WBX_MEDIA_S3_BUCKET: "whitebox-private-evidence",
    WBX_MEDIA_S3_ACCESS_KEY_ID:
      "replace-with-scoped-access-key",
    WBX_MEDIA_S3_SECRET_ACCESS_KEY:
      "replace-with-scoped-secret-key",
  });

  const checks = new Map(
    productionReadiness().map((check) => [check.id, check.ok]),
  );
  for (const id of [
    "database",
    "auth-secret",
    "audit-secret",
    "admin",
    "ai-provider",
    "public-app-url",
    "media-storage",
    "media-receipts",
  ]) {
    assert.equal(checks.get(id), false, `${id} accepted a placeholder`);
  }
  assert.throws(
    assertOpenAIProviderConfigured,
    /requires the real OpenAI provider/,
  );
});

test("deployment example is fail-closed while demo setup remains documentation-only", async () => {
  const example = await readFile(
    path.join(process.cwd(), ".env.example"),
    "utf8",
  );
  assert.match(example, /^NODE_ENV=production$/m);
  assert.match(example, /^WBX_DEMO_MODE=false$/m);
  assert.match(example, /^AI_PROVIDER=openai$/m);
  assert.doesNotMatch(example, /^AI_PROVIDER=(?:stub|disabled)$/m);
  assert.doesNotMatch(example, /^WBX_DEMO_MODE=true$/m);
});

test("new authoring routes contain no untitled or heuristic response fallback", async () => {
  const routeSources = await Promise.all(
    [
      "app/api/ai/nl-to-config/route.ts",
      "app/api/ai/vacancy-draft/route.ts",
      "app/api/ai/suggest-criteria/route.ts",
      "app/api/ai/draft-question/route.ts",
    ].map((file) => readFile(path.join(process.cwd(), file), "utf8")),
  );
  const joined = routeSources.join("\n");
  assert.doesNotMatch(joined, /Untitled role/);
  assert.doesNotMatch(
    joined,
    /\b(?:nlToConfigStub|interviewStepStub)\b/,
  );
  assert.match(joined, /generateVacancyConfig/);
  assert.match(joined, /generateVacancyDraft/);
  assert.match(joined, /generateInterviewQuestion/);
});

test("provider-neutral AI contracts contain no generated-content implementation", async () => {
  const contracts = await readFile(
    path.join(process.cwd(), "lib/ai-contracts.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    contracts,
    /createEmptyDraft|MAIN_TEMPLATES|responses\.parse|OpenAI/,
  );
  await assert.rejects(
    access(path.join(process.cwd(), "lib/ai.ts")),
    /ENOENT/,
  );
});

test("new provider authoring starts from policy-only scaffolds", async () => {
  const provider = await readFile(
    path.join(process.cwd(), "lib/server/ai-provider.ts"),
    "utf8",
  );
  assert.match(
    provider,
    /generateVacancyDraft[\s\S]*const base = createEmptyDraft\(\)[\s\S]*responses\.parse[\s\S]*compileVacancyAuthoringDraft/,
  );
  assert.match(
    provider,
    /function questionAuthoringScaffold[\s\S]*text: ""[\s\S]*generateInterviewQuestion[\s\S]*response\.output_parsed\.text/,
  );
  assert.doesNotMatch(
    provider,
    /\b(?:nlToVacancyDraft|draftQuestion|interviewStepStub)\b/,
  );
});

test("deterministic compatibility code is guarded by frozen legacy or demo mode", async () => {
  const legacy = await readFile(
    path.join(process.cwd(), "lib/server/legacy-demo-ai.ts"),
    "utf8",
  );
  assert.match(
    legacy,
    /executionMode !== "legacy_deterministic"[\s\S]*restricted to frozen legacy applications/,
  );
  assert.match(
    legacy,
    /createDemoVacancyDraft[\s\S]*!isDevelopmentDemoMode\(\)[\s\S]*only in explicit development demo mode/,
  );
  assert.doesNotMatch(legacy, /visual samples|note-use advisory/i);
  assert.match(
    legacy,
    /No frames are extracted,[\s\S]*no gaze, reading behavior, appearance, emotion, or voice traits are inferred/,
  );
  assert.match(legacy, /interview\.integrityTier = 1/);

  const provider = await readFile(
    path.join(process.cwd(), "lib/server/ai-provider.ts"),
    "utf8",
  );
  assert.match(
    provider,
    /input\.aiExecutionMode === "legacy_deterministic"[\s\S]*nextLegacyDeterministicInterviewStep/,
  );
  assert.throws(
    () =>
      nextLegacyDeterministicInterviewStep(
        {
          vacancyTitle: "New provider vacancy",
          competencies: [],
          history: [],
        },
        "openai_required",
      ),
    /restricted to frozen legacy applications/,
  );
});

test("built-in demo vacancy never requests invasive integrity tiers", () => {
  assert.equal(
    vacancyV2Demo.pipeline.every((block) => block.integrityTier <= 1),
    true,
  );
});

test("unknown HR routes fail closed and have no fixture surface", async () => {
  const catchAll = await readFile(
    path.join(process.cwd(), "app/(hr)/[...rest]/page.tsx"),
    "utf8",
  );
  assert.match(catchAll, /import \{ notFound \} from "next\/navigation"/);
  assert.match(
    catchAll,
    /export default function SurfacePage\(\) \{\s*notFound\(\);\s*\}/,
  );
  await assert.rejects(
    access(path.join(process.cwd(), "components/hr/HrSurface.tsx")),
    /ENOENT/,
  );
});

test("production launch runs a fail-closed dependency preflight before the standalone server", async () => {
  const [packageSource, nextConfig, launcher, dockerfile] =
    await Promise.all([
      readFile(path.join(process.cwd(), "package.json"), "utf8"),
      readFile(path.join(process.cwd(), "next.config.ts"), "utf8"),
      readFile(
        path.join(process.cwd(), "scripts/start-standalone.mjs"),
        "utf8",
      ),
      readFile(path.join(process.cwd(), "Dockerfile"), "utf8"),
    ]);
  const packageJson = JSON.parse(packageSource) as {
    scripts: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts.start,
    "node scripts/start-standalone.mjs",
  );
  assert.match(nextConfig, /output: "standalone"/);
  assert.match(launcher, /process\.env\.PORT \?\? "3000"/);
  assert.match(launcher, /process\.env\.NODE_ENV = "production"/);
  assert.match(launcher, /\.next", "standalone"/);
  assert.match(launcher, /await runProductionPreflight\(\)/);
  assert.match(launcher, /await import\(pathToFileURL\(serverEntry\)\.href\)/);
  assert.match(
    dockerfile,
    /CMD \["node", "scripts\/production-preflight\.mjs", "server\.js"\]/,
  );
  const preflight = await readFile(
    path.join(process.cwd(), "scripts/production-preflight.mjs"),
    "utf8",
  );
  assert.match(preflight, /validateEnvironment/);
  assert.match(preflight, /verifyDatabase/);
  assert.match(preflight, /verifyFfprobe/);
  assert.match(preflight, /verifyOpenAIProvider/);
  assert.match(preflight, /verifyStorageEndpoint/);
  assert.match(
    preflight,
    /await Promise\.all\([\s\S]*verifyDatabase\(\)[\s\S]*verifyFfprobe\(\)[\s\S]*verifyOpenAIProvider\(\)[\s\S]*verifyStorageEndpoint/,
  );
  assert.match(
    preflight,
    /await runProductionPreflight\(\)[\s\S]*await import\(/,
    "Docker wrapper must complete preflight before importing the server entry",
  );
});

test("deep job-analysis fields reach criteria authoring instead of being discarded", async () => {
  const source = await readFile(
    path.join(
      process.cwd(),
      "app/api/ai/suggest-criteria/route.ts",
    ),
    "utf8",
  );
  for (const field of [
    "successOutcomes",
    "operatingConstraints",
    "stakeholderGroups",
    "specialRequirements",
    "internalComments",
    "tags",
  ]) {
    assert.match(
      source,
      new RegExp(`"${field}"`),
      `${field} is missing from the request allowlist`,
    );
    assert.match(
      source,
      new RegExp(`profile\\.${field}`),
      `${field} is not included in authoring context`,
    );
  }
});

test("repository local data access is explicitly demo-only", async () => {
  const source = await readFile(
    path.join(process.cwd(), "lib/server/repository.ts"),
    "utf8",
  );
  assert.match(
    source,
    /function assertDevelopmentDemoStore\(\)[\s\S]*!isDevelopmentDemoMode\(\)[\s\S]*local fixture store/,
  );
  assert.match(
    source,
    /async function readDevData\(\)[\s\S]*assertDevelopmentDemoStore\(\)/,
  );
  assert.match(
    source,
    /if \(!isDevelopmentDemoMode\(\)\) return null;[\s\S]*const data = await readDevData\(\)/,
    "database misses must not silently fall through to local candidate data",
  );
  const environment = await readFile(
    path.join(process.cwd(), "lib/server/env.ts"),
    "utf8",
  );
  assert.match(
    environment,
    /WBX_DEMO_MODE === "true"/,
    "demo mode must require an explicit opt-in",
  );
});

test("new candidate applications fail before creation without their required provider", async () => {
  const source = await readFile(
    path.join(
      process.cwd(),
      "app/api/candidate/applications/route.ts",
    ),
    "utf8",
  );
  assert.match(
    source,
    /competition\.aiExecutionMode === "openai_required"[\s\S]*assertOpenAIProviderConfigured\(\)[\s\S]*AI_PROVIDER_UNAVAILABLE[\s\S]*createCandidateApplication/,
  );
});

test("audit payloads never duplicate candidate-linked free-text reasons", async () => {
  const repository = await readFile(
    path.join(process.cwd(), "lib/server/repository.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    repository,
    /payload:\s*\{[\s\S]{0,500}\breason:\s*(?:input|transcript)\./,
  );
  assert.match(repository, /reviewReasonSha256:\s*sha256\(/);
  assert.match(repository, /reasonSha256:\s*sha256\(/);
});

test("publish requires both a valid evidence blueprint and a deliverable candidate plan", async () => {
  const source = await readFile(
    path.join(
      process.cwd(),
      "app/api/hr/vacancies/publish/route.ts",
    ),
    "utf8",
  );
  assert.match(source, /compileAssessmentBlueprint\(vacancy\)/);
  assert.match(
    source,
    /blueprint\.ready[\s\S]*compileCandidateAssessmentPlan\(vacancy, blueprint\)/,
  );
  assert.match(
    source,
    /candidateRuntimeBlockers[\s\S]*PREFLIGHT_BLOCKED/,
  );
  assert.match(
    source,
    /savePublishedVacancy\(vacancy[\s\S]*compileCandidateAssessmentPlan/,
  );
});
