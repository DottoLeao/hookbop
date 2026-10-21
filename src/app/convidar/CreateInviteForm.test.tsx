import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
