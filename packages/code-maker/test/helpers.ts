import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { RandomSource } from '../src/index.ts';

// The decoder downloads its WebAssembly from a public CDN unless handed the bytes. Tests hand it
// the local file, and any attempt at the network fails loudly.
globalThis.fetch = () => {
  throw new Error('tests may not use the network');
};

const require = createRequire(import.meta.url);
const zxing = await import('zxing-wasm/reader');
zxing.prepareZXingModule({
  overrides: {
    wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')).buffer,
  },
  fireImmediately: true,
});

/** bwip-js's types describe the module as one namespace; at run time its default export carries it. */
type Bwip = typeof import('bwip-js/generic');

export async function loadBwip(): Promise<Bwip> {
  const loaded = (await import('bwip-js/generic')) as Bwip & { default?: Bwip };
  return loaded.default ?? loaded;
}

/** Hands out the given bytes in order, starting again when they run out. */
export function fixedRandom(values: number[]): RandomSource {
  let at = 0;
  return (count) => Uint8Array.from({ length: count }, () => values[at++ % values.length]!);
}

const SCALE = 4;
const QUIET = 10;

async function read(dark: (x: number, y: number) => boolean, columns: number, rows: number) {
  const width = (columns + 2 * QUIET) * SCALE;
  const height = (rows + 2 * QUIET) * SCALE;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      if (!dark(x, y)) continue;
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          const at = (((y + QUIET) * SCALE + dy) * width + (x + QUIET) * SCALE + dx) * 4;
          data[at] = data[at + 1] = data[at + 2] = 0;
        }
      }
    }
  }
  const found = await zxing.readBarcodes(
    { data, width, height, colorSpace: 'srgb' } as unknown as Parameters<
      typeof zxing.readBarcodes
    >[0],
    { tryHarder: true, formats: [], eanAddOnSymbol: 'Read' },
  );
  const first = found[0];
  return first ? { text: first.text, format: first.format, hasECI: first.hasECI } : null;
}

/** Decodes a grid of modules (1 dark), drawn square with a wide quiet zone. */
export const decodeGrid = (cells: Uint8Array, columns: number, rows: number) =>
  read((x, y) => cells[y * columns + x] === 1, columns, rows);

/** Decodes a linear code from bwip-js's bar and space widths (bars at even indexes). */
export function decodeBars(widths: number[]) {
  const modules: boolean[] = [];
  widths.forEach((width, index) => {
    for (let step = 0; step < Math.round(width); step++) modules.push(index % 2 === 0);
  });
  return read((x) => modules[x] === true, modules.length, 40);
}
