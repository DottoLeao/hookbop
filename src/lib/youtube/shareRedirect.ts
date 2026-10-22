import { extractYouTubeIdFromShare } from './parseUrl';

/**
 * Where /compartilhar sends someone who shared a link to Hookbop from the YouTube app: the song screen when the share
 * holds a link to one video, otherwise the home page with `?erro=link`, which makes it say so. The Android share menu
 * fills `title`, `text` and `url` as it pleases, and the YouTube app puts the link in `text`.
 * The result is always a path on this site, built from an 11-character video id and nothing else of what was shared.
 */
export function resolveShareRedirect(params: URLSearchParams): string {
  const id = extractYouTubeIdFromShare({
    title: params.get('title'),
    text: params.get('text'),
    url: params.get('url'),
  });
  return id ? `/jogar/${id}` : '/?erro=link';
}
