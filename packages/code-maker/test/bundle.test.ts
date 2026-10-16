import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { bundle, fileName, pixelsFor, refuse, type Drawing } from '../src/index.ts';

const SQUARE: Drawing = { width: 29, height: 29, background: null, layers: [], logo: null };
const WIDE: Drawing = { width: 100, height: 40, background: null, layers: [], logo: null };
const AT = { year: 2026, month: 10, day: 16, hour: 14, minute: 30, second: 5 };

describe('pixelsFor', () => {
  it('works out print sizes at 300 and 600 dpi', () => {
    expect(pixelsFor(SQUARE, { kind: 'print', widthMm: 100, dpi: 600 })).toEqual({
      ok: true,
      value: { width: 2362, height: 2362, scale: 2362 / 29 },
    });
    expect(pixelsFor(SQUARE, { kind: 'print', widthMm: 50, dpi: 300 }).ok).toBe(true);
  });

  it('keeps a drawing’s proportions', () => {
    expect(pixelsFor(WIDE, { kind: 'pixels', width: 1000 })).toEqual({
      ok: true,
      value: { width: 1000, height: 400, scale: 10 },
    });
  });

  it('refuses an export over 10,000 pixels, and sizes or resolutions outside the limits', () => {
    expect(pixelsFor(SQUARE, { kind: 'print', widthMm: 1000, dpi: 300 })).toEqual(
      refuse('export-too-large'),
    );
    expect(pixelsFor(SQUARE, { kind: 'pixels', width: 10_001 })).toEqual(
      refuse('export-too-large'),
    );
    expect(pixelsFor({ ...WIDE, width: 10, height: 1000 }, { kind: 'pixels', width: 200 })).toEqual(
      refuse('export-too-large'),
    );
    expect(pixelsFor(SQUARE, { kind: 'print', widthMm: 5, dpi: 300 })).toEqual(
      refuse('out-of-range'),
    );
    expect(pixelsFor(SQUARE, { kind: 'print', widthMm: 100, dpi: 72 as 300 })).toEqual(
      refuse('out-of-range'),
    );
    expect(pixelsFor(SQUARE, { kind: 'pixels', width: 0 })).toEqual(refuse('out-of-range'));
    expect(pixelsFor(SQUARE, { kind: 'pixels', width: 1.5 })).toEqual(refuse('out-of-range'));
  });
});

describe('fileName', () => {
  it('takes no longer for a kind made of thousands of dashes', () => {
    const started = performance.now();
    const name = fileName('qr', `${'-'.repeat(50_000)}x`, AT, 'png');
    expect(performance.now() - started).toBeLessThan(50);
    expect(name).toBe('code-x-20261016-143005.png');
    expect(fileName('qr', '--a--b--', AT, 'png')).toBe('code-a--b-20261016-143005.png');
    expect(fileName('qr', '-'.repeat(10), AT, 'png')).toBe('code-code-20261016-143005.png');
  });

  it('names a file by the kind of code and the time, never by what was typed', () => {
    expect(fileName('qr', 'wifi', AT, 'png')).toBe('code-wifi-20261016-143005.png');
    expect(fileName('ean-13', '', AT, 'pdf')).toBe('code-ean-13-20261016-143005.pdf');
    expect(fileName('qr', '../../etc/My Secret!', AT, 'zip')).toMatch(/^[a-z0-9.-]+$/);
  });
});

describe('bundle', () => {
  const files = [
    { name: 'code.png', data: new Uint8Array([137, 80, 78, 71, 1, 2, 3]) },
    { name: 'code.jpg', data: new Uint8Array([255, 216, 255, 9]) },
    {
      name: 'code.svg',
      data: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'.repeat(20)),
    },
    { name: 'code.pdf', data: new TextEncoder().encode('%PDF-1.4 '.repeat(50)) },
  ];

  it('unzips to the same names and bytes', () => {
    const unzipped = unzipSync(bundle(files));
    expect(Object.keys(unzipped).sort()).toEqual(files.map((file) => file.name).sort());
    for (const file of files) expect([...unzipped[file.name]!]).toEqual([...file.data]);
  });

  it('is the same every time, with every entry dated 1980-01-01 00:00', () => {
    const zip = bundle(files);
    expect(bundle(files)).toEqual(zip);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    for (let at = 0; at + 4 <= zip.length; at++) {
      const signature = view.getUint32(at, true);
      if (signature === 0x04034b50)
        expect([view.getUint16(at + 10, true), view.getUint16(at + 12, true)]).toEqual([0, 0x21]);
      if (signature === 0x02014b50)
        expect([view.getUint16(at + 12, true), view.getUint16(at + 14, true)]).toEqual([0, 0x21]);
    }
  });

  it('stores images and compresses SVG and PDF', () => {
    const zip = bundle(files);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const methods: Record<string, number> = {};
    for (let at = 0; at + 30 <= zip.length; at++) {
      if (view.getUint32(at, true) !== 0x04034b50) continue;
      const nameLength = view.getUint16(at + 26, true);
      methods[new TextDecoder().decode(zip.subarray(at + 30, at + 30 + nameLength))] =
        view.getUint16(at + 8, true);
    }
    expect(methods).toEqual({ 'code.png': 0, 'code.jpg': 0, 'code.svg': 8, 'code.pdf': 8 });
  });
});
