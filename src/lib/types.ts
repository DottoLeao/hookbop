export type Mode = 'escolha' | 'digitacao' | 'karaoke' | 'montar';
export type Difficulty = 'facil' | 'medio' | 'dificil';
export interface LyricLine { index: number; startMs: number; endMs: number; text: string }
// tokenIndex = -1 quando a "lacuna" é a linha inteira (Monte o verso)
export interface Blank { id: string; lineIndex: number; tokenIndex: number; answer: string }
export type AttemptKind = 'first' | 'retry' | 'helped';
export interface AnswerRecord { blankId: string; kind: AttemptKind; correct: boolean; beforeLineEnd: boolean }
export interface PlaySummary { totalBlanks: number; firstTryCorrect: number; pct: number; maxCombo: number; xp: number }
/**
 * What the game tells the player to do. `fade` on a pause or a play: the volume goes down before the pause, and comes
 * back up as the music plays. Without it the command is plain, as when the page is hidden.
 */
export type Command =
  | { type: 'pause'; fade?: boolean }
  | { type: 'play'; fade?: boolean }
  | { type: 'seek'; ms: number }
  | { type: 'rate'; rate: 0.75 | 1 };
