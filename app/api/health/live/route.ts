import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    { status: "ok", service: "whitebox-ai", timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

