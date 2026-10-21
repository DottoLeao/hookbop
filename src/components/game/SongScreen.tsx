'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DjBop, type DjBopExpression } from '@/components/brand/DjBop';
import { t } from '@/i18n/t';
import { selectBlanks } from '@/lib/game/blanks';
import { selectTileLines } from '@/lib/game/tiles';
import { cleanTitle } from '@/lib/lyrics/cleanTitle';
import { applyOffset } from '@/lib/lyrics/lrc';
import { createLrclibSource } from '@/lib/lyrics/lrclib';
import { resolveSong, type SongResolution, type VideoRecord } from '@/lib/lyrics/resolveSong';
import type { PlayerAdapter, PlayerError } from '@/lib/player/adapter';
import { createYouTubeAdapter, PlayerLoadError } from '@/lib/player/youtubeAdapter';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { createSupabaseSongStore } from '@/lib/supabase/songStore';
import type { Blank, Difficulty, LyricLine, Mode } from '@/lib/types';
import { fetchVideoMeta } from '@/lib/youtube/fetchVideoMeta';
import { CalibrationSheet } from './CalibrationSheet';
import { GameScreen } from './GameScreen';
import { ModePicker } from './ModePicker';

/** How the app introduces itself to LRCLIB, as its API asks. */
const LRCLIB_CLIENT = 'Hookbop/0.1 (+https://hookbop.app)';

/** What the song screen reaches outside itself for. Tests pass fakes; the app uses `browserDeps`. */
export interface SongScreenDeps {
  /** Finds the lyrics and what the app remembers about the video. */
  resolve: (youtubeId: string, videoDurationS: number) => Promise<SongResolution>;
  /** Starts the player on `el`. YouTube replaces `el` with its iframe. */
  createAdapter: (el: HTMLElement, youtubeId: string) => Promise<PlayerAdapter>;
  /** Records this player's offset vote and gives back the new median, in ms. */
  saveOffsetVote: (youtubeId: string, offsetMs: number) => Promise<number>;
  /** A clock in ms, for timeToReadyMs. `performance.now` when left out. */
  now?: () => number;
}

const defaultNow = () => performance.now();

/** The real thing: Supabase through the signed-in member's browser client, YouTube and LRCLIB. */
const browserDeps: SongScreenDeps = {
  resolve: (youtubeId, videoDurationS) =>
    resolveSong(youtubeId, videoDurationS, {
      store: createSupabaseSongStore(createBrowserSupabase()),
      meta: fetchVideoMeta,
      lyrics: createLrclibSource({ fetch: window.fetch, client: LRCLIB_CLIENT }),
      now: () => new Date(),
    }),
  createAdapter: (el, youtubeId) => createYouTubeAdapter(el, youtubeId),
  saveOffsetVote: async (youtubeId, offsetMs) => {
    const { data, error } = await createBrowserSupabase().rpc('set_offset_vote', {
      p_youtube_id: youtubeId,
      p_offset_ms: Math.round(offsetMs),
    });
    if (error) throw new Error(`Could not save the offset vote: ${error.message}`);
    return data;
  },
  now: defaultNow,
};

/** Where the screen is. The player error, kept apart, wins over all of these. */
type Phase =
  | { kind: 'loading' }
  | { kind: 'lyrics_unavailable' }
  | { kind: 'video_unavailable' }
  | { kind: 'no_lyrics'; video: VideoRecord }
  | { kind: 'calibration'; adapter: PlayerAdapter; video: VideoRecord; lines: LyricLine[] }
  | { kind: 'picker'; adapter: PlayerAdapter; video: VideoRecord; lines: LyricLine[] }
  | {
      kind: 'game';
      adapter: PlayerAdapter;
      video: VideoRecord;
      lines: LyricLine[];
      mode: Mode;
      difficulty: Difficulty;
      blanks: Blank[];
    };

function phaseFor(resolution: SongResolution, adapter: PlayerAdapter): Phase {
  switch (resolution.status) {
    case 'ready': {
      const { video, lines } = resolution;
      // Lyrics with no line in them give nothing to play.
      if (lines.length === 0) return { kind: 'no_lyrics', video };
      return resolution.needsCalibration
        ? { kind: 'calibration', adapter, video, lines }
        : { kind: 'picker', adapter, video, lines };
    }
    case 'no_lyrics':
      return { kind: 'no_lyrics', video: resolution.video };
    case 'lyrics_unavailable':
      return { kind: 'lyrics_unavailable' };
    case 'video_unavailable':
      return { kind: 'video_unavailable' };
  }
}

