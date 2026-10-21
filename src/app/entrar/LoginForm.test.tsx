import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './LoginForm';

const signInWithOAuth = vi.fn();
const signInWithOtp = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabase: () => ({ auth: { signInWithOAuth, signInWithOtp } }),
}));

const CALLBACK = 'http://localhost:3000/auth/callback';

function sendLink(email: string) {
  fireEvent.change(screen.getByLabelText('Seu e-mail'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Receber link por e-mail' }));
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('offers Google and an e-mail link', () => {
    render(<LoginForm />);

    expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receber link por e-mail' })).toBeInTheDocument();
    expect(screen.getByLabelText('Seu e-mail')).toHaveAttribute('type', 'email');
  });

  it('sends Google sign-in back to the callback route', async () => {
    render(<LoginForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }));

    await waitFor(() =>
      expect(signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: CALLBACK } }),
    );
  });

  it('asks for a magic link that returns to the callback route, then says it was sent', async () => {
    render(<LoginForm />);

    sendLink('  ana@example.com ');

    await waitFor(() =>
      expect(signInWithOtp).toHaveBeenCalledWith({
        email: 'ana@example.com',
        options: { emailRedirectTo: CALLBACK },
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Link enviado! Confere seu e-mail.');
  });

  it('says so when the link could not be sent', async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: { message: 'rate limit' } });
    render(<LoginForm />);

    sendLink('ana@example.com');

    expect(await screen.findByRole('alert')).toHaveTextContent('Não rolou. Tenta de novo?');
    expect(screen.queryByText('Link enviado! Confere seu e-mail.')).not.toBeInTheDocument();
  });

  it('says so when Google sign-in could not start', async () => {
    signInWithOAuth.mockResolvedValue({ data: {}, error: { message: 'provider is not enabled' } });
    render(<LoginForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não rolou. Tenta de novo?');
  });
});
