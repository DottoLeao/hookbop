import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FADE_IN_MS } from '@/lib/game/timing';
import { FakePlayerAdapter } from '@/lib/player/fakeAdapter';
import { CalibrationSheet } from './CalibrationSheet';

const ID = 'dQw4w9WgXcQ';
const FIRST_LINE = { text: "Grandpa won't let geese drive", startMs: 300 };
const AUDIO_SEARCH = `https://www.youtube.com/results?search_query=${encodeURIComponent('The Paper Lanterns Neon Harbor official audio')}`;

type Save = (id: string, offsetMs: number) => Promise<number>;

function setup({
  saveOffsetVote = vi.fn<Save>().mockResolvedValue(25700),
  playerStarted = true,
  firstLine = FIRST_LINE,
}: { saveOffsetVote?: Save; playerStarted?: boolean; firstLine?: { text: string; startMs: number } } = {}) {
  const adapter = new FakePlayerAdapter(213000);
  adapter.seekTo(26000);
  const onSaved = vi.fn();
  const onSkip = vi.fn();
  const props = {
    youtubeId: ID,
    adapter,
    firstLine,
    audioSearchUrl: AUDIO_SEARCH,
    saveOffsetVote,
    onSaved,
    onSkip,
  };
  const { rerender } = render(<CalibrationSheet {...props} playerStarted={playerStarted} />);
  return {
    adapter,
    saveOffsetVote,
    onSaved,
    onSkip,
    start: () => rerender(<CalibrationSheet {...props} playerStarted />),
  };
}

