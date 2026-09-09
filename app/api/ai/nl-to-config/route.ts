import type { NlToConfigRequest } from "@/lib/ai-contracts";
import { generateVacancyConfig } from "@/lib/server/ai-provider";
import {
  createJsonApiRoute,
  expectObject,
  expectOnlyKeys,
  expectString,
} from "@/lib/server/http";

function validateNlToConfigBody(value: unknown): NlToConfigRequest {
  const body = expectObject(value);
  expectOnlyKeys(body, ["title", "description"]);
  return {
    title: expectString(body.title, "body.title", { min: 2, max: 160 }),
    description: expectString(body.description, "body.description", { min: 20, max: 20_000 }),
  };
}

/* Real-provider-only HR authoring endpoint. `generateVacancyConfig` rejects
   missing or disabled OpenAI configuration and returns no local content. */
export const POST = createJsonApiRoute(
  {
    routeId: "ai.nl-to-config",
    access: "hr",
    roles: ["Owner", "HiringManager"],
    maxBodyBytes: 32 * 1024,
    rateLimit: { limit: 20, windowMs: 60_000 },
    validate: validateNlToConfigBody,
  },
  async ({ body }) => generateVacancyConfig(body),
);
