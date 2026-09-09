/* ============================================================
   LOCAL STORE — prototype persistence (SPEC §3, §6, §7, §9.4).
   localStorage stands in for the real backend; every function is
   client-only guarded and no-ops (empty/null) on the server.
   Keys live in STORE_KEYS (lib/types.ts). Audit entries are
   append-only and hash-chained (SPEC §1 law 1) — each entry
   hashes the previous entry's hash plus its own payload.
   ============================================================ */

import type { ApplicationRecord, AuditEntry, DispatchBatch, VacancyV2 } from "./types";
import { STORE_KEYS } from "./types";
import { mintCode } from "./studio";

/* ---------- guarded JSON access ---------- */

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback; // corrupted or unavailable storage — behave as empty
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — data lives in memory only */
  }
}

const LOWER_ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";
const UPPER_ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randId(len: number, alphabet: string = LOWER_ALNUM): string {
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/* ---------- vacancies (SPEC §3) ---------- */

export function listVacancies(): VacancyV2[] {
  if (typeof window === "undefined") return [];
  return readJson<VacancyV2[]>(STORE_KEYS.vacancies, []);
}

/* Match by id OR public competition code (code is case-insensitive). */
export function getVacancy(idOrCode: string): VacancyV2 | null {
  if (typeof window === "undefined") return null;
  const all = listVacancies();
  const norm = idOrCode.trim();
  return (
    all.find((v) => v.id === norm) ??
    all.find((v) => v.code.toUpperCase() === norm.toUpperCase()) ??
    null
  );
}

export function saveVacancy(v: VacancyV2): void {
  if (typeof window === "undefined") return;
  const all = listVacancies();
  const idx = all.findIndex((x) => x.id === v.id);
  if (idx >= 0) all[idx] = v;
  else all.push(v);
  writeJson(STORE_KEYS.vacancies, all);
}

/* Publish (SPEC §4.8): assign a real id, mint the collision-checked
   competition code, freeze status LIVE, default the window to now → +14 days,
   log the PUBLISHED audit entry, persist. */
export function publishDraft(draft: VacancyV2): VacancyV2 {
  const existing = listVacancies();
  const now = new Date();
  const nowIso = now.toISOString();
  const id = draft.id === "vac-draft" ? "vac-" + randId(4) : draft.id;
  const code = draft.code || mintCode(existing.map((v) => v.code));
  const published: VacancyV2 = {
    ...draft,
    id,
    code,
    status: "LIVE",
    publishedAt: nowIso,
    createdAt: draft.createdAt || nowIso,
    window: {
      ...draft.window,
      opensAt: draft.window.opensAt || nowIso,
      closesAt: draft.window.closesAt || new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    audit: appendAudit(draft.audit, {
      actor: "a.rakhimova (HR)",
      action: "PUBLISHED",
      target: code,
      modelVer: "studio-v1",
    }),
  };
  saveVacancy(published);
  return published;
}

/* ---------- append-only audit chain (SPEC §1 law 1) ---------- */

function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function djb2(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = (Math.imul(h, 33) + input.charCodeAt(i)) | 0;
  return h >>> 0;
}

/* Rendered like the fixtures: "9f4e2ab1…c07d" — 8 hex, ellipsis, 4 hex. */
function chainHash(prevHash: string, payload: string): string {
  const src = prevHash + payload;
  const head = fnv1a(src).toString(16).padStart(8, "0");
  const tail = (djb2(src) & 0xffff).toString(16).padStart(4, "0");
  return `${head}…${tail}`;
}

function auditTimestamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* Returns a NEW array; never mutates the input. Each entry's hash chains
   over the previous entry's hash + this entry's payload. */
export function appendAudit(
  list: AuditEntry[],
  entry: Omit<AuditEntry, "id" | "hash" | "timestamp">,
): AuditEntry[] {
  const prev = list.length > 0 ? list[list.length - 1].hash : "genesis";
  const id = `AE-${String(list.length + 1).padStart(4, "0")}`;
  const timestamp = auditTimestamp();
  const hash = chainHash(prev, JSON.stringify({ id, timestamp, ...entry }));
  return [...list, { ...entry, id, timestamp, hash }];
}

/* ---------- applications (SPEC §7) ---------- */

export function listApplications(vacancyId?: string): ApplicationRecord[] {
  if (typeof window === "undefined") return [];
  const all = readJson<ApplicationRecord[]>(STORE_KEYS.applications, []);
  return vacancyId ? all.filter((a) => a.vacancyId === vacancyId) : all;
}

export function getApplication(id: string): ApplicationRecord | null {
  if (typeof window === "undefined") return null;
  return listApplications().find((a) => a.id === id) ?? null;
}

export function saveApplication(a: ApplicationRecord): void {
  if (typeof window === "undefined") return;
  const all = listApplications();
  const idx = all.findIndex((x) => x.id === a.id);
  if (idx >= 0) all[idx] = a;
  else all.push(a);
  writeJson(STORE_KEYS.applications, all);
}

/* Construct a fresh application record (caller persists via saveApplication).
   PII stays out of the internal id — blind by default (SPEC §1 law 7). */
export function newApplication(vacancy: VacancyV2, source?: string): ApplicationRecord {
  return {
    id: "app-" + randId(6),
    vacancyId: vacancy.id,
    code: vacancy.code,
    source,
    candidate: { internalId: "CND-" + randId(4, UPPER_ALNUM) },
    stage: "in_progress",
    consent: null,
    blockResults: [],
    currentBlockIndex: 0,
    createdAt: new Date().toISOString(),
    audit: [],
  };
}

/* ---------- dispatch batches (SPEC §9.4) ---------- */

export function listDispatchBatches(vacancyId: string): DispatchBatch[] {
  if (typeof window === "undefined") return [];
  return readJson<DispatchBatch[]>(STORE_KEYS.dispatch, []).filter((b) => b.vacancyId === vacancyId);
}

export function saveDispatchBatch(b: DispatchBatch): void {
  if (typeof window === "undefined") return;
  const all = readJson<DispatchBatch[]>(STORE_KEYS.dispatch, []);
  const idx = all.findIndex((x) => x.id === b.id);
  if (idx >= 0) all[idx] = b;
  else all.push(b);
  writeJson(STORE_KEYS.dispatch, all);
}

/* ---------- code entry (SPEC §6 — every channel resolves to one vacancy) ---------- */

/* P0/P1 compat shape stored under STORE_KEYS.legacyPublished,
   keyed by code: { [code]: { title, code, competencies, entry } }. */
export interface LegacyCompetition {
  vacancyId?: string;
  title: string;
  code: string;
  competencies: { name: string; weight: number }[];
  entry: string;
}

/* Resolution order: v2 store (LIVE only) → legacy published store → null.
   Static fixture competitions are handled by callers. */
export function findCompetitionByCode(
  code: string,
): { v2: VacancyV2 } | { legacy: LegacyCompetition } | null {
  if (typeof window === "undefined") return null;
  const norm = code.trim().toUpperCase();

  const v2 = listVacancies().find((v) => v.status === "LIVE" && v.code.toUpperCase() === norm);
  if (v2) return { v2 };

  const legacy = readJson<Record<string, LegacyCompetition>>(STORE_KEYS.legacyPublished, {});
  const direct = legacy[norm];
  if (direct) return { legacy: direct };
  for (const key of Object.keys(legacy)) {
    if (key.toUpperCase() === norm) return { legacy: legacy[key] };
  }
  return null;
}
