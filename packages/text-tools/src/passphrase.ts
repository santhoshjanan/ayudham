import { LIMITS } from './limits.ts';
import { below, guard, type RandomSource } from './random.ts';
import { ok, refuse, whole, type Result } from './result.ts';
import { WORD_COUNT } from './wordlist.ts';

export const SEPARATORS = ['-', ' ', '.', '_'] as const;
export type Separator = (typeof SEPARATORS)[number];

export type PassphraseOptions = {
  words: number;
  separator: Separator;
  /** A capital at the start of every word. Adds no strength. */
  capitals: boolean;
  /** One digit after one word chosen at random. */
  digit: boolean;
};

export const PASSPHRASE_DEFAULTS: PassphraseOptions = {
  words: 6,
  separator: '-',
  capitals: false,
  digit: false,
};

const allowed = (options: PassphraseOptions): boolean =>
  whole(options.words, LIMITS.wordsMin, LIMITS.wordsMax) && SEPARATORS.includes(options.separator);

/** The strength of the rule, in whole bits, rounded down. */
export function passphraseBits(options: PassphraseOptions): Result<number> {
  if (!allowed(options)) return refuse('out-of-range');
  const digit = options.digit === true ? Math.log2(10 * options.words) : 0;
  return ok(Math.floor(options.words * Math.log2(WORD_COUNT) + digit));
}

/** Words from `list`, which must be the whole list as `readWordList` returned it. */
export function passphrase(
  options: PassphraseOptions,
  list: readonly string[],
  random: RandomSource,
): Result<string> {
  if (!allowed(options)) return refuse('out-of-range');
  if (!Array.isArray(list) || list.length !== WORD_COUNT) return refuse('bad-word-list');
  return guard(() => {
    const chosen = Array.from({ length: options.words }, () => {
      const word = String(list[below(WORD_COUNT, random)]);
      return options.capitals === true ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    });
    if (options.digit === true) {
      const at = below(chosen.length, random);
      chosen[at] += String(below(10, random));
    }
    return chosen.join(options.separator);
  });
}
