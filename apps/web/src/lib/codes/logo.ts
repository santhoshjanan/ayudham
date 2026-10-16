import { LIMITS } from '@pokerji/code-maker';

/** A logo as the writers take it: RGBA pixels for the PDF, PNG bytes for SVG. */
export type LogoImage = { width: number; height: number; rgba: Uint8Array; png: Uint8Array };

export type LogoRead =
  { ok: true; value: LogoImage } | { ok: false; reason: 'too-large' | 'not-image' };

/** Fixed sentences: a file's name never reaches them. */
export const LOGO_SAID = {
  'too-large': 'That image is larger than 5 MB. Choose a smaller one.',
  'not-image': 'That file is not an image this page can read. Choose a PNG, JPG, WebP or SVG.',
} as const;

const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
/** The longer side of a logo once read: plenty for a plate a fraction of the code's width. */
export const LOGO_SIDE = 1024;

/** An SVG drawn as an image from a data address: it runs no script and loads nothing. */
async function svgImage(file: File): Promise<HTMLImageElement> {
  const text = await file.text();
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
      source = await svgImage(file);
      width = source.naturalWidth || LOGO_SIDE;
      height = source.naturalHeight || LOGO_SIDE;
    } else {
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
    return { ok: true, value: { width: w, height: h, rgba, png } };
  } catch {
    return { ok: false, reason: 'not-image' };
  }
}
