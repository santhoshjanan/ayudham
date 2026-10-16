import { describe, expect, it } from 'vitest';
import { refuse, surprise, THEMES, weakestPair, type ThemeId } from '../src/index.ts';
import { fixedRandom } from './helpers.ts';

const IDS: ThemeId[] = ['rainbow', 'sunset', 'ocean', 'forest', 'pool', 'ink', 'neon'];

describe('themes', () => {
  it('has the seven themes, each readable against its background', () => {
    expect(Object.keys(THEMES).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      const theme = THEMES[id];
      expect(theme.label.length, id).toBeGreaterThan(2);
      expect(weakestPair([theme.paint], theme.background).ratio, id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps every Rainbow module readable across a whole code', () => {
    const rainbow = THEMES.rainbow;
    const colours = new Set<string>();
    for (let row = 0; row < 25; row++)
      for (let column = 0; column < 25; column++)
        colours.add(rainbow.perModule!(column, row, 25, 25));
    expect(colours.size).toBeGreaterThan(10);
    for (const colour of colours)
      expect(
        weakestPair([{ type: 'solid', colour }], rainbow.background).ratio,
        colour,
      ).toBeGreaterThanOrEqual(4.5);
  });

  it('uses the suite stage colours for Pool', () => {
    expect(JSON.stringify(THEMES.pool.paint)).toContain('#0e6f8c');
  });
});

describe('surprise', () => {
  it('draws the same palette from the same bytes, always readable', () => {
    const bytes = Array.from({ length: 64 }, (_, index) => (index * 37 + 11) % 256);
    const first = surprise(fixedRandom(bytes));
    expect(first).toEqual(surprise(fixedRandom(bytes)));
    if (!first.ok) throw new Error(first.problem);
    expect(weakestPair([first.value.paint], first.value.background).ratio).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('stays readable over many draws', () => {
    for (let seed = 0; seed < 200; seed++) {
      const made = surprise(
        fixedRandom([seed, (seed * 7) % 256, (seed * 13) % 256, 200, 17, 99, 3]),
      );
      if (!made.ok) throw new Error(made.problem);
      expect(weakestPair([made.value.paint], made.value.background).ratio).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('refuses when the random source is stuck', () => {
    expect(surprise(fixedRandom([255]))).toEqual(refuse('no-random'));
  });
});
