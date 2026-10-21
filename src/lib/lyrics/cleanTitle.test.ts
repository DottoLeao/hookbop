import { describe, expect, it } from 'vitest';
import { cleanTitle } from './cleanTitle';

describe('cleanTitle', () => {
  it('splits artist and track and drops the official-video tag', () => {
    expect(cleanTitle('Artist Name - Song Title (Official Music Video)', 'ArtistNameVEVO')).toEqual({
      artist: 'Artist Name',
      track: 'Song Title',
    });
  });

  it('takes the artist from the channel when the title has no separator', () => {
    expect(cleanTitle('Song Title', 'Artist Name - Topic')).toEqual({
      artist: 'Artist Name',
      track: 'Song Title',
    });
  });

  it('removes featuring credits from the artist', () => {
    expect(cleanTitle('Artist ft. Other - Song [Lyric Video]', 'Whatever')).toEqual({
      artist: 'Artist',
      track: 'Song',
    });
  });

  it('accepts an en dash and cuts everything after " | "', () => {
    expect(cleanTitle('Artist – Song (Official Audio) | 4K', 'X')).toEqual({
      artist: 'Artist',
      track: 'Song',
    });
  });

  it('removes featuring credits from the track, brackets included', () => {
    expect(cleanTitle('Song Title (feat. Other)', 'Artist')).toEqual({
      artist: 'Artist',
      track: 'Song Title',
    });
  });

  it('removes Portuguese tags', () => {
    expect(cleanTitle('Artista - Música (Clipe Oficial)', 'Y')).toEqual({
      artist: 'Artista',
      track: 'Música',
    });
    expect(cleanTitle('Artista - Música (Ao Vivo)', 'Y').track).toBe('Música');
  });

  it('accepts an em dash', () => {
    expect(cleanTitle('Artist — Song', 'X')).toEqual({ artist: 'Artist', track: 'Song' });
  });

  it('removes every tag when there are several, in round or square brackets', () => {
    expect(cleanTitle('Artist - Song (Official Video) [HD]', 'X').track).toBe('Song');
    expect(cleanTitle('Artist - Song [Official Visualizer] (Remastered 2011)', 'X').track).toBe('Song');
  });

  it('keeps brackets that are not tags', () => {
    expect(cleanTitle('Artist - Song (Acoustic)', 'X').track).toBe('Song (Acoustic)');
  });

  it('matches short tags only as whole words', () => {
    expect(cleanTitle('Artist - Song (24K Magic)', 'X').track).toBe('Song (24K Magic)');
    expect(cleanTitle('Artist - Song (Mvula Mix)', 'X').track).toBe('Song (Mvula Mix)');
    expect(cleanTitle('Artist - Song (MV)', 'X').track).toBe('Song');
    expect(cleanTitle('Artist - Song (4K)', 'X').track).toBe('Song');
  });

  it('splits only on a dash with spaces around it, and only the first one', () => {
    expect(cleanTitle('Jay-Z - 99 Problems', 'X')).toEqual({ artist: 'Jay-Z', track: '99 Problems' });
    expect(cleanTitle('Artist - Song - Remix', 'X')).toEqual({ artist: 'Artist', track: 'Song - Remix' });
  });

  it('understands every featuring spelling', () => {
    expect(cleanTitle('Artist featuring Other - Song', 'X').artist).toBe('Artist');
    expect(cleanTitle('Artist feat. Other - Song', 'X').artist).toBe('Artist');
    expect(cleanTitle('Artist - Song featuring Other', 'X').track).toBe('Song');
    expect(cleanTitle('Artist - Song (ft. Other) [Official Video]', 'X').track).toBe('Song');
  });

  it('does not mistake words that only contain "ft" for a featuring credit', () => {
    expect(cleanTitle('Artist - Left Behind', 'X').track).toBe('Left Behind');
  });

  it('strips VEVO, Official and Topic from the channel name', () => {
    expect(cleanTitle('Song', 'ArtistVEVO').artist).toBe('Artist');
    expect(cleanTitle('Song', 'Artist Official').artist).toBe('Artist');
    expect(cleanTitle('Song', 'ArtistOfficial').artist).toBe('Artist');
    expect(cleanTitle('Song', 'Artist - Topic').artist).toBe('Artist');
  });

  it('collapses extra spaces', () => {
    expect(cleanTitle('  Artist   -   Song  (Official Video)  ', 'X')).toEqual({
      artist: 'Artist',
      track: 'Song',
    });
  });
});
