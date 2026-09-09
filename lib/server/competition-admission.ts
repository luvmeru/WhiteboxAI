import type { VacancyV2 } from "../types";

export type CompetitionAdmissionErrorCode =
  | "COMPETITION_NOT_OPEN"
  | "COMPETITION_CLOSED"
  | "COMPETITION_CAPACITY_REACHED"
  | "COMPETITION_CHANGED"
  | "COMPETITION_UNAVAILABLE"
  | "COMPETITION_ADMISSION_UNAVAILABLE";

export class CompetitionAdmissionError extends Error {
  constructor(
    readonly code: CompetitionAdmissionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CompetitionAdmissionError";
  }
}

export interface CompetitionAdmissionPolicy {
  opensAt: string;
  closesAt: string;
  timezone: string;
  maxSubmissions?: number;
}

interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/i;
const LOCAL_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

export function admissionPolicyFromVacancy(
  vacancy: Pick<VacancyV2, "window" | "capacity">,
): CompetitionAdmissionPolicy {
  return {
    opensAt: vacancy.window.opensAt,
    closesAt: vacancy.window.closesAt,
    timezone: vacancy.window.timezone,
    ...(vacancy.capacity?.maxSubmissions === undefined
      ? {}
      : { maxSubmissions: vacancy.capacity.maxSubmissions }),
  };
}

/**
 * Enforces the immutable published admission policy against a UTC instant.
 * The window is half-open: [opensAt, closesAt).
 */
export function assertCompetitionAdmission(
  policy: CompetitionAdmissionPolicy,
  currentSubmissions: number,
  at: Date = new Date(),
): void {
  const now = at.getTime();
  const opensAt = configuredInstant(policy.opensAt, policy.timezone);
  const closesAt = configuredInstant(policy.closesAt, policy.timezone);
  const maxSubmissions = policy.maxSubmissions;

  if (
    !Number.isFinite(now) ||
    opensAt === null ||
    closesAt === null ||
    closesAt <= opensAt ||
    !Number.isSafeInteger(currentSubmissions) ||
    currentSubmissions < 0 ||
    (maxSubmissions !== undefined &&
      (!Number.isSafeInteger(maxSubmissions) || maxSubmissions < 1))
  ) {
    throw new CompetitionAdmissionError(
      "COMPETITION_ADMISSION_UNAVAILABLE",
      "This competition cannot accept applications because its published admission settings are invalid.",
    );
  }
  if (now < opensAt) {
    throw new CompetitionAdmissionError(
      "COMPETITION_NOT_OPEN",
      "Applications for this competition are not open yet.",
    );
  }
  if (now >= closesAt) {
    throw new CompetitionAdmissionError(
      "COMPETITION_CLOSED",
      "The application window for this competition has closed.",
    );
  }
  if (
    maxSubmissions !== undefined &&
    currentSubmissions >= maxSubmissions
  ) {
    throw new CompetitionAdmissionError(
      "COMPETITION_CAPACITY_REACHED",
      "This competition has reached its application limit.",
    );
  }
}

function configuredInstant(value: string, timezone: string): number | null {
  const candidate = value.trim();
  if (!candidate) return null;
  if (EXPLICIT_OFFSET.test(candidate)) {
    const parsed = Date.parse(candidate);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const match = LOCAL_DATE_TIME.exec(candidate);
  if (!match) return null;
  const local: LocalDateTime = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
    millisecond: Number((match[7] ?? "").padEnd(3, "0") || 0),
  };
  if (!validLocalDateTime(local)) return null;

  const zone = timezone.trim();
  if (!zone) return null;
  if (zone === "UTC" || zone === "Etc/UTC" || zone === "GMT") {
    return localDateTimeAsUtc(local);
  }
  return zonedLocalDateTimeAsUtc(local, zone);
}

function validLocalDateTime(value: LocalDateTime): boolean {
  if (
    value.month < 1 ||
    value.month > 12 ||
    value.day < 1 ||
    value.day > 31 ||
    value.hour < 0 ||
    value.hour > 23 ||
    value.minute < 0 ||
    value.minute > 59 ||
    value.second < 0 ||
    value.second > 59 ||
    value.millisecond < 0 ||
    value.millisecond > 999
  ) {
    return false;
  }
  const roundTrip = new Date(localDateTimeAsUtc(value));
  return (
    roundTrip.getUTCFullYear() === value.year &&
    roundTrip.getUTCMonth() + 1 === value.month &&
    roundTrip.getUTCDate() === value.day &&
    roundTrip.getUTCHours() === value.hour &&
    roundTrip.getUTCMinutes() === value.minute &&
    roundTrip.getUTCSeconds() === value.second &&
    roundTrip.getUTCMilliseconds() === value.millisecond
  );
}

function localDateTimeAsUtc(value: LocalDateTime): number {
  return Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute,
    value.second,
    value.millisecond,
  );
}

function zonedLocalDateTimeAsUtc(
  local: LocalDateTime,
  timezone: string,
): number | null {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return null;
  }

  const desiredWholeSecond = localDateTimeAsUtc({
    ...local,
    millisecond: 0,
  });
  let candidate = desiredWholeSecond + local.millisecond;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rendered = formattedLocalDateTime(formatter, candidate);
    if (!rendered) return null;
    const correction =
      desiredWholeSecond -
      localDateTimeAsUtc({ ...rendered, millisecond: 0 });
    if (correction === 0) break;
    candidate += correction;
  }

  if (!sameWallClock(formattedLocalDateTime(formatter, candidate), local)) {
    // Reject non-existent wall-clock values around daylight-saving changes.
    return null;
  }
  for (
    let deltaMinutes = -180;
    deltaMinutes <= 180;
    deltaMinutes += 15
  ) {
    if (deltaMinutes === 0) continue;
    const alternate = candidate + deltaMinutes * 60_000;
    if (sameWallClock(formattedLocalDateTime(formatter, alternate), local)) {
      // Reject ambiguous wall-clock values rather than selecting an offset.
      return null;
    }
  }
  return candidate;
}

function formattedLocalDateTime(
  formatter: Intl.DateTimeFormat,
  instant: number,
): LocalDateTime | null {
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const values = {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    millisecond: 0,
  };
  return Object.values(values).every(Number.isFinite) ? values : null;
}

function sameWallClock(
  actual: LocalDateTime | null,
  expected: LocalDateTime,
): boolean {
  return (
    actual !== null &&
    actual.year === expected.year &&
    actual.month === expected.month &&
    actual.day === expected.day &&
    actual.hour === expected.hour &&
    actual.minute === expected.minute &&
    actual.second === expected.second
  );
}
