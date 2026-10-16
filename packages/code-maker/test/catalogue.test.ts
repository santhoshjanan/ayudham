import { describe, expect, it } from 'vitest';
import { checkOptions, refuse, SYMBOLOGIES } from '../src/index.ts';

const ROWS: Array<[string, string, string, string, string | null]> = [
  ['qr', 'qrcode', 'qr', 'eci', 'QRCode'],
  ['micro-qr', 'microqrcode', 'qr', 'utf8', 'MicroQRCode'],
  ['rmqr', 'rectangularmicroqrcode', 'qr', 'eci', 'RMQRCode'],
  ['data-matrix', 'datamatrix', 'grid', 'eci', 'DataMatrix'],
  ['data-matrix-rect', 'datamatrixrectangular', 'grid', 'eci', 'DataMatrix'],
  ['aztec', 'azteccode', 'grid', 'eci', 'Aztec'],
  ['aztec-compact', 'azteccodecompact', 'grid', 'eci', 'Aztec'],
  ['aztec-rune', 'aztecrune', 'grid', 'digits', 'Aztec'],
  ['pdf417', 'pdf417', 'drawn', 'eci', 'PDF417'],
  ['pdf417-compact', 'pdf417compact', 'drawn', 'eci', 'PDF417'],
  ['micro-pdf417', 'micropdf417', 'drawn', 'utf8', 'MicroPDF417'],
  ['maxicode', 'maxicode', 'drawn', 'eci', 'MaxiCode'],
  ['dotcode', 'dotcode', 'drawn', 'eci', null],
  ['ean-13', 'ean13', 'drawn', 'digits', 'EAN13'],
  ['ean-8', 'ean8', 'drawn', 'digits', 'EAN8'],
  ['upc-a', 'upca', 'drawn', 'digits', 'EAN13'],
  ['upc-e', 'upce', 'drawn', 'digits', 'UPCE'],
  ['isbn', 'isbn', 'drawn', 'ascii', 'EAN13'],
  ['issn', 'issn', 'drawn', 'ascii', 'EAN13'],
  ['code-128', 'code128', 'drawn', 'ascii', 'Code128'],
  ['gs1-128', 'gs1-128', 'drawn', 'ascii', 'Code128'],
  ['code-39', 'code39', 'drawn', 'ascii', 'Code39'],
  ['code-39-ext', 'code39ext', 'drawn', 'ascii', 'Code39Ext'],
  ['code-93', 'code93', 'drawn', 'ascii', 'Code93'],
  ['itf', 'interleaved2of5', 'drawn', 'digits', 'ITF'],
  ['itf-14', 'itf14', 'drawn', 'digits', 'ITF'],
  ['codabar', 'rationalizedCodabar', 'drawn', 'ascii', 'Codabar'],
  ['databar-omni', 'databaromni', 'drawn', 'ascii', 'DataBarOmni'],
  ['databar-limited', 'databarlimited', 'drawn', 'ascii', 'DataBarLtd'],
  ['databar-expanded', 'databarexpanded', 'drawn', 'ascii', 'DataBarExp'],
];

describe('the catalogue', () => {
  it('holds exactly the curated symbologies', () => {
    expect(SYMBOLOGIES.map((row) => row.id)).toEqual(ROWS.map(([id]) => id));
    for (const [id, bcid, family, capability, decoder] of ROWS) {
      expect(
        SYMBOLOGIES.find((row) => row.id === id),
        id,
      ).toMatchObject({ bcid, family, capability, decoder });
    }
  });

  it('gives every option a default inside its range, and every symbology a label and a quiet zone', () => {
    for (const row of SYMBOLOGIES) {
      expect(row.label.length, row.id).toBeGreaterThan(1);
      expect(row.quietZone, row.id).toBeGreaterThanOrEqual(0);
      for (const option of row.options) {
        if (option.kind === 'choice')
          expect(option.values, `${row.id}.${option.key}`).toContain(option.default);
        if (option.kind === 'integer' && option.default !== 'auto') {
          expect(option.default, `${row.id}.${option.key}`).toBeGreaterThanOrEqual(option.min);
          expect(option.default, `${row.id}.${option.key}`).toBeLessThanOrEqual(option.max);
        }
      }
    }
  });
});

describe('checkOptions', () => {
  it('refuses unknown keys and out-of-range values', () => {
    expect(checkOptions('qr', { eclevel: 'Z' })).toEqual(refuse('out-of-range'));
    expect(checkOptions('qr', { version: 41 })).toEqual(refuse('out-of-range'));
    expect(checkOptions('qr', { version: 2.5 })).toEqual(refuse('out-of-range'));
    expect(checkOptions('qr', { colour: 'red' })).toEqual(refuse('out-of-range'));
    expect(checkOptions('nothing', {})).toEqual(refuse('out-of-range'));
  });

  it('drops auto and keeps what is allowed', () => {
    expect(checkOptions('qr', { version: 'auto' })).toEqual({ ok: true, value: {} });
    expect(checkOptions('qr', { eclevel: 'H', version: 5 })).toEqual({
      ok: true,
      value: { eclevel: 'H', version: 5 },
    });
    expect(checkOptions('code-39', { includetext: false, height: 20 })).toEqual({
      ok: true,
      value: { includetext: false, height: 20 },
    });
    expect(checkOptions('code-39', { height: 4 })).toEqual(refuse('out-of-range'));
    expect(checkOptions('code-39', { includetext: 'yes' })).toEqual(refuse('out-of-range'));
  });
});

describe('optional check digits', () => {
  it('are off by default, so a scanner never passes one on as part of the data', () => {
    for (const entry of SYMBOLOGIES) {
      const spec = entry.options.find((option) => option.key === 'includecheck');
      if (spec) expect(spec.default, entry.id).toBe(false);
    }
  });
});
