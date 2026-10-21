import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { selectBlanks } from '@/lib/game/blanks';
import { selectTileLines } from '@/lib/game/tiles';
import { applyOffset } from '@/lib/lyrics/lrc';
import type { SongResolution, VideoRecord } from '@/lib/lyrics/resolveSong';
import type { PlayerAdapter } from '@/lib/player/adapter';
import { FakePlayerAdapter } from '@/lib/player/fakeAdapter';
import { PlayerLoadError } from '@/lib/player/youtubeAdapter';
import type { LyricLine } from '@/lib/types';
import { GameScreen } from './GameScreen';
import { SongScreen, type SongScreenDeps } from './SongScreen';

// The real game screen comes in a later task; here it only records what it was given.
vi.mock('./GameScreen', () => ({
  GameScreen: vi.fn(() => <div data-testid="game-screen" />),
}));

const ID = 'dQw4w9WgXcQ';
const DURATION_MS = 213000;

const LINES: LyricLine[] = [
  { index: 0, startMs: 300, endMs: 3300, text: "Please don't let me down" },
  { index: 1, startMs: 3300, endMs: 6300, text: 'I gave you everything I had' },
  { index: 2, startMs: 6300, endMs: 9300, text: 'And every street looks the same to me' },
  { index: 3, startMs: 9300, endMs: 12300, text: 'Hold on to your heart tonight' },
  { index: 4, startMs: 12300, endMs: 15300, text: "We're gonna dance until the morning" },
  { index: 5, startMs: 15300, endMs: 18300, text: 'Tell me what you want from me' },
];

const VIDEO: VideoRecord = {
  youtubeId: ID,
  title: 'The Beatles - Let It Be (Official Video)',
  channel: 'TheBeatlesVEVO',
  durationS: 213,
  ytFetchedAt: '2026-10-21T12:00:00.000Z',
  status: 'ok',
  lyricsSource: 'lrclib',
  lyricsRef: '777',
  lyricsLrc: '[00:00.30]Please don’t let me down',
  lyricsDurationS: 200,
  offsetMs: 0,
};

const READY: SongResolution = { status: 'ready', video: VIDEO, lines: LINES, needsCalibration: false };
const NEEDS_CALIBRATION: SongResolution = { ...READY, needsCalibration: true };

const AUDIO_SEARCH = `https://www.youtube.com/results?search_query=${encodeURIComponent('The Beatles Let It Be official audio')}`;

const SLOW = 'O banco de letras tá lento. Tenta de novo?';
const CANNOT_EMBED = 'Esse clipe não toca fora do YouTube.';

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
}

function makeDeps(over: Partial<MockDeps> = {}): MockDeps {
  return {
    createAdapter: vi.fn<SongScreenDeps['createAdapter']>().mockResolvedValue(fake),
    resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(READY),
    saveOffsetVote: vi.fn<SongScreenDeps['saveOffsetVote']>().mockResolvedValue(0),
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

beforeEach(() => {
  fake = new FakePlayerAdapter(DURATION_MS);
  vi.mocked(GameScreen).mockClear();
});

describe('SongScreen: loading', () => {
  it('shows DJ Bop looking for the lyrics while the player and the lyrics load', async () => {
    const lyrics = deferred<SongResolution>();
    const deps = makeDeps({ resolve: vi.fn().mockReturnValue(lyrics.promise) });
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

    await waitFor(() => expect(deps.resolve).toHaveBeenCalledExactlyOnceWith(ID, 213));
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
    warn.mockRestore();
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
      const deps = makeDeps({ createAdapter: vi.fn().mockRejectedValue(new PlayerLoadError(reason)) });
      render(<SongScreen youtubeId={ID} deps={deps} />);

      expect(await screen.findByText(CANNOT_EMBED)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Colar outro link' })).toHaveAttribute('href', '/');
      expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
      expect(deps.resolve).not.toHaveBeenCalled();
    },
  );

  it('offers a new player when the player failed for another reason', async () => {
    const deps = makeDeps({
      createAdapter: vi.fn<SongScreenDeps['createAdapter']>()
        .mockRejectedValueOnce(new PlayerLoadError('other'))
        .mockResolvedValueOnce(fake),
    });
    render(<SongScreen youtubeId={ID} deps={deps} />);

    expect(await screen.findByText(CANNOT_EMBED)).toBeInTheDocument();
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
    const deps = makeDeps({ createAdapter: vi.fn().mockRejectedValue(new Error('boom')) });
    render(<SongScreen youtubeId={ID} deps={deps} />);

    expect(await screen.findByText(CANNOT_EMBED)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('button', { name: 'Jogar' })).toBeInTheDocument();
    expect(destroy).toHaveBeenCalledOnce();
    pick('Escolha');
    expect(gameProps().adapter).toBe(second);
  });

  it('says so when YouTube no longer knows the video', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps({ resolve: vi.fn().mockResolvedValue({ status: 'video_unavailable' }) })} />);

    expect(await screen.findByText(CANNOT_EMBED)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Colar outro link' })).toHaveAttribute('href', '/');
  });
});

describe('SongScreen: no lyrics', () => {
  it('says there are no lyrics yet and offers to search for the official audio in a new tab', async () => {
    render(
      <SongScreen youtubeId={ID} deps={makeDeps({ resolve: vi.fn().mockResolvedValue({ status: 'no_lyrics', video: { ...VIDEO, status: 'no_lyrics' } }) })} />,
    );

    expect(await screen.findByText('Ainda não temos a letra dessa.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Procurar a versão áudio oficial' });
    expect(link).toHaveAttribute('href', AUDIO_SEARCH);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Colar outro link' })).toHaveAttribute('href', '/');
  });

  it('treats lyrics without a single line as no lyrics', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps({ resolve: vi.fn().mockResolvedValue({ ...READY, lines: [] }) })} />);

    expect(await screen.findByText('Ainda não temos a letra dessa.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jogar' })).not.toBeInTheDocument();
  });
});

