'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { focusRing } from '@/components/game/styles';
import { t } from '@/i18n/t';
import { policyNoticeDue, rememberPolicyNotice } from '@/lib/privacy/policyNotice';

/** The browser storage, or null when touching it throws (site data blocked: SecurityError). */
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * "A política de privacidade mudou", with a link to the policy and an "Ok" that puts it away. It shows once per change
 * of the policy (`policyNoticeDue`): the device remembers the change as soon as the notice is shown. Nothing is drawn on
 * the server or in the first paint, since only the browser knows what it was told.
 */
export function PolicyNotice({ joinedAt }: { joinedAt: string }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const storage = browserStorage();
    if (!policyNoticeDue(storage, joinedAt)) return;
    rememberPolicyNotice(storage);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the one-time, SSR-safe read of browser storage
    setShown(true);
  }, [joinedAt]);

  if (!shown) return null;
  return (
    <div role="status" className="flex items-center gap-3 rounded-card border border-border bg-card p-4">
      <p className="flex-1 text-body text-text">
        {t('avisoPolitica.text')}{' '}
        <Link href="/privacidade" className={`rounded-button font-semibold text-lime underline ${focusRing}`}>
          {t('avisoPolitica.link')}
        </Link>
      </p>
      <button
        type="button"
        onClick={() => setShown(false)}
        className={`min-h-11 shrink-0 rounded-button border-[1.5px] border-border px-4 text-button font-bold text-text ${focusRing}`}
      >
        {t('avisoPolitica.ok')}
      </button>
    </div>
  );
}
