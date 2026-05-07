/**
 * Token-set Jaccard similarity, lower-cased and split on non-word.
 * Returns 0 for empty inputs to avoid false-similar pairs.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  if (union === 0) return 0;
  return inter / union;
}

function tokenize(s: string): Set<string> {
  return new Set(
    (s ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((t) => t.length > 0),
  );
}
