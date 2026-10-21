'use client';

import { useId, useState, type FormEvent } from 'react';
import { CALLBACK_PATH } from '@/lib/auth/paths';
import { appUrl } from '@/lib/env';
import { t } from '@/i18n/t';
import { createBrowserSupabase } from '@/lib/supabase/client';

type Notice = 'sent' | 'error' | 'invalidCode' | null;

const buttonClass =
  'min-h-11 w-full rounded-button px-4 text-button font-semibold disabled:opacity-60 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime';
const fieldClass =
  'min-h-11 w-full rounded-button border border-border bg-card px-4 text-body text-text ' +
  'focus-visible:outline-2 focus-visible:outline-lime';
const labelClass = 'text-label font-semibold text-muted';

export function LoginForm() {
  const fieldId = useId();
  const [email, setEmail] = useState('');
  // The address the link and code were sent to. The code is checked against this one,
  // even if the e-mail field is edited afterwards.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<Notice>) {
    setBusy(true);
    try {
      setNotice(await action());
    } catch {
      setNotice('error');
    } finally {
      setBusy(false);
    }
  }

  function signInWithGoogle() {
    return run(async () => {
      const { error } = await createBrowserSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${appUrl()}${CALLBACK_PATH}` },
      });
      // Without an error the browser is already on its way to Google.
      return error ? 'error' : null;
    });
  }

  function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return run(async () => {
      const address = email.trim();
      const { error } = await createBrowserSupabase().auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: `${appUrl()}${CALLBACK_PATH}` },
      });
      if (error) return 'error';
      setSentTo(address);
      return 'sent';
    });
  }

  // The installed iOS app cannot use the e-mail link (Mail opens it in Safari, which has no
  // access to the app's session), so the same e-mail carries a code to type in the app.
  function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sentTo) return;
    return run(async () => {
      const { error } = await createBrowserSupabase().auth.verifyOtp({ email: sentTo, token: code, type: 'email' });
      if (error) return 'invalidCode';
      // The session is now in the cookies; the server finishes sign-in the way it does for the link.
      // A full page load on purpose, not router.push: the destination is a Route Handler that
      // sets cookies and redirects, and the page that comes next must start from a clean state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`${CALLBACK_PATH}?via=otp`);
      return null;
    });
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

      <form onSubmit={sendLink} className="flex flex-col gap-2">
        <label htmlFor={`${fieldId}-email`} className={labelClass}>
          {t('entrar.emailLabel')}
        </label>
        <input
          id={`${fieldId}-email`}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={fieldClass}
        />
        <button
          type="submit"
          disabled={busy}
          className={`${buttonClass} border border-border bg-elevated text-text`}
        >
          {t('entrar.email')}
        </button>
      </form>

      {sentTo && (
        <form onSubmit={verifyCode} className="flex flex-col gap-2">
          <label htmlFor={`${fieldId}-code`} className={labelClass}>
            {t('entrar.codeLabel')}
          </label>
          <input
            id={`${fieldId}-code`}
            type="text"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            required
            value={code}
            // Digits only, so a pasted "123 456" still works.
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            className={`${fieldClass} tracking-[0.3em]`}
          />
          <button type="submit" disabled={busy} className={`${buttonClass} bg-lime text-bg`}>
            {t('entrar.codeSubmit')}
          </button>
        </form>
      )}

      {notice === 'sent' && (
        <p role="status" className="text-center text-body text-lime">
          {t('entrar.sent')}
        </p>
      )}
      {notice === 'error' && (
        <p role="alert" className="text-center text-body text-error">
          {t('entrar.error')}
        </p>
      )}
      {notice === 'invalidCode' && (
        <p role="alert" className="text-center text-body text-error">
          {t('entrar.codeInvalid')}
        </p>
      )}
    </div>
  );
}
