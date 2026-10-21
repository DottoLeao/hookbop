export type Mode = 'escolha' | 'digitacao' | 'karaoke' | 'montar';
export type Difficulty = 'facil' | 'medio' | 'dificil';
export interface LyricLine { index: number; startMs: number; endMs: number; text: string }
// tokenIndex = -1 quando a "lacuna" é a linha inteira (Monte o verso)
export interface Blank { id: string; lineIndex: number; tokenIndex: number; answer: string }
export type AttemptKind = 'first' | 'retry' | 'helped';
export interface AnswerRecord { blankId: string; kind: AttemptKind; correct: boolean; beforeLineEnd: boolean }
export interface PlaySummary { totalBlanks: number; firstTryCorrect: number; pct: number; maxCombo: number; xp: number }
export type Command = { type: 'pause' } | { type: 'play' } | { type: 'seek'; ms: number } | { type: 'rate'; rate: 0.75 | 1 };
