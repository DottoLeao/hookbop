import type { VideoMeta } from '@/lib/lyrics/resolveSong';

const OEMBED_URL = 'https://www.youtube.com/oembed';
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Title and channel of a YouTube video, from YouTube's oEmbed. Server code only: the browser is not allowed to ask it.
 * `id` must already be a video id (11 characters); this is not checked again here.
 *
 * Null when oEmbed says 400, 401 or 404, which is how it reports a video that is private, removed or does not exist.
 * Any other failure throws, because it says nothing about the video: another status, no answer in 5 s (unless
 * `timeoutMs` says otherwise), a body that is not JSON, or one without a title and a channel.
 */
export async function fetchOEmbedMeta(
  id: string,
  opts: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<VideoMeta | null> {
  // Taken off `opts` so it runs as a plain function, never as a method of another object.
  const doFetch = opts.fetch ?? fetch;
  const oembed = new URL(OEMBED_URL);
  oembed.searchParams.set('url', `https://www.youtube.com/watch?v=${id}`);
  oembed.searchParams.set('format', 'json');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await doFetch(oembed, { signal: controller.signal });
    // The URL above is always well formed, so oEmbed's 400 can only mean the id is not a real video.
    if (response.status === 400 || response.status === 401 || response.status === 404) return null;
    if (!response.ok) throw new Error(`YouTube oEmbed answered ${response.status}.`);

    const body: unknown = await response.json();
    const { title, author_name: channel } = (typeof body === 'object' && body !== null ? body : {}) as Record<
      string,
      unknown
    >;
    if (typeof title !== 'string' || typeof channel !== 'string') {
      throw new Error('YouTube oEmbed answered in a shape the app does not know.');
    }
    return { title, channel };
  } finally {
    clearTimeout(timer);
  }
}
