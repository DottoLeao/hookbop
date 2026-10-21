// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const ID = 'dQw4w9WgXcQ';
const OEMBED = { title: 'The Artist - The Song (Official Video)', author_name: 'TheArtistVEVO', type: 'video' };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function get(query: string) {
  return GET(new NextRequest(`http://localhost:3000/api/yt/meta${query}`));
}

/** Replaces fetch with a fake answering YouTube's oEmbed. */
function oembedAnswers(answer: (init: RequestInit | undefined) => Promise<Response>) {
  const fetchFn = vi.fn<typeof fetch>((_input, init) => answer(init));
  vi.stubGlobal('fetch', fetchFn);
  return fetchFn;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('GET /api/yt/meta', () => {
  it('answers with the title and the channel, which members may keep for a day', async () => {
    oembedAnswers(async () => json(OEMBED));

    const response = await get(`?id=${ID}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ title: OEMBED.title, channel: 'TheArtistVEVO' });
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=86400');
  });

  it('asks YouTube oEmbed about the watch page of that video', async () => {
    const fetchFn = oembedAnswers(async () => json(OEMBED));

    await get(`?id=${ID}`);

    expect(fetchFn).toHaveBeenCalledOnce();
    const asked = new URL(String(fetchFn.mock.calls[0][0]));
    expect(`${asked.origin}${asked.pathname}`).toBe('https://www.youtube.com/oembed');
    expect(asked.searchParams.get('url')).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(asked.searchParams.get('format')).toBe('json');
  });

  it('asks about the video of a link too, never about what else the link carries', async () => {
    const fetchFn = oembedAnswers(async () => json(OEMBED));

    await get(`?id=${encodeURIComponent(`https://youtu.be/${ID}?list=PLsomething`)}`);

    const asked = new URL(String(fetchFn.mock.calls[0][0]));
    expect(asked.searchParams.get('url')).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });

  it.each([
    ['no id', ''],
    ['an empty id', '?id='],
    ['an id that is too short', '?id=abc'],
    ['an id with characters a video id cannot have', '?id=dQw4w9WgXc%2F'],
    ['a link to another site', `?id=${encodeURIComponent(`https://example.com/watch?v=${ID}`)}`],
    ['a link with no video', `?id=${encodeURIComponent('https://www.youtube.com/@channel')}`],
  ])('answers 400 for %s, without asking YouTube', async (_name, query) => {
    const fetchFn = oembedAnswers(async () => json(OEMBED));

    const response = await get(query);

    expect(response.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBeNull();
  });

  // The URL sent to oEmbed is always well formed, so its 400 ("Bad Request") can only mean the id is not a real video.
  it.each([400, 401, 404])('answers 404 when oEmbed says %i, which is how it reports a missing, private or unknown video', async (status) => {
    oembedAnswers(async () => new Response(null, { status }));

    const response = await get(`?id=${ID}`);

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBeNull();
  });

  it.each([403, 429, 500, 503])('answers 502 when oEmbed says %i', async (status) => {
    oembedAnswers(async () => new Response(null, { status }));

    expect((await get(`?id=${ID}`)).status).toBe(502);
  });

  it('answers 502 when YouTube cannot be reached', async () => {
    oembedAnswers(() => Promise.reject(new TypeError('fetch failed')));

    expect((await get(`?id=${ID}`)).status).toBe(502);
  });

  it.each([
    ['is not JSON', () => new Response('<html>oops</html>', { status: 200 })],
    ['has no author_name', () => json({ title: 'Only a title' })],
    ['has no title', () => json({ author_name: 'Only a channel' })],
    ['has a title that is not text', () => json({ title: 42, author_name: 'Channel' })],
    ['is null', () => json(null)],
  ])('answers 502 when the oEmbed answer %s', async (_name, answer) => {
    oembedAnswers(async () => answer());

    expect((await get(`?id=${ID}`)).status).toBe(502);
  });

  it('gives up after 5 s and answers 502', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    // Like a real fetch that never gets an answer: it only ends when its signal aborts.
    oembedAnswers((init) => {
      signal = init?.signal;
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
      });
    });

    const pending = get(`?id=${ID}`);
    await vi.advanceTimersByTimeAsync(4999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(signal?.aborted).toBe(true);
    expect((await pending).status).toBe(502);
  });

  it('stops the timer once YouTube has answered', async () => {
    vi.useFakeTimers();
    oembedAnswers(async () => json(OEMBED));

    await get(`?id=${ID}`);

    expect(vi.getTimerCount()).toBe(0);
  });
});
