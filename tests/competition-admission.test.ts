import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { vacancyV2Demo } from "../lib/fixtures";
import type { HrSession } from "../lib/server/auth";
import {
  CompetitionAdmissionError,
  assertCompetitionAdmission,
  type CompetitionAdmissionErrorCode,
  type CompetitionAdmissionPolicy,
} from "../lib/server/competition-admission";

const OPEN_POLICY: CompetitionAdmissionPolicy = {
  opensAt: "2026-08-01T09:00:00.000Z",
  closesAt: "2026-08-01T17:00:00.000Z",
  timezone: "UTC",
};

function expectAdmissionError(
  operation: () => void,
  code: CompetitionAdmissionErrorCode,
): void {
  assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof CompetitionAdmissionError);
    assert.equal(error.code, code);
    return true;
  });
}

test("application window is UTC-stable and half-open at both boundaries", () => {
  expectAdmissionError(
    () =>
      assertCompetitionAdmission(
        OPEN_POLICY,
        0,
        new Date("2026-08-01T08:59:59.999Z"),
      ),
    "COMPETITION_NOT_OPEN",
  );
  assert.doesNotThrow(() =>
    assertCompetitionAdmission(
      OPEN_POLICY,
      0,
      new Date("2026-08-01T09:00:00.000Z"),
    ),
  );
  assert.doesNotThrow(() =>
    assertCompetitionAdmission(
      OPEN_POLICY,
      0,
      new Date("2026-08-01T16:59:59.999Z"),
    ),
  );
  expectAdmissionError(
    () =>
      assertCompetitionAdmission(
        OPEN_POLICY,
        0,
        new Date("2026-08-01T17:00:00.000Z"),
      ),
    "COMPETITION_CLOSED",
  );
});

test("timezone-qualified wall-clock windows resolve to UTC without process-local time", () => {
  const almatyPolicy: CompetitionAdmissionPolicy = {
    opensAt: "2026-08-01T09:00",
    closesAt: "2026-08-01T17:00",
    timezone: "Asia/Almaty",
  };
  expectAdmissionError(
    () =>
      assertCompetitionAdmission(
        almatyPolicy,
        0,
        new Date("2026-08-01T03:59:59.999Z"),
      ),
    "COMPETITION_NOT_OPEN",
  );
  assert.doesNotThrow(() =>
    assertCompetitionAdmission(
      almatyPolicy,
      0,
      new Date("2026-08-01T04:00:00.000Z"),
    ),
  );
});

test("invalid, reversed, and ambiguous windows fail closed", () => {
  for (const policy of [
    { ...OPEN_POLICY, opensAt: "" },
    { ...OPEN_POLICY, opensAt: "not-a-date" },
    { ...OPEN_POLICY, timezone: "Not/A_Timezone", opensAt: "2026-08-01T09:00" },
    {
      ...OPEN_POLICY,
      opensAt: OPEN_POLICY.closesAt,
      closesAt: OPEN_POLICY.opensAt,
    },
    {
      opensAt: "2026-11-01T01:30",
      closesAt: "2026-11-01T03:00",
      timezone: "America/New_York",
    },
  ] satisfies CompetitionAdmissionPolicy[]) {
    expectAdmissionError(
      () =>
        assertCompetitionAdmission(
          policy,
          0,
          new Date("2026-08-01T12:00:00.000Z"),
        ),
      "COMPETITION_ADMISSION_UNAVAILABLE",
    );
  }
});

test("capacity accepts the final available slot and rejects the next one", () => {
  const policy = { ...OPEN_POLICY, maxSubmissions: 2 };
  assert.doesNotThrow(() =>
    assertCompetitionAdmission(
      policy,
      1,
      new Date("2026-08-01T12:00:00.000Z"),
    ),
  );
  expectAdmissionError(
    () =>
      assertCompetitionAdmission(
        policy,
        2,
        new Date("2026-08-01T12:00:00.000Z"),
      ),
    "COMPETITION_CAPACITY_REACHED",
  );
});

