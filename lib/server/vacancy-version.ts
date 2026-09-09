export interface VacancyVersionCohort {
  version: number;
  applications: number;
}

export function nextVacancyConfigVersion(
  currentVersion?: number,
): number {
  if (currentVersion === undefined) return 1;
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 1) {
    throw new Error("The current vacancy version is invalid.");
  }
  const nextVersion = currentVersion + 1;
  if (!Number.isSafeInteger(nextVersion)) {
    throw new Error("The vacancy version limit has been reached.");
  }
  return nextVersion;
}

export function vacancyVersionStorageKey(
  organizationId: string,
  vacancyId: string,
  version: number,
): string {
  if (!organizationId || !vacancyId) {
    throw new Error("A vacancy version key requires tenant and vacancy IDs.");
  }
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("A vacancy version key requires a positive integer version.");
  }
  return JSON.stringify([organizationId, vacancyId, version]);
}

export function buildVacancyVersionCohorts(
  applications: readonly { vacancyVersion: number }[],
): VacancyVersionCohort[] {
  const countsByVersion = new Map<number, number>();
  for (const application of applications) {
    countsByVersion.set(
      application.vacancyVersion,
      (countsByVersion.get(application.vacancyVersion) ?? 0) + 1,
    );
  }
  return [...countsByVersion.entries()]
    .sort(([left], [right]) => left - right)
    .map(([version, applicationCount]) => ({
      version,
      applications: applicationCount,
    }));
}

export function selectVacancyVersion(
  cohorts: readonly VacancyVersionCohort[],
  requestedVersion?: number,
): number | undefined {
  return requestedVersion ?? cohorts.at(-1)?.version;
}
