import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchVideoMeta } from './fetchVideoMeta';

const ID = 'dQw4w9WgXcQ';

function serverAnswers(response: Response | Promise<Response>) {
  const fetchFn = vi.fn<typeof fetch>(async () => response);
  vi.stubGlobal('fetch', fetchFn);
  return fetchFn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchVideoMeta', () => {
  it('asks the app for the video and returns its title and channel', async () => {
    const fetchFn = serverAnswers(new Response(JSON.stringify({ title: 'The Song', channel: 'The Artist' })));

    expect(await fetchVideoMeta(ID)).toEqual({ title: 'The Song', channel: 'The Artist' });
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(String(fetchFn.mock.calls[0][0])).toBe(`/api/yt/meta?id=${ID}`);
  });

  it('is null when the video does not exist', async () => {
    serverAnswers(new Response(null, { status: 404 }));

    expect(await fetchVideoMeta(ID)).toBeNull();
  });

  it.each([400, 401, 500, 502])('fails when the app answers %i, which says nothing about the video', async (status) => {
    serverAnswers(new Response(null, { status }));

    await expect(fetchVideoMeta(ID)).rejects.toThrow(String(status));
  });

  it('fails when the request cannot be made', async () => {
    serverAnswers(Promise.reject(new TypeError('Failed to fetch')));

    await expect(fetchVideoMeta(ID)).rejects.toThrow('Failed to fetch');
  });

  it.each([
    ['is not JSON', () => new Response('<html>oops</html>')],
    ['has no channel', () => new Response(JSON.stringify({ title: 'The Song' }))],
    ['has no title', () => new Response(JSON.stringify({ channel: 'The Artist' }))],
    ['is null', () => new Response('null')],
  ])('fails when the answer %s', async (_name, answer) => {
    serverAnswers(answer());

    await expect(fetchVideoMeta(ID)).rejects.toThrow();
  });
});
