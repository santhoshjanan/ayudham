import { describe, expect, it } from 'vitest';
import {
  calendarEvent,
  email,
  linkPayload,
  meCard,
  phone,
  place,
  refuse,
  sms,
  suggestHttps,
  vCard,
  wifi,
  type CalendarEvent,
  type Contact,
} from '../src/index.ts';
import { decodeGrid, loadBwip } from './helpers.ts';

const ANN: Contact = {
  given: 'Ann',
  family: 'Smith, Jr.',
  organisation: 'Acme; Ltd',
  title: 'Engineer',
  phones: [{ number: '+1 201 555 0100', kind: 'cell' }],
  emails: ['ann@example.com'],
  website: 'https://example.com',
  address: { street: '1 Main St', city: 'Newark', region: 'NJ', postcode: '07102', country: 'USA' },
  note: 'Line one\nLine two',
};

const EVENT: CalendarEvent = {
  title: 'Review, part 1',
  start: '2026-10-16T09:00',
  end: '2026-10-16T10:30',
  allDay: false,
  utcOffsetMinutes: null,
  place: 'Room 2; east',
  description: 'Bring notes',
};

describe('links', () => {
  it('passes a web address through and refuses what is not one', () => {
    expect(linkPayload('https://example.com/a?b=c')).toEqual({
      ok: true,
      value: 'https://example.com/a?b=c',
    });
    expect(linkPayload('example.com')).toEqual(refuse('bad-address'));
    expect(linkPayload('   ')).toEqual(refuse('empty'));
  });

  it('suggests https only for something that looks like a host name', () => {
    expect(suggestHttps('example.com/path')).toBe('https://example.com/path');
    expect(suggestHttps('https://example.com')).toBeNull();
    expect(suggestHttps('just words')).toBeNull();
  });
});

describe('business cards', () => {
  it('writes vCard 3.0 with CRLF and every value escaped', () => {
    expect(vCard(ANN)).toEqual({
      ok: true,
      value: [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'N:Smith\\, Jr.;Ann;;;',
        'FN:Ann Smith\\, Jr.',
        'ORG:Acme\\; Ltd',
        'TITLE:Engineer',
        'TEL;TYPE=CELL:+1 201 555 0100',
        'EMAIL:ann@example.com',
        'URL:https://example.com',
        'ADR:;;1 Main St;Newark;NJ;07102;USA',
        'NOTE:Line one\\nLine two',
        'END:VCARD',
      ].join('\r\n'),
    });
  });

  it('folds a long vCard line at 75 octets without splitting a character', () => {
    const made = vCard({ ...ANN, note: 'é'.repeat(60) });
    if (!made.ok) throw new Error(made.problem);
    const lines = made.value.split('\r\n');
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const note = lines.slice(lines.findIndex((line) => line.startsWith('NOTE:')));
    expect(note[1]!.startsWith(' ')).toBe(true);
    expect(
      note
        .slice(0, -1)
        .map((line, index) => (index === 0 ? line : line.slice(1)))
        .join(''),
    ).toBe(`NOTE:${'é'.repeat(60)}`);
  });

  it('writes MECARD with its own escaping', () => {
    expect(
      meCard({
        given: 'Ann',
        family: 'Lee',
        phones: [{ number: '555', kind: 'cell' }],
        emails: [],
        note: 'a:b;c',
      }),
    ).toEqual({
      ok: true,
      value: 'MECARD:N:Lee,Ann;TEL:555;NOTE:a\\:b\\;c;;',
    });
  });

  it('refuses a card with no name', () => {
    expect(vCard({ ...ANN, given: ' ', family: '' })).toEqual(refuse('empty'));
    expect(meCard({ ...ANN, given: '', family: '' })).toEqual(refuse('empty'));
  });
});

