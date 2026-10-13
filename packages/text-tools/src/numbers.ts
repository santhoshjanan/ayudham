import { DIGITS } from './alphabets.ts';
import { LIMITS } from './limits.ts';
import { below, guard, pickFrom, type RandomSource } from './random.ts';
import { refuse, whole, type Result } from './result.ts';

/** Digits only. Leading zeros are kept, so the answer is text. */
export function pin(digits: number, random: RandomSource): Result<string> {
  if (!whole(digits, LIMITS.pinMin, LIMITS.pinMax)) return refuse('out-of-range');
  return guard(() => pickFrom([...DIGITS], digits, random));
}

/** A whole number between two bounds, both included, given in either order. */
export function numberBetween(first: number, second: number, random: RandomSource): Result<number> {
  if (!whole(first, -LIMITS.bound, LIMITS.bound) || !whole(second, -LIMITS.bound, LIMITS.bound)) {
    return refuse('out-of-range');
  }
  const low = Math.min(first, second);
  const high = Math.max(first, second);
  return guard(() => low + below(high - low + 1, random));
}
