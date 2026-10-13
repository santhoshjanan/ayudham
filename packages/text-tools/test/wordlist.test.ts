import { describe, expect, it } from 'vitest';
import { readWordList, refuse, WORD_COUNT } from '../src/index.ts';

/** A list in the published shape: a dice number, a tab, a word. */
function listText(change: (lines: string[]) => void = () => {}): string {
  const lines = Array.from({ length: WORD_COUNT }, (_, i) => {
    const dice = [...i.toString(6).padStart(5, '0')].map((digit) => Number(digit) + 1).join('');
    const word = [...i.toString(26).padStart(3, '0')]
      .map((digit) => String.fromCharCode(97 + parseInt(digit, 26)))
      .join('');
    return `${dice}\t${word}`;
  });
  change(lines);
  return lines.join('\n') + '\n';
}

describe('readWordList', () => {
  it('reads a list in the published shape', () => {
    const read = readWordList(listText());
    if (!read.ok) throw new Error(read.problem);
    expect(read.value).toHaveLength(WORD_COUNT);
    expect(read.value[0]).toBe('aaa');
    expect(read.value[1]).toBe('aab');
  });

  it('accepts hyphenated words and a missing final line break', () => {
    const text = listText((lines) => (lines[5] = '11116\tdrop-down'));
    expect(readWordList(text).ok).toBe(true);
    expect(readWordList(text.trimEnd()).ok).toBe(true);
  });

  it('refuses a list that is short, long or repeats a word', () => {
    expect(readWordList(listText((lines) => lines.pop()))).toEqual(refuse('bad-word-list'));
    expect(readWordList(listText((lines) => lines.push('11111\textra')))).toEqual(
      refuse('bad-word-list'),
    );
    expect(readWordList(listText((lines) => (lines[1] = lines[0]!)))).toEqual(
      refuse('bad-word-list'),
    );
  });

  it('refuses a list changed in transit', () => {
    expect(readWordList(listText().replaceAll('\n', '\r\n'))).toEqual(refuse('bad-word-list'));
    expect(readWordList('﻿' + listText())).toEqual(refuse('bad-word-list'));
    expect(readWordList(listText() + '\n')).toEqual(refuse('bad-word-list'));
  });

  it('refuses a misshapen line', () => {
    for (const line of [
      '11111 abacus',
      'abacus',
      '11111\tAbacus',
      '11117\tabacus',
      '11111\ta b',
      '',
    ]) {
      expect(readWordList(listText((lines) => (lines[9] = line))), line).toEqual(
        refuse('bad-word-list'),
      );
    }
  });

  it('refuses anything that is not text', () => {
    for (const bad of [undefined, null, 5, ['a']]) {
      expect(readWordList(bad)).toEqual(refuse('bad-word-list'));
    }
  });
});
