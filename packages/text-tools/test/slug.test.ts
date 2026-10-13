import { describe, expect, it } from 'vitest';
import { refuse, slug } from '../src/index.ts';

const of = (text: string): string => {
  const made = slug(text);
  if (!made.ok) throw new Error(made.problem);
  return made.value;
};

describe('slug', () => {
  it('lowers, hyphenates and trims', () => {
    expect(of('  Hello, World!  ')).toBe('hello-world');
    expect(of('A  --  B__C')).toBe('a-b-c');
    expect(of('Version 2.0 (final)')).toBe('version-2-0-final');
  });

  it('strips accents', () => {
    expect(of('Crème Brûlée')).toBe('creme-brulee');
    expect(of('Łódź, İstanbul')).toBe('lodz-istanbul');
    expect(of('école')).toBe('ecole');
  });

  it('spells out letters that have no accent to strip', () => {
    expect(of('Straße Æther Œuvre Søren Đorđe Þór')).toBe('strasse-aether-oeuvre-soren-dorde-thor');
  });

  it('drops what has no Latin form, leaving an empty line', () => {
    expect(of('日本語')).toBe('');
    expect(of('!!!')).toBe('');
    expect(of('😀 party')).toBe('party');
  });

  it('converts each line on its own', () => {
    expect(of('First Post\r\nSecond Post\n')).toBe('first-post\nsecond-post\n');
  });

  it('refuses text over the limit', () => {
    expect(slug('x'.repeat(100_001))).toEqual(refuse('too-long'));
  });
});
