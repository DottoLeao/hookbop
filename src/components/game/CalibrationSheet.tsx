'use client';

import { useState } from 'react';
import { t } from '@/i18n/t';
import { MAX_OFFSET_MS } from '@/lib/lyrics/offset';
import type { PlayerAdapter } from '@/lib/player/adapter';

/** One tap on −0,5 s or +0,5 s. */
const NUDGE_MS = 500;

interface CalibrationSheetProps {
  youtubeId: string;
  adapter: PlayerAdapter;
  /** True once the clip has played. Before that the player time means nothing, so "Começou!" stays off. */
  playerStarted: boolean;
  /** The first lyric line, with where it starts in the lyrics as written (before any offset). */
  firstLine: { text: string; startMs: number };
  /** YouTube search for the official audio, whose timing usually matches the lyrics. */
  audioSearchUrl: string;
  /** Records this player's offset vote and gives back the new median, in ms. */
  saveOffsetVote: (youtubeId: string, offsetMs: number) => Promise<number>;
  onSaved: (medianMs: number) => void;
  onSkip: () => void;
}

/** An offset as the player reads it: "+25,7 s", "−0,8 s". */
function formatOffset(ms: number): string {
  const sign = ms < 0 ? '−' : '+';
  return `${sign}${(Math.abs(ms) / 1000).toFixed(1).replace('.', ',')} s`;
}

const primary =
  'min-h-13 w-full rounded-button bg-lime px-4 text-button font-bold text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime disabled:bg-elevated disabled:text-faint';
const secondary =
  'min-h-11 rounded-button bg-elevated px-4 text-button font-semibold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime disabled:text-faint';

/**
 * Asks the player to tap when the first line starts. The offset is the player's time at that tap minus where the
 * line starts in the lyrics, fine-tuned with ±0,5 s, and "Salvar" sends it as this player's vote.
 */
export function CalibrationSheet({
  youtubeId,
  adapter,
  playerStarted,
  firstLine,
  audioSearchUrl,
  saveOffsetVote,
  onSaved,
  onSkip,
}: CalibrationSheetProps) {
  const [offsetMs, setOffsetMs] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tooFar, setTooFar] = useState(false);

  function markStart() {
    setOffsetMs(adapter.getCurrentTimeMs() - firstLine.startMs);
    setTooFar(false);
  }

  function nudge(deltaMs: number) {
    setOffsetMs((current) => (current === null ? current : current + deltaMs));
    setTooFar(false);
  }

  async function save() {
    if (offsetMs === null || saving) return;
    // The database takes no vote past MAX_OFFSET_MS either way, so such a value is not even sent. The player measures
    // again, nudges it back, or skips.
    if (Math.abs(offsetMs) > MAX_OFFSET_MS) {
      setFailed(false);
      setTooFar(true);
      return;
    }
    setSaving(true);
    setFailed(false);
    let medianMs: number;
    try {
      medianMs = await saveOffsetVote(youtubeId, offsetMs);
    } catch (error) {
      console.warn('Could not save the offset vote.', error);
      setFailed(true);
      setSaving(false);
      return;
    }
    onSaved(medianMs);
  }

  const measured = offsetMs !== null;

  return (
    <section className="flex flex-col gap-4 rounded-card bg-card p-4">
      <p className="text-body text-muted">{t('calibrar.hint')}</p>
      <p className="font-heading text-verse font-bold">“{firstLine.text}”</p>

      <button type="button" onClick={markStart} disabled={!playerStarted} className={primary}>
        {t('calibrar.start')}
      </button>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <button type="button" onClick={() => nudge(-NUDGE_MS)} disabled={!measured} className={secondary}>
          {t('calibrar.minus')}
        </button>
        <output className="min-w-24 text-center text-button font-semibold">
          {measured && t('calibrar.offset', { valor: formatOffset(offsetMs) })}
        </output>
        <button type="button" onClick={() => nudge(NUDGE_MS)} disabled={!measured} className={secondary}>
          {t('calibrar.plus')}
        </button>
      </div>

      <button type="button" onClick={save} disabled={!measured || saving} className={`${secondary} w-full`}>
        {t('calibrar.save')}
      </button>
      {failed && (
        <p role="alert" className="text-center text-body text-error">
          {t('calibrar.saveError')}
        </p>
      )}
      {tooFar && (
        <p role="alert" className="text-center text-body text-muted">
          {t('calibrar.tooFar')}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <a
          href={audioSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center text-body font-semibold text-lime underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-lime"
        >
          {t('calibrar.switchToAudio')}
        </a>
        <button
          type="button"
          onClick={onSkip}
          className="min-h-11 px-3 text-body font-semibold text-muted focus-visible:outline-2 focus-visible:outline-lime"
        >
          {t('calibrar.skip')}
        </button>
      </div>
    </section>
  );
}
