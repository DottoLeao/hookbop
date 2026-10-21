'use client';

import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import { t } from '@/i18n/t';
import { cleanTitle } from '@/lib/lyrics/cleanTitle';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import type { Difficulty, Mode } from '@/lib/types';

const MODES: readonly Mode[] = ['escolha', 'digitacao', 'karaoke', 'montar'];
const DIFFICULTIES: readonly Difficulty[] = ['facil', 'medio', 'dificil'];

interface ModePickerProps {
  video: VideoRecord;
  onPlay: (mode: Mode, difficulty: Difficulty) => void;
  /** Opens the calibration, for a player who finds the lyrics off the beat. */
  onCalibrate: () => void;
}

/**
 * "Como você quer jogar?": the four modes as cards, the difficulty as pills, and "Jogar"
 * (design/canvas/Main.dc.html in the Limão colors). Karaokê has no blanks, so it asks for no difficulty.
 */
export function ModePicker({ video, onPlay, onCalibrate }: ModePickerProps) {
  const [mode, setMode] = useState<Mode>('escolha');
  const [difficulty, setDifficulty] = useState<Difficulty>('facil');
  const id = useId();
  const { artist, track } = cleanTitle(video.title, video.channel);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onPlay(mode, difficulty);
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-3 rounded-card bg-card py-3 pr-2 pl-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-lyric font-bold">{track}</p>
          <p className="truncate text-label text-muted">{artist}</p>
        </div>
        <Link
          href="/"
          aria-label={t('modo.changeLabel')}
          className="flex min-h-11 items-center px-3 text-body font-semibold text-lime focus-visible:outline-2 focus-visible:outline-lime"
        >
          {t('modo.change')}
        </Link>
      </div>
      <button
        type="button"
        onClick={onCalibrate}
        className="-mt-1 min-h-11 self-start rounded-full border-[1.5px] border-border px-4 text-body font-semibold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
      >
        {t('modo.calibrate')}
      </button>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-3 font-heading text-verse font-bold">{t('modo.question')}</legend>
        {MODES.map((m) => (
          <label
            key={m}
            className={`flex min-h-16 cursor-pointer flex-col justify-center gap-0.5 rounded-card border-[2.5px] bg-card px-3.5 py-2.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lime ${
              mode === m ? 'border-lime' : 'border-transparent'
            }`}
          >
            <input
              type="radio"
              name="mode"
              value={m}
              checked={mode === m}
              onChange={() => setMode(m)}
              aria-labelledby={`${id}-${m}`}
              aria-describedby={`${id}-${m}-desc`}
              className="sr-only"
            />
            <span id={`${id}-${m}`} className="font-heading text-button font-bold">
              {t(`modo.${m}`)}
            </span>
            <span id={`${id}-${m}-desc`} className="text-label text-muted">
              {t(`modo.${m}.desc`)}
            </span>
          </label>
        ))}
      </fieldset>

      {mode !== 'karaoke' && (
        <fieldset>
          <legend className="mb-2 text-body font-semibold text-muted">{t('modo.difficulty')}</legend>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTIES.map((d) => (
              <label
                key={d}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] px-3 text-body font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lime ${
                  difficulty === d ? 'border-lime bg-lime text-bg' : 'border-border text-text'
                }`}
              >
                <input
                  type="radio"
                  name="difficulty"
                  value={d}
                  checked={difficulty === d}
                  onChange={() => setDifficulty(d)}
                  className="sr-only"
                />
                {t(`dificuldade.${d}`)}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <button
        type="submit"
        className="mt-auto min-h-13 w-full rounded-button bg-lime px-4 text-button font-bold text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
      >
        {t('modo.play')}
      </button>
    </form>
  );
}
