'use client';

import { useState, type FormEvent } from 'react';
import { CALLBACK_PATH } from '@/lib/auth/paths';
import { appUrl } from '@/lib/env';
import { t } from '@/i18n/t';
import { createBrowserSupabase } from '@/lib/supabase/client';

type Status = 'idle' | 'busy' | 'sent' | 'error';

const buttonClass =
  'min-h-11 w-full rounded-button px-4 text-button font-semibold disabled:opacity-60 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const busy = status === 'busy';

  async function signInWithGoogle() {
    setStatus('busy');
    try {
      const { error } = await createBrowserSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${appUrl()}${CALLBACK_PATH}` },
      });
      // Without an error the browser is already on its way to Google.
      setStatus(error ? 'error' : 'idle');
    } catch {
      setStatus('error');
    }
  }

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('busy');
    try {
      const { error } = await createBrowserSupabase().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${appUrl()}${CALLBACK_PATH}` },
      });
      setStatus(error ? 'error' : 'sent');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={busy}
        className={`${buttonClass} bg-lime text-bg`}
      >
        {t('entrar.google')}
      </button>

      <form onSubmit={sendLink} className="flex flex-col gap-3">
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-label={t('entrar.emailLabel')}
          placeholder={t('entrar.emailLabel')}
          className="min-h-11 w-full rounded-button border border-border bg-card px-4 text-body text-text placeholder:text-faint focus-visible:outline-2 focus-visible:outline-lime"
        />
        <button
          type="submit"
          disabled={busy}
          className={`${buttonClass} border border-border bg-elevated text-text`}
        >
          {t('entrar.email')}
        </button>
      </form>

      {status === 'sent' && (
        <p role="status" className="text-center text-body text-lime">
          {t('entrar.sent')}
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="text-center text-body text-error">
          {t('entrar.error')}
        </p>
      )}
    </div>
  );
}
