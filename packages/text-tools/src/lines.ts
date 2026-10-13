import { guard, shuffled, type RandomSource } from './random.ts';
import { refuse, type Result } from './result.ts';
import { checkText, listLines } from './text.ts';

export const LINE_ORDERS = ['keep', 'az', 'za', 'reverse', 'shuffle'] as const;
export type LineOrder = (typeof LINE_ORDERS)[number];

export type LineOptions = {
  /** Trim the white space at both ends of each line. */
  trim: boolean;
  /** Remove blank lines. */
  blanks: boolean;
  /** Remove repeated lines, keeping the first of each. */
  unique: boolean;
  /** Ignore case when removing repeats and when sorting. */
  ignoreCase: boolean;
  order: LineOrder;
  /** Number the lines. */
  number: boolean;
};

export const LINE_DEFAULTS: LineOptions = {
  trim: true,
  blanks: false,
  unique: false,
  ignoreCase: false,
  order: 'keep',
  number: false,
};

/** Moves surrogates above the rest of the basic plane, so units compare as code points do. */
const rank = (unit: number): number =>
  unit >= 0xd800 && unit <= 0xdfff ? unit + 0x2000 : unit >= 0xe000 ? unit - 0x800 : unit;

/** Order by code point, the same in every browser and language. */
function compare(a: string, b: string): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    const left = a.charCodeAt(i);
    const right = b.charCodeAt(i);
    if (left !== right) return rank(left) - rank(right);
  }
  return a.length - b.length;
}

function sorted(list: string[], ignoreCase: boolean): string[] {
  const keyed = list.map((line) => ({ line, key: ignoreCase ? line.toLowerCase() : line }));
  keyed.sort((a, b) => compare(a.key, b.key) || compare(a.line, b.line));
  return keyed.map((entry) => entry.line);
}

/** The steps, in the order the options are listed. */
export function lines(text: unknown, options: LineOptions, random: RandomSource): Result<string> {
  const checked = checkText(text);
  if (!checked.ok) return checked;
  if (!LINE_ORDERS.includes(options.order)) return refuse('out-of-range');
  const ignoreCase = options.ignoreCase === true;
  return guard(() => {
    let list = listLines(checked.value);
    if (options.trim === true) list = list.map((line) => line.trim());
    if (options.blanks === true) list = list.filter((line) => line.trim() !== '');
    if (options.unique === true) {
      const seen = new Set<string>();
      list = list.filter((line) => {
        const key = ignoreCase ? line.toLowerCase() : line;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    if (options.order === 'az') list = sorted(list, ignoreCase);
    if (options.order === 'za') list = sorted(list, ignoreCase).reverse();
    if (options.order === 'reverse') list = list.toReversed();
    if (options.order === 'shuffle') list = shuffled(list, random);
    if (options.number === true) list = list.map((line, i) => `${i + 1}. ${line}`);
    return list.join('\n');
  });
}
