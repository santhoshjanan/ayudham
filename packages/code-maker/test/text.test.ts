import { describe, expect, it } from 'vitest';
import { prepareText, readEscapes, refuse, type TextOptions } from '../src/index.ts';
import { decodeGrid, loadBwip } from './helpers.ts';

const PLAIN: TextOptions = { escapes: false, trim: false, newline: 'lf', eci: false };
const MARKED: TextOptions = { ...PLAIN, eci: true };

describe('readEscapes', () => {
  it('reads every escape it knows', () => {
    expect(readEscapes('a\\nb\\t\\\\\\x41\\u{1F600}\\r')).toEqual({
      ok: true,
      value: 'a\nb\t\\A😀\r',
    });
  });

  it('refuses one it does not know, or one that is malformed', () => {
    for (const bad of [
      '\\q',
      '\\x4',
      '\\xZZ',
      '\\u{110000}',
      '\\u{D800}',
      '\\u{}',
      '\\u1234',
      'end\\',
    ]) {
      expect(readEscapes(bad), bad).toEqual(refuse('bad-escape'));
    }
  });
});

describe('prepareText', () => {
  it('marks non-ASCII text as UTF-8 when asked', () => {
    expect(prepareText('Grüße', MARKED, 'eci')).toEqual({
      ok: true,
      value: {
        text: '^ECI000026GrÃ¼Ã\u009fe',
        bwip: { parsefnc: true, binarytext: true },
        warnings: [],
      },
    });
  });

  it('doubles a caret inside the marked form, so it is read as a caret and not a command', async () => {
    const made = prepareText('ü^x', MARKED, 'eci');
    expect(made.ok && made.value.text).toBe('^ECI000026\u00c3\u00bc^^x');
    const bwip = await loadBwip();
    for (const text of ['é^x', 'ü^^x', '^_^ café']) {
      const prepared = prepareText(text, MARKED, 'eci');
      if (!prepared.ok) throw new Error(prepared.problem);
      const [grid] = bwip.raw(
        'qrcode',
        prepared.value.text,
        prepared.value.bwip,
      ) as unknown as Array<{ pixs: number[]; pixx: number; pixy: number }>;
      const read = await decodeGrid(Uint8Array.from(grid!.pixs), grid!.pixx, grid!.pixy);
      expect(read?.text, text).toBe(text);
      expect(read?.hasECI, text).toBe(true);
    }
  });

  it('names the first character a symbology cannot carry, and where it is', () => {
    expect(prepareText('café', PLAIN, 'ascii')).toEqual({
      ok: false,
      problem: 'bad-character',
      detail: { at: 3, character: 'é' },
    });
    expect(prepareText('12a4', PLAIN, 'digits')).toEqual({
      ok: false,
      problem: 'bad-character',
      detail: { at: 2, character: 'a' },
    });
    expect(prepareText('1😀', PLAIN, 'digits')).toEqual({
      ok: false,
      problem: 'bad-character',
      detail: { at: 1, character: '😀' },
    });
  });

  it('leaves text plain when the marker is off, or when the text is ASCII', () => {
    expect(prepareText('Grüße', PLAIN, 'eci')).toEqual({
      ok: true,
      value: { text: 'Grüße', bwip: {}, warnings: [] },
    });
    expect(prepareText('a^b', MARKED, 'eci')).toEqual({
      ok: true,
      value: { text: 'a^b', bwip: {}, warnings: [] },
    });
  });

  it('writes plain UTF-8 with a warning where no marker is possible', () => {
    expect(prepareText('Grüße', MARKED, 'utf8')).toEqual({
      ok: true,
      value: { text: 'Grüße', bwip: {}, warnings: ['no-eci'] },
    });
    expect(prepareText('hello', MARKED, 'utf8')).toEqual({
      ok: true,
      value: { text: 'hello', bwip: {}, warnings: [] },
    });
  });

  it('refuses characters a symbology cannot carry', () => {
    expect(prepareText('café', PLAIN, 'ascii')).toMatchObject(refuse('bad-character'));
    expect(prepareText('12a', PLAIN, 'digits')).toMatchObject(refuse('bad-character'));
    expect(prepareText('0123', PLAIN, 'digits').ok).toBe(true);
    expect(prepareText('5901234123457 12345', PLAIN, 'digits')).toMatchObject(
      refuse('bad-character'),
    );
  });

  it('applies escapes, then line endings, then trimming', () => {
    const made = prepareText(
      '  one\\ntwo\r\nthree\n  ',
      { ...PLAIN, escapes: true, trim: true, newline: 'crlf' },
      'eci',
    );
    expect(made.ok && made.value.text).toBe('one\r\ntwo\r\nthree');
    expect(prepareText('bad \\q', { ...PLAIN, escapes: true }, 'eci')).toEqual(
      refuse('bad-escape'),
    );
  });

  it('turns every line ending into LF by default', () => {
    const made = prepareText('a\r\nb\rc', PLAIN, 'eci');
    expect(made.ok && made.value.text).toBe('a\nb\nc');
  });

  it('handles text at the length limit without overflowing', () => {
    const made = prepareText('é'.repeat(7089), MARKED, 'eci');
    expect(made.ok && made.value.text.length).toBe(10 + 7089 * 2);
  });
});

describe('prepared text decodes as it was typed', () => {
  const SAMPLE = 'Grüße 😀 €';
  const cases: Array<[string, Record<string, string>]> = [
    ['qrcode', {}],
    ['rectangularmicroqrcode', { version: 'R17x139' }],
    ['datamatrix', {}],
    ['azteccode', {}],
    ['pdf417', {}],
  ];

  for (const [bcid, extra] of cases) {
    it(`${bcid}, with and without the marker`, async () => {
      const bwip = await loadBwip();
      for (const eci of [true, false]) {
        const made = prepareText(SAMPLE, { ...PLAIN, eci }, 'eci');
        if (!made.ok) throw new Error(made.problem);
        const [grid] = bwip.raw(bcid, made.value.text, { ...extra, ...made.value.bwip }) as Array<{
          pixs: number[];
          pixx: number;
          pixy: number;
        }>;
        const read = await decodeGrid(Uint8Array.from(grid!.pixs), grid!.pixx, grid!.pixy);
        expect(read?.text, `${bcid} eci ${eci}`).toBe(SAMPLE);
        expect(read?.hasECI, `${bcid} eci ${eci}`).toBe(eci);
      }
    });
  }
});
