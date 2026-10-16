import { describe, expect, it } from 'vitest';
import {
  encode,
  logoCoverage,
  protectedCells,
  styleGrid,
  THEMES,
  type DotShape,
  type Drawing,
  type Grid,
  type Style,
  type TextOptions,
} from '../src/index.ts';
import { decodeGrid, loadBwip } from './helpers.ts';

const PLAIN: TextOptions = { escapes: false, trim: false, newline: 'lf', eci: true };
const INK = { type: 'solid', colour: '#111417' } as const;
const BASE: Style = {
  dots: 'square',
  ring: 'square',
  eye: 'square',
  foreground: INK,
  background: '#ffffff',
  corners: null,
  perModule: null,
  quietZone: 0,
  logo: null,
};
const LOGO = {
  width: 4,
  height: 4,
  rgba: new Uint8Array(64),
  png: new Uint8Array([137, 80, 78, 71]),
};

async function grid(
  id: string,
  text: string,
  options: Record<string, unknown> = {},
): Promise<Grid> {
  const made = encode(await loadBwip(), {
    id,
    text,
    textOptions: PLAIN,
    options,
    colours: { foreground: '#000000', background: '#ffffff' },
  });
  if (!made.ok || !made.value.grid) throw new Error('no grid');
  return made.value.grid;
}

/** The rectangles in a path, as [x0, y0, x1, y1]. */
function rectangles(d: string): number[][] {
  return d
    .split('Z')
    .map((part) => part.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [])
    .filter((numbers) => numbers.length === 8)
    .map((n) => [
      Math.min(n[0]!, n[4]!),
      Math.min(n[1]!, n[5]!),
      Math.max(n[0]!, n[4]!),
      Math.max(n[1]!, n[5]!),
    ]);
}

/** Reads a drawing of rectangles back into a grid, at module centres, honouring even-odd layers. */
function rasterise(drawing: Drawing, columns: number, rows: number, quiet: number): Uint8Array {
  const cells = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = column + quiet + 0.5;
      const y = row + quiet + 0.5;
      let dark = false;
      for (const layer of drawing.layers) {
        const hits = rectangles(layer.d).filter(
          ([x0, y0, x1, y1]) => x > x0! && x < x1! && y > y0! && y < y1!,
        ).length;
        if (layer.evenOdd ? hits % 2 === 1 : hits > 0) dark = true;
      }
      cells[row * columns + column] = dark ? 1 : 0;
    }
  }
  return cells;
}

const subpaths = (d: string): number => (d.match(/M/g) ?? []).length;
const GRAMMAR = /^(?:[MLCZ](?: -?\d+(?:\.\d{1,4})?)*)+$/;

