import type { PipelineBlock } from "@/lib/types";
import type { ServerInterviewQuestion } from "./repository";

export function interviewAttributeIds(
  block: Pick<PipelineBlock, "measures">,
  questions: readonly Pick<
    ServerInterviewQuestion,
    "attributeId" | "secondaryAttributeId"
  >[],
): string[] {
  const configured = block.measures
    .map((measure) => measure.attributeId.trim())
    .filter(Boolean);
  const source =
    configured.length > 0
      ? configured
      : questions.map((question) => question.attributeId);
  return [...new Set(source)];
}

export interface PublishedInterviewWeight {
  categoryId: string;
  weight: number;
}

export interface ScoredInterviewWeight extends PublishedInterviewWeight {
  score: number;
}

export function aggregateInterviewEvidence(
  scored: readonly ScoredInterviewWeight[],
  published: readonly PublishedInterviewWeight[],
): {
  overall: number;
  coverage: number;
  scoredWeight: number;
  publishedWeight: number;
  categoryScores: { categoryId: string; score: number }[];
} {
  const publishedWeight = published.reduce(
    (sum, item) => sum + Math.max(0, item.weight),
    0,
  );
  const scoredWeight = scored.reduce(
    (sum, item) => sum + Math.max(0, item.weight),
    0,
  );
  const overall =
    scoredWeight > 0
      ? Math.round(
          scored.reduce(
            (sum, item) =>
              sum + item.score * Math.max(0, item.weight),
            0,
          ) / scoredWeight,
        )
      : 0;
  const categoryIds = [
    ...new Set(published.map((item) => item.categoryId)),
  ];
  const categoryScores = categoryIds.flatMap((categoryId) => {
    const rows = scored.filter((item) => item.categoryId === categoryId);
    const weight = rows.reduce(
      (sum, item) => sum + Math.max(0, item.weight),
      0,
    );
    if (weight <= 0) return [];
    return [{
      categoryId,
      score: Math.round(
        rows.reduce(
          (sum, item) =>
            sum + item.score * Math.max(0, item.weight),
          0,
        ) / weight,
      ),
    }];
  });

  return {
    overall,
    coverage:
      publishedWeight > 0
        ? Math.round((scoredWeight / publishedWeight) * 100)
        : 0,
    scoredWeight,
    publishedWeight,
    categoryScores,
  };
}
