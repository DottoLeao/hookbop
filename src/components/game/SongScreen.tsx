'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DjBop, type DjBopExpression } from '@/components/brand/DjBop';
import { t } from '@/i18n/t';
import { currentUserId } from '@/lib/auth/currentUser';
import { getEntitlements } from '@/lib/entitlements';
import { selectBlanks } from '@/lib/game/blanks';
import { selectTileLines } from '@/lib/game/tiles';
import { cleanTitle } from '@/lib/lyrics/cleanTitle';
import { linesOfVideo } from '@/lib/lyrics/linesOfVideo';
import { applyOffset } from '@/lib/lyrics/lrc';
import { createLrclibSource } from '@/lib/lyrics/lrclib';
import { resolveSong, type SongResolution, type SongStore, type VideoRecord } from '@/lib/lyrics/resolveSong';
import type { PlayerAdapter, PlayerError } from '@/lib/player/adapter';
import { createYouTubeAdapter, PlayerLoadError } from '@/lib/player/youtubeAdapter';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { applyDoubleXp, createSupabasePlaysDb, savePlay } from '@/lib/supabase/plays';
import { createSupabaseSongStore } from '@/lib/supabase/songStore';
import type { AnswerRecord, Blank, Difficulty, LyricLine, Mode, PlaySummary } from '@/lib/types';
import { fetchVideoMeta } from '@/lib/youtube/fetchVideoMeta';
import { CalibrationSheet } from './CalibrationSheet';
import { EndScreen } from './EndScreen';
import { GameScreen } from './GameScreen';
import { ModePicker } from './ModePicker';
import { useGameSave, type SavePlay } from './useGameSave';

/** How the app introduces itself to LRCLIB, as its API asks. */
const LRCLIB_CLIENT = 'Hookbop/0.1 (+https://hookbop.app)';

/** YouTube may report a duration of 0 until it has the video's details, so it is read again this often... */
const DURATION_POLL_MS = 100;
/** ...for at most this long (ruling R42). */
const DURATION_WAIT_MS = 3000;

/** What the player can use in this phase, which is fixed when the app is built. */
const entitlements = getEntitlements(process.env.NEXT_PUBLIC_APP_PHASE);

/** Set in the browser when a song is finished for the first time; the install prompt waits for it. */
const FIRST_FINISH_KEY = 'hb_first_finish';

/** The mark of a first finished song. Browser storage can be blocked, and then there is simply no mark. */
function rememberFirstFinish() {
  try {
    window.localStorage.setItem(FIRST_FINISH_KEY, '1');
  } catch {
    // Site data blocked (SecurityError) or full: the install prompt just does not show.
  }
}

