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
    expect(normalizeTyped('get ')).toBe('get');
  });

  it('turns an empty or blank text into an empty text', () => {
    expect(normalizeTyped('')).toBe('');
    expect(normalizeTyped('  ')).toBe('');
    expect(normalizeTyped(' . ')).toBe('');
  });
});

describe('matchTyped', () => {
  it('accepts the answer as exact', () => {
    expect(matchTyped('get', 'get').result).toBe('exact');
    expect(matchTyped('Get ', 'get').result).toBe('exact');
    expect(matchTyped('don’t', "don't").result).toBe('exact');
    expect(matchTyped('get.', 'get').result).toBe('exact');
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

  it('marks a missing apostrophe as wrong when what is left is another real word', () => {
    expect(matchTyped('were', "we're").result).toBe('wrong');
    expect(matchTyped('its', "it's").result).toBe('wrong');
    expect(matchTyped('cause', "'cause").result).toBe('wrong');
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
    expect(matchTyped('im', "I'm").result).toBe('wrong');
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
