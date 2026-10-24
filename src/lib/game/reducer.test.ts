import { describe, expect, it } from 'vitest';
import type { PlayerState } from '@/lib/player/adapter';
import type { Blank, LyricLine, Mode } from '@/lib/types';
import { PAUSE_LEAD_MS, clipPlays, gameReducer, initGame, summaryOf, type GameEvent, type GameState } from './reducer';
import { createScore, summarize } from './scoring';

const LINES: LyricLine[] = [
  { index: 0, startMs: 0, endMs: 4000, text: "Grandpa won't let geese drive" },
  { index: 1, startMs: 4000, endMs: 8000, text: 'Row the small boat home' },
  { index: 2, startMs: 8000, endMs: 12000, text: 'We sail with the tide' },
];

const LET: Blank = { id: '0:2', lineIndex: 0, tokenIndex: 2, answer: 'let' };
const DRIVE: Blank = { id: '0:4', lineIndex: 0, tokenIndex: 4, answer: 'drive' };
const BOAT: Blank = { id: '1:3', lineIndex: 1, tokenIndex: 3, answer: 'boat' };
const SAIL: Blank = { id: '2:1', lineIndex: 2, tokenIndex: 1, answer: 'sail' };
const TIDE: Blank = { id: '2:4', lineIndex: 2, tokenIndex: 4, answer: 'tide' };
const WHOLE_LINE: Blank = { id: '0:-1', lineIndex: 0, tokenIndex: -1, answer: "Grandpa won't let geese drive" };
const WHOLE_LAST_LINE: Blank = { id: '2:-1', lineIndex: 2, tokenIndex: -1, answer: 'We sail with the tide' };

interface Setup {
  mode: Mode;
  lines: LyricLine[];
  blanks: Blank[];
  autoRepeat: boolean;
}

function game(setup: Partial<Setup> = {}): GameState {
  return initGame({ mode: 'escolha', lines: LINES, blanks: [LET], autoRepeat: true, ...setup });
}

function montar(setup: Partial<Setup> = {}): GameState {
  return game({ mode: 'montar', blanks: [WHOLE_LINE], ...setup });
}

function run(s: GameState, ...events: GameEvent[]): GameState {
  return events.reduce(gameReducer, s);
}

const tick = (timeMs: number): GameEvent => ({ type: 'TICK', timeMs });
const answer = (blankId: string, correct: boolean, atMs: number): GameEvent => ({
  type: 'ANSWER',
  blankId,
  correct,
  atMs,
});
const tile = (word: string, atMs = 3900, blankId = WHOLE_LINE.id): GameEvent => ({ type: 'TILE', blankId, word, atMs });
const hint = (blankId: string): GameEvent => ({ type: 'HINT', blankId });
const player = (state: PlayerState): GameEvent => ({ type: 'PLAYER_STATE', state });
const resync = (timeMs: number): GameEvent => ({ type: 'RESYNC', timeMs });
const REPEAT: GameEvent = { type: 'REPEAT_LINE' };

/** A tick every `stepMs` after `fromMs`, up to and including `toMs`: the clock of a clip that plays on. */
function ticksBetween(fromMs: number, toMs: number, stepMs = 100): GameEvent[] {
  const events: GameEvent[] = [];
  for (let timeMs = fromMs + stepMs; timeMs <= toMs; timeMs += stepMs) events.push(tick(timeMs));
  return events;
}

const LINE_TILES = ['Grandpa', "won't", 'let', 'geese', 'drive'];

function lastRecord(s: GameState) {
  return s.score.records.at(-1);
}

describe('initGame', () => {
  it('starts with every blank pending, playing, nothing answered and the score counting every blank', () => {
    const s = game({ blanks: [LET, BOAT], autoRepeat: false });
    expect(s).toEqual({
      mode: 'escolha',
      lines: LINES,
      blanks: [LET, BOAT],
      status: { '0:2': 'pending', '1:3': 'pending' },
      attempted: {},
      hinted: {},
      tilesPlaced: {},
      phase: 'playing',
      waitingBlankId: null,
      lastTickMs: 0,
      playerState: 'playing',
      playerPlaying: true,
      clipRunning: true,
      autoRepeat: false,
      score: createScore(2),
      commands: [],
    });
  });

  it('gives every line of montar an empty row of placed tiles', () => {
    expect(montar().tilesPlaced).toEqual({ '0:-1': [] });
  });

  it('gives karaoke no blanks, even when it is handed some', () => {
    const s = game({ mode: 'karaoke', blanks: [LET, BOAT] });
    expect(s.blanks).toEqual([]);
    expect(s.status).toEqual({});
    expect(s.score.totalBlanks).toBe(0);
  });
});

