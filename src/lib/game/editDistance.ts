/**
 * How many edits it takes to turn `a` into `b`: adding, removing or replacing a letter, or swapping two
 * neighbouring letters, each counting as one ("get" to "gte" is 1). It is the Damerau-Levenshtein distance in its
 * "optimal string alignment" form, where no stretch of letters is edited twice; that is right for typos.
 * Capitals count as different letters, so lowercase both texts first when they should not.
 */
export function damerau(a: string, b: string): number {
  // Only the last three rows of the table are needed. Row i holds the distances between the first i letters of `a`
  // and the first j letters of `b`, for every j.
  let beforePrevious = new Array<number>(b.length + 1).fill(0);
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  let current = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        previous[j] + 1, // a letter of `a` has to go
        current[j - 1] + 1, // a letter of `b` has to come in
        previous[j - 1] + cost, // a letter is replaced, or stays when the cost is 0
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, beforePrevious[j - 2] + 1); // two neighbours swapped
      }
      current[j] = best;
    }
    [beforePrevious, previous, current] = [previous, current, beforePrevious];
  }
  return previous[b.length];
}
