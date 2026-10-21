import { describe, expect, it } from 'vitest';
import blocklist from './data/blocklist.json';
import { inflections } from './distractors';
import { distractorPool, isRealWord } from './words';

/** The plural, -ed, -ing, -er, -est, -ish and -ness forms of a word, with the spelling changes they bring. */
function derivedForms(word: string): string[] {
  const stem = word.slice(0, -1);
  const last = word[word.length - 1];
  const forms = [...inflections(word), `${word}er`, `${word}est`, `${word}ish`, `${word}ness`];
  if (last === 'e') forms.push(`${word}r`, `${word}st`, `${stem}ish`);
  if (last === 'y') forms.push(`${stem}ier`, `${stem}iest`, `${stem}iness`);
  if (/[aeiou][bcdfghjklmnpqrstvz]$/.test(word)) {
    forms.push(`${word}${last}er`, `${word}${last}est`, `${word}${last}ish`);
  }
  return forms;
}

/**
 * Words that look like a form of a blocked word but are other words, so they stay in the pool: butter is not "butt"
 * with -er, assess is not "asses" with -s, spices is not "spic" with -es, and so on.
 */
const OTHER_WORDS = [
  'assess', 'assessed', 'assessing', // asses
  'bummer', // bum
  'butter', 'buttes', // butt
  'hosed', 'hoses', 'hosing', // hos
  'peer', // pee
  'spiced', 'spices', 'spicing', // spic
  'sucker', // suck
  'titter', // tit
];

describe('isRealWord', () => {
  it('knows common English words', () => {
    expect(isRealWord('get')).toBe(true);
    expect(isRealWord('got')).toBe(true);
    expect(isRealWord('late')).toBe(true);
  });

  it('ignores capitals', () => {
    expect(isRealWord('GET')).toBe(true);
    expect(isRealWord('Get')).toBe(true);
    expect(isRealWord('I')).toBe(true);
  });

  it('knows the words in the contraction list, with a straight or a curly apostrophe', () => {
    expect(isRealWord('gonna')).toBe(true);
    expect(isRealWord("ain't")).toBe(true);
    expect(isRealWord("'cause")).toBe(true);
    expect(isRealWord('’cause')).toBe(true);
    expect(isRealWord('Y’ALL')).toBe(true);
  });

  it('treats the other apostrophe-like marks of a keyboard as the apostrophe', () => {
    expect(isRealWord('‘cause')).toBe(true);
    expect(isRealWord('´cause')).toBe(true);
    expect(isRealWord('`cause')).toBe(true);
    expect(isRealWord('ʼcause')).toBe(true);
  });

  it('knows the less common words up to level 50', () => {
    expect(isRealWord('abash')).toBe(true); // level 40
    expect(isRealWord('abalone')).toBe(true); // level 50
  });

  it('still knows the words the blocklist keeps out of the pool, so a typo of them is not mistaken for a word', () => {
    for (const word of ['hell', 'damn', 'crap', 'sex', 'retard', 'suck']) expect(isRealWord(word)).toBe(true);
  });

  it('does not know typos, words from the rarer levels, or an empty text', () => {
    expect(isRealWord('gte')).toBe(false);
    expect(isRealWord('dont')).toBe(false);
    expect(isRealWord('xyzzyq')).toBe(false);
    expect(isRealWord('abseil')).toBe(false); // level 55
    expect(isRealWord('')).toBe(false);
  });
});

describe('distractorPool', () => {
  it('holds the plain lowercase words of levels 10 to 35', () => {
    const pool = distractorPool();
    expect(pool.length).toBeGreaterThan(30000);
    expect(pool).toContain('let');
    expect(pool).toContain('late');
    expect(pool.every((word) => /^[a-z]+$/.test(word))).toBe(true);
  });

  it('leaves out words with accents, capitals and the rarer levels', () => {
    const pool = distractorPool();
    expect(pool).not.toContain('café');
    expect(pool).not.toContain('OK');
    expect(pool).not.toContain('ok');
    expect(pool).not.toContain('abash'); // level 40
    expect(pool).not.toContain('abalone'); // level 50
  });

  it('has no word twice', () => {
    const pool = distractorPool();
    expect(new Set(pool).size).toBe(pool.length);
  });

  it('gives a copy each time, so changing it does not change the next one', () => {
    const first = distractorPool();
    first.length = 0;
    expect(distractorPool()).toContain('let');
  });

  it('only holds words that isRealWord knows', () => {
    expect(distractorPool().every((word) => isRealWord(word))).toBe(true);
  });
});

