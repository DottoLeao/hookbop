// Written by the song screen when the first song is finished (src/components/game/SongScreen.tsx).
const FIRST_FINISH_KEY = 'hb_first_finish';
const DISMISSED_KEY = 'hb_install_dismissed';

/**
 * True when the install prompt may show: a first song was finished and the player has not said "Agora não".
 * Browser storage can be blocked (private mode, site data off), and then the prompt just does not show.
 */
export function installPromptDue(): boolean {
  try {
    const storage = window.localStorage;
    return storage.getItem(FIRST_FINISH_KEY) === '1' && storage.getItem(DISMISSED_KEY) === null;
  } catch {
    return false;
  }
}

/** Remembers "Agora não", so the prompt does not come back. When the storage refuses, it comes back next time. */
export function dismissInstallPrompt(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Blocked or full: nothing to do about it, and the prompt was hidden for this visit anyway.
  }
}
