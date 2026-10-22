import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { selectBlanks } from '@/lib/game/blanks';
import { selectTileLines } from '@/lib/game/tiles';
import { applyOffset, parseLrc } from '@/lib/lyrics/lrc';
import type { SongResolution, SongStore, VideoRecord } from '@/lib/lyrics/resolveSong';
import type { PlayerAdapter } from '@/lib/player/adapter';
import { FakePlayerAdapter } from '@/lib/player/fakeAdapter';
import { PlayerLoadError } from '@/lib/player/youtubeAdapter';
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
  store: { getVideo: Mock<SongStore['getVideo']>; upsertVideo: Mock<SongStore['upsertVideo']> };
  saveOffsetVote: Mock<SongScreenDeps['saveOffsetVote']>;
  savePlay: Mock<SongScreenDeps['savePlay']>;
  doubleXp: Mock<SongScreenDeps['doubleXp']>;
  sleep: Mock<NonNullable<SongScreenDeps['sleep']>>;
  now?: () => number;
}

function makeDeps(over: Partial<MockDeps> = {}): MockDeps {
  return {
    createAdapter: vi.fn<SongScreenDeps['createAdapter']>().mockResolvedValue(fake),
    resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(READY),
    store: {
      getVideo: vi.fn<SongStore['getVideo']>().mockResolvedValue(null),
      upsertVideo: vi.fn<SongStore['upsertVideo']>().mockResolvedValue(undefined),
    },
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

  it('starts the player on an element of its own inside the player box, then resolves with its duration', async () => {
    const deps = makeDeps();
    render(<SongScreen youtubeId={ID} deps={deps} />);

    expect(deps.createAdapter).toHaveBeenCalledOnce();
    const [el, id] = deps.createAdapter.mock.calls[0];
    expect(id).toBe(ID);
    const box = screen.getByTestId('player');
    expect(el).not.toBe(box);
    expect(box.contains(el)).toBe(true);

    await waitFor(() => expect(deps.resolve).toHaveBeenCalledExactlyOnceWith(ID, 213, deps.store));
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

    await waitFor(() => expect(deps.resolve).toHaveBeenCalledExactlyOnceWith(ID, 213, deps.store));
    expect(deps.sleep).toHaveBeenCalledTimes(2);
    expect(deps.sleep).toHaveBeenCalledWith(100);
  });

  it('gives up after 3 s and resolves with 0 s through a store that never saves', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(fake, 'getDurationMs').mockReturnValue(0);
    const saved = { ...VIDEO, durationS: 0 };
    const deps = makeDeps();
    deps.store.getVideo.mockResolvedValue(VIDEO);
    deps.resolve.mockImplementation(async (_id, _durationS, store) => {
      expect(await store.getVideo(ID)).toBe(VIDEO);
      await store.upsertVideo(saved);
      return NEEDS_CALIBRATION;
    });
    render(<SongScreen youtubeId={ID} deps={deps} />);

    // No calibration for a duration nobody knows: straight to the modes.
    expect(await screen.findByRole('button', { name: 'Jogar' })).toBeInTheDocument();
    expect(deps.sleep).toHaveBeenCalledTimes(30);
    expect(deps.resolve).toHaveBeenCalledOnce();
    const [id, durationS, store] = deps.resolve.mock.calls[0];
    expect([id, durationS]).toEqual([ID, 0]);
    expect(store).not.toBe(deps.store);
    expect(deps.store.getVideo).toHaveBeenCalledExactlyOnceWith(ID);
    expect(deps.store.upsertVideo).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
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
    expect(deps.resolve).toHaveBeenLastCalledWith(ID, 213, deps.store);
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

describe('SongScreen: the end of a song', () => {
  beforeEach(() => {
    localStorage.clear();
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
    expect(localStorage.getItem('hb_first_finish')).toBeNull();

    await finishGame();

    expect(localStorage.getItem('hb_first_finish')).toBe('1');
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
