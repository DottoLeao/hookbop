const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Hosts that serve watch, shorts and embed links. youtu.be is handled on its own. */
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

const SHORT_LINK_HOST = 'youtu.be';

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/gi;
/** Punctuation that sticks to a link when it ends a sentence or sits in parentheses. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

function validId(candidate: string | null | undefined): string | null {
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

/**
 * Returns the 11-character video id from a YouTube link, or from a bare id.
 * Returns null for anything else: playlists, channels, other hosts, plain text.
 */
export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (VIDEO_ID.test(text)) return text;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const [first, second] = url.pathname.split('/').filter(Boolean);
  if (url.hostname === SHORT_LINK_HOST) return validId(first);
  if (!YOUTUBE_HOSTS.has(url.hostname)) return null;
  if (first === 'watch') return validId(url.searchParams.get('v'));
  if (first === 'shorts' || first === 'embed') return validId(second);
  return null;
}

/**
 * Finds the video id in what the system share sheet sends.
 * Looks for the first YouTube video link in `url`, then `text`, then `title`.
 */
export function extractYouTubeIdFromShare(p: {
  url?: string | null;
  text?: string | null;
  title?: string | null;
}): string | null {
  for (const field of [p.url, p.text, p.title]) {
    if (!field) continue;
    for (const match of field.matchAll(URL_IN_TEXT)) {
      const id = parseYouTubeId(match[0].replace(TRAILING_PUNCTUATION, ''));
      if (id) return id;
    }
  }
  return null;
}
