import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { selectBlanks } from '@/lib/game/blanks';
import { BrokenStorage, MemoryStorage } from '@/lib/game/fakeStorage';
import { PROGRESS_MAX_AGE_MS, loadProgress, saveProgress, type SavedProgress } from '@/lib/game/savedProgress';
import { createScore } from '@/lib/game/scoring';
import { selectTileLines } from '@/lib/game/tiles';
import { applyOffset, parseLrc } from '@/lib/lyrics/lrc';
import type { SongResolution, VideoRecord } from '@/lib/lyrics/resolveSong';
import type { PlayerAdapter } from '@/lib/player/adapter';
import { FakePlayerAdapter } from '@/lib/player/fakeAdapter';
import { PlayerLoadError } from '@/lib/player/youtubeAdapter';
import { FIRST_FINISH_KEY } from '@/lib/pwa/firstFinish';
import type { SongTranslation } from '@/lib/help/songTranslation';
import type { AnswerRecord, PlaySummary } from '@/lib/types';
import { GameScreen } from './GameScreen';
import { SongScreen, type SongScreenDeps } from './SongScreen';

// The real game screen comes in a later task; here it only records what it was given.
vi.mock('./GameScreen', () => ({
  GameScreen: vi.fn(() => <div data-testid="game-screen" />),
}));

const ID = 'dQw4w9WgXcQ';
const DURATION_MS = 213000;
const LYRICS_DURATION_S = 200;

const LRC = [
  '[00:00.30]Lanterns drift across the silver river',
  '[00:03.30]We carried every secret down the hill',
  '[00:06.30]And morning paints the window gold again',
  '[00:09.30]Hold the compass steady for me now',
  "[00:12.30]We're sailing past the sleeping harbor lights",
  '[00:15.30]Tell me which road leads back to the sea',
  '[00:18.30]',
].join('\n');

/** The lines as the lyrics have them: 3 s each, the first one at 300 ms. */
const LINES = parseLrc(LRC, LYRICS_DURATION_S * 1000);

const VIDEO: VideoRecord = {
  youtubeId: ID,
  title: 'Invented Artist - Invented Song (Official Video)',
  channel: 'InventedArtistVEVO',
  durationS: 213,
  ytFetchedAt: '2026-10-21T12:00:00.000Z',
  status: 'ok',
  lyricsSource: 'lrclib',
  lyricsRef: '777',
  lyricsLrc: LRC,
  lyricsDurationS: LYRICS_DURATION_S,
  offsetMs: 0,
};

const READY: SongResolution = { status: 'ready', video: VIDEO, lines: LINES, needsCalibration: false };
const NEEDS_CALIBRATION: SongResolution = { ...READY, needsCalibration: true };

/** What resolveSong gives for a video whose players already settled on an offset. */
function calibrated(offsetMs: number, needsCalibration: boolean): SongResolution {
  return { status: 'ready', video: { ...VIDEO, offsetMs }, lines: applyOffset(LINES, offsetMs), needsCalibration };
}

const AUDIO_SEARCH = `https://www.youtube.com/results?search_query=${encodeURIComponent('Invented Artist Invented Song official audio')}`;

const SLOW = 'O banco de letras tá lento. Tenta de novo?';
const CANNOT_EMBED = 'Esse clipe não toca fora do YouTube.';
const PLAYER_FAILED = 'Não deu pra carregar o clipe. Tenta de novo?';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let fake: FakePlayerAdapter;

interface MockDeps {
  createAdapter: Mock<SongScreenDeps['createAdapter']>;
  resolve: Mock<SongScreenDeps['resolve']>;
  saveOffsetVote: Mock<SongScreenDeps['saveOffsetVote']>;
  savePlay: Mock<SongScreenDeps['savePlay']>;
  doubleXp: Mock<SongScreenDeps['doubleXp']>;
  sleep: Mock<NonNullable<SongScreenDeps['sleep']>>;
  now?: () => number;
  progressStorage?: SongScreenDeps['progressStorage'];
  wallClock?: SongScreenDeps['wallClock'];
  translateSong?: Mock<NonNullable<SongScreenDeps['translateSong']>>;
}

function makeDeps(over: Partial<MockDeps> = {}): MockDeps {
  return {
    createAdapter: vi.fn<SongScreenDeps['createAdapter']>().mockResolvedValue(fake),
    resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(READY),
    saveOffsetVote: vi.fn<SongScreenDeps['saveOffsetVote']>().mockResolvedValue(0),
    savePlay: vi.fn<SongScreenDeps['savePlay']>().mockResolvedValue({ playId: 'play-1', xp: 120 }),
    doubleXp: vi.fn<SongScreenDeps['doubleXp']>().mockResolvedValue({ xp: 240 }),
    // The duration wait does not sleep for real in tests.
    sleep: vi.fn<NonNullable<SongScreenDeps['sleep']>>().mockResolvedValue(undefined),
    ...over,
  };
}

/** The props the (mocked) game screen got the last time it rendered. */
function gameProps() {
  const props = vi.mocked(GameScreen).mock.lastCall?.[0];
  if (!props) throw new Error('The game screen was never shown.');
  return props;
}

function pick(mode: string, difficulty?: string) {
  fireEvent.click(screen.getByRole('radio', { name: mode }));
  if (difficulty) fireEvent.click(screen.getByRole('radio', { name: difficulty }));
  fireEvent.click(screen.getByRole('button', { name: 'Jogar' }));
}

/** The player presses play on the clip, then taps "Começou!" at `atMs` and saves. */
function calibrateAt(atMs: number) {
  act(() => fake.emitState('playing'));
  fake.seekTo(atMs);
  fireEvent.click(screen.getByRole('button', { name: 'Começou!' }));
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
}

