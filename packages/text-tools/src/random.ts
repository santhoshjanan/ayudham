import { LIMITS } from './limits.ts';
import { ok, refuse, whole, type Result } from './result.ts';

/** Must return `count` fresh random bytes. The page passes the browser's own source. */
export type RandomSource = (count: number) => Uint8Array;

/** The source threw, miscounted, or never produced a usable value. */
export class RandomFailure extends Error {}

export function bytes(count: number, random: RandomSource): Uint8Array {
  let drawn: unknown;
  try {
    drawn = random(count);
  } catch {
    throw new RandomFailure();
  }
  if (!(drawn instanceof Uint8Array) || drawn.length !== count) throw new RandomFailure();
  return drawn;
}

/**
 * A whole number from 0 to n - 1, each equally likely. Draws just enough bits, and draws again
 * when the value is n or more, so no outcome is favoured. At least half of all draws are kept.
 */
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
    // Multiplying, not shifting: a bound can need up to 53 bits.
    for (let i = 1; i < size; i++) value = value * 256 + drawn[i]!;
    if (value < n) return value;
  }
  throw new RandomFailure();
}

export function pickFrom(
  alphabet: readonly string[],
  length: number,
  random: RandomSource,
): string {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[below(alphabet.length, random)]!;
  return out;
}

/** A new array in a random order (Fisher-Yates). */
export function shuffled<T>(items: readonly T[], random: RandomSource): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = below(i + 1, random);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Runs a generator, answering a failed source with a refusal. */
export function guard<T>(make: () => T): Result<T> {
  try {
    return ok(make());
  } catch (error) {
    if (error instanceof RandomFailure) return refuse('no-random');
    throw error;
  }
}

/** Several results, each made independently. */
export function many<T>(count: unknown, one: () => Result<T>): Result<T[]> {
  if (!whole(count, 1, LIMITS.results)) return refuse('out-of-range');
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const made = one();
    if (!made.ok) return made;
    out.push(made.value);
  }
  return ok(out);
}