describe('the blocklist', () => {
  it('is a list of unique lowercase words in alphabetical order', () => {
    expect(blocklist.length).toBeGreaterThan(300);
    expect(blocklist.every((word) => /^[a-z]+$/.test(word))).toBe(true);
    expect(new Set(blocklist).size).toBe(blocklist.length);
    expect([...blocklist].sort()).toEqual(blocklist);
  });

  it('keeps every blocked word out of the pool', () => {
    const pool = new Set(distractorPool());
    expect(blocklist.filter((word) => pool.has(word))).toEqual([]);
  });

  it('really removes words from the pool', () => {
    const pool = new Set(distractorPool());
    const mustGo = ['hell', 'damn', 'crap', 'ass', 'piss', 'sex', 'whore', 'faggot', 'retard'];
    for (const word of [...mustGo, 'rape', 'raped', 'suicide', 'slave', 'slavery']) {
      expect(blocklist).toContain(word);
      expect(pool.has(word)).toBe(false);
    }
  });

  it('covers slurs, sexual and anatomical words, profanity (also the mild kind) and their inflections', () => {
    const expected = [
      // slurs
      'chink', 'chinks', 'faggot', 'faggots', 'queer', 'retarded', 'retards', 'cripple', 'moron', 'midget',
      'nigger',
      // sexual and anatomical
      'sexy', 'sexual', 'porn', 'pornography', 'penis', 'vagina', 'breast', 'nipple', 'tits', 'butt', 'testicles',
      'orgasm', 'masturbation',
      // profanity
      'fuck', 'fucking', 'shit', 'shitty', 'bitch', 'bitches', 'cunt', 'dick', 'cock', 'pussy', 'whore', 'slut',
      'bastard', 'asshole', 'bullshit', 'hell', 'damn', 'damned', 'crap', 'ass', 'asses', 'piss', 'pissed', 'suck',
      'sucks',
      // rape, suicide, slavery
      'rape', 'raped', 'rapes', 'raping', 'rapist', 'suicide', 'suicidal', 'slave', 'slaves', 'slavery', 'enslaved',
    ];
    expect(expected.filter((word) => !blocklist.includes(word))).toEqual([]);
  });

  it('has the forms of the words it was missing: erection, spank, lust, sadism and the like', () => {
    const forms = [
      'erection', 'erections', 'ejaculated', 'ejaculates', 'ejaculating', 'ejaculations', 'molesting', 'molests',
      'spank', 'spanked', 'spanking', 'spankings', 'spanks',
      'foreskins', 'circumcises', 'circumcising', 'circumcisions',
      'slaving', 'slavish', 'damning', 'damnedest', 'hellish', 'nakedness', 'nuder', 'nudest', 'lewder', 'lewdest',
      'crotches', 'cleavages', 'perverting', 'perversions', 'seducing', 'seductions', 'arousing', 'adulteries',
      'wombs', 'enemas', 'smuts', 'holocausts', 'urinated', 'urinates', 'urinating',
      'cocked', 'cocking',
      'sadism', 'sadist', 'sadists', 'masochist', 'masochists', 'masochism',
      'lust', 'lusts', 'lusty', 'lusting', 'lusted', 'lustful',
    ];
    const pool = new Set(distractorPool());
    expect(forms.filter((word) => !blocklist.includes(word))).toEqual([]);
    expect(forms.filter((word) => pool.has(word))).toEqual([]);
  });

  it('has the forms found by scanning the pool for the stems on the list', () => {
    const forms = [
      'bawdier', 'bawdiest', 'bloodied', 'bloodier', 'bloodies', 'bloodiest', 'bloodying', 'booties', 'bummed',
      'bumming', 'bummest', 'butted', 'butting', 'crippling', 'hoed', 'hoeing', 'hornier', 'horniest', 'kinks',
      'kinked', 'kinking',
      'kinkier', 'kinkiest', 'lustier', 'lustiest', 'nipped', 'nipping', 'pricked', 'pricking', 'ravishing', 'sissier',
      'sissiest', 'cretinous', 'sadistic', 'idiocy', 'idiocies',
    ];
    expect(forms.filter((word) => !blocklist.includes(word))).toEqual([]);
  });

  it('leaves no plural, -ed, -ing, -er, -est, -ish or -ness form of a blocked word in the pool', () => {
    const pool = new Set(distractorPool());
    const leaks = blocklist.flatMap((word) => derivedForms(word).filter((form) => form !== word && pool.has(form)));
    expect([...new Set(leaks)].filter((form) => !OTHER_WORDS.includes(form)).sort()).toEqual([]);
  });

  it('leaves out the words that are common in lyrics and not offensive', () => {
    const pool = new Set(distractorPool());
    const allowed = [
      'kill', 'killed', 'killing', 'dead', 'death', 'die', 'fight', 'murder', 'gun', 'war', 'blood', 'drunk',
      'where', 'hello', 'hill', 'six', 'such', 'return', 'use', 'pass', 'class', 'glass', 'shell', 'title', 'analysis',
      'grape', 'scrape', 'rapid', 'assess', 'bass', 'mass', 'cocktail', 'peacock', 'sucker', 'screw', 'gay', 'lesbian',
    ];
    expect(allowed.filter((word) => blocklist.includes(word))).toEqual([]);
    expect(allowed.filter((word) => !pool.has(word))).toEqual([]);
  });
});