test("serialized concurrent-ish admissions cannot oversubscribe capacity", async () => {
  const policy = { ...OPEN_POLICY, maxSubmissions: 2 };
  let submissions = 0;
  let queue: Promise<void> = Promise.resolve();
  const attempt = () => {
    const result = queue.then(() => {
      assertCompetitionAdmission(
        policy,
        submissions,
        new Date("2026-08-01T12:00:00.000Z"),
      );
      submissions += 1;
    });
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const outcomes = await Promise.allSettled([
    attempt(),
    attempt(),
    attempt(),
  ]);
  assert.equal(
    outcomes.filter((outcome) => outcome.status === "fulfilled").length,
    2,
  );
  assert.equal(
    outcomes.filter(
      (outcome) =>
        outcome.status === "rejected" &&
        outcome.reason instanceof CompetitionAdmissionError &&
        outcome.reason.code === "COMPETITION_CAPACITY_REACHED",
    ).length,
    1,
  );
  assert.equal(submissions, 2);
});

test("repository keeps admission check and insert under the same store lock", async () => {
  const source = await readFile(
    path.join(process.cwd(), "lib/server/repository.ts"),
    "utf8",
  );
  assert.match(
    source,
    /FOR UPDATE OF vacancy[\s\S]*SELECT count\(\*\) AS count[\s\S]*assertCompetitionAdmission\([\s\S]*INSERT INTO applications/,
    "PostgreSQL admission must lock the vacancy before count/check/insert",
  );
  assert.match(
    source,
    /await mutateDevData\(\(data\) => \{[\s\S]*assertCompetitionAdmission\([\s\S]*data\.applications\[admittedApplication\.id\] = admittedApplication/,
    "development admission must count/check/insert inside one serialized mutation",
  );
});

test("real development-store creation serializes competing requests at capacity", async () => {
  const originalCwd = process.cwd();
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "whitebox-admission-"),
  );
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    WBX_DEMO_MODE: process.env.WBX_DEMO_MODE,
    DATABASE_URL: process.env.DATABASE_URL,
    AI_PROVIDER: process.env.AI_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };
  try {
    process.chdir(directory);
    Object.assign(process.env, {
      NODE_ENV: "test",
      WBX_DEMO_MODE: "true",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test-admission-not-a-real-provider-key",
    });
    delete process.env.DATABASE_URL;
    const repository = await import("../lib/server/repository");
    const now = Date.now();
    const draft = structuredClone(vacancyV2Demo);
    draft.id = "vac-admission-capacity-test";
    draft.code = "WBX-CAP2";
    draft.pipeline = draft.pipeline.filter(
      (block) => block.kind !== "cv_intake",
    );
    draft.assessmentDesign = undefined;
    draft.capacity = { maxSubmissions: 1 };
    draft.window = {
      opensAt: new Date(now - 60_000).toISOString(),
      closesAt: new Date(now + 60_000).toISOString(),
      timezone: "UTC",
    };
    const session: HrSession = {
      kind: "hr",
      sub: "usr-admission-test",
      email: "admission-test@example.invalid",
      organizationId: "org-admission-test",
      organizationName: "Admission Test",
      role: "Owner",
      piiReveal: true,
      issuedAt: Math.floor(now / 1_000),
      expiresAt: Math.floor(now / 1_000) + 3_600,
    };
    const vacancy = await repository.savePublishedVacancy(draft, session);
    const competition = await repository.resolveCompetition(vacancy.code);
    assert.ok(competition);

    const outcomes = await Promise.allSettled([
      repository.createCandidateApplication(competition),
      repository.createCandidateApplication(competition),
    ]);
    const outcomeSummary = outcomes.map((outcome) =>
      outcome.status === "fulfilled"
        ? "fulfilled"
        : outcome.reason instanceof Error
          ? `${outcome.reason.name}:${outcome.reason.message}`
          : String(outcome.reason),
    );
    assert.equal(
      outcomes.filter((outcome) => outcome.status === "fulfilled").length,
      1,
      outcomeSummary.join(" | "),
    );
    assert.equal(
      outcomes.filter(
        (outcome) =>
          outcome.status === "rejected" &&
          outcome.reason instanceof CompetitionAdmissionError &&
          outcome.reason.code === "COMPETITION_CAPACITY_REACHED",
      ).length,
      1,
      outcomeSummary.join(" | "),
    );
  } finally {
    process.chdir(originalCwd);
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
