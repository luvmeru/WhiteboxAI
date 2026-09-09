import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { vacancyV2Demo } from "../lib/fixtures";
import {
  appendAudit,
  findCompetitionByCode,
  getApplication,
  getVacancy,
  listApplications,
  listVacancies,
  newApplication,
  publishDraft,
  saveApplication,
  saveVacancy,
} from "../lib/store";
import { STORE_KEYS } from "../lib/types";
import type { AuditEntry, VacancyV2 } from "../lib/types";

class MemoryStorage {
  readonly #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, String(value));
  }
}

function installBrowserStorage(): MemoryStorage {
  const localStorage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  });
  return localStorage;
}

function cloneVacancy(): VacancyV2 {
  return structuredClone(vacancyV2Demo);
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

test("server-side storage guards return empty values without throwing", () => {
  assert.deepEqual(listVacancies(), []);
  assert.equal(getVacancy("WBX-7Q4K"), null);
  assert.deepEqual(listApplications(), []);
  assert.equal(getApplication("app-missing"), null);
  assert.equal(findCompetitionByCode("WBX-7Q4K"), null);
});

test("vacancy persistence upserts by id and resolves codes case-insensitively", () => {
  installBrowserStorage();
  const vacancy = cloneVacancy();
  saveVacancy(vacancy);

  assert.equal(listVacancies().length, 1);
  assert.equal(getVacancy("  wbx-7q4k  ")?.id, vacancy.id);

  saveVacancy({
    ...vacancy,
    profile: { ...vacancy.profile, title: "Updated title" },
  });

  assert.equal(listVacancies().length, 1);
  assert.equal(getVacancy(vacancy.id)?.profile.title, "Updated title");
});

test("corrupt browser storage fails closed to an empty collection", () => {
  const storage = installBrowserStorage();
  storage.setItem(STORE_KEYS.vacancies, "{not-json");
  storage.setItem(STORE_KEYS.applications, "null-is-not-an-array");

  assert.deepEqual(listVacancies(), []);
  assert.deepEqual(listApplications(), []);
});

test("audit appends without mutating history and chains each new entry", () => {
  const original: AuditEntry[] = [];
  const first = appendAudit(original, {
    actor: "security-reviewer",
    action: "CONSENTED",
    target: "vac-test",
    modelVer: "unit-test",
  });
  const firstSnapshot = structuredClone(first);
  const second = appendAudit(first, {
    actor: "hiring-manager",
    action: "PUBLISHED",
    target: "vac-test",
    reason: "Approved test publication",
    modelVer: "unit-test",
  });

  assert.deepEqual(original, []);
  assert.deepEqual(first, firstSnapshot);
  assert.equal(first[0].id, "AE-0001");
  assert.equal(second[1].id, "AE-0002");
  assert.notEqual(second[0].hash, second[1].hash);
  assert.match(second[0].hash, /^[0-9a-f]{8}…[0-9a-f]{4}$/);
  assert.match(second[1].hash, /^[0-9a-f]{8}…[0-9a-f]{4}$/);
});

test("publishing freezes status, creates a 14-day window, audits, and persists", () => {
  installBrowserStorage();
  const draft = cloneVacancy();
  draft.id = "vac-draft";
  draft.code = "";
  draft.status = "DRAFT";
  draft.createdAt = "";
  draft.publishedAt = undefined;
  draft.window.opensAt = "";
  draft.window.closesAt = "";
  draft.audit = [];

  const published = publishDraft(draft);
  const windowLength =
    new Date(published.window.closesAt).getTime() -
    new Date(published.window.opensAt).getTime();

  assert.equal(published.status, "LIVE");
  assert.notEqual(published.id, "vac-draft");
  assert.match(published.code, /^WBX-[BCDFGHJKMNPQRSTVWXYZ23456789]{4}$/);
  assert.equal(windowLength, 14 * 24 * 60 * 60 * 1000);
  assert.equal(published.audit.at(-1)?.action, "PUBLISHED");
  assert.equal(getVacancy(published.id)?.code, published.code);
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.audit.length, 0);
});

test("new applications contain opaque identifiers and persist by upsert", () => {
  installBrowserStorage();
  const vacancy = cloneVacancy();
  const created = newApplication(vacancy, "linkedin");

  assert.match(created.id, /^app-[a-z0-9]{6}$/);
  assert.match(created.candidate.internalId, /^CND-[A-Z0-9]{4}$/);
  assert.equal(created.candidate.email, undefined);
  assert.equal(created.source, "linkedin");
  assert.equal(created.stage, "in_progress");

  saveApplication(created);
  saveApplication({ ...created, stage: "submitted" });

  assert.equal(listApplications(vacancy.id).length, 1);
  assert.equal(getApplication(created.id)?.stage, "submitted");
});

test("competition lookup exposes only live v2 vacancies and supports legacy codes", () => {
  const storage = installBrowserStorage();
  const live = cloneVacancy();
  const draft = {
    ...cloneVacancy(),
    id: "vac-draft-only",
    code: "WBX-DRFT",
    status: "DRAFT" as const,
  };
  saveVacancy(live);
  saveVacancy(draft);

  const resolved = findCompetitionByCode(" wbx-7q4k ");
  assert.ok(resolved && "v2" in resolved);
  assert.equal(resolved.v2.id, live.id);
  assert.equal(findCompetitionByCode("WBX-DRFT"), null);

  storage.setItem(
    STORE_KEYS.legacyPublished,
    JSON.stringify({
      "WBX-OLD1": {
        title: "Legacy vacancy",
        code: "WBX-OLD1",
        competencies: [],
        entry: "legacy",
      },
    }),
  );
  const legacy = findCompetitionByCode("wbx-old1");
  assert.ok(legacy && "legacy" in legacy);
  assert.equal(legacy.legacy.title, "Legacy vacancy");
});
