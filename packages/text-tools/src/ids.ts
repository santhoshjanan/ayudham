import { CROCKFORD, URL_SAFE } from './alphabets.ts';
import { toHex } from './bytes.ts';
import { bytes, guard, pickFrom, type RandomSource } from './random.ts';
import { refuse, whole, type Result } from './result.ts';

export const ID_KINDS = ['uuid4', 'uuid7', 'ulid', 'short'] as const;
export type IdKind = (typeof ID_KINDS)[number];

/** The kinds whose value contains the time it was made. The page says so beside them. */
export const TIMED_IDS: readonly IdKind[] = ['uuid7', 'ulid'];

const TIME_MAX = 2 ** 48 - 1;

function dashed(data: Uint8Array): string {
  const hex = toHex(data);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

/** RFC 9562 version 4: 122 random bits. */
function uuid4(random: RandomSource): string {
  const data = Uint8Array.from(bytes(16, random));
  data[6] = 0x40 | (data[6]! & 0x0f);
  data[8] = 0x80 | (data[8]! & 0x3f);
  return dashed(data);
}

/** RFC 9562 version 7: 48 bits of time in milliseconds, then 74 random bits. */
function uuid7(now: number, random: RandomSource): string {
  const drawn = bytes(10, random);
  const data = new Uint8Array(16);
  for (let i = 0; i < 6; i++) data[i] = Math.floor(now / 2 ** (8 * (5 - i))) % 256;
  data.set(drawn, 6);
  data[6] = 0x70 | (drawn[0]! & 0x0f);
  data[8] = 0x80 | (drawn[2]! & 0x3f);
  return dashed(data);
}

/** 48 bits of time and 80 random bits, in Crockford's Base32. */
function ulid(now: number, random: RandomSource): string {
  let out = '';
  for (let i = 9; i >= 0; i--) out += CROCKFORD[Math.floor(now / 32 ** i) % 32]!;
  let buffer = 0;
  let held = 0;
  for (const byte of bytes(10, random)) {
    buffer = (buffer << 8) | byte;
    held += 8;
    while (held >= 5) {
      held -= 5;
      out += CROCKFORD[(buffer >> held) & 31]!;
    }
    buffer &= (1 << held) - 1;
  }
  return out;
}

/** `now` is milliseconds since 1970; only the timed kinds read it. */
export function identifier(kind: IdKind, now: number, random: RandomSource): Result<string> {
  if (!ID_KINDS.includes(kind)) return refuse('out-of-range');
  if (TIMED_IDS.includes(kind) && !whole(now, 0, TIME_MAX)) return refuse('out-of-range');
  return guard(() => {
    if (kind === 'uuid4') return uuid4(random);
    if (kind === 'uuid7') return uuid7(now, random);
    if (kind === 'ulid') return ulid(now, random);
    return pickFrom([...URL_SAFE], 21, random);
  });
}
