import { describe, expect, it } from 'vitest';
import type { LyricLine } from '@/lib/types';
import { hasBlankableWord, selectBlanks, tokenize } from './blanks';
import { seededRng, shuffled } from './rng';

/** A line that is 3 s long (inside the playable range) unless the test says otherwise. */
function line(index: number, text: string, durationMs = 3000): LyricLine {
  const startMs = index * 5000;
  return { index, startMs, endMs: startMs + durationMs, text };
}

/** Thirty different lines with real content words, 4 to 6 words each. */
const THIRTY_TEXTS = [
  'Dancing under neon lights',
  'Summer rain on empty streets',
  'Chasing shadows down the road',
  'Midnight whispers in the dark',
  'Golden sunsets over water',
  'Broken mirrors tell the truth',
  'Falling leaves and silver skies',
  'Burning bridges behind me',
  'Quiet engines hum tonight',
  'Paper planes above the city',
  'Restless hearts keep beating',
  'Velvet clouds drift slowly',
  'Echoes bounce off concrete walls',
  'Lantern flames flicker softly',
  'Crimson horizons call my name',
  'Thunder rolls across the valley',
  'Frozen rivers start to melt',
  'Wandering souls find shelter',
  'Electric dreams never sleep',
  'Marble statues watch the square',
  'Rusty trains cross the border',
  'Candle wax drips on paper',
  'Distant bells ring the hour',
  'Hollow streets remember footsteps',
  'Autumn winds carry secrets',
  'Painted doors open wide',
  'Silent oceans hold the moon',
  'Faded letters smell of smoke',
  'Wooden boats rock gently',
  'Morning light spills through glass',
];
const THIRTY_LINES = THIRTY_TEXTS.map((text, i) => line(i, text));

/** Lines that can never carry a blank, mixed in to prove the share counts only eligible lines. */
const INELIGIBLE_LINES = [
  line(30, 'Dancing under neon lights', 1199),
  line(31, 'Dancing under neon lights', 15001),
  line(32, 'Oh oh oh yeah'),
  line(33, 'I am in it'),
  line(34, ''),
];

const SEEDS = Array.from({ length: 40 }, (_, i) => `seed-${i}`);

describe('seededRng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = seededRng('hookbop');
    const b = seededRng('hookbop');
    const first = [a(), a(), a(), a()];
    expect([b(), b(), b(), b()]).toEqual(first);
  });

  it('gives a different sequence for a different seed', () => {
    const a = seededRng('dQw4w9WgXcQ');
    const b = seededRng('9bZkp7q19f0');
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('only gives numbers from 0 up to but not including 1', () => {
    const next = seededRng('range');
    for (let i = 0; i < 1000; i++) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('keeps giving the values it gave on the day a song was first played', () => {
    // Pinned on purpose: a changed algorithm would change the blanks of every song already played.
    // The values come from a textbook FNV-1a + mulberry32, not from the code under test.
    const next = seededRng('hookbop');
    expect([next(), next(), next()]).toEqual([0.7520650958176702, 0.2965359855443239, 0.007499525789171457]);
  });
});

describe('shuffled', () => {
  it('returns the same items in another order without touching the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffled(input, seededRng('s'));
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
    expect(out).not.toEqual(input);
  });

  it('is the same for the same seed', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(shuffled(input, seededRng('same'))).toEqual(shuffled(input, seededRng('same')));
  });
});

