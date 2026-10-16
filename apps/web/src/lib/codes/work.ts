import {
  check,
  encode,
  styleGrid,
  THEMES,
  toSvg,
  type Bwip,
  type Detail,
  type DotShape,
  type Drawing,
  type EncodeRequest,
  type Eye,
  type Finding,
  type Paint,
  type Problem,
  type Ring,
  type Style,
  type StyleLogo,
  type ThemeId,
} from '@pokerji/code-maker';

/**
 * How a code looks, as plain data. It crosses into the worker by structured clone, so it holds no
 * function: a theme that colours each module is named, and rebuilt on the other side.
 */
export type Look = {
  dots: DotShape;
  ring: Ring;
  eye: Eye;
  foreground: Paint;
  /** null is transparent. */
  background: string | null;
  corners: Paint | null;
  theme: ThemeId | null;
  quietZone: number;
  logo: StyleLogo | null;
};

export type Output = 'preview' | 'png' | 'jpg' | 'svg' | 'pdf' | 'zip';

/** One piece of work for the worker (or, without one, the page): plain data only. */
export type Job = {
  request: Omit<EncodeRequest, 'colours'>;
  look: Look;
  output: Output;
};

export type Made = {
  ok: true;
  svg: string;
  /** The drawing's size in its own units (modules for a matrix code). */
  width: number;
  height: number;
  findings: Finding[];
  /** What the code holds, for its description; never sent anywhere. */
  text: string;
  file?: Uint8Array;
};

export type Answer = Made | { ok: false; problem: Problem; detail?: Detail };

/** The one colour a paint is drawn in where gradients cannot go: its first. */
export const solidOf = (paint: Paint): string =>
  paint.type === 'solid' ? paint.colour : paint.type === 'linear' ? paint.from : paint.inner;

export function styleOf(look: Look): Style {
  const perModule = look.theme ? (THEMES[look.theme]?.perModule ?? null) : null;
  return {
    dots: look.dots,
    ring: look.ring,
    eye: look.eye,
    foreground: look.foreground,
    background: look.background,
    corners: look.corners,
    perModule,
    quietZone: look.quietZone,
    logo: look.logo,
  };
}

/** A job's code: encoded, drawn, checked and written. The same function in the worker and on the page. */
export async function answer(job: Job, bwip: Bwip): Promise<Answer> {
  const colours = { foreground: solidOf(job.look.foreground), background: job.look.background };
  const encoded = encode(bwip, { ...job.request, colours });
  if (!encoded.ok) return encoded;
  const style = encoded.value.grid ? styleOf(job.look) : null;
  const drawing: Drawing = encoded.value.grid
    ? styleGrid(encoded.value.grid, style!)
    : encoded.value.drawing!;
  const findings = check(encoded.value, style, colours);
  return {
    ok: true,
    svg: toSvg(drawing, null),
    width: drawing.width,
    height: drawing.height,
    findings,
    text: job.request.text,
  };
}