describe('events', () => {
  it('writes an iCalendar event in floating local time, escaped', () => {
    expect(calendarEvent(EVENT)).toEqual({
      ok: true,
      value: [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//pokerji//Code maker//EN',
        'BEGIN:VEVENT',
        'SUMMARY:Review\\, part 1',
        'DTSTART:20261016T090000',
        'DTEND:20261016T103000',
        'LOCATION:Room 2\\; east',
        'DESCRIPTION:Bring notes',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    });
  });

  it('converts to UTC across midnight when given an offset', () => {
    const made = calendarEvent({
      ...EVENT,
      start: '2026-10-16T23:30',
      end: '2026-10-17T00:30',
      utcOffsetMinutes: -240,
    });
    expect(made.ok && made.value).toContain('DTSTART:20261017T033000Z\r\nDTEND:20261017T043000Z');
  });

  it('writes all-day dates with an exclusive end, across a year', () => {
    const made = calendarEvent({ ...EVENT, allDay: true, start: '2026-12-30', end: '2026-12-31' });
    expect(made.ok && made.value).toContain(
      'DTSTART;VALUE=DATE:20261230\r\nDTEND;VALUE=DATE:20270101',
    );
  });

  it('escapes a new line in a description and folds a long one', () => {
    const made = calendarEvent({ ...EVENT, description: `a,b;c\n${'x'.repeat(200)}` });
    if (!made.ok) throw new Error(made.problem);
    expect(made.value).toContain('DESCRIPTION:a\\,b\\;c\\n');
    expect(made.value).toMatch(/\r\n x/);
  });

  it('refuses an event that ends before it starts, or impossible dates', () => {
    expect(calendarEvent({ ...EVENT, end: '2026-10-16T08:00' })).toEqual(refuse('bad-date'));
    expect(calendarEvent({ ...EVENT, end: '2026-10-16T09:00' })).toEqual(refuse('bad-date'));
    expect(calendarEvent({ ...EVENT, start: '2026-02-30T09:00' })).toEqual(refuse('bad-date'));
    expect(
      calendarEvent({ ...EVENT, allDay: true, start: '2026-10-17', end: '2026-10-16' }),
    ).toEqual(refuse('bad-date'));
    expect(calendarEvent({ ...EVENT, title: '' })).toEqual(refuse('empty'));
  });
});

describe('Wi-Fi', () => {
  it('escapes every special character and keeps spaces exactly', () => {
    expect(
      wifi({ ssid: 'Café;Net', password: ' p;a,s:s\\w"d ', security: 'wpa', hidden: true }),
    ).toEqual({
      ok: true,
      value: 'WIFI:T:WPA;S:Café\\;Net;P: p\\;a\\,s\\:s\\\\w\\"d ;H:true;;',
    });
  });

  it('writes an open network without a password, and refuses a blank name', () => {
    expect(wifi({ ssid: 'Guest', password: 'ignored', security: 'none', hidden: false })).toEqual({
      ok: true,
      value: 'WIFI:T:nopass;S:Guest;;',
    });
    expect(wifi({ ssid: '', password: 'x', security: 'wpa', hidden: false })).toEqual(
      refuse('empty'),
    );
  });
});

describe('places', () => {
  it('writes coordinates to six decimals and refuses impossible ones', () => {
    expect(place({ kind: 'coordinates', latitude: 40.7357, longitude: -74.1724 })).toEqual({
      ok: true,
      value: 'geo:40.7357,-74.1724',
    });
    expect(place({ kind: 'coordinates', latitude: 12.3456789, longitude: 0 })).toEqual({
      ok: true,
      value: 'geo:12.345679,0',
    });
    expect(place({ kind: 'coordinates', latitude: 91, longitude: 0 })).toEqual(
      refuse('bad-coordinates'),
    );
    expect(place({ kind: 'coordinates', latitude: 0, longitude: -181 })).toEqual(
      refuse('bad-coordinates'),
    );
    expect(place({ kind: 'coordinates', latitude: Number.NaN, longitude: 0 })).toEqual(
      refuse('bad-coordinates'),
    );
  });

  it('writes an address in the form chosen', () => {
    const at = '1 Main St, Newark';
    expect(place({ kind: 'address', address: at, as: 'geo' })).toEqual({
      ok: true,
      value: 'geo:0,0?q=1%20Main%20St%2C%20Newark',
    });
    expect(place({ kind: 'address', address: at, as: 'openstreetmap' })).toEqual({
      ok: true,
      value: 'https://www.openstreetmap.org/search?query=1%20Main%20St%2C%20Newark',
    });
    expect(place({ kind: 'address', address: at, as: 'apple' })).toEqual({
      ok: true,
      value: 'https://maps.apple.com/?q=1%20Main%20St%2C%20Newark',
    });
    expect(place({ kind: 'address', address: at, as: 'google' })).toEqual({
      ok: true,
      value: 'https://www.google.com/maps/search/?api=1&query=1%20Main%20St%2C%20Newark',
    });
    expect(place({ kind: 'address', address: ' ', as: 'geo' })).toEqual(refuse('empty'));
  });
});

describe('email, SMS and phone', () => {
  it('writes mailto with encoded fields, and line breaks as CRLF', () => {
    expect(email('a@b.c', 'Hi & bye?')).toEqual({
      ok: true,
      value: 'mailto:a@b.c?subject=Hi%20%26%20bye%3F',
    });
    expect(email('a@b.c', undefined, 'one\ntwo')).toEqual({
      ok: true,
      value: 'mailto:a@b.c?body=one%0D%0Atwo',
    });
    expect(email('a@b.c')).toEqual({ ok: true, value: 'mailto:a@b.c' });
    expect(email('not an address')).toEqual(refuse('bad-email'));
    expect(email('')).toEqual(refuse('empty'));
  });

  it('writes SMSTO and tel with the number tidied', () => {
    expect(sms('+1 (201) 555-0100', 'On my way')).toEqual({
      ok: true,
      value: 'SMSTO:+12015550100:On my way',
    });
    expect(phone('+1 (201) 555-0100')).toEqual({ ok: true, value: 'tel:+12015550100' });
    expect(phone('call me')).toEqual(refuse('bad-phone'));
    expect(phone('')).toEqual(refuse('empty'));
  });
});

describe('every payload decodes from a QR code exactly', () => {
  const payloads = [
    vCard(ANN),
    meCard(ANN),
    calendarEvent(EVENT),
    wifi({ ssid: 'Café;Net', password: ' p;a,s:s\\w"d ', security: 'wpa', hidden: true }),
    place({ kind: 'address', address: '1 Main St', as: 'geo' }),
    email('a@b.c', 'Hi & bye?', 'one\ntwo'),
    sms('555 0100', 'hi'),
    phone('+1 201 555 0100'),
    linkPayload('https://example.com/?q=1'),
  ];

  it('for each kind', async () => {
    const bwip = await loadBwip();
    for (const payload of payloads) {
      if (!payload.ok) throw new Error(payload.problem);
      // Payloads keep their own line endings: the QR text is the payload, byte for byte.
      const [grid] = bwip.raw('qrcode', payload.value, {}) as Array<{
        pixs: number[];
        pixx: number;
        pixy: number;
      }>;
      const read = await decodeGrid(Uint8Array.from(grid!.pixs), grid!.pixx, grid!.pixy);
      expect(read?.text).toBe(payload.value);
    }
  });
});
