import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './LoginForm';

const signInWithOAuth = vi.fn();
const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();
const assign = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabase: () => ({ auth: { signInWithOAuth, signInWithOtp, verifyOtp } }),
}));

const CALLBACK = 'http://localhost:3000/auth/callback';
const CODE_LABEL = 'Ou digite o código do e-mail';

function sendLink(email: string) {
  fireEvent.change(screen.getByLabelText('Seu e-mail'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Receber link por e-mail' }));
}

function typeCode(code: string) {
  fireEvent.change(screen.getByLabelText(CODE_LABEL), { target: { value: code } });
}

function submitCode() {
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    vi.stubGlobal('location', { assign });
    signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    verifyOtp.mockResolvedValue({ data: {}, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('offers Google and an e-mail link', () => {
    render(<LoginForm />);

    expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receber link por e-mail' })).toBeInTheDocument();
    expect(screen.getByLabelText('Seu e-mail')).toHaveAttribute('type', 'email');
  });

  it('labels the e-mail field with visible text, not only a placeholder', () => {
    render(<LoginForm />);

    expect(screen.getByText('Seu e-mail').tagName).toBe('LABEL');
    expect(screen.getByLabelText('Seu e-mail')).not.toHaveAttribute('placeholder');
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
    expect(screen.queryByLabelText(CODE_LABEL)).not.toBeInTheDocument();
  });

  it('says so when Google sign-in could not start', async () => {
    signInWithOAuth.mockResolvedValue({ data: {}, error: { message: 'provider is not enabled' } });
    render(<LoginForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não rolou. Tenta de novo?');
  });

  describe('six-digit code from the e-mail', () => {
    it('is not asked for until a link has been sent', () => {
      render(<LoginForm />);

      expect(screen.queryByLabelText(CODE_LABEL)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Entrar' })).not.toBeInTheDocument();
    });

    it('appears after the link is sent, as a numeric one-time-code field', async () => {
      render(<LoginForm />);

      sendLink('ana@example.com');

      const field = await screen.findByLabelText(CODE_LABEL);
      expect(field.tagName).toBe('INPUT');
      expect(field).toHaveAttribute('inputmode', 'numeric');
      expect(field).toHaveAttribute('autocomplete', 'one-time-code');
      expect(field).toHaveAttribute('pattern', '[0-9]{6}');
      expect(screen.getByText(CODE_LABEL).tagName).toBe('LABEL');
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    });

    it('verifies the code for the address the link went to, then finishes sign-in on the server', async () => {
      render(<LoginForm />);
      sendLink('ana@example.com');
      await screen.findByLabelText(CODE_LABEL);

      // Editing the address after sending must not change who the code is checked for.
      fireEvent.change(screen.getByLabelText('Seu e-mail'), { target: { value: 'outra@example.com' } });
      typeCode('123456');
      submitCode();

      await waitFor(() => expect(assign).toHaveBeenCalledWith('/auth/callback?via=otp'));
      expect(verifyOtp).toHaveBeenCalledWith({ email: 'ana@example.com', token: '123456', type: 'email' });
    });

    it('keeps only the digits, so a pasted "123 456" still works', async () => {
      render(<LoginForm />);
      sendLink('ana@example.com');
      await screen.findByLabelText(CODE_LABEL);

      typeCode('123 456');
      submitCode();

      await waitFor(() =>
        expect(verifyOtp).toHaveBeenCalledWith({ email: 'ana@example.com', token: '123456', type: 'email' }),
      );
    });

    it('says the code is invalid and stays put when it is wrong', async () => {
      verifyOtp.mockResolvedValue({ data: {}, error: { message: 'Token has expired or is invalid' } });
      render(<LoginForm />);
      sendLink('ana@example.com');
      await screen.findByLabelText(CODE_LABEL);

      typeCode('000000');
      submitCode();

      expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido. Confere e tenta de novo.');
      expect(assign).not.toHaveBeenCalled();
      expect(screen.getByLabelText(CODE_LABEL)).toBeInTheDocument();
    });

    it('can be tried again after a wrong code', async () => {
      verifyOtp
        .mockResolvedValueOnce({ data: {}, error: { message: 'invalid' } })
        .mockResolvedValueOnce({ data: {}, error: null });
      render(<LoginForm />);
      sendLink('ana@example.com');
      await screen.findByLabelText(CODE_LABEL);

      typeCode('000000');
      submitCode();
      await screen.findByRole('alert');
      typeCode('654321');
      submitCode();

      await waitFor(() => expect(assign).toHaveBeenCalledWith('/auth/callback?via=otp'));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
