import type { VideoMeta } from '@/lib/lyrics/resolveSong';

/**
 * Title and channel of a YouTube video, through the app's own `/api/yt/meta` route
 * (the browser cannot ask YouTube's oEmbed directly).
 * Null when the video does not exist. Any other failure throws, because it says nothing about the video.
 */
export async function fetchVideoMeta(id: string): Promise<VideoMeta | null> {
  const response = await fetch(`/api/yt/meta?${new URLSearchParams({ id })}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not read the video details (status ${response.status}).`);

  const body: unknown = await response.json();
  const { title, channel } = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof title !== 'string' || typeof channel !== 'string') {
    throw new Error('The video details came back in a shape the app does not know.');
  }
  return { title, channel };
}
