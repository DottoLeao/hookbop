import { useEffect, useRef, useState } from 'react';
import { useSongLine, type SongTranslation } from '@/lib/help/songTranslation';
import type { LineHelp } from '@/lib/help/useLineHelp';
import type { TranslationView } from './LyricPanel';

interface LineTranslationOptions {
  /** The translation of the whole song, as it streams in; null when there is none, and every line is asked for alone. */
  song: SongTranslation | null | undefined;
  /** The translation of one line (`POST /api/help`), for a line the song's translation did not give. */
  translate: LineHelp['translate'];
  /** The line in play. */
  lineIndex: number;
  /** Whether the translation is to be shown under that line now: the switch is on, and the line may show it. */
  shown: boolean;
}

/**
 * The translation under the lyric panel's line in play, or undefined when there is none to show.
 *
 * It comes from the translation of the whole song, which the song screen asked for as soon as the lyrics were known,
 * so turning the switch on shows it at once and asks the network nothing (unless that translation failed with nothing,
 * which turning the switch on asks again for, once: see `retryIfFailed`). A line that has not come yet is
 * "Traduzindo..." while the song's translation is on its way. One that the song's translation ended without is asked
 * for alone, once in the round, only once it is to be shown; while that is on its way it is "Traduzindo..." too, and
 * when it cannot be had either, nothing is shown, and no error. Turning the switch off and on again asks for nothing.
 */
export function useLineTranslation({ song, translate, lineIndex, shown }: LineTranslationOptions): TranslationView | undefined {
  // Only the line in play, and only while it is shown: the lines that stream in for the rest of the song render nothing.
  const { text: fromSong, settled } = useSongLine(song, lineIndex, shown);
  // The lines asked for alone, each once in the round: their translation, or null when it could not be had.
  const [byLine, setByLine] = useState<Record<number, string | null>>({});
  const asked = useRef(new Set<number>());

  const askAlone = shown && fromSong === undefined && settled;
  useEffect(() => {
    if (!askAlone || asked.current.has(lineIndex)) return;
    asked.current.add(lineIndex);
    translate(lineIndex).then(
      (text) => setByLine((known) => ({ ...known, [lineIndex]: text })),
      () => setByLine((known) => ({ ...known, [lineIndex]: null })),
    );
  }, [askAlone, lineIndex, translate]);

  if (!shown) return undefined;
  if (fromSong !== undefined) return { status: 'done', text: fromSong };
  if (!settled) return { status: 'loading' };
  const alone = byLine[lineIndex];
  if (alone === null) return undefined;
  return alone === undefined ? { status: 'loading' } : { status: 'done', text: alone };
}
