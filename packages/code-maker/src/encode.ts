import type * as BwipJs from 'bwip-js/generic';
import { checkOptions, RMQR_SIZES, symbology, type Symbology } from './catalogue.ts';
import type { Drawing } from './drawing.ts';
import { LIMITS } from './limits.ts';
import { ok, refuse, type Problem, type Result } from './result.ts';
import { prepareText, type TextOptions } from './text.ts';

/** bwip-js, passed in by whoever loaded it: the package itself ships no encoder. */
export type Bwip = Pick<typeof BwipJs, 'raw' | 'render' | 'FontLib'>;

/** A module grid, row by row, 1 dark; and where its finder patterns sit. */
export type Grid = {
  kind: 'grid';
  columns: number;
  rows: number;
  cells: Uint8Array;
  finders: { column: number; row: number }[];
};

export type Encoded = {
  symbology: Symbology;
  grid: Grid | null;
  drawing: Drawing | null;
  warnings: 'no-eci'[];
};

export type EncodeRequest = {
  id: string;
  text: string;
  textOptions: TextOptions;
  options: Record<string, unknown>;
  colours: { foreground: string; background: string | null };
};

/** A bwip-js error, by its code name. Its message is never passed on. */
export function bwipProblem(error: unknown): Problem {
  const code = error instanceof Error ? (/bwipp\.(\w+)#/.exec(error.message)?.[1] ?? '') : '';
  if (/InputTooLong|NoValidSymbol|TooLong/.test(code)) return 'too-long';
  if (/badCharacter/.test(code)) return 'bad-character';
  if (/badCheckDigit/.test(code)) return 'bad-check-digit';
  if (/badLength/.test(code)) return 'bad-length';
  return 'not-encodable';
}

type RawGrid = { pixs: number[]; pixx: number; pixy: number };

function finders(id: string, columns: number, rows: number): Grid['finders'] {
  if (id === 'qr') {
    return [
      { column: 0, row: 0 },
      { column: columns - 7, row: 0 },
      { column: 0, row: rows - 7 },
    ];
  }
  return id === 'micro-qr' || id === 'rmqr' ? [{ column: 0, row: 0 }] : [];
}

function gridOf(
  bwip: Bwip,
  found: Symbology,
  text: string,
  options: Record<string, string | number | boolean>,
): Grid {
  const sizes = found.id === 'rmqr' && options.version === undefined ? RMQR_SIZES : [undefined];
  let last: unknown;
  for (const size of sizes) {
    try {
      const [made] = bwip.raw(
        found.bcid,
        text,
        (size ? { ...options, version: size } : options) as never,
      ) as unknown as RawGrid[];
      const { pixs, pixx, pixy } = made!;
      return {
        kind: 'grid',
        columns: pixx,
        rows: pixy,
        cells: Uint8Array.from(pixs),
        finders: finders(found.id, pixx, pixy),
      };
    } catch (error) {
      last = error;
      if (bwipProblem(error) !== 'too-long') break;
    }
  }
  throw last;
}

/** A code's grid (styled here) or its drawing (drawn by bwip-js), or why it cannot be made. */
export function encode(bwip: Bwip, request: EncodeRequest): Result<Encoded> {
  const found = symbology(request.id);
  if (!found) return refuse('out-of-range');
  const options = checkOptions(found.id, request.options);
  if (!options.ok) return options;
  if (typeof request.text !== 'string' || request.text.trim() === '') return refuse('empty');
  if (request.text.length > LIMITS.text) return refuse('too-long');
  const prepared = prepareText(request.text, request.textOptions, found.capability);
  if (!prepared.ok) return prepared;
  const all = { ...options.value, ...found.fixed, ...prepared.value.bwip };
  try {
    let grid: Grid | null = null;
    if (found.family === 'drawn') bwip.raw(found.bcid, prepared.value.text, all as never);
    else grid = gridOf(bwip, found, prepared.value.text, all);
    return ok({ symbology: found, grid, drawing: null, warnings: prepared.value.warnings });
  } catch (error) {
    return refuse(bwipProblem(error));
  }
}
