import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { encode, styleGrid, toPdf, type Drawing, type Style } from '../src/index.ts';
import { loadBwip } from './helpers.ts';

const latin1 = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

const SOLID: Drawing = {
  width: 25,
  height: 25,
  background: { type: 'solid', colour: '#ffffff' },
  layers: [{ paint: { type: 'solid', colour: '#111417' }, d: 'M 4 4 L 5 4 L 5 5 L 4 5 Z' }],
  logo: null,
};
const GRADIENT: Drawing = {
  ...SOLID,
  layers: [
    { paint: { type: 'linear', from: '#0e6f8c', to: '#0a566d', angle: 45 }, d: SOLID.layers[0]!.d },
  ],
};
const RADIAL: Drawing = {
  ...SOLID,
  layers: [
    {
      paint: { type: 'radial', inner: '#b3261e', outer: '#6a1b9a' },
      d: SOLID.layers[0]!.d,
      evenOdd: true,
    },
  ],
};
const LOGO: Drawing = {
  ...SOLID,
  logo: {
    width: 2,
    height: 2,
    rgba: Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 255, 255, 255, 255]),
    png: new Uint8Array([1]),
    x: 10,
    y: 10,
    size: 5,
  },
};

async function pageSize(bytes: Uint8Array): Promise<[number, number]> {
  const document = await PDFDocument.load(bytes);
  expect(document.getPageCount()).toBe(1);
  const { width, height } = document.getPages()[0]!.getSize();
  return [width, height];
}

describe('toPdf', () => {
  it('writes a well-formed PDF whose cross-reference offsets are exact', () => {
    const bytes = toPdf(SOLID, { kind: 'fit', widthMm: 50 });
    const text = latin1(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.endsWith('%%EOF\n')).toBe(true);
    // The table's own line: 'startxref' also contains the word.
    const xref = text.lastIndexOf('\nxref\n') + 1;
    expect(Number(/startxref\n(\d+)/.exec(text)![1])).toBe(xref);
    const entries = text
      .slice(xref)
      .split('\n')
      .slice(3)
      .filter((line) => / n $/.test(line));
    entries.forEach((line, index) => {
      const offset = Number(line.slice(0, 10));
      expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    });
  });

  it('loads in pdf-lib for every kind of drawing, at the size asked', async () => {
    const fifty = (50 * 72) / 25.4;
    for (const drawing of [SOLID, GRADIENT, RADIAL, LOGO]) {
      const [width, height] = await pageSize(toPdf(drawing, { kind: 'fit', widthMm: 50 }));
      expect(width).toBeCloseTo(fifty, 2);
      expect(height).toBeCloseTo(fifty, 2);
    }
    const [a4w, a4h] = await pageSize(toPdf(SOLID, { kind: 'a4', widthMm: 80 }));
    expect([a4w, a4h].map((value) => Math.round(value * 100) / 100)).toEqual([595.28, 841.89]);
    const [lw, lh] = await pageSize(toPdf(SOLID, { kind: 'letter', widthMm: 80 }));
    expect([lw, lh].map((value) => Math.round(value * 100) / 100)).toEqual([612, 792]);
  });

  it('keeps a non-square drawing’s proportions', async () => {
    const [width, height] = await pageSize(
      toPdf({ ...SOLID, width: 50, height: 20 }, { kind: 'fit', widthMm: 100 }),
    );
    expect(height / width).toBeCloseTo(0.4, 5);
  });

  it('writes gradients as shadings, even-odd fills as f*, and the logo with its alpha', () => {
    expect(latin1(toPdf(GRADIENT, { kind: 'fit', widthMm: 50 }))).toContain('/ShadingType 2');
    expect(latin1(toPdf(RADIAL, { kind: 'fit', widthMm: 50 }))).toContain('/ShadingType 3');
    const logo = latin1(toPdf(LOGO, { kind: 'fit', widthMm: 50 }));
    expect(logo).toContain('/Subtype /Image');
    expect(logo).toContain('/SMask');
  });

  it('is the same every time, and carries no dates, producer or id', () => {
    const first = toPdf(GRADIENT, { kind: 'fit', widthMm: 50 });
    expect(toPdf(structuredClone(GRADIENT), { kind: 'fit', widthMm: 50 })).toEqual(first);
    const text = latin1(first);
    for (const key of ['/CreationDate', '/ModDate', '/Producer', '/ID', '/Info'])
      expect(text).not.toContain(key);
  });

  it('writes the largest QR code quickly', async () => {
    const made = encode(await loadBwip(), {
      id: 'qr',
      text: 'x'.repeat(1200),
      textOptions: { escapes: false, trim: false, newline: 'lf', eci: false },
      options: { eclevel: 'H' },
      colours: { foreground: '#000000', background: '#ffffff' },
    });
    if (!made.ok || !made.value.grid) throw new Error('no grid');
    const style: Style = {
      dots: 'square',
      ring: 'square',
      eye: 'square',
      foreground: { type: 'solid', colour: '#000000' },
      background: '#ffffff',
      corners: null,
      perModule: null,
      quietZone: 4,
      logo: null,
    };
    const drawing = styleGrid(made.value.grid, style);
    const started = performance.now();
    const bytes = toPdf(drawing, { kind: 'fit', widthMm: 100 });
    expect(performance.now() - started).toBeLessThan(200);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
