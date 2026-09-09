import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recordingsDir = path.join(projectRoot, ".data", "demo-recordings");
const outputDir = path.join(projectRoot, "demo-output");
const ffmpegPath = await import("ffmpeg-static").then((module) => module.default);
mkdirSync(outputDir, { recursive: true });

function latest(prefix) {
  if (!existsSync(recordingsDir)) throw new Error(`No recordings found at ${recordingsDir}`);
  const match = readdirSync(recordingsDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".webm"))
    .sort()
    .at(-1);
  if (!match) throw new Error(`Missing ${prefix} recording.`);
  return path.join(recordingsDir, match);
}

const prefixes = (
  process.env.DEMO_SEGMENTS ??
  "01-hr-login,02-hr-studio,03-candidate-entry,04-candidate-interview,05-results"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const segments = prefixes.map(latest);
const output = path.join(outputDir, "whitebox-pitch-demo.mp4");

const normalized = segments.map(
  (_, index) =>
    `[${index}:v]trim=start=0.45,setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p[v${index}]`,
);
const concatenatedInputs = segments.map((_, index) => `[v${index}]`).join("");

execFileSync(
  ffmpegPath,
  [
    "-y",
    ...segments.flatMap((input) => ["-i", input]),
    "-filter_complex",
    [
      ...normalized,
      `${concatenatedInputs}concat=n=${segments.length}:v=1:a=0,fade=t=in:st=0:d=0.25[outv]`,
    ].join(";"),
    "-map",
    "[outv]",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-movflags",
    "+faststart",
    output,
  ],
  { cwd: projectRoot, stdio: "inherit" },
);

console.log(output);