describe('styleGrid', () => {
  it('draws square dots and square corners that read back to the same grid, which decodes', async () => {
    const qr = await grid('qr', 'Square and true');
    const drawing = styleGrid(qr, { ...BASE, quietZone: 4 });
    const back = rasterise(drawing, qr.columns, qr.rows, 4);
    expect([...back]).toEqual([...qr.cells]);
    expect((await decodeGrid(back, qr.columns, qr.rows))?.text).toBe('Square and true');
  });

  it('writes every dot shape in the drawing grammar', async () => {
    const qr = await grid('qr', 'shapes');
    for (const dots of [
      'square',
      'rounded',
      'circle',
      'diamond',
      'connected',
      'vertical',
      'horizontal',
    ] as DotShape[]) {
      const drawing = styleGrid(qr, { ...BASE, dots });
      for (const layer of drawing.layers)
        expect(layer.d.replace(/ (?=[MLCZ])/g, ''), dots).toMatch(GRAMMAR);
    }
  });

  it('rounds a connected dot only where it has no neighbour', () => {
    const cells = new Uint8Array([1, 1, 0, 0, 0, 0, 1, 0, 0]);
    const tiny: Grid = { kind: 'grid', symbology: 'test', columns: 3, rows: 3, cells, finders: [] };
    const drawing = styleGrid(tiny, { ...BASE, dots: 'connected' });
    const parts = drawing.layers[0]!.d.split('Z').filter((part) => part.trim());
    const curves = parts.map((part) => (part.match(/C/g) ?? []).length);
    // The pair: each module rounds its two outer corners. The lone module: all four.
    expect(curves.sort()).toEqual([2, 2, 4]);
  });

  it('draws one bar per run for vertical and horizontal dots', () => {
    const cells = new Uint8Array([1, 0, 1, 1, 0, 0, 1, 0, 1]);
    const tiny: Grid = { kind: 'grid', symbology: 'test', columns: 3, rows: 3, cells, finders: [] };
    // Columns: one run of three, then two singles. Rows: two, one and two runs.
    expect(subpaths(styleGrid(tiny, { ...BASE, dots: 'vertical' }).layers[0]!.d)).toBe(3);
    expect(subpaths(styleGrid(tiny, { ...BASE, dots: 'horizontal' }).layers[0]!.d)).toBe(5);
  });

  it('draws the finder patterns as rings and eyes in the corner paint', async () => {
    const corner = { type: 'solid', colour: '#0e6f8c' } as const;
    const qr = styleGrid(await grid('qr', 'corners'), {
      ...BASE,
      ring: 'circle',
      eye: 'diamond',
      corners: corner,
    });
    const ring = qr.layers.find(
      (layer) => layer.evenOdd && JSON.stringify(layer.paint) === JSON.stringify(corner),
    )!;
    const eye = qr.layers.find(
      (layer) => !layer.evenOdd && JSON.stringify(layer.paint) === JSON.stringify(corner),
    )!;
    expect(subpaths(ring.d)).toBe(6);
    expect(subpaths(eye.d)).toBe(3);
    const micro = styleGrid(await grid('micro-qr', 'HI'), {
      ...BASE,
      ring: 'leaf',
      corners: corner,
    });
    expect(subpaths(micro.layers.find((layer) => layer.evenOdd)!.d)).toBe(2);
  });

  it('adds the quiet zone on every side and leaves the background out when there is none', async () => {
    const qr = await grid('qr', 'quiet');
    const drawing = styleGrid(qr, { ...BASE, quietZone: 4, background: null });
    expect([drawing.width, drawing.height]).toEqual([qr.columns + 8, qr.rows + 8]);
    expect(drawing.background).toBeNull();
  });

  it('groups Rainbow colours into at most 24 layers', async () => {
    const qr = await grid('qr', 'x'.repeat(300));
    const drawing = styleGrid(qr, { ...BASE, perModule: THEMES.rainbow.perModule! });
    expect(drawing.layers.length).toBeLessThanOrEqual(24 + 2);
    expect(drawing.layers.length).toBeGreaterThan(10);
  });
});

