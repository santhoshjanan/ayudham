import { describe, expect, it } from 'vitest';
import {
  bwipProblem,
  encode,
  explain,
  refuse,
  SYMBOLOGIES,
  type TextOptions,
} from '../src/index.ts';
import { decodeBars, decodeGrid, loadBwip } from './helpers.ts';

const PLAIN: TextOptions = { escapes: false, trim: false, newline: 'lf', eci: true };
const COLOURS = { foreground: '#000000', background: '#ffffff' };

/** A sample each symbology accepts, and the text the decoder gives back for it. */
const SAMPLES: Record<string, [string, string]> = {
  qr: ['Hello, world', 'Hello, world'],
  'micro-qr': ['HELLO 123', 'HELLO 123'],
  rmqr: ['HELLO 123', 'HELLO 123'],
  'data-matrix': ['Hello 123', 'Hello 123'],
  'data-matrix-rect': ['Hello', 'Hello'],
  aztec: ['Hello, world', 'Hello, world'],
  'aztec-compact': ['Hello', 'Hello'],
  'aztec-rune': ['42', '042'],
  pdf417: ['Hello, world', 'Hello, world'],
  'pdf417-compact': ['Hello', 'Hello'],
  'micro-pdf417': ['HELLO 123', 'HELLO 123'],
  'ean-13': ['590123412345', '5901234123457'],
  'ean-8': ['96385074', '96385074'],
  'upc-a': ['012345678905', '0012345678905'],
  'upc-e': ['01234565', '0012345000065'],
  isbn: ['978-1-56581-231-4', '9781565812314'],
  issn: ['0311-175X', '9770311175001'],
  'code-128': ['ABC-123', 'ABC-123'],
  'gs1-128': ['(01)09521234543213', '(01)09521234543213'],
  'code-39': ['CODE-39', 'CODE-39'],
  'code-39-ext': ['Code 39e', 'Code 39e'],
  'code-93': ['CODE 93', 'CODE 93'],
  itf: ['12345678', '12345678'],
  'itf-14': ['15400141288763', '15400141288763'],
  codabar: ['A40156B', 'A40156B'],
  'databar-omni': ['(01)24012345678905', '(01)24012345678905'],
  'databar-limited': ['(01)15012345678907', '(01)15012345678907'],
  'databar-expanded': ['(01)95012345678903(3103)000123', '(01)95012345678903(3103)000123'],
};

/** Symbologies the Node tests cannot decode, by name and reason. */
const NOT_HERE: Record<string, string> = {
  dotcode: 'no decoder reads DotCode',
  maxicode: 'hexagonal: decoded from its rendered drawing in the browser tests',
};

describe('every curated symbology encodes and decodes', () => {
  for (const symbology of SYMBOLOGIES) {
    if (symbology.id in NOT_HERE) continue;
    it(symbology.id, async () => {
      const bwip = await loadBwip();
      const [text, expected] = SAMPLES[symbology.id]!;
      const made = encode(bwip, {
        id: symbology.id,
        text,
        textOptions: PLAIN,
        options: {},
        colours: COLOURS,
      });
      if (!made.ok) throw new Error(made.problem);
      let read;
      if (made.value.grid) {
        read = await decodeGrid(
          made.value.grid.cells,
          made.value.grid.columns,
          made.value.grid.rows,
        );
      } else {
        // Drawn symbologies: decode bwip-js's own modules or bars for the same input.
        const [raw] = bwip.raw(
          symbology.bcid,
          text,
          symbology.id === 'code-93' ? { includecheck: true } : {},
        ) as unknown as Array<{
          sbs?: number[];
          pixs?: number[];
          pixx?: number;
          pixy?: number;
        }>;
        read = raw!.sbs
          ? await decodeBars(raw!.sbs)
          : await decodeGrid(Uint8Array.from(raw!.pixs!), raw!.pixx!, raw!.pixy!);
      }
      expect(read?.text).toBe(expected);
      expect(read?.format).toBe(symbology.decoder);
    });
  }

  it('skips only DotCode and MaxiCode, each for a stated reason', () => {
    expect(
      SYMBOLOGIES.filter((row) => !(row.id in SAMPLES))
        .map((row) => row.id)
        .sort(),
    ).toEqual(Object.keys(NOT_HERE).sort());
  });
});

