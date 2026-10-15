import { LIMITS } from './limits.ts';
import { below, guard, shuffled, type RandomSource } from './random.ts';
import { refuse, whole, type Result } from './result.ts';
import { checkText, listLines } from './text.ts';

export type Roll = { rolls: number[]; total: number };

export function dice(count: number, sides: number, random: RandomSource): Result<Roll> {
  if (!whole(count, 1, LIMITS.results) || !whole(sides, LIMITS.sidesMin, LIMITS.sidesMax)) {
    return refuse('out-of-range');
  }
  return guard(() => {
    const rolls = Array.from({ length: count }, () => 1 + below(sides, random));
    return { rolls, total: rolls.reduce((sum, roll) => sum + roll, 0) };
  });
}

export type Face = 'heads' | 'tails';

export function coins(count: number, random: RandomSource): Result<Face[]> {
  if (!whole(count, 1, LIMITS.results)) return refuse('out-of-range');
  return guard(() =>
    Array.from({ length: count }, (): Face => (below(2, random) === 0 ? 'heads' : 'tails')),
  );
}

/**
 * `count` lines of the typed list, no line picked twice. Asking for more than the list holds
 * gives the whole list in a random order. Blank lines are not entries.
 */
export function pick(text: unknown, count: number, random: RandomSource): Result<string[]> {
  const checked = checkText(text);
  if (!checked.ok) return checked;
  if (!whole(count, 1, LIMITS.results)) return refuse('out-of-range');
  const entries = listLines(checked.value)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (entries.length === 0) return refuse('empty-list');
  return guard(() => shuffled(entries, random).slice(0, count));
}
