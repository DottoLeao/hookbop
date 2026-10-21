import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FakePlayerAdapter } from '@/lib/player/fakeAdapter';
import { CalibrationSheet } from './CalibrationSheet';

const ID = 'dQw4w9WgXcQ';
const FIRST_LINE = { text: "Please don't let me down", startMs: 300 };
const AUDIO_SEARCH = `https://www.youtube.com/results?search_query=${encodeURIComponent('The Beatles Let It Be official audio')}`;

function setup(saveOffsetVote = vi.fn<(id: string, offsetMs: number) => Promise<number>>().mockResolvedValue(25700)) {
  const adapter = new FakePlayerAdapter(213000);
  adapter.seekTo(26000);
  const onSaved = vi.fn();
  const onSkip = vi.fn();
  render(
    <CalibrationSheet
      youtubeId={ID}
      adapter={adapter}
      firstLine={FIRST_LINE}
      audioSearchUrl={AUDIO_SEARCH}
      saveOffsetVote={saveOffsetVote}
      onSaved={onSaved}
      onSkip={onSkip}
    />,
  );
  return { adapter, saveOffsetVote, onSaved, onSkip };
}

function tap(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('CalibrationSheet', () => {
  it('shows the first line to listen for', () => {
    setup();

    expect(screen.getByText(/Please don't let me down/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Começou!' })).toBeEnabled();
  });

  it('saves the player time minus the first line start, then hands over the new median', async () => {
    const { saveOffsetVote, onSaved } = setup(vi.fn().mockResolvedValue(25000));

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

  it('says so when saving fails, and lets the player try again', async () => {
    const saveOffsetVote = vi.fn<(id: string, offsetMs: number) => Promise<number>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(25700);
    const { onSaved } = setup(saveOffsetVote);

    tap('Começou!');
    tap('Salvar');

    expect(await screen.findByText('Não rolou salvar. Tenta de novo?')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();

    tap('Salvar');

    await waitFor(() => expect(onSaved).toHaveBeenCalledExactlyOnceWith(25700));
    expect(saveOffsetVote).toHaveBeenCalledTimes(2);
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
