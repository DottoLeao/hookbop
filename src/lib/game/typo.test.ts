import { describe, expect, it } from 'vitest';
import { matchTyped, normalizeTyped } from './typo';

describe('normalizeTyped', () => {
  it('lowercases and trims', () => {
    expect(normalizeTyped('  Get ')).toBe('get');
    expect(normalizeTyped('GET')).toBe('get');
  });

  it('turns the curly apostrophes into the plain one', () => {
    expect(normalizeTyped('don’t')).toBe("don't");
    expect(normalizeTyped('‘cause')).toBe("'cause");
  });

  it('removes . , ! ? ; : from the end, however many and wherever the spaces are', () => {
    expect(normalizeTyped('get.')).toBe('get');
    expect(normalizeTyped('get!?')).toBe('get');
    expect(normalizeTyped('get ,')).toBe('get');
    expect(normalizeTyped('get. ')).toBe('get');
    expect(normalizeTyped('get;:')).toBe('get');
  });

  it('keeps punctuation that is not at the end, and apostrophes at the end', () => {
    expect(normalizeTyped('.get')).toBe('.get');
    expect(normalizeTyped("goin'")).toBe("goin'");
    expect(normalizeTyped("don't.")).toBe("don't");
  });

  it('removes the no-break space a phone keyboard may add', () => {
    expect(normalizeTyped('get\u00a0')).toBe('get');
  });

  it('turns every apostrophe-like mark a keyboard makes into the plain one', () => {
    expect(normalizeTyped('donʼt')).toBe("don't");
    expect(normalizeTyped('don´t')).toBe("don't");
    expect(normalizeTyped('don`t')).toBe("don't");
  });

  it('removes zero-width characters and direction marks wherever they are', () => {
    for (const mark of ['\u200b', '\u200c', '\u200d', '\u2060', '\ufeff', '\u200e', '\u200f']) {
      expect(normalizeTyped(`get${mark}`)).toBe('get');
      expect(normalizeTyped(`${mark}get`)).toBe('get');
      expect(normalizeTyped(`g${mark}et`)).toBe('get');
      expect(normalizeTyped(`get. ${mark}`)).toBe('get');
    }
  });

  it('removes the other invisible characters a keyboard or a pasted text may carry', () => {
    const marks = [
      ['\u202a', 'left-to-right embedding'],
      ['\u202b', 'right-to-left embedding'],
      ['\u202c', 'pop directional formatting'],
      ['\u202d', 'left-to-right override'],
      ['\u202e', 'right-to-left override'],
      ['\u2066', 'left-to-right isolate'],
      ['\u2067', 'right-to-left isolate'],
      ['\u2068', 'first strong isolate'],
      ['\u2069', 'pop directional isolate'],
      ['\u061c', 'arabic letter mark'],
      ['\u00ad', 'soft hyphen'],
      ['\u180e', 'mongolian vowel separator'],
    ];
    for (const [mark, name] of marks) {
      expect(normalizeTyped(`get${mark}`), name).toBe('get');
      expect(normalizeTyped(`${mark}get`), name).toBe('get');
      expect(normalizeTyped(`g${mark}et`), name).toBe('get');
      expect(normalizeTyped(`get. ${mark}`), name).toBe('get');
      expect(matchTyped(`${mark}Get${mark}`, 'get').result, name).toBe('exact');
    }
  });

  it('keeps the characters that sit next to those ranges', () => {
    expect(normalizeTyped('g\u2029et')).toBe('g\u2029et'); // paragraph separator
    expect(normalizeTyped('g\u202fet')).toBe('g\u202fet'); // narrow no-break space inside
    expect(normalizeTyped('g\u206aet')).toBe('g\u206aet'); // inhibit symmetric swapping
    expect(normalizeTyped('g¬et')).toBe('g¬et'); // not sign
  });

  it('puts accented letters in their composed form', () => {
    const composed = 'caf\u00e9'; // e with an acute accent, one character
    expect(normalizeTyped('cafe\u0301')).toBe(composed); // e followed by a combining accent
    expect(normalizeTyped('CAFE\u0301')).toBe(composed); // a capital with its accent apart
    expect(normalizeTyped('cafe\u200b\u0301')).toBe(composed); // an invisible character between them
    expect(normalizeTyped('Caf\u00e9')).toBe(composed);
    expect(composed).toHaveLength(4);
  });

  it('removes an ellipsis from the end, as a character or as three full stops', () => {
    expect(normalizeTyped('get…')).toBe('get');
    expect(normalizeTyped('get...')).toBe('get');
    expect(normalizeTyped('get … ')).toBe('get');
    expect(normalizeTyped('get.…')).toBe('get');
    expect(normalizeTyped('…get')).toBe('…get');
  });

  it('turns an empty or blank text into an empty text', () => {
    expect(normalizeTyped('')).toBe('');
    expect(normalizeTyped('  ')).toBe('');
    expect(normalizeTyped(' . ')).toBe('');
    expect(normalizeTyped('\u200b')).toBe('');
    expect(normalizeTyped('…')).toBe('');
  });
});