beforeEach(() => {
  fake = new FakePlayerAdapter(DURATION_MS);
  vi.mocked(GameScreen).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SongScreen: loading', () => {
  it('shows DJ Bop looking for the lyrics while the player and the lyrics load', async () => {
    const lyrics = deferred<SongResolution>();
    const deps = makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockReturnValue(lyrics.promise) });
    render(<SongScreen youtubeId={ID} deps={deps} />);

    expect(screen.getByRole('img', { name: 'DJ Bop' })).toBeInTheDocument();
    expect(screen.getByText('Procurando a letra...')).toBeInTheDocument();

    await waitFor(() => expect(deps.resolve).toHaveBeenCalled());
    expect(screen.getByText('Procurando a letra...')).toBeInTheDocument();
  });

  it('turns a disc under DJ Bop while they load, and the line that says it stays the one status', async () => {
    const lyrics = deferred<SongResolution>();
    const deps = makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockReturnValue(lyrics.promise) });
    render(<SongScreen youtubeId={ID} deps={deps} />);
    await waitFor(() => expect(deps.resolve).toHaveBeenCalled());

    const disc = screen.getByTestId('spinning-disc');
    expect(disc).toHaveClass('disc-spin');
    expect(disc).toHaveAttribute('aria-hidden', 'true');
    // The disc is not the status, and the status is not inside it: the loading is announced once, by the line.
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Procurando a letra...');
    expect(status).not.toContainElement(disc);
    expect(screen.getByRole('img', { name: 'DJ Bop' })).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('stops showing the disc as soon as the lyrics are there', async () => {
    const lyrics = deferred<SongResolution>();
    const deps = makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockReturnValue(lyrics.promise) });
    render(<SongScreen youtubeId={ID} deps={deps} />);
    await waitFor(() => expect(deps.resolve).toHaveBeenCalled());
    expect(screen.getByTestId('spinning-disc')).toBeInTheDocument();

    lyrics.resolve(READY);

    expect(await screen.findByRole('button', { name: 'Jogar' })).toBeInTheDocument();
    expect(screen.queryByTestId('spinning-disc')).not.toBeInTheDocument();
  });

  it('shows no disc where nothing is loading: not when the lyrics are slow, nor when the video is gone', async () => {
    const slow = makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue({ status: 'lyrics_unavailable' }) });
    const { unmount } = render(<SongScreen youtubeId={ID} deps={slow} />);
    expect(await screen.findByText(SLOW)).toBeInTheDocument();
    expect(screen.queryByTestId('spinning-disc')).not.toBeInTheDocument();
    unmount();

    const gone = makeDeps({ createAdapter: vi.fn<SongScreenDeps['createAdapter']>().mockRejectedValue(new PlayerLoadError('not_found')) });
    render(<SongScreen youtubeId={ID} deps={gone} />);
    expect(await screen.findByText(CANNOT_EMBED)).toBeInTheDocument();
    expect(screen.queryByTestId('spinning-disc')).not.toBeInTheDocument();
  });

  it('starts the player on an element of its own inside the player box, then resolves with its duration', async () => {
    const deps = makeDeps();
    render(<SongScreen youtubeId={ID} deps={deps} />);

    expect(deps.createAdapter).toHaveBeenCalledOnce();
    const [el, id] = deps.createAdapter.mock.calls[0];
    expect(id).toBe(ID);
    const box = screen.getByTestId('player');
    expect(el).not.toBe(box);
    expect(box.contains(el)).toBe(true);

    await waitFor(() => expect(deps.resolve).toHaveBeenCalledExactlyOnceWith(ID, 213));
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it('keeps the same player box from loading to the game', async () => {
    const deps = makeDeps();
    render(<SongScreen youtubeId={ID} deps={deps} />);
    const box = screen.getByTestId('player');
    const [el] = deps.createAdapter.mock.calls[0];

    await screen.findByRole('button', { name: 'Jogar' });
    expect(screen.getByTestId('player')).toBe(box);

    pick('Escolha');
    expect(screen.getByTestId('game-screen')).toBeInTheDocument();
    expect(screen.getByTestId('player')).toBe(box);
    expect(box.contains(el)).toBe(true);
  });
});

describe('SongScreen: the video duration (ruling R42)', () => {
  it('waits for the player to know the duration, checking every 100 ms', async () => {
    vi.spyOn(fake, 'getDurationMs').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(DURATION_MS);
    const deps = makeDeps();
    render(<SongScreen youtubeId={ID} deps={deps} />);

    await waitFor(() => expect(deps.resolve).toHaveBeenCalledExactlyOnceWith(ID, 213));
    expect(deps.sleep).toHaveBeenCalledTimes(2);
    expect(deps.sleep).toHaveBeenCalledWith(100);
  });

  it('gives up after 3 s and asks the server with no duration, which then saves nothing (ruling R42)', async () => {
    vi.spyOn(fake, 'getDurationMs').mockReturnValue(0);
    const deps = makeDeps();
    deps.resolve.mockResolvedValue(NEEDS_CALIBRATION);
    render(<SongScreen youtubeId={ID} deps={deps} />);

    // No calibration for a duration nobody knows: straight to the modes, whatever the answer says.
    expect(await screen.findByRole('button', { name: 'Jogar' })).toBeInTheDocument();
    expect(deps.sleep).toHaveBeenCalledTimes(30);
    expect(deps.resolve).toHaveBeenCalledExactlyOnceWith(ID, null);
    expect(screen.queryByRole('button', { name: 'Começou!' })).not.toBeInTheDocument();
  });

  it('stops waiting when the screen closes', async () => {
    vi.spyOn(fake, 'getDurationMs').mockReturnValue(0);
    const nap = deferred<void>();
    const deps = makeDeps({ sleep: vi.fn<NonNullable<SongScreenDeps['sleep']>>().mockReturnValue(nap.promise) });
    const { unmount } = render(<SongScreen youtubeId={ID} deps={deps} />);
    await waitFor(() => expect(deps.sleep).toHaveBeenCalledOnce());

    unmount();
    await act(async () => nap.resolve());

    expect(deps.sleep).toHaveBeenCalledOnce();
    expect(deps.resolve).not.toHaveBeenCalled();
  });
});

describe('SongScreen: lyrics service slow or down (Review Focus 1)', () => {
  it('says the lyrics service is slow and asks again on "Tentar de novo"', async () => {
    const deps = makeDeps({
      resolve: vi.fn<SongScreenDeps['resolve']>()
        .mockResolvedValueOnce({ status: 'lyrics_unavailable' })
        .mockResolvedValueOnce(READY),
    });
    render(<SongScreen youtubeId={ID} deps={deps} />);

    expect(await screen.findByText(SLOW)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('button', { name: 'Jogar' })).toBeInTheDocument();
    expect(deps.resolve).toHaveBeenCalledTimes(2);
    expect(deps.resolve).toHaveBeenLastCalledWith(ID, 213);
    expect(deps.createAdapter).toHaveBeenCalledOnce();
  });

  it('shows the same retry when resolving the song fails outright', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = makeDeps({
      resolve: vi.fn<SongScreenDeps['resolve']>()
        .mockRejectedValueOnce(new Error('Could not read the video'))
        .mockResolvedValueOnce(READY),
    });
    render(<SongScreen youtubeId={ID} deps={deps} />);

    expect(await screen.findByText(SLOW)).toBeInTheDocument();
    expect(warn).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('button', { name: 'Jogar' })).toBeInTheDocument();
  });
});

