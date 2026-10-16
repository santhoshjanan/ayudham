import {
  circle,
  diamond,
  num,
  rect,
  roundedRect,
  type Drawing,
  type Layer,
  type Logo,
  type Paint,
} from './drawing.ts';
import type { Grid } from './encode.ts';

export type DotShape =
  'square' | 'rounded' | 'circle' | 'diamond' | 'connected' | 'vertical' | 'horizontal';
export type Ring = 'square' | 'rounded' | 'circle' | 'leaf';
export type Eye = 'square' | 'rounded' | 'circle' | 'diamond';

export type StyleLogo = Omit<Logo, 'x' | 'y' | 'size'> & {
  /** The plate's side as a share of the code's shorter side. */
  share: number;
  /** Modules between the plate's edge and the image. */
  padding: number;
  plate: 'square' | 'rounded' | 'circle';
};

export type Style = {
  dots: DotShape;
  ring: Ring;
  eye: Eye;
  foreground: Paint;
  background: string | null;
  corners: Paint | null;
  perModule: ((column: number, row: number, columns: number, rows: number) => string) | null;
  quietZone: number;
  logo: StyleLogo | null;
};

/** Colour layers a per-module theme is grouped into. */
const BANDS = 24;

/**
 * Cells a logo plate must never clear: the parts of the symbol a reader needs to find and read it
 * at all. QR: finders with separators, timing, format and version information. Data Matrix: its
 * finder and timing border. Aztec: the central finder and mode message, and the reference grid.
 * Alignment patterns are left out: a centred plate covers one from version 7 on, and error
 * correction recovers it.
 */
export function protectedCells(grid: Grid, symbologyId: string): Uint8Array {
  const { columns, rows } = grid;
  const cells = new Uint8Array(columns * rows);
  const mark = (column: number, row: number): void => {
    if (column >= 0 && row >= 0 && column < columns && row < rows)
      cells[row * columns + column] = 1;
  };
  const block = (column: number, row: number, width: number, height: number): void => {
    for (let y = row; y < row + height; y++)
      for (let x = column; x < column + width; x++) mark(x, y);
  };
  if (symbologyId === 'qr') {
    const size = columns;
    block(0, 0, 9, 9);
    block(size - 8, 0, 8, 9);
    block(0, size - 8, 9, 8);
    for (let at = 0; at < size; at++) {
      mark(at, 6);
      mark(6, at);
    }
    if ((size - 17) / 4 >= 7) {
      block(size - 11, 0, 3, 6);
      block(0, size - 11, 6, 3);
    }
  } else if (symbologyId === 'micro-qr') {
    block(0, 0, 9, 9);
    for (let at = 0; at < columns; at++) {
      mark(at, 0);
      mark(0, at);
    }
  } else if (symbologyId === 'rmqr') {
    block(0, 0, 8, Math.min(8, rows));
    block(columns - 6, rows - 6, 6, 6);
    block(8, 0, 4, 6);
    block(columns - 11, rows - 6, 5, 6);
    for (let at = 0; at < columns; at++) {
      mark(at, 0);
      mark(at, rows - 1);
    }
  } else if (symbologyId === 'data-matrix' || symbologyId === 'data-matrix-rect') {
    for (let at = 0; at < columns; at++) {
      mark(at, 0);
      mark(at, rows - 1);
    }
    for (let at = 0; at < rows; at++) {
      mark(0, at);
      mark(columns - 1, at);
    }
  } else if (symbologyId.startsWith('aztec')) {
    const core = symbologyId === 'aztec' ? 15 : 11;
    const middle = Math.floor(columns / 2);
    block(middle - Math.floor(core / 2), middle - Math.floor(core / 2), core, core);
    if (symbologyId === 'aztec') {
      for (let line = middle % 16; line < columns; line += 16) {
        for (let at = 0; at < columns; at++) {
          mark(at, line);
          mark(line, at);
        }
      }
    }
  }
  return cells;
}

type Plate = { left: number; top: number; side: number; shape: StyleLogo['plate'] };

const inPlate = (plate: Plate, x: number, y: number): boolean => {
  const half = plate.side / 2;
  const cx = plate.left + half;
  const cy = plate.top + half;
  if (plate.shape === 'circle') return (x - cx) ** 2 + (y - cy) ** 2 < half ** 2;
  const inside =
    x > plate.left && x < plate.left + plate.side && y > plate.top && y < plate.top + plate.side;
  if (!inside || plate.shape === 'square') return inside;
  // Rounded: corners of radius a quarter of the side.
  const r = plate.side / 4;
  const nx = Math.max(plate.left + r - x, 0, x - (plate.left + plate.side - r));
  const ny = Math.max(plate.top + r - y, 0, y - (plate.top + plate.side - r));
  return nx ** 2 + ny ** 2 < r ** 2;
};

