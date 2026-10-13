import { BASE64, URL_SAFE } from './alphabets.ts';
import { fromUtf8, toBase64, toHex, utf8 } from './bytes.ts';
import { decodeEntities, encodeEntities } from './entities.ts';
import { ok, refuse, type Result } from './result.ts';
import { checkText } from './text.ts';

export const ENCODINGS = ['base64', 'base64url', 'hex', 'url', 'entities'] as const;
export type Encoding = (typeof ENCODINGS)[number];

/** What decoding gave. When the bytes were not text, `text` is their hex and `binary` is true. */
export type Decoded = { text: string; binary: boolean };

const UNRESERVED = /[A-Za-z0-9\-_.!~*'()]/;

function toPercent(data: Uint8Array): string {
  let out = '';
  for (const byte of data) {
    const char = String.fromCharCode(byte);
    out += UNRESERVED.test(char) ? char : '%' + byte.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}

function fromPercent(text: string): Result<Uint8Array> {
  const typed = utf8(text);
  const out: number[] = [];
  for (let i = 0; i < typed.length; i++) {
    if (typed[i] !== 0x25) {
      out.push(typed[i]!);
      continue;
    }
    const pair = String.fromCharCode(typed[i + 1] ?? 0, typed[i + 2] ?? 0);
    if (!/^[0-9a-fA-F]{2}$/.test(pair)) return refuse('bad-percent');
    out.push(parseInt(pair, 16));
    i += 2;
  }
  return ok(Uint8Array.from(out));
}

function fromBase64(text: string, url: boolean): Result<Uint8Array> {
  const alphabet = url ? URL_SAFE : BASE64;
  let clean = text.replace(/\s+/g, '');
  if (clean.endsWith('==')) clean = clean.slice(0, -2);
  else if (clean.endsWith('=')) clean = clean.slice(0, -1);
  if (clean.length % 4 === 1) return refuse('bad-base64');
  const out: number[] = [];
  let buffer = 0;
  let held = 0;
  for (const char of clean) {
    const value = alphabet.indexOf(char);
    if (value < 0) return refuse('bad-base64');
    buffer = (buffer << 6) | value;
    held += 6;
    if (held >= 8) {
      held -= 8;
      out.push((buffer >> held) & 0xff);
      buffer &= (1 << held) - 1;
    }
  }
  return ok(Uint8Array.from(out));
}

function fromHex(text: string): Result<Uint8Array> {
  const clean = text.replace(/[\s:]+/g, '');
  if (/[^0-9a-fA-F]/.test(clean)) return refuse('bad-hex');
  if (clean.length % 2 === 1) return refuse('odd-hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return ok(out);
}

export function encode(text: unknown, form: Encoding): Result<string> {
  const checked = checkText(text);
  if (!checked.ok) return checked;
  const value = checked.value;
  if (form === 'entities') return ok(encodeEntities(value));
  if (form === 'base64') return ok(toBase64(utf8(value)));
  if (form === 'base64url') return ok(toBase64(utf8(value), true));
  if (form === 'hex') return ok(toHex(utf8(value)));
  if (form === 'url') return ok(toPercent(utf8(value)));
  return refuse('out-of-range');
}

export function decode(text: unknown, form: Encoding): Result<Decoded> {
  const checked = checkText(text);
  if (!checked.ok) return checked;
  const value = checked.value;
  if (form === 'entities') return ok({ text: decodeEntities(value), binary: false });
  let data: Result<Uint8Array>;
  if (form === 'base64') data = fromBase64(value, false);
  else if (form === 'base64url') data = fromBase64(value, true);
  else if (form === 'hex') data = fromHex(value);
  else if (form === 'url') data = fromPercent(value);
  else return refuse('out-of-range');
  if (!data.ok) return data;
  const read = fromUtf8(data.value);
  return ok(
    read === null ? { text: toHex(data.value), binary: true } : { text: read, binary: false },
  );
}
