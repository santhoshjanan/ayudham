import { describe, expect, it } from 'vitest';
import { checkText, LIMITS, listLines, splitLines } from '../src/index.ts';

describe('checkText', () => {
  it('accepts text up to the limit and refuses more', () => {
    expect(checkText('x'.repeat(LIMITS.text))).toEqual({
      ok: true,
      value: 'x'.repeat(LIMITS.text),
    });
    expect(checkText('x'.repeat(LIMITS.text + 1))).toEqual({ ok: false, problem: 'too-long' });
  });

  it('refuses anything that is not text', () => {
    for (const bad of [undefined, null, 3, {}, ['a']]) {
      expect(checkText(bad)).toEqual({ ok: false, problem: 'too-long' });
    }
  });
});

describe('lines', () => {
  it('splits at every kind of line ending', () => {
    expect(splitLines('a\r\nb\nc\rd')).toEqual(['a', 'b', 'c', 'd']);
    expect(splitLines('')).toEqual(['']);
  });

  it('does not count an empty line after a final line break', () => {
    expect(listLines('')).toEqual([]);
    expect(listLines('a')).toEqual(['a']);
    expect(listLines('a\n')).toEqual(['a']);
    expect(listLines('a\r\nb\r\n')).toEqual(['a', 'b']);
    expect(listLines('a\n\n')).toEqual(['a', '']);
  });
});
