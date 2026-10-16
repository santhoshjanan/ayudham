import { ok, refuse, type Result } from './result.ts';

// ---- Shared ----

const blank = (value: string | undefined): boolean => value === undefined || value.trim() === '';

/**
 * Folds a content line at 75 octets, as vCard and iCalendar specify: continuation lines start
 * with one space. Never splits a character.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const room = parts.length === 0 ? 75 : 74;
    if (size + bytes > room) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join('\r\n');
}

/** vCard and iCalendar text values: backslash, comma, semicolon and new lines escaped. */
const textValue = (value: string): string =>
  value
    .replaceAll('\\', '\\\\')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;')
    .replace(/\r\n|\r|\n/g, '\\n');

const lines = (entries: string[]): string => entries.map(fold).join('\r\n');

// ---- Links ----

export function linkPayload(address: string): Result<string> {
  if (blank(address)) return refuse('empty');
  try {
    new URL(address.trim());
  } catch {
    return refuse('bad-address');
  }
  return ok(address.trim());
}

/** "https://" plus the address, when it has no scheme and looks like a host name. */
export function suggestHttps(address: string): string | null {
  const value = address.trim();
  if (value.includes('://')) return null;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(value) ? `https://${value}` : null;
}

// ---- Business cards ----

export type Contact = {
  given: string;
  family: string;
  organisation?: string;
  title?: string;
  phones: { number: string; kind: 'cell' | 'work' | 'home' }[];
  emails: string[];
  website?: string;
  address?: {
    street?: string;
    city?: string;
    region?: string;
    postcode?: string;
    country?: string;
  };
  note?: string;
};

