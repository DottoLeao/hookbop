import { useEffect, useRef, useState } from 'react';
import { t } from '@/i18n/t';
import { helpErrorCopy } from '@/lib/help/helpError';
import type { LineHelp } from '@/lib/help/useLineHelp';
import type { TranslationView } from './LyricPanel';

/**
 * The translations of the lyric panel, by line index. A line keeps its translation on screen once it came.
 *
 * `translateLine` is "Traduzir verso": the translation goes under the line, whatever "Mostrar tradução sempre" says
 * (ruling R64), with "Traduzindo..." until it comes and DJ Bop's calm line if it cannot be had. A hidden Monte o verso
 * line can be translated too: a translation scores nothing (ruling R60).
 *
 * `autoLine` is the line "Mostrar tradução sempre" translates by itself, or null when the setting is off (and in
 * Karaokê, whose view asks for its own). Each line is asked for that way once in the round; one that cannot be had
 * shows nothing, and "Traduzir verso" stays to ask for it.
 */
export function useLineTranslations(translate: LineHelp['translate'], autoLine: number | null) {
  const [translations, setTranslations] = useState<Record<number, TranslationView>>({});
  // The lines asked for by themselves, each once in the round.
  const autoTranslated = useRef(new Set<number>());

  useEffect(() => {
    if (autoLine === null || autoTranslated.current.has(autoLine)) return;
    autoTranslated.current.add(autoLine);
    translate(autoLine).then(
      (text) => setTranslations((known) => ({ ...known, [autoLine]: { status: 'done', text } })),
      () => {},
    );
  }, [autoLine, translate]);

  function translateLine(index: number) {
    const unlessDone = (view: TranslationView) => (known: Record<number, TranslationView>) =>
      known[index]?.status === 'done' ? known : { ...known, [index]: view };
    setTranslations(unlessDone({ status: 'loading' }));
    translate(index).then(
      (text) => setTranslations((known) => ({ ...known, [index]: { status: 'done', text } })),
      (error: unknown) => setTranslations(unlessDone({ status: 'error', message: t(helpErrorCopy(error).message) })),
    );
  }

  return { translations, translateLine };
}