function tap(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CalibrationSheet: a player an earlier round left muted', () => {
  function sheetOn(adapter: FakePlayerAdapter) {
    return render(
      <CalibrationSheet
        youtubeId={ID}
        adapter={adapter}
        playerStarted
        firstLine={FIRST_LINE}
        audioSearchUrl={AUDIO_SEARCH}
        saveOffsetVote={vi.fn<Save>()}
        onSaved={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('brings the volume back up, so the first line can be heard when the player presses play', () => {
    vi.useFakeTimers();
    const adapter = new FakePlayerAdapter(213000);
    adapter.setVolume(0);

    sheetOn(adapter);
    act(() => vi.advanceTimersByTime(FADE_IN_MS));

    expect(adapter.getVolume()).toBe(100);
  });

  it('puts the volume straight back, and leaves no timer, when the sheet goes away mid-fade', () => {
    vi.useFakeTimers();
    const adapter = new FakePlayerAdapter(213000);
    adapter.setVolume(0);
    const { unmount } = sheetOn(adapter);
    act(() => vi.advanceTimersByTime(FADE_IN_MS / 2));
    expect(adapter.getVolume()).toBeLessThan(100);
    adapter.calls.length = 0;

    unmount();
    act(() => vi.advanceTimersByTime(FADE_IN_MS));

    expect(adapter.calls).toEqual(['volume:100']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves a volume the player lowered itself alone', () => {
    vi.useFakeTimers();
    const adapter = new FakePlayerAdapter(213000);
    adapter.setVolume(40);
    adapter.calls.length = 0;

    sheetOn(adapter);
    act(() => vi.advanceTimersByTime(FADE_IN_MS));

    expect(adapter.calls).toEqual([]);
  });

  it('leaves a player at full volume alone', () => {
    vi.useFakeTimers();
    const adapter = new FakePlayerAdapter(213000);

    sheetOn(adapter);
    act(() => vi.advanceTimersByTime(FADE_IN_MS));

    expect(adapter.calls).toEqual([]);
  });
});

describe('CalibrationSheet', () => {
  it('shows the first line to listen for', () => {
    setup();

    expect(screen.getByText(/Grandpa won't let geese drive/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Começou!' })).toBeEnabled();
  });

  it('keeps Começou! off until the player has played, so a paused clip cannot be voted', () => {
    const { start } = setup({ playerStarted: false });

    expect(screen.getByRole('button', { name: 'Começou!' })).toBeDisabled();

    start();

    expect(screen.getByRole('button', { name: 'Começou!' })).toBeEnabled();
  });

  it('saves the player time minus the first line start, then hands over the new median', async () => {
    const { saveOffsetVote, onSaved } = setup({ saveOffsetVote: vi.fn<Save>().mockResolvedValue(25000) });

    tap('Começou!');
    tap('Salvar');

    expect(saveOffsetVote).toHaveBeenCalledExactlyOnceWith(ID, 25700);
    await waitFor(() => expect(onSaved).toHaveBeenCalledExactlyOnceWith(25000));
  });

  it('shows the offset it measured', () => {
    setup();

    tap('Começou!');

    expect(screen.getByRole('status')).toHaveTextContent('+25,7 s');
  });

  it('moves the offset by 0.5 s with −0,5 s and +0,5 s before saving', () => {
    const { saveOffsetVote } = setup();

    tap('Começou!');
    tap('+0,5 s');
    tap('+0,5 s');
    tap('−0,5 s');
    expect(screen.getByRole('status')).toHaveTextContent('+26,2 s');
    tap('Salvar');

    expect(saveOffsetVote).toHaveBeenCalledExactlyOnceWith(ID, 26200);
  });

  it('can go below the measured value and below zero', () => {
    const { adapter, saveOffsetVote } = setup();
    adapter.seekTo(0);

    tap('Começou!');
    tap('−0,5 s');
    expect(screen.getByRole('status')).toHaveTextContent('−0,8 s');
    tap('Salvar');

    expect(saveOffsetVote).toHaveBeenCalledExactlyOnceWith(ID, -800);
  });

  it('reads the player again when Começou! is tapped again', () => {
    const { adapter, saveOffsetVote } = setup();

    tap('Começou!');
    adapter.seekTo(27000);
    tap('Começou!');
    tap('Salvar');

    expect(saveOffsetVote).toHaveBeenCalledExactlyOnceWith(ID, 26700);
  });

  it('cannot save or nudge before Começou!', () => {
    setup();

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '−0,5 s' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+0,5 s' })).toBeDisabled();
  });

  it('sends one vote for a double tap on Salvar', async () => {
    const { saveOffsetVote, onSaved } = setup();

    tap('Começou!');
    tap('Salvar');
    tap('Salvar');

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(saveOffsetVote).toHaveBeenCalledOnce();
  });

  it('says so when saving fails, logs why, and lets the player try again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failure = new Error('offline');
    const saveOffsetVote = vi.fn<Save>().mockRejectedValueOnce(failure).mockResolvedValueOnce(25700);
    const { onSaved } = setup({ saveOffsetVote });

    tap('Começou!');
    tap('Salvar');

    expect(await screen.findByText('Não rolou salvar. Tenta de novo?')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.any(String), failure);

    tap('Salvar');

    await waitFor(() => expect(onSaved).toHaveBeenCalledExactlyOnceWith(25700));
    expect(saveOffsetVote).toHaveBeenCalledTimes(2);
  });

  describe('an offset past 120 s either way, which the database would refuse', () => {
    const TOO_FAR = 'Esse ajuste passou do meu limite. De novo?';

    it('is not sent: a calm line takes the place of the save, and the player can measure again', async () => {
      const { adapter, saveOffsetVote, onSaved } = setup();
      adapter.seekTo(130000);

      tap('Começou!');
      expect(screen.getByRole('status')).toHaveTextContent('+129,7 s');
      tap('Salvar');

      expect(screen.getByText(TOO_FAR)).toBeInTheDocument();
      expect(saveOffsetVote).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
      expect(screen.queryByText('Não rolou salvar. Tenta de novo?')).not.toBeInTheDocument();

      adapter.seekTo(26000);
      tap('Começou!');
      expect(screen.queryByText(TOO_FAR)).not.toBeInTheDocument();
      tap('Salvar');

      expect(saveOffsetVote).toHaveBeenCalledExactlyOnceWith(ID, 25700);
      await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    });

    it('is not sent below −120 s either, and the player can still skip', () => {
      const { adapter, saveOffsetVote, onSkip } = setup({ firstLine: { text: FIRST_LINE.text, startMs: 125000 } });
      adapter.seekTo(3000);

      tap('Começou!');
      expect(screen.getByRole('status')).toHaveTextContent('−122,0 s');
      tap('Salvar');

      expect(screen.getByText(TOO_FAR)).toBeInTheDocument();
      expect(saveOffsetVote).not.toHaveBeenCalled();

      tap('Pular');

      expect(onSkip).toHaveBeenCalledOnce();
    });

    it.each([
      ['+120 s', 120300, 120000],
      ['−120 s', 5000, -120000],
    ])('still sends exactly %s', (_name, playerMs, expected) => {
      const { adapter, saveOffsetVote } = setup({
        firstLine: { text: FIRST_LINE.text, startMs: playerMs === 5000 ? 125000 : FIRST_LINE.startMs },
      });
      adapter.seekTo(playerMs);

      tap('Começou!');
      tap('Salvar');

      expect(screen.queryByText(TOO_FAR)).not.toBeInTheDocument();
      expect(saveOffsetVote).toHaveBeenCalledExactlyOnceWith(ID, expected);
    });

    it('lets a nudge bring it back in range, and the line goes away', () => {
      const { adapter, saveOffsetVote } = setup();
      adapter.seekTo(120600);

      tap('Começou!');
      tap('Salvar');
      expect(screen.getByText(TOO_FAR)).toBeInTheDocument();

      tap('−0,5 s');
      expect(screen.queryByText(TOO_FAR)).not.toBeInTheDocument();
      tap('Salvar');

      expect(saveOffsetVote).toHaveBeenCalledExactlyOnceWith(ID, 119800);
    });

    it('replaces the line of an earlier failed save instead of stacking on it', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const saveOffsetVote = vi.fn<Save>().mockRejectedValueOnce(new Error('offline'));
      const { adapter } = setup({ saveOffsetVote });

      tap('Começou!');
      tap('Salvar');
      expect(await screen.findByText('Não rolou salvar. Tenta de novo?')).toBeInTheDocument();
      expect(warn).toHaveBeenCalledOnce();

      adapter.seekTo(130000);
      tap('Começou!');
      tap('Salvar');

      expect(screen.getByText(TOO_FAR)).toBeInTheDocument();
      expect(screen.queryByText('Não rolou salvar. Tenta de novo?')).not.toBeInTheDocument();
    });

    it('follows the voice rules: 8 words at most, and it never blames the player', () => {
      const { adapter } = setup();
      adapter.seekTo(130000);

      tap('Começou!');
      tap('Salvar');

      const line = screen.getByText(TOO_FAR);
      expect(line.textContent!.trim().split(/\s+/).length).toBeLessThanOrEqual(8);
      expect(line).not.toHaveClass('text-error');
      expect(line.textContent).not.toMatch(/errad|erro|culpa|você/i);
    });
  });

  it('lets the player skip it', () => {
    const { onSkip, saveOffsetVote } = setup();

    tap('Pular');

    expect(onSkip).toHaveBeenCalledOnce();
    expect(saveOffsetVote).not.toHaveBeenCalled();
  });

  it('offers the official audio version in a new tab', () => {
    setup();

    const link = screen.getByRole('link', { name: 'Trocar para a versão áudio oficial' });
    expect(link).toHaveAttribute('href', AUDIO_SEARCH);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
