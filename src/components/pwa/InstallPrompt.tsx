import { useEffect, useId, useRef } from 'react';
import { focusRing } from '@/components/game/styles';
import { t } from '@/i18n/t';
import type { Platform } from '@/lib/pwa/platform';

interface InstallPromptProps {
  platform: Platform;
  /** The app is already running installed, from the home screen. */
  standalone: boolean;
  /** Android: opens the browser's own install dialog. The button is there only when the browser has offered to install. */
  onInstall?: () => void;
  /** "Agora não". */
  onDismiss?: () => void;
  /** Called once, when the prompt is on screen: not while it draws nothing (installed already, or nothing to offer yet). */
  onShown?: () => void;
}

/**
 * The invitation to put Hookbop on the home screen. It only draws: whether it is time to show it, what the browser
 * offered and what was dismissed are decided by InstallPromptGate. An iPhone has no install button, so it gets the
 * steps; Android gets the button, when the browser has one to give; anything else gets nothing. It says when it is
 * on screen (`onShown`), since only it knows whether it draws anything.
 */
export function InstallPrompt({ platform, standalone, onInstall, onDismiss, onShown }: InstallPromptProps) {
  const titleId = useId();
  const ios = platform === 'ios';
  const android = platform === 'android' && onInstall !== undefined;
  const shown = !standalone && (ios || android);

  const latestOnShown = useRef(onShown);
  useEffect(() => {
    latestOnShown.current = onShown;
  });
  // Once for as long as this prompt lives (React in development runs the effect twice at the start).
  const toldRef = useRef(false);
  useEffect(() => {
    if (!shown || toldRef.current) return;
    toldRef.current = true;
    latestOnShown.current?.();
  }, [shown]);

  if (!shown) return null;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
      <h2 id={titleId} className="font-heading text-button font-bold">
        {t('install.title')}
      </h2>
      {ios && <p className="text-body text-muted">{t('install.iosHint')}</p>}
      <div className="flex gap-2">
        {android && (
          <button
            type="button"
            onClick={onInstall}
            className={`min-h-12 flex-1 rounded-button bg-lime px-5 text-button font-bold text-bg ${focusRing}`}
          >
            {t('install.accept')}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className={`min-h-12 flex-1 rounded-button border-[1.5px] border-border px-5 text-button font-bold text-text ${focusRing}`}
        >
          {t('install.dismiss')}
        </button>
      </div>
    </section>
  );
}
