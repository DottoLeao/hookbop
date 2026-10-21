import { describe, expect, it } from 'vitest';
import { activeLineIndex, applyOffset, parseLrc } from './lrc';

describe('parseLrc', () => {
  const a = parseLrc('[ar:X]\n[00:12.34]Hello\n[00:15.00]World', 20000);

  it('reads timestamps and ends each line where the next one starts', () => {
    expect(a).toEqual([
      { index: 0, startMs: 12340, endMs: 15000, text: 'Hello' },
      { index: 1, startMs: 15000, endMs: 20000, text: 'World' },
    ]);
  });

  it('reads three-digit fractions as milliseconds and gives the last line 5 s without a duration', () => {
    expect(parseLrc('[01:02.345]X')[0].startMs).toBe(62345);
    expect(parseLrc('[01:02.345]X')[0].endMs).toBe(67345);
  });

  it('accepts timestamps without a fraction and with a one-digit fraction', () => {
    expect(parseLrc('[00:07]A\n[00:08.5]B').map((l) => l.startMs)).toEqual([7000, 8500]);
  });

  it('expands a line with several timestamps and sorts the result by time', () => {
    expect(parseLrc('[00:40.00][00:10.00]Chorus').map((l) => l.startMs)).toEqual([10000, 40000]);
  });

  it('uses an empty line to end the previous line and drops it from the result', () => {
    const gap = parseLrc('[00:10.00]A\n[00:12.00]\n[00:30.00]B');
    expect(gap.map((l) => [l.text, l.endMs])).toEqual([
      ['A', 12000],
      ['B', 35000],
    ]);
    expect(gap[1].index).toBe(1);
  });

  it('ends the last line at the total duration when it is given', () => {
    expect(parseLrc('[00:10.00]A', 12000)[0].endMs).toBe(12000);
  });

  it('ignores a total duration that does not come after the last line', () => {
    expect(parseLrc('[00:10.00]A', 8000)[0].endMs).toBe(15000);
  });

  it('handles Windows line endings and spaces around the text', () => {
    expect(parseLrc('[00:01.00]  Hi there \r\n[00:03.00]Bye\r\n').map((l) => l.text)).toEqual([
      'Hi there',
      'Bye',
    ]);
  });

  it('returns no lines for text without timestamps', () => {
    expect(parseLrc('')).toEqual([]);
    expect(parseLrc('[ar:X]\n[ti:Y]\njust words')).toEqual([]);
  });
});

describe('applyOffset', () => {
  const a = parseLrc('[ar:X]\n[00:12.34]Hello\n[00:15.00]World', 20000);

  it('shifts every line by the offset', () => {
    expect(applyOffset(a, 2000)[0]).toMatchObject({ startMs: 14340, endMs: 17000 });
    expect(applyOffset(a, -2000)[1]).toMatchObject({ startMs: 13000, endMs: 18000 });
  });

  it('never goes below zero', () => {
    expect(applyOffset(a, -20000)[0].startMs).toBe(0);
    expect(applyOffset(a, -20000)[0].endMs).toBe(0);
  });

  it('keeps the index and text and leaves the input untouched', () => {
    const shifted = applyOffset(a, 1000);
    expect(shifted.map((l) => [l.index, l.text])).toEqual([
      [0, 'Hello'],
      [1, 'World'],
    ]);
    expect(a[0].startMs).toBe(12340);
  });
});

describe('activeLineIndex', () => {
  const a = parseLrc('[ar:X]\n[00:12.34]Hello\n[00:15.00]World', 20000);
  const gap = parseLrc('[00:10.00]A\n[00:12.00]\n[00:30.00]B');

  it('returns -1 before the first line', () => {
    expect(activeLineIndex(a, 11000)).toBe(-1);
  });

  it('returns the line that contains the time, with the start included', () => {
    expect(activeLineIndex(a, 12340)).toBe(0);
    expect(activeLineIndex(a, 14999)).toBe(0);
    expect(activeLineIndex(a, 15000)).toBe(1);
  });

  it('returns -1 once the last line has ended', () => {
    expect(activeLineIndex(a, 19999)).toBe(1);
    expect(activeLineIndex(a, 20000)).toBe(-1);
  });

  it('returns -1 inside a gap between two lines', () => {
    expect(activeLineIndex(gap, 20000)).toBe(-1);
    expect(activeLineIndex(gap, 31000)).toBe(1);
  });

  it('returns -1 for an empty list', () => {
    expect(activeLineIndex([], 5000)).toBe(-1);
  });

  it('finds the right line in a long list', () => {
    // One line every 10 s: [00:00.00], [00:10.00], ... [00:50.00], [01:00.00], ...
    const lrc = Array.from({ length: 200 }, (_, i) => {
      const minutes = String(Math.floor(i / 6)).padStart(2, '0');
      const seconds = String((i % 6) * 10).padStart(2, '0');
      return `[${minutes}:${seconds}.00]Line ${i}`;
    }).join('\n');
    const lines = parseLrc(lrc);
    expect(lines).toHaveLength(200);
    for (const probe of [0, 1, 57, 128, 199]) {
      expect(activeLineIndex(lines, lines[probe].startMs + 1)).toBe(probe);
    }
  });
});
