import { isIPv4, isIPv6 } from 'node:net';
import { NAME_MAX, NAME_MIN, PASSCODE_MAX, PASSCODE_MIN } from '@ayudham/protocol';
import { z } from 'zod';

/** Control, format (zero-width, direction), surrogate and line or paragraph separator characters. */
const HIDDEN = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * A display name. Compatibility-normalised, so look-alike forms collapse to
 * one spelling; free of hidden characters; and containing at least one letter
 * or digit, so it cannot be blank-looking or pure punctuation.
 */
export const nameSchema = z
  .string()
  .transform((value) => value.normalize('NFKC').trim())
  .pipe(
    z
      .string()
      .min(NAME_MIN)
      .max(NAME_MAX)
      .refine((value) => !HIDDEN.test(value) && LETTER_OR_DIGIT.test(value))
      // History shows this word for people who removed their name; nobody may take it.
      .refine((value) => value.toLowerCase() !== 'anonymous'),
  );

export const roomCodeSchema = z.string().regex(/^[A-Za-z0-9]{12}$/);

export const deckIdSchema = z.enum(['fibonacci', 'modifiedFibonacci', 'tshirt', 'powersOfTwo']);

export const passcodeSchema = z.string().min(PASSCODE_MIN).max(PASSCODE_MAX);

/** The eight 16-bit groups of an IPv6 address, or null when it does not have eight. */
function expand(bare: string): number[] | null {
  const halves = bare.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string): number[] =>
    (part === '' ? [] : part.split(':')).flatMap((group) => {
      if (!group.includes('.')) return [Number.parseInt(group, 16)];
      // A dotted IPv4 tail stands for two groups.
      const [a = 0, b = 0, c = 0, d = 0] = group.split('.').map(Number);
      return [(a << 8) | b, (c << 8) | d];
    });
  const leading = parse(halves[0] ?? '');
  if (halves.length === 1) return leading.length === 8 ? leading : null;
  const trailing = parse(halves[1] ?? '');
  const zeros = 8 - leading.length - trailing.length;
  return zeros < 0 ? null : [...leading, ...Array<number>(zeros).fill(0), ...trailing];
}

/**
 * The form of a client address used for rate limiting. One IPv6 /64 counts as
 * one client, because a single subscriber usually controls the whole prefix,
 * and the result is the same however the address is written. Anything
 * unrecognised becomes one shared "unknown" client.
 */
export function normaliseAddress(address: string): string {
  if (isIPv4(address)) return address;
  // A link-local address may carry a zone ("fe80::1%eth0"); the zone is not part of the address.
  const bare = address.split('%')[0] ?? '';
  if (!isIPv6(bare)) return 'unknown';
  const groups = expand(bare);
  if (!groups) return 'unknown';
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    // IPv4-mapped: the client is really an IPv4 address.
    return `${g6 >> 8}.${g6 & 255}.${g7 >> 8}.${g7 & 255}`;
  }
  return `${[g0, g1, g2, g3].map((group) => group.toString(16)).join(':')}::/64`;
}

/**
 * The /48 an IPv6 address belongs to: the block a provider commonly routes to
 * one customer, who can then use any of its 65,536 /64s. Null for anything
 * that is not plain IPv6.
 */
export function widerNetwork(address: string): string | null {
  const bare = address.split('%')[0] ?? '';
  if (!isIPv6(bare)) return null;
  const groups = expand(bare);
  if (!groups) return null;
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0] = groups;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) return null;
  return `${[g0, g1, g2].map((group) => group.toString(16)).join(':')}::/48`;
}
