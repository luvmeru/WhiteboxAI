import OpenAI from "openai";
import { getCandidateSession } from "@/lib/server/candidate-auth";
import {
  assertOpenAIProviderConfigured,
  getServerEnv,
  isDevelopmentDemoMode,
} from "@/lib/server/env";
import { assertSameOriginBrowserRequest } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 8 * 1024;
const MAX_SCRIPT_CHARACTERS = 4_096;

let openaiClient: OpenAI | undefined;

function client(): OpenAI {
  const apiKey = getServerEnv().OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI is not configured.");
  openaiClient ??= new OpenAI({ apiKey, timeout: 45_000, maxRetries: 1 });
  return openaiClient;
}

function jsonError(error: string, status: number): Response {
  return Response.json(
    { error },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

/**
 * Development-demo-only speech synthesis for the hidden candidate recording
 * harness. The API key and provider response never cross the server boundary.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isDevelopmentDemoMode()) {
    return jsonError("Not found.", 404);
  }

  try {
    assertSameOriginBrowserRequest(request);
  } catch {
    return jsonError("Request origin was rejected.", 403);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return jsonError("A JSON request is required.", 415);
  }
  const declaredSize = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredSize) && declaredSize > MAX_BODY_BYTES) {
    return jsonError("The demo speech request is too large.", 413);
  }

  let input: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return jsonError("The demo speech request is too large.", 413);
    }
    input = JSON.parse(raw) as unknown;
  } catch {
    return jsonError("The demo speech request could not be read.", 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return jsonError("The demo speech request is invalid.", 400);
  }
  const body = input as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) => key !== "applicationId" && key !== "text",
    ) ||
    typeof body.applicationId !== "string" ||
    body.applicationId.length < 1 ||
    body.applicationId.length > 200 ||
    typeof body.text !== "string"
  ) {
    return jsonError("The demo speech request is invalid.", 400);
  }

  const text = body.text.trim();
  if (text.length < 2 || text.length > MAX_SCRIPT_CHARACTERS) {
    return jsonError("The demo answer must contain 2-4096 characters.", 400);
  }

  const session = await getCandidateSession();
  if (!session || session.applicationId !== body.applicationId) {
    return jsonError("Candidate session is missing or expired.", 401);
  }

  try {
    assertOpenAIProviderConfigured();
    const speech = await client().audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "cedar",
      input: text,
      instructions:
        "Speak as a real job candidate in a calm, conversational, confident tone. Use natural pacing and restrained emphasis; avoid announcer delivery.",
      response_format: "wav",
      speed: 1,
    });
    const audio = await speech.arrayBuffer();
    if (audio.byteLength === 0) {
      throw new Error("The speech response was empty.");
    }
    return new Response(audio, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, private",
        "Content-Disposition": "inline",
        "Content-Type": "audio/wav",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error(`[demo:tts] synthesis failed (${name})`);
    return jsonError("Demo speech could not be generated.", 502);
  }
}
