import { generateVacancyDraft } from "@/lib/server/ai-provider";
import {
  createJsonApiRoute,
  expectArray,
  expectBoolean,
  expectEnum,
  expectNumber,
  expectObject,
  expectOnlyKeys,
  expectString,
  optionalString,
} from "@/lib/server/http";
import type { PositionProfile } from "@/lib/types";

const SENIORITIES = ["Intern", "Junior", "Middle", "Senior", "Lead", "Head", "Executive"] as const;
const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "seasonal", "shift"] as const;
const WORK_MODES = ["on_site", "hybrid", "remote_country", "remote_global"] as const;
const INDUSTRY_PACKS = [
  "tech", "sales_cs", "healthcare", "finance", "retail_hourly",
  "manufacturing", "logistics", "creative", "public_sector", "education", "custom",
] as const;
const TAXONOMIES = ["ONET", "ESCO", "SFIA", "UCF", "custom"] as const;

function stringArray(value: unknown, path: string, maxItems: number, maxLength: number): string[] {
  return expectArray(value, path, { max: maxItems }).map((item, index) =>
    expectString(item, `${path}[${index}]`, { min: 1, max: maxLength })
  );
}

function validatePositionProfile(value: unknown): PositionProfile {
  const profile = expectObject(value, "body.profile");
  expectOnlyKeys(profile, [
    "title", "requisitionId", "department", "hiringManager", "openings", "seniority",
    "employmentType", "workMode", "locations", "timezoneOverlap", "compensation",
    "taxonomyRef", "mission", "responsibilities", "teamContext",
    "successOutcomes", "operatingConstraints", "stakeholderGroups",
    "specialRequirements", "internalComments", "tags",
    "industryPack", "languages",
  ], "body.profile");

  let compensation: PositionProfile["compensation"];
  if (profile.compensation !== undefined) {
    const input = expectObject(profile.compensation, "body.profile.compensation");
    expectOnlyKeys(input, ["min", "max", "currency", "period", "visible"], "body.profile.compensation");
    const min = expectNumber(input.min, "body.profile.compensation.min", { min: 0, max: 1_000_000_000 });
    const max = expectNumber(input.max, "body.profile.compensation.max", { min, max: 1_000_000_000 });
    compensation = {
      min,
      max,
      currency: expectString(input.currency, "body.profile.compensation.currency", { min: 3, max: 8 }),
      period: expectEnum(input.period, "body.profile.compensation.period", ["year", "month", "hour"] as const),
      visible: expectBoolean(input.visible, "body.profile.compensation.visible"),
    };
  }

  let taxonomyRef: PositionProfile["taxonomyRef"];
  if (profile.taxonomyRef !== undefined) {
    const input = expectObject(profile.taxonomyRef, "body.profile.taxonomyRef");
    expectOnlyKeys(input, ["system", "code", "label"], "body.profile.taxonomyRef");
    taxonomyRef = {
      system: expectEnum(input.system, "body.profile.taxonomyRef.system", TAXONOMIES),
      code: expectString(input.code, "body.profile.taxonomyRef.code", { min: 1, max: 80 }),
      label: expectString(input.label, "body.profile.taxonomyRef.label", { min: 1, max: 200 }),
    };
  }

  const languages = expectObject(profile.languages, "body.profile.languages");
  expectOnlyKeys(languages, ["primary", "alternates"], "body.profile.languages");

  return {
    title: expectString(profile.title, "body.profile.title", { min: 1, max: 160 }),
    requisitionId: optionalString(profile.requisitionId, "body.profile.requisitionId", { max: 120 }),
    department: optionalString(profile.department, "body.profile.department", { max: 160 }),
    hiringManager: optionalString(profile.hiringManager, "body.profile.hiringManager", { max: 160 }),
    openings: expectNumber(profile.openings, "body.profile.openings", { min: 1, max: 10_000, integer: true }),
    seniority: expectEnum(profile.seniority, "body.profile.seniority", SENIORITIES),
    employmentType: expectEnum(profile.employmentType, "body.profile.employmentType", EMPLOYMENT_TYPES),
    workMode: expectEnum(profile.workMode, "body.profile.workMode", WORK_MODES),
    locations: stringArray(profile.locations, "body.profile.locations", 20, 160),
    timezoneOverlap: optionalString(profile.timezoneOverlap, "body.profile.timezoneOverlap", { max: 160 }),
    compensation,
    taxonomyRef,
    mission: expectString(profile.mission, "body.profile.mission", { max: 5_000 }),
    responsibilities: stringArray(profile.responsibilities, "body.profile.responsibilities", 50, 1_000),
    teamContext: optionalString(profile.teamContext, "body.profile.teamContext", { max: 5_000 }),
    successOutcomes:
      profile.successOutcomes === undefined
        ? undefined
        : stringArray(
            profile.successOutcomes,
            "body.profile.successOutcomes",
            30,
            1_000,
          ),
    operatingConstraints:
      profile.operatingConstraints === undefined
        ? undefined
        : stringArray(
            profile.operatingConstraints,
            "body.profile.operatingConstraints",
            30,
            1_000,
          ),
    stakeholderGroups:
      profile.stakeholderGroups === undefined
        ? undefined
        : stringArray(
            profile.stakeholderGroups,
            "body.profile.stakeholderGroups",
            30,
            300,
          ),
    specialRequirements:
      profile.specialRequirements === undefined
        ? undefined
        : stringArray(
            profile.specialRequirements,
            "body.profile.specialRequirements",
            30,
            1_000,
          ),
    internalComments:
      profile.internalComments === undefined
        ? undefined
        : stringArray(
            profile.internalComments,
            "body.profile.internalComments",
            30,
            2_000,
          ),
    tags:
      profile.tags === undefined
        ? undefined
        : stringArray(profile.tags, "body.profile.tags", 30, 80),
    industryPack: expectEnum(profile.industryPack, "body.profile.industryPack", INDUSTRY_PACKS),
    languages: {
      primary: expectString(languages.primary, "body.profile.languages.primary", { min: 1, max: 40 }),
      alternates: stringArray(languages.alternates, "body.profile.languages.alternates", 20, 40),
    },
  };
}

