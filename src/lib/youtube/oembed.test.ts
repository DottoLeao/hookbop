// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOEmbedMeta } from './oembed';

const ID = 'dQw4w9WgXcQ';
const OEMBED = { title: 'Invented Artist - Invented Song (Official Video)', author_name: 'InventedArtistVEVO', type: 'video' };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A fake fetch answering as YouTube's oEmbed would. */
function oembedAnswers(answer: (init: RequestInit | undefined) => Promise<Response>) {
  return vi.fn<typeof fetch>((_input, init) => answer(init));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchOEmbedMeta', () => {
  it('gives the title and the channel', async () => {
    const fetchFn = oembedAnswers(async () => json(OEMBED));

    expect(await fetchOEmbedMeta(ID, { fetch: fetchFn })).toEqual({ title: OEMBED.title, channel: 'InventedArtistVEVO' });
  });

  it('asks YouTube oEmbed about the watch page of that video', async () => {
    const fetchFn = oembedAnswers(async () => json(OEMBED));

    await fetchOEmbedMeta(ID, { fetch: fetchFn });

    expect(fetchFn).toHaveBeenCalledOnce();
    const asked = new URL(String(fetchFn.mock.calls[0][0]));
    expect(`${asked.origin}${asked.pathname}`).toBe('https://www.youtube.com/oembed');
    expect(asked.searchParams.get('url')).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(asked.searchParams.get('format')).toBe('json');
  });

  // The URL sent to oEmbed is always well formed, so its 400 ("Bad Request") can only mean the id is not a real video.
  it.each([400, 401, 404])('is null when oEmbed says %i, which is how it reports a missing, private or unknown video', async (status) => {
    const fetchFn = oembedAnswers(async () => new Response(null, { status }));

    expect(await fetchOEmbedMeta(ID, { fetch: fetchFn })).toBeNull();
  });

  it.each([403, 429, 500, 503])('throws when oEmbed says %i, which says nothing about the video', async (status) => {
    const fetchFn = oembedAnswers(async () => new Response(null, { status }));

    await expect(fetchOEmbedMeta(ID, { fetch: fetchFn })).rejects.toThrow(String(status));
  });

  it('throws when YouTube cannot be reached', async () => {
    const fetchFn = oembedAnswers(() => Promise.reject(new TypeError('fetch failed')));

    await expect(fetchOEmbedMeta(ID, { fetch: fetchFn })).rejects.toThrow();
  });

  it.each([
    ['is not JSON', () => new Response('<html>oops</html>', { status: 200 })],
    ['has no author_name', () => json({ title: 'Only a title' })],
    ['has no title', () => json({ author_name: 'Only a channel' })],
    ['has a title that is not text', () => json({ title: 42, author_name: 'Channel' })],
    ['is null', () => json(null)],
  ])('throws when the oEmbed answer %s', async (_name, answer) => {
    const fetchFn = oembedAnswers(async () => answer());

    await expect(fetchOEmbedMeta(ID, { fetch: fetchFn })).rejects.toThrow();
  });

  it('gives up after 5 s', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    // Like a real fetch that never gets an answer: it only ends when its signal aborts.
    const fetchFn = oembedAnswers((init) => {
      signal = init?.signal;
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
      });
    });

    const pending = fetchOEmbedMeta(ID, { fetch: fetchFn });
    const failed = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(4999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(signal?.aborted).toBe(true);
    await failed;
  });

  it('stops the timer once YouTube has answered', async () => {
    vi.useFakeTimers();
    const fetchFn = oembedAnswers(async () => json(OEMBED));

    await fetchOEmbedMeta(ID, { fetch: fetchFn });

    expect(vi.getTimerCount()).toBe(0);
  });
});
