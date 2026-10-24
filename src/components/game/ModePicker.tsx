'use client';

import Link from 'next/link';
import { useId, useRef, useState, type FormEvent } from 'react';
import { t } from '@/i18n/t';
import { cleanTitle } from '@/lib/lyrics/cleanTitle';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { useCardsIn } from '@/lib/motion/transitions';
import type { Difficulty, Mode } from '@/lib/types';

const MODES: readonly Mode[] = ['escolha', 'digitacao', 'karaoke', 'montar'];
const DIFFICULTIES: readonly Difficulty[] = ['facil', 'medio', 'dificil'];

/**
 * "Partida salva às 14:32 · Escolha · Médio": when it was saved, and the mode and difficulty it was. A game saved on an
 * earlier day (they are under 24 hours old, so it was the day before) says "ontem". Without `now` it is today's.
 */
function savedInfo(
  { mode, difficulty, savedAt }: { mode: Mode; difficulty: Difficulty; savedAt: number },
  now: number | undefined,
): string {
  const hora = new Date(savedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const today = now === undefined || new Date(savedAt).toDateString() === new Date(now).toDateString();
  const quando = t(today ? 'modo.savedToday' : 'modo.savedYesterday', { hora });
  // Karaokê has no blanks, so it asks for no difficulty.
  return mode === 'karaoke'
    ? t('modo.savedKaraoke', { quando, modo: t(`modo.${mode}`) })
    : t('modo.saved', { quando, modo: t(`modo.${mode}`), dificuldade: t(`dificuldade.${difficulty}`) });
}

interface ModePickerProps {
  video: VideoRecord;
  onPlay: (mode: Mode, difficulty: Difficulty) => void;
  /** Opens the calibration, for a player who finds the lyrics off the beat. */
  onCalibrate: () => void;
  /** A game of this song kept on the device, and when (ms since 1970): it can be gone on from. */
  saved?: { mode: Mode; difficulty: Difficulty; savedAt: number };
  /** The time of day in ms since 1970, to tell a game saved today from one saved the day before. Today's when left out. */
  now?: number;
  /** "Continuar de onde parou": goes on from the saved game, in the mode and difficulty it was. */
  onResume: () => void;
  /** "Começar do zero": forgets the saved game. The picker stays, for the player to choose a new one. */
  onDiscard: () => void;
}

const savedAction =
  'flex w-full items-center justify-center rounded-button px-4 text-center text-button font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime';

/**
 * "Como você quer jogar?": the four modes as cards, the difficulty as pills, and "Jogar"
 * (design/canvas/Main.dc.html in the Limão colors). Karaokê has no blanks, so it asks for no difficulty.
 * A game kept on the device for the song comes first, to go on from or to drop.
 *
 * The cards (the song, the saved game when there is one, and the four modes) come in one after another as the picker
 * appears (`useCardsIn`, the elements marked `data-card`). The buttons are not among them: "Jogar" and the rest answer
 * a tap from the first frame.
 */
export function ModePicker({ video, onPlay, onCalibrate, saved, now, onResume, onDiscard }: ModePickerProps) {
  const [mode, setMode] = useState<Mode>('escolha');
  const [difficulty, setDifficulty] = useState<Difficulty>('facil');
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  useCardsIn(formRef, '[data-card]');
  const { artist, track } = cleanTitle(video.title, video.channel);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onPlay(mode, difficulty);
  }

  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-1 flex-col gap-4">
      <div data-card className="flex items-center gap-3 rounded-card bg-card py-3 pr-2 pl-4">
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

      {saved && (
        <section
          data-card
          aria-labelledby={`${id}-saved`}
          className="flex flex-col gap-2 rounded-card border-[1.5px] border-lime bg-card p-3.5"
        >
          <p id={`${id}-saved`} className="text-body font-semibold">
            {savedInfo(saved, now)}
          </p>
          <button type="button" onClick={onResume} className={`${savedAction} min-h-12 bg-lime font-bold text-bg`}>
            {t('modo.resume')}
          </button>
          <button type="button" onClick={onDiscard} className={`${savedAction} min-h-11 border-[1.5px] border-border text-text`}>
            {t('modo.discard')}
          </button>
        </section>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-3 font-heading text-verse font-bold">{t('modo.question')}</legend>
        {MODES.map((m) => (
          <label
            key={m}
            data-card
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
