import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { removeMemberAction } from './actions';
import { RemoveMemberForm } from './RemoveMemberForm';

vi.mock('./actions', () => ({ removeMemberAction: vi.fn() }));

const MEMBER_ID = '3f2b6c1e-8a4d-4e2b-9c7a-1d5e6f708192';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('RemoveMemberForm', () => {
  it('sends the id of that member, and its button says whom it removes', async () => {
    vi.mocked(removeMemberAction).mockResolvedValue({ failed: false });
    render(<RemoveMemberForm userId={MEMBER_ID} name="Joana" />);

    const button = screen.getByRole('button', { name: 'Remover Joana' });
    expect(button).toHaveTextContent(/^Remover$/);
    fireEvent.click(button);

    await waitFor(() => expect(removeMemberAction).toHaveBeenCalledOnce());
    const [, formData] = vi.mocked(removeMemberAction).mock.calls[0];
    expect(formData.get('userId')).toBe(MEMBER_ID);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says it did not work when the member could not be removed', async () => {
    vi.mocked(removeMemberAction).mockResolvedValue({ failed: true });
    render(<RemoveMemberForm userId={MEMBER_ID} name="Joana" />);

    fireEvent.click(screen.getByRole('button', { name: 'Remover Joana' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não rolou. Tenta de novo?');
  });
});
