import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const DEFAULT_TRANSITION_SECONDS = 0.24;
const DEFAULT_ZOOM = { from: 1, to: 1.025 };

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultManifestPath = path.join(projectRoot, "demo-frames", "manifest.json");
const outputDir = path.join(projectRoot, "demo-output");
const outputPath = path.resolve(
  projectRoot,
  process.env.STORYBOARD_OUTPUT ?? path.join(outputDir, "whitebox-pitch-demo.mp4"),
);

const manifestExample = `{
  "transitionSeconds": 0.24,
  "shots": [
    {
      "image": "01-login.png",
      "duration": 4,
      "zoom": { "from": 1.0, "to": 1.035 },
      "pan": {
        "from": { "x": 0.50, "y": 0.50 },
        "to":   { "x": 0.54, "y": 0.48 }
      },
      "cursor": {
        "start": { "x": 1180, "y": 760 },
        "end":   { "x": 1320, "y": 760 }
      }
    }
  ]
}`;

function usage() {
  return `Usage:
  node scripts/compose-storyboard-demo.mjs [manifest.json] [--dry-run]

The manifest defaults to demo-frames/manifest.json. Image paths are relative to
the manifest directory. Coordinates from 0 through 1 are treated as normalized;
larger values are treated as 1920x1080 output pixels. Missing zoom/pan values use
a subtle centered 1.0 -> 1.025 push-in. Set both zoom values to 1 for a static shot.
STORYBOARD_OUTPUT may override the output path for smoke tests; production defaults
to demo-output/whitebox-pitch-demo.mp4.

Manifest example:
${manifestExample}`;
}

function fail(message) {
  throw new Error(`${message}\n\n${usage()}`);
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(`${label} must be a finite number.`);
  return number;
}

function coordinate(value, dimension, label, { normalized = false } = {}) {
  const number = finiteNumber(value, label);
  if (number < 0) fail(`${label} cannot be negative.`);
  if (number <= 1) return normalized ? number : number * dimension;
  if (number > dimension) fail(`${label} must be within 0..1 or 0..${dimension}.`);
  return normalized ? number / dimension : number;
}

function point(value, label, { normalized = false } = {}) {
  if (!value || typeof value !== "object") fail(`${label} must contain numeric x and y values.`);
  return {
    x: coordinate(value.x, WIDTH, `${label}.x`, { normalized }),
    y: coordinate(value.y, HEIGHT, `${label}.y`, { normalized }),
  };
}

function zoomRange(value, label) {
  if (value === undefined) return { ...DEFAULT_ZOOM };
  if (typeof value === "number") return { from: 1, to: value };
  if (!value || typeof value !== "object") fail(`${label} must be a number or { from, to }.`);

  const from = finiteNumber(value.from ?? 1, `${label}.from`);
  const to = finiteNumber(value.to ?? from, `${label}.to`);
  for (const [key, number] of Object.entries({ from, to })) {
    if (number < 1 || number > 1.35) {
      fail(`${label}.${key} must be between 1 and 1.35 for a restrained UI zoom.`);
    }
  }
  return { from, to };
}

function panRange(value, label) {
  const center = { x: 0.5, y: 0.5 };
  if (value === undefined) return { from: center, to: center };
  if (!value || typeof value !== "object") fail(`${label} must be { from: {x,y}, to: {x,y} }.`);
  const from = point(value.from ?? value.to ?? center, `${label}.from`, { normalized: true });
  const to = point(value.to ?? value.from ?? center, `${label}.to`, { normalized: true });
  return { from, to };
}

function cursorRange(value, label) {
  if (value === undefined || value === null || value === false) return null;
  if (!value || typeof value !== "object") fail(`${label} must be { start: {x,y}, end: {x,y} }.`);
  const start = point(value.start ?? value.end, `${label}.start`);
  const end = point(value.end ?? value.start, `${label}.end`);
  return { start, end };
}

