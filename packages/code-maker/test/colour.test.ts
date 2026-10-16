import { describe, expect, it } from 'vitest';
import {
  CONTRAST_FLOOR,
  CONTRAST_WARNING,
  contrast,
  invert,
  parseColour,
  refuse,
  weakestPair,
} from '../src/index.ts';

describe('parseColour', () => {
  it('accepts loosely typed hex and transparent, in one canonical form', () => {
    for (const typed of ['#FFF', 'fff', 'FFFFFF', '#ffffff', ' #fff '])
      expect(parseColour(typed), typed).toEqual({ ok: true, value: '#ffffff' });
    expect(parseColour('0E6F8C')).toEqual({ ok: true, value: '#0e6f8c' });
    expect(parseColour('Transparent')).toEqual({ ok: true, value: 'transparent' });
  });

  it('refuses anything else rather than falling back to black', () => {
    for (const typed of ['#ggg', 'red', '#12345', '', '#1234567', 'rgb(0,0,0)'])
      expect(parseColour(typed), typed).toEqual(refuse('bad-colour'));
  });
});

describe('contrast', () => {
  it('matches WCAG 2.2 reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBe(21);
    expect(contrast('#ffffff', '#000000')).toBe(21);
    expect(contrast('#777777', '#ffffff')).toBe(4.48);
    expect(contrast('#767676', '#ffffff')).toBe(4.54);
    expect(contrast('#0e6f8c', 'transparent')).toBe(contrast('#0e6f8c', '#ffffff'));
  });

  it('warns at the AA figure for text and refuses at a lower floor', () => {
    expect(CONTRAST_WARNING).toBe(4.5);
    expect(CONTRAST_FLOOR).toBe(2);
  });
});

describe('invert', () => {
  it('swaps foreground and background and keeps everything else', () => {
    expect(invert({ foreground: '#111111', background: '#ffffff', corners: '#0e6f8c' })).toEqual({
      foreground: '#ffffff',
      background: '#111111',
      corners: '#0e6f8c',
    });
  });
});

describe('weakestPair', () => {
  it('finds the lowest-contrast colour any paint holds, including the middle of a gradient', () => {
    const pair = weakestPair(
      [
        { type: 'solid', colour: '#000000' },
        { type: 'linear', from: '#000000', to: '#999999', angle: 0 },
      ],
      '#ffffff',
    );
    expect(pair.foreground).toBe('#999999');
    expect(pair.ratio).toBe(contrast('#999999', '#ffffff'));
  });
});
