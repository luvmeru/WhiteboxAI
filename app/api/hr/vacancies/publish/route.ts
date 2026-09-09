import { NextResponse } from "next/server";
import { z } from "zod";
import { preflight } from "@/lib/studio";
import { getHrSession } from "@/lib/server/auth";
import { compileAssessmentBlueprint } from "@/lib/server/assessment-blueprint";
import { compileCandidateAssessmentPlan } from "@/lib/server/assessment-runtime";
import {
  ApiError,
  ValidationError,
  createJsonApiRoute,
} from "@/lib/server/http";
import { savePublishedVacancy } from "@/lib/server/repository";
import { vacancySchema } from "@/lib/server/vacancy-schema";

const publishSchema = z.object({
  previewed: z.literal(true),
  vacancy: vacancySchema,
});

type PublishBody = z.infer<typeof publishSchema>;

function validatePublishBody(value: unknown): PublishBody {
  const parsed = publishSchema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ValidationError(
      first?.path.length ? `body.${first.path.join(".")}` : "body",
      first?.message || "is invalid",
    );
  }
  return parsed.data;
}

export const POST = createJsonApiRoute(
  {
    routeId: "hr.vacancy.publish",
    access: "hr",
    roles: ["Owner", "HiringManager"],
    maxBodyBytes: 512 * 1024,
    rateLimit: { limit: 10, windowMs: 60_000 },
    validate: validatePublishBody,
  },
  async ({ body, requestId, principal }) => {
    const session = await getHrSession();
    if (!session || session.organizationId !== principal?.organizationId) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication is required.");
    }
    const vacancy = body.vacancy;
    const blueprint = compileAssessmentBlueprint(vacancy);
    const candidatePlan = blueprint.ready
      ? compileCandidateAssessmentPlan(vacancy, blueprint)
      : null;
    const blockers = preflight(vacancy).filter((issue) => issue.severity === "blocker");
    const blueprintBlockers = blueprint.issues.filter(
      (issue) => issue.severity === "blocker",
    );
    const candidateRuntimeBlockers =
      candidatePlan?.readyForCandidate === false
        ? candidatePlan.blockingReasonCodes
        : [];
    if (
      blockers.length ||
      blueprintBlockers.length ||
      candidateRuntimeBlockers.length
    ) {
      const blockerCount = new Set([
        ...blockers.map((issue) => issue.id),
        ...blueprintBlockers.map(
          (issue) =>
            `${issue.code}:${issue.blockId ?? ""}:${issue.attributeId ?? ""}`,
        ),
        ...candidateRuntimeBlockers.map(
          (code) => `candidate-runtime:${code}`,
        ),
      ]).size;
      throw new ApiError(
        409,
        "PREFLIGHT_BLOCKED",
        `Resolve ${blockerCount} preflight blocker${blockerCount === 1 ? "" : "s"} before publishing.`,
      );
    }

    const published = await savePublishedVacancy(vacancy, session, requestId);
    const publishedBlueprint = compileAssessmentBlueprint(published);
    return NextResponse.json(
      {
        vacancy: published,
        assessmentBlueprint: publishedBlueprint,
        candidateAssessmentPlan: compileCandidateAssessmentPlan(
          published,
          publishedBlueprint,
        ),
        requestId,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  },
);
