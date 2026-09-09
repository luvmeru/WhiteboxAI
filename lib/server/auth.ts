import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerEnv, isDemoMode } from "./env";
import { sealJson, unsealJson, verifyPassword } from "./crypto";
import { databaseConfigured, query } from "./db";

export type HrRole = "Owner" | "HiringManager" | "TechnicalReviewer" | "Observer";

export interface HrSession {
  kind: "hr";
  sub: string;
  email: string;
  organizationId: string;
  organizationName: string;
  role: HrRole;
  piiReveal: boolean;
  issuedAt: number;
  expiresAt: number;
}

const HR_COOKIE = "wbx_hr_session";
const EIGHT_HOURS = 8 * 60 * 60;
const hrSessionSchema = z.object({
  kind: z.literal("hr"),
  sub: z.string().min(1).max(200),
  email: z.string().email().max(320),
  organizationId: z.string().min(1).max(200),
  organizationName: z.string().min(1).max(300),
  role: z.enum(["Owner", "HiringManager", "TechnicalReviewer", "Observer"]),
  piiReveal: z.boolean(),
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

export function demoSession(): HrSession {
  const now = Math.floor(Date.now() / 1000);
  return {
    kind: "hr",
    sub: "usr-demo-owner",
    email: "admin@whitebox.local",
    organizationId: "org-demo",
    organizationName: "Acme Org",
    role: "Owner",
    piiReveal: true,
    issuedAt: now,
    expiresAt: now + EIGHT_HOURS,
  };
}

export async function authenticateHr(email: string, password: string): Promise<HrSession | null> {
  const env = getServerEnv();
  const normalized = email.trim().toLowerCase();

  if (isDemoMode() && normalized === "admin@whitebox.local" && password === "WhiteBox!2026") {
    return demoSession();
  }

  if (databaseConfigured()) {
    const result = await query<{
      user_id: string;
      email: string;
      password_hash: string;
      disabled_at: Date | null;
      organization_id: string | null;
      organization_name: string | null;
      role: HrRole | null;
      pii_reveal: boolean | null;
    }>(
      `SELECT u.id AS user_id,
              u.email,
              u.password_hash,
              u.disabled_at,
              o.id AS organization_id,
              o.name AS organization_name,
              m.role,
              m.pii_reveal
         FROM users u
         LEFT JOIN memberships m ON m.user_id = u.id
         LEFT JOIN organizations o ON o.id = m.organization_id
        WHERE lower(u.email) = $1
        ORDER BY o.created_at ASC NULLS LAST
        LIMIT 1`,
      [normalized],
    );
    const account = result.rows[0];
    if (account) {
      if (
        account.disabled_at ||
        !account.organization_id ||
        !account.organization_name ||
        !account.role ||
        account.pii_reveal === null ||
        !verifyPassword(password, account.password_hash)
      ) {
        return null;
      }
      const now = Math.floor(Date.now() / 1000);
      return {
        kind: "hr",
        sub: account.user_id,
        email: account.email,
        organizationId: account.organization_id,
        organizationName: account.organization_name,
        role: account.role,
        piiReveal: account.pii_reveal,
        issuedAt: now,
        expiresAt: now + EIGHT_HOURS,
      };
    }
  }

  if (!env.WBX_ADMIN_EMAIL || !env.WBX_ADMIN_PASSWORD_HASH) return null;
  if (normalized !== env.WBX_ADMIN_EMAIL.trim().toLowerCase()) return null;
  if (!verifyPassword(password, env.WBX_ADMIN_PASSWORD_HASH)) return null;

  const now = Math.floor(Date.now() / 1000);
  return {
    kind: "hr",
    sub: "usr-bootstrap-owner",
    email: normalized,
    organizationId: process.env.WBX_ORGANIZATION_ID || "org-primary",
    organizationName: process.env.WBX_ORGANIZATION_NAME || "WhiteBox Organization",
    role: "Owner",
    piiReveal: true,
    issuedAt: now,
    expiresAt: now + EIGHT_HOURS,
  };
}

export function encodeHrSession(session: HrSession): string {
  return sealJson(session, sessionSecret());
}

export function decodeHrSession(value?: string): HrSession | null {
  if (!value) return null;
  const parsed = hrSessionSchema.safeParse(unsealJson<unknown>(value, sessionSecret()));
  if (!parsed.success || parsed.data.expiresAt <= Math.floor(Date.now() / 1000)) return null;
  return parsed.data;
}

export async function getHrSession(): Promise<HrSession | null> {
  const jar = await cookies();
  return decodeHrSession(jar.get(HR_COOKIE)?.value);
}

export async function requireHrSession(roles?: HrRole[]): Promise<HrSession> {
  const session = await getHrSession();
  if (!session) redirect("/login");
  if (roles && !roles.includes(session.role)) redirect("/unauthorized");
  return session;
}

export function sessionCookie(token: string) {
  const env = getServerEnv();
  return {
    name: HR_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: EIGHT_HOURS,
  };
}

export function expiredSessionCookie() {
  return { ...sessionCookie(""), maxAge: 0 };
}

export const hrSessionCookieName = HR_COOKIE;
