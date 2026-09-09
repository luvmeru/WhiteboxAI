import { execFile } from "node:child_process";
import {
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { RecordingContentType } from "./media";

const execFileAsync = promisify(execFile);
const TOOL_TIMEOUT_MS = 30_000;

interface FfprobeOutput {
  streams?: { codec_type?: string }[];
  format?: { duration?: string };
}

export interface VerifiedVideo {
  durationSec: number;
}

function ffprobePath(): string {
  return process.env.WBX_FFPROBE_PATH || "ffprobe";
}

async function runTool(
  executable: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(executable, args, {
    timeout: TOOL_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  return {
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

export async function videoProbeAvailable(): Promise<boolean> {
  try {
    await runTool(ffprobePath(), ["-version"]);
    return true;
  } catch {
    return false;
  }
}

export async function verifyVideoRecording(
  bytes: Buffer,
  contentType: RecordingContentType,
): Promise<VerifiedVideo> {
  const workingDirectory = await mkdtemp(
    path.join(tmpdir(), "whitebox-video-"),
  );
  const extension = contentType === "video/mp4" ? "mp4" : "webm";
  const inputPath = path.join(workingDirectory, `answer.${extension}`);

  try {
    await writeFile(inputPath, bytes, { flag: "wx", mode: 0o600 });
    const probe = await runTool(ffprobePath(), [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      inputPath,
    ]);
    const parsed = JSON.parse(probe.stdout) as FfprobeOutput;
    const streamTypes = new Set(
      (parsed.streams ?? []).map((stream) => stream.codec_type),
    );
    const durationSec = Number(parsed.format?.duration);
    if (
      !streamTypes.has("video") ||
      !streamTypes.has("audio") ||
      !Number.isFinite(durationSec) ||
      durationSec < 0.5 ||
      durationSec > 301
    ) {
      throw new Error(
        "Recording must contain decodable video and audio tracks within the configured duration.",
      );
    }
    return { durationSec };
  } finally {
    const resolved = path.resolve(workingDirectory);
    const temporaryRoot = `${path.resolve(tmpdir())}${path.sep}`;
    if (resolved.startsWith(temporaryRoot)) {
      await rm(resolved, { recursive: true, force: true });
    }
  }
}
