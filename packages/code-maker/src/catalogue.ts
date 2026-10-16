import { ok, refuse, type Result } from './result.ts';
import type { TextCapability } from './text.ts';

/** `qr` and `grid` are styled from their module grid here; `drawn` is drawn by bwip-js. */
export type Family = 'qr' | 'grid' | 'drawn';

export type OptionSpec =
  | {
      key: string;
      label: string;
      kind: 'choice';
      values: readonly (string | number)[];
      default: string | number;
    }
  | {
      key: string;
      label: string;
      kind: 'integer';
      min: number;
      max: number;
      default: number | 'auto';
    }
  | { key: string; label: string; kind: 'boolean'; default: boolean };

export type Symbology = {
  id: string;
  label: string;
  group: '2d' | 'product' | 'linear';
  bcid: string;
  family: Family;
  capability: TextCapability;
  /** The format name the test decoder reports; null where no decoder reads it. */
  decoder: string | null;
  options: readonly OptionSpec[];
  /** The standard's minimum quiet zone, in modules. */
  quietZone: number;
  /** Options always passed to bwip-js. */
  fixed?: Readonly<Record<string, string | number | boolean>>;
  /** The only characters it can carry, where narrower than its capability: one character per test. */
  characters?: RegExp;
};

/** Every rMQR size, smallest area first, so the first that fits is the smallest. */
export const RMQR_SIZES: readonly string[] = [7, 9, 11, 13, 15, 17]
  .flatMap((rows) => [27, 43, 59, 77, 99, 139].map((columns) => ({ rows, columns })))
  .filter(({ rows, columns }) => !(columns === 27 && rows !== 11 && rows !== 13))
  .sort((a, b) => a.rows * a.columns - b.rows * b.columns || a.rows - b.rows)
  .map(({ rows, columns }) => `R${rows}x${columns}`);

const DM_SQUARE = [
  10, 12, 14, 16, 18, 20, 22, 24, 26, 32, 36, 40, 44, 48, 52, 64, 72, 80, 88, 96, 104, 120, 132,
  144,
].map((size) => `${size}x${size}`);
const DM_RECT = ['8x18', '8x32', '12x26', '12x36', '16x36', '16x48'];

const linear = (check: boolean): OptionSpec[] => [
  { key: 'height', label: 'Bar height (mm)', kind: 'integer', min: 5, max: 50, default: 15 },
  { key: 'includetext', label: 'Show the text', kind: 'boolean', default: true },
  ...(check
    ? ([
        { key: 'includecheck', label: 'Add a check digit', kind: 'boolean', default: true },
        {
          key: 'includecheckintext',
          label: 'Show the check digit',
          kind: 'boolean',
          default: true,
        },
      ] as OptionSpec[])
    : []),
];

const product: OptionSpec[] = [
  { key: 'height', label: 'Bar height (mm)', kind: 'integer', min: 5, max: 50, default: 15 },
  { key: 'includetext', label: 'Show the digits', kind: 'boolean', default: true },
];

const row = (
  id: string,
  label: string,
  group: Symbology['group'],
  bcid: string,
  family: Family,
  capability: TextCapability,
  decoder: string | null,
  options: OptionSpec[],
  quietZone: number,
  fixed?: Symbology['fixed'],
  characters?: RegExp,
): Symbology => ({
  id,
  label,
  group,
  bcid,
  family,
  capability,
  decoder,
  options,
  quietZone,
  ...(fixed ? { fixed } : {}),
  ...(characters ? { characters } : {}),
});

