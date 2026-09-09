import { NextResponse } from "next/server";
import { candidateControlledMinutes } from "@/lib/candidate-assessment-view";
import { getClientKey, getRequestId } from "@/lib/server/http";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/server/rate-limit";
import { resolveCompetition } from "@/lib/server/repository";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const requestId = getRequestId(request);
  let limiter;
  try {
    limiter = await consumeRateLimit(getClientKey(request), {
      namespace: "public.competition.resolve",
      limit: 30,
      windowMs: 10 * 60_000,
    });
  } catch {
    return NextResponse.json(
      {
        error: "Request protection is temporarily unavailable.",
        code: "RATE_LIMIT_STORE_UNAVAILABLE",
        requestId,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "5",
          "X-Request-Id": requestId,
        },
      },
    );
  }
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Request-Id": requestId,
    ...rateLimitHeaders(limiter),
  };
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later.", code: "RATE_LIMITED", requestId },
      { status: 429, headers },
    );
  }

  const { code } = await params;
  if (!/^WBX-[A-Z0-9]{4}$/i.test(code)) {
    return NextResponse.json(
      { error: "Competition code format is invalid.", requestId },
      { status: 400, headers },
    );
  }
  const competition = await resolveCompetition(code);
  if (!competition) {
    return NextResponse.json(
      { error: "Competition not found or no longer open.", requestId },
      { status: 404, headers },
    );
  }
  return NextResponse.json(
    {
      competition: {
        title: competition.title,
        code: competition.code,
        entry: competition.entry,
        noticeVersion: competition.noticeVersion,
        role: competition.assessmentPlan
          ? competition.assessmentPlan.role
          : {
              title: competition.title,
              mission:
                "Complete the published structured interview for this role.",
              primaryLanguage: "English",
            },
        assessment: competition.assessmentPlan
          ? {
              totalEstimatedMinutes: candidateControlledMinutes(
                competition.assessmentPlan,
              ),
              finalDecisionByNamedHuman:
                competition.assessmentPlan.finalDecisionByNamedHuman,
              blocks: competition.assessmentPlan.blocks.map((block) => ({
                id: block.id,
                order: block.order,
                title: block.title,
                kind: block.kind,
                required: block.required,
                estimatedMinutes: block.estimatedMinutes,
                deliveryState: block.delivery.state,
                scoringUse: block.scoring.use,
              })),
            }
          : {
              totalEstimatedMinutes: Math.max(
                5,
                competition.questions.length * 4,
              ),
              finalDecisionByNamedHuman: true,
              blocks: [
                {
                  id: competition.interviewBlockId ?? "legacy-interview",
                  order: 1,
                  title: "Structured interview",
                  kind: "async_interview",
                  required: true,
                  estimatedMinutes: Math.max(
                    5,
                    competition.questions.length * 4,
                  ),
                  deliveryState: "interview_runtime",
                  scoringUse: "composite",
                },
              ],
            },
        notice: {
          aiDisclosure:
            competition.assessmentPlan?.candidateExperience.aiDisclosure ??
            "AI may assist with structured evidence review. A named human remains responsible for the employment decision.",
          retentionDays: competition.retentionDays,
        },
      },
    },
    { headers },
  );
}
