import { zipSync, type Zippable } from 'fflate';
import type { Drawing } from './drawing.ts';
import { LIMITS } from './limits.ts';
import { ok, refuse, type Result } from './result.ts';

export type ExportSize =
  { kind: 'pixels'; width: number } | { kind: 'print'; widthMm: number; dpi: 300 | 600 };

/** The pixel size of a PNG or JPG export, keeping the drawing's proportions. */
export function pixelsFor(
  drawing: Drawing,
  size: ExportSize,
): Result<{ width: number; height: number; scale: number }> {
  let width: number;
  if (size.kind === 'print') {
    const { min, max } = LIMITS.printMm;
    if (
      !(size.widthMm >= min && size.widthMm <= max) ||
      !(LIMITS.dpi as readonly number[]).includes(size.dpi)
    )
      return refuse('out-of-range');
    width = Math.round((size.widthMm / 25.4) * size.dpi);
  } else {
    if (!Number.isInteger(size.width) || size.width < 1) return refuse('out-of-range');
    width = size.width;
  }
  const height = Math.round((width * drawing.height) / drawing.width);
  if (width > LIMITS.exportPixels || height > LIMITS.exportPixels)
    return refuse('export-too-large');
  return ok({ width, height, scale: width / drawing.width });
}

const two = (value: number): string => String(value).padStart(2, '0');

/** `code-<kind>-<YYYYMMDD>-<HHMMSS>.<ext>`: the kind of code and the time, never what was typed. */
export function fileName(
  symbologyId: string,
  kind: string,
  at: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  extension: 'png' | 'jpg' | 'svg' | 'pdf' | 'zip',
): string {
  const label =
    (kind || symbologyId)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'code';
  const date = `${String(at.year).padStart(4, '0')}${two(at.month)}${two(at.day)}`;
  return `code-${label}-${date}-${two(at.hour)}${two(at.minute)}${two(at.second)}.${extension}`;
}

/** DOS date for 1980-01-01 and time 00:00, the earliest a ZIP can hold. */
const DOS_DATE = 0x21;
const DOS_TIME = 0;

/** Every entry's date and time set to 1980-01-01 00:00, so the same files give the same bytes anywhere. */
function fixTimes(zip: Uint8Array): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let at = 0;
  // Local file headers, one after another.
  while (at + 30 <= zip.length && view.getUint32(at, true) === 0x04034b50) {
    view.setUint16(at + 10, DOS_TIME, true);
    view.setUint16(at + 12, DOS_DATE, true);
    const compressed = view.getUint32(at + 18, true);
    at += 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true) + compressed;
  }
  // The central directory.
  while (at + 46 <= zip.length && view.getUint32(at, true) === 0x02014b50) {
    view.setUint16(at + 12, DOS_TIME, true);
    view.setUint16(at + 14, DOS_DATE, true);
    at +=
      46 +
      view.getUint16(at + 28, true) +
      view.getUint16(at + 30, true) +
      view.getUint16(at + 32, true);
  }
  return zip;
}

/** One ZIP of the exports: images stored as they are, SVG and PDF compressed. */
export function bundle(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const entries: Zippable = {};
  for (const { name, data } of files)
    entries[name] = [data, { level: /\.(png|jpe?g)$/i.test(name) ? 0 : 6 }];
  return fixTimes(zipSync(entries));
}
