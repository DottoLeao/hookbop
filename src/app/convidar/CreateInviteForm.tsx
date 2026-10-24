'use client';

import { useActionState, useEffect, useRef } from 'react';
import { t } from '@/i18n/t';
import { track } from '@/lib/metrics/track';
import { createInviteAction, type CreateInviteState } from './actions';

const NOTHING_FAILED: CreateInviteState = { failed: false };

export function CreateInviteForm() {
  const [state, formAction, pending] = useActionState(createInviteAction, NOTHING_FAILED);

  // Each answer of the action is a new object, so each invite made is told once. The action stays the form's own, so the
  // form keeps working before the page is ready; the owner's panel hears of the invite from here.
  //
  // The effect runs again with the same answer when React takes the page down and puts it back: Next keeps the page it
  // leaves in an <Activity>, and "Voltar" shows it with its state, effects made anew. So the answer already told is
  // remembered (a ref outlives both that and StrictMode).
  const toldRef = useRef<CreateInviteState | null>(null);
  useEffect(() => {
    if (state === NOTHING_FAILED || state.failed || toldRef.current === state) return;
    toldRef.current = state;
    track('invite_created');
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-button bg-lime px-4 text-button font-semibold text-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
      >
        {t('convidar.create')}
      </button>
      {state.failed && (
        <p role="alert" className="text-center text-body text-error">
          {t('convidar.error')}
        </p>
      )}
    </form>
  );
}