describe('SongScreen: calibration', () => {
  it('asks for a calibration when the video is much longer than the lyrics, with the official audio link', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps({ resolve: vi.fn().mockResolvedValue(NEEDS_CALIBRATION) })} />);

    expect(await screen.findByRole('button', { name: 'Começou!' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jogar' })).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Trocar para a versão áudio oficial' });
    expect(link).toHaveAttribute('href', AUDIO_SEARCH);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('saves the vote, moves the lines to the new median and goes on to the mode picker', async () => {
    const deps = makeDeps({
      resolve: vi.fn().mockResolvedValue(NEEDS_CALIBRATION),
      saveOffsetVote: vi.fn().mockResolvedValue(25500),
    });
    render(<SongScreen youtubeId={ID} deps={deps} />);
    await screen.findByRole('button', { name: 'Começou!' });

    fake.seekTo(26000);
    fireEvent.click(screen.getByRole('button', { name: 'Começou!' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(deps.saveOffsetVote).toHaveBeenCalledExactlyOnceWith(ID, 25700);
    await screen.findByRole('button', { name: 'Jogar' });
    pick('Escolha');
    expect(gameProps().lines).toEqual(applyOffset(LINES, 25500));
    expect(gameProps().video.offsetMs).toBe(25500);
  });

  it('measures from the lyrics as written when an offset was already applied', async () => {
    const shifted = applyOffset(LINES, 1000);
    const deps = makeDeps({
      resolve: vi.fn().mockResolvedValue({ ...NEEDS_CALIBRATION, video: { ...VIDEO, offsetMs: 1000 }, lines: shifted }),
      saveOffsetVote: vi.fn().mockResolvedValue(25700),
    });
    render(<SongScreen youtubeId={ID} deps={deps} />);
    await screen.findByRole('button', { name: 'Começou!' });

    fake.seekTo(26000);
    fireEvent.click(screen.getByRole('button', { name: 'Começou!' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(deps.saveOffsetVote).toHaveBeenCalledExactlyOnceWith(ID, 25700);
    await screen.findByRole('button', { name: 'Jogar' });
    pick('Escolha');
    expect(gameProps().lines).toEqual(applyOffset(LINES, 25700));
  });

  it('goes on with the lines as they are when the player skips it', async () => {
    const deps = makeDeps({ resolve: vi.fn().mockResolvedValue(NEEDS_CALIBRATION) });
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
    expect(screen.getByText('Let It Be')).toBeInTheDocument();
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
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
    const deps = { ...makeDeps({ resolve: vi.fn().mockReturnValue(lyrics.promise) }), now: () => clock };
    render(<SongScreen youtubeId={ID} deps={deps} />);
    await waitFor(() => expect(deps.resolve).toHaveBeenCalled());

    clock = 3500;
    await act(async () => lyrics.resolve(READY));
    clock = 9000; // time spent choosing a mode does not count
    pick('Escolha');

    expect(gameProps().timeToReadyMs).toBe(2500);
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
    const deps = makeDeps({ createAdapter: vi.fn().mockReturnValue(player.promise) });
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

  it('stops listening to the player errors when it closes', async () => {
    const unsubscribed = vi.fn();
    const subscribe = fake.onError.bind(fake);
    vi.spyOn(fake, 'onError').mockImplementation((cb) => {
      const off = subscribe(cb);
      return () => {
        unsubscribed();
        off();
      };
    });
    const { unmount } = render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    await screen.findByRole('button', { name: 'Jogar' });
    expect(fake.onError).toHaveBeenCalledOnce();

    unmount();

    expect(unsubscribed).toHaveBeenCalledOnce();
  });
});
