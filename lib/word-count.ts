/**
 * Counts natural-language words without treating punctuation as words. Modern
 * runtimes use Unicode-aware segmentation; the fallback remains deterministic
 * for browsers without Intl.Segmenter.
 */
export function countNaturalLanguageWords(
  value: string,
  locale?: string,
): number {
  const text = value.trim();
  if (!text) return 0;
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
    let words = 0;
    for (const segment of segmenter.segment(text)) {
      if (segment.isWordLike) words += 1;
    }
    return words;
  }
  return text.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
