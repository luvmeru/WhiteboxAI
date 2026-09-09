import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isDevelopmentDemoMode } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_CAPTURE_BYTES = 750 * 1024 * 1024;

function safeName(value: string | null): string {
  const normalized = (value ?? "demo-segment")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return normalized || "demo-segment";
}

export async function POST(request: Request) {
  if (!isDevelopmentDemoMode()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("video/webm")) {
    return NextResponse.json({ error: "WebM recording required." }, { status: 415 });
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_CAPTURE_BYTES) {
    return NextResponse.json({ error: "Invalid recording size." }, { status: 413 });
  }
  const name = safeName(new URL(request.url).searchParams.get("name"));
  const directory = path.join(process.cwd(), ".data", "demo-recordings");
  await mkdir(directory, { recursive: true });
  const filename = `${name}-${Date.now()}.webm`;
  await writeFile(path.join(directory, filename), bytes, { flag: "wx" });
  return NextResponse.json({ filename, byteSize: bytes.length }, { status: 201 });
}

