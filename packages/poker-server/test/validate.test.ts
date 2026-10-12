import { describe, expect, it } from 'vitest';
import {
  deckIdSchema,
  nameSchema,
  normaliseAddress,
  passcodeSchema,
  roomCodeSchema,
} from '../src/index.ts';

const ok = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('nameSchema', () => {
  it('accepts a name and trims it', () => {
    expect(nameSchema.parse('  Ann  ')).toBe('Ann');
    expect(ok(nameSchema, 'x'.repeat(30))).toBe(true);
    expect(ok(nameSchema, 'Zoë 山田')).toBe(true);
  });

  it('rejects empty, too long, multi-line and trick names', () => {
    for (const bad of ['', '   ', 'x'.repeat(31), 'a\nb', 'a\u0000b', 'a‮b', 12, null]) {
      expect(ok(nameSchema, bad)).toBe(false);
    }
  });
});

describe('roomCodeSchema', () => {
  it('accepts exactly 12 letters and digits', () => {
    expect(ok(roomCodeSchema, 'AbCdEf123456')).toBe(true);
    for (const bad of ['', 'AbCdEf12345', 'AbCdEf1234567', 'AbCdEf12345!', 'AbCdEf 12345', 7]) {
      expect(ok(roomCodeSchema, bad)).toBe(false);
    }
  });
});

describe('deckIdSchema and passcodeSchema', () => {
  it('accept only the built-in deck ids', () => {
    for (const id of ['fibonacci', 'modifiedFibonacci', 'tshirt', 'powersOfTwo']) {
      expect(ok(deckIdSchema, id)).toBe(true);
    }
    expect(ok(deckIdSchema, 'custom')).toBe(false);
  });

  it('bound the passcode length', () => {
    expect(ok(passcodeSchema, 'abcd')).toBe(true);
    expect(ok(passcodeSchema, 'x'.repeat(64))).toBe(true);
    expect(ok(passcodeSchema, 'abc')).toBe(false);
    expect(ok(passcodeSchema, 'x'.repeat(65))).toBe(false);
  });
});

describe('normaliseAddress', () => {
  it('keeps an IPv4 address and unwraps an IPv4-mapped one', () => {
    expect(normaliseAddress('203.0.113.7')).toBe('203.0.113.7');
    expect(normaliseAddress('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('reduces an IPv6 address to its /64, so one network is one client', () => {
    expect(normaliseAddress('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
    expect(normaliseAddress('2001:db8:1:2::9')).toBe('2001:db8:1:2::/64');
    expect(normaliseAddress('2001:DB8::1')).toBe('2001:db8:0:0::/64');
    expect(normaliseAddress('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(normaliseAddress('::1')).toBe('0:0:0:0::/64');
  });

  it('treats anything else as one unknown client', () => {
    for (const odd of ['', 'unknown', 'not an address', '999.1.1.1', '1.2.3']) {
      expect(normaliseAddress(odd)).toBe('unknown');
    }
  });
});
