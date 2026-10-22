import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LyricLine } from '@/lib/types';
import { HelpError } from './helpError';
import type { HelpRequest } from './helpService';
import { postHelp, useLineHelp, type HelpRequester } from './useLineHelp';

// Invented lines, not lyrics.
const LINES: LyricLine[] = [
  { index: 0, startMs: 0, endMs: 4000, text: 'Paper boats on a river of light' },
  { index: 1, startMs: 4000, endMs: 8000, text: 'Hold the line till the morning comes' },
];

function renderHelp(request: HelpRequester, { lyricsRef = '777' as string | undefined } = {}) {
  return renderHook(() => useLineHelp({ youtubeId: 'aaaaaaaaaaa', lyricsRef, lines: LINES, request })).result;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useLineHelp', () => {
  it('asks the server to explain a word of a line, with that line as the game has it', async () => {
    const request = vi.fn<HelpRequester>(async () => 'Rio.');
    const help = renderHelp(request);

    expect(await help.current.explain(0, 'river')).toBe('Rio.');
    expect(request).toHaveBeenCalledExactlyOnceWith({
      youtubeId: 'aaaaaaaaaaa',
      lyricsRef: '777',
      lineIndex: 0,
      lineText: 'Paper boats on a river of light',
      kind: 'explain',
      target: 'river',
    });
  });

  it('asks the server to translate a line, with no target', async () => {
    const request = vi.fn<HelpRequester>(async () => 'Segure a linha');
    const help = renderHelp(request);

    expect(await help.current.translate(1)).toBe('Segure a linha');
    expect(request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ lineIndex: 1, kind: 'translate', target: '' }));
  });

  it('never asks twice for the same help in a session, even for a target typed in another case', async () => {
    const request = vi.fn<HelpRequester>(async () => 'Rio.');
    const help = renderHelp(request);

    await help.current.explain(0, 'river');
    await help.current.explain(0, 'River');
    await help.current.translate(0);
    await help.current.translate(0);

    expect(request).toHaveBeenCalledTimes(2);
  });

  it('shares one request between two asks made before the answer came', async () => {
    let resolve!: (text: string) => void;
    const request = vi.fn<HelpRequester>(() => new Promise((done) => (resolve = done)));
    const help = renderHelp(request);

    const first = help.current.explain(0, 'river');
    const second = help.current.explain(0, 'river');
    resolve('Rio.');

    expect(await first).toBe('Rio.');
    expect(await second).toBe('Rio.');
    expect(request).toHaveBeenCalledOnce();
  });

  it('keeps the asks of another line, kind or target apart', async () => {
    const request = vi.fn<HelpRequester>(async (r: HelpRequest) => `${r.lineIndex}:${r.kind}:${r.target}`);
    const help = renderHelp(request);

    expect(await help.current.explain(0, 'river')).toBe('0:explain:river');
    expect(await help.current.explain(0, 'light')).toBe('0:explain:light');
    expect(await help.current.explain(1, '')).toBe('1:explain:');
    expect(await help.current.translate(1)).toBe('1:translate:');
  });

  it('asks again after a failure, so "Tentar de novo" can work', async () => {
    const request = vi
      .fn<HelpRequester>()
      .mockRejectedValueOnce(new HelpError(503))
      .mockResolvedValueOnce('Rio.');
    const help = renderHelp(request);

    await expect(help.current.explain(0, 'river')).rejects.toEqual(new HelpError(503));
    expect(await help.current.explain(0, 'river')).toBe('Rio.');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('keeps the same functions from one render to the next', () => {
    const request = vi.fn<HelpRequester>();
    const { result, rerender } = renderHook(() =>
      useLineHelp({ youtubeId: 'aaaaaaaaaaa', lyricsRef: '777', lines: LINES, request }),
    );
    const before = result.current;

    rerender();

    expect(result.current).toBe(before);
  });

  it('rejects with 400 and asks nothing for a line that does not exist or a song with no lyrics reference', async () => {
    const request = vi.fn<HelpRequester>();

    await expect(renderHelp(request).current.translate(5)).rejects.toMatchObject({ status: 400 });
    await expect(renderHelp(request, { lyricsRef: '' }).current.translate(0)).rejects.toMatchObject({ status: 400 });
    expect(request).not.toHaveBeenCalled();
  });
});

describe('postHelp', () => {
  const ASK: HelpRequest = {
    youtubeId: 'aaaaaaaaaaa',
    lyricsRef: '777',
    lineIndex: 0,
    lineText: 'Paper boats on a river of light',
    kind: 'translate',
    target: '',
  };

  function serverAnswers(response: Response | Promise<Response>) {
    const fetchFn = vi.fn<typeof fetch>(async () => response);
    vi.stubGlobal('fetch', fetchFn);
    return fetchFn;
  }

  it('posts the ask to /api/help as JSON, never through a cache or a redirect, and gives back the content', async () => {
    const fetchFn = serverAnswers(Response.json({ content: 'Barcos de papel' }));

    expect(await postHelp(ASK)).toBe('Barcos de papel');
    expect(fetchFn).toHaveBeenCalledExactlyOnceWith('/api/help', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ASK),
      cache: 'no-store',
      redirect: 'manual',
    });
  });

  it.each([400, 401, 403, 429, 503])('rejects with a HelpError carrying %i', async (status) => {
    serverAnswers(Response.json({ error: 'x' }, { status }));

    await expect(postHelp(ASK)).rejects.toEqual(new HelpError(status as 400));
  });

  it('reads a redirect, which is how the app turns away someone with no session, as 401', async () => {
    serverAnswers({ type: 'opaqueredirect', status: 0, ok: false } as Response);

    await expect(postHelp(ASK)).rejects.toEqual(new HelpError(401));
  });

  it.each([
    ['the server fails in another way', () => new Response(null, { status: 500 })],
    ['the answer is not JSON', () => new Response('<html>', { status: 200 })],
    ['the answer has no content', () => Response.json({ content: '' })],
  ])('rejects with 503 when %s, so the player can try again', async (_name, response) => {
    serverAnswers(response());

    await expect(postHelp(ASK)).rejects.toEqual(new HelpError(503));
  });

  it('rejects with 503 when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));

    await expect(postHelp(ASK)).rejects.toEqual(new HelpError(503));
  });
});
