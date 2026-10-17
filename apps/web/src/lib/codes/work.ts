import { drawOn } from './raster.ts';
import {
  bundle,
  check,
  encode,
  fileName,
  pixelsFor,
  toPdf,
  styleGrid,
  symbology,
  THEMES,
  toSvg,
  type Bwip,
  type Detail,
  type DotShape,
  type Drawing,
  type EncodeRequest,
  type ExportSize,
  type PdfPage,
  type Eye,
  type Finding,
  type Paint,
  type Problem,
  type Ring,
  type Style,
  type StyleLogo,
  type ThemeId,
} from '@ayudham/code-maker';

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
  /** What a JPG, which has no transparency, puts beneath a transparent code. */
  matte: string;
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
  /** For a file: its size, its PDF page, and what its name is made from (the kind and the time). */
  size?: ExportSize;
  page?: PdfPage['kind'];
  names?: {
    kind: string;
    at: { year: number; month: number; day: number; hour: number; minute: number; second: number };
  };
};

export type Made = {
  ok: true;
  /** The code as an image address: its SVG, escaped here in the worker, never on the page. */
  src: string;
  /** The drawing's size in its own units (modules for a matrix code). */
  width: number;
  height: number;
  findings: Finding[];
  /** What the code holds, for its description; never sent anywhere. */
  text: string;
  file?: Uint8Array;
  /** The file's name, from the kind of code and the time. */
  name?: string;
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
  const made: Made = {
    ok: true,
    src: `data:image/svg+xml,${encodeURIComponent(toSvg(drawing, null))}`,
    width: drawing.width,
    height: drawing.height,
    findings,
    text: job.request.text,
  };
  if (job.output === 'preview') return made;
  // Nothing is made for a code the checks stop.
  const stop = findings.find((finding) => finding.level === 'refusal');
  if (stop) return { ok: false, problem: stop.code as 'contrast-too-low' | 'logo-too-large' };
  const pixels = pixelsFor(drawing, job.size ?? { kind: 'pixels', width: 1024 });
  if (!pixels.ok) return pixels;
  const names = job.names ?? {
    kind: request.id,
    at: { year: 1980, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
  };
  const name = (extension: 'png' | 'jpg' | 'svg' | 'pdf' | 'zip') =>
    fileName(request.id, names.kind, names.at, extension);
  const files = await write(
    drawing,
    pixels.value,
    job,
    job.output === 'zip' ? ['png', 'jpg', 'svg', 'pdf'] : [job.output],
  );
  // A canvas the device cannot make (phones allow far fewer pixels than the limit here).
  if (!files) return { ok: false, problem: 'export-too-large' };
  if (job.output === 'zip') {
    return {
      ...made,
      file: bundle(files.map(({ extension, data }) => ({ name: name(extension), data }))),
      name: name('zip'),
    };
  }
  return { ...made, file: files[0]!.data, name: name(job.output) };
}

type Extension = 'png' | 'jpg' | 'svg' | 'pdf';

/** The PDF's width: the print width, or the pixel width at 300 dots to the inch. */
const widthMm = (size: ExportSize | undefined, pixels: number): number =>
  size?.kind === 'print' ? size.widthMm : Math.min(1000, Math.max(10, (pixels / 300) * 25.4));

async function write(
  drawing: Drawing,
  pixels: { width: number; height: number; scale: number },
  job: Job,
  extensions: Extension[],
): Promise<{ extension: Extension; data: Uint8Array }[] | null> {
  const out: { extension: Extension; data: Uint8Array }[] = [];
  for (const extension of extensions) {
    if (extension === 'svg') {
      out.push({
        extension,
        data: new TextEncoder().encode(
          toSvg(drawing, { width: pixels.width, height: pixels.height }),
        ),
      });
    } else if (extension === 'pdf') {
      out.push({
        extension,
        data: toPdf(drawing, { kind: job.page ?? 'fit', widthMm: widthMm(job.size, pixels.width) }),
      });
    } else {
      const data = await raster(drawing, pixels, extension, job.look.matte);
      if (!data) return null;
      out.push({ extension, data });
    }
  }
  return out;
}

/** A PNG or JPG through a canvas of the export's size. JPG has no transparency: the matte beneath. */
async function raster(
  drawing: Drawing,
  pixels: { width: number; height: number; scale: number },
  extension: 'png' | 'jpg',
  matte: string,
): Promise<Uint8Array | null> {
  try {
    const canvas = new OffscreenCanvas(pixels.width, pixels.height);
    const context = canvas.getContext('2d');
    if (!context) return null;
    if (extension === 'jpg' && !drawing.background) {
      context.fillStyle = /^#[0-9a-f]{6}$/.test(matte) ? matte : '#ffffff';
      context.fillRect(0, 0, pixels.width, pixels.height);
    }
    drawOn(context, drawing, pixels.scale);
    const blob = await canvas.convertToBlob(
      extension === 'jpg' ? { type: 'image/jpeg', quality: 0.92 } : { type: 'image/png' },
    );
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
}