describe('gameReducer: the brief scenarios', () => {
  it('1. pauses when less than 150 ms are left in the line of a pending blank', () => {
    const s = run(game(), tick(3850));
    expect(s.commands).toEqual([{ type: 'pause', fade: true }]);
    expect(s.phase).toBe('waiting');
    expect(s.waitingBlankId).toBe('0:2');
  });

  it('2. a right answer during the wait is a first try before the line end, plays and goes back to playing', () => {
    const s = run(game(), tick(3850), answer('0:2', true, 3900));
    expect(lastRecord(s)).toEqual({ blankId: '0:2', kind: 'first', correct: true, beforeLineEnd: true });
    expect(s.commands).toEqual([{ type: 'play', fade: true }]);
    expect(s.phase).toBe('playing');
    expect(s.waitingBlankId).toBeNull();
    expect(s.status['0:2']).toBe('correct');
    expect(s.score.xp).toBe(12); // 10 for the hit, 2 for answering before the line ended
  });

  it('3. a wrong answer with auto-repeat seeks to the line start and plays; the next right one is a retry worth no XP', () => {
    const missed = run(game({ autoRepeat: true }), answer('0:2', false, 3900));
    expect(missed.commands).toEqual([{ type: 'seek', ms: 0 }, { type: 'play', fade: true }]);
    expect(missed.status['0:2']).toBe('wrong');

    const retried = run(missed, answer('0:2', true, 3500));
    expect(lastRecord(retried)?.kind).toBe('retry');
    expect(lastRecord(retried)?.correct).toBe(true);
    expect(retried.score.xp).toBe(missed.score.xp);
  });

  it('4. a right answer after a hint is helped', () => {
    const s = run(game(), hint('0:2'), answer('0:2', true, 3900));
    expect(lastRecord(s)?.kind).toBe('helped');
    expect(s.score.xp).toBe(0);
  });

  it('5. a forward seek skips the passed blank without pausing; after seeking back it is still a first try', () => {
    const seeked = run(game(), tick(1000), tick(9000));
    expect(seeked.status['0:2']).toBe('skipped');
    expect(seeked.commands).toEqual([]);
    expect(seeked.phase).toBe('playing');

    const answered = run(seeked, tick(500), answer('0:2', true, 600));
    expect(lastRecord(answered)?.kind).toBe('first');
    expect(summaryOf(answered).totalBlanks).toBe(answered.blanks.length);
  });

  it('5. skipped blanks still count in the total', () => {
    const s = run(game({ blanks: [LET, BOAT] }), tick(1000), tick(9000), tick(500), answer('0:2', true, 600));
    expect(s.status).toEqual({ '0:2': 'correct', '1:3': 'skipped' });
    expect(summaryOf(s)).toMatchObject({ totalBlanks: 2, firstTryCorrect: 1, pct: 50 });
  });

  it('6. does not pause when the player is already stopped', () => {
    const s = run(game(), player('paused'), tick(3850));
    expect(s.commands).toEqual([]);
    expect(s.phase).toBe('playing');
  });

  it('7. the song ending ends the game, and summaryOf gives the right percentage', () => {
    // Nothing is left pending, so the end does not wait (R39).
    const s = run(game({ blanks: [LET, BOAT] }), answer('0:2', true, 3000), answer('1:3', false, 5000), player('ended'));
    expect(s.phase).toBe('ended');
    expect(summaryOf(s)).toEqual({ totalBlanks: 2, firstTryCorrect: 1, pct: 50, maxCombo: 1, xp: 12 });
  });

  it('8. karaoke never pauses', () => {
    let s = game({ mode: 'karaoke', blanks: [LET, BOAT] });
    for (let timeMs = 0; timeMs <= 12000; timeMs += 50) {
      s = gameReducer(s, tick(timeMs));
      expect(s.commands).toEqual([]);
    }
    expect(s.phase).toBe('playing');
  });

  it('9. montar: the tiles in the right order make the line correct, as a first try', () => {
    const s = run(montar(), ...LINE_TILES.map((word) => tile(word)));
    expect(s.status['0:-1']).toBe('correct');
    expect(lastRecord(s)).toEqual({ blankId: '0:-1', kind: 'first', correct: true, beforeLineEnd: true });
  });

  it('9. montar: a wrong tile makes the line wrong and repeats it', () => {
    const s = run(montar(), tile('let'));
    expect(s.status['0:-1']).toBe('wrong');
    expect(s.commands).toEqual([{ type: 'seek', ms: 0 }, { type: 'play', fade: true }]);
  });

  it('9. montar: a hint places the next right tile, and the finished line is helped', () => {
    const hinted = run(montar(), hint('0:-1'));
    expect(hinted.tilesPlaced['0:-1']).toEqual(['Grandpa']);

    const done = run(hinted, ...LINE_TILES.slice(1).map((word) => tile(word)));
    expect(done.status['0:-1']).toBe('correct');
    expect(lastRecord(done)?.kind).toBe('helped');
  });

  it('10. REPEAT_LINE at 5000 seeks to the start of line 1 and plays', () => {
    const s = run(game(), tick(5000), REPEAT);
    expect(s.commands).toEqual([{ type: 'seek', ms: 4000 }, { type: 'play', fade: true }]);
  });

  it('11. SET_RATE sends the rate to the player', () => {
    expect(run(game(), { type: 'SET_RATE', rate: 0.75 }).commands).toEqual([{ type: 'rate', rate: 0.75 }]);
    expect(run(game(), { type: 'SET_RATE', rate: 1 }).commands).toEqual([{ type: 'rate', rate: 1 }]);
  });
});

describe('pausing at the end of a line (R3)', () => {
  it('waits until 150 ms before the line end', () => {
    const early = run(game(), tick(1000), tick(2000), tick(3000), tick(3849));
    expect(early.commands).toEqual([]);
    expect(run(early, tick(3850)).commands).toEqual([{ type: 'pause', fade: true }]);
  });

  it('sends the pause once per wait, not on every tick', () => {
    const paused = run(game(), tick(3850));
    const later = run(paused, tick(3900));
    expect(later.commands).toEqual([]);
    expect(run(later, tick(3950)).commands).toEqual([]);
    expect(run(later, tick(3950)).phase).toBe('waiting');
  });

  it('does not pause for a blank answered before the line end', () => {
    const s = run(game(), answer('0:2', true, 3000), tick(3850));
    expect(s.commands).toEqual([]);
  });

  it('pauses again for the next line once a wait is over', () => {
    const s = run(
      game({ blanks: [LET, BOAT] }),
      tick(3850),
      answer('0:2', true, 3900),
      tick(5000),
      tick(6000),
      tick(7000),
      tick(7850),
    );
    expect(s.commands).toEqual([{ type: 'pause', fade: true }]);
    expect(s.waitingBlankId).toBe('1:3');
  });

  it('keeps waiting while the paused line still has a blank with no answer', () => {
    const first = run(game({ blanks: [LET, DRIVE] }), tick(3850), answer('0:2', true, 3900));
    expect(first.commands).toEqual([]);
    expect(first.phase).toBe('waiting');
    expect(first.waitingBlankId).toBe('0:4');

    const second = run(first, answer('0:4', true, 3950));
    expect(second.commands).toEqual([{ type: 'play', fade: true }]);
    expect(second.phase).toBe('playing');
  });

  it('a miss without auto-repeat on a two-blank line moves the wait to the other blank, and that one plays', () => {
    const missed = run(game({ blanks: [LET, DRIVE], autoRepeat: false }), tick(3850), answer('0:2', false, 3900));
    expect(missed.commands).toEqual([]);
    expect(missed.phase).toBe('waiting');
    expect(missed.waitingBlankId).toBe('0:4');

    const done = run(missed, answer('0:4', true, 3950));
    expect(done.commands).toEqual([{ type: 'play', fade: true }]);
    expect(done.phase).toBe('playing');
  });

  it('keeps waiting when a blank of another line is answered', () => {
    const s = run(game({ blanks: [LET, BOAT], autoRepeat: false }), tick(3850), answer('1:3', true, 3900));
    expect(s.commands).toEqual([]);
    expect(s.phase).toBe('waiting');
    expect(s.waitingBlankId).toBe('0:2');
  });

  it('a jump while the player is stopped is not a seek: the blank stays pending and does not pause later', () => {
    const scrubbed = run(game(), player('paused'), tick(9000));
    expect(scrubbed.status['0:2']).toBe('pending');

    const resumed = run(scrubbed, player('playing'), tick(9100));
    expect(resumed.commands).toEqual([]);
    expect(resumed.phase).toBe('playing');
  });
});

