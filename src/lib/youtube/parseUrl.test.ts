import { describe, expect, it } from 'vitest';
import { extractYouTubeIdFromShare, parseYouTubeId } from './parseUrl';

const id = 'dQw4w9WgXcQ';
const otherId = 'oHg5SJYRHA0';

describe('parseYouTubeId', () => {
  it('reads the id from every supported link shape', () => {
    for (const u of [
      `https://www.youtube.com/watch?v=${id}&t=42s`,
      `https://youtu.be/${id}?si=abc`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://music.youtube.com/watch?v=${id}&list=RD1`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
      `https://youtube.com/watch?v=${id}`,
      `  ${id}  `,
    ]) {
      expect(parseYouTubeId(u)).toBe(id);
    }
  });

  it('returns null for links that are not a single video', () => {
    expect(parseYouTubeId('https://www.youtube.com/playlist?list=PL123')).toBeNull();
    expect(parseYouTubeId('https://www.youtube.com/watch')).toBeNull();
    expect(parseYouTubeId('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(parseYouTubeId('https://youtu.be/')).toBeNull();
  });

  it('returns null for other hosts, including lookalikes', () => {
    expect(parseYouTubeId(`https://example.com/watch?v=${id}`)).toBeNull();
    expect(parseYouTubeId(`https://notyoutube.com/watch?v=${id}`)).toBeNull();
    expect(parseYouTubeId(`https://youtube.com.evil.example/watch?v=${id}`)).toBeNull();
  });

  it('returns null for non-http protocols', () => {
    expect(parseYouTubeId(`ftp://www.youtube.com/watch?v=${id}`)).toBeNull();
  });

  it('returns null for text that is not a link or an id', () => {
    expect(parseYouTubeId('olha essa música')).toBeNull();
    expect(parseYouTubeId('')).toBeNull();
  });
});

describe('extractYouTubeIdFromShare', () => {
  it('finds a link inside the shared text', () => {
    expect(extractYouTubeIdFromShare({ text: `Olha isso https://youtu.be/${id}` })).toBe(id);
  });

  it('prefers url, then text, then title', () => {
    const link = (videoId: string) => `https://youtu.be/${videoId}`;
    expect(
      extractYouTubeIdFromShare({ url: link(id), text: link(otherId), title: link(otherId) }),
    ).toBe(id);
    expect(extractYouTubeIdFromShare({ url: null, text: link(id), title: link(otherId) })).toBe(id);
    expect(extractYouTubeIdFromShare({ url: 'https://example.com', text: 'oi', title: link(id) })).toBe(id);
  });

  it('skips links that are not YouTube videos', () => {
    expect(
      extractYouTubeIdFromShare({ text: `https://example.com/a e https://youtu.be/${id}` }),
    ).toBe(id);
  });

  it('ignores punctuation stuck to the end of the link', () => {
    expect(extractYouTubeIdFromShare({ text: `Ouve essa (https://youtu.be/${id}).` })).toBe(id);
  });

  it('returns null when there is no YouTube video link', () => {
    expect(extractYouTubeIdFromShare({})).toBeNull();
    expect(extractYouTubeIdFromShare({ url: null, text: null, title: null })).toBeNull();
    expect(extractYouTubeIdFromShare({ text: 'só texto, sem link' })).toBeNull();
    expect(extractYouTubeIdFromShare({ text: `a música ${id} sem link` })).toBeNull();
  });
});