describe('SongScreen: a clip that does not play outside YouTube (Review Focus 2)', () => {
  it('says so when the player reports not_embeddable after it got ready', async () => {
    const deps = makeDeps();
    render(<SongScreen youtubeId={ID} deps={deps} />);
    await screen.findByRole('button', { name: 'Jogar' });

    act(() => fake.emitError('not_embeddable'));

    expect(screen.getByText(CANNOT_EMBED)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Colar outro link' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: 'Jogar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
  });

  it('says so when the error is replayed inside onError, and asks for no lyrics', async () => {
    // The real adapter replays an error it already had to a new listener before onError returns.
    vi.spyOn(fake, 'onError').mockImplementation((cb) => {
      cb('not_embeddable');
      return () => {};
    });
    const deps = makeDeps();
    render(<SongScreen youtubeId={ID} deps={deps} />);

    expect(await screen.findByText(CANNOT_EMBED)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Colar outro link' })).toBeInTheDocument();
    expect(deps.resolve).not.toHaveBeenCalled();
    expect(screen.queryByText('Procurando a letra...')).not.toBeInTheDocument();
  });

  it('says so in the middle of the game too', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });
    pick('Escolha');

    act(() => fake.emitError('not_found'));

    expect(screen.getByText(CANNOT_EMBED)).toBeInTheDocument();
    expect(screen.queryByTestId('game-screen')).not.toBeInTheDocument();
  });

  it.each(['not_embeddable', 'not_found'] as const)(
    'says so when the player cannot start (%s), without asking for the lyrics',
    async (reason) => {
      const deps = makeDeps({
        createAdapter: vi.fn<SongScreenDeps['createAdapter']>().mockRejectedValue(new PlayerLoadError(reason)),
      });
      render(<SongScreen youtubeId={ID} deps={deps} />);

      expect(await screen.findByText(CANNOT_EMBED)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Colar outro link' })).toHaveAttribute('href', '/');
      expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
      expect(deps.resolve).not.toHaveBeenCalled();
    },
  );

  it('says the clip did not load and offers a new player when it failed for another reason', async () => {
    const deps = makeDeps({
      createAdapter: vi.fn<SongScreenDeps['createAdapter']>()
        .mockRejectedValueOnce(new PlayerLoadError('other'))
        .mockResolvedValueOnce(fake),
    });
    render(<SongScreen youtubeId={ID} deps={deps} />);

    expect(await screen.findByText(PLAYER_FAILED)).toBeInTheDocument();
    expect(screen.queryByText(CANNOT_EMBED)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Colar outro link' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('button', { name: 'Jogar' })).toBeInTheDocument();
    expect(deps.createAdapter).toHaveBeenCalledTimes(2);
    const [firstEl] = deps.createAdapter.mock.calls[0];
    const [secondEl] = deps.createAdapter.mock.calls[1];
    expect(firstEl.isConnected).toBe(false);
    expect(screen.getByTestId('player').contains(secondEl)).toBe(true);
  });

  it('treats a player that failed with something other than a PlayerLoadError as "other"', async () => {
    const deps = makeDeps({ createAdapter: vi.fn<SongScreenDeps['createAdapter']>().mockRejectedValue(new Error('boom')) });
    render(<SongScreen youtubeId={ID} deps={deps} />);

    expect(await screen.findByText(PLAYER_FAILED)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('replaces the player after a late "other" error and retry', async () => {
    const second = new FakePlayerAdapter(DURATION_MS);
    const destroy = vi.spyOn(fake, 'destroy');
    const deps = makeDeps({
      createAdapter: vi.fn<SongScreenDeps['createAdapter']>().mockResolvedValueOnce(fake).mockResolvedValueOnce(second),
    });
    render(<SongScreen youtubeId={ID} deps={deps} />);
    await screen.findByRole('button', { name: 'Jogar' });

    act(() => fake.emitError('other'));
    expect(screen.getByText(PLAYER_FAILED)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('button', { name: 'Jogar' })).toBeInTheDocument();
    expect(destroy).toHaveBeenCalledOnce();
    pick('Escolha');
    expect(gameProps().adapter).toBe(second);
  });

  it('says so when YouTube no longer knows the video', async () => {
    const deps = makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue({ status: 'video_unavailable' }) });
    render(<SongScreen youtubeId={ID} deps={deps} />);

    expect(await screen.findByText(CANNOT_EMBED)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Colar outro link' })).toHaveAttribute('href', '/');
  });
});

describe('SongScreen: no lyrics', () => {
  it('says there are no lyrics yet and offers to search for the official audio in a new tab', async () => {
    const deps = makeDeps({
      resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue({ status: 'no_lyrics', video: { ...VIDEO, status: 'no_lyrics' } }),
    });
    render(<SongScreen youtubeId={ID} deps={deps} />);

    expect(await screen.findByText('Ainda não temos a letra dessa.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Procurar a versão áudio oficial' });
    expect(link).toHaveAttribute('href', AUDIO_SEARCH);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Colar outro link' })).toHaveAttribute('href', '/');
  });

  it('treats lyrics without a single line as no lyrics', async () => {
    const deps = makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue({ ...READY, lines: [] }) });
    render(<SongScreen youtubeId={ID} deps={deps} />);

    expect(await screen.findByText('Ainda não temos a letra dessa.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jogar' })).not.toBeInTheDocument();
  });
});

describe('SongScreen: calibration', () => {
  it('asks for it by itself when the video is much longer than the lyrics and has no offset yet', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(NEEDS_CALIBRATION) })} />);

    expect(await screen.findByRole('button', { name: 'Começou!' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jogar' })).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Trocar para a versão áudio oficial' });
    expect(link).toHaveAttribute('href', AUDIO_SEARCH);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('goes straight to the modes when the players already settled on an offset (ruling R43)', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(calibrated(25500, true)) })} />);

    expect(await screen.findByRole('button', { name: 'Jogar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Começou!' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajustar o tempo' })).toBeInTheDocument();
  });

  it('opens on demand from the modes with "Ajustar o tempo", and comes back to them', async () => {
    const deps = makeDeps({ saveOffsetVote: vi.fn<SongScreenDeps['saveOffsetVote']>().mockResolvedValue(25600) });
    render(<SongScreen youtubeId={ID} deps={deps} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Ajustar o tempo' }));
    calibrateAt(26000);

    expect(deps.saveOffsetVote).toHaveBeenCalledExactlyOnceWith(ID, 25700);
    await screen.findByRole('button', { name: 'Jogar' });
    pick('Escolha');
    expect(gameProps().lines).toEqual(applyOffset(LINES, 25600));
  });

  it('keeps Começou! off until the clip has played', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(NEEDS_CALIBRATION) })} />);

    const start = await screen.findByRole('button', { name: 'Começou!' });
    expect(start).toBeDisabled();

    act(() => fake.emitState('playing'));

    expect(start).toBeEnabled();
  });

  it('remembers that the clip played before the sheet opened', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    act(() => fake.emitState('playing'));
    act(() => fake.emitState('paused'));
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar o tempo' }));

    expect(screen.getByRole('button', { name: 'Começou!' })).toBeEnabled();
  });

  it('saves the vote, moves the lines to the new median and goes on to the mode picker', async () => {
    const deps = makeDeps({
      resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(NEEDS_CALIBRATION),
      saveOffsetVote: vi.fn<SongScreenDeps['saveOffsetVote']>().mockResolvedValue(25500),
    });
    render(<SongScreen youtubeId={ID} deps={deps} />);
    await screen.findByRole('button', { name: 'Começou!' });

    calibrateAt(26000);

    expect(deps.saveOffsetVote).toHaveBeenCalledExactlyOnceWith(ID, 25700);
    await screen.findByRole('button', { name: 'Jogar' });
    pick('Escolha');
    expect(gameProps().lines).toEqual(applyOffset(LINES, 25500));
    expect(gameProps().video.offsetMs).toBe(25500);
  });

  it('measures from the lyrics as written, even when a negative offset clamped the first line to 0', async () => {
    const deps = makeDeps({
      resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(calibrated(-1000, true)),
      saveOffsetVote: vi.fn<SongScreenDeps['saveOffsetVote']>().mockResolvedValue(25700),
    });
    render(<SongScreen youtubeId={ID} deps={deps} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ajustar o tempo' }));

    calibrateAt(26000);

    // 26000 − 300 (the first line as written), not 26000 − (0 − (−1000)).
    expect(deps.saveOffsetVote).toHaveBeenCalledExactlyOnceWith(ID, 25700);
    await screen.findByRole('button', { name: 'Jogar' });
    pick('Escolha');
    expect(gameProps().lines).toEqual(applyOffset(LINES, 25700));
  });

  it('goes on with the lines as they are when the player skips it', async () => {
    const deps = makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(NEEDS_CALIBRATION) });
    render(<SongScreen youtubeId={ID} deps={deps} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Pular' }));
    pick('Escolha');

    expect(deps.saveOffsetVote).not.toHaveBeenCalled();
    expect(gameProps().lines).toEqual(LINES);
  });
});

