import {
  calendarEvent,
  email,
  linkPayload,
  meCard,
  phone,
  place,
  sms,
  vCard,
  wifi,
  type Contact,
  type Result,
  type TextOptions,
} from '@pokerji/code-maker';
import { isQrKind, symbologyOf, type KindId } from './kinds.ts';

export type Payload = { text: string; id: string; textOptions: TextOptions };

/** The text options a person can set, on the Text kind and on every other code. */
export type TextFields = TextOptions & { text: string };
export type LinkFields = { address: string; eci: boolean };
export type CardFields = {
  format: 'vcard' | 'mecard';
  given: string;
  family: string;
  organisation: string;
  title: string;
  mobile: string;
  work: string;
  email: string;
  website: string;
  street: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
  note: string;
  eci: boolean;
};
export type EventFields = {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  utc: boolean;
  place: string;
  description: string;
  eci: boolean;
};
export type WifiFields = {
  ssid: string;
  password: string;
  security: 'wpa' | 'wep' | 'none';
  hidden: boolean;
  eci: boolean;
};
export type PlaceFields = {
  by: 'coordinates' | 'address';
  latitude: string;
  longitude: string;
  address: string;
  as: 'geo' | 'openstreetmap' | 'apple' | 'google';
  eci: boolean;
};
export type EmailFields = { to: string; subject: string; body: string; eci: boolean };
export type SmsFields = { number: string; message: string; eci: boolean };
export type PhoneFields = { number: string };

/** Each kind's fields as the page first shows them. */
export function blankFields(kind: KindId): Record<string, unknown> {
  switch (kind) {
    case 'qr-link':
      return { address: '', eci: false } satisfies LinkFields;
    case 'qr-card':
      return {
        format: 'vcard',
        given: '',
        family: '',
        organisation: '',
        title: '',
        mobile: '',
        work: '',
        email: '',
        website: '',
        street: '',
        city: '',
        region: '',
        postcode: '',
        country: '',
        note: '',
        eci: false,
      } satisfies CardFields;
    case 'qr-event':
      return {
        title: '',
        start: '',
        end: '',
        allDay: false,
        utc: true,
        place: '',
        description: '',
        eci: false,
      } satisfies EventFields;
    case 'qr-wifi':
      return {
        ssid: '',
        password: '',
        security: 'wpa',
        hidden: false,
        eci: false,
      } satisfies WifiFields;
    case 'qr-place':
      return {
        by: 'coordinates',
        latitude: '',
        longitude: '',
        address: '',
        as: 'geo',
        eci: false,
      } satisfies PlaceFields;
    case 'qr-email':
      return { to: '', subject: '', body: '', eci: false } satisfies EmailFields;
    case 'qr-sms':
      return { number: '', message: '', eci: false } satisfies SmsFields;
    case 'qr-phone':
      return { number: '' } satisfies PhoneFields;
    default:
      // The Text kind and every other code: one text field and its options. Non-ASCII text
      // carries the UTF-8 marker by default where the code can carry one (spec section 6).
      return {
        text: '',
        escapes: false,
        trim: false,
        newline: 'lf',
        eci: true,
      } satisfies TextFields;
  }
}

/** Structured payloads keep their own line endings: vCard and iCalendar are CRLF already. */
const AS_BUILT = { escapes: false, trim: false } as const;

const blank = (value: string): boolean => value.trim() === '';

function contact(fields: CardFields): Contact {
  return {
    given: fields.given,
    family: fields.family,
    organisation: fields.organisation,
    title: fields.title,
    phones: [
      { number: fields.mobile, kind: 'cell' as const },
      { number: fields.work, kind: 'work' as const },
    ].filter((entry) => !blank(entry.number)),
    emails: blank(fields.email) ? [] : [fields.email],
    website: fields.website,
    address: {
      street: fields.street,
      city: fields.city,
      region: fields.region,
      postcode: fields.postcode,
      country: fields.country,
    },
    note: fields.note,
  };
}

/** Minutes east of UTC at the event's start, as this browser reckons them. */
const offsetAt = (start: string): number | null => {
  const at = new Date(start);
  return Number.isNaN(at.getTime()) ? null : -at.getTimezoneOffset();
};

/** A typed number of degrees, or NaN for anything that is not one. */
const degrees = (value: string): number =>
  /^\s*[+-]?(\d+(\.\d*)?|\.\d+)\s*$/.test(value) ? Number(value) : Number.NaN;

function structured(kind: KindId, fields: Record<string, unknown>): Result<string> | null {
  switch (kind) {
    case 'qr-link':
      return linkPayload((fields as LinkFields).address);
    case 'qr-card': {
      const card = fields as CardFields;
      return card.format === 'mecard' ? meCard(contact(card)) : vCard(contact(card));
    }
    case 'qr-event': {
      const event = fields as EventFields;
      if (blank(event.title) && blank(event.start) && blank(event.end))
        return { ok: false, problem: 'empty' };
      return calendarEvent({
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        utcOffsetMinutes: event.utc && !event.allDay ? offsetAt(event.start) : null,
        place: event.place,
        description: event.description,
      });
    }
    case 'qr-wifi': {
      const network = fields as WifiFields;
      return wifi({ ...network });
    }
    case 'qr-place': {
      const where = fields as PlaceFields;
      if (where.by === 'address')
        return place({ kind: 'address', address: where.address, as: where.as });
      if (blank(where.latitude) && blank(where.longitude)) return { ok: false, problem: 'empty' };
      return place({
        kind: 'coordinates',
        latitude: degrees(where.latitude),
        longitude: degrees(where.longitude),
      });
    }
    case 'qr-email': {
      const message = fields as EmailFields;
      return email(message.to, message.subject, message.body);
    }
    case 'qr-sms': {
      const message = fields as SmsFields;
      return sms(message.number, message.message);
    }
    case 'qr-phone':
      return phone((fields as PhoneFields).number);
    default:
      return null;
  }
}

/** The text a kind's fields make, and how the encoder should read it. */
export function payloadFor(kind: KindId, fields: Record<string, unknown>): Result<Payload> {
  const id = symbologyOf(kind).id;
  const built = structured(kind, fields);
  if (built) {
    if (!built.ok) return built;
    const crlf = kind === 'qr-card' || kind === 'qr-event';
    return {
      ok: true,
      value: {
        text: built.value,
        id,
        textOptions: { ...AS_BUILT, newline: crlf ? 'crlf' : 'lf', eci: fields.eci === true },
      },
    };
  }
  const typed = fields as TextFields;
  if (typeof typed.text !== 'string' || typed.text === '') return { ok: false, problem: 'empty' };
  return {
    ok: true,
    value: {
      text: typed.text,
      id,
      textOptions: {
        escapes: typed.escapes,
        trim: typed.trim,
        newline: typed.newline,
        eci: typed.eci,
      },
    },
  };
}

export const isStructured = (kind: KindId): boolean => isQrKind(kind) && kind !== 'qr-text';
