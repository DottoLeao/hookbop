'use client';

import { useActionState } from 'react';
import { t } from '@/i18n/t';
import { removeMemberAction, type RemoveMemberState } from './actions';

const NOTHING_FAILED: RemoveMemberState = { failed: false };

export function RemoveMemberForm({ userId, name }: { userId: string; name: string }) {
  const [state, formAction, pending] = useActionState(removeMemberAction, NOTHING_FAILED);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        // Says whom it removes when read out of the list; "Remover" is still the visible text.
        aria-label={t('admin.removeNamed', { nome: name })}
        className="min-h-11 rounded-button border border-error px-4 text-body font-semibold text-error disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
      >
        {t('admin.remove')}
      </button>
      {state.failed && (
        <p role="alert" className="text-body text-error">
          {t('admin.removeError')}
        </p>
      )}
    </form>
  );
}