describe('seeking (R4)', () => {
  it('skips only the blanks of lines that ended before the seek landed', () => {
    const s = run(game({ blanks: [LET, BOAT] }), tick(1000), tick(6000));
    expect(s.status).toEqual({ '0:2': 'skipped', '1:3': 'pending' });
    expect(s.commands).toEqual([]);
  });

  it('a step of 1500 ms is still playing, 1501 ms is a seek', () => {
    const played = run(game(), tick(1000), tick(2000), tick(2600), tick(4100));
    expect(played.status['0:2']).toBe('pending');
    expect(played.commands).toEqual([{ type: 'pause', fade: true }]);

    const seeked = run(game(), tick(1000), tick(2000), tick(2599), tick(4100));
    expect(seeked.status['0:2']).toBe('skipped');
    expect(seeked.commands).toEqual([]);
  });

  it('a seek that lands in the last 150 ms of a line pauses for it', () => {
    const s = run(game(), tick(1000), tick(3900));
    expect(s.commands).toEqual([{ type: 'pause', fade: true }]);
  });

  it('a backward jump only moves lastTickMs, and the line pauses again at its end', () => {
    const before = run(game(), tick(1000), tick(2000), tick(3000));
    const back = run(before, tick(500));
    expect(back).toEqual({ ...before, lastTickMs: 500 });

    expect(run(back, tick(1500), tick(2500), tick(3500), tick(3850)).commands).toEqual([{ type: 'pause', fade: true }]);
  });

  it('a jump while the clip buffers is a seek too', () => {
    const s = run(game({ blanks: [LET, BOAT] }), tick(1000), player('playing'), player('buffering'), tick(9000));
    expect(s.status).toEqual({ '0:2': 'skipped', '1:3': 'skipped' });
    expect(s.commands).toEqual([]);

    const resumed = run(s, player('playing'), tick(9100));
    expect(resumed.commands).toEqual([]);
    expect(resumed.phase).toBe('playing');
  });
});

describe('waiting again for a skipped blank or a miss (R37)', () => {
  it('a skipped blank whose line plays through after seeking back waits again, and its answer is a first try', () => {
    const waiting = run(game(), tick(1000), tick(9000), tick(500), tick(1500), tick(2500), tick(3500), tick(3850));
    expect(waiting.status['0:2']).toBe('skipped');
    expect(waiting.commands).toEqual([{ type: 'pause', fade: true }]);
    expect(waiting.waitingBlankId).toBe('0:2');

    const answered = run(waiting, answer('0:2', true, 3900));
    expect(lastRecord(answered)?.kind).toBe('first');
    expect(answered.commands).toEqual([{ type: 'play', fade: true }]);
    expect(answered.phase).toBe('playing');
  });

  it('a skipped blank does not wait again on a seek that lands past its pause point', () => {
    const s = run(game(), tick(1000), tick(9000), tick(500), tick(1000), tick(3900));
    expect(s.status['0:2']).toBe('skipped');
    expect(s.commands).toEqual([]);
  });

  it('a skipped blank whose pause point the clip already passed does not wait again', () => {
    const s = run(game(), tick(1000), tick(9000), tick(3860), tick(3960));
    expect(s.commands).toEqual([]);
  });

  it('a miss with auto-repeat waits again at the end of the replay; the right answer is a retry and plays', () => {
    const replayed = run(
      game(),
      tick(3850),
      answer('0:2', false, 3900),
      tick(0),
      tick(1000),
      tick(2000),
      tick(3000),
      tick(3850),
    );
    expect(replayed.commands).toEqual([{ type: 'pause', fade: true }]);
    expect(replayed.phase).toBe('waiting');
    expect(replayed.waitingBlankId).toBe('0:2');

    const fixed = run(replayed, answer('0:2', true, 3900));
    expect(lastRecord(fixed)?.kind).toBe('retry');
    expect(fixed.commands).toEqual([{ type: 'play', fade: true }]);
    expect(fixed.phase).toBe('playing');
  });

  it('a miss without auto-repeat never waits again, even when its line is replayed', () => {
    const s = run(
      game({ autoRepeat: false }),
      tick(3850),
      answer('0:2', false, 3900),
      REPEAT,
      tick(0),
      tick(1000),
      tick(2000),
      tick(3000),
      tick(3850),
    );
    expect(s.status['0:2']).toBe('wrong');
    expect(s.commands).toEqual([]);
    expect(s.phase).toBe('playing');
  });

  it.each<[string, GameEvent[]]>([
    ['a miss', [tick(3850), answer('0:2', false, 3900), tick(0), tick(1000), tick(2000), tick(3000), tick(3850)]],
    ['a skipped blank', [tick(1000), tick(9000), tick(500), tick(1500), tick(2500), tick(3500), tick(3850)]],
  ])('started from the player controls while waiting again for %s, plays on without pausing', (_, toRewait) => {
    const rewaiting = run(game(), ...toRewait);
    expect(rewaiting.phase).toBe('waiting');

    const resumed = run(rewaiting, player('paused'), player('playing'));
    expect(resumed.phase).toBe('playing');
    // The fade left the volume at 0: the music comes back up.
    expect(resumed.commands).toEqual([{ type: 'play', fade: true }]);
    // A pause on any of these ticks would leave the phase at waiting.
    expect(run(resumed, tick(3950), tick(4050), tick(4150)).phase).toBe('playing');
  });
});