/** The plate a logo clears, shrunk until it clears no protected cell; null when none fits. */
function plateFor(grid: Grid, logo: StyleLogo | null): Plate | null {
  if (!logo || !(logo.share > 0)) return null;
  const guarded = protectedCells(grid, grid.symbology);
  for (
    let side = Math.round(Math.min(1, logo.share) * Math.min(grid.columns, grid.rows));
    side > 0;
    side--
  ) {
    // On whole modules, so the plate clears whole cells and the logo can sit exactly on them.
    const plate: Plate = {
      left: Math.floor((grid.columns - side) / 2),
      top: Math.floor((grid.rows - side) / 2),
      side,
      shape: logo.plate,
    };
    let clean = true;
    for (let row = 0; row < grid.rows && clean; row++) {
      for (let column = 0; column < grid.columns; column++) {
        if (guarded[row * grid.columns + column] && inPlate(plate, column + 0.5, row + 0.5)) {
          clean = false;
          break;
        }
      }
    }
    if (clean) return plate;
  }
  return null;
}

/** The share of the grid's unprotected cells the logo's plate clears. */
export function logoCoverage(grid: Grid, style: Pick<Style, 'logo'>): number {
  const plate = plateFor(grid, style.logo);
  if (!plate) return 0;
  const guarded = protectedCells(grid, grid.symbology);
  let cleared = 0;
  let open = 0;
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      if (guarded[row * grid.columns + column]) continue;
      open++;
      if (inPlate(plate, column + 0.5, row + 0.5)) cleared++;
    }
  }
  return open ? cleared / open : 0;
}

/** A rectangle with only its top-left and bottom-right corners rounded. */
function leaf(x: number, y: number, size: number, r: number): string {
  const k = r * 0.5522847498;
  const right = x + size;
  const bottom = y + size;
  return [
    `M ${num(x + r)} ${num(y)}`,
    `L ${num(right)} ${num(y)}`,
    `L ${num(right)} ${num(bottom - r)}`,
    `C ${num(right)} ${num(bottom - r + k)} ${num(right - r + k)} ${num(bottom)} ${num(right - r)} ${num(bottom)}`,
    `L ${num(x)} ${num(bottom)}`,
    `L ${num(x)} ${num(y + r)}`,
    `C ${num(x)} ${num(y + r - k)} ${num(x + r - k)} ${num(y)} ${num(x + r)} ${num(y)}`,
    'Z',
  ].join(' ');
}

function ringShape(shape: Ring, x: number, y: number, size: number): string {
  if (shape === 'square') return rect(x, y, size, size);
  if (shape === 'rounded') return roundedRect(x, y, size, size, size * 0.28);
  if (shape === 'circle') return circle(x + size / 2, y + size / 2, size / 2);
  return leaf(x, y, size, size * 0.42);
}

function eyeShape(shape: Eye, x: number, y: number): string {
  if (shape === 'square') return rect(x, y, 3, 3);
  if (shape === 'rounded') return roundedRect(x, y, 3, 3, 0.9);
  if (shape === 'circle') return circle(x + 1.5, y + 1.5, 1.5);
  return diamond(x + 1.5, y + 1.5, 1.5);
}

/** A module whose corners are rounded only where both neighbours beside that corner are empty. */
function connected(
  x: number,
  y: number,
  open: { top: boolean; right: boolean; bottom: boolean; left: boolean },
): string {
  const r = 0.5;
  const k = r * 0.5522847498;
  const tl = open.top && open.left;
  const tr = open.top && open.right;
  const br = open.bottom && open.right;
  const bl = open.bottom && open.left;
  const parts = [
    `M ${num(x + (tl ? r : 0))} ${num(y)}`,
    `L ${num(x + 1 - (tr ? r : 0))} ${num(y)}`,
  ];
  if (tr)
    parts.push(
      `C ${num(x + 1 - r + k)} ${num(y)} ${num(x + 1)} ${num(y + r - k)} ${num(x + 1)} ${num(y + r)}`,
    );
  parts.push(`L ${num(x + 1)} ${num(y + 1 - (br ? r : 0))}`);
  if (br)
    parts.push(
      `C ${num(x + 1)} ${num(y + 1 - r + k)} ${num(x + 1 - r + k)} ${num(y + 1)} ${num(x + 1 - r)} ${num(y + 1)}`,
    );
  parts.push(`L ${num(x + (bl ? r : 0))} ${num(y + 1)}`);
  if (bl)
    parts.push(
      `C ${num(x + r - k)} ${num(y + 1)} ${num(x)} ${num(y + 1 - r + k)} ${num(x)} ${num(y + 1 - r)}`,
    );
  parts.push(`L ${num(x)} ${num(y + (tl ? r : 0))}`);
  if (tl)
    parts.push(`C ${num(x)} ${num(y + r - k)} ${num(x + r - k)} ${num(y)} ${num(x + r)} ${num(y)}`);
  parts.push('Z');
  return parts.join(' ');
}

