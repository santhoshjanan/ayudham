import { describe, expect, it } from 'vitest';
import { MUSIC_TRACK_IDS, MUSIC_TRACKS } from '../src/index.ts';

describe('bundled music', () => {
  it('offers four tracks, each with its own id made only of safe characters', () => {
    expect(MUSIC_TRACKS).toHaveLength(4);
    expect(new Set(MUSIC_TRACK_IDS).size).toBe(4);
    for (const track of MUSIC_TRACKS) {
      // The id becomes a file name in a URL.
      expect(track.id).toMatch(/^[a-z0-9-]{1,40}$/);
      expect(track.title.length).toBeGreaterThan(0);
    }
  });

  it('lists the ids in the same order as the tracks', () => {
    expect(MUSIC_TRACK_IDS).toEqual(MUSIC_TRACKS.map((track) => track.id));
  });
});
