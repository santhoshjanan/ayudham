import { BASE64, URL_SAFE } from './alphabets.ts';

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** The text these bytes spell as UTF-8, or null when they spell none. */
export function fromUtf8(data: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);
  } catch {
    return null;
  }
}

export function toHex(data: Uint8Array): string {
  let out = '';
  for (const byte of data) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** Standard Base64 with padding, or the URL-safe alphabet without. */
export function toBase64(data: Uint8Array, url = false): string {
  const alphabet = url ? URL_SAFE : BASE64;
  const pad = url ? '' : '=';
  let out = '';
  for (let i = 0; i < data.length; i += 3) {
    const a = data[i]!;
    const b = data[i + 1];
    const c = data[i + 2];
    out += alphabet[a >> 2]! + alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? pad : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? pad : alphabet[c & 63]!;
  }
  return out;
}
