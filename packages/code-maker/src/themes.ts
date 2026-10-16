import { readableShade, hsl, weakestPair, CONTRAST_WARNING } from './colour.ts';
import type { Paint } from './drawing.ts';
import { LIMITS } from './limits.ts';
import { below, guard, RandomFailure, type RandomSource } from './random.ts';
import type { Result } from './result.ts';

export type ThemeId = 'rainbow' | 'sunset' | 'ocean' | 'forest' | 'pool' | 'ink' | 'neon';

export type Theme = {
  label: string;
  background: string;
  paint: Paint;
  /** A colour for each module, where the theme varies across the code. */
  perModule?: (column: number, row: number, columns: number, rows: number) => string;
};

const WHITE = '#ffffff';

/** Rainbow's colour for a module: the hue runs red to violet along the diagonal, each shade readable. */
const rainbowShades = new Map<number, string>();
function rainbow(column: number, row: number, columns: number, rows: number): string {
  const span = Math.max(1, columns + rows - 2);
  const hue = Math.round(((column + row) / span) * 280);
  let shade = rainbowShades.get(hue);
  if (!shade) {
    shade = readableShade(hue, 85, WHITE);
    rainbowShades.set(hue, shade);
  }
  return shade;
}

export const THEMES: Record<ThemeId, Theme> = {
  rainbow: {
    label: 'Rainbow',
    background: WHITE,
    paint: {
      type: 'linear',
      from: readableShade(0, 85, WHITE),
      to: readableShade(280, 85, WHITE),
      angle: 45,
    },
    perModule: rainbow,
  },
  sunset: {
    label: 'Sunset',
    background: '#fff8f0',
    paint: { type: 'linear', from: '#b3261e', to: '#6a1b9a', angle: 135 },
  },
  ocean: {
    label: 'Ocean',
    background: '#f0fbff',
    paint: { type: 'linear', from: '#0a566d', to: '#1a237e', angle: 90 },
  },
  forest: {
    label: 'Forest',
    background: '#f5fbf2',
    paint: { type: 'radial', inner: '#33691e', outer: '#1b5e20' },
  },
  pool: {
    label: 'Pool',
    background: WHITE,
    paint: { type: 'linear', from: '#0e6f8c', to: '#0a566d', angle: 90 },
  },
  ink: { label: 'Ink', background: WHITE, paint: { type: 'solid', colour: '#111417' } },
  neon: {
    label: 'Neon',
    background: '#fffef5',
    paint: { type: 'linear', from: '#c2185b', to: '#6200ea', angle: 45 },
  },
};

/** A random palette from the given source, redrawn until it reaches the contrast warning. */
export function surprise(random: RandomSource): Result<{ background: string; paint: Paint }> {
  return guard(() => {
    for (let attempt = 0; attempt < LIMITS.redraws; attempt++) {
      const hue = below(360, random);
      const turn = 30 + below(150, random);
      const background = hsl(hue, 60, 96 + below(3, random));
      const from = readableShade(hue + 180, 70 + below(25, random), background);
      const to = readableShade(hue + 180 + turn, 70 + below(25, random), background);
      const paint: Paint =
        below(2, random) === 0
          ? { type: 'linear', from, to, angle: below(8, random) * 45 }
          : { type: 'radial', inner: from, outer: to };
      if (weakestPair([paint], background).ratio >= CONTRAST_WARNING) return { background, paint };
    }
    throw new RandomFailure();
  });
}
