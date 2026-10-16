import { LIMITS } from './limits.ts';
import { ok, refuse, type Result } from './result.ts';

/** Must return `count` fresh random bytes. The page passes the browser's own source. */
export type RandomSource = (count: number) => Uint8Array;

/** The source threw, miscounted, or never produced a usable value. */
export class RandomFailure extends Error {}

function bytes(count: number, random: RandomSource): Uint8Array {
  let drawn: unknown;
  try {
    drawn = random(count);
  } catch {
    throw new RandomFailure();
  }
  if (!(drawn instanceof Uint8Array) || drawn.length !== count) throw new RandomFailure();
  return drawn;
}

/** A whole number from 0 to n - 1, each equally likely: draws again rather than take a remainder. */
export function below(n: number, random: RandomSource): number {
  if (!Number.isSafeInteger(n) || n < 1) throw new RandomFailure();
  if (n === 1) return 0;
  let bits = 0;
  for (let rest = n - 1; rest > 0; rest = Math.floor(rest / 2)) bits++;
  const size = Math.ceil(bits / 8);
  const mask = 0xff >> (size * 8 - bits);
  for (let attempt = 0; attempt < LIMITS.redraws; attempt++) {
    const drawn = bytes(size, random);
    let value = drawn[0]! & mask;
    for (let index = 1; index < size; index++) value = value * 256 + drawn[index]!;
    if (value < n) return value;
  }
  throw new RandomFailure();
}

/** Runs something random, answering a failed source with a refusal. */
export function guard<T>(make: () => T): Result<T> {
  try {
    return ok(make());
  } catch (error) {
    if (error instanceof RandomFailure) return refuse('no-random');
    throw error;
  }
}
