import { ok, refuse, type Result } from './result.ts';

export type TextOptions = {
  /** Read \n, \t, \xHH and the rest as the characters they name. */
  escapes: boolean;
  /** Remove white space at both ends. */
  trim: boolean;
  newline: 'lf' | 'crlf';
  /** Mark non-ASCII text as UTF-8 (the ECI marker), where the symbology can carry one. */
  eci: boolean;
};

/**
 * What a symbology can carry: `eci` any text, with a UTF-8 marker; `utf8` any text, without one;
 * `ascii` printable ASCII only; `digits` 0 to 9 only.
 */
export type TextCapability = 'eci' | 'utf8' | 'ascii' | 'digits';

export type PreparedText = {
  text: string;
  bwip: { parsefnc?: true; binarytext?: true };
  warnings: 'no-eci'[];
};

const SIMPLE: Record<string, string> = { n: '\n', r: '\r', t: '\t', '\\': '\\' };

/** Reads backslash sequences. Anything after a backslash that is not one of them is refused. */
export function readEscapes(text: string): Result<string> {
  let out = '';
  for (let at = 0; at < text.length; at++) {
    const char = text[at]!;
    if (char !== '\\') {
      out += char;
      continue;
    }
    const next = text[at + 1];
    if (next !== undefined && next in SIMPLE) {
      out += SIMPLE[next];
      at += 1;
    } else if (next === 'x' && /^[0-9a-fA-F]{2}$/.test(text.slice(at + 2, at + 4))) {
      out += String.fromCharCode(parseInt(text.slice(at + 2, at + 4), 16));
      at += 3;
    } else if (next === 'u') {
      const match = /^\{([0-9a-fA-F]{1,6})\}/.exec(text.slice(at + 2, at + 11));
      const code = match ? parseInt(match[1]!, 16) : -1;
      if (!match || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
        return refuse('bad-escape');
      out += String.fromCodePoint(code);
      at += 2 + match[0].length - 1;
    } else {
      return refuse('bad-escape');
    }
  }
  return ok(out);
}

/** The UTF-8 bytes of the text, one character per byte, as bwip-js's binary text expects. */
function utf8Bytes(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  // In chunks, so text at the limit does not overflow the call stack.
  for (let at = 0; at < bytes.length; at += 4096) {
    out += String.fromCharCode(...bytes.subarray(at, at + 4096));
  }
  return out;
}

const ASCII = /^[\x20-\x7e\r\n\t]*$/;

/** Text as bwip-js should receive it, for a symbology with the given capability. */
export function prepareText(
  text: string,
  options: TextOptions,
  capability: TextCapability,
): Result<PreparedText> {
  let value = text;
  if (options.escapes) {
    const read = readEscapes(value);
    if (!read.ok) return read;
    value = read.value;
  }
  value = value.replace(/\r\n|\r|\n/g, options.newline === 'crlf' ? '\r\n' : '\n');
  if (options.trim) value = value.trim();

  if (capability === 'digits') {
    return /^[0-9]*$/.test(value)
      ? ok({ text: value, bwip: {}, warnings: [] })
      : refuse('bad-character');
  }
  if (capability === 'ascii') {
    return ASCII.test(value)
      ? ok({ text: value, bwip: {}, warnings: [] })
      : refuse('bad-character');
  }
  const plain = ASCII.test(value);
  if (plain || !options.eci) return ok({ text: value, bwip: {}, warnings: [] });
  if (capability === 'utf8') return ok({ text: value, bwip: {}, warnings: ['no-eci'] });
  // The marker form: a caret starts a command in this form, so a typed caret is written ^094.
  return ok({
    text: '^ECI000026' + utf8Bytes(value).replaceAll('^', '^094'),
    bwip: { parsefnc: true, binarytext: true },
    warnings: [],
  });
}
