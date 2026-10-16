import { describe, expect, it } from 'vitest';
import {
  check,
  encode,
  LOGO_LIMITS,
  type Encoded,
  type Style,
  type TextOptions,
} from '../src/index.ts';
import { loadBwip } from './helpers.ts';

const PLAIN: TextOptions = { escapes: false, trim: false, newline: 'lf', eci: true };
const LOGO = { width: 4, height: 4, rgba: new Uint8Array(64), png: new Uint8Array([1]) };
const style = (overrides: Partial<Style> = {}): Style => ({
  dots: 'square',
  ring: 'square',
  eye: 'square',
  foreground: { type: 'solid', colour: '#000000' },
  background: '#ffffff',
  corners: null,
  perModule: null,
  quietZone: 4,
  logo: null,
  ...overrides,
});

async function made(
  id: string,
  text: string,
  options: Record<string, unknown> = {},
  quietZone?: number,
): Promise<Encoded> {
  const result = encode(await loadBwip(), {
    id,
    text,
    textOptions: PLAIN,
    options,
    colours: { foreground: '#000000', background: '#ffffff' },
    ...(quietZone === undefined ? {} : { quietZone }),
  });
  if (!result.ok) throw new Error(result.problem);
  return result.value;
}

const codes = (findings: { code: string }[]) => findings.map((finding) => finding.code).sort();

describe('check', () => {
  it('finds nothing wrong with a plain QR code', async () => {
    expect(
      check(await made('qr', 'hello'), style(), { foreground: '#000000', background: '#ffffff' }),
    ).toEqual([]);
  });

  it('warns below 4.5:1 and refuses below 2:1', async () => {
    const qr = await made('qr', 'hello');
    const at = (colour: string) =>
      check(qr, style({ foreground: { type: 'solid', colour } }), {
        foreground: colour,
        background: '#ffffff',
      });
    expect(codes(at('#767676'))).toEqual([]);
    expect(at('#777777')).toEqual([{ level: 'warning', code: 'contrast-low' }]);
    expect(at('#bbbbbb')).toEqual([{ level: 'refusal', code: 'contrast-too-low' }]);
  });

  it('measures the weakest colour of a gradient or a corner paint', async () => {
    const qr = await made('qr', 'hello');
    const gradient = style({
      foreground: { type: 'linear', from: '#000000', to: '#888888', angle: 0 },
    });
    expect(codes(check(qr, gradient, { foreground: '#000000', background: '#ffffff' }))).toEqual([
      'contrast-low',
    ]);
    const corners = style({ corners: { type: 'solid', colour: '#999999' } });
    expect(codes(check(qr, corners, { foreground: '#000000', background: '#ffffff' }))).toEqual([
      'contrast-low',
    ]);
  });

  it('warns about light on dark, as after Invert', async () => {
    const qr = await made('qr', 'hello');
    const inverted = style({
      foreground: { type: 'solid', colour: '#ffffff' },
      background: '#000000',
    });
    expect(codes(check(qr, inverted, { foreground: '#ffffff', background: '#000000' }))).toEqual([
      'light-on-dark',
    ]);
  });

  it('warns about a quiet zone below the standard', async () => {
    const qr = await made('qr', 'hello');
    expect(
      codes(check(qr, style({ quietZone: 3 }), { foreground: '#000000', background: '#ffffff' })),
    ).toEqual(['quiet-zone-small']);
    expect(
      check(qr, style({ quietZone: 4 }), { foreground: '#000000', background: '#ffffff' }),
    ).toEqual([]);
  });

  it('warns about the quiet zone of a drawn code below its standard', async () => {
    const colours = { foreground: '#000000', background: '#ffffff' };
    const narrow = await made('ean-13', '590123412345', {}, 2);
    expect(codes(check(narrow, null, colours))).toEqual(['quiet-zone-small']);
    const standard = await made('ean-13', '590123412345', {}, 11);
    expect(check(standard, null, colours)).toEqual([]);
  });

  it('measures a transparent background as white, and says so', async () => {
    const qr = await made('qr', 'hello');
    expect(
      codes(check(qr, style({ background: null }), { foreground: '#000000', background: null })),
    ).toEqual(['transparent-measured-as-white']);
  });

  it('refuses a logo larger than the error correction can recover, and allows one within it', async () => {
    expect(LOGO_LIMITS).toEqual({ L: 0.03, M: 0.06, Q: 0.09, H: 0.12 });
    const high = await made('qr', 'x'.repeat(40), { eclevel: 'H', version: 10 });
    const low = await made('qr', 'x'.repeat(40), { eclevel: 'L', version: 10 });
    const small = style({ logo: { ...LOGO, share: 0.25, padding: 0, plate: 'square' } });
    expect(check(high, small, { foreground: '#000000', background: '#ffffff' })).toEqual([]);
    expect(check(low, small, { foreground: '#000000', background: '#ffffff' })).toEqual([
      { level: 'refusal', code: 'logo-too-large' },
    ]);
  });

  it('carries the encoder’s own warnings, and checks drawn codes by their colours', async () => {
    const micro = await made('micro-qr', 'Grüße');
    expect(
      codes(
        check(micro, style({ quietZone: 2 }), { foreground: '#000000', background: '#ffffff' }),
      ),
    ).toEqual(['no-eci']);
    const ean = await made('ean-13', '590123412345', {}, 11);
    expect(codes(check(ean, null, { foreground: '#999999', background: '#ffffff' }))).toEqual([
      'contrast-low',
    ]);
  });
});