/** A matrix code drawn in the given style, one unit to a module, with its quiet zone. */
export function styleGrid(grid: Grid, style: Style): Drawing {
  const { columns, rows, cells } = grid;
  const q = Math.max(0, style.quietZone);
  const plate = plateFor(grid, style.logo);
  const inFinder = new Uint8Array(columns * rows);
  for (const finder of grid.finders) {
    for (let y = finder.row; y < finder.row + 7; y++)
      for (let x = finder.column; x < finder.column + 7; x++) inFinder[y * columns + x] = 1;
  }
  const dark = (column: number, row: number): boolean => {
    if (column < 0 || row < 0 || column >= columns || row >= rows) return false;
    const at = row * columns + column;
    return cells[at] === 1 && !inFinder[at] && !(plate && inPlate(plate, column + 0.5, row + 0.5));
  };

  // Module paths, grouped by colour: one paint, or a band of a per-module theme.
  const groups = new Map<string, { paint: Paint; parts: string[] }>();
  const add = (paint: Paint, part: string): void => {
    const key = JSON.stringify(paint);
    const group = groups.get(key) ?? { paint, parts: [] };
    group.parts.push(part);
    groups.set(key, group);
  };
  const bandColour = new Map<number, string>();
  const paintAt = (column: number, row: number): Paint => {
    if (!style.perModule) return style.foreground;
    const band = Math.min(
      BANDS - 1,
      Math.floor(((column + row) / Math.max(1, columns + rows - 2)) * BANDS),
    );
    let colour = bandColour.get(band);
    if (!colour) {
      colour = style.perModule(column, row, columns, rows);
      bandColour.set(band, colour);
    }
    return { type: 'solid', colour };
  };

  if (style.dots === 'vertical' || style.dots === 'horizontal') {
    const vertical = style.dots === 'vertical';
    const outer = vertical ? columns : rows;
    const inner = vertical ? rows : columns;
    for (let a = 0; a < outer; a++) {
      for (let b = 0; b < inner; b++) {
        const at = (n: number): boolean => (vertical ? dark(a, n) : dark(n, a));
        if (!at(b)) continue;
        let end = b;
        while (end + 1 < inner && at(end + 1)) end++;
        const length = end - b + 1;
        const shape = vertical
          ? roundedRect(a + q + 0.1, b + q, 0.8, length, 0.4)
          : roundedRect(b + q, a + q + 0.1, length, 0.8, 0.4);
        add(vertical ? paintAt(a, b) : paintAt(b, a), shape);
        b = end;
      }
    }
  } else {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        if (!dark(column, row)) continue;
        const x = column + q;
        const y = row + q;
        let shape: string;
        if (style.dots === 'square') shape = rect(x, y, 1, 1);
        else if (style.dots === 'rounded') shape = roundedRect(x, y, 1, 1, 0.3);
        else if (style.dots === 'circle') shape = circle(x + 0.5, y + 0.5, 0.46);
        else if (style.dots === 'diamond') shape = diamond(x + 0.5, y + 0.5, 0.5);
        else {
          shape = connected(x, y, {
            top: !dark(column, row - 1),
            right: !dark(column + 1, row),
            bottom: !dark(column, row + 1),
            left: !dark(column - 1, row),
          });
        }
        add(paintAt(column, row), shape);
      }
    }
  }

  const layers: Layer[] = [...groups.values()].map(({ paint, parts }) => ({
    paint,
    d: parts.join(' '),
  }));
  if (grid.finders.length) {
    const paint = style.corners ?? style.foreground;
    const rings = grid.finders.map(
      ({ column, row }) =>
        `${ringShape(style.ring, column + q, row + q, 7)} ${ringShape(style.ring, column + q + 1, row + q + 1, 5)}`,
    );
    const eyes = grid.finders.map(({ column, row }) =>
      eyeShape(style.eye, column + q + 2, row + q + 2),
    );
    layers.push({ paint, d: rings.join(' '), evenOdd: true }, { paint, d: eyes.join(' ') });
  }

  let logo: Logo | null = null;
  if (plate && style.logo) {
    // The largest centred square whose every cell the plate cleared: on a rounded or circular plate
    // that is smaller than the plate, so no corner of the image covers a module still in use.
    const cleared = (column: number, row: number): boolean =>
      inPlate(plate, column + 0.5, row + 0.5);
    const fits = (k: number): boolean => {
      for (let row = plate.top + k; row < plate.top + plate.side - k; row++) {
        for (let column = plate.left + k; column < plate.left + plate.side - k; column++) {
          if (!cleared(column, row)) return false;
        }
      }
      return true;
    };
    let inset = 0;
    while (inset * 2 < plate.side && !fits(inset)) inset++;
    const padding = Math.max(0, style.logo.padding);
    const size = plate.side - 2 * inset - 2 * padding;
    if (size > 0) {
      const { share: _share, padding: _padding, plate: _shape, ...image } = style.logo;
      logo = {
        ...image,
        x: plate.left + inset + padding + q,
        y: plate.top + inset + padding + q,
        size,
      };
    }
  }

  return {
    width: columns + 2 * q,
    height: rows + 2 * q,
    background:
      style.background && style.background !== 'transparent'
        ? { type: 'solid', colour: style.background }
        : null,
    layers,
    logo,
  };
}