/** What the song screen reaches outside itself for. Tests pass fakes; the app uses `browserDeps`. */
export interface SongScreenDeps {
  /** Finds the lyrics and what the app remembers about the video, reading and saving through `store`. */
  resolve: (youtubeId: string, videoDurationS: number, store: SongStore) => Promise<SongResolution>;
  /** Where videos are remembered. The screen hands `resolve` a read-only view of it when the duration is unknown. */
  store: SongStore;
  /** Starts the player on `el`. YouTube replaces `el` with its iframe. */
  createAdapter: (el: HTMLElement, youtubeId: string) => Promise<PlayerAdapter>;
  /** Records this player's offset vote and gives back the new median, in ms. */
  saveOffsetVote: (youtubeId: string, offsetMs: number) => Promise<number>;
  /** Saves a finished game for the signed-in player and gives back the play and the XP it earned. */
  savePlay: SavePlay;
  /** Doubles the XP of a saved play, once, and gives back the XP it ends up with. */
  doubleXp: (playId: string) => Promise<{ xp: number }>;
  /** A clock in ms, for timeToReadyMs. `performance.now` when left out. */
  now?: () => number;
  /** Waits `ms`, between two reads of the duration. A timer when left out. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultNow = () => performance.now();
const defaultSleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** The `videos` table through the signed-in member's browser client, made on first use (never during SSR). */
const browserStore: SongStore = {
  getVideo: (id) => createSupabaseSongStore(createBrowserSupabase()).getVideo(id),
  upsertVideo: (video) => createSupabaseSongStore(createBrowserSupabase()).upsertVideo(video),
};

/** The real thing: Supabase, YouTube and LRCLIB. */
const browserDeps: SongScreenDeps = {
  resolve: (youtubeId, videoDurationS, store) =>
    resolveSong(youtubeId, videoDurationS, {
      store,
      meta: fetchVideoMeta,
      lyrics: createLrclibSource({ fetch: window.fetch, client: LRCLIB_CLIENT }),
      now: () => new Date(),
    }),
  store: browserStore,
  createAdapter: (el, youtubeId) => createYouTubeAdapter(el, youtubeId),
  saveOffsetVote: async (youtubeId, offsetMs) => {
    const { data, error } = await createBrowserSupabase().rpc('set_offset_vote', {
      p_youtube_id: youtubeId,
      p_offset_ms: Math.round(offsetMs),
    });
    if (error) throw new Error(`Could not save the offset vote: ${error.message}`);
    return data;
  },
  savePlay: async (game, resume) => {
    const client = createBrowserSupabase();
    const userId = await currentUserId(client);
    if (!userId) throw new Error('Could not save the play: nobody is signed in.');
    return savePlay(createSupabasePlaysDb(client), { ...game, userId, now: new Date() }, resume);
  },
  doubleXp: (playId) => applyDoubleXp(createSupabasePlaysDb(createBrowserSupabase()), playId),
  now: defaultNow,
  sleep: defaultSleep,
};

/**
 * The store as seen by a device that could not read the video's duration: it reads, but saves nothing.
 * A lookup made with a duration of 0 can pick the wrong lyrics, and it must not end up in the row every
 * member shares.
 */
function readOnlyStore(store: SongStore): SongStore {
  return {
    getVideo: (id) => store.getVideo(id),
    upsertVideo: async (video) => {
      console.warn('The video duration is unknown, so this lookup is not saved.', video.youtubeId);
    },
  };
}

/** The player's duration in ms, read again every 100 ms while it is 0, for at most 3 s. 0 if it never came. */
async function waitForDurationMs(
  adapter: PlayerAdapter,
  sleep: (ms: number) => Promise<void>,
  closed: () => boolean,
): Promise<number> {
  for (let waitedMs = 0; ; waitedMs += DURATION_POLL_MS) {
    const durationMs = adapter.getDurationMs();
    if (durationMs > 0 || waitedMs >= DURATION_WAIT_MS || closed()) return durationMs;
    await sleep(DURATION_POLL_MS);
  }
}

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
    }
  /** The song is over. What the game earned is in `summary`; where its saving stands is `useGameSave`'s. */
  | {
      kind: 'end';
      adapter: PlayerAdapter;
      video: VideoRecord;
      lines: LyricLine[];
      mode: Mode;
      difficulty: Difficulty;
      summary: PlaySummary;
    };

