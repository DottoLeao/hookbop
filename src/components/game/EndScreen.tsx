'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { DjBop, type DjBopExpression } from '@/components/brand/DjBop';
import { t, type MessageKey } from '@/i18n/t';
import type { Entitlement } from '@/lib/entitlements';
import type { Mode, PlaySummary } from '@/lib/types';
import { focusRing } from './styles';

/** At this share of blanks right on the first try or more, DJ Bop cheers. */
const GREAT_FROM_PCT = 85;
/** From here to the line above, he invites the player to go again. Below it, he says it was close. */
const OK_FROM_PCT = 60;

/** Where saving the play stands. The play is what holds the XP, so the XP is known only once it is `saved`. */
export type SaveStatus =
  | { status: 'saving' }
  /** `xp` is what the play was saved with, after the repeat decay. */
  | { status: 'saved'; playId: string; xp: number }
  | { status: 'failed' };

export interface EndScreenProps {
  mode: Mode;
  summary: PlaySummary;
  /** How many blanks were answered with a hint (`helpedBlanks`): "com ajuda", which scored nothing (spec §8). */
  helped: number;
  save: SaveStatus;
  /** How "Dobrar o XP" is unlocked in this phase (`getEntitlements(...).double_xp`). */
  doubleXp: Entitlement;
  /** Doubles the XP of the saved play, once, and gives back the XP it ends up with. */
  onDoubleXp: (playId: string) => Promise<{ xp: number }>;
  /** Saves the play again, after it failed. */
  onRetrySave: () => void;
  /** "Jogar de novo": the same mode and difficulty. */
  onPlayAgain: () => void;
  /** "Outro modo": back to the mode picker, for the same song. */
  onOtherMode: () => void;
  /** Called once, when the screen first appears: the player finished a song. */
  onFinished: () => void;
}

/** DJ Bop's line and face for the share of blanks right on the first try; `null` for a game with no score. */
function verdict(pct: number | null): { line: MessageKey; expression: DjBopExpression } {
  // Never the "errou" face: a score under 60% is "quase", and he never mocks.
  if (pct === null) return { line: 'dj.endGreat', expression: 'acertou' };
  if (pct >= GREAT_FROM_PCT) return { line: 'dj.endGreat', expression: 'combo' };
  if (pct >= OK_FROM_PCT) return { line: 'dj.endOk', expression: 'acertou' };
  return { line: 'dj.endLow', expression: 'idle' };
}

