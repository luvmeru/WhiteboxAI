import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildVacancyVersionCohorts,
  nextVacancyConfigVersion,
  selectVacancyVersion,
  vacancyVersionStorageKey,
} from "../lib/server/vacancy-version";

test("published vacancy versions are assigned monotonically by the server", () => {
  assert.equal(nextVacancyConfigVersion(), 1);
  assert.equal(nextVacancyConfigVersion(1), 2);
  assert.equal(nextVacancyConfigVersion(41), 42);
  assert.throws(() => nextVacancyConfigVersion(0));
  assert.throws(() => nextVacancyConfigVersion(1.5));
  assert.throws(() => nextVacancyConfigVersion(Number.MAX_SAFE_INTEGER));
});

test("development vacancy-version keys are tenant-aware", () => {
  const firstTenant = vacancyVersionStorageKey("org-a", "vacancy", 2);
  const secondTenant = vacancyVersionStorageKey("org-b", "vacancy", 2);

  assert.notEqual(firstTenant, secondTenant);
  assert.deepEqual(JSON.parse(firstTenant), ["org-a", "vacancy", 2]);
});

test("vacancy version cohorts are counted and sorted independently", () => {
  const cohorts = buildVacancyVersionCohorts([
    { vacancyVersion: 2 },
    { vacancyVersion: 1 },
    { vacancyVersion: 2 },
    { vacancyVersion: 3 },
    { vacancyVersion: 1 },
  ]);

  assert.deepEqual(cohorts, [
    { version: 1, applications: 2 },
    { version: 2, applications: 2 },
    { version: 3, applications: 1 },
  ]);
});

test("ranking defaults to the newest application-bound version", () => {
  const cohorts = buildVacancyVersionCohorts([
    { vacancyVersion: 1 },
    { vacancyVersion: 3 },
    { vacancyVersion: 2 },
  ]);

  assert.equal(selectVacancyVersion(cohorts), 3);
});

test("an explicitly requested historical version is never replaced by the newest version", () => {
  const cohorts = buildVacancyVersionCohorts([
    { vacancyVersion: 1 },
    { vacancyVersion: 2 },
  ]);

  assert.equal(selectVacancyVersion(cohorts, 1), 1);
});
