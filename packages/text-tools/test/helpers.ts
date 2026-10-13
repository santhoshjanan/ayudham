import type { RandomSource } from '../src/index.ts';

/** Hands out the given bytes in order, starting again when they run out. */
export function feed(values: number[]): RandomSource {
  let at = 0;
  return (count) => {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i++) out[i] = values[at++ % values.length]!;
    return out;
  };
}

/** A repeatable stream of well-mixed bytes (xorshift32). For tests only. */
export function seeded(seed = 0x9e3779b9): RandomSource {
  let state = seed >>> 0 || 1;
  return (count) => {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      state = (state ^ (state << 13)) >>> 0;
      state = (state ^ (state >>> 17)) >>> 0;
      state = (state ^ (state << 5)) >>> 0;
      out[i] = state & 0xff;
    }
    return out;
  };
}

export const ALL_BYTES = Array.from({ length: 256 }, (_, i) => i);