const RING_RADIUS = 60;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** The share of blanks right on the first try, as a ring (design/canvas/FimDaMusica.dc.html). */
function Ring({ pct }: { pct: number }) {
  const filled = (Math.min(100, Math.max(0, pct)) / 100) * RING_LENGTH;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={t('fim.ring', { pct })}>
      <circle cx="70" cy="70" r={RING_RADIUS} fill="none" strokeWidth="12" className="stroke-elevated" />
      {/* A zero-length arc with round ends would still draw a dot. */}
      {filled > 0 && (
        <circle
          cx="70"
          cy="70"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${RING_LENGTH}`}
          transform="rotate(-90 70 70)"
          className="stroke-lime"
        />
      )}
      <text x="70" y="80" textAnchor="middle" fontSize="28" fontWeight="700" className="fill-text font-heading">
        {t('fim.ringValue', { pct })}
      </text>
    </svg>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-button bg-card px-2 py-3">
      <p className="font-heading text-verse font-bold">{value}</p>
      <p className="text-label text-muted">{label}</p>
    </div>
  );
}

const control = `flex w-full items-center justify-center rounded-button px-4 text-center font-semibold ${focusRing}`;

/**
 * The end of a song (design/canvas/FimDaMusica.dc.html in the Limão colors): the share of blanks right on the first
 * try as a ring, DJ Bop's line for it, the best combo and the XP, the dashed lime "Dobrar o XP" spot, and what to do
 * next. The challenges, the streak and the stickers of that canvas are for parts B and C.
 *
 * Karaokê has no blanks to score and no XP, and a game in another mode may have none either, so those show DJ Bop and
 * the three buttons only. The result shows whether or not the play was saved: while it is not, the XP says so
 * instead of showing a number, and "Dobrar o XP" waits for the play it works on.
 */
export function EndScreen({
  mode,
  summary,
  helped,
  save,
  doubleXp,
  onDoubleXp,
  onRetrySave,
  onPlayAgain,
  onOtherMode,
  onFinished,
}: EndScreenProps) {
  const [doubledXp, setDoubledXp] = useState<number | null>(null);
  const [doubling, setDoubling] = useState(false);
  const [doubleFailed, setDoubleFailed] = useState(false);

  const finishedRef = useRef(false);
  useEffect(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinished();
  }, [onFinished]);

  // The result takes the focus when it appears: the game screen it replaces had it, and a keyboard or screen reader
  // user would otherwise be left on nothing. It names itself after the heading, so that is what is read out.
  const resultRef = useRef<HTMLElement>(null);
  useEffect(() => {
    resultRef.current?.focus({ preventScroll: true });
  }, []);
  const headingId = useId();

  const scored = mode !== 'karaoke' && summary.totalBlanks > 0;
  const { line, expression } = verdict(scored ? summary.pct : null);

  const playId = save.status === 'saved' ? save.playId : null;
  const xp = doubledXp ?? (save.status === 'saved' ? save.xp : null);
  const used = doubledXp !== null;
  // Nothing to double when the play earned nothing.
  const offered = scored && doubleXp !== 'off' && xp !== 0;
  // It works on a saved play, once, and not while a tap is still being answered.
  const ready = doubleXp === 'free' && playId !== null && !used && !doubling;

  async function double() {
    if (!ready || playId === null) return;
    setDoubling(true);
    setDoubleFailed(false);
    try {
      setDoubledXp((await onDoubleXp(playId)).xp);
    } catch {
      setDoubleFailed(true);
    } finally {
      setDoubling(false);
    }
  }

  const xpText =
    xp !== null ? t('fim.xpValue', { n: xp }) : save.status === 'saving' ? t('fim.xpPending') : t('fim.xpUnknown');

  return (
    <section
      ref={resultRef}
      tabIndex={-1}
      aria-labelledby={headingId}
      className="flex flex-1 flex-col gap-4 focus:outline-hidden"
    >
      {scored && (
        <div className="flex flex-col items-center gap-1.5">
          <Ring pct={summary.pct} />
          <p className="text-body text-muted">
            {t('fim.blanks', { certas: summary.firstTryCorrect, total: summary.totalBlanks })}
          </p>
          {helped > 0 && <p className="text-label text-muted">{t('fim.helped', { n: helped })}</p>}
        </div>
      )}

      <div className="flex items-end justify-center gap-3">
        <div className="shrink-0">
          <DjBop expression={expression} size={64} />
        </div>
        <h1
          id={headingId}
          className="rounded-[16px_16px_16px_4px] bg-card px-4 py-2.5 font-heading text-verse leading-tight font-bold"
        >
          {t(line)}
        </h1>
      </div>

      {scored && (
        <div className="grid grid-cols-2 gap-2">
          <Stat value={t('jogo.combo', { n: summary.maxCombo })} label={t('fim.maxCombo')} />
          <Stat value={xpText} label={t('fim.xp')} />
        </div>
      )}

      {offered && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            aria-disabled={!ready}
            aria-busy={doubling}
            onClick={double}
            className={`${control} min-h-13 gap-2 border-[1.5px] border-dashed text-lyric font-bold ${
              used ? 'border-border text-faint' : 'border-lime text-lime'
            } ${doubleXp === 'free' && !used && !ready ? 'opacity-60' : ''}`}
          >
            {!used && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5l11 7-11 7z" />
              </svg>
            )}
            {t(used ? 'fim.doubleXpUsed' : 'fim.doubleXp')}
          </button>
          {doubleFailed && (
            <p role="status" className="text-center text-label text-muted">
              {t('fim.doubleXpError')}
            </p>
          )}
        </div>
      )}

      {save.status === 'failed' && (
        <div className="flex items-center justify-between gap-2 rounded-answer bg-card py-1 pr-1 pl-4">
          <p role="status" className="text-body text-muted">
            {t('fim.saveFailed')}
          </p>
          <button
            type="button"
            onClick={onRetrySave}
            className={`flex min-h-11 shrink-0 items-center rounded-button px-3 text-body font-semibold text-lime ${focusRing}`}
          >
            {t('fim.saveRetry')}
          </button>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <button type="button" onClick={onPlayAgain} className={`${control} min-h-13 bg-lime text-button font-bold text-bg`}>
          {t('fim.playAgain')}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onOtherMode} className={`${control} min-h-12 bg-card text-body`}>
            {t('fim.otherMode')}
          </button>
          <Link href="/" className={`${control} min-h-12 border-[1.5px] border-border text-body`}>
            {t('fim.otherSong')}
          </Link>
        </div>
      </div>
    </section>
  );
}
