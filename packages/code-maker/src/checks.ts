import { CONTRAST_FLOOR, CONTRAST_WARNING, luminance, weakestPair } from './colour.ts';
import type { Paint } from './drawing.ts';
import type { Encoded } from './encode.ts';
import { logoCoverage, type Style } from './style.ts';

export type Finding = {
  level: 'warning' | 'refusal';
  code:
    | 'contrast-low'
    | 'contrast-too-low'
    | 'light-on-dark'
    | 'quiet-zone-small'
    | 'logo-too-large'
    | 'no-eci'
    | 'transparent-measured-as-white';
};

/**
 * The share of a code's unprotected modules a logo may clear, by error correction level.
 * Provisional, and well inside what each level recovers: the page's decoding tests may lower
 * them; never raise them without a decoding test.
 */
export const LOGO_LIMITS = { L: 0.03, M: 0.06, Q: 0.09, H: 0.12 } as const;

function logoLimit(encoded: Encoded): number {
  const level = String(encoded.options.eclevel ?? 'M') as keyof typeof LOGO_LIMITS;
  return LOGO_LIMITS[level] ?? LOGO_LIMITS.M;
}

/** Colours a per-module theme can produce, sampled across a code. */
function sampled(style: Style): Paint[] {
  if (!style.perModule) return [];
  const out: Paint[] = [];
  for (let step = 0; step <= 24; step++)
    out.push({ type: 'solid', colour: style.perModule(step, step, 25, 25) });
  return out;
}

/** What to tell the person before export: warnings, and refusals that stop it. */
export function check(
  encoded: Encoded,
  style: Style | null,
  colours: { foreground: string; background: string | null },
): Finding[] {
  const findings: Finding[] = [];
  const background = style ? style.background : colours.background;
  const measured = background && background !== 'transparent' ? background : '#ffffff';
  const paints: Paint[] = style
    ? [
        ...(style.perModule ? sampled(style) : [style.foreground]),
        ...(style.corners ? [style.corners] : []),
      ]
    : [{ type: 'solid', colour: colours.foreground }];

  const weakest = weakestPair(paints, measured);
  if (weakest.ratio < CONTRAST_FLOOR) findings.push({ level: 'refusal', code: 'contrast-too-low' });
  else if (weakest.ratio < CONTRAST_WARNING)
    findings.push({ level: 'warning', code: 'contrast-low' });
  if (luminance(weakest.foreground) > luminance(measured))
    findings.push({ level: 'warning', code: 'light-on-dark' });
  if (!background || background === 'transparent')
    findings.push({ level: 'warning', code: 'transparent-measured-as-white' });

  if (!encoded.grid && encoded.quietZone < encoded.symbology.quietZone)
    findings.push({ level: 'warning', code: 'quiet-zone-small' });
  if (style && encoded.grid) {
    if (style.quietZone < encoded.symbology.quietZone)
      findings.push({ level: 'warning', code: 'quiet-zone-small' });
    if (style.logo && logoCoverage(encoded.grid, style) > logoLimit(encoded))
      findings.push({ level: 'refusal', code: 'logo-too-large' });
  }
  for (const warning of encoded.warnings) findings.push({ level: 'warning', code: warning });
  return findings;
}