describe('the fade at a wait (spec §1)', () => {
  // A 300 ms gap after each line.
  const GAP_LINES: LyricLine[] = [
    { index: 0, startMs: 0, endMs: 4000, text: "Grandpa won't let geese drive" },
    { index: 1, startMs: 4300, endMs: 8300, text: 'Row the small boat home' },
    { index: 2, startMs: 8600, endMs: 12600, text: 'We sail with the tide' },
  ];
  // The second line (1.2 s) is shorter than the fade, and the third one starts 300 ms after it.
  const SHORT_LINES: LyricLine[] = [
    { index: 0, startMs: 0, endMs: 4000, text: "Grandpa won't let geese drive" },
    { index: 1, startMs: 4300, endMs: 5500, text: 'Row the small boat home' },
    { index: 2, startMs: 5800, endMs: 9800, text: 'We sail with the tide' },
  ];

  /**
   * The wait of line 0 starts at 3850 and the clip plays on, ticking every 100 ms up to `untilMs`. The default is a
   * full 2 s past the line end.
   */
  function throughTheFade(untilMs = 6000): GameEvent[] {
    return [tick(3850), tick(3900), ...ticksBetween(3900, untilMs)];
  }

  function fading(setup: Partial<Setup>, untilMs = 6000): GameState {
    return run(game(setup), ...throughTheFade(untilMs));
  }

  describe('the wait', () => {
    it('pauses with a fade, 150 ms before the line end', () => {
      expect(PAUSE_LEAD_MS).toBe(150);
      const end = LINES[0].endMs;
      expect(run(game(), tick(end - PAUSE_LEAD_MS - 1)).commands).toEqual([]);
      expect(run(game(), tick(end - PAUSE_LEAD_MS)).commands).toEqual([{ type: 'pause', fade: true }]);
    });

    it('goes on, on the same blank and with no new command, while the clip plays the fade', () => {
      const [start, ...fade] = throughTheFade(6000);
      let s = run(game({ lines: SHORT_LINES, blanks: [LET, BOAT, SAIL] }), start);
      expect(s.commands).toEqual([{ type: 'pause', fade: true }]);
      for (const event of fade) {
        s = gameReducer(s, event);
        expect(s.commands).toEqual([]);
      }
      expect(s.phase).toBe('waiting');
      expect(s.waitingBlankId).toBe('0:2');
      expect(s.status).toEqual({ '0:2': 'pending', '1:3': 'pending', '2:1': 'pending' });
      expect(s.lastTickMs).toBe(LINES[0].endMs + 2000);
    });

    it('does not take a stalled clock for a seek: nothing is skipped, not even the lines it jumps over', () => {
      const s = run(game({ lines: SHORT_LINES, blanks: [LET, BOAT] }), tick(3850), tick(5600));
      expect(s.status).toEqual({ '0:2': 'pending', '1:3': 'pending' });
      expect(s.phase).toBe('waiting');
      expect(s.waitingBlankId).toBe('0:2');
      expect(s.commands).toEqual([]);
    });

    it('a playing report while the clip still plays the fade is not the player starting it', () => {
      const s = run(fading({ blanks: [LET, BOAT] }), player('playing'));
      expect(s.phase).toBe('waiting');
      expect(s.waitingBlankId).toBe('0:2');
      expect(s.status['0:2']).toBe('pending');
      expect(s.commands).toEqual([]);
    });

    it('a playing report after the clip was stopped is the player starting it: the line is skipped', () => {
      const s = run(fading({ blanks: [LET, BOAT] }), player('paused'), player('playing'));
      expect(s.phase).toBe('playing');
      expect(s.status['0:2']).toBe('skipped');
      // The fade left the volume at 0: the music comes back up.
      expect(s.commands).toEqual([{ type: 'play', fade: true }]);
    });

    it('a buffering blip while the clip plays the fade does not end the wait (ruling S8)', () => {
      const blip = run(fading({ blanks: [LET] }), player('buffering'));
      expect(blip.commands).toEqual([]);

      const s = run(blip, player('playing'));
      expect(s.phase).toBe('waiting');
      expect(s.waitingBlankId).toBe('0:2');
      expect(s.status).toEqual({ '0:2': 'pending' });
      expect(s.commands).toEqual([]);
      expect(s.clipRunning).toBe(true);

      // And the wait still ends the usual way, with the answer.
      expect(run(s, answer('0:2', true, 6000)).commands).toEqual([{ type: 'play', fade: true }]);
    });
  });

  describe('letting the music go (the way back)', () => {
    it('goes back to the start of the next line when it has a blank that awaits an answer', () => {
      const s = run(fading({ lines: GAP_LINES, blanks: [LET, BOAT] }), answer('0:2', true, 6000));
      expect(s.commands).toEqual([{ type: 'seek', ms: 4300 }, { type: 'play', fade: true }]);
      expect(s.phase).toBe('playing');
      expect(s.waitingBlankId).toBeNull();
    });

    it('plays from where it stopped when the next line has no blank', () => {
      const s = run(fading({ lines: GAP_LINES, blanks: [LET] }), answer('0:2', true, 6000));
      expect(s.commands).toEqual([{ type: 'play', fade: true }]);
      expect(s.phase).toBe('playing');
    });

    it('plays from where it stopped when the blank of the next line was already answered', () => {
      const s = run(
        game({ lines: GAP_LINES, blanks: [LET, BOAT] }),
        answer('1:3', true, 2000),
        ...throughTheFade(6000),
        answer('0:2', true, 6000),
      );
      expect(s.commands).toEqual([{ type: 'play', fade: true }]);
    });

    it('plays from where it stopped when the blank of the next line was missed and auto-repeat is off', () => {
      const s = run(
        game({ lines: GAP_LINES, blanks: [LET, BOAT], autoRepeat: false }),
        answer('1:3', false, 2000),
        ...throughTheFade(6000),
        answer('0:2', true, 6000),
      );
      expect(s.commands).toEqual([{ type: 'play', fade: true }]);
    });

    it('goes back for a blank of the next line that was skipped, or missed with auto-repeat on', () => {
      const skipped = run(
        game({ lines: GAP_LINES, blanks: [LET, BOAT] }),
        // Seeked past both lines, then back to play through the first one: its blank waits again.
        tick(1000),
        tick(9000),
        tick(500),
        tick(1500),
        tick(2500),
        tick(3500),
        ...throughTheFade(6000),
        answer('0:2', true, 6000),
      );
      expect(skipped.status['1:3']).toBe('skipped');
      expect(skipped.commands).toEqual([{ type: 'seek', ms: 4300 }, { type: 'play', fade: true }]);

      const missed = run(
        game({ lines: GAP_LINES, blanks: [LET, BOAT] }),
        answer('1:3', false, 2000),
        ...throughTheFade(6000),
        answer('0:2', true, 6000),
      );
      expect(missed.status['1:3']).toBe('wrong');
      expect(missed.commands).toEqual([{ type: 'seek', ms: 4300 }, { type: 'play', fade: true }]);
    });

    it('plays from where it stopped when the next line was not reached, or the clock is only at its start', () => {
      const early = run(game({ lines: GAP_LINES, blanks: [LET, BOAT] }), tick(3850), answer('0:2', true, 3900));
      expect(early.commands).toEqual([{ type: 'play', fade: true }]);

      const atTheStart = run(
        game({ lines: GAP_LINES, blanks: [LET, BOAT] }),
        tick(3850),
        tick(4300),
        answer('0:2', true, 4300),
      );
      expect(atTheStart.commands).toEqual([{ type: 'play', fade: true }]);
    });

    it('goes back to the earliest of the lines the fade crossed that have a blank awaiting', () => {
      const s = run(fading({ lines: SHORT_LINES, blanks: [LET, BOAT, SAIL] }, 6200), answer('0:2', true, 6200));
      expect(s.commands).toEqual([{ type: 'seek', ms: 4300 }, { type: 'play', fade: true }]);
    });

    it('passes over a crossed line whose blank is answered, for the next one that awaits', () => {
      const s = run(
        game({ lines: SHORT_LINES, blanks: [LET, BOAT, SAIL] }),
        answer('1:3', true, 2000),
        ...throughTheFade(6200),
        answer('0:2', true, 6200),
      );
      expect(s.commands).toEqual([{ type: 'seek', ms: 5800 }, { type: 'play', fade: true }]);
    });

    it('does not go back to a line before the waited one, even if its blank is still open', () => {
      // Line 0 ended 1.5 s before line 1 starts: close enough to be within the way back, if it were a candidate.
      const CLOSE_LINES: LyricLine[] = [
        { index: 0, startMs: 1000, endMs: 2000, text: "Grandpa won't let geese drive" },
        { index: 1, startMs: 2300, endMs: 3500, text: 'Row the small boat home' },
      ];
      const waitingOnLine1 = run(
        game({ lines: CLOSE_LINES, blanks: [LET, BOAT] }),
        // A seek over line 0 skips its blank, then the clip plays through line 1 up to its wait.
        tick(2500),
        tick(3000),
        tick(3350),
      );
      expect(waitingOnLine1.waitingBlankId).toBe('1:3');
      expect(waitingOnLine1.status['0:2']).toBe('skipped');

      const s = run(waitingOnLine1, tick(3450), answer('1:3', true, 3450));
      expect(s.commands).toEqual([{ type: 'play', fade: true }]);
    });

    it('does not go back for a line the fade cannot have reached: a stopped clip scrubbed far ahead (S10)', () => {
      const s = run(
        game({ blanks: [LET, BOAT] }),
        tick(3850),
        player('paused'),
        tick(30000), // scrubbed to 30 s with the clip stopped: not a seek, so the blank stays open
        answer('0:2', true, 3900),
      );
      expect(s.status['1:3']).toBe('pending');
      expect(s.commands).toEqual([{ type: 'play', fade: true }]);
    });

    it('the way back is at most 3000 ms: that far back it goes, one ms further it does not', () => {
      const afterScrubTo = (timeMs: number) =>
        run(
          game({ lines: GAP_LINES, blanks: [LET, BOAT] }),
          tick(3850),
          player('paused'),
          tick(timeMs),
          answer('0:2', true, 3900),
        ).commands;

      expect(afterScrubTo(4300 + 3000)).toEqual([{ type: 'seek', ms: 4300 }, { type: 'play', fade: true }]);
      expect(afterScrubTo(4300 + 3001)).toEqual([{ type: 'play', fade: true }]);
    });

    it('a line shorter than the fade is heard again, and then waits for its own blank', () => {
      const released = run(fading({ lines: SHORT_LINES, blanks: [LET, BOAT] }), answer('0:2', true, 6000));
      expect(released.commands).toEqual([{ type: 'seek', ms: 4300 }, { type: 'play', fade: true }]);
      expect(released.status['1:3']).toBe('pending');

      // The clip is back at 4300 and the clock follows it.
      const replaying = run(released, tick(4300), ...ticksBetween(4300, 5250));
      expect(replaying.phase).toBe('playing');
      expect(replaying.commands).toEqual([]);

      const waiting = run(replaying, tick(5350));
      expect(waiting.commands).toEqual([{ type: 'pause', fade: true }]);
      expect(waiting.phase).toBe('waiting');
      expect(waiting.waitingBlankId).toBe('1:3');
    });

    it('the first of two blanks on the line keeps the wait and the music; the last one lets it go', () => {
      const first = run(fading({ lines: GAP_LINES, blanks: [LET, DRIVE, BOAT] }), answer('0:2', true, 6000));
      expect(first.commands).toEqual([]);
      expect(first.phase).toBe('waiting');
      expect(first.waitingBlankId).toBe('0:4');

      const last = run(first, answer('0:4', true, 6100));
      expect(last.commands).toEqual([{ type: 'seek', ms: 4300 }, { type: 'play', fade: true }]);
      expect(last.phase).toBe('playing');
    });

    it('a miss without auto-repeat that ends the wait lets the music go the same way', () => {
      const s = run(fading({ lines: GAP_LINES, blanks: [LET, BOAT], autoRepeat: false }), answer('0:2', false, 6000));
      expect(s.commands).toEqual([{ type: 'seek', ms: 4300 }, { type: 'play', fade: true }]);
      expect(s.phase).toBe('playing');
    });

    it('a miss with auto-repeat plays the waited line again, not the next one', () => {
      const s = run(fading({ lines: GAP_LINES, blanks: [LET, BOAT], autoRepeat: true }), answer('0:2', false, 6000));
      expect(s.commands).toEqual([{ type: 'seek', ms: 0 }, { type: 'play', fade: true }]);
      expect(s.phase).toBe('playing');
      expect(s.waitingBlankId).toBeNull();
    });

    it('REPEAT_LINE plays the waited line again, not the next one', () => {
      const s = run(fading({ lines: GAP_LINES, blanks: [LET, BOAT] }), REPEAT);
      expect(s.commands).toEqual([{ type: 'seek', ms: 0 }, { type: 'play', fade: true }]);
      expect(s.phase).toBe('playing');
    });
  });

  describe('answers during the fade or the pause (scoring)', () => {
    it('a right answer 1.5 s after the line end is a first try before the line end, worth the usual XP', () => {
      const s = run(fading({}, 5500), answer('0:2', true, LINES[0].endMs + 1500));
      expect(lastRecord(s)).toEqual({ blankId: '0:2', kind: 'first', correct: true, beforeLineEnd: true });
      expect(s.score.xp).toBe(12); // 10 for the hit, 2 for answering before the line ended
    });

    it('is the same for every blank on the waited line', () => {
      const s = run(fading({ blanks: [LET, DRIVE] }, 5500), answer('0:2', true, 5000), answer('0:4', true, 5500));
      expect(s.score.records.map((r) => r.beforeLineEnd)).toEqual([true, true]);
      expect(s.score.xp).toBe(24);
    });

    it('is the same in montar, for the line finished during the fade', () => {
      const waiting = fading({ mode: 'montar', blanks: [WHOLE_LINE] }, 5500);
      const s = run(waiting, ...LINE_TILES.map((word) => tile(word, 5500)));
      expect(lastRecord(s)).toEqual({ blankId: '0:-1', kind: 'first', correct: true, beforeLineEnd: true });
      expect(s.score.xp).toBe(12);
    });

    it('a miss in the fade is before the line end too', () => {
      const s = run(fading({ autoRepeat: false }, 5500), answer('0:2', false, 5500));
      expect(lastRecord(s)).toEqual({ blankId: '0:2', kind: 'first', correct: false, beforeLineEnd: true });
    });

    it('does not reach a blank of another line: answered after its line ended, it is late', () => {
      const s = run(fading({ lines: SHORT_LINES, blanks: [LET, BOAT] }), answer('1:3', true, 6000));
      expect(lastRecord(s)?.beforeLineEnd).toBe(false);
      expect(s.phase).toBe('waiting');
      expect(s.waitingBlankId).toBe('0:2');
    });

    it('outside a wait, an answer at or after the line end is still late', () => {
      expect(lastRecord(run(game(), answer('0:2', true, 4000)))?.beforeLineEnd).toBe(false);
    });

    it('a wait held after the clip ended earns no bonus for an answer at or after the line end (ruling S11)', () => {
      // The clip runs out in the last line, before its pause point: the wait holds for the blank with no fade.
      const waiting = run(game({ blanks: [SAIL] }), tick(10000), tick(11000), tick(11800), player('ended'));
      expect(waiting.phase).toBe('waiting');

      const late = run(waiting, answer('2:1', true, 12500));
      expect(lastRecord(late)).toEqual({ blankId: '2:1', kind: 'first', correct: true, beforeLineEnd: false });
      expect(late.score.xp).toBe(10);

      // Before the line end it is early, as ever.
      expect(lastRecord(run(waiting, answer('2:1', true, 11900)))?.beforeLineEnd).toBe(true);
    });
  });
});