describe('tokenize', () => {
  it('splits words and drops punctuation', () => {
    expect(tokenize('Hello, world! (Yeah...) "Quoted" - fine; ok?')).toEqual([
      'Hello',
      'world',
      'Yeah',
      'Quoted',
      'fine',
      'ok',
    ]);
  });

  it("keeps apostrophes inside a word and at the start of it, in the original case", () => {
    expect(tokenize("Grandpa, won't let geese drive!")).toEqual(['Grandpa', "won't", 'let', 'geese', 'drive']);
    expect(tokenize("'Cause I'm Y'all's rock'n'roll")).toEqual(["'Cause", "I'm", "Y'all's", "rock'n'roll"]);
  });

  it('treats the typographic apostrophe as a plain one', () => {
    expect(tokenize('don’t stop, ’cause I’m here')).toEqual(["don't", 'stop', "'cause", "I'm", 'here']);
  });

  it('treats every apostrophe-like mark of a lyrics site or a keyboard as a plain one', () => {
    expect(tokenize('donʼt')).toEqual(["don't"]); // modifier letter apostrophe
    expect(tokenize('don´t')).toEqual(["don't"]); // acute accent
    expect(tokenize('don`t')).toEqual(["don't"]); // backtick
    expect(tokenize('‘cause I‘m here')).toEqual(["'cause", "I'm", 'here']); // left single quotation mark
    expect(tokenize('`Cause ´tis')).toEqual(["'Cause", "'tis"]);
  });

  it('drops an apostrophe at the end of a word', () => {
    expect(tokenize("singin' to the moon")).toEqual(['singin', 'to', 'the', 'moon']);
  });

  it('keeps numbers and accented letters', () => {
    expect(tokenize('12 lanternas, coração')).toEqual(['12', 'lanternas', 'coração']);
  });

  it('is empty when there are no words', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize(' ... ! ? ')).toEqual([]);
    expect(tokenize("' '")).toEqual([]);
  });
});

