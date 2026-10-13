import { describe, expect, it } from 'vitest';
import { coins, dice, pick, refuse } from '../src/index.ts';
import { feed, seeded } from './helpers.ts';

describe('dice', () => {
  it('rolls each die from 1 to its sides and adds them up', () => {
    expect(dice(3, 6, feed([0, 5, 2]))).toEqual({
      ok: true,
      value: { rolls: [1, 6, 3], total: 10 },
    });
  });

  it('stays inside the sides', () => {
    const made = dice(100, 1_000, seeded());
    if (!made.ok) throw new Error(made.problem);
    expect(made.value.rolls).toHaveLength(100);
    expect(made.value.rolls.every((roll) => roll >= 1 && roll <= 1_000)).toBe(true);
  });

  it('refuses a count or sides outside the limits', () => {
    expect(dice(0, 6, seeded())).toEqual(refuse('out-of-range'));
    expect(dice(101, 6, seeded())).toEqual(refuse('out-of-range'));
    expect(dice(1, 1, seeded())).toEqual(refuse('out-of-range'));
    expect(dice(1, 1_001, seeded())).toEqual(refuse('out-of-range'));
    expect(dice(1, 6.5, seeded())).toEqual(refuse('out-of-range'));
  });
});

describe('coins', () => {
  it('flips each coin', () => {
    expect(coins(3, feed([0, 1, 1]))).toEqual({ ok: true, value: ['heads', 'tails', 'tails'] });
    expect(coins(0, seeded())).toEqual(refuse('out-of-range'));
  });
});

describe('pick', () => {
  it('picks lines without picking one twice', () => {
    const random = seeded();
    for (let i = 0; i < 50; i++) {
      const made = pick('ann\nbo\ncy\ndi', 3, random);
      if (!made.ok) throw new Error(made.problem);
      expect(made.value).toHaveLength(3);
      expect(new Set(made.value).size).toBe(3);
      expect(made.value.every((name) => ['ann', 'bo', 'cy', 'di'].includes(name))).toBe(true);
    }
  });

  it('gives the whole list, shuffled, when asked for more than it holds', () => {
    const made = pick('ann\nbo\ncy', 10, seeded());
    expect(made.ok && [...made.value].sort()).toEqual(['ann', 'bo', 'cy']);
  });

  it('ignores blank lines, line endings and space around a line', () => {
    const made = pick('  ann  \r\n\r\nbo\r\n\n', 5, seeded());
    expect(made.ok && [...made.value].sort()).toEqual(['ann', 'bo']);
  });

  it('keeps a line that appears twice as two chances', () => {
    const made = pick('ann\nann', 2, seeded());
    expect(made).toEqual({ ok: true, value: ['ann', 'ann'] });
  });

  it('refuses an empty list, a bad count and text over the limit', () => {
    expect(pick('', 1, seeded())).toEqual(refuse('empty-list'));
    expect(pick(' \n\t\n', 1, seeded())).toEqual(refuse('empty-list'));
    expect(pick('a\nb', 0, seeded())).toEqual(refuse('out-of-range'));
    expect(pick('a\n'.repeat(60_000), 1, seeded())).toEqual(refuse('too-long'));
  });
});