describe('clipPlays', () => {
  it('is true for a round the player plays, and for one that stalls to buffer', () => {
    expect(clipPlays(game())).toBe(true);
    expect(clipPlays(run(game(), player('buffering')))).toBe(true);
  });

  it('is false once the player stopped, or ended', () => {
    expect(clipPlays(run(game(), player('paused')))).toBe(false);
    expect(clipPlays(run(game({ blanks: [] }), player('ended')))).toBe(false);
  });

  it('is false during a wait, even though the clip plays on to fade out', () => {
    const waiting = run(game(), tick(3900));

    expect(waiting.phase).toBe('waiting');
    expect(waiting.playerState).toBe('playing');
    expect(clipPlays(waiting)).toBe(false);
  });
});

describe('RESYNC', () => {
  it('moves the clock to where the clip really is without taking the jump for a seek, while the clip plays', () => {
    // The same jump as a tick is a seek: it skips both lines.
    const seeked = run(game({ blanks: [LET, BOAT] }), tick(1000), tick(40000));
    expect(seeked.status).toEqual({ '0:2': 'skipped', '1:3': 'skipped' });

    const s = run(game({ blanks: [LET, BOAT] }), tick(1000), resync(40000));
    expect(s.lastTickMs).toBe(40000);
    expect(s.status).toEqual({ '0:2': 'pending', '1:3': 'pending' });
    expect(s.phase).toBe('playing');
    expect(s.commands).toEqual([]);
  });

  it('makes the next tick a normal step: it is not a seek either, and it waits for nothing', () => {
    const s = run(game({ blanks: [LET, BOAT] }), tick(1000), resync(40000), tick(40100));
    expect(s.lastTickMs).toBe(40100);
    expect(s.status).toEqual({ '0:2': 'pending', '1:3': 'pending' });
    expect(s.phase).toBe('playing');
    expect(s.commands).toEqual([]);
  });

  it('leaves a wait as it is', () => {
    const waiting = run(game(), tick(3850));
    const s = run(waiting, resync(40000));
    expect(s.lastTickMs).toBe(40000);
    expect(s.phase).toBe('waiting');
    expect(s.waitingBlankId).toBe('0:2');
    expect(s.status).toEqual(waiting.status);
    expect(s.commands).toEqual([]);
  });
});

