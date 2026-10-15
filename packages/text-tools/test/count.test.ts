import { describe, expect, it } from 'vitest';
import { count, refuse } from '../src/index.ts';

const of = (text: string) => {
  const made = count(text);
  if (!made.ok) throw new Error(made.problem);
  return made.value;
};

describe('count', () => {
  it('counts nothing in nothing', () => {
    expect(of('')).toEqual({ characters: 0, solid: 0, words: 0, lines: 0, bytes: 0 });
  });

  it('counts characters, words, lines and bytes', () => {
    expect(of('Hello, wide world')).toEqual({
      characters: 17,
      solid: 15,
      words: 3,
      lines: 1,
      bytes: 17,
    });
  });

  it('counts a character as a reader sees it', () => {
    expect(of('👨‍👩‍👧')).toMatchObject({ characters: 1, bytes: 18 });
    expect(of('é')).toMatchObject({ characters: 1, bytes: 3 });
    expect(of('🇮🇳')).toMatchObject({ characters: 1, bytes: 8 });
    expect(of('é€')).toMatchObject({ characters: 2, bytes: 5 });
  });

  it('counts lines without a phantom last one', () => {
    expect(of('a\nb').lines).toBe(2);
    expect(of('a\nb\n').lines).toBe(2);
    expect(of('a\r\nb\r\n').lines).toBe(2);
    expect(of('a\n\nb').lines).toBe(3);
    expect(of('\n').lines).toBe(1);
  });

  it('counts a Windows line ending as one character', () => {
    expect(of('a\r\nb')).toMatchObject({ characters: 3, solid: 2, words: 2 });
  });

  it('refuses text over the limit', () => {
    expect(count('x'.repeat(100_001))).toEqual(refuse('too-long'));
  });
});

describe('in a browser that cannot split text into graphemes', () => {
  it('the package still loads, and characters are counted as code points', async () => {
    const { vi } = await import('vitest');
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    vi.resetModules();
    try {
      const fresh = await import('../src/index.ts');
      expect(fresh.count('é€ 😀')).toEqual({
        ok: true,
        value: { characters: 4, solid: 3, words: 2, lines: 1, bytes: 10 },
      });
      expect(fresh.count('é')).toMatchObject({ ok: true, value: { characters: 2 } });
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
