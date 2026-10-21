/** Lowercase, without accents or punctuation, with single spaces. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigramsOf(text: string): string[] {
  const chars = Array.from(text);
  return chars.slice(0, -1).map((char, i) => char + chars[i + 1]);
}

/**
 * How alike two texts are, from 0 (nothing in common) to 1 (the same once normalized).
 * It is the Dice coefficient over pairs of neighbouring characters:
 * twice the pairs they share, divided by the pairs in both.
 * Text with nothing left after normalizing has nothing to compare, so it scores 0.
 */
export function diceSimilarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (x === '' || y === '') return 0;
  if (x === y) return 1;

  const pairsX = bigramsOf(x);
  const pairsY = bigramsOf(y);
  if (pairsX.length === 0 || pairsY.length === 0) return 0;

  const unmatched = new Map<string, number>();
  for (const pair of pairsY) unmatched.set(pair, (unmatched.get(pair) ?? 0) + 1);

  let shared = 0;
  for (const pair of pairsX) {
    const left = unmatched.get(pair) ?? 0;
    if (left > 0) {
      shared += 1;
      unmatched.set(pair, left - 1);
    }
  }
  return (2 * shared) / (pairsX.length + pairsY.length);
}