describe('SongScreen: mode picker', () => {
  it('offers the 4 modes and the 3 difficulties, with the song it is about', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    for (const mode of ['Escolha', 'Digitação', 'Karaokê', 'Monte o verso']) {
      expect(screen.getByRole('radio', { name: mode })).toBeInTheDocument();
    }
    for (const difficulty of ['Fácil', 'Médio', 'Difícil']) {
      expect(screen.getByRole('radio', { name: difficulty })).toBeInTheDocument();
    }
    expect(screen.getByText('Invented Song')).toBeInTheDocument();
    expect(screen.getByText('Invented Artist')).toBeInTheDocument();
  });

  it('starts Escolha on Médio with the blanks selectBlanks picks for the song', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    pick('Escolha', 'Médio');

    expect(screen.getByTestId('game-screen')).toBeInTheDocument();
    const props = gameProps();
    const expected = selectBlanks(LINES, 'medio', ID);
    expect(expected.length).toBeGreaterThan(0);
    expect(props.blanks).toEqual(expected);
    expect(props).toMatchObject({ adapter: fake, mode: 'escolha', difficulty: 'medio', lines: LINES, video: VIDEO });
  });

  it('uses selectBlanks for Digitação too', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    pick('Digitação', 'Difícil');

    expect(gameProps()).toMatchObject({ mode: 'digitacao', difficulty: 'dificil', blanks: selectBlanks(LINES, 'dificil', ID) });
  });

  it('uses whole-line tiles for Monte o verso', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    pick('Monte o verso', 'Fácil');

    const expected = selectTileLines(LINES, 'facil', ID);
    expect(expected.length).toBeGreaterThan(0);
    expect(gameProps()).toMatchObject({ mode: 'montar', difficulty: 'facil', blanks: expected });
  });

  it('gives Karaokê no blanks and no difficulty to choose', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    fireEvent.click(screen.getByRole('radio', { name: 'Karaokê' }));
    expect(screen.queryByRole('radio', { name: 'Médio' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Jogar' }));

    expect(gameProps()).toMatchObject({ mode: 'karaoke', blanks: [] });
  });

  it('passes on how long the screen took to get the song ready', async () => {
    let clock = 1000;
    const lyrics = deferred<SongResolution>();
    const deps = makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockReturnValue(lyrics.promise), now: () => clock });
    render(<SongScreen youtubeId={ID} deps={deps} />);
    await waitFor(() => expect(deps.resolve).toHaveBeenCalled());

    clock = 3500;
    await act(async () => lyrics.resolve(READY));
    clock = 9000; // time spent choosing a mode does not count
    pick('Escolha');

    expect(gameProps().timeToReadyMs).toBe(2500);
  });

  it('gives the game a place for its header above the player', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    pick('Escolha');

    const { headerSlot } = gameProps();
    expect(headerSlot).toBeInstanceOf(HTMLElement);
    expect(headerSlot!.compareDocumentPosition(screen.getByTestId('player')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The song screen draws no header of its own during the game.
    expect(screen.queryByRole('link', { name: 'Voltar' })).not.toBeInTheDocument();
    expect(screen.getByTestId('game-screen')).toBeInTheDocument();
  });
});

const SUMMARY: PlaySummary = { totalBlanks: 12, firstTryCorrect: 11, pct: 92, maxCombo: 8, xp: 240 };
const RECORDS: AnswerRecord[] = [
  { blankId: 'b1', kind: 'first', correct: true, beforeLineEnd: true },
  { blankId: 'b2', kind: 'first', correct: false, beforeLineEnd: false },
];

/** A game with two blanks answered after a hint, one of them twice. */
const HELPED_RECORDS: AnswerRecord[] = [
  ...RECORDS,
  { blankId: 'b3', kind: 'helped', correct: false, beforeLineEnd: true },
  { blankId: 'b3', kind: 'helped', correct: true, beforeLineEnd: true },
  { blankId: 'b4', kind: 'helped', correct: true, beforeLineEnd: false },
];

/** The game on screen reports its end. */
async function finishGame(summary = SUMMARY, records = RECORDS) {
  await act(async () => gameProps().onEnd(summary, records));
}

/** Opens the song, picks a mode and lets the game report that it ended. */
async function playToTheEnd(deps: MockDeps, mode = 'Escolha', difficulty: string | undefined = 'Médio') {
  render(<SongScreen youtubeId={ID} deps={deps} />);
  await screen.findByRole('button', { name: 'Jogar' });
  pick(mode, difficulty);
  await finishGame();
}

/** The page goes to the background or comes back, as the browser reports it. */
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('SongScreen: the page in the background (ruling R84)', () => {
  afterEach(() => {
    setVisibility('visible');
  });

  it('pauses the clip on the mode picker when the page is hidden, and nothing plays it again', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });
    // The player pressed play on the clip to hear it before picking a mode.
    act(() => fake.emitState('playing'));
    const before = fake.calls.length;

    setVisibility('hidden');
    setVisibility('visible');

    // Paused again on the way back, in case the phone played it (ruling S19).
    expect(fake.calls.slice(before)).toEqual(['pause', 'pause']);
  });

  it('pauses again as the page comes back, so a clip the phone plays again by itself is stopped (ruling S19)', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });
    act(() => fake.emitState('playing'));
    setVisibility('hidden');
    // Android plays the clip again as the page comes back.
    act(() => fake.setStateUnreported('playing'));

    setVisibility('visible');

    expect(fake.getPlayerState()).toBe('paused');
  });

  it('pauses again on the way back from pagehide (pageshow) too', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(NEEDS_CALIBRATION) })} />);
    await screen.findByRole('button', { name: 'Começou!' });
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    act(() => fake.setStateUnreported('playing'));

    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });

    expect(fake.getPlayerState()).toBe('paused');
  });

  it('pauses the clip during the calibration, on pagehide too', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(NEEDS_CALIBRATION) })} />);
    await screen.findByRole('button', { name: 'Começou!' });
    act(() => fake.emitState('playing'));
    const before = fake.calls.length;

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(fake.calls.slice(before)).toEqual(['pause']);
    expect(screen.getByRole('button', { name: 'Começou!' })).toBeInTheDocument();
  });

  it('leaves the game to the game screen, which pauses through its own commands', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });
    pick('Escolha');
    const before = fake.calls.length;

    setVisibility('hidden');

    expect(fake.calls.slice(before)).toEqual([]);
  });

  it('pauses the clip on the end screen when the page is hidden, and once more as it comes back (ruling S19)', async () => {
    await playToTheEnd(makeDeps());
    await screen.findByRole('button', { name: 'Jogar de novo' });
    act(() => fake.emitState('playing'));
    const before = fake.calls.length;

    setVisibility('hidden');
    setVisibility('visible');

    expect(fake.calls.slice(before)).toEqual(['pause', 'pause']);
  });
});

