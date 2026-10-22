/**
 * Words that mark a bracketed segment as a video tag, not part of the song name.
 * The long ones match anywhere ("Videoclipe", "Remastered"); the short ones only as
 * whole words, so "(14K Sunrise)" and "(Mvula Mix)" stay.
 */
const TAG_WORDS = /official|video|audio|lyric|visualizer|remaster|clipe|oficial|ao vivo|\b(?:hd|4k|mv)\b/i;

/** A segment in round or square brackets, with no brackets of the same kind inside. */
const BRACKETED = /\([^()]*\)|\[[^[\]]*\]/g;

/** A featuring credit and everything after it, with the bracket that opens it. */
const FEATURING = /\s*[([]?\s*\b(?:feat|ft|featuring)\b\.?.*$/i;

const SEPARATOR = / [-–—] /;
const TITLE_SUFFIX_SEPARATOR = ' | ';

/** What YouTube adds to an artist's channel name. */
const CHANNEL_NOISE = /\s*-\s*Topic$|\s*(?:VEVO|Official)$/i;

function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function removeTags(title: string): string {
  return title.replace(BRACKETED, (segment) => (TAG_WORDS.test(segment) ? '' : segment));
}

function removeFeaturing(text: string): string {
  return collapseSpaces(text.replace(FEATURING, ''));
}

/**
 * Turns a YouTube video title and its channel name into an artist and a track
 * that can be used to look up lyrics.
 * "Artist ft. X - Song (Official Video)" becomes { artist: 'Artist', track: 'Song' }.
 * When the title has no " - " (or en/em dash), the artist comes from the channel name.
 */
export function cleanTitle(title: string, channel: string): { artist: string; track: string } {
  let text = collapseSpaces(removeTags(collapseSpaces(title)));

  const pipe = text.indexOf(TITLE_SUFFIX_SEPARATOR);
  if (pipe !== -1) text = text.slice(0, pipe);

  const separator = SEPARATOR.exec(text);
  const artist = separator
    ? text.slice(0, separator.index)
    : collapseSpaces(channel).replace(CHANNEL_NOISE, '');
  const track = separator ? text.slice(separator.index + separator[0].length) : text;

  return { artist: removeFeaturing(artist), track: removeFeaturing(track) };
}
