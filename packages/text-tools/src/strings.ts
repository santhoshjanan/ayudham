import { DIGITS, LOWER, UPPER } from './alphabets.ts';
import { toBase64, toHex } from './bytes.ts';
import { LIMITS } from './limits.ts';
import { bytes, guard, pickFrom, type RandomSource } from './random.ts';
import { given, ok, refuse, whole, type Result } from './result.ts';

export const STRING_KINDS = [
  'hex',
  'base64',
  'base64url',
  'digits',
  'letters',
  'alphanumeric',
  'own',
] as const;
export type StringKind = (typeof STRING_KINDS)[number];
export type LetterCase = 'lower' | 'upper' | 'both';

export type StringOptions = {
  kind: StringKind;
  /** Bytes for hex and both Base64 kinds, characters for the rest. */
  size: number;
  /** Used by the letters kind. */
  letters: LetterCase;
  /** Used by the own kind. */
  alphabet: string;
};

/** The size each kind starts with. */
export const STRING_SIZES: Record<StringKind, number> = {
  hex: 16,
  base64: 32,
  base64url: 32,
  digits: 16,
  letters: 16,
  alphanumeric: 24,
  own: 16,
};

/** The characters of a typed alphabet, or why it cannot be used. Counted as code points. */
export function checkAlphabet(text: unknown): Result<string[]> {
  // A code point is at most two units, so anything longer than this is too many characters.
  if (typeof text !== 'string' || text.length > LIMITS.alphabetMax * 2) {
    return refuse('alphabet-size');
  }
  const chars = [...text];
  if (chars.length < LIMITS.alphabetMin || chars.length > LIMITS.alphabetMax) {
    return refuse('alphabet-size');
  }
  if (/[\s\p{C}]/u.test(text)) return refuse('alphabet-space');
  if (new Set(chars).size !== chars.length) return refuse('alphabet-repeat');
  return ok(chars);
}

type Plan = { bytes: true } | { bytes: false; alphabet: string[] };

const LETTERS: Record<LetterCase, string> = { lower: LOWER, upper: UPPER, both: UPPER + LOWER };

function plan(options: StringOptions): Result<Plan> {
  if (!given(options)) return refuse('out-of-range');
  const kind = options.kind;
  if (kind === 'hex' || kind === 'base64' || kind === 'base64url') {
    return whole(options.size, 1, LIMITS.bytes) ? ok({ bytes: true }) : refuse('out-of-range');
  }
  if (!whole(options.size, 1, LIMITS.length)) return refuse('out-of-range');
  if (kind === 'digits') return ok({ bytes: false, alphabet: [...DIGITS] });
  if (kind === 'alphanumeric') return ok({ bytes: false, alphabet: [...(UPPER + LOWER + DIGITS)] });
  if (kind === 'letters') {
    // Asked of the table itself: a name every object has, such as constructor, is no choice.
    if (!Object.hasOwn(LETTERS, options.letters)) return refuse('out-of-range');
    return ok({ bytes: false, alphabet: [...LETTERS[options.letters]] });
  }
  if (kind === 'own') {
    const chars = checkAlphabet(options.alphabet);
    return chars.ok ? ok({ bytes: false, alphabet: chars.value }) : chars;
  }
  return refuse('out-of-range');
}

/** The strength of the rule, in whole bits, rounded down. */
export function stringBits(options: StringOptions): Result<number> {
  const made = plan(options);
  if (!made.ok) return made;
  return ok(
    made.value.bytes
      ? options.size * 8
      : Math.floor(options.size * Math.log2(made.value.alphabet.length)),
  );
}

export function randomString(options: StringOptions, random: RandomSource): Result<string> {
  const made = plan(options);
  if (!made.ok) return made;
  const how = made.value;
  return guard(() => {
    if (!how.bytes) return pickFrom(how.alphabet, options.size, random);
    const drawn = bytes(options.size, random);
    return options.kind === 'hex' ? toHex(drawn) : toBase64(drawn, options.kind === 'base64url');
  });
}
