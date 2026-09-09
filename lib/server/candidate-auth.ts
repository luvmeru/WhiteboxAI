import { cookies } from "next/headers";
import { z } from "zod";
import { getServerEnv } from "./env";
import { sealJson, unsealJson } from "./crypto";

const CANDIDATE_COOKIE = "wbx_candidate_session";
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const candidateSessionSchema = z.object({
  kind: z.literal("candidate"),
  applicationId: z.string().min(1).max(200),
  token: z.string().min(32).max(200),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

function sessionSecret(): string | undefined {
  const env = getServerEnv();
  if (env.NODE_ENV === "production" && !env.WBX_AUTH_SECRET) {
    throw new Error("WBX_AUTH_SECRET is required in production.");
  }
  return env.WBX_AUTH_SECRET;
}

export interface CandidateSession {
  kind: "candidate";
  applicationId: string;
  token: string;
  issuedAt: number;
  expiresAt: number;
}

export function createCandidateSession(applicationId: string, token: string): CandidateSession {
  const now = Math.floor(Date.now() / 1000);
  return {
    kind: "candidate",
    applicationId,
    token,
    issuedAt: now,
    expiresAt: now + SESSION_SECONDS,
  };
}

export function encodeCandidateSession(session: CandidateSession): string {
  return sealJson(session, sessionSecret());
}

export function decodeCandidateSession(raw?: string): CandidateSession | null {
  if (!raw) return null;
  const parsed = candidateSessionSchema.safeParse(
    unsealJson<unknown>(raw, sessionSecret()),
  );
  if (!parsed.success || parsed.data.expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return parsed.data;
}

export async function getCandidateSession(): Promise<CandidateSession | null> {
  const jar = await cookies();
  return decodeCandidateSession(jar.get(CANDIDATE_COOKIE)?.value);
}

export function candidateSessionCookie(session: CandidateSession) {
  return {
    name: CANDIDATE_COOKIE,
    value: encodeCandidateSession(session),
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getServerEnv().NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}
