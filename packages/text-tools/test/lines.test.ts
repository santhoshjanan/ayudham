import { describe, expect, it } from 'vitest';
import { LINE_DEFAULTS, lines, refuse, type LineOptions } from '../src/index.ts';
import { feed, seeded } from './helpers.ts';

const NONE: LineOptions = { ...LINE_DEFAULTS, trim: false };

const run = (text: string, options: Partial<LineOptions>, random = seeded()): string => {
  const made = lines(text, { ...NONE, ...options }, random);
  if (!made.ok) throw new Error(made.problem);
  return made.value;
};

describe('lines', () => {
  it('changes nothing with every step off, apart from line endings', () => {
    expect(run(' b \r\na\r\n', {})).toBe(' b \na');
  });

  it('trims by default', () => {
    expect(LINE_DEFAULTS.trim).toBe(true);
    expect(run('  a  \n\tb\t', { trim: true })).toBe('a\nb');
  });

  it('removes blank lines, counting a line of spaces as blank', () => {
    expect(run('a\n\n   \nb', { blanks: true })).toBe('a\nb');
  });

  it('removes repeats, keeping the first of each', () => {
    expect(run('b\na\nb\nA\na', { unique: true })).toBe('b\na\nA');
    expect(run('b\na\nb\nA\na', { unique: true, ignoreCase: true })).toBe('b\na');
  });

  it('sorts by code point, either way', () => {
    expect(run('b\nB\na\n10\n9', { order: 'az' })).toBe('10\n9\nB\na\nb');
    expect(run('b\nB\na\n10\n9', { order: 'za' })).toBe('b\na\nB\n9\n10');
  });

  it('sorts without regard to case when asked, capitals first among equals', () => {
    expect(run('b\nB\na\nA', { order: 'az', ignoreCase: true })).toBe('A\na\nB\nb');
  });

  it('puts characters beyond the basic plane after those within it', () => {
    expect(run('😀\nＡ\nz', { order: 'az' })).toBe('z\nＡ\n😀');
  });

  it('reverses', () => {
    expect(run('a\nb\nc', { order: 'reverse' })).toBe('c\nb\na');
  });

  it('shuffles with the source it is given', () => {
    expect(run('a\nb\nc', { order: 'shuffle' }, feed([0, 1]))).toBe('c\nb\na');
  });

  it('numbers last, after every other step', () => {
    expect(run('b\n\na\nb', { blanks: true, unique: true, order: 'az', number: true })).toBe(
      '1. a\n2. b',
    );
  });

  it('does not sort a phantom blank line to the top', () => {
    expect(run('b\na\n', { order: 'az' })).toBe('a\nb');
    expect(run('b\r\na\r\n', { order: 'az', number: true })).toBe('1. a\n2. b');
  });

  it('gives nothing for nothing', () => {
    expect(run('', { number: true })).toBe('');
  });

  it('refuses an unknown order, text over the limit, and a failed source', () => {
    expect(lines('a', { ...NONE, order: 'random' as 'az' }, seeded())).toEqual(
      refuse('out-of-range'),
    );
    expect(lines('x'.repeat(100_001), NONE, seeded())).toEqual(refuse('too-long'));
    expect(lines('a\nb\nc', { ...NONE, order: 'shuffle' }, feed([0xff]))).toEqual(
      refuse('no-random'),
    );
  });
});