// Android, or the YouTube player itself, can play the clip again a moment after the page is back, after the pause the
// screen sends then (ruling S19). Outside the game, a play reported within 2 s of the return is paused too, unless the
// player tapped the clip for it (ruling S54).
describe('SongScreen: a play the phone starts as the page comes back (ruling S54)', () => {
  afterEach(() => {
    // Unmount while the fake timers are still installed, so the timer of the guard is cleared on them.
    cleanup();
    vi.useRealTimers();
    setVisibility('visible');
  });

  /** From here on the screen's own timers are fake, for the 2 s after the return. */
  function fakeTimers() {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  }

  /** YouTube's iframe in the player box, which a tap on the clip gives the focus to. */
  function clipFrame() {
    const frame = document.createElement('iframe');
    screen.getByTestId('player').append(frame);
    return frame;
  }

  async function openCalibration() {
    render(<SongScreen youtubeId={ID} deps={makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(NEEDS_CALIBRATION) })} />);
    await screen.findByRole('button', { name: 'Começou!' });
  }

  async function openPicker() {
    render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });
  }

  async function openEndScreen() {
    await playToTheEnd(makeDeps());
    await screen.findByRole('button', { name: 'Jogar de novo' });
  }

  it.each([
    ['the calibration', openCalibration],
    ['the mode picker', openPicker],
    ['the end screen', openEndScreen],
  ])('pauses a play the phone reports 200 ms after the page is back, in %s', async (_screen, open) => {
    await open();
    act(() => fake.emitState('playing'));
    fakeTimers();
    setVisibility('hidden');
    setVisibility('visible');
    act(() => vi.advanceTimersByTime(200));

    act(() => fake.emitState('playing'));

    expect(fake.getPlayerState()).toBe('paused');
    expect(fake.calls.at(-1)).toBe('pause');
  });

  it('leaves alone a play the player taps the clip for in those 2 s', async () => {
    await openPicker();
    const frame = clipFrame();
    fakeTimers();
    setVisibility('hidden');
    setVisibility('visible');
    act(() => vi.advanceTimersByTime(500));
    const before = fake.calls.length;

    frame.focus();
    window.dispatchEvent(new Event('blur'));
    act(() => fake.emitState('playing'));

    expect(fake.getPlayerState()).toBe('playing');
    expect(fake.calls.slice(before)).toEqual([]);
  });

  it('leaves the game that "Jogar" starts in those 2 s to the game screen', async () => {
    await openPicker();
    fakeTimers();
    setVisibility('hidden');
    setVisibility('visible');
    pick('Escolha');
    const before = fake.calls.length;

    // The game screen plays the clip from the top.
    act(() => fake.emitState('playing'));

    expect(fake.getPlayerState()).toBe('playing');
    expect(fake.calls.slice(before)).toEqual([]);
  });

  it('leaves a play reported after those 2 s alone', async () => {
    await openPicker();
    fakeTimers();
    setVisibility('hidden');
    setVisibility('visible');
    act(() => vi.advanceTimersByTime(2000));

    act(() => fake.emitState('playing'));

    expect(fake.getPlayerState()).toBe('playing');
  });
});

