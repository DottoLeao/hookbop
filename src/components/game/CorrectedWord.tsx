'use client';

import type { ReactNode } from 'react';

interface CorrectedWordProps {
  word: string;
  /** The places in `word` (indexes into its text) of the letters that were fixed, as `matchTyped` gives them. */
  corrected?: readonly number[];
}

/** A wavy line under the letter, in the dark of the text on lime, where a corrected word always sits. */
const fixedLook = 'underline decoration-bg decoration-wavy underline-offset-[5px]';

/**
 * A word that was typed with a slip and set right: each letter that was fixed sits in a span marked
 * `data-corrected` with a wavy underline, as in design/canvas/Digitacao.dc.html ("g" + wavy "et"). The rest is plain
 * text. A place that is not in the word is ignored. It is a single element, so it stays whole inside a flex row.
 */
export function CorrectedWord({ word, corrected = [] }: CorrectedWordProps) {
  const fixedPlaces = new Set(corrected);
  const parts: ReactNode[] = [];
  let plain = '';
  for (let place = 0; place < word.length; place++) {
    if (!fixedPlaces.has(place)) {
      plain += word[place];
      continue;
    }
    if (plain) parts.push(plain);
    plain = '';
    parts.push(
      <span key={place} data-corrected className={fixedLook}>
        {word[place]}
      </span>,
    );
  }
  if (plain) parts.push(plain);
  return <span>{parts}</span>;
}
