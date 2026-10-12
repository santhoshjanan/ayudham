import { isIPv4, isIPv6 } from 'node:net';
import { NAME_MAX, NAME_MIN, PASSCODE_MAX, PASSCODE_MIN } from '@pokerji/protocol';
import { z } from 'zod';

/** One line of text: no control characters, direction overrides or unpaired surrogates. */
const ONE_LINE = /^[^\p{Cc}\p{Cs}‪-‮⁦-⁩]*$/u;

export const nameSchema = z.string().trim().min(NAME_MIN).max(NAME_MAX).regex(ONE_LINE);

export const roomCodeSchema = z.string().regex(/^[A-Za-z0-9]{12}$/);

export const deckIdSchema = z.enum(['fibonacci', 'modifiedFibonacci', 'tshirt', 'powersOfTwo']);

export const passcodeSchema = z.string().min(PASSCODE_MIN).max(PASSCODE_MAX);

function prefix64(bare: string): string {
  const [head = '', tail = ''] = bare.split('::');
  const leading = head === '' ? [] : head.split(':');
  const trailing = tail === '' ? [] : tail.split(':');
  const groups = bare.includes('::')
    ? [...leading, ...Array<string>(Math.max(0, 8 - leading.length - trailing.length)).fill('0')]
    : leading;
  return `${groups
    .slice(0, 4)
    .map((group) => Number.parseInt(group, 16).toString(16))
    .join(':')}::/64`;
}

/**
 * The form of a client address used for rate limiting. One IPv6 /64 counts as
 * one client, because a single subscriber usually controls the whole prefix.
 * Anything unrecognised becomes one shared "unknown" client.
 */
export function normaliseAddress(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped !== undefined && isIPv4(mapped)) return mapped;
  if (isIPv4(address)) return address;
  // A link-local address may carry a zone ("fe80::1%eth0"); the zone is not part of the address.
  const bare = address.split('%')[0] ?? '';
  if (isIPv6(bare)) return prefix64(bare);
  return 'unknown';
}
