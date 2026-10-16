import {
  check,
  encode,
  styleGrid,
  symbology,
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
  /** Modules of quiet zone; null is the code's own standard minimum. */
  quietZone: number | null;
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

/** Why there is no code: the problem, the character at fault, or how many characters too many. */
export type Refusal = { ok: false; problem: Problem; detail?: Detail; over?: number };

export type Answer = Made | Refusal;

/** Codes whose capacity depends on their error correction, where "how much too long" is useful. */
const MEASURED = new Set(['qr', 'micro-qr', 'rmqr', 'pdf417', 'pdf417-compact']);

/**
 * How many characters past the most this code can hold, by binary search over the text's
 * beginnings. Run only after a refusal, in the worker, so typing never waits on it.
 */
function overBy(bwip: Bwip, request: EncodeRequest): number | undefined {
  const characters = [...request.text];
  const fits = (count: number): boolean =>
    encode(bwip, { ...request, text: characters.slice(0, count).join('') }).ok;
  let low = 0;
  let high = characters.length;
  if (!fits(1)) return undefined;
  low = 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return characters.length - low;
}

/** The one colour a paint is drawn in where gradients cannot go: its first. */
export const solidOf = (paint: Paint): string =>
  paint.type === 'solid' ? paint.colour : paint.type === 'linear' ? paint.from : paint.inner;

/** The quiet zone a look asks for, in modules: the code's standard minimum unless one was chosen. */
export const quietZoneOf = (look: Look, id: string): number =>
  look.quietZone ?? symbology(id)?.quietZone ?? 4;

export function styleOf(look: Look, id: string): Style {
  const perModule = look.theme ? (THEMES[look.theme]?.perModule ?? null) : null;
  return {
    dots: look.dots,
    ring: look.ring,
    eye: look.eye,
    foreground: look.foreground,
    background: look.background,
    corners: look.corners,
    perModule,
    quietZone: quietZoneOf(look, id),
    logo: look.logo,
  };
}

/** A job's code: encoded, drawn, checked and written. The same function in the worker and on the page. */
export async function answer(job: Job, bwip: Bwip): Promise<Answer> {
  const colours = { foreground: solidOf(job.look.foreground), background: job.look.background };
  const request = { ...job.request, colours, quietZone: quietZoneOf(job.look, job.request.id) };
  const encoded = encode(bwip, request);
  if (!encoded.ok) {
    if (encoded.problem === 'too-long' && MEASURED.has(request.id)) {
      const over = overBy(bwip, request);
      if (over) return { ...encoded, over };
    }
    return encoded;
  }
  const style = encoded.value.grid ? styleOf(job.look, request.id) : null;
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