describe('the logo plate', () => {
  it('never clears a protected cell, even on the smallest QR code', async () => {
    const qr = await grid('qr', 'hi', { version: 1, eclevel: 'H' });
    const guarded = protectedCells(qr, 'qr');
    for (const share of [0.2, 0.3, 0.4, 0.6]) {
      const drawing = styleGrid(qr, {
        ...BASE,
        logo: { ...LOGO, share, padding: 0, plate: 'square' },
      });
      const back = rasterise(drawing, qr.columns, qr.rows, 0);
      for (let at = 0; at < back.length; at++) {
        if (guarded[at]) expect(back[at], `share ${share} cell ${at}`).toBe(qr.cells[at]);
      }
    }
  });

  it('clears a centred square of the expected size on a larger code, and places the logo inside it', async () => {
    const qr = await grid('qr', 'x', { version: 10, eclevel: 'H' });
    expect(qr.columns).toBe(57);
    const drawing = styleGrid(qr, {
      ...BASE,
      logo: { ...LOGO, share: 0.3, padding: 1, plate: 'square' },
    });
    const back = rasterise(drawing, 57, 57, 0);
    for (let row = 20; row <= 36; row++)
      for (let column = 20; column <= 36; column++) expect(back[row * 57 + column]).toBe(0);
    expect(drawing.logo).toMatchObject({ x: 21, y: 21, size: 15 });
  });

  it('protects the finders and timing of Data Matrix and Aztec too', async () => {
    const matrix = await grid('data-matrix', 'Hello 123');
    const guarded = protectedCells(matrix, 'data-matrix');
    expect(guarded[0]).toBe(1);
    expect(guarded[(matrix.rows - 1) * matrix.columns + 3]).toBe(1);
    const aztec = await grid('aztec', 'Hello, world');
    const centre = Math.floor(aztec.rows / 2) * aztec.columns + Math.floor(aztec.columns / 2);
    expect(protectedCells(aztec, 'aztec')[centre]).toBe(1);
  });

  it('measures coverage, from nothing upwards', async () => {
    const qr = await grid('qr', 'x', { version: 10, eclevel: 'H' });
    const at = (share: number) =>
      logoCoverage(qr, {
        ...BASE,
        logo: share ? { ...LOGO, share, padding: 0, plate: 'square' } : null,
      });
    expect(at(0)).toBe(0);
    expect(at(0.1)).toBeGreaterThan(0);
    expect(at(0.3)).toBeGreaterThan(at(0.1));
  });
});

describe('the logo image stays on cleared modules', () => {
  /** Cells the logo box overlaps, even partly. */
  const underLogo = (logo: NonNullable<Drawing['logo']>, quiet: number, columns: number) => {
    const cells: number[] = [];
    for (
      let row = Math.floor(logo.y - quiet);
      row < Math.ceil(logo.y - quiet + logo.size - 1e-9);
      row++
    ) {
      for (
        let column = Math.floor(logo.x - quiet);
        column < Math.ceil(logo.x - quiet + logo.size - 1e-9);
        column++
      )
        cells.push(row * columns + column);
    }
    return cells;
  };

  it('for odd and even sizes and every plate shape, the logo covers only cells the plate cleared', () => {
    for (const size of [20, 21, 24, 25, 30, 33]) {
      const dark: Grid = {
        kind: 'grid',
        symbology: 'test',
        columns: size,
        rows: size,
        cells: new Uint8Array(size * size).fill(1),
        finders: [],
      };
      for (const plate of ['square', 'rounded', 'circle'] as const) {
        for (const share of [0.2, 0.25, 0.3, 0.37]) {
          const drawing = styleGrid(dark, {
            ...BASE,
            quietZone: 2,
            logo: { ...LOGO, share, padding: 0, plate },
          });
          expect(drawing.logo, `${size} ${plate} ${share}`).not.toBeNull();
          // Square dots: each dark module is one unit rectangle, so their corners give the grid.
          const drawn = new Set(
            drawing.layers
              .flatMap((layer) => rectangles(layer.d))
              .map(([x, y]) => `${x! - 2},${y! - 2}`),
          );
          for (const cell of underLogo(drawing.logo!, 2, size)) {
            const at = `${cell % size},${Math.floor(cell / size)}`;
            expect(drawn.has(at), `${size} ${plate} ${share} cell ${cell}`).toBe(false);
          }
        }
      }
    }
  });

  it('on QR versions 1 and 2, the logo box never reaches a protected cell', async () => {
    for (const version of [1, 2]) {
      const qr = await grid('qr', 'hi', { version, eclevel: 'H' });
      const guarded = protectedCells(qr, 'qr');
      for (const share of [0.2, 0.3, 0.4]) {
        const drawing = styleGrid(qr, {
          ...BASE,
          logo: { ...LOGO, share, padding: 0, plate: 'square' },
        });
        if (!drawing.logo) continue;
        for (const cell of underLogo(drawing.logo, 0, qr.columns))
          expect(guarded[cell], `v${version} ${share} cell ${cell}`).toBe(0);
      }
    }
  });
});
