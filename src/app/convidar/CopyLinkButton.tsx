'use client';

import { useState } from 'react';
import { t } from '@/i18n/t';

type Copy = 'idle' | 'copied' | 'failed';

export function CopyLinkButton({ url }: { url: string }) {
  const [copy, setCopy] = useState<Copy>('idle');

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopy('copied');
    } catch {
      // No clipboard on a page that is not secure, or the browser said no.
      setCopy('failed');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copyLink}
        className="min-h-11 w-full rounded-button border border-border bg-elevated px-4 text-button font-semibold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
      >
        {t('convidar.copy')}
      </button>
      {/* Always in the page, so screen readers hear what is put into it. */}
      <p role="status" className="min-h-5 text-center text-body text-muted">
        {copy === 'copied' && t('convidar.copied')}
        {copy === 'failed' && t('convidar.copyError')}
      </p>
    </>
  );
}
