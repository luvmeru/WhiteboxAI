import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runProductionPreflight } from "./production-preflight.mjs";

if (process.env.NODE_ENV === undefined) {
  process.env.NODE_ENV = "production";
}
if (process.env.NODE_ENV !== "production") {
  throw new Error("The standalone launcher is production-only.");
}

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const serverEntry = path.join(standaloneRoot, "server.js");
const publicSource = path.join(projectRoot, "public");
const staticSource = path.join(projectRoot, ".next", "static");

async function copyRequiredDirectory(source, destination) {
  await access(source);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}

try {
  await access(serverEntry);
} catch {
  throw new Error(
    "The standalone server is missing. Run `npm run build` before `npm run start`.",
  );
}

const configuredPort = process.env.PORT ?? "3000";
if (!/^\d{1,5}$/.test(configuredPort)) {
  throw new Error("PORT must be an integer from 1 through 65535.");
}
const port = Number(configuredPort);
if (port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer from 1 through 65535.");
}
process.env.PORT = String(port);

await copyRequiredDirectory(
  publicSource,
  path.join(standaloneRoot, "public"),
);
await copyRequiredDirectory(
  staticSource,
  path.join(standaloneRoot, ".next", "static"),
);

await runProductionPreflight();
await import(pathToFileURL(serverEntry).href);
