import { describe, expect, it } from 'vitest';
import {
  calendarEvent,
  check,
  email,
  encode,
  linkPayload,
  meCard,
  parseColour,
  phone,
  place,
  pixelsFor,
  prepareText,
  readEscapes,
  sms,
  styleGrid,
  SYMBOLOGIES,
  toPdf,
  toSvg,
  vCard,
  wifi,
  type Bwip,
  type Drawing,
  type Result,
  type TextOptions,
} from '../src/index.ts';
import { loadBwip } from './helpers.ts';

const AWKWARD = [
  '',
  ' ',
  '\0',
  '^',
  '^ECI000026',
  '^FNC1',
  '\uD800',
  'a\uDC00b',
  '‮evil',
  '😀👨‍👩‍👧🇮🇳',
  'é́',
  'x'.repeat(7089),
  'x'.repeat(7090),
  '9'.repeat(7089),
  '\\',
  '\\u{',
  '<script>alert(1)</script>',
];
const OPTIONS: TextOptions[] = [
  { escapes: false, trim: false, newline: 'lf', eci: true },
  { escapes: true, trim: true, newline: 'crlf', eci: false },
];
const NOTHING = [null, undefined, 5, {}, []] as unknown[];
const isResult = (value: Result<unknown>): boolean =>
  typeof value === 'object' && value !== null && typeof value.ok === 'boolean';

describe('nothing throws, whatever it is given', () => {
  it('encode, for every symbology and awkward text', async () => {
    const bwip = await loadBwip();
    for (const symbology of SYMBOLOGIES) {
      for (const text of AWKWARD) {
        for (const textOptions of OPTIONS) {
          const run = () =>
            encode(bwip, {
              id: symbology.id,
              text,
              textOptions,
              options: {},
              colours: { foreground: '#000000', background: null },
            });
          expect(run, `${symbology.id} ${JSON.stringify(text.slice(0, 12))}`).not.toThrow();
          expect(isResult(run())).toBe(true);
        }
      }
      for (const bad of NOTHING) {
        expect(() =>
          encode(bwip, {
            id: symbology.id,
            text: bad as string,
            textOptions: OPTIONS[0]!,
            options: bad as never,
            colours: { foreground: '#000000', background: null },
          }),
        ).not.toThrow();
      }
    }
  }, 120_000);

  it('every option at, below and above its limits', async () => {
    const bwip = await loadBwip();
    for (const symbology of SYMBOLOGIES) {
      for (const option of symbology.options) {
        const values: unknown[] =
          option.kind === 'integer'
            ? [option.min - 1, option.min, option.max, option.max + 1, 1.5, Number.NaN, 'auto', '3']
            : option.kind === 'choice'
              ? [...option.values, 'nonsense', 99]
              : [true, false, 'true', 1];
        for (const value of values) {
          const made = encode(bwip, {
            id: symbology.id,
            text: symbology.capability === 'digits' ? '0123456' : 'Hello 123',
            textOptions: OPTIONS[0]!,
            options: { [option.key]: value },
            colours: { foreground: '#000000', background: '#ffffff' },
          });
          expect(isResult(made), `${symbology.id}.${option.key}=${String(value)}`).toBe(true);
        }
      }
    }
  }, 120_000);

  it('the content builders, with fields missing or of the wrong type', () => {
    const loose = (value: unknown) => value as never;
    const runs: Array<() => Result<string>> = [];
    for (const bad of [...AWKWARD, ...NOTHING]) {
      runs.push(
        () => linkPayload(loose(bad)),
        () =>
          vCard(
            loose({ given: bad, family: bad, phones: bad, emails: bad, address: bad, note: bad }),
          ),
        () => meCard(loose({ given: bad, family: 'Lee', phones: bad, emails: bad })),
        () =>
          calendarEvent(
            loose({ title: bad, start: bad, end: bad, allDay: false, utcOffsetMinutes: bad }),
          ),
        () => wifi(loose({ ssid: bad, password: bad, security: bad, hidden: bad })),
        () => place(loose({ kind: 'address', address: bad, as: bad })),
        () => place(loose({ kind: 'coordinates', latitude: bad, longitude: bad })),
        () => email(loose(bad), loose(bad), loose(bad)),
        () => sms(loose(bad), loose(bad)),
        () => phone(loose(bad)),
        () => readEscapes(loose(bad)),
        () => parseColour(loose(bad)),
      );
    }
    for (const run of runs) {
      expect(run).not.toThrow();
      expect(isResult(run())).toBe(true);
    }
    for (const bad of [...AWKWARD, ...NOTHING])
      expect(() => prepareText(loose(bad), OPTIONS[0]!, 'eci')).not.toThrow();
  });

  it('encode answers a bwip-js that throws something unexpected with not-encodable', () => {
    const broken = {
      raw: () => {
        throw new TypeError('something went wrong inside');
      },
      render: () => {
        throw 'a string, not an error';
      },
      FontLib: {},
    } as unknown as Bwip;
    for (const id of ['qr', 'ean-13']) {
      expect(
        encode(broken, {
          id,
          text: '0123456789012',
          textOptions: OPTIONS[0]!,
          options: {},
          colours: { foreground: '#000000', background: null },
        }),
      ).toEqual({
        ok: false,
        problem: 'not-encodable',
      });
    }
  });

  it('the writers, given an empty drawing', () => {
    const empty: Drawing = { width: 10, height: 10, background: null, layers: [], logo: null };
    expect(toSvg(empty, null)).toContain('<svg');
    expect(toPdf(empty, { kind: 'fit', widthMm: 20 }).length).toBeGreaterThan(100);
    expect(isResult(pixelsFor(empty, { kind: 'pixels', width: 100 }))).toBe(true);
  });

  it('styling and checks on a grid with no dark modules', () => {
    const grid = {
      kind: 'grid' as const,
      symbology: 'qr',
      columns: 21,
      rows: 21,
      cells: new Uint8Array(441),
      finders: [],
    };
    const style = {
      dots: 'connected' as const,
      ring: 'leaf' as const,
      eye: 'diamond' as const,
      foreground: { type: 'solid' as const, colour: '#000000' },
      background: null,
      corners: null,
      perModule: null,
      quietZone: 0,
      logo: {
        width: 1,
        height: 1,
        rgba: new Uint8Array(4),
        png: new Uint8Array(1),
        share: 5,
        padding: 99,
        plate: 'circle' as const,
      },
    };
    expect(() => styleGrid(grid, style)).not.toThrow();
    const symbology = SYMBOLOGIES[0]!;
    expect(() =>
      check({ options: {}, symbology, grid, drawing: null, quietZone: 0, warnings: [] }, style, {
        foreground: '#000000',
        background: null,
      }),
    ).not.toThrow();
  });
});
