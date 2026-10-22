import { describe, expect, it } from 'vitest';
import type { HelpRequest } from './helpService';
import { checkStoredLine, normalizeHelpRequest, parseHelpRequest, targetAsWritten, type StoredVideo } from './validate';

const ID = 'aaaaaaaaaaa';

// Invented lines, not lyrics.
const LRC = [
  '[00:02.00]Paper boats on a river of light',
  '[00:06.00]We’re counting the stars from the roof',
  '[00:10.00]Hold the line till the morning comes',
].join('\n');

const VIDEO: StoredVideo = { status: 'ok', lyricsRef: '777', lyricsLrc: LRC, lyricsDurationS: 30 };

const ASK: HelpRequest = {
  youtubeId: ID,
  lyricsRef: '777',
  lineIndex: 0,
  lineText: 'Paper boats on a river of light',
  kind: 'explain',
  target: 'river',
};

describe('parseHelpRequest', () => {
  it('takes a body with every field of the right type', () => {
    expect(parseHelpRequest({ ...ASK })).toEqual(ASK);
  });

  it('keeps only the fields of a request', () => {
    expect(parseHelpRequest({ ...ASK, extra: 'ignored' })).toEqual(ASK);
  });

  it.each([
    ['not an object', 'hello'],
    ['null', null],
    ['an array', [ASK]],
    ['no youtubeId', { ...ASK, youtubeId: undefined }],
    ['a lyricsRef that is a number', { ...ASK, lyricsRef: 777 }],
    ['a lineIndex that is text', { ...ASK, lineIndex: '0' }],
    ['no lineText', { ...ASK, lineText: undefined }],
    ['an unknown kind', { ...ASK, kind: 'summarize' }],
    ['a target that is not text', { ...ASK, target: null }],
  ])('turns down %s', (_name, body) => {
    expect(parseHelpRequest(body)).toBeNull();
  });
});

describe('normalizeHelpRequest', () => {
  it('folds the target to lowercase, with plain apostrophes, for the cache key', () => {
    expect(normalizeHelpRequest({ ...ASK, target: '  River ' })).toEqual({ ...ASK, target: 'river' });
  });

  it('trims the line', () => {
    expect(normalizeHelpRequest({ ...ASK, lineText: '  Paper boats on a river of light ' })?.lineText).toBe(
      'Paper boats on a river of light',
    );
  });

  it('takes an empty target, which is the whole line', () => {
    expect(normalizeHelpRequest({ ...ASK, target: '' })?.target).toBe('');
  });

  it('takes a target that is part of a word or several words of the line, in any case', () => {
    expect(normalizeHelpRequest({ ...ASK, target: 'BOATS ON' })?.target).toBe('boats on');
  });

  it('matches a target with a plain apostrophe against a line with a curly one', () => {
    const line = 'We’re counting the stars from the roof';
    expect(normalizeHelpRequest({ ...ASK, lineText: line, target: "we're" })?.target).toBe("we're");
  });

  it('takes a line of 300 characters', () => {
    const line = `river ${'a'.repeat(294)}`;
    expect(normalizeHelpRequest({ ...ASK, lineText: line })).not.toBeNull();
  });

  it('takes a target of 40 characters', () => {
    const line = `${'b'.repeat(40)} river`;
    expect(normalizeHelpRequest({ ...ASK, lineText: line, target: 'b'.repeat(40) })).not.toBeNull();
  });

  it.each<[string, Partial<HelpRequest>]>([
    ['a line of more than 300 characters', { lineText: `river ${'a'.repeat(295)}` }],
    ['an empty line', { lineText: '   ' }],
    ['a target of more than 40 characters', { lineText: `${'b'.repeat(41)} river`, target: 'b'.repeat(41) }],
    ['a target that is not on the line', { target: 'ocean' }],
    ['a translation with a target', { kind: 'translate', target: 'river' }],
    ['a line index that is not whole', { lineIndex: 1.5 }],
    ['a negative line index', { lineIndex: -1 }],
    ['a line index that is not a number', { lineIndex: Number.NaN }],
    ['an id that is not a video id', { youtubeId: 'not-an-id' }],
    ['a video link in place of an id', { youtubeId: `https://youtu.be/${ID}` }],
    ['an empty lyrics reference', { lyricsRef: '' }],
  ])('turns down %s', (_name, over) => {
    expect(normalizeHelpRequest({ ...ASK, ...over })).toBeNull();
  });
});

describe('targetAsWritten', () => {
  it('is the target as the line spells it', () => {
    expect(targetAsWritten('Paper boats on a River of light', 'river')).toBe('River');
  });

  it('keeps the curly apostrophe of the line', () => {
    expect(targetAsWritten('We’re counting the stars', "we're")).toBe('We’re');
  });

  it('is empty for the whole line', () => {
    expect(targetAsWritten('Paper boats on a river of light', '')).toBe('');
  });
});

describe('checkStoredLine (ruling R61)', () => {
  it('takes a request for a line of the stored lyrics, with the stored text', () => {
    expect(checkStoredLine(ASK, VIDEO)).toEqual(ASK);
  });

  it('uses the stored text of the line, which the client only had to match once trimmed', () => {
    const checked = checkStoredLine({ ...ASK, lineIndex: 1, lineText: ' We’re counting the stars from the roof  ' }, VIDEO);
    expect(checked?.lineText).toBe('We’re counting the stars from the roof');
  });

  it('numbers the lines as the song screen does: an empty LRC line is not a line', () => {
    const withBreak = { ...VIDEO, lyricsLrc: ['[00:01.00]', LRC].join('\n') };
    expect(checkStoredLine({ ...ASK, lineIndex: 2, lineText: 'Hold the line till the morning comes' }, withBreak)).not.toBeNull();
  });

  it.each<[string, Partial<HelpRequest>, StoredVideo | null]>([
    ['a video the app does not know', {}, null],
    ['a video with no lyrics', {}, { ...VIDEO, status: 'no_lyrics' }],
    ['a video with a status that is not ok', {}, { ...VIDEO, status: null }],
    ['a video whose lyrics are missing', {}, { ...VIDEO, lyricsLrc: null }],
    ['a video whose lyrics have no duration', {}, { ...VIDEO, lyricsDurationS: null }],
    ['other lyrics than the stored ones', { lyricsRef: '778' }, VIDEO],
    ['a line past the last one', { lineIndex: 3 }, VIDEO],
    ['a negative line index', { lineIndex: -1 }, VIDEO],
    ['a line index that is not whole', { lineIndex: 0.5 }, VIDEO],
    ['a line text that is not the stored one', { lineText: 'Paper boats on a sea of light' }, VIDEO],
    ['the text of another line', { lineText: 'Hold the line till the morning comes' }, VIDEO],
  ])('turns down %s', (_name, over, video) => {
    expect(checkStoredLine({ ...ASK, ...over }, video)).toBeNull();
  });
});