function resolveImage(manifestDir, value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a relative image filename.`);
  if (path.isAbsolute(value)) fail(`${label} must be relative to the manifest directory.`);

  const imagePath = path.resolve(manifestDir, value);
  const relative = path.relative(manifestDir, imagePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(`${label} must remain inside ${manifestDir}.`);
  }
  if (!existsSync(imagePath)) fail(`${label} does not exist: ${imagePath}`);
  return imagePath;
}

function parseManifest(manifestPath) {
  if (!existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}`);

  let raw;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`Could not parse ${manifestPath}: ${error.message}`);
  }

  const manifest = Array.isArray(raw) ? { shots: raw } : raw;
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.shots)) {
    fail("The manifest must contain a shots array (or be an array of shots). ");
  }
  if (manifest.shots.length === 0) fail("The manifest must contain at least one shot.");

  const manifestDir = path.dirname(manifestPath);
  const shots = manifest.shots.map((shot, index) => {
    const label = `shots[${index}]`;
    if (!shot || typeof shot !== "object") fail(`${label} must be an object.`);
    const duration = finiteNumber(shot.duration, `${label}.duration`);
    if (duration < 0.75 || duration > 120) fail(`${label}.duration must be between 0.75 and 120 seconds.`);

    return {
      image: resolveImage(manifestDir, shot.image, `${label}.image`),
      duration,
      zoom: zoomRange(shot.zoom, `${label}.zoom`),
      pan: panRange(shot.pan, `${label}.pan`),
      cursor: cursorRange(shot.cursor, `${label}.cursor`),
    };
  });

  const requestedTransition = finiteNumber(
    manifest.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS,
    "transitionSeconds",
  );
  if (requestedTransition < 0 || requestedTransition > 0.75) {
    fail("transitionSeconds must be between 0 and 0.75 seconds.");
  }

  return { shots, requestedTransition };
}

async function resolveFfmpeg() {
  try {
    const module = await import("ffmpeg-static");
    if (module.default && existsSync(module.default)) return module.default;
  } catch {
    // The demo intentionally keeps ffmpeg-static out of package.json; use its known local path below.
  }

  const bundled = path.join(projectRoot, "node_modules", "ffmpeg-static", "ffmpeg.exe");
  if (existsSync(bundled)) return bundled;
  fail(`ffmpeg-static is not installed. Expected it at ${bundled}`);
}

function decimal(value) {
  return Number(value.toFixed(6)).toString();
}

function eased(from, to, progress) {
  const delta = to - from;
  if (Math.abs(delta) < 1e-9) return decimal(from);
  return `${decimal(from)}+${decimal(delta)}*(${progress})`;
}

function shotFilter(shot, index) {
  const frames = Math.max(1, Math.round(shot.duration * FPS) - 1);
  const progress = `(0.5-0.5*cos(PI*on/${frames}))`;
  const zoom = eased(shot.zoom.from, shot.zoom.to, progress);
  const panX = eased(shot.pan.from.x, shot.pan.to.x, progress);
  const panY = eased(shot.pan.from.y, shot.pan.to.y, progress);
  const baseLabel = shot.cursor ? `base${index}` : `shot${index}`;
  const filters = [
    `[${index}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=0x0b1020`,
    "setsar=1",
    `zoompan=z='${zoom}':x='(iw-iw/zoom)*(${panX})':y='(ih-ih/zoom)*(${panY})':d=1:s=${WIDTH}x${HEIGHT}:fps=${FPS}`,
    `trim=duration=${decimal(shot.duration)}`,
    "settb=1/30",
    "setpts=PTS-STARTPTS",
    "format=yuv420p",
  ].join(",");

  const chains = [`${filters}[${baseLabel}]`];
  if (!shot.cursor) return chains;

  const radiusSquared = "(X-14)*(X-14)+(Y-14)*(Y-14)";
  const inner = `lte(${radiusSquared}\\,81)`;
  const outer = `lte(${radiusSquared}\\,121)`;
  const rgb = `if(${inner}\\,255\\,18)`;
  const alpha = `if(${inner}\\,242\\,if(${outer}\\,190\\,0))`;
  const cursorProgress = `(0.5-0.5*cos(PI*t/${decimal(shot.duration)}))`;
  const cursorX = eased(shot.cursor.start.x - 14, shot.cursor.end.x - 14, cursorProgress);
  const cursorY = eased(shot.cursor.start.y - 14, shot.cursor.end.y - 14, cursorProgress);

  chains.push(
    `color=c=black@0.0:s=28x28:r=${FPS}:d=${decimal(shot.duration)},format=rgba,` +
      `geq=r='${rgb}':g='${rgb}':b='${rgb}':a='${alpha}'[cursor${index}]`,
  );
  chains.push(
    `[base${index}][cursor${index}]overlay=x='${cursorX}':y='${cursorY}':eval=frame:shortest=1,` +
      `format=yuv420p[shot${index}]`,
  );
  return chains;
}