function phaseFor(resolution: SongResolution, adapter: PlayerAdapter): Phase {
  switch (resolution.status) {
    case 'ready': {
      const { video, lines } = resolution;
      // Lyrics with no line in them give nothing to play.
      if (lines.length === 0) return { kind: 'no_lyrics', video };
      // The sheet opens by itself only while nobody has calibrated this video (ruling R43). Once the
      // players have a median, it is one tap away in the mode picker ("Ajustar o tempo").
      return resolution.needsCalibration && video.offsetMs === 0
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

/**
 * The lines as the lyrics have them, before any offset, read the way resolveSong and the help route read them
 * (`linesOfVideo`). Votes are measured against these, and a new median is applied to these, because `applyOffset`
 * stops at 0 and so the shifted lines cannot always be shifted back.
 */
function linesAsWritten(video: VideoRecord, lines: LyricLine[]): LyricLine[] {
  const { lyricsLrc, lyricsDurationS } = video;
  // A ready video always holds its lyrics; this fallback only keeps the types honest.
  if (lyricsLrc === undefined || lyricsDurationS === undefined) return applyOffset(lines, -video.offsetMs);
  return linesOfVideo({ lyricsLrc, lyricsDurationS });
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
  const { resolve, store, createAdapter, saveOffsetVote, doubleXp } = deps;
  const now = deps.now ?? defaultNow;
  const sleep = deps.sleep ?? defaultSleep;

  const playerBoxRef = useRef<HTMLDivElement>(null);
  // Where the game screen puts its header, above the player box.
  const [gameHeaderSlot, setGameHeaderSlot] = useState<HTMLDivElement | null>(null);
  const openedAtRef = useRef<number | null>(null);
  const [playerAttempt, setPlayerAttempt] = useState(0);
  const [lyricsAttempt, setLyricsAttempt] = useState(0);
  const [adapter, setAdapter] = useState<PlayerAdapter | null>(null);
  const [playerError, setPlayerError] = useState<PlayerError | null>(null);
  const [playerStarted, setPlayerStarted] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [timeToReadyMs, setTimeToReadyMs] = useState<number | null>(null);
  const gameSave = useGameSave(deps.savePlay);
  // How many songs this screen has finished: only the first one waited for the song to get ready.
  const finishedGamesRef = useRef(0);

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
    const stopListening: (() => void)[] = [];

    createAdapter(target, youtubeId).then(
      (ready) => {
        if (closed) {
          ready.destroy();
          return;
        }
        live = ready;
        // An error the player already had is replayed inside onError itself, before it returns, so the
        // callback only records it (it never unsubscribes) and the check comes after the call.
        let replayed = false;
        stopListening.push(
          ready.onError((error) => {
            replayed = true;
            setPlayerError(error);
          }),
        );
        // A clip that cannot play needs no lyrics.
        if (replayed) return;
        // Whether the clip has played at all: before that, its time cannot be used to calibrate.
        stopListening.push(
          ready.onState((state) => {
            if (state === 'playing') setPlayerStarted(true);
          }),
        );
        setAdapter(ready);
      },
      (error: unknown) => {
        if (closed) return;
        setPlayerError(error instanceof PlayerLoadError ? error.reason : 'other');
      },
    );

    return () => {
      closed = true;
      for (const stop of stopListening) stop();
      live?.destroy();
      host.remove();
    };
  }, [createAdapter, youtubeId, playerAttempt]);

  // The lyrics, once the player is ready and knows how long the video is.
  useEffect(() => {
    if (!adapter) return;
    let closed = false;

    async function findSong(player: PlayerAdapter) {
      const durationMs = await waitForDurationMs(player, sleep, () => closed);
      if (closed) return;
      // Without a duration the lookup is a best guess: it saves nothing, and it cannot tell whether the
      // video runs longer than the lyrics, so it never asks for a calibration.
      const durationKnown = durationMs > 0;

      let resolution: SongResolution;
      try {
        resolution = await resolve(youtubeId, durationMs / 1000, durationKnown ? store : readOnlyStore(store));
      } catch (error) {
        if (closed) return;
        // The store or the video details failed: as far as the player can tell, the lyrics are slow.
        console.warn('Could not resolve the song.', error);
        setPhase({ kind: 'lyrics_unavailable' });
        return;
      }
      if (closed) return;
      if (!durationKnown && resolution.status === 'ready') resolution = { ...resolution, needsCalibration: false };

      const next = phaseFor(resolution, player);
      if (next.kind === 'calibration' || next.kind === 'picker') {
        const elapsedMs = Math.round(now() - (openedAtRef.current ?? 0));
        setTimeToReadyMs((known) => known ?? elapsedMs);
      }
      setPhase(next);
    }

    void findSong(adapter);
    return () => {
      closed = true;
    };
  }, [adapter, resolve, store, sleep, youtubeId, now, lyricsAttempt]);

  function retryPlayer() {
    setAdapter(null);
    setPlayerError(null);
    setPlayerStarted(false);
    setPhase({ kind: 'loading' });
    setPlayerAttempt((n) => n + 1);
  }

  function retryLyrics() {
    setPhase({ kind: 'loading' });
    setLyricsAttempt((n) => n + 1);
  }

  /** A round starts, from the mode picker or from "Jogar de novo". */
  function startGame(player: PlayerAdapter, video: VideoRecord, lines: LyricLine[], mode: Mode, difficulty: Difficulty) {
    gameSave.reset();
    setPhase({
      kind: 'game',
      adapter: player,
      video,
      lines,
      mode,
      difficulty,
      blanks: blanksFor(mode, lines, difficulty, youtubeId),
    });
  }

  /** The game reports its end: the result takes its place, and the play is saved, once. */
  function finishGame(game: Extract<Phase, { kind: 'game' }>, summary: PlaySummary, records: AnswerRecord[]) {
    const { adapter: player, video, lines, mode, difficulty } = game;
    gameSave.begin({
      youtubeId: video.youtubeId,
      mode,
      difficulty,
      summary,
      records,
      timeToReadyMs: finishedGamesRef.current === 0 ? (timeToReadyMs ?? 0) : null,
    });
    finishedGamesRef.current += 1;
    setPhase({ kind: 'end', adapter: player, video, lines, mode, difficulty, summary });
  }

  function content(): ReactNode {
    if (playerError === 'other') {
      // A timeout or a script that did not load: a new player may well work.
      return (
        <Notice expression="errou" message={t('jogar.playerFailed')}>
          <button type="button" onClick={retryPlayer} className={primaryAction}>
            {t('jogar.retry')}
          </button>
          <PasteAnother className={secondaryAction} />
        </Notice>
      );
    }
    if (playerError) {
      // not_embeddable and not_found will not change.
      return (
        <Notice expression="errou" message={t('jogar.videoUnavailable')}>
          <PasteAnother className={primaryAction} />
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
        const written = linesAsWritten(video, lines);
        return (
          <CalibrationSheet
            youtubeId={youtubeId}
            adapter={player}
            playerStarted={playerStarted}
            firstLine={written[0]}
            audioSearchUrl={officialAudioSearchUrl(video)}
            saveOffsetVote={saveOffsetVote}
            onSaved={(medianMs) =>
              setPhase({
                kind: 'picker',
                adapter: player,
                video: { ...video, offsetMs: medianMs },
                lines: applyOffset(written, medianMs),
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
            onCalibrate={() => setPhase({ kind: 'calibration', adapter: player, video, lines })}
            onPlay={(mode, difficulty) => startGame(player, video, lines, mode, difficulty)}
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
            onEnd={(summary, records) => finishGame(phase, summary, records)}
            headerSlot={gameHeaderSlot}
          />
        );

      case 'end': {
        const { adapter: player, video, lines, mode, difficulty, summary } = phase;
        return (
          <EndScreen
            mode={mode}
            summary={summary}
            save={gameSave.save}
            doubleXp={entitlements.double_xp}
            onDoubleXp={doubleXp}
            onRetrySave={gameSave.retry}
            onPlayAgain={() => startGame(player, video, lines, mode, difficulty)}
            onOtherMode={() => setPhase({ kind: 'picker', adapter: player, video, lines })}
            onFinished={rememberFirstFinish}
          />
        );
      }
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
      {/* The game screen's header, drawn into this box through a portal. It adds no box of its own to the layout. */}
      <div ref={setGameHeaderSlot} className="contents" />
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