/** The blanks of a game: whole lines in Monte o verso, none in Karaokê, words in the other two. */
function blanksFor(mode: Mode, lines: LyricLine[], difficulty: Difficulty, seed: string): Blank[] {
  if (mode === 'karaoke') return [];
  if (mode === 'montar') return selectTileLines(lines, difficulty, seed);
  return selectBlanks(lines, difficulty, seed);
}

/**
 * A search on YouTube's own site (no API quota) for the song's official audio, whose timing usually matches
 * the lyrics. The player finds it there and pastes or shares the link back.
 */
function officialAudioSearchUrl(video: VideoRecord): string {
  const { artist, track } = cleanTitle(video.title, video.channel);
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${track} official audio`)}`;
}

const action =
  'flex min-h-11 w-full items-center justify-center rounded-button px-4 text-center text-button font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime';
const primaryAction = `${action} bg-lime text-bg`;
const secondaryAction = `${action} border-[1.5px] border-border text-text`;

/** DJ Bop with a line under him and what the player can do next. */
function Notice({ expression, message, children }: { expression: DjBopExpression; message: string; children?: ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-card bg-card px-4 py-6 text-center">
      <DjBop expression={expression} size={96} />
      <p role="status" className="font-heading text-verse font-bold">
        {message}
      </p>
      {children && <div className="flex w-full flex-col gap-2">{children}</div>}
    </section>
  );
}

function PasteAnother({ className }: { className: string }) {
  return (
    <Link href="/" className={className}>
      {t('jogar.pasteAnother')}
    </Link>
  );
}

/**
 * The song screen: it owns the YouTube player for as long as it is open, finds the lyrics, handles every
 * way that can fail, asks for a calibration when the timing may be off, and lets the player pick a mode
 * before handing everything to the game screen.
 *
 * The player sits in a 16:9 box (at least 200 px tall, full width, nothing over it) that stays in place
 * in every state, so the clip is never torn down between loading, calibrating, picking and playing.
 */
