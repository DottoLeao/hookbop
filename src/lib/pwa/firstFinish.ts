/**
 * The browser storage key of the mark the song screen leaves when a song is finished for the first time
 * (src/components/game/SongScreen.tsx). The install prompt waits for it (installPromptState.ts). One constant, so the
 * two can never drift apart; the e2e specs set it by this same name.
 */
export const FIRST_FINISH_KEY = 'hb_first_finish';
