import { DIGITS, LOOKALIKES, LOWER, SYMBOLS, UPPER } from './alphabets.ts';
import { LIMITS } from './limits.ts';
import { below, guard, RandomFailure, type RandomSource } from './random.ts';
import { given, ok, refuse, whole, type Result } from './result.ts';

export type PasswordOptions = {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  /** No look-alikes. */
  plain: boolean;
};

export const PASSWORD_DEFAULTS: PasswordOptions = {
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  plain: false,
};

/** The classes that are on, each as its characters. */
function classes(options: PasswordOptions): Result<string[][]> {
  if (!given(options) || !whole(options.length, LIMITS.passwordMin, LIMITS.length)) {
    return refuse('out-of-range');
  }
  const on = [
    options.lower === true ? LOWER : '',
    options.upper === true ? UPPER : '',
    options.digits === true ? DIGITS : '',
    options.symbols === true ? SYMBOLS : '',
  ].filter((set) => set !== '');
  if (on.length === 0) return refuse('no-classes');
  return ok(
    on.map((set) =>
      [...set].filter((char) => !(options.plain === true && LOOKALIKES.includes(char))),
    ),
  );
}

/**
 * How many strings of `length` characters use every one of the classes, whose sizes are given.
 * Counted by inclusion and exclusion: all strings, less those missing one class, and so on.
 */
export function countAllowed(sizes: number[], length: number): bigint {
  const all = sizes.reduce((sum, size) => sum + size, 0);
  let count = 0n;
  for (let missing = 0; missing < 1 << sizes.length; missing++) {
    let left = all;
    let dropped = 0;
    sizes.forEach((size, i) => {
      if (missing & (1 << i)) {
        left -= size;
        dropped++;
      }
    });
    const term = BigInt(left) ** BigInt(length);
    count += dropped % 2 === 1 ? -term : term;
  }
  return count;
}

/** The strength of the rule, in whole bits, rounded down. */
export function passwordBits(options: PasswordOptions): Result<number> {
  const sets = classes(options);
  if (!sets.ok) return sets;
  const count = countAllowed(
    sets.value.map((set) => set.length),
    options.length,
  );
  return ok(count.toString(2).length - 1);
}

/**
 * A password with at least one character of every class that is on. It is drawn whole and drawn
 * again until it has them, so every allowed password is equally likely.
 */
export function password(options: PasswordOptions, random: RandomSource): Result<string> {
  const sets = classes(options);
  if (!sets.ok) return sets;
  const all = sets.value.flat();
  return guard(() => {
    for (let attempt = 0; attempt < LIMITS.redraws; attempt++) {
      const drawn = Array.from({ length: options.length }, () => all[below(all.length, random)]!);
      if (sets.value.every((set) => drawn.some((char) => set.includes(char)))) {
        return drawn.join('');
      }
    }
    throw new RandomFailure();
  });
}
