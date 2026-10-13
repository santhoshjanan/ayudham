import { describe, expect, it } from 'vitest';
import { decodeEntities, encodeEntities, ENTITIES } from '../src/index.ts';

describe('the entity table', () => {
  it('holds the 252 names of HTML 4 and apos', () => {
    expect(ENTITIES.size).toBe(253);
  });

  it('maps names to the right characters', () => {
    const checks: Array<[string, string]> = [
      ['nbsp', ' '],
      ['copy', '©'],
      ['frac12', '½'],
      ['Agrave', 'À'],
      ['times', '×'],
      ['szlig', 'ß'],
      ['divide', '÷'],
      ['yuml', 'ÿ'],
      ['OElig', 'Œ'],
      ['Yuml', 'Ÿ'],
      ['fnof', 'ƒ'],
      ['Alpha', 'Α'],
      ['Rho', 'Ρ'],
      ['Sigma', 'Σ'],
      ['Omega', 'Ω'],
      ['alpha', 'α'],
      ['sigmaf', 'ς'],
      ['omega', 'ω'],
      ['piv', 'ϖ'],
      ['ndash', '–'],
      ['mdash', '—'],
      ['hellip', '…'],
      ['euro', '€'],
      ['trade', '™'],
      ['larr', '←'],
      ['hArr', '⇔'],
      ['ne', '≠'],
      ['le', '≤'],
      ['infin', '∞'],
      ['hearts', '♥'],
      ['diams', '♦'],
      ['apos', "'"],
    ];
    for (const [name, char] of checks) {
      expect(String.fromCodePoint(ENTITIES.get(name)!), name).toBe(char);
    }
  });

  it('gives each name its own character, apart from none', () => {
    expect(new Set(ENTITIES.values()).size).toBe(253);
  });
});

describe('encodeEntities', () => {
  it('escapes the five characters that matter in HTML', () => {
    expect(encodeEntities(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
    expect(encodeEntities('café ©')).toBe('café ©');
  });
});

describe('decodeEntities', () => {
  it('reads names, decimal numbers and hex numbers', () => {
    expect(decodeEntities('&lt;p&gt; &amp; &eacute; &#233; &#xE9; &#Xe9; &euro; &apos;')).toBe(
      "<p> & é é é é € '",
    );
    expect(decodeEntities('&#128512;')).toBe('😀');
  });

  it('is exact about case', () => {
    expect(decodeEntities('&Eacute; &eacute; &EACUTE;')).toBe('É é &EACUTE;');
  });

  it('leaves alone what it does not know or cannot be a character', () => {
    for (const typed of [
      '&nosuch;',
      '&#xD800;',
      '&#0;',
      '&#1114112;',
      '&#99999999999;',
      '&amp',
      '& ;',
      '&#;',
      '&#x;',
    ]) {
      expect(decodeEntities(typed), typed).toBe(typed);
    }
  });

  it('decodes once, not again', () => {
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
  });

  it('undoes encodeEntities', () => {
    const text = `<a href="x">Tom & 'Jerry'</a> &amp; ©`;
    expect(decodeEntities(encodeEntities(text))).toBe(text);
  });
});