describe('attempt kind', () => {
  it('is retry for every answer after the first one', () => {
    const s = run(game(), answer('0:2', false, 1000), answer('0:2', false, 2000), answer('0:2', true, 3000));
    expect(s.score.records.map((r) => [r.kind, r.correct])).toEqual([
      ['first', false],
      ['retry', false],
      ['retry', true],
    ]);
    expect(s.attempted['0:2']).toBe(true);
  });

  it('is helped once a hint was used, even on a blank already attempted', () => {
    const s = run(game(), answer('0:2', false, 1000), hint('0:2'), answer('0:2', true, 2000));
    expect(s.score.records.map((r) => r.kind)).toEqual(['first', 'helped']);
  });

  it('a wrong answer after a hint is helped and leaves the combo alone', () => {
    const s = run(game({ blanks: [LET, BOAT] }), answer('0:2', true, 3000), hint('1:3'), answer('1:3', false, 5000));
    expect(lastRecord(s)).toEqual({ blankId: '1:3', kind: 'helped', correct: false, beforeLineEnd: true });
    expect(s.score.combo).toBe(1);
    expect(s.score.xp).toBe(12);
  });
});

describe('wrong answers', () => {
  it('with auto-repeat, seek to the start of the blank line, play, and go back to playing', () => {
    const waiting = run(game({ blanks: [BOAT] }), tick(4500), tick(5500), tick(6500), tick(7850));
    expect(waiting.phase).toBe('waiting');

    const s = run(waiting, answer('1:3', false, 7900));
    expect(s.commands).toEqual([{ type: 'seek', ms: 4000 }, { type: 'play', fade: true }]);
    expect(s.phase).toBe('playing');
    expect(s.waitingBlankId).toBeNull();
  });

  it('without auto-repeat, only play; the blank stays wrong and can still be answered', () => {
    const missed = run(game({ autoRepeat: false }), tick(3850), answer('0:2', false, 3900));
    expect(missed.commands).toEqual([{ type: 'play', fade: true }]);
    expect(missed.phase).toBe('playing');
    expect(missed.status['0:2']).toBe('wrong');
    expect(run(missed, tick(3950)).commands).toEqual([]);

    const fixed = run(missed, answer('0:2', true, 5000));
    expect(fixed.status['0:2']).toBe('correct');
    expect(lastRecord(fixed)).toEqual({ blankId: '0:2', kind: 'retry', correct: true, beforeLineEnd: false });
    expect(fixed.commands).toEqual([]);
  });
});

describe('correct answers', () => {
  it('while playing, send nothing', () => {
    const s = run(game(), answer('0:2', true, 3000));
    expect(s.commands).toEqual([]);
    expect(s.status['0:2']).toBe('correct');
  });

  it('are before the line end only when atMs is earlier than the line end', () => {
    expect(lastRecord(run(game(), answer('0:2', true, 3999)))?.beforeLineEnd).toBe(true);
    expect(lastRecord(run(game(), answer('0:2', true, 4000)))?.beforeLineEnd).toBe(false);
  });

  it('close the blank: later answers and hints on it change nothing', () => {
    const done = run(game(), answer('0:2', true, 3000));
    const after = run(done, answer('0:2', false, 3100), hint('0:2'));
    expect(after).toEqual(done);
  });

  it('ignore a blank the game does not have', () => {
    const s = game();
    expect(run(s, answer('9:9', true, 3000), hint('9:9'))).toEqual(s);
  });
});