export function vCard(contact: Contact): Result<string> {
  if (blank(contact.given) && blank(contact.family)) return refuse('empty');
  const given = contact.given.trim();
  const family = contact.family.trim();
  const entries = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${textValue(family)};${textValue(given)};;;`,
    `FN:${textValue([given, family].filter(Boolean).join(' '))}`,
  ];
  if (!blank(contact.organisation)) entries.push(`ORG:${textValue(contact.organisation!.trim())}`);
  if (!blank(contact.title)) entries.push(`TITLE:${textValue(contact.title!.trim())}`);
  for (const { number, kind } of contact.phones) {
    if (!blank(number)) entries.push(`TEL;TYPE=${kind.toUpperCase()}:${textValue(number.trim())}`);
  }
  for (const address of contact.emails)
    if (!blank(address)) entries.push(`EMAIL:${textValue(address.trim())}`);
  if (!blank(contact.website)) entries.push(`URL:${contact.website!.trim()}`);
  const where = contact.address;
  if (
    where &&
    [where.street, where.city, where.region, where.postcode, where.country].some(
      (part) => !blank(part),
    )
  ) {
    const parts = [where.street, where.city, where.region, where.postcode, where.country].map(
      (part) => textValue(part?.trim() ?? ''),
    );
    entries.push(`ADR:;;${parts.join(';')}`);
  }
  if (!blank(contact.note)) entries.push(`NOTE:${textValue(contact.note!)}`);
  entries.push('END:VCARD');
  return ok(lines(entries));
}

/** MECARD's reserved characters: backslash, semicolon, comma and colon. */
const meValue = (value: string): string => value.replace(/[\\;,:]/g, (char) => `\\${char}`);

export function meCard(contact: Contact): Result<string> {
  if (blank(contact.given) && blank(contact.family)) return refuse('empty');
  const fields = [`N:${meValue(contact.family.trim())},${meValue(contact.given.trim())}`];
  if (!blank(contact.organisation)) fields.push(`ORG:${meValue(contact.organisation!.trim())}`);
  for (const { number } of contact.phones)
    if (!blank(number)) fields.push(`TEL:${meValue(number.trim())}`);
  for (const address of contact.emails)
    if (!blank(address)) fields.push(`EMAIL:${meValue(address.trim())}`);
  if (!blank(contact.website)) fields.push(`URL:${meValue(contact.website!.trim())}`);
  const where = contact.address;
  if (where) {
    const joined = [where.street, where.city, where.region, where.postcode, where.country]
      .filter((part) => !blank(part))
      .join(', ');
    if (joined) fields.push(`ADR:${meValue(joined)}`);
  }
  if (!blank(contact.note)) fields.push(`NOTE:${meValue(contact.note!)}`);
  return ok(`MECARD:${fields.join(';')};;`);
}

// ---- Events ----

export type CalendarEvent = {
  title: string;
  /** `YYYY-MM-DDTHH:MM`, or `YYYY-MM-DD` when all day. */
  start: string;
  end: string;
  allDay: boolean;
  /** null writes floating local time; minutes east of UTC convert to UTC. */
  utcOffsetMinutes: number | null;
  place?: string;
  description?: string;
};

/** Days since 1970-01-01 for a civil date (Hinnant's algorithm), with no clock involved. */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(days: number): [number, number, number] {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (month <= 2 ? 1 : 0), month, day];
}

/** Minutes since 1970 for `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`, or null for an impossible date. */
function minutesOf(value: string, timed: boolean): number | null {
  const match = timed
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
    : /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour = 0, minute = 0] = match.slice(1).map(Number) as number[];
  if (month! < 1 || month! > 12 || hour > 23 || minute > 59) return null;
  const days = daysFromCivil(year!, month!, day!);
  if (civilFromDays(days).join() !== [year, month, day].join()) return null;
  return days * 1440 + hour * 60 + minute;
}

const two = (value: number): string => String(value).padStart(2, '0');

function stamp(minutes: number, timed: boolean, utc: boolean): string {
  const days = Math.floor(minutes / 1440);
  const [year, month, day] = civilFromDays(days);
  const date = `${String(year).padStart(4, '0')}${two(month)}${two(day)}`;
  if (!timed) return date;
  const rest = minutes - days * 1440;
  return `${date}T${two(Math.floor(rest / 60))}${two(rest % 60)}00${utc ? 'Z' : ''}`;
}

export function calendarEvent(event: CalendarEvent): Result<string> {
  if (blank(event.title)) return refuse('empty');
  const timed = !event.allDay;
  const start = minutesOf(event.start, timed);
  const end = minutesOf(event.end, timed);
  if (start === null || end === null) return refuse('bad-date');
  if (timed ? end <= start : end < start) return refuse('bad-date');
  const entries = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//pokerji//Code maker//EN',
    'BEGIN:VEVENT',
    `SUMMARY:${textValue(event.title.trim())}`,
  ];
  if (timed) {
    const offset = event.utcOffsetMinutes;
    const utc = offset !== null;
    if (utc && !Number.isInteger(offset)) return refuse('bad-date');
    const shift = utc ? offset : 0;
    entries.push(
      `DTSTART:${stamp(start - shift, true, utc)}`,
      `DTEND:${stamp(end - shift, true, utc)}`,
    );
  } else {
    // The end of an all-day event is the day after its last day.
    entries.push(
      `DTSTART;VALUE=DATE:${stamp(start, false, false)}`,
      `DTEND;VALUE=DATE:${stamp(end + 1440, false, false)}`,
    );
  }
  if (!blank(event.place)) entries.push(`LOCATION:${textValue(event.place!.trim())}`);
  if (!blank(event.description)) entries.push(`DESCRIPTION:${textValue(event.description!)}`);
  entries.push('END:VEVENT', 'END:VCALENDAR');
  return ok(lines(entries));
}

// ---- Wi-Fi ----

export type Wifi = {
  ssid: string;
  password: string;
  security: 'wpa' | 'wep' | 'none';
  hidden: boolean;
};

/** Wi-Fi's reserved characters, kept exactly otherwise: spaces at either end are part of a password. */
const wifiValue = (value: string): string => value.replace(/[\\;,:"]/g, (char) => `\\${char}`);

export function wifi(network: Wifi): Result<string> {
  if (network.ssid === '') return refuse('empty');
  const parts = [
    `T:${network.security === 'none' ? 'nopass' : network.security.toUpperCase()}`,
    `S:${wifiValue(network.ssid)}`,
  ];
  if (network.security !== 'none') parts.push(`P:${wifiValue(network.password)}`);
  if (network.hidden) parts.push('H:true');
  return ok(`WIFI:${parts.join(';')};;`);
}

// ---- Places ----

export type Place =
  | { kind: 'coordinates'; latitude: number; longitude: number }
  | { kind: 'address'; address: string; as: 'geo' | 'openstreetmap' | 'apple' | 'google' };

const MAPS = {
  geo: 'geo:0,0?q=',
  openstreetmap: 'https://www.openstreetmap.org/search?query=',
  apple: 'https://maps.apple.com/?q=',
  google: 'https://www.google.com/maps/search/?api=1&query=',
} as const;

const degrees = (value: number): string => String(Number(value.toFixed(6)));

export function place(where: Place): Result<string> {
  if (where.kind === 'coordinates') {
    const { latitude, longitude } = where;
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return refuse('bad-coordinates');
    }
    return ok(`geo:${degrees(latitude)},${degrees(longitude)}`);
  }
  if (blank(where.address)) return refuse('empty');
  return ok(MAPS[where.as] + encodeURIComponent(where.address.trim()));
}

// ---- Email, SMS, phone ----

const crlf = (value: string): string => value.replace(/\r\n|\r|\n/g, '\r\n');

export function email(to: string, subject?: string, body?: string): Result<string> {
  if (blank(to)) return refuse('empty');
  const address = to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return refuse('bad-email');
  const query: string[] = [];
  if (!blank(subject)) query.push(`subject=${encodeURIComponent(crlf(subject!))}`);
  if (!blank(body)) query.push(`body=${encodeURIComponent(crlf(body!))}`);
  return ok(`mailto:${address}${query.length ? `?${query.join('&')}` : ''}`);
}

function tidyNumber(number: string): Result<string> {
  if (blank(number)) return refuse('empty');
  const tidy = number.replace(/[\s().-]/g, '');
  return /^\+?[0-9]{3,20}$/.test(tidy) ? ok(tidy) : refuse('bad-phone');
}

export function sms(number: string, message?: string): Result<string> {
  const tidy = tidyNumber(number);
  if (!tidy.ok) return tidy;
  return ok(`SMSTO:${tidy.value}:${message ?? ''}`);
}

export function phone(number: string): Result<string> {
  const tidy = tidyNumber(number);
  return tidy.ok ? ok(`tel:${tidy.value}`) : tidy;
}
