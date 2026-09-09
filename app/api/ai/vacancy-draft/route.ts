import { generateVacancyDraft } from "@/lib/server/ai-provider";
import {
  createJsonApiRoute,
  expectObject,
  expectOnlyKeys,
  expectString,
} from "@/lib/server/http";

interface VacancyDraftBody {
  title: string;
  description: string;
}

function validateVacancyDraftBody(value: unknown): VacancyDraftBody {
  const body = expectObject(value);
  expectOnlyKeys(body, ["title", "description"]);
  return {
    title: expectString(body.title, "body.title", { min: 2, max: 160 }),
    description: expectString(body.description, "body.description", { min: 20, max: 20_000 }),
  };
}

/* Real-provider-only Describe mode. The server performs structured job analysis
   and assessment authoring; no placeholder title or deterministic draft is
   returned when the provider is unavailable. */
export const POST = createJsonApiRoute(
  {
    routeId: "ai.vacancy-draft",
    access: "hr",
    roles: ["Owner", "HiringManager"],
    maxBodyBytes: 32 * 1024,
    rateLimit: { limit: 20, windowMs: 60_000 },
    validate: validateVacancyDraftBody,
  },
  async ({ body }) =>
    generateVacancyDraft(body.title, body.description),
);