describe('montar', () => {
  it('a right tile joins the placed row in the line spelling, with nothing recorded yet', () => {
    const s = run(montar(), tile('grandpa'));
    expect(s.tilesPlaced['0:-1']).toEqual(['Grandpa']);
    expect(s.status['0:-1']).toBe('pending');
    expect(s.score.records).toEqual([]);
    expect(s.commands).toEqual([]);
  });

  it('a wrong tile records a first-try miss, clears the row and repeats the line; the next miss is a retry', () => {
    const missed = run(montar(), tile('Grandpa'), tile('let'));
    expect(lastRecord(missed)).toEqual({ blankId: '0:-1', kind: 'first', correct: false, beforeLineEnd: true });
    expect(missed.attempted['0:-1']).toBe(true);
    expect(missed.tilesPlaced['0:-1']).toEqual([]);
    expect(missed.commands).toEqual([{ type: 'seek', ms: 0 }, { type: 'play', fade: true }]);

    expect(lastRecord(run(missed, tile('drive')))?.kind).toBe('retry');
  });

  it('without auto-repeat, a wrong tile only plays', () => {
    expect(run(montar({ autoRepeat: false }), tile('drive')).commands).toEqual([{ type: 'play', fade: true }]);
  });

  it('a line finished after a miss is a retry', () => {
    const s = run(montar(), tile('drive'), ...LINE_TILES.map((word) => tile(word)));
    expect(s.status['0:-1']).toBe('correct');
    expect(lastRecord(s)).toEqual({ blankId: '0:-1', kind: 'retry', correct: true, beforeLineEnd: true });
  });

  it('a hint that places the last tile finishes the line as helped and ends the wait', () => {
    const s = run(montar(), tick(3850), ...LINE_TILES.slice(0, 4).map((word) => tile(word)), hint('0:-1'));
    expect(s.tilesPlaced['0:-1']).toEqual(LINE_TILES);
    expect(s.status['0:-1']).toBe('correct');
    expect(lastRecord(s)).toEqual({ blankId: '0:-1', kind: 'helped', correct: true, beforeLineEnd: true });
    expect(s.commands).toEqual([{ type: 'play', fade: true }]);
    expect(s.phase).toBe('playing');
  });
});

describe('hints outside montar', () => {
  it.each(['escolha', 'digitacao'] as const)('in %s, only mark the blank as hinted', (mode) => {
    const s = game({ mode });
    const hinted = run(s, hint('0:2'));
    expect(hinted).toEqual({ ...s, hinted: { '0:2': true } });
  });
});

describe('REPEAT_LINE', () => {
  const GAP_LINES: LyricLine[] = [
    { index: 0, startMs: 2000, endMs: 4000, text: "Grandpa won't let geese drive" },
    { index: 1, startMs: 6000, endMs: 9000, text: 'Row the small boat home' },
  ];

  it('in a gap between lines, repeats the line before it', () => {
    const s = run(game({ lines: GAP_LINES, blanks: [] }), tick(5000), REPEAT);
    expect(s.commands).toEqual([{ type: 'seek', ms: 2000 }, { type: 'play', fade: true }]);
  });

  it('before the first line, does nothing', () => {
    const s = run(game({ lines: GAP_LINES, blanks: [] }), tick(1000), REPEAT);
    expect(s.commands).toEqual([]);
  });

  it('during a wait, repeats the waited line even when the clip stopped past its end, and pauses there again', () => {
    const waiting = run(game(), tick(3850), tick(4050));
    const repeated = run(waiting, REPEAT);
    expect(repeated.commands).toEqual([{ type: 'seek', ms: 0 }, { type: 'play', fade: true }]);
    expect(repeated.phase).toBe('playing');
    expect(repeated.waitingBlankId).toBeNull();

    const again = run(repeated, tick(0), tick(1000), tick(2000), tick(3000), tick(3850));
    expect(again.commands).toEqual([{ type: 'pause', fade: true }]);
    expect(again.waitingBlankId).toBe('0:2');
  });
});

describe('player state', () => {
  it.each<[PlayerState, boolean]>([
    ['playing', true],
    ['paused', false],
    ['buffering', false],
    ['unstarted', false],
  ])('%s sets playerPlaying to %s', (state, playing) => {
    const s = run(game(), player(state));
    expect(s.playerState).toBe(state);
    expect(s.playerPlaying).toBe(playing);
  });

  describe('clipRunning (ruling S8)', () => {
    it.each<[string, PlayerState[], boolean]>([
      ['playing sets it', ['paused', 'playing'], true],
      ['paused clears it', ['paused'], false],
      ['unstarted clears it', ['unstarted'], false],
      ['ended clears it', ['ended'], false],
      ['buffering leaves it set', ['playing', 'buffering'], true],
      ['buffering leaves it cleared', ['paused', 'buffering'], false],
      ['buffering again leaves it cleared', ['paused', 'buffering', 'buffering'], false],
      ['playing after a stop sets it again', ['playing', 'buffering', 'paused', 'buffering', 'playing'], true],
    ])('%s', (_, states, running) => {
      const s = run(game({ blanks: [] }), ...states.map(player));
      expect(s.clipRunning).toBe(running);
    });

    it('buffering on, then playing again, after the clip was stopped is the player starting it', () => {
      const s = run(game(), tick(3850), player('paused'), player('buffering'), player('playing'));
      expect(s.phase).toBe('playing');
      expect(s.status['0:2']).toBe('skipped');
      expect(s.commands).toEqual([{ type: 'play', fade: true }]);
    });

    it('a blip after the clip was stopped and started over is the player starting it too', () => {
      const s = run(
        game(),
        tick(3850),
        player('buffering'),
        player('paused'),
        player('buffering'),
        player('playing'),
      );
      expect(s.phase).toBe('playing');
      expect(s.status['0:2']).toBe('skipped');
      expect(s.commands).toEqual([{ type: 'play', fade: true }]);
    });

    it('a stopped clip that only buffers does not end the wait until it plays', () => {
      const s = run(game(), tick(3850), player('paused'), player('buffering'));
      expect(s.phase).toBe('waiting');
      expect(s.waitingBlankId).toBe('0:2');
      expect(s.commands).toEqual([]);
    });
  });

  it('a late playing right after the game pause is not the player resuming', () => {
    const s = run(game(), tick(3850), player('playing'));
    expect(s.phase).toBe('waiting');
    expect(s.waitingBlankId).toBe('0:2');
    expect(s.status['0:2']).toBe('pending');
    expect(s.commands).toEqual([]);
  });

  it('started from the player controls during a wait, skips the waited line and plays on', () => {
    const resumed = run(game(), tick(3850), player('paused'), player('playing'));
    expect(resumed.status['0:2']).toBe('skipped');
    expect(resumed.phase).toBe('playing');
    expect(resumed.waitingBlankId).toBeNull();
    // The fade left the volume at 0: the music comes back up (ruling S9).
    expect(resumed.commands).toEqual([{ type: 'play', fade: true }]);
    expect(run(resumed, tick(3950)).commands).toEqual([]);

    expect(lastRecord(run(resumed, answer('0:2', true, 4500)))?.kind).toBe('first');
  });

  it('dragged back before the line end during a wait, keeps the blank pending and pauses there again', () => {
    const resumed = run(game(), tick(3850), player('paused'), tick(2000), player('playing'));
    expect(resumed.status['0:2']).toBe('pending');
    expect(resumed.phase).toBe('playing');

    expect(run(resumed, tick(3000), tick(3850)).commands).toEqual([{ type: 'pause', fade: true }]);
  });

  it('ended with nothing pending ends the game, and every later event changes nothing', () => {
    // The line was skipped, not pending, so it stays open but the end does not wait for it.
    const ended = run(montar(), tick(1000), tick(9000), player('ended'));
    expect(ended.status['0:-1']).toBe('skipped');
    expect(ended.phase).toBe('ended');
    expect(ended.playerPlaying).toBe(false);

    const later: GameEvent[] = [
      tick(3900),
      player('playing'),
      answer('0:-1', true, 3900),
      tile('Grandpa'),
      hint('0:-1'),
      REPEAT,
      resync(5000),
      { type: 'SET_RATE', rate: 0.75 },
    ];
    for (const event of later) {
      const s = gameReducer(ended, event);
      expect(s).not.toBe(ended);
      expect(s).toEqual(ended);
    }
  });
});

