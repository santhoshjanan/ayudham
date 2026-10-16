import { describe, expect, it } from 'vitest';
import { encode, record, SYMBOLOGIES, type Drawing, type TextOptions } from '../src/index.ts';
import { loadBwip } from './helpers.ts';

const PLAIN: TextOptions = { escapes: false, trim: false, newline: 'lf', eci: true };
const COLOURS = { foreground: '#0e6f8c', background: '#ffffff' };

/** Path data in the drawing grammar: absolute M, L, C, Z with at most 4 decimals. */
const GRAMMAR = /^(?:[MLCZ](?: -?\d+(?:\.\d{1,4})?)*)+$/;
const tidy = (d: string): string => d.replace(/ (?=[MLCZ])/g, '');

/** The rectangles a layer's path holds, as [x, y, width, height]. */
function rectangles(d: string): number[][] {
  const out: number[][] = [];
  for (const part of d.split('Z')) {
    const numbers = part.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    if (numbers.length !== 8) continue;
    const xs = [numbers[0]!, numbers[2]!, numbers[4]!, numbers[6]!];
    const ys = [numbers[1]!, numbers[3]!, numbers[5]!, numbers[7]!];
    out.push([
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
    ]);
  }
  return out;
}

const SAMPLES: Record<string, string> = {
  pdf417: 'Hello, world',
  'pdf417-compact': 'Hello',
  'micro-pdf417': 'HELLO 123',
  maxicode: 'Hello, world',
  dotcode: 'HELLO 123',
  'ean-13': '590123412345',
  'ean-8': '96385074',
  'upc-a': '012345678905',
  'upc-e': '01234565',
  isbn: '978-1-56581-231-4',
  issn: '0311-175X',
  'code-128': 'ABC-123',
  'gs1-128': '(01)09521234543213',
  'code-39': 'CODE-39',
  'code-39-ext': 'Code 39e',
  'code-93': 'CODE 93',
  itf: '12345678',
  'itf-14': '15400141288763',
  codabar: 'A40156B',
  'databar-omni': '(01)24012345678905',
  'databar-limited': '(01)15012345678907',
  'databar-expanded': '(01)95012345678903(3103)000123',
};

describe('record', () => {
  it('draws EAN-13 bars matching bwip-js widths, one rectangle per bar', async () => {
    const bwip = await loadBwip();
    const drawing = record(bwip, 'ean13', '5901234123457', {}, COLOURS);
    const bars = drawing.layers
      .filter(
        (layer) =>
          !layer.evenOdd && layer.paint.type === 'solid' && layer.paint.colour === '#0e6f8c',
      )
      .flatMap((layer) => rectangles(layer.d))
      .sort((a, b) => a[0]! - b[0]!);
    const [raw] = bwip.raw('ean13', '5901234123457', {}) as unknown as Array<{ sbs: number[] }>;
    const expected = raw!.sbs.filter((_, index) => index % 2 === 0);
    expect(bars).toHaveLength(expected.length);
    const unit = Math.min(...bars.map((bar) => bar[2]!)) / Math.min(...expected);
    expect(bars.map((bar) => Math.round(bar[2]! / unit))).toEqual(expected);
  });

  it('draws human-readable text as glyph paths in the text colour, never as text', async () => {
    const bwip = await loadBwip();
    const drawing = record(
      bwip,
      'ean13',
      '5901234123457',
      { includetext: true },
      { ...COLOURS, text: '#111417' },
    );
    const text = drawing.layers.filter(
      (layer) => layer.paint.type === 'solid' && layer.paint.colour === '#111417',
    );
    expect(text.length).toBeGreaterThan(0);
    expect(text.every((layer) => layer.d.length > 100)).toBe(true);
    expect(JSON.stringify(drawing)).not.toContain('5901234123457');
  });

  it('draws MaxiCode as hexagons and an even-odd bullseye', async () => {
    const bwip = await loadBwip();
    const drawing = record(bwip, 'maxicode', 'Hello', {}, COLOURS);
    const hexagons = drawing.layers
      .flatMap((layer) => layer.d.split('Z'))
      .filter((part) => (part.match(/L/g) ?? []).length === 5);
    expect(hexagons.length).toBeGreaterThan(100);
    expect(drawing.layers.some((layer) => layer.evenOdd && layer.d.includes('C'))).toBe(true);
  });

  it('writes every path in the drawing grammar and colours as lowercase hex', async () => {
    const bwip = await loadBwip();
    for (const [id, text] of Object.entries(SAMPLES)) {
      const found = SYMBOLOGIES.find((row) => row.id === id)!;
      const drawing = record(bwip, found.bcid, text, found.fixed ?? {}, {
        foreground: '#0E6F8C',
        background: null,
        text: '#111417',
      });
      for (const layer of drawing.layers) {
        expect(tidy(layer.d), id).toMatch(GRAMMAR);
        if (layer.paint.type === 'solid') expect(layer.paint.colour, id).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(drawing.background, id).toBeNull();
      expect(drawing.width > 0 && drawing.height > 0, id).toBe(true);
    }
  });

  it('gives a background when one is chosen, and merges layers of one colour', async () => {
    const bwip = await loadBwip();
    const drawing: Drawing = record(bwip, 'code128', 'ABC-123', { includetext: false }, COLOURS);
    expect(drawing.background).toEqual({ type: 'solid', colour: '#ffffff' });
    expect(drawing.layers).toHaveLength(1);
  });
});

describe('encode with drawings', () => {
  it('draws every drawn symbology without clipping, sized as bwip-js sizes it', async () => {
    const bwip = await loadBwip();
    for (const [id, text] of Object.entries(SAMPLES)) {
      const made = encode(bwip, { id, text, textOptions: PLAIN, options: {}, colours: COLOURS });
      if (!made.ok) throw new Error(`${id}: ${made.problem}`);
      expect(made.value.drawing, id).not.toBeNull();
      expect(made.value.grid, id).toBeNull();
    }
    const made = encode(bwip, {
      id: 'pdf417',
      text: 'Hello, world',
      textOptions: PLAIN,
      options: {},
      colours: COLOURS,
    });
    const svg = bwip.toSVG({ bcid: 'pdf417', text: 'Hello, world', scale: 1 } as never);
    const [, width, height] = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg)!;
    expect(made.ok && [made.value.drawing!.width, made.value.drawing!.height]).toEqual([
      Number(width),
      Number(height),
    ]);
  });

  it('still refuses a wrong check digit', async () => {
    const bwip = await loadBwip();
    expect(
      encode(bwip, {
        id: 'ean-13',
        text: '5901234123458',
        textOptions: PLAIN,
        options: {},
        colours: COLOURS,
      }),
    ).toEqual({
      ok: false,
      problem: 'bad-check-digit',
    });
  });
});
