'use client';

import { useActionState } from 'react';
import { t } from '@/i18n/t';
import { createInviteAction, type CreateInviteState } from './actions';

const NOTHING_FAILED: CreateInviteState = { failed: false };

export function CreateInviteForm() {
  const [state, formAction, pending] = useActionState(createInviteAction, NOTHING_FAILED);

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