describe('the clip ending with a blank still to answer (R39)', () => {
  /** The last line is playing and has not reached its pause point when the clip runs out. */
  const nearTheEnd = [tick(10000), tick(11000), tick(11800)];

  it('waits for the first pending blank instead of ending, with no command', () => {
    const s = run(game({ blanks: [LET, SAIL] }), answer('0:2', true, 3000), ...nearTheEnd, player('ended'));
    expect(s.phase).toBe('waiting');
    expect(s.waitingBlankId).toBe('2:1');
    expect(s.commands).toEqual([]);
  });

  it('answering it ends the game without playing', () => {
    const s = run(game({ blanks: [SAIL] }), ...nearTheEnd, player('ended'), answer('2:1', true, 11900));
    expect(lastRecord(s)).toEqual({ blankId: '2:1', kind: 'first', correct: true, beforeLineEnd: true });
    expect(s.phase).toBe('ended');
    expect(s.waitingBlankId).toBeNull();
    expect(s.commands).toEqual([]);
    expect(summaryOf(s).pct).toBe(100);
  });

  it('a miss without auto-repeat ends it too', () => {
    const start = game({ blanks: [SAIL], autoRepeat: false });
    const s = run(start, ...nearTheEnd, player('ended'), answer('2:1', false, 11900));
    expect(s.phase).toBe('ended');
    expect(s.commands).toEqual([]);
  });

  it('waits for the other pending blanks of that line first', () => {
    const first = run(game({ blanks: [SAIL, TIDE] }), ...nearTheEnd, player('ended'), answer('2:1', true, 11900));
    expect(first.phase).toBe('waiting');
    expect(first.waitingBlankId).toBe('2:4');
    expect(first.commands).toEqual([]);

    expect(run(first, answer('2:4', true, 11950)).phase).toBe('ended');
  });

  it('a hint that finishes the montar line ends it', () => {
    const lastTiles = ['We', 'sail', 'with', 'the'].map((word) => tile(word, 11900, WHOLE_LAST_LINE.id));
    const s = run(montar({ blanks: [WHOLE_LAST_LINE] }), ...nearTheEnd, player('ended'), ...lastTiles, hint('2:-1'));
    expect(s.status['2:-1']).toBe('correct');
    expect(lastRecord(s)?.kind).toBe('helped');
    expect(s.phase).toBe('ended');
    expect(s.commands).toEqual([]);
  });

  it('REPEAT_LINE seeks and plays as usual, and the replayed line then waits and plays like any other', () => {
    const repeated = run(game({ blanks: [SAIL] }), ...nearTheEnd, player('ended'), REPEAT);
    expect(repeated.commands).toEqual([{ type: 'seek', ms: 8000 }, { type: 'play', fade: true }]);
    expect(repeated.phase).toBe('playing');

    const waiting = run(repeated, player('playing'), tick(8000), tick(9000), tick(10000), tick(11000), tick(11850));
    expect(waiting.commands).toEqual([{ type: 'pause', fade: true }]);
    expect(run(waiting, answer('2:1', true, 11900)).commands).toEqual([{ type: 'play', fade: true }]);
  });

  it('ending during a wait keeps the wait, even for a miss waited for again, and its answer ends the game', () => {
    const rewaiting = run(
      game({ blanks: [SAIL] }),
      ...nearTheEnd,
      tick(11850),
      answer('2:1', false, 11900),
      tick(8000),
      tick(9000),
      tick(10000),
      tick(11000),
      tick(11850),
    );
    expect(rewaiting.waitingBlankId).toBe('2:1');

    const ended = run(rewaiting, player('ended'));
    expect(ended.phase).toBe('waiting');
    expect(ended.waitingBlankId).toBe('2:1');

    const answered = run(ended, answer('2:1', true, 11900));
    expect(lastRecord(answered)?.kind).toBe('retry');
    expect(answered.phase).toBe('ended');
    expect(answered.commands).toEqual([]);
  });
});

describe('purity', () => {
  function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === 'object') {
      for (const inner of Object.values(value)) deepFreeze(inner);
      Object.freeze(value);
    }
    return value;
  }

  const SCRIPTS: [string, GameState, GameEvent[]][] = [
    [
      'escolha',
      game({ blanks: [LET, DRIVE, BOAT] }),
      [
        tick(1000),
        resync(1200),
        { type: 'SET_RATE', rate: 0.75 },
        tick(3850),
        tick(3950),
        tick(4050),
        hint('0:2'),
        answer('0:2', false, 3900),
        tick(0),
        tick(3850),
        answer('0:4', true, 3900),
        player('paused'),
        player('playing'),
        REPEAT,
        tick(9000),
        answer('1:3', true, 9100),
        player('ended'),
        tick(9200),
      ],
    ],
    [
      'montar',
      montar(),
      [tick(3850), tile('Grandpa'), tile('let'), hint('0:-1'), tile("won't"), tile('let'), tile('geese'), tile('drive')],
    ],
  ];

  it.each(SCRIPTS)('never changes the state it is given (%s)', (_, start, events) => {
    let s = deepFreeze(start);
    for (const event of events) s = deepFreeze(gameReducer(s, event));
    expect(s.score.records.length).toBeGreaterThan(0);
  });

  it.each(SCRIPTS)('returns a new state every time, with only the commands of that event (%s)', (_, start, events) => {
    let s = start;
    for (const event of events) {
      const next = gameReducer(s, event);
      expect(next).not.toBe(s);
      if (s.commands.length > 0) expect(next.commands).not.toBe(s.commands);
      s = next;
    }
  });

  it('the commands of one event do not carry over to the next', () => {
    const paused = run(game(), tick(3850));
    expect(paused.commands).toEqual([{ type: 'pause', fade: true }]);
    expect(run(paused, hint('0:2')).commands).toEqual([]);
  });
});

describe('summaryOf', () => {
  it('is the summary of the score', () => {
    const s = run(game({ blanks: [LET, BOAT] }), answer('0:2', true, 3000), answer('1:3', false, 5000));
    expect(summaryOf(s)).toEqual(summarize(s.score));
  });
});