describe('encode', () => {
  it('works out a missing check digit and refuses a wrong one or a letter', async () => {
    const bwip = await loadBwip();
    expect(
      encode(bwip, {
        id: 'ean-13',
        text: '5901234123458',
        textOptions: PLAIN,
        options: {},
        colours: COLOURS,
      }),
    ).toEqual(refuse('bad-check-digit'));
    expect(
      encode(bwip, {
        id: 'ean-13',
        text: '59012341234X',
        textOptions: PLAIN,
        options: {},
        colours: COLOURS,
      }),
    ).toEqual({ ok: false, problem: 'bad-character', detail: { at: 11, character: 'X' } });
  });

  it('refuses an EAN add-on: no test decoder can confirm one scans', async () => {
    const bwip = await loadBwip();
    expect(
      encode(bwip, {
        id: 'ean-13',
        text: '5901234123457 12345',
        textOptions: PLAIN,
        options: {},
        colours: COLOURS,
      }),
    ).toEqual({ ok: false, problem: 'bad-character', detail: { at: 13, character: ' ' } });
  });

  it('names the character a symbology cannot carry, before bwip-js sees it', async () => {
    const bwip = await loadBwip();
    const run = (id: string, text: string) =>
      encode(bwip, { id, text, textOptions: PLAIN, options: {}, colours: COLOURS });
    expect(run('code-39', 'ABé')).toEqual({
      ok: false,
      problem: 'bad-character',
      detail: { at: 2, character: 'é' },
    });
    expect(run('code-39', 'abc')).toEqual({
      ok: false,
      problem: 'bad-character',
      detail: { at: 0, character: 'a' },
    });
    expect(run('codabar', 'A40X56B')).toEqual({
      ok: false,
      problem: 'bad-character',
      detail: { at: 3, character: 'X' },
    });
    expect(run('isbn', '978-1-5658Z-231-4')).toEqual({
      ok: false,
      problem: 'bad-character',
      detail: { at: 10, character: 'Z' },
    });
    // The sentence itself stays fixed: the character goes to the page as detail, never into a message.
    expect(explain('bad-character')).not.toContain('é');
  });

  it('refuses text too long for QR, and empty text', async () => {
    const bwip = await loadBwip();
    expect(
      encode(bwip, {
        id: 'qr',
        text: 'x'.repeat(7089),
        textOptions: PLAIN,
        options: { eclevel: 'H' },
        colours: COLOURS,
      }),
    ).toEqual(refuse('too-long'));
    expect(
      encode(bwip, {
        id: 'qr',
        text: 'x'.repeat(7090),
        textOptions: PLAIN,
        options: {},
        colours: COLOURS,
      }),
    ).toEqual(refuse('too-long'));
    expect(
      encode(bwip, { id: 'qr', text: '', textOptions: PLAIN, options: {}, colours: COLOURS }),
    ).toEqual(refuse('empty'));
  });

  it('picks the smallest rMQR size that fits when none is given', async () => {
    const bwip = await loadBwip();
    const small = encode(bwip, {
      id: 'rmqr',
      text: 'HI',
      textOptions: PLAIN,
      options: {},
      colours: COLOURS,
    });
    const large = encode(bwip, {
      id: 'rmqr',
      text: 'HELLO WORLD 1234567890',
      textOptions: PLAIN,
      options: {},
      colours: COLOURS,
    });
    if (!small.ok || !large.ok) throw new Error('rMQR refused');
    expect(small.value.grid!.columns * small.value.grid!.rows).toBeLessThan(
      large.value.grid!.columns * large.value.grid!.rows,
    );
  });

  it('warns that Micro QR carries non-ASCII text without a marker', async () => {
    const bwip = await loadBwip();
    const made = encode(bwip, {
      id: 'micro-qr',
      text: 'Grüße',
      textOptions: PLAIN,
      options: {},
      colours: COLOURS,
    });
    expect(made.ok && made.value.warnings).toEqual(['no-eci']);
  });

  it('places the finder patterns of the QR family', async () => {
    const bwip = await loadBwip();
    const qr = encode(bwip, {
      id: 'qr',
      text: 'hello',
      textOptions: PLAIN,
      options: {},
      colours: COLOURS,
    });
    const micro = encode(bwip, {
      id: 'micro-qr',
      text: 'HI',
      textOptions: PLAIN,
      options: {},
      colours: COLOURS,
    });
    const aztec = encode(bwip, {
      id: 'aztec',
      text: 'hello',
      textOptions: PLAIN,
      options: {},
      colours: COLOURS,
    });
    if (!qr.ok || !micro.ok || !aztec.ok) throw new Error('refused');
    const size = qr.value.grid!.columns;
    expect(qr.value.grid!.finders).toEqual([
      { column: 0, row: 0 },
      { column: size - 7, row: 0 },
      { column: 0, row: size - 7 },
    ]);
    expect(micro.value.grid!.finders).toEqual([{ column: 0, row: 0 }]);
    expect(aztec.value.grid!.finders).toEqual([]);
  });

  it('refuses options outside their range and an unknown symbology', async () => {
    const bwip = await loadBwip();
    expect(
      encode(bwip, {
        id: 'qr',
        text: 'a',
        textOptions: PLAIN,
        options: { version: 99 },
        colours: COLOURS,
      }),
    ).toEqual(refuse('out-of-range'));
    expect(
      encode(bwip, {
        id: 'shotcode',
        text: 'a',
        textOptions: PLAIN,
        options: {},
        colours: COLOURS,
      }),
    ).toEqual(refuse('out-of-range'));
  });
});

describe('bwipProblem', () => {
  it('maps bwip-js error codes and never passes their text on', () => {
    expect(
      bwipProblem(new Error('bwipp.qrcodeInputTooLong#27120: The input data is too long')),
    ).toBe('too-long');
    expect(bwipProblem(new Error('bwipp.qrcodeNoValidSymbol#27542: Maximum length exceeded'))).toBe(
      'too-long',
    );
    expect(bwipProblem(new Error('bwipp.code39badCharacter#10257: bad'))).toBe('bad-character');
    expect(bwipProblem(new Error('bwipp.ean13badCheckDigit#6915: bad'))).toBe('bad-check-digit');
    expect(bwipProblem(new Error('bwipp.ean13badLength#1: bad'))).toBe('bad-length');
    expect(bwipProblem(new Error('something secret'))).toBe('not-encodable');
    expect(bwipProblem('not even an error')).toBe('not-encodable');
  });
});
