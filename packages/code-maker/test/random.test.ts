import { describe, expect, it } from 'vitest';
import { refuse } from '../src/index.ts';
import { below, guard } from '../src/random.ts';
import { fixedRandom } from './helpers.ts';

const ALL_BYTES = Array.from({ length: 256 }, (_, index) => index);

describe('below', () => {
  it('draws again instead of taking a remainder', () => {
    expect(below(6, fixedRandom([7, 6, 5]))).toBe(5);
  });

  it('gives every outcome equally often over every byte value', () => {
    const random = fixedRandom(ALL_BYTES);
    const seen = [0, 0, 0, 0, 0, 0];
    for (let draw = 0; draw < 192; draw++) seen[below(6, random)]!++;
    expect(seen).toEqual([32, 32, 32, 32, 32, 32]);
  });

  it('gives up on a source that never yields a usable value, and guard refuses', () => {
    expect(guard(() => below(6, fixedRandom([7])))).toEqual(refuse('no-random'));
  });
});