function validateSuggestCriteriaBody(value: unknown): { profile: PositionProfile } {
  const body = expectObject(value);
  expectOnlyKeys(body, ["profile"]);
  return { profile: validatePositionProfile(body.profile) };
}

/* HR-only authoring endpoint. The shared wrapper enforces validation,
   payload limits, rate limits and the pluggable HR auth guard. */
export const POST = createJsonApiRoute(
  {
    routeId: "ai.suggest-criteria",
    access: "hr",
    roles: ["Owner", "HiringManager"],
    maxBodyBytes: 64 * 1024,
    rateLimit: { limit: 30, windowMs: 60_000 },
    validate: validateSuggestCriteriaBody,
  },
  async ({ body }) => {
    const profile = body.profile;
    const section = (label: string, values?: string[]) =>
      values?.length
        ? `${label}:\n${values.map((value) => `- ${value}`).join("\n")}`
        : undefined;
    const description = [
      profile.mission,
      section("Responsibilities", profile.responsibilities),
      section("Observable success outcomes", profile.successOutcomes),
      section("Operating constraints", profile.operatingConstraints),
      section("Stakeholder groups", profile.stakeholderGroups),
      section("Job-related special requirements", profile.specialRequirements),
      section(
        "Internal hiring context (never convert protected traits or proxies into criteria)",
        profile.internalComments,
      ),
      section("Employer taxonomy tags", profile.tags),
      profile.teamContext,
      `Seniority: ${profile.seniority}`,
      `Employment: ${profile.employmentType}`,
      `Work mode: ${profile.workMode}`,
      `Industry: ${profile.industryPack}`,
      `Primary language: ${profile.languages.primary}`,
    ]
      .filter(Boolean)
      .join("\n");
    const generated = await generateVacancyDraft(profile.title, description);
    return {
      categories: generated.draft.categories,
      modelVer: generated.modelVer,
      promptVer: generated.promptVer,
    };
  },
);
