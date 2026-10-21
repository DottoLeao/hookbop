import { t } from '@/i18n/t';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import type { PlayerAdapter } from '@/lib/player/adapter';
import type { Blank, Difficulty, LyricLine, Mode } from '@/lib/types';

export interface GameScreenProps {
  /** The player the song screen owns; the game drives it but never destroys it. */
  adapter: PlayerAdapter;
  mode: Mode;
  difficulty: Difficulty;
  /** The lines with the video's offset already applied. */
  lines: LyricLine[];
  blanks: Blank[];
  video: VideoRecord;
  /** How long the song screen took to get the song ready, for saving the play. */
  timeToReadyMs: number;
}

/** Stand-in until the real game screen is built: it only shows the mode and how many blanks it got. */
export function GameScreen({ mode, blanks }: GameScreenProps) {
  return (
    <section data-testid="game-screen" className="flex flex-col items-center gap-1 rounded-card bg-card px-4 py-6">
      <p className="font-heading text-verse font-bold">{t(`modo.${mode}`)}</p>
      <p className="text-body text-muted">{t('jogo.blankCount', { n: blanks.length })}</p>
    </section>
  );
}