function transitionDuration(requested, previousShot, nextShot) {
  if (requested === 0) return 0;
  return Math.min(requested, previousShot.duration * 0.35, nextShot.duration * 0.35);
}

function composeFilter(shots, requestedTransition) {
  const chains = shots.flatMap(shotFilter);
  let currentLabel = "shot0";
  let currentDuration = shots[0].duration;

  for (let index = 1; index < shots.length; index += 1) {
    const fade = transitionDuration(requestedTransition, shots[index - 1], shots[index]);
    const nextLabel = `mix${index}`;
    if (fade > 0) {
      const offset = currentDuration - fade;
      chains.push(
        `[${currentLabel}][shot${index}]xfade=transition=fade:duration=${decimal(fade)}:` +
          `offset=${decimal(offset)}[${nextLabel}]`,
      );
      currentDuration += shots[index].duration - fade;
    } else {
      chains.push(`[${currentLabel}][shot${index}]concat=n=2:v=1:a=0[${nextLabel}]`);
      currentDuration += shots[index].duration;
    }
    currentLabel = nextLabel;
  }

  const edgeFade = Math.min(0.2, currentDuration / 6);
  const fadeOutStart = Math.max(0, currentDuration - edgeFade);
  chains.push(
    `[${currentLabel}]fade=t=in:st=0:d=${decimal(edgeFade)},` +
      `fade=t=out:st=${decimal(fadeOutStart)}:d=${decimal(edgeFade)},` +
      `fps=${FPS},format=yuv420p[outv]`,
  );

  return { filter: chains.join(";"), duration: currentDuration };
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage());
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const positional = args.filter((arg) => !arg.startsWith("--"));
if (positional.length > 1) fail("Provide at most one manifest path.");
const manifestPath = path.resolve(projectRoot, positional[0] ?? defaultManifestPath);
const { shots, requestedTransition } = parseManifest(manifestPath);
const ffmpegPath = await resolveFfmpeg();
const { filter, duration } = composeFilter(shots, requestedTransition);

mkdirSync(path.dirname(outputPath), { recursive: true });
const ffmpegArgs = [
  "-hide_banner",
  "-y",
  ...shots.flatMap((shot) => [
    "-loop",
    "1",
    "-framerate",
    String(FPS),
    "-t",
    decimal(shot.duration),
    "-i",
    shot.image,
  ]),
  "-filter_complex",
  filter,
  "-map",
  "[outv]",
  "-an",
  "-r",
  String(FPS),
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "17",
  "-pix_fmt",
  "yuv420p",
  "-profile:v",
  "high",
  "-level",
  "4.1",
  "-colorspace",
  "bt709",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
  "-movflags",
  "+faststart",
  outputPath,
];

console.log(`Storyboard: ${shots.length} shots, ${duration.toFixed(2)} seconds`);
console.log(`Output: ${outputPath}`);

if (dryRun) {
  console.log(`FFmpeg: ${ffmpegPath}`);
  console.log("Dry run complete; the manifest and every referenced image are valid.");
  process.exit(0);
}

const result = spawnSync(ffmpegPath, ffmpegArgs, {
  cwd: projectRoot,
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`ffmpeg exited with status ${result.status ?? "unknown"}.`);
}

console.log(`Created ${outputPath}`);