describe('selectBlanks', () => {
  it('gives the same result for the same input', () => {
    const a = selectBlanks(THIRTY_LINES, 'medio', 'song-1');
    const b = selectBlanks(THIRTY_LINES, 'medio', 'song-1');
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('draws other lines for another seed', () => {
    const a = selectBlanks(THIRTY_LINES, 'medio', 'song-1').map((b) => b.id);
    const b = selectBlanks(THIRTY_LINES, 'medio', 'song-2').map((x) => x.id);
    expect(a).not.toEqual(b);
  });

  it('does not change the lines it is given', () => {
    const lines = THIRTY_LINES.map((l) => ({ ...l }));
    selectBlanks(lines, 'dificil', 'song-1');
    expect(lines).toEqual(THIRTY_LINES);
  });

  it('is empty without lines', () => {
    expect(selectBlanks([], 'dificil', 'song-1')).toEqual([]);
  });

  it('builds the blank from the line index and the token index, with the word as it was written', () => {
    const lines = [line(7, 'Dancing under neon lights')];
    for (const seed of SEEDS) {
      const blanks = selectBlanks(lines, 'dificil', seed);
      expect(blanks).toHaveLength(1);
      const [blank] = blanks;
      const tokens = tokenize(lines[0].text);
      expect(blank.lineIndex).toBe(7);
      expect(blank.id).toBe(`7:${blank.tokenIndex}`);
      expect(blank.answer).toBe(tokens[blank.tokenIndex]);
    }
  });

  it('returns the blanks in line order, and in token order inside a line', () => {
    const blanks = selectBlanks([...INELIGIBLE_LINES, ...THIRTY_LINES], 'dificil', 'order');
    const keys = blanks.map((b) => [b.lineIndex, b.tokenIndex]);
    const sorted = [...keys].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    expect(keys).toEqual(sorted);
  });

  describe('which word of the line', () => {
    it('prefers the verb of a phrasal verb whose particle comes later in the line', () => {
      const lines = [line(0, "Tonight we'll let the ladder down slowly")];
      for (const seed of SEEDS) {
        expect(selectBlanks(lines, 'dificil', seed)).toEqual([
          { id: '0:2', lineIndex: 0, tokenIndex: 2, answer: 'let' },
        ]);
      }
    });

    it('does not treat the verb as a phrasal verb when the particle comes before it', () => {
      const lines = [line(0, 'Down the hallway grandma let bubbles float')];
      const answers = new Set(SEEDS.flatMap((seed) => selectBlanks(lines, 'dificil', seed).map((b) => b.answer)));
      // Without a particle after it, "let" is only an ordinary word, so it does not win every time.
      expect(answers.size).toBeGreaterThan(1);
    });

    it('prefers a contraction from the list over an ordinary word', () => {
      const lines = [line(0, "I'm gonna make it tonight")];
      for (const seed of SEEDS) {
        expect(selectBlanks(lines, 'dificil', seed)).toEqual([
          { id: '0:1', lineIndex: 0, tokenIndex: 1, answer: 'gonna' },
        ]);
      }
    });

    it('finds a contraction written with a capital or a leading apostrophe', () => {
      expect(selectBlanks([line(0, 'Gonna fly away tonight')], 'dificil', 's')[0].answer).toBe('Gonna');
      expect(selectBlanks([line(0, "Gravy waits 'cause the oven hums")], 'dificil', 's')[0].answer).toBe("'cause");
    });

    it('prefers a phrasal verb over a contraction', () => {
      const lines = [line(0, "I'm gonna give up tonight")];
      for (const seed of SEEDS) {
        expect(selectBlanks(lines, 'dificil', seed)[0].answer).toBe('give');
      }
    });

    it('never picks an ad-lib or a stopword, only the content words', () => {
      const lines = [line(0, 'You knit the fog, oh yeah, I nap')];
      const banned = new Set(['oh', 'yeah', 'i', 'the', 'you']);
      for (const seed of SEEDS) {
        for (const blank of selectBlanks(lines, 'dificil', seed)) {
          expect(banned.has(blank.answer.toLowerCase())).toBe(false);
          expect(['knit', 'fog', 'nap']).toContain(blank.answer);
        }
      }
    });

    it('never picks any of the ad-lib shapes, stretched or not, in any case', () => {
      const adLibs =
        'ohh ooh oohh oooh ooooh ooo YEAHHH yeah yaaa laaa naaa nanana lalala dadada uhhh hey heyyy ' +
        'woah whoa whoaa woooah ahhh mmm hmm huh haaa';
      const lines = [line(0, `${adLibs} sunshine`)];
      for (const seed of SEEDS) {
        expect(selectBlanks(lines, 'dificil', seed).map((b) => b.answer)).toEqual(['sunshine']);
      }
    });

    it('never picks a word shorter than three letters', () => {
      const lines = [line(0, 'Go to my big old car')];
      for (const seed of SEEDS) {
        const blank = selectBlanks(lines, 'dificil', seed)[0];
        expect(blank.answer.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('never picks a capitalized word in the middle of the line, because it is a name', () => {
      const lines = [line(0, 'Dancing with Maria tonight')];
      const answers = new Set<string>();
      for (const seed of SEEDS) {
        for (const blank of selectBlanks(lines, 'dificil', seed)) answers.add(blank.answer);
      }
      expect(answers.has('Maria')).toBe(false);
      // The first word of the line is capitalized only because it starts the line, so it can still be picked.
      expect(answers.has('Dancing')).toBe(true);
      expect(answers.has('tonight')).toBe(true);
    });

    it('does not even pick a name when the line has nothing else left', () => {
      expect(selectBlanks([line(0, 'I love Maria')], 'dificil', 's').map((b) => b.answer)).toEqual(['love']);
      expect(selectBlanks([line(0, 'Oh you and Maria')], 'dificil', 's')).toEqual([]);
    });

    it('gives no blank to a line made only of ad-libs, stopwords and short words', () => {
      const lines = [line(0, 'Oh oh oh yeah'), line(1, 'I am in it'), line(2, 'Na na na'), line(3, '')];
      expect(selectBlanks(lines, 'dificil', 's')).toEqual([]);
    });
  });

  describe('ad-libs and real words', () => {
    it('does not mistake real words for ad-libs', () => {
      const words = ['laugh', 'honey', 'hurry', 'heart', 'nap', 'hold', 'yarn', 'dance', 'ahead', 'whole', 'woman', 'hug'];
      for (const word of words) {
        expect(selectBlanks([line(0, `oh oh ${word}`)], 'dificil', 's').map((b) => b.answer)).toEqual([word]);
      }
    });
  });

  describe('prepositions and particles', () => {
    it('never picks a loose preposition or a bare particle', () => {
      const loose =
        'under around after before between against across behind beyond near until since during within along ' +
        'among toward towards below beneath beside above over through without down up out off away';
      const lines = [line(0, `${loose} sunshine`)];
      for (const seed of SEEDS) {
        expect(selectBlanks(lines, 'dificil', seed).map((b) => b.answer)).toEqual(['sunshine']);
      }
    });

    it('never picks "through" in "Sprint through the custard"', () => {
      const lines = [line(0, 'Sprint through the custard')];
      const answers = new Set(SEEDS.flatMap((seed) => selectBlanks(lines, 'dificil', seed).map((b) => b.answer)));
      expect(answers.has('through')).toBe(false);
      expect([...answers].sort()).toEqual(['Sprint', 'custard']);
    });

    it('still finds a phrasal verb whose particle is now a stopword', () => {
      for (const seed of SEEDS) {
        expect(selectBlanks([line(0, 'Time to wake up')], 'dificil', seed).map((b) => b.answer)).toEqual(['wake']);
        expect(selectBlanks([line(0, 'Time to give up now')], 'dificil', seed).map((b) => b.answer)).toEqual(['give']);
      }
    });
  });

  describe('a leading apostrophe', () => {
    it("is ignored when looking up stopwords and ad-libs, so 'you, 'hey, 'ooh and 'the are not blanks", () => {
      const lines = [line(0, "'you 'hey 'ooh 'the sunshine")];
      for (const seed of SEEDS) {
        expect(selectBlanks(lines, 'dificil', seed).map((b) => b.answer)).toEqual(['sunshine']);
      }
    });

    it("is ignored when looking for a phrasal verb too, so a quoted 'let ... down still wins", () => {
      for (const seed of SEEDS) {
        expect(selectBlanks([line(0, "Tonight we'll 'let the ladder down' slowly")], 'dificil', seed).map((b) => b.answer)).toEqual([
          "'let",
        ]);
        expect(selectBlanks([line(0, "Tonight we'll let the ladder 'down slowly")], 'dificil', seed).map((b) => b.answer)).toEqual([
          'let',
        ]);
      }
    });

    it("is ignored for the contraction list too, so a quoted 'gonna is still a contraction", () => {
      for (const seed of SEEDS) {
        expect(selectBlanks([line(0, "Please 'gonna fly tonight")], 'dificil', seed).map((b) => b.answer)).toEqual([
          "'gonna",
        ]);
      }
    });

    it("does not stop 'cause from being a contraction", () => {
      expect(selectBlanks([line(0, "Wobble 'cause I sneeze")], 'dificil', 's').map((b) => b.answer)).toEqual(["'cause"]);
    });
  });

  describe('lines in capitals', () => {
    it('gives an ALL CAPS line a blank, because capitals say nothing about names there', () => {
      const lines = [line(0, 'YOU KNIT THE FOG, I NAP')];
      const answers = new Set<string>();
      for (const seed of SEEDS) {
        const picked = selectBlanks(lines, 'dificil', seed).map((b) => b.answer);
        expect(picked).toHaveLength(1);
        picked.forEach((answer) => answers.add(answer));
      }
      expect([...answers].sort()).toEqual(['FOG', 'KNIT', 'NAP']);
    });

    it('compares stopwords and the lists without caring about case', () => {
      const lines = [line(0, "I'M GONNA MAKE IT TONIGHT")];
      for (const seed of SEEDS) {
        expect(selectBlanks(lines, 'dificil', seed).map((b) => b.answer)).toEqual(['GONNA']);
      }
    });

    it('still gives the phrasal verb priority on an ALL CAPS line', () => {
      const lines = [line(0, "TONIGHT WE'LL LET THE LADDER DOWN SLOWLY")];
      for (const seed of SEEDS) {
        expect(selectBlanks(lines, 'dificil', seed)).toEqual([
          { id: '0:2', lineIndex: 0, tokenIndex: 2, answer: 'LET' },
        ]);
      }
    });

    it('can pick a capitalized word in the middle of a Title Case line', () => {
      const answers = new Set<string>();
      for (const seed of SEEDS) {
        selectBlanks([line(0, 'Juggling Our Purple Teacups')], 'dificil', seed).forEach((b) => answers.add(b.answer));
      }
      expect([...answers].sort()).toEqual(['Juggling', 'Purple', 'Teacups']);
    });

    it('does not let a short lowercase word turn the name rule back on', () => {
      const answers = new Set<string>();
      for (const seed of SEEDS) {
        selectBlanks([line(0, 'Dancing in Paris Tonight')], 'dificil', seed).forEach((b) => answers.add(b.answer));
      }
      expect([...answers].sort()).toEqual(['Dancing', 'Paris', 'Tonight']);
    });

    it('gives the phrasal verb priority on a Title Case line too', () => {
      // "Turn Up The Kazoo Volume Tonight": turn + up is a phrasal verb, so "Turn" wins over Kazoo, Volume and Tonight.
      for (const seed of SEEDS) {
        expect(selectBlanks([line(0, 'Turn Up The Kazoo Volume Tonight')], 'dificil', seed).map((b) => b.answer)).toEqual([
          'Turn',
        ]);
      }
    });

    it('keeps the name rule on a normal line that has one lowercase word of 3 letters or more', () => {
      for (const seed of SEEDS) {
        expect(selectBlanks([line(0, 'DANCING with MARIA TONIGHT')], 'dificil', seed).map((b) => b.answer)).toEqual([
          'DANCING',
        ]);
      }
    });
  });

  describe('hasBlankableWord', () => {
    it('is true when the line has a usable word, in any case', () => {
      expect(hasBlankableWord(tokenize('Dancing with Maria tonight'))).toBe(true);
      expect(hasBlankableWord(tokenize('YOU KNIT THE FOG'))).toBe(true);
    });

    it('is false for ad-libs, stopwords, short words and names alone', () => {
      expect(hasBlankableWord(tokenize('Oh oh oh yeah'))).toBe(false);
      expect(hasBlankableWord(tokenize('Na na na na'))).toBe(false);
      expect(hasBlankableWord(tokenize('I am in it'))).toBe(false);
      expect(hasBlankableWord(tokenize('Oh you and Maria'))).toBe(false);
      expect(hasBlankableWord([])).toBe(false);
    });
  });

  describe('which lines', () => {
    it('gives no blank to a line shorter than 1200 ms or longer than 15000 ms', () => {
      const lines = [
        line(0, 'Dancing under neon lights', 1199),
        line(1, 'Dancing under neon lights', 15001),
        line(2, 'Dancing under neon lights', 0),
      ];
      expect(selectBlanks(lines, 'dificil', 's')).toEqual([]);
    });

    it('gives a blank to a line of exactly 1200 ms or exactly 15000 ms', () => {
      const lines = [line(0, 'Dancing under neon lights', 1200), line(1, 'Quiet engines hum tonight', 15000)];
      expect(selectBlanks(lines, 'dificil', 's').map((b) => b.lineIndex)).toEqual([0, 1]);
    });

    it('uses the line duration, end minus start, and not the time it starts at', () => {
      const lines: LyricLine[] = [{ index: 0, startMs: 600000, endMs: 603000, text: 'Dancing under neon lights' }];
      expect(selectBlanks(lines, 'dificil', 's')).toHaveLength(1);
    });

    it('gives a third of the eligible lines a blank in facil', () => {
      for (const seed of SEEDS.slice(0, 10)) {
        const blanks = selectBlanks([...INELIGIBLE_LINES, ...THIRTY_LINES], 'facil', seed);
        expect(blanks.length).toBeGreaterThanOrEqual(9);
        expect(blanks.length).toBeLessThanOrEqual(11);
      }
    });

    it('gives half of the eligible lines a blank in medio', () => {
      for (const seed of SEEDS.slice(0, 10)) {
        const blanks = selectBlanks([...INELIGIBLE_LINES, ...THIRTY_LINES], 'medio', seed);
        expect(blanks.length).toBeGreaterThanOrEqual(14);
        expect(blanks.length).toBeLessThanOrEqual(16);
      }
    });

    it('gives every eligible line a blank in dificil', () => {
      for (const seed of SEEDS.slice(0, 10)) {
        const blanks = selectBlanks([...INELIGIBLE_LINES, ...THIRTY_LINES], 'dificil', seed);
        expect(blanks.length).toBeGreaterThanOrEqual(30);
        expect(new Set(blanks.map((b) => b.lineIndex)).size).toBe(30);
      }
    });

    it('puts one blank on each drawn line in facil and medio, and never on an ineligible line', () => {
      for (const difficulty of ['facil', 'medio'] as const) {
        const blanks = selectBlanks([...INELIGIBLE_LINES, ...THIRTY_LINES], difficulty, 'one-each');
        const lineIndexes = blanks.map((b) => b.lineIndex);
        expect(new Set(lineIndexes).size).toBe(lineIndexes.length);
        expect(lineIndexes.every((i) => i < 30)).toBe(true);
      }
    });

    it('counts a line with no usable word as not eligible, so the share is not wasted on it', () => {
      const lines = [...THIRTY_LINES, ...Array.from({ length: 30 }, (_, i) => line(100 + i, 'Oh yeah I am'))];
      const blanks = selectBlanks(lines, 'medio', 'share');
      expect(blanks).toHaveLength(15);
    });

    it('draws every eligible line at some point across seeds, so none is left out for good', () => {
      const seen = new Set<number>();
      for (const seed of SEEDS) {
        for (const blank of selectBlanks(THIRTY_LINES, 'facil', seed)) seen.add(blank.lineIndex);
      }
      expect(seen.size).toBe(30);
    });
  });

  describe('second blank in dificil', () => {
    const EIGHT = 'Dancing under neon lights while the city sleeps'; // 8 words
    const SEVEN = 'Dancing under neon lights while city sleeps'; // 7 words

    it('counts the words with tokenize, so the test lines have the lengths they claim', () => {
      expect(tokenize(EIGHT)).toHaveLength(8);
      expect(tokenize(SEVEN)).toHaveLength(7);
    });

    it('gives a line of 8 words or more two blanks on two different words', () => {
      for (const seed of SEEDS) {
        const blanks = selectBlanks([line(0, EIGHT)], 'dificil', seed);
        expect(blanks).toHaveLength(2);
        expect(blanks[0].tokenIndex).not.toBe(blanks[1].tokenIndex);
        expect(blanks[0].tokenIndex).toBeLessThan(blanks[1].tokenIndex);
        expect(blanks.map((b) => b.id)).toEqual([`0:${blanks[0].tokenIndex}`, `0:${blanks[1].tokenIndex}`]);
        expect(blanks.every((b) => b.answer.toLowerCase() !== 'the')).toBe(true);
      }
    });

    it('gives a line of 7 words one blank', () => {
      for (const seed of SEEDS) {
        expect(selectBlanks([line(0, SEVEN)], 'dificil', seed)).toHaveLength(1);
      }
    });

    it('keeps the order of preference for the second blank too', () => {
      const lines = [line(0, "We'll let the ladder down, I'm gonna make it tonight")]; // 10 words
      for (const seed of SEEDS) {
        expect(selectBlanks(lines, 'dificil', seed).map((b) => b.answer)).toEqual(['let', 'gonna']);
      }
    });

    it('gives only one blank when the long line has just one usable word', () => {
      const lines = [line(0, 'Oh yeah I know you and Maria are in it')]; // 10 words
      expect(selectBlanks(lines, 'dificil', 's').map((b) => b.answer)).toEqual(['know']);
    });

    it('does not give a second blank in facil or medio', () => {
      const lines = Array.from({ length: 30 }, (_, i) => line(i, EIGHT));
      for (const difficulty of ['facil', 'medio'] as const) {
        const blanks = selectBlanks(lines, difficulty, 'long');
        expect(new Set(blanks.map((b) => b.lineIndex)).size).toBe(blanks.length);
      }
    });
  });
});