export function SongScreen({ youtubeId, deps = browserDeps }: { youtubeId: string; deps?: SongScreenDeps }) {
  const { resolve, createAdapter, saveOffsetVote } = deps;
  const now = deps.now ?? defaultNow;

  const playerBoxRef = useRef<HTMLDivElement>(null);
  const openedAtRef = useRef<number | null>(null);
  const [playerAttempt, setPlayerAttempt] = useState(0);
  const [lyricsAttempt, setLyricsAttempt] = useState(0);
  const [adapter, setAdapter] = useState<PlayerAdapter | null>(null);
  const [playerError, setPlayerError] = useState<PlayerError | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [timeToReadyMs, setTimeToReadyMs] = useState<number | null>(null);

  // The clock for timeToReadyMs starts when the screen opens, and retries do not restart it.
  useEffect(() => {
    openedAtRef.current ??= now();
  }, [now]);

  // The player. YouTube swaps the element it is given for its iframe, so it gets one made here, which
  // React knows nothing about, inside the box React renders. Under StrictMode (or a retry) the first
  // player is destroyed, even when it only gets ready after its effect was cleaned up.
  useEffect(() => {
    const box = playerBoxRef.current;
    if (!box) return;
    const host = document.createElement('div');
    host.style.width = '100%';
    host.style.height = '100%';
    const target = document.createElement('div');
    host.append(target);
    box.append(host);

    let closed = false;
    let live: PlayerAdapter | null = null;
    let stopListening: (() => void) | null = null;

    createAdapter(target, youtubeId).then(
      (ready) => {
        if (closed) {
          ready.destroy();
          return;
        }
        live = ready;
        // An error that came in before this line is replayed inside onError itself, before it returns,
        // so the callback only records it and never unsubscribes.
        stopListening = ready.onError((error) => setPlayerError(error));
        setAdapter(ready);
      },
      (error: unknown) => {
        if (closed) return;
        setPlayerError(error instanceof PlayerLoadError ? error.reason : 'other');
      },
    );

    return () => {
      closed = true;
      stopListening?.();
      live?.destroy();
      host.remove();
    };
  }, [createAdapter, youtubeId, playerAttempt]);

  // The lyrics, once the player is ready and knows how long the video is.
  useEffect(() => {
    if (!adapter) return;
    let closed = false;

    resolve(youtubeId, adapter.getDurationMs() / 1000).then(
      (resolution) => {
        if (closed) return;
        const next = phaseFor(resolution, adapter);
        if (next.kind === 'calibration' || next.kind === 'picker') {
          const elapsedMs = Math.round(now() - (openedAtRef.current ?? 0));
          setTimeToReadyMs((known) => known ?? elapsedMs);
        }
        setPhase(next);
      },
      (error: unknown) => {
        if (closed) return;
        // The store or the video details failed: as far as the player can tell, the lyrics are slow.
        console.warn('Could not resolve the song.', error);
        setPhase({ kind: 'lyrics_unavailable' });
      },
    );

    return () => {
      closed = true;
    };
  }, [adapter, resolve, youtubeId, now, lyricsAttempt]);

  function retryPlayer() {
    setAdapter(null);
    setPlayerError(null);
    setPhase({ kind: 'loading' });
    setPlayerAttempt((n) => n + 1);
  }

  function retryLyrics() {
    setPhase({ kind: 'loading' });
    setLyricsAttempt((n) => n + 1);
  }

  function content(): ReactNode {
    if (playerError) {
      // not_embeddable and not_found will not change; anything else (a timeout, a script that did not
      // load) may work with a new player.
      const canRetry = playerError === 'other';
      return (
        <Notice expression="errou" message={t('jogar.videoUnavailable')}>
          {canRetry && (
            <button type="button" onClick={retryPlayer} className={primaryAction}>
              {t('jogar.retry')}
            </button>
          )}
          <PasteAnother className={canRetry ? secondaryAction : primaryAction} />
        </Notice>
      );
    }

    switch (phase.kind) {
      case 'loading':
        return <Notice expression="idle" message={t('jogar.loading')} />;

      case 'lyrics_unavailable':
        return (
          <Notice expression="errou" message={t('jogar.lyricsSlow')}>
            <button type="button" onClick={retryLyrics} className={primaryAction}>
              {t('jogar.retry')}
            </button>
          </Notice>
        );

      case 'video_unavailable':
        return (
          <Notice expression="errou" message={t('jogar.videoUnavailable')}>
            <PasteAnother className={primaryAction} />
          </Notice>
        );

      case 'no_lyrics':
        return (
          <Notice expression="errou" message={t('jogar.noLyrics')}>
            <a href={officialAudioSearchUrl(phase.video)} target="_blank" rel="noopener noreferrer" className={primaryAction}>
              {t('jogar.searchAudio')}
            </a>
            <PasteAnother className={secondaryAction} />
          </Notice>
        );

      case 'calibration': {
        const { adapter: player, video, lines } = phase;
        return (
          <CalibrationSheet
            youtubeId={youtubeId}
            adapter={player}
            // The lines carry the saved offset; the vote is measured from the lyrics as written.
            firstLine={{ text: lines[0].text, startMs: lines[0].startMs - video.offsetMs }}
            audioSearchUrl={officialAudioSearchUrl(video)}
            saveOffsetVote={saveOffsetVote}
            onSaved={(medianMs) =>
              setPhase({
                kind: 'picker',
                adapter: player,
                video: { ...video, offsetMs: medianMs },
                lines: applyOffset(lines, medianMs - video.offsetMs),
              })
            }
            onSkip={() => setPhase({ kind: 'picker', adapter: player, video, lines })}
          />
        );
      }

      case 'picker': {
        const { adapter: player, video, lines } = phase;
        return (
          <ModePicker
            video={video}
            onPlay={(mode, difficulty) =>
              setPhase({
                kind: 'game',
                adapter: player,
                video,
                lines,
                mode,
                difficulty,
                blanks: blanksFor(mode, lines, difficulty, youtubeId),
              })
            }
          />
        );
      }

      case 'game':
        return (
          <GameScreen
            adapter={phase.adapter}
            mode={phase.mode}
            difficulty={phase.difficulty}
            lines={phase.lines}
            blanks={phase.blanks}
            video={phase.video}
            timeToReadyMs={timeToReadyMs ?? 0}
          />
        );
    }
  }

  // The game screen draws its own header.
  const showHeader = playerError !== null || phase.kind !== 'game';
  const title =
    playerError === null && phase.kind === 'picker'
      ? t('modo.title')
      : playerError === null && phase.kind === 'calibration'
        ? t('calibrar.title')
        : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 pb-4">
      {showHeader && (
        <header className="flex items-center gap-2.5 px-4 pt-4">
          <Link
            href="/"
            aria-label={t('jogar.back')}
            className="flex size-11 shrink-0 items-center justify-center rounded-button bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          {title && <h1 className="font-heading text-button font-bold">{title}</h1>}
        </header>
      )}
      {/* The YouTube player's box. Its child is created by the player effect, never by React. */}
      <div
        ref={playerBoxRef}
        data-testid="player"
        className="aspect-video min-h-[200px] w-full shrink-0 bg-card [&_iframe]:block [&_iframe]:h-full [&_iframe]:w-full"
      />
      <div className="flex flex-1 flex-col gap-4 px-4">{content()}</div>
    </main>
  );
}
