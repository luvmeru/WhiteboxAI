import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const healthPath =
  process.env.WBX_RETENTION_HEALTH_PATH?.trim() ||
  path.join(tmpdir(), "whitebox-retention-scheduler-health.json");
const configuredInterval =
  process.env.WBX_RETENTION_INTERVAL_SECONDS?.trim() || "300";
const intervalSeconds = Number(configuredInterval);
if (
  !Number.isInteger(intervalSeconds) ||
  intervalSeconds < 60 ||
  intervalSeconds > 86_400
) {
  process.exit(1);
}

try {
  const health = JSON.parse(await readFile(healthPath, "utf8"));
  const lastSuccess = Date.parse(health.lastSuccessAt);
  const maximumAgeMs =
    (Math.max(60, intervalSeconds) * 2 + 300) * 1_000;
  if (
    health.schemaVersion !== 1 ||
    !Number.isFinite(lastSuccess) ||
    Date.now() - lastSuccess > maximumAgeMs
  ) {
    process.exit(1);
  }
} catch {
  process.exit(1);
}
