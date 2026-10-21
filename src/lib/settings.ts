export interface Settings {
  /** Show the translation under every line, not only when the player asks. */
  alwaysShowTranslation: boolean;
  /** Replay the line by itself after a wrong answer. */
  autoRepeatOnMiss: boolean;
  /** Play the hit and miss sounds. */
  sounds: boolean;
}

const KEY = 'hb_settings';

/** What a new player gets, and what stands in for any value that is missing or unreadable. */
export const DEFAULT_SETTINGS: Readonly<Settings> = {
  alwaysShowTranslation: false,
  autoRepeatOnMiss: true,
  sounds: true,
};

/** The stored value when it is a boolean, otherwise the default: one bad field does not cost the others. */
function flag(stored: Record<string, unknown>, name: keyof Settings): boolean {
  const value = stored[name];
  return typeof value === 'boolean' ? value : DEFAULT_SETTINGS[name];
}

/**
 * The saved settings. Anything that is not there, not readable or not the right shape falls back to the default,
 * field by field. Storage can throw (private mode, blocked site data), and then the defaults are returned.
 */
export function loadSettings(storage: Storage): Settings {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ...DEFAULT_SETTINGS };
    const stored = parsed as Record<string, unknown>;
    return {
      alwaysShowTranslation: flag(stored, 'alwaysShowTranslation'),
      autoRepeatOnMiss: flag(stored, 'autoRepeatOnMiss'),
      sounds: flag(stored, 'sounds'),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Saves the settings. When the storage refuses (private mode, no space left), they are simply not kept. */
export function saveSettings(storage: Storage, s: Settings): void {
  try {
    storage.setItem(
      KEY,
      JSON.stringify({
        alwaysShowTranslation: s.alwaysShowTranslation,
        autoRepeatOnMiss: s.autoRepeatOnMiss,
        sounds: s.sounds,
      }),
    );
  } catch {
    // Settings are a convenience; losing them must not break the screen.
  }
}