describe('SongScreen: going on from a saved game', () => {
  // Midday by the clock of wherever the tests run, so "a minute before" is always the same day.
  const NOW = new Date(2027, 0, 15, 12, 0, 0).getTime();
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  /** Deps whose storage is `storage`, on a clock that says it is `NOW`. */
  function depsWithStorage(over: Partial<MockDeps> = {}) {
    return makeDeps({ progressStorage: () => storage, wallClock: () => NOW, ...over });
  }

  /** A game of Escolha on Médio with the first blank right and the clock in the third line. */
  function savedGame(over: Partial<SavedProgress> = {}): SavedProgress {
    const blanks = selectBlanks(LINES, 'medio', ID);
    const answered = blanks[0];
    return {
      version: 1,
      youtubeId: ID,
      mode: 'escolha',
      difficulty: 'medio',
      savedAt: NOW - 60_000,
      lastTickMs: 7000,
      status: Object.fromEntries(blanks.map((blank) => [blank.id, blank === answered ? 'correct' : 'pending'])),
      attempted: { [answered.id]: true },
      hinted: {},
      tilesPlaced: {},
      score: {
        ...createScore(blanks.length),
        combo: 1,
        maxCombo: 1,
        xp: 12,
        firstTryCorrect: 1,
        records: [{ blankId: answered.id, kind: 'first', correct: true, beforeLineEnd: true }],
      },
      ...over,
    };
  }

  const resumeButton = () => screen.queryByRole('button', { name: 'Continuar de onde parou' });
  const discardButton = () => screen.queryByRole('button', { name: 'Começar do zero' });

  it('offers "Continuar de onde parou" and "Começar do zero" on the mode picker, with the mode and difficulty it was', async () => {
    saveProgress(storage, savedGame());
    render(<SongScreen youtubeId={ID} deps={depsWithStorage()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    expect(resumeButton()).toBeInTheDocument();
    expect(discardButton()).toBeInTheDocument();
    const saved = screen.getByRole('region', { name: /Partida salva/ });
    expect(saved).toHaveTextContent(/Escolha · Médio/);
    const time = new Date(NOW - 60_000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    expect(saved).toHaveTextContent(`Partida salva às ${time}`);
    // The modes and "Jogar" are still there for a new game.
    expect(screen.getByRole('radio', { name: 'Digitação' })).toBeInTheDocument();
  });

  it('says "ontem" for a game saved on the day before, and keeps the plain time for one saved today', async () => {
    const lastNight = new Date(2027, 0, 14, 23, 30, 0).getTime();
    saveProgress(storage, savedGame({ savedAt: lastNight }));
    render(<SongScreen youtubeId={ID} deps={depsWithStorage()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    const saved = screen.getByRole('region', { name: /Partida salva/ });
    const time = new Date(lastNight).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    expect(saved).toHaveTextContent(`Partida salva ontem às ${time} · Escolha · Médio`);
  });

  it('says "ontem" in the Karaokê wording too', async () => {
    const lastNight = new Date(2027, 0, 14, 23, 30, 0).getTime();
    saveProgress(storage, savedGame({ mode: 'karaoke', status: {}, attempted: {}, score: createScore(0), savedAt: lastNight }));
    render(<SongScreen youtubeId={ID} deps={depsWithStorage()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    expect(screen.getByRole('region', { name: /Partida salva/ })).toHaveTextContent(/Partida salva ontem às 23:30 · Karaokê/);
  });

  it('asks for no difficulty in the Karaokê it was', async () => {
    saveProgress(storage, savedGame({ mode: 'karaoke', status: {}, attempted: {}, score: createScore(0) }));
    render(<SongScreen youtubeId={ID} deps={depsWithStorage()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    const saved = screen.getByRole('region', { name: /Partida salva/ });
    expect(saved).toHaveTextContent(/Karaokê/);
    expect(saved).not.toHaveTextContent(/Médio/);
  });

  it('keeps both buttons at least 44 px tall and out of the form’s submit', async () => {
    saveProgress(storage, savedGame());
    render(<SongScreen youtubeId={ID} deps={depsWithStorage()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    for (const button of [resumeButton(), discardButton()]) {
      expect(button).toHaveAttribute('type', 'button');
      // min-h-11 is 44 px; the one for "Continuar de onde parou" is a step taller.
      expect(button?.className).toMatch(/min-h-1[1-9]/);
    }
    expect(resumeButton()).toHaveClass('bg-lime', 'text-bg');
  });

  it('offers nothing when the song has no saved game', async () => {
    render(<SongScreen youtubeId={ID} deps={depsWithStorage()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    expect(resumeButton()).not.toBeInTheDocument();
    expect(discardButton()).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Partida salva/ })).not.toBeInTheDocument();
  });

  it('offers nothing for the saved game of another song', async () => {
    saveProgress(storage, savedGame({ youtubeId: 'M7lc1UVf-VE' }));
    render(<SongScreen youtubeId={ID} deps={depsWithStorage()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    expect(resumeButton()).not.toBeInTheDocument();
  });

  it('offers nothing for a saved game more than 24 hours old, which is taken out of the storage', async () => {
    saveProgress(storage, savedGame({ savedAt: NOW - PROGRESS_MAX_AGE_MS - 1 }));
    render(<SongScreen youtubeId={ID} deps={depsWithStorage()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    expect(resumeButton()).not.toBeInTheDocument();
    expect(storage.keys()).toEqual([]);
  });

  it('offers nothing for a saved game dated after now (a clock set back), which is taken out of the storage', async () => {
    saveProgress(storage, savedGame({ savedAt: NOW + 1 }));
    render(<SongScreen youtubeId={ID} deps={depsWithStorage()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    expect(resumeButton()).not.toBeInTheDocument();
    expect(storage.keys()).toEqual([]);
  });

  it('takes out the old saved games of other songs too when the picker comes up, and leaves the fresh ones and other keys', async () => {
    saveProgress(storage, savedGame({ youtubeId: 'abandoned-1', savedAt: NOW - PROGRESS_MAX_AGE_MS - 1 }));
    saveProgress(storage, savedGame({ youtubeId: 'abandoned-2', savedAt: NOW - 5 * PROGRESS_MAX_AGE_MS }));
    saveProgress(storage, savedGame({ youtubeId: 'recent', savedAt: NOW - 3_600_000 }));
    storage.setItem('hb_settings', '{"sounds":false}');
    render(<SongScreen youtubeId={ID} deps={depsWithStorage()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    expect(storage.keys().sort()).toEqual(['hb_progress:recent', 'hb_settings']);
  });

  it('offers nothing, and does not break, when the storage refuses or there is none', async () => {
    const { unmount } = render(
      <SongScreen youtubeId={ID} deps={depsWithStorage({ progressStorage: () => new BrokenStorage() })} />,
    );
    await screen.findByRole('button', { name: 'Jogar' });
    expect(resumeButton()).not.toBeInTheDocument();
    unmount();

    render(<SongScreen youtubeId={ID} deps={depsWithStorage({ progressStorage: () => null })} />);
    await screen.findByRole('button', { name: 'Jogar' });
    expect(resumeButton()).not.toBeInTheDocument();
    pick('Escolha');
    expect(gameProps().progressStorage).toBeNull();
  });

  it('also offers it when the picker comes back from the calibration', async () => {
    saveProgress(storage, savedGame());
    render(<SongScreen youtubeId={ID} deps={depsWithStorage()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ajustar o tempo' }));

    fireEvent.click(screen.getByRole('button', { name: 'Pular' }));

    expect(resumeButton()).toBeInTheDocument();
  });

  it('"Continuar de onde parou" starts the game in the mode and difficulty it was saved in, with the saved game to go on from', async () => {
    const blanks = selectBlanks(LINES, 'dificil', ID);
    const saved = savedGame({
      mode: 'digitacao',
      difficulty: 'dificil',
      status: Object.fromEntries(blanks.map((blank) => [blank.id, 'pending'])),
      attempted: {},
      score: createScore(blanks.length),
    });
    saveProgress(storage, saved);
    render(<SongScreen youtubeId={ID} deps={depsWithStorage()} />);
    await screen.findByRole('button', { name: 'Jogar' });
    // What is ticked on the picker does not matter: the saved game is the one that goes on.
    fireEvent.click(screen.getByRole('radio', { name: 'Karaokê' }));

    fireEvent.click(resumeButton()!);

    expect(screen.getByTestId('game-screen')).toBeInTheDocument();
    expect(gameProps()).toMatchObject({
      adapter: fake,
      mode: 'digitacao',
      difficulty: 'dificil',
      lines: LINES,
      blanks,
      video: VIDEO,
      resume: saved,
      progressStorage: storage,
    });
  });

  it('goes on in Monte o verso with whole-line tiles, as the game it was', async () => {
    const tiles = selectTileLines(LINES, 'facil', ID);
    const saved = savedGame({
      mode: 'montar',
      difficulty: 'facil',
      status: Object.fromEntries(tiles.map((blank) => [blank.id, 'pending'])),
      attempted: {},
      tilesPlaced: Object.fromEntries(tiles.map((blank) => [blank.id, []])),
      score: createScore(tiles.length),
    });
    saveProgress(storage, saved);
    render(<SongScreen youtubeId={ID} deps={depsWithStorage()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    fireEvent.click(resumeButton()!);

    expect(gameProps()).toMatchObject({ mode: 'montar', difficulty: 'facil', blanks: tiles, resume: saved });
  });

  it('"Começar do zero" forgets the saved game, takes the offer away and stays on the picker for a new game', async () => {
    saveProgress(storage, savedGame());
    render(<SongScreen youtubeId={ID} deps={depsWithStorage()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    fireEvent.click(discardButton()!);

    expect(loadProgress(storage, ID, NOW)).toBeNull();
    expect(storage.keys()).toEqual([]);
    expect(resumeButton()).not.toBeInTheDocument();
    expect(discardButton()).not.toBeInTheDocument();
    expect(screen.queryByTestId('game-screen')).not.toBeInTheDocument();

    pick('Escolha', 'Médio');
    expect(gameProps().resume).toBeUndefined();
  });

  it('"Começar do zero" leaves the saved game of other songs alone', async () => {
    saveProgress(storage, savedGame());
    saveProgress(storage, savedGame({ youtubeId: 'M7lc1UVf-VE' }));
    render(<SongScreen youtubeId={ID} deps={depsWithStorage()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    fireEvent.click(discardButton()!);

    expect(storage.keys()).toEqual(['hb_progress:M7lc1UVf-VE']);
  });

  it('"Jogar" starts a new game even when there is a saved one, with nothing to go on from', async () => {
    saveProgress(storage, savedGame());
    render(<SongScreen youtubeId={ID} deps={depsWithStorage()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    pick('Escolha', 'Fácil');

    expect(gameProps()).toMatchObject({ mode: 'escolha', difficulty: 'facil', blanks: selectBlanks(LINES, 'facil', ID) });
    expect(gameProps().resume).toBeUndefined();
    expect(gameProps().progressStorage).toBe(storage);
  });

  it('gives the game the clock it judges the age of a saved game by, to stamp the saves with', async () => {
    const deps = depsWithStorage();
    render(<SongScreen youtubeId={ID} deps={deps} />);
    await screen.findByRole('button', { name: 'Jogar' });

    pick('Escolha');

    expect(gameProps().wallClock).toBe(deps.wallClock);
  });

  it('does not look the song up again when the storage or the clock it was given are other functions on a later render', async () => {
    const deps = depsWithStorage();
    const { rerender } = render(<SongScreen youtubeId={ID} deps={deps} />);
    await screen.findByRole('button', { name: 'Jogar' });
    expect(deps.resolve).toHaveBeenCalledOnce();

    rerender(<SongScreen youtubeId={ID} deps={{ ...deps, progressStorage: () => storage, wallClock: () => NOW }} />);
    await act(async () => {});

    expect(deps.resolve).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Jogar' })).toBeInTheDocument();
  });
});

describe('SongScreen: the end of a song', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('says how many blanks the game took with a hint (spec §8, "com ajuda")', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });
    pick('Escolha');

    await finishGame(SUMMARY, HELPED_RECORDS);

    expect(screen.getByText('2 com ajuda')).toBeInTheDocument();
  });

  it('takes the place of the game with the result, and the player stays where it is', async () => {
    const deps = makeDeps();
    render(<SongScreen youtubeId={ID} deps={deps} />);
    await screen.findByRole('button', { name: 'Jogar' });
    pick('Escolha');
    const player = screen.getByTestId('player');
    const playerHost = player.firstElementChild;
    const destroy = vi.spyOn(fake, 'destroy');

    await finishGame();

    expect(screen.queryByTestId('game-screen')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: '92% de acerto' })).toBeInTheDocument();
    expect(screen.getByText('11 de 12 lacunas certas')).toBeInTheDocument();
    expect(screen.queryByText(/com ajuda/)).not.toBeInTheDocument();
    expect(screen.getByText('Mandou bem!')).toBeInTheDocument();
    expect(screen.getByTestId('player')).toBe(player);
    expect(player.firstElementChild).toBe(playerHost);
    expect(destroy).not.toHaveBeenCalled();
  });

  it('saves the play once, with what the game reported and the time the screen took to get ready', async () => {
    let clock = 1000;
    const lyrics = deferred<SongResolution>();
    const deps = makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockReturnValue(lyrics.promise), now: () => clock });
    render(<SongScreen youtubeId={ID} deps={deps} />);
    await waitFor(() => expect(deps.resolve).toHaveBeenCalled());
    clock = 3500;
    await act(async () => lyrics.resolve(READY));
    pick('Digitação', 'Difícil');

    await finishGame();

    expect(deps.savePlay).toHaveBeenCalledTimes(1);
    expect(deps.savePlay).toHaveBeenCalledWith(
      {
        playId: expect.any(String),
        youtubeId: ID,
        mode: 'digitacao',
        difficulty: 'dificil',
        summary: SUMMARY,
        records: RECORDS,
        timeToReadyMs: 2500,
      },
      false,
    );
  });

  it('saves the play once even if the game reports its end twice', async () => {
    const deps = makeDeps();
    await playToTheEnd(deps);

    await finishGame();
    await finishGame();

    expect(deps.savePlay).toHaveBeenCalledTimes(1);
  });

  it("shows the XP the play was saved with once the save is back, not the game's own", async () => {
    const saving = deferred<{ playId: string; xp: number }>();
    const deps = makeDeps({ savePlay: vi.fn<SongScreenDeps['savePlay']>().mockReturnValue(saving.promise) });
    await playToTheEnd(deps);

    expect(screen.getByText('…')).toBeInTheDocument();
    expect(screen.queryByText('+240')).not.toBeInTheDocument();

    await act(async () => saving.resolve({ playId: 'play-1', xp: 120 }));

    expect(screen.getByText('+120')).toBeInTheDocument();
    expect(screen.queryByText('+240')).not.toBeInTheDocument();
  });

  it('saves Karaokê too, and shows no ring or score', async () => {
    const savePlay = vi.fn<SongScreenDeps['savePlay']>().mockResolvedValue({ playId: 'play-1', xp: 0 });
    render(<SongScreen youtubeId={ID} deps={makeDeps({ savePlay })} />);
    await screen.findByRole('button', { name: 'Jogar' });
    pick('Karaokê');

    await finishGame({ totalBlanks: 0, firstTryCorrect: 0, pct: 0, maxCombo: 0, xp: 0 }, []);

    expect(savePlay).toHaveBeenCalledWith(expect.objectContaining({ mode: 'karaoke', records: [] }), false);
    expect(screen.queryByRole('img', { name: /de acerto/ })).not.toBeInTheDocument();
    expect(screen.getByText('Mandou bem!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jogar de novo' })).toBeInTheDocument();
  });

  describe('when the save fails', () => {
    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('still shows the result, and tries again on "Tentar salvar de novo"', async () => {
      const savePlay = vi
        .fn<SongScreenDeps['savePlay']>()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ playId: 'play-1', xp: 120 });
      await playToTheEnd(makeDeps({ savePlay }));

      expect(screen.getByRole('img', { name: '92% de acerto' })).toBeInTheDocument();
      expect(screen.getByText('Essa partida ainda não foi salva.')).toBeInTheDocument();

      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tentar salvar de novo' })));

      expect(savePlay).toHaveBeenCalledTimes(2);
      expect(savePlay).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'escolha', summary: SUMMARY }), true);
      expect(screen.queryByText('Essa partida ainda não foi salva.')).not.toBeInTheDocument();
      expect(screen.getByText('+120')).toBeInTheDocument();
    });

    it('saves the same play on retry, under the same id, so nothing is saved twice', async () => {
      const savePlay = vi
        .fn<SongScreenDeps['savePlay']>()
        .mockRejectedValueOnce(new Error('response lost'))
        .mockResolvedValueOnce({ playId: 'play-1', xp: 60 });
      await playToTheEnd(makeDeps({ savePlay }));

      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tentar salvar de novo' })));

      expect(savePlay.mock.calls[1][0].playId).toBe(savePlay.mock.calls[0][0].playId);
      expect(savePlay.mock.calls.map(([, retrying]) => retrying)).toEqual([false, true]);
      expect(screen.getByText('+60')).toBeInTheDocument();
    });
  });

  it('doubles the XP of the saved play, once', async () => {
    const deps = makeDeps();
    await playToTheEnd(deps);
    expect(screen.getByText('+120')).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Dobrar o XP · anúncio' })));

    expect(deps.doubleXp).toHaveBeenCalledTimes(1);
    expect(deps.doubleXp).toHaveBeenCalledWith('play-1');
    expect(screen.getByText('+240')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'XP dobrado' })).toBeInTheDocument();
  });

  it('plays the same mode and difficulty again on "Jogar de novo", saving that game too, with no time to get ready', async () => {
    const savePlay = vi
      .fn<SongScreenDeps['savePlay']>()
      .mockResolvedValueOnce({ playId: 'play-1', xp: 120 })
      .mockResolvedValueOnce({ playId: 'play-2', xp: 60 });
    await playToTheEnd(makeDeps({ savePlay }), 'Digitação', 'Difícil');

    fireEvent.click(screen.getByRole('button', { name: 'Jogar de novo' }));

    expect(screen.queryByRole('img', { name: '92% de acerto' })).not.toBeInTheDocument();
    expect(gameProps()).toMatchObject({
      mode: 'digitacao',
      difficulty: 'dificil',
      blanks: selectBlanks(LINES, 'dificil', ID),
      adapter: fake,
    });

    await finishGame();

    expect(savePlay).toHaveBeenCalledTimes(2);
    expect(savePlay).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'digitacao', difficulty: 'dificil', timeToReadyMs: null }),
      false,
    );
    // Another game, another play.
    expect(savePlay.mock.calls[1][0].playId).not.toBe(savePlay.mock.calls[0][0].playId);
    expect(screen.getByText('+60')).toBeInTheDocument();
  });

  it('forgets the answer of the save of the game before once the next one starts', async () => {
    const first = deferred<{ playId: string; xp: number }>();
    const savePlay = vi
      .fn<SongScreenDeps['savePlay']>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ playId: 'play-2', xp: 60 });
    await playToTheEnd(makeDeps({ savePlay }));
    fireEvent.click(screen.getByRole('button', { name: 'Jogar de novo' }));
    await finishGame();

    await act(async () => first.resolve({ playId: 'play-1', xp: 120 }));

    expect(screen.getByText('+60')).toBeInTheDocument();
    expect(screen.queryByText('+120')).not.toBeInTheDocument();
  });

  it('goes back to the modes of the same song on "Outro modo"', async () => {
    await playToTheEnd(makeDeps());

    fireEvent.click(screen.getByRole('button', { name: 'Outro modo' }));

    expect(screen.getByRole('radio', { name: 'Karaokê' })).toBeInTheDocument();
    expect(screen.getByText('Invented Song')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '92% de acerto' })).not.toBeInTheDocument();
  });

  it('goes to the home page on "Outra música"', async () => {
    await playToTheEnd(makeDeps());

    expect(screen.getByRole('link', { name: 'Outra música' })).toHaveAttribute('href', '/');
  });

  it('remembers that the player finished a song, for the install prompt', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });
    pick('Escolha');
    expect(localStorage.getItem(FIRST_FINISH_KEY)).toBeNull();

    await finishGame();

    expect(localStorage.getItem(FIRST_FINISH_KEY)).toBe('1');
  });

  it('carries on when the browser will not keep it (site data blocked)', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    await playToTheEnd(makeDeps());

    expect(screen.getByRole('img', { name: '92% de acerto' })).toBeInTheDocument();
  });
});

describe('SongScreen: the player lifetime', () => {
  it('destroys the player when the screen closes', async () => {
    const destroy = vi.spyOn(fake, 'destroy');
    const deps = makeDeps();
    const { unmount } = render(<SongScreen youtubeId={ID} deps={deps} />);
    await screen.findByRole('button', { name: 'Jogar' });
    const [el] = deps.createAdapter.mock.calls[0];

    unmount();

    expect(destroy).toHaveBeenCalledOnce();
    expect(el.isConnected).toBe(false);
  });

  it('destroys a player that gets ready after the screen closed, and asks for no lyrics', async () => {
    const player = deferred<PlayerAdapter>();
    const destroy = vi.spyOn(fake, 'destroy');
    const deps = makeDeps({ createAdapter: vi.fn<SongScreenDeps['createAdapter']>().mockReturnValue(player.promise) });
    const { unmount } = render(<SongScreen youtubeId={ID} deps={deps} />);

    unmount();
    await act(async () => player.resolve(fake));

    expect(destroy).toHaveBeenCalledOnce();
    expect(deps.resolve).not.toHaveBeenCalled();
  });

  it('leaves a single live player under StrictMode', async () => {
    const first = new FakePlayerAdapter(DURATION_MS);
    const second = new FakePlayerAdapter(DURATION_MS);
    const destroyFirst = vi.spyOn(first, 'destroy');
    const destroySecond = vi.spyOn(second, 'destroy');
    const firstReady = deferred<PlayerAdapter>();
    const secondReady = deferred<PlayerAdapter>();
    const deps = makeDeps({
      createAdapter: vi.fn<SongScreenDeps['createAdapter']>()
        .mockReturnValueOnce(firstReady.promise)
        .mockReturnValueOnce(secondReady.promise),
    });
    render(
      <StrictMode>
        <SongScreen youtubeId={ID} deps={deps} />
      </StrictMode>,
    );

    expect(deps.createAdapter).toHaveBeenCalledTimes(2);
    const [firstEl] = deps.createAdapter.mock.calls[0];
    const [secondEl] = deps.createAdapter.mock.calls[1];
    expect(firstEl.isConnected).toBe(false);
    expect(screen.getByTestId('player').contains(secondEl)).toBe(true);

    await act(async () => {
      firstReady.resolve(first);
      secondReady.resolve(second);
    });
    await screen.findByRole('button', { name: 'Jogar' });

    expect(destroyFirst).toHaveBeenCalledOnce();
    expect(destroySecond).not.toHaveBeenCalled();
    expect(deps.resolve).toHaveBeenCalledOnce();
    pick('Escolha');
    expect(gameProps().adapter).toBe(second);
  });

  it('stops listening to the player when it closes', async () => {
    const unsubscribed = vi.fn();
    const subscribeErrors = fake.onError.bind(fake);
    const subscribeStates = fake.onState.bind(fake);
    vi.spyOn(fake, 'onError').mockImplementation((cb) => {
      const off = subscribeErrors(cb);
      return () => {
        unsubscribed('error');
        off();
      };
    });
    vi.spyOn(fake, 'onState').mockImplementation((cb) => {
      const off = subscribeStates(cb);
      return () => {
        unsubscribed('state');
        off();
      };
    });
    const { unmount } = render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    unmount();

    expect(unsubscribed).toHaveBeenCalledWith('error');
    expect(unsubscribed).toHaveBeenCalledWith('state');
  });
});

describe('SongScreen: the translation of the whole song', () => {
  /** A translation of the song that never ends, as one on its way. */
  const ON_ITS_WAY: SongTranslation = {
    getSnapshot: () => ({ lines: new Map(), settled: false }),
    subscribe: () => () => {},
    line: () => new Promise(() => {}),
  };

  function translating() {
    return vi.fn<NonNullable<SongScreenDeps['translateSong']>>(() => ON_ITS_WAY);
  }

  it('is asked for in the background as soon as the lyrics are known, before any tap, and the picker does not wait', async () => {
    const translateSong = translating();
    render(<SongScreen youtubeId={ID} deps={makeDeps({ translateSong })} />);

    expect(await screen.findByRole('button', { name: 'Jogar' })).toBeInTheDocument();
    expect(translateSong).toHaveBeenCalledExactlyOnceWith(ID, '777');
  });

  it('is asked for while the calibration is open, too', async () => {
    const translateSong = translating();
    render(<SongScreen youtubeId={ID} deps={makeDeps({ translateSong, resolve: vi.fn().mockResolvedValue(NEEDS_CALIBRATION) })} />);

    expect(await screen.findByRole('button', { name: 'Começou!' })).toBeInTheDocument();
    expect(translateSong).toHaveBeenCalledExactlyOnceWith(ID, '777');
  });

  it('is not asked for before the lyrics are known', async () => {
    const lyrics = deferred<SongResolution>();
    const translateSong = translating();
    const deps = makeDeps({ translateSong, resolve: vi.fn<SongScreenDeps['resolve']>().mockReturnValue(lyrics.promise) });
    render(<SongScreen youtubeId={ID} deps={deps} />);

    await waitFor(() => expect(deps.resolve).toHaveBeenCalled());

    expect(translateSong).not.toHaveBeenCalled();
  });

  it.each([
    ['no lyrics', { status: 'no_lyrics', video: { ...VIDEO, status: 'no_lyrics' } }],
    ['a lyrics service that is slow', { status: 'lyrics_unavailable' }],
    ['lyrics with no line in them', { ...READY, lines: [] }],
  ] as const)('is not asked for a song with %s', async (_name, resolution) => {
    const translateSong = translating();
    render(<SongScreen youtubeId={ID} deps={makeDeps({ translateSong, resolve: vi.fn().mockResolvedValue(resolution) })} />);

    await waitFor(() => expect(screen.queryByText('Procurando a letra...')).not.toBeInTheDocument());

    expect(translateSong).not.toHaveBeenCalled();
  });

  it('is handed to the game screen, the same one through the round, "Jogar de novo" and another mode', async () => {
    const translateSong = translating();
    render(<SongScreen youtubeId={ID} deps={makeDeps({ translateSong })} />);
    await screen.findByRole('button', { name: 'Jogar' });

    pick('Escolha');
    expect(gameProps().songTranslation).toBe(ON_ITS_WAY);
    await finishGame();
    fireEvent.click(screen.getByRole('button', { name: 'Jogar de novo' }));

    expect(gameProps().songTranslation).toBe(ON_ITS_WAY);
    expect(translateSong).toHaveBeenCalledOnce();
  });

  it('never stands in the way of the song when asking for it fails at once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const translateSong = vi.fn<NonNullable<SongScreenDeps['translateSong']>>(() => {
      throw new Error('no fetch here');
    });
    render(<SongScreen youtubeId={ID} deps={makeDeps({ translateSong })} />);

    expect(await screen.findByRole('button', { name: 'Jogar' })).toBeInTheDocument();
    pick('Escolha');
    expect(gameProps().songTranslation).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('is left out, and the game asks line by line, when the screen is given no way to ask for it', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });

    pick('Escolha');

    expect(gameProps().songTranslation).toBeNull();
  });
});
