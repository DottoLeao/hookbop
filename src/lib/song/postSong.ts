import type { SongResolution } from '@/lib/lyrics/resolveSong';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** True for what `POST /api/song` answers with a 200. Only the outline is checked: the server is the app's own. */
function isSongResolution(body: unknown): body is SongResolution {
  if (!isObject(body)) return false;
  switch (body.status) {
    case 'ready':
      return isObject(body.video) && Array.isArray(body.lines) && typeof body.needsCalibration === 'boolean';
    case 'no_lyrics':
      return isObject(body.video);
    case 'lyrics_unavailable':
    case 'video_unavailable':
      return true;
    default:
      return false;
  }
}

/**
 * What the app knows about a video and its lyrics, found on the server (`POST /api/song`, ruling R81). `durationS` is
 * how long the player says the video is, or null when it could not tell. Any failure throws, because it says nothing
 * about the song: the song screen then offers to try again.
 */
export async function postSong(youtubeId: string, durationS: number | null): Promise<SongResolution> {
  const response = await fetch('/api/song', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ youtubeId, durationS }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Could not find the song (status ${response.status}).`);

  const body: unknown = await response.json();
  if (!isSongResolution(body)) throw new Error('The song came back in a shape the app does not know.');
  return body;
}
