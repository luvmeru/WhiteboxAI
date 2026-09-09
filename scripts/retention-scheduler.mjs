import { spawn } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

if (process.env.NODE_ENV !== "production") {
  throw new Error("The retention scheduler is production-only.");
}

const configuredInterval =
  process.env.WBX_RETENTION_INTERVAL_SECONDS?.trim() || "300";
if (!/^\d{2,5}$/.test(configuredInterval)) {
  throw new Error(
    "WBX_RETENTION_INTERVAL_SECONDS must be an integer from 60 through 86400.",
  );
}
const intervalSeconds = Number(configuredInterval);
if (intervalSeconds < 60 || intervalSeconds > 86_400) {
  throw new Error(
    "WBX_RETENTION_INTERVAL_SECONDS must be an integer from 60 through 86400.",
  );
}

const healthPath =
  process.env.WBX_RETENTION_HEALTH_PATH?.trim() ||
  path.join(tmpdir(), "whitebox-retention-scheduler-health.json");
let stopping = false;
let child = null;
let lastSuccessAt = null;

try {
  const existing = JSON.parse(await readFile(healthPath, "utf8"));
  if (
    typeof existing.lastSuccessAt === "string" &&
    Number.isFinite(Date.parse(existing.lastSuccessAt))
  ) {
    lastSuccessAt = existing.lastSuccessAt;
  }
} catch {
  // The first scheduler run intentionally starts without a health record.
}

async function writeHealth(payload) {
  const temporary = `${healthPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(payload)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, healthPath);
}

function runWorker() {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    child = spawn(process.execPath, ["scripts/retention-worker.mjs"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", (error) => {
      child = null;
      resolve({
        startedAt,
        completedAt: new Date().toISOString(),
        exitCode: 1,
        errorName: error.name,
      });
    });
    child.once("exit", (code, signal) => {
      child = null;
      resolve({
        startedAt,
        completedAt: new Date().toISOString(),
        exitCode: code ?? 1,
        signal: signal ?? null,
      });
    });
  });
}

function waitForNextRun() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      clearInterval(poll);
      resolve();
    }, intervalSeconds * 1_000);
    const poll = setInterval(() => {
      if (!stopping) return;
      clearTimeout(timer);
      clearInterval(poll);
      resolve();
    }, 250);
  });
}

function stop(signal) {
  stopping = true;
  if (child && !child.killed) child.kill(signal);
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

while (!stopping) {
  const result = await runWorker();
  if (result.exitCode === 0) {
    lastSuccessAt = result.completedAt;
  } else {
    process.stderr.write(
      `Retention scheduler run failed with exit ${result.exitCode}; it will retry after the configured interval.\n`,
    );
  }
  await writeHealth({
    schemaVersion: 1,
    intervalSeconds,
    lastAttemptAt: result.completedAt,
    lastSuccessAt,
    lastExitCode: result.exitCode,
    ...(result.signal ? { lastSignal: result.signal } : {}),
    ...(result.errorName ? { lastErrorName: result.errorName } : {}),
  });
  if (!stopping) await waitForNextRun();
}
