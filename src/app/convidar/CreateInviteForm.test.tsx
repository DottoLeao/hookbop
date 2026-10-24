import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Activity } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/metrics/track';
import { createInviteAction } from './actions';
import { CreateInviteForm } from './CreateInviteForm';

vi.mock('./actions', () => ({ createInviteAction: vi.fn() }));

const create = () => fireEvent.click(screen.getByRole('button', { name: 'Criar convite' }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('CreateInviteForm', () => {
  it('has one button, which makes one invite per press', async () => {
    vi.mocked(createInviteAction).mockResolvedValue({ failed: false });
    render(<CreateInviteForm />);

    create();

    await waitFor(() => expect(createInviteAction).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('is busy until the invite exists, so a double tap does not make two', async () => {
    let finish: (state: { failed: boolean }) => void = () => {};
    vi.mocked(createInviteAction).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<CreateInviteForm />);

    create();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Criar convite' })).toBeDisabled());

    finish({ failed: false });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Criar convite' })).toBeEnabled());
    expect(createInviteAction).toHaveBeenCalledOnce();
  });

  it('says it did not work when the invite could not be made', async () => {
    vi.mocked(createInviteAction).mockResolvedValue({ failed: true });
    render(<CreateInviteForm />);

    create();

    expect(await screen.findByRole('alert')).toHaveTextContent('Não rolou. Tenta de novo?');
  });

  describe('invite_created, for the owner’s panel', () => {
    it('is tracked once the invite exists, and not before', async () => {
      let finish: (state: { failed: boolean }) => void = () => {};
      vi.mocked(createInviteAction).mockReturnValue(new Promise((resolve) => (finish = resolve)));
      render(<CreateInviteForm />);
      expect(track).not.toHaveBeenCalled();

      create();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Criar convite' })).toBeDisabled());
      expect(track).not.toHaveBeenCalled();

      finish({ failed: false });

      await waitFor(() => expect(track).toHaveBeenCalledExactlyOnceWith('invite_created'));
    });

    it('is tracked for each invite made', async () => {
      vi.mocked(createInviteAction).mockImplementation(async () => ({ failed: false }));
      render(<CreateInviteForm />);

      create();
      await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Criar convite' })).toBeEnabled());
      create();

      await waitFor(() => expect(track).toHaveBeenCalledTimes(2));
      expect(vi.mocked(track).mock.calls).toEqual([['invite_created'], ['invite_created']]);
    });

    it('is not tracked again when the page is hidden and shown again: Next keeps the route it left in an Activity', async () => {
      vi.mocked(createInviteAction).mockImplementation(async () => ({ failed: false }));
      const page = (mode: 'visible' | 'hidden') => (
        <Activity mode={mode}>
          <CreateInviteForm />
        </Activity>
      );
      const { rerender } = render(page('visible'));
      create();
      await waitFor(() => expect(track).toHaveBeenCalledTimes(1));

      // To the home page and Back: the form keeps its state, and its effects are cleaned up and made again.
      rerender(page('hidden'));
      rerender(page('visible'));
      expect(track).toHaveBeenCalledTimes(1);

      // An invite made after that still counts.
      await waitFor(() => expect(screen.getByRole('button', { name: 'Criar convite' })).toBeEnabled());
      create();
      await waitFor(() => expect(track).toHaveBeenCalledTimes(2));
    });

    it('is not tracked when the invite could not be made', async () => {
      vi.mocked(createInviteAction).mockResolvedValue({ failed: true });
      render(<CreateInviteForm />);

      create();

      await screen.findByRole('alert');
      expect(track).not.toHaveBeenCalled();
    });
  });
});
