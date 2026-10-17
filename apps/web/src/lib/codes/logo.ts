import { LIMITS } from '@ayudham/code-maker';

/**
 * A logo as the writers take it: RGBA pixels for the PDF, PNG bytes for SVG, and a small PNG for
 * the preview, so a key press never moves a full-size image between the page and the worker.
 */
export type LogoImage = {
  width: number;
  height: number;
  rgba: Uint8Array;
  png: Uint8Array;
  small: Uint8Array;
};

export type LogoRead =
  | { ok: true; value: LogoImage }
  | { ok: false; reason: 'too-large' | 'too-many-pixels' | 'too-complex' | 'not-image' };

/** Fixed sentences: a file's name never reaches them. */
export const LOGO_SAID = {
  'too-large': 'That image is larger than 5 MB. Choose a smaller one.',
  'too-many-pixels': 'That image is more than 4,096 pixels on a side. Choose a smaller one.',
  'too-complex': 'That SVG is too complex to read safely. Choose a simpler one, or a PNG.',
  'not-image': 'That file is not an image this page can read. Choose a PNG, JPG, WebP or SVG.',
} as const;

/** Elements an SVG logo may hold, and references to others (each can multiply the drawing). */
const SVG_ELEMENTS = 5_000;
const SVG_USES = 100;

/**
 * The width and height a PNG, JPEG or WebP file declares in its header, read before anything
 * decodes it, so a small file that claims a huge picture is refused without being drawn. Null
 * when the header cannot be read.
 */
export function declaredSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number, length: number) =>
    String.fromCharCode(...bytes.subarray(at, at + length));
  // PNG: the signature, then the IHDR chunk.
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && text(12, 4) === 'IHDR')
    return { width: view.getUint32(16), height: view.getUint32(20) };
  // JPEG: walk the segments to the first start-of-frame.
  if (bytes.length >= 4 && view.getUint16(0) === 0xffd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return null;
      const marker = bytes[at + 1]!;
      if (marker === 0xff) {
        at += 1;
        continue;
      }
      const frame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (frame) return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
        at += 2;
        continue;
      }
      at += 2 + view.getUint16(at + 2);
    }
    return null;
  }
  // WebP: lossy, lossless or extended.
  if (bytes.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    const kind = text(12, 4);
    if (kind === 'VP8 ')
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    if (kind === 'VP8L') {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') {
      const three = (at: number) => bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);
      return { width: three(24) + 1, height: three(27) + 1 };
    }
  }
  return null;
}

const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
/** The longer side of a logo once read: plenty for a plate a fraction of the code's width. */
export const LOGO_SIDE = 1024;
/** The longer side of the preview's copy: the plate is at most 40% of a box 36rem wide. */
export const PREVIEW_SIDE = 384;

/** An SVG drawn as an image from a data address: it runs no script and loads nothing. */
async function svgImage(text: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  await image.decode();
  return image;
}

/**
 * Reads a chosen image here on the device, through the browser's own decoder, and scales it so
 * its longer side is at most 1,024 pixels. Nothing is sent anywhere, and no object address is
 * made, so nothing is left alive once it is read.
 */
export async function readLogo(file: File): Promise<LogoRead> {
  if (file.size > LIMITS.logoBytes) return { ok: false, reason: 'too-large' };
  if (!TYPES.has(file.type)) return { ok: false, reason: 'not-image' };
  let source: ImageBitmap | HTMLImageElement;
  let width: number;
  let height: number;
  try {
    if (file.type === 'image/svg+xml') {
      const text = await file.text();
      if (
        (text.match(/<[a-z]/gi)?.length ?? 0) > SVG_ELEMENTS ||
        (text.match(/<use\b/gi)?.length ?? 0) > SVG_USES
      )
        return { ok: false, reason: 'too-complex' };
      source = await svgImage(text);
      width = source.naturalWidth || LOGO_SIDE;
      height = source.naturalHeight || LOGO_SIDE;
    } else {
      const size = declaredSize(new Uint8Array(await file.arrayBuffer()));
      if (!size) return { ok: false, reason: 'not-image' };
      if (size.width > LIMITS.logoPixels || size.height > LIMITS.logoPixels)
        return { ok: false, reason: 'too-many-pixels' };
      source = await createImageBitmap(file);
      width = source.width;
      height = source.height;
    }
  } catch {
    return { ok: false, reason: 'not-image' };
  }
  if (!(width > 0 && height > 0)) return { ok: false, reason: 'not-image' };
  const scale = Math.min(1, LOGO_SIDE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  try {
    const canvas = new OffscreenCanvas(w, h);
    const context = canvas.getContext('2d');
    if (!context) return { ok: false, reason: 'not-image' };
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, w, h);
    if ('close' in source) source.close();
    const rgba = new Uint8Array(context.getImageData(0, 0, w, h).data.buffer);
    const png = new Uint8Array(
      await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer(),
    );
    const fit = Math.min(1, PREVIEW_SIDE / Math.max(w, h));
    const preview = new OffscreenCanvas(
      Math.max(1, Math.round(w * fit)),
      Math.max(1, Math.round(h * fit)),
    );
    const drawn = preview.getContext('2d');
    if (!drawn) return { ok: false, reason: 'not-image' };
    drawn.imageSmoothingQuality = 'high';
    drawn.drawImage(canvas, 0, 0, preview.width, preview.height);
    const small = new Uint8Array(
      await (await preview.convertToBlob({ type: 'image/png' })).arrayBuffer(),
    );
    return { ok: true, value: { width: w, height: h, rgba, png, small } };
  } catch {
    return { ok: false, reason: 'not-image' };
  }
}
