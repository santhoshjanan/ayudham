import type { Paint } from './drawing.ts';
import { ok, refuse, type Result } from './result.ts';

/** Below this, the page warns: WCAG 2.2 AA's figure for text, which barcodes carry. */
export const CONTRAST_WARNING = 4.5;
/** Below this, export is refused: scanners cannot tell the colours apart. */
export const CONTRAST_FLOOR = 2;

/** `#rgb`, `#rrggbb` (with or without `#`, any case) or `transparent`, as `#rrggbb` or `transparent`. */
export function parseColour(input: string): Result<string> {
  const value = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (value === 'transparent') return ok('transparent');
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
  if (!match) return refuse('bad-colour');
  const digits = match[1]!;
  return ok(
    `#${digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits}`,
  );
}

const channels = (colour: string): [number, number, number] => {
  const value = colour === 'transparent' ? '#ffffff' : colour;
  return [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16)) as [number, number, number];
};

/** WCAG relative luminance. */
export function luminance(colour: string): number {
  const [r, g, b] = channels(colour).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG 2.2 contrast ratio, rounded to 2 decimals; `transparent` is measured as white. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
}

export function invert<T extends { foreground: string; background: string }>(colours: T): T {
  return { ...colours, foreground: colours.background, background: colours.foreground };
}

/** Halfway between two colours, channel by channel. */
const mix = (a: string, b: string): string =>
  `#${channels(a)
    .map((channel, index) =>
      Math.round((channel + channels(b)[index]!) / 2)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

function colours(paint: Paint): string[] {
  if (paint.type === 'solid') return [paint.colour];
  const [a, b] = paint.type === 'linear' ? [paint.from, paint.to] : [paint.inner, paint.outer];
  return [a, b, mix(a, b)];
}

/** The lowest-contrast colour any of the paints holds, against the background. */
export function weakestPair(
  paints: Paint[],
  background: string,
): { foreground: string; background: string; ratio: number } {
  let weakest = { foreground: '#000000', background, ratio: Number.POSITIVE_INFINITY };
  for (const colour of paints.flatMap(colours)) {
    const ratio = contrast(colour, background);
    if (ratio < weakest.ratio) weakest = { foreground: colour, background, ratio };
  }
  return weakest;
}

/** An HSL colour (degrees, per cent, per cent) as `#rrggbb`. */
export function hsl(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const h = (((hue % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const [r, g, b] =
    h < 1
      ? [chroma, x, 0]
      : h < 2
        ? [x, chroma, 0]
        : h < 3
          ? [0, chroma, x]
          : h < 4
            ? [0, x, chroma]
            : h < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const m = l - chroma / 2;
  return `#${[r, g, b]
    .map((channel) =>
      Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** The lightest shade of a hue that still reaches the given contrast against the background. */
export function readableShade(
  hue: number,
  saturation: number,
  background: string,
  target = CONTRAST_WARNING + 0.1,
): string {
  for (let lightness = 45; lightness > 5; lightness -= 1) {
    const colour = hsl(hue, saturation, lightness);
    if (contrast(colour, background) >= target) return colour;
  }
  return hsl(hue, saturation, 5);
}
