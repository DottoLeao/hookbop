import type { NextRequest } from 'next/server';
import { parseYouTubeId } from '@/lib/youtube/parseUrl';

const OEMBED_URL = 'https://www.youtube.com/oembed';
const TIMEOUT_MS = 5000;
const ONE_DAY_S = 24 * 3600;

const failure = (error: string, status: number) => Response.json({ error }, { status });

/**
 * Title and channel of a YouTube video, read from YouTube's oEmbed on the server, since the browser
 * is not allowed to ask it. Only members reach this route: the proxy turns everyone else away.
 *
 * `?id=` is the video id (a video link works too). Answers `{ title, channel }`, which the browser may keep
 * for a day; 400 for an id that is not a video id; 404 when oEmbed says 400, 401 or 404, which is how it
 * reports a video that is private, removed or does not exist; 502 for any other failure,
 * including no answer in 5 s.
 */
export async function GET(request: NextRequest) {
  const id = parseYouTubeId(request.nextUrl.searchParams.get('id') ?? '');
  if (!id) return failure('invalid_id', 400);

  const oembed = new URL(OEMBED_URL);
  oembed.searchParams.set('url', `https://www.youtube.com/watch?v=${id}`);
  oembed.searchParams.set('format', 'json');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(oembed, { signal: controller.signal });
    // The URL above is always well formed, so oEmbed's 400 can only mean the id is not a real video.
    if (response.status === 400 || response.status === 401 || response.status === 404) {
      return failure('not_found', 404);
    }
    if (!response.ok) return failure('upstream_failed', 502);

    const body: unknown = await response.json();
    const { title, author_name: channel } = (typeof body === 'object' && body !== null ? body : {}) as Record<
      string,
      unknown
    >;
    if (typeof title !== 'string' || typeof channel !== 'string') return failure('upstream_failed', 502);

    return Response.json({ title, channel }, { headers: { 'Cache-Control': `private, max-age=${ONE_DAY_S}` } });
  } catch {
    // Network error, abort by the timeout, or a body that is not JSON.
    return failure('upstream_failed', 502);
  } finally {
    clearTimeout(timer);
  }
}