export const SYMBOLOGIES: readonly Symbology[] = [
  row(
    'qr',
    'QR code',
    '2d',
    'qrcode',
    'qr',
    'eci',
    'QRCode',
    [
      {
        key: 'eclevel',
        label: 'Error correction',
        kind: 'choice',
        values: ['L', 'M', 'Q', 'H'],
        default: 'M',
      },
      { key: 'version', label: 'Size', kind: 'integer', min: 1, max: 40, default: 'auto' },
      { key: 'mask', label: 'Mask', kind: 'integer', min: 1, max: 8, default: 'auto' },
    ],
    4,
  ),
  row(
    'micro-qr',
    'Micro QR',
    '2d',
    'microqrcode',
    'qr',
    'utf8',
    'MicroQRCode',
    [
      {
        key: 'version',
        label: 'Size',
        kind: 'choice',
        values: ['auto', 'M1', 'M2', 'M3', 'M4'],
        default: 'auto',
      },
      {
        key: 'eclevel',
        label: 'Error correction',
        kind: 'choice',
        values: ['L', 'M', 'Q'],
        default: 'M',
      },
    ],
    2,
  ),
  row(
    'rmqr',
    'Rectangular Micro QR',
    '2d',
    'rectangularmicroqrcode',
    'qr',
    'eci',
    'RMQRCode',
    [
      {
        key: 'version',
        label: 'Size',
        kind: 'choice',
        values: ['auto', ...RMQR_SIZES],
        default: 'auto',
      },
      {
        key: 'eclevel',
        label: 'Error correction',
        kind: 'choice',
        values: ['M', 'H'],
        default: 'M',
      },
    ],
    2,
  ),
  row(
    'data-matrix',
    'Data Matrix',
    '2d',
    'datamatrix',
    'grid',
    'eci',
    'DataMatrix',
    [
      {
        key: 'version',
        label: 'Size',
        kind: 'choice',
        values: ['auto', ...DM_SQUARE],
        default: 'auto',
      },
    ],
    1,
  ),
  row(
    'data-matrix-rect',
    'Data Matrix, rectangular',
    '2d',
    'datamatrixrectangular',
    'grid',
    'eci',
    'DataMatrix',
    [
      {
        key: 'version',
        label: 'Size',
        kind: 'choice',
        values: ['auto', ...DM_RECT],
        default: 'auto',
      },
    ],
    1,
  ),
  row(
    'aztec',
    'Aztec',
    '2d',
    'azteccode',
    'grid',
    'eci',
    'Aztec',
    [
      {
        key: 'eclevel',
        label: 'Error correction (%)',
        kind: 'integer',
        min: 5,
        max: 95,
        default: 23,
      },
      { key: 'layers', label: 'Layers', kind: 'integer', min: 1, max: 32, default: 'auto' },
    ],
    0,
  ),
  row(
    'aztec-compact',
    'Aztec, compact',
    '2d',
    'azteccodecompact',
    'grid',
    'eci',
    'Aztec',
    [
      {
        key: 'eclevel',
        label: 'Error correction (%)',
        kind: 'integer',
        min: 5,
        max: 95,
        default: 23,
      },
      { key: 'layers', label: 'Layers', kind: 'integer', min: 1, max: 4, default: 'auto' },
    ],
    0,
  ),
  row('aztec-rune', 'Aztec Rune', '2d', 'aztecrune', 'grid', 'digits', 'Aztec', [], 0),
  row(
    'pdf417',
    'PDF417',
    '2d',
    'pdf417',
    'drawn',
    'eci',
    'PDF417',
    [
      { key: 'columns', label: 'Columns', kind: 'integer', min: 1, max: 30, default: 'auto' },
      { key: 'rows', label: 'Rows', kind: 'integer', min: 3, max: 90, default: 'auto' },
      {
        key: 'eclevel',
        label: 'Error correction',
        kind: 'integer',
        min: 0,
        max: 8,
        default: 'auto',
      },
    ],
    2,
  ),
  row(
    'pdf417-compact',
    'PDF417, compact',
    '2d',
    'pdf417compact',
    'drawn',
    'eci',
    'PDF417',
    [
      { key: 'columns', label: 'Columns', kind: 'integer', min: 1, max: 30, default: 'auto' },
      { key: 'rows', label: 'Rows', kind: 'integer', min: 3, max: 90, default: 'auto' },
      {
        key: 'eclevel',
        label: 'Error correction',
        kind: 'integer',
        min: 0,
        max: 8,
        default: 'auto',
      },
    ],
    2,
  ),
  row(
    'micro-pdf417',
    'MicroPDF417',
    '2d',
    'micropdf417',
    'drawn',
    'utf8',
    'MicroPDF417',
    [{ key: 'columns', label: 'Columns', kind: 'integer', min: 1, max: 4, default: 'auto' }],
    1,
  ),
  row(
    'maxicode',
    'MaxiCode',
    '2d',
    'maxicode',
    'drawn',
    'eci',
    'MaxiCode',
    [{ key: 'mode', label: 'Mode', kind: 'choice', values: [2, 3, 4, 5, 6], default: 4 }],
    1,
  ),
  row(
    'dotcode',
    'DotCode',
    '2d',
    'dotcode',
    'drawn',
    'eci',
    null,
    [{ key: 'columns', label: 'Columns', kind: 'integer', min: 5, max: 200, default: 'auto' }],
    3,
  ),
  row('ean-13', 'EAN-13', 'product', 'ean13', 'drawn', 'digits', 'EAN13', product, 11),
  row('ean-8', 'EAN-8', 'product', 'ean8', 'drawn', 'digits', 'EAN8', product, 7),
  row('upc-a', 'UPC-A', 'product', 'upca', 'drawn', 'digits', 'EAN13', product, 9),
  row('upc-e', 'UPC-E', 'product', 'upce', 'drawn', 'digits', 'UPCE', product, 9),
  row(
    'isbn',
    'ISBN',
    'product',
    'isbn',
    'drawn',
    'ascii',
    'EAN13',
    product,
    11,
    undefined,
    /^[0-9X-]$/,
  ),
  row(
    'issn',
    'ISSN',
    'product',
    'issn',
    'drawn',
    'ascii',
    'EAN13',
    product,
    11,
    undefined,
    /^[0-9X-]$/,
  ),
  row('code-128', 'Code 128', 'linear', 'code128', 'drawn', 'ascii', 'Code128', linear(false), 10),
  row('gs1-128', 'GS1-128', 'linear', 'gs1-128', 'drawn', 'ascii', 'Code128', linear(false), 10),
  row(
    'code-39',
    'Code 39',
    'linear',
    'code39',
    'drawn',
    'ascii',
    'Code39',
    linear(true),
    10,
    undefined,
    /^[0-9A-Z .$/+%-]$/,
  ),
  row(
    'code-39-ext',
    'Code 39 extended',
    'linear',
    'code39ext',
    'drawn',
    'ascii',
    'Code39Ext',
    linear(true),
    10,
  ),
  // Readers need Code 93's two check characters, so they are always written.
  row('code-93', 'Code 93', 'linear', 'code93', 'drawn', 'ascii', 'Code93', linear(false), 10, {
    includecheck: true,
  }),
  row(
    'itf',
    'Interleaved 2 of 5',
    'linear',
    'interleaved2of5',
    'drawn',
    'digits',
    'ITF',
    linear(true),
    10,
  ),
  row('itf-14', 'ITF-14', 'linear', 'itf14', 'drawn', 'digits', 'ITF', linear(false), 10),
  row(
    'codabar',
    'Codabar',
    'linear',
    'rationalizedCodabar',
    'drawn',
    'ascii',
    'Codabar',
    linear(true),
    10,
    undefined,
    /^[0-9A-D$:/.+-]$/,
  ),
  row(
    'databar-omni',
    'GS1 DataBar',
    'linear',
    'databaromni',
    'drawn',
    'ascii',
    'DataBarOmni',
    linear(false),
    1,
    undefined,
    /^[0-9()]$/,
  ),
  row(
    'databar-limited',
    'GS1 DataBar Limited',
    'linear',
    'databarlimited',
    'drawn',
    'ascii',
    'DataBarLtd',
    linear(false),
    1,
    undefined,
    /^[0-9()]$/,
  ),
  row(
    'databar-expanded',
    'GS1 DataBar Expanded',
    'linear',
    'databarexpanded',
    'drawn',
    'ascii',
    'DataBarExp',
    linear(false),
    1,
  ),
];

export const symbology = (id: string): Symbology | undefined =>
  SYMBOLOGIES.find((entry) => entry.id === id);

/** The options a person chose, checked against the symbology's list; `auto` is left out. */
export function checkOptions(
  id: string,
  options: Record<string, unknown>,
): Result<Record<string, string | number | boolean>> {
  const found = symbology(id);
  if (!found || typeof options !== 'object' || options === null) return refuse('out-of-range');
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(options)) {
    const spec = found.options.find((option) => option.key === key);
    if (!spec) return refuse('out-of-range');
    if (value === 'auto') continue;
    if (spec.kind === 'choice') {
      if (!spec.values.includes(value as string | number)) return refuse('out-of-range');
    } else if (spec.kind === 'integer') {
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < spec.min ||
        value > spec.max
      )
        return refuse('out-of-range');
    } else if (typeof value !== 'boolean') {
      return refuse('out-of-range');
    }
    out[key] = value as string | number | boolean;
  }
  return ok(out);
}
