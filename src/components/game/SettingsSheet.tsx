'use client';

import { useEffect, useId, useRef } from 'react';
import { t, type MessageKey } from '@/i18n/t';
import { useSheetEnter } from '@/lib/motion/transitions';
import type { Settings } from '@/lib/settings';

const SWITCHES: ReadonlyArray<{ name: keyof Settings; label: MessageKey }> = [
  { name: 'alwaysShowTranslation', label: 'config.alwaysShowTranslation' },
  { name: 'autoRepeatOnMiss', label: 'config.autoRepeatOnMiss' },
  { name: 'sounds', label: 'config.sounds' },
];

interface SettingsSheetProps {
  settings: Settings;
  /** Every switch flipped gives the whole new settings. */
  onChange: (next: Settings) => void;
  /** "Pronto" or Escape. */
  onClose: () => void;
}

/**
 * The game's three switches: "Mostrar tradução sempre", "Repetir sozinho depois de errar" and "Sons".
 *
 * It is a panel in the page, not an overlay: the game screen shows it under the player in place of the game area,
 * because nothing may be drawn over the YouTube player, not even a dimmed backdrop. It rises from below as it opens
 * (`useSheetEnter`) and closes at once, with no way out to wait for.
 */
export function SettingsSheet({ settings, onChange, onClose }: SettingsSheetProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  useSheetEnter(sheetRef);

  // The sheet takes the focus when it opens, so a screen reader starts in it and Escape reaches it.
  useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
      className="flex flex-col gap-2 rounded-card bg-card px-4 pt-5 pb-6 outline-none"
    >
      <h2 id={titleId} className="mb-1 font-heading text-verse font-bold">
        {t('jogo.settings')}
      </h2>
      {SWITCHES.map(({ name, label }) => {
        const on = settings[name];
        return (
          <button
            key={name}
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => onChange({ ...settings, [name]: !on })}
            className="flex min-h-11 items-center justify-between gap-4 rounded-button py-1 text-left text-button text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
          >
            <span>{t(label)}</span>
            <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full ${on ? 'bg-lime' : 'bg-elevated'}`}>
              <span className={`absolute top-1 size-5 rounded-full ${on ? 'left-6 bg-bg' : 'left-1 bg-muted'}`} />
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onClose}
        className="mt-3 min-h-13 rounded-button bg-lime px-4 text-button font-bold text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
      >
        {t('jogo.settingsDone')}
      </button>
    </div>
  );
}