describe('matchTyped', () => {
  it('accepts the answer as exact', () => {
    expect(matchTyped('get', 'get').result).toBe('exact');
    expect(matchTyped('Get ', 'get').result).toBe('exact');
    expect(matchTyped('don’t', "don't").result).toBe('exact');
    expect(matchTyped('get.', 'get').result).toBe('exact');
  });

  it('takes what a phone keyboard adds or changes as exact', () => {
    expect(matchTyped('donʼt', "don't").result).toBe('exact');
    expect(matchTyped('don´t', "don't").result).toBe('exact');
    expect(matchTyped('don`t', "don't").result).toBe('exact');
    expect(matchTyped('get…', 'get').result).toBe('exact');
    expect(matchTyped('get...', 'get').result).toBe('exact');
    expect(matchTyped('get\u200b', 'get').result).toBe('exact');
    expect(matchTyped('\u200eget\u200f', 'get').result).toBe('exact');
    expect(matchTyped('\ufeffget', 'get').result).toBe('exact');
    expect(matchTyped('cafe\u0301', 'caf\u00e9').result).toBe('exact'); // typed apart, answer in one piece
  });

  it('gives no corrected letters for an exact answer or a wrong one', () => {
    expect(matchTyped('get', 'get')).toEqual({ result: 'exact', correctedIndices: [] });
    expect(matchTyped('got', 'get')).toEqual({ result: 'wrong', correctedIndices: [] });
  });

  it('ignores the capitals of the answer too, and a curly apostrophe in it', () => {
    expect(matchTyped('baby', 'Baby').result).toBe('exact');
    expect(matchTyped('LET', 'let').result).toBe('exact');
    expect(matchTyped("don't", 'don’t').result).toBe('exact');
  });

  it('corrects two swapped letters and marks both', () => {
    expect(matchTyped('gte', 'get')).toEqual({ result: 'corrected', correctedIndices: [1, 2] });
    expect(matchTyped('olve', 'love')).toEqual({ result: 'corrected', correctedIndices: [0, 1] });
    expect(matchTyped('loev', 'love')).toEqual({ result: 'corrected', correctedIndices: [2, 3] });
  });

  it('corrects a missing letter and marks its place in the answer', () => {
    expect(matchTyped('dont', "don't")).toEqual({ result: 'corrected', correctedIndices: [3] });
    expect(matchTyped('lve', 'love')).toEqual({ result: 'corrected', correctedIndices: [1] });
    expect(matchTyped('ove', 'love')).toEqual({ result: 'corrected', correctedIndices: [0] });
    expect(matchTyped('lov', 'love')).toEqual({ result: 'corrected', correctedIndices: [3] });
  });

  it('corrects a missing letter that is one of two the same by marking the second', () => {
    expect(matchTyped('gona', 'gonna')).toEqual({ result: 'corrected', correctedIndices: [3] });
  });

  it('corrects a wrong letter and marks it', () => {
    expect(matchTyped('lofe', 'love')).toEqual({ result: 'corrected', correctedIndices: [2] });
    expect(matchTyped('kove', 'love')).toEqual({ result: 'corrected', correctedIndices: [0] });
    expect(matchTyped('lovr', 'love')).toEqual({ result: 'corrected', correctedIndices: [3] });
  });

  it('corrects an extra letter and marks where it came in', () => {
    expect(matchTyped('loove', 'love')).toEqual({ result: 'corrected', correctedIndices: [2] });
    expect(matchTyped('llove', 'love')).toEqual({ result: 'corrected', correctedIndices: [1] });
  });

  it('marks the last letter when the extra letter came after the answer, so every index is in the answer', () => {
    expect(matchTyped('lovee', 'love')).toEqual({ result: 'corrected', correctedIndices: [3] });
  });

  it('works on the answer in another case and on the input with a stray space or full stop', () => {
    expect(matchTyped(' GTE. ', 'Get')).toEqual({ result: 'corrected', correctedIndices: [1, 2] });
    expect(matchTyped('DONT', "Don't")).toEqual({ result: 'corrected', correctedIndices: [3] });
  });

  it('marks a mistake that is a real word as wrong', () => {
    expect(matchTyped('got', 'get').result).toBe('wrong');
    expect(matchTyped('late', 'lake').result).toBe('wrong');
  });

  it('corrects a dropped apostrophe even when what is left is another real word', () => {
    expect(matchTyped('cause', "'cause")).toEqual({ result: 'corrected', correctedIndices: [0] });
    expect(matchTyped('were', "we're")).toEqual({ result: 'corrected', correctedIndices: [2] });
    expect(matchTyped('its', "it's")).toEqual({ result: 'corrected', correctedIndices: [2] });
    expect(matchTyped('em', "'em")).toEqual({ result: 'corrected', correctedIndices: [0] });
    expect(matchTyped('cant', "can't")).toEqual({ result: 'corrected', correctedIndices: [3] });
    expect(matchTyped('ill', "i'll")).toEqual({ result: 'corrected', correctedIndices: [1] });
  });

  it('corrects a dropped apostrophe in a short answer, whatever its length', () => {
    expect(matchTyped('im', "I'm")).toEqual({ result: 'corrected', correctedIndices: [1] });
    expect(matchTyped('id', "I'd")).toEqual({ result: 'corrected', correctedIndices: [1] });
    expect(matchTyped('em', "'em").result).toBe('corrected');
  });

  it('corrects every apostrophe dropped from an answer that has several', () => {
    expect(matchTyped('rocknroll', "rock'n'roll")).toEqual({ result: 'corrected', correctedIndices: [4, 6] });
    expect(matchTyped('yall', "y'all")).toEqual({ result: 'corrected', correctedIndices: [1] });
  });

  it('marks the dropped apostrophe whatever the case, the marks and the stray characters of the keyboard', () => {
    expect(matchTyped('WERE', "We’re")).toEqual({ result: 'corrected', correctedIndices: [2] });
    expect(matchTyped(' cause. ', '‘cause')).toEqual({ result: 'corrected', correctedIndices: [0] });
    expect(matchTyped('its\u200b', "it's")).toEqual({ result: 'corrected', correctedIndices: [2] });
  });

  it('does not take the apostrophe rule for an answer without an apostrophe, or other letters left out', () => {
    expect(matchTyped('got', 'get').result).toBe('wrong'); // a real word that is not the answer
    expect(matchTyped('wre', "we're").result).toBe('wrong'); // the apostrophe and a letter are missing
    expect(matchTyped("we'r", "we're").result).toBe('corrected'); // one letter missing: the ordinary rule
  });

  it('corrects one dropped apostrophe when the answer has two, with the ordinary rules', () => {
    expect(matchTyped("rock'nroll", "rock'n'roll")).toEqual({ result: 'corrected', correctedIndices: [6] });
  });

  it('counts the words in the contraction list as real words too', () => {
    // "outta" is only real through the contraction list, so typing it for the spelling "outa" is a mistake.
    expect(matchTyped('outta', 'outa').result).toBe('wrong');
    expect(matchTyped('aint', "ain't").result).toBe('corrected');
  });

  it('marks a text that is more than one edit away as wrong', () => {
    expect(matchTyped('gxx', 'get').result).toBe('wrong');
    expect(matchTyped('lv', 'love').result).toBe('wrong');
    expect(matchTyped('lovexx', 'love').result).toBe('wrong');
    expect(matchTyped('evol', 'love').result).toBe('wrong');
  });

  it('only takes an exact answer when the answer has 2 letters or fewer', () => {
    expect(matchTyped('a', 'I').result).toBe('wrong');
    expect(matchTyped('I', 'i').result).toBe('exact');
    expect(matchTyped('ot', 'to').result).toBe('wrong'); // two letters swapped
    expect(matchTyped('tq', 'to').result).toBe('wrong'); // one letter wrong
    expect(matchTyped('t', 'to').result).toBe('wrong'); // one letter missing
  });

  it('counts the letters of the answer, not its apostrophes', () => {
    expect(matchTyped("i'm", "I'm").result).toBe('exact');
    expect(matchTyped("i'n", "I'm").result).toBe('wrong'); // a wrong letter in an answer of 2 letters
    expect(matchTyped("in", "I'm").result).toBe('wrong'); // a wrong letter and no apostrophe
  });

  it('starts to fix the answers that have 3 letters', () => {
    expect(matchTyped('teh', 'the').result).toBe('corrected');
    expect(matchTyped('ae', 'are').result).toBe('corrected');
  });

  it('marks an empty or blank input as wrong', () => {
    expect(matchTyped('', 'get').result).toBe('wrong');
    expect(matchTyped('   ', 'get').result).toBe('wrong');
    expect(matchTyped('.', 'get').result).toBe('wrong');
  });

  it('gives indices that are inside the answer, in order, for every single edit', () => {
    const answers = ['love', 'dancing', "don't", 'gonna', 'remember', 'the'];
    let corrected = 0;
    for (const answer of answers) {
      const edits: string[] = [];
      for (let i = 0; i < answer.length; i++) {
        edits.push(answer.slice(0, i) + answer.slice(i + 1)); // a letter missing
        edits.push(answer.slice(0, i) + 'q' + answer.slice(i + 1)); // a letter replaced
        edits.push(answer.slice(0, i) + 'q' + answer.slice(i)); // a letter added
        if (i < answer.length - 1) {
          edits.push(answer.slice(0, i) + answer[i + 1] + answer[i] + answer.slice(i + 2)); // two swapped
        }
      }
      edits.push(answer + 'q');
      for (const input of edits) {
        const match = matchTyped(input, answer);
        if (match.result !== 'corrected') continue;
        corrected++;
        const { correctedIndices } = match;
        expect([1, 2]).toContain(correctedIndices.length);
        for (const index of correctedIndices) {
          expect(Number.isInteger(index)).toBe(true);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(answer.length);
        }
        expect([...correctedIndices].sort((a, b) => a - b)).toEqual(correctedIndices);
        if (correctedIndices.length === 2) expect(correctedIndices[1] - correctedIndices[0]).toBe(1);
      }
    }
    expect(corrected).toBeGreaterThan(40);
  });
});
