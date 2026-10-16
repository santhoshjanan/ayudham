/** A colour fill: solid, or a gradient between two colours. Colours are `#rrggbb`. */
export type Paint =
  | { type: 'solid'; colour: string }
  | { type: 'linear'; from: string; to: string; angle: number }
  | { type: 'radial'; inner: string; outer: string };

/** One fill: path data in absolute M, L, C and Z commands only. */
export type Layer = { paint: Paint; d: string };

/** A centre image, already decoded by the page: RGBA pixels for the PDF, PNG bytes for SVG. */
export type Logo = {
  width: number;
  height: number;
  rgba: Uint8Array;
  png: Uint8Array;
  x: number;
  y: number;
  size: number;
};

/** What every writer draws: the same shapes for SVG, PDF and the page's canvas. */
export type Drawing = {
  width: number;
  height: number;
  background: Paint | null;
  layers: Layer[];
  logo: Logo | null;
};

/** A number in path data: at most 4 decimals, no trailing zeros, never "-0". */
export function num(value: number): string {
  const rounded = Math.round(value * 10_000) / 10_000;
  return String(rounded === 0 ? 0 : rounded);
}

export const rect = (x: number, y: number, width: number, height: number): string =>
  `M ${num(x)} ${num(y)} L ${num(x + width)} ${num(y)} L ${num(x + width)} ${num(y + height)} L ${num(x)} ${num(y + height)} Z`;

/** The constant for drawing a quarter circle with one cubic curve. */
const KAPPA = 0.5522847498;

/** A rectangle with rounded corners of radius r (r at most half the shorter side). */
export function roundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  r: number,
): string {
  const radius = Math.max(0, Math.min(r, width / 2, height / 2));
  if (radius === 0) return rect(x, y, width, height);
  const k = radius * KAPPA;
  const right = x + width;
  const bottom = y + height;
  return [
    `M ${num(x + radius)} ${num(y)}`,
    `L ${num(right - radius)} ${num(y)}`,
    `C ${num(right - radius + k)} ${num(y)} ${num(right)} ${num(y + radius - k)} ${num(right)} ${num(y + radius)}`,
    `L ${num(right)} ${num(bottom - radius)}`,
    `C ${num(right)} ${num(bottom - radius + k)} ${num(right - radius + k)} ${num(bottom)} ${num(right - radius)} ${num(bottom)}`,
    `L ${num(x + radius)} ${num(bottom)}`,
    `C ${num(x + radius - k)} ${num(bottom)} ${num(x)} ${num(bottom - radius + k)} ${num(x)} ${num(bottom - radius)}`,
    `L ${num(x)} ${num(y + radius)}`,
    `C ${num(x)} ${num(y + radius - k)} ${num(x + radius - k)} ${num(y)} ${num(x + radius)} ${num(y)}`,
    'Z',
  ].join(' ');
}

export const circle = (cx: number, cy: number, r: number): string =>
  roundedRect(cx - r, cy - r, 2 * r, 2 * r, r);

export const diamond = (cx: number, cy: number, r: number): string =>
  `M ${num(cx)} ${num(cy - r)} L ${num(cx + r)} ${num(cy)} L ${num(cx)} ${num(cy + r)} L ${num(cx - r)} ${num(cy)} Z`;
