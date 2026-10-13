import { describe, expect, it } from 'vitest';
import { decode, encode, ENCODINGS, refuse, type Encoding } from '../src/index.ts';

const enc = (text: string, form: Encoding): string => {
  const made = encode(text, form);
  if (!made.ok) throw new Error(made.problem);
  return made.value;
};
const text = (value: string) => ({ ok: true, value: { text: value, binary: false } });
const binary = (hex: string) => ({ ok: true, value: { text: hex, binary: true } });

describe('encode', () => {
  it('writes each form', () => {
    expect(enc('hello', 'base64')).toBe('aGVsbG8=');
    expect(enc('hello', 'base64url')).toBe('aGVsbG8');
    expect(enc('hello', 'hex')).toBe('68656c6c6f');
    expect(enc('a b&c/é', 'url')).toBe('a%20b%26c%2F%C3%A9');
    expect(enc('<b>', 'entities')).toBe('&lt;b&gt;');
  });

  it('leaves the unreserved URL characters alone', () => {
    const unreserved = "AZaz09-_.!~*'()";
    expect(enc(unreserved, 'url')).toBe(unreserved);
    expect(enc('+', 'url')).toBe('%2B');
    expect(enc('😀', 'url')).toBe('%F0%9F%98%80');
  });

  it('refuses an unknown form and text over the limit', () => {
    expect(encode('a', 'rot13' as Encoding)).toEqual(refuse('out-of-range'));
    expect(encode('x'.repeat(100_001), 'hex')).toEqual(refuse('too-long'));
  });
});

describe('decode', () => {
  it('reads Base64 with white space, with or without padding', () => {
    expect(decode('aGVsbG8=', 'base64')).toEqual(text('hello'));
    expect(decode('aGVsbG8', 'base64')).toEqual(text('hello'));
    expect(decode(' aGVs\nbG8= \r\n', 'base64')).toEqual(text('hello'));
    expect(decode('', 'base64')).toEqual(text(''));
  });

  it('keeps the two Base64 alphabets apart', () => {
    expect(decode('Pj4+Pz8/', 'base64')).toEqual(text('>>>???'));
    expect(decode('Pj4-Pz8_', 'base64url')).toEqual(text('>>>???'));
    expect(decode('Pj4-Pz8_', 'base64')).toEqual(refuse('bad-base64'));
    expect(decode('Pj4+Pz8/', 'base64url')).toEqual(refuse('bad-base64'));
  });

  it('refuses Base64 with a wrong character, length or padding', () => {
    for (const bad of ['aGVsbG8*', 'a', 'aGVsb', 'aG=VsbG8', 'aGVsbG8===', '😀']) {
      expect(decode(bad, 'base64'), bad).toEqual(refuse('bad-base64'));
    }
  });

  it('reads hex in either case, with spaces and colons', () => {
    expect(decode('68656c6c6f', 'hex')).toEqual(text('hello'));
    expect(decode('68:65:6C 6c\n6F', 'hex')).toEqual(text('hello'));
    expect(decode('6', 'hex')).toEqual(refuse('odd-hex'));
    expect(decode('zz', 'hex')).toEqual(refuse('bad-hex'));
    expect(decode('0x68', 'hex')).toEqual(refuse('bad-hex'));
  });

  it('reads percent sequences and leaves a plus as a plus', () => {
    expect(decode('a%20b%26c%2F%C3%A9', 'url')).toEqual(text('a b&c/é'));
    expect(decode('%e2%82%ac', 'url')).toEqual(text('€'));
    expect(decode('a+b', 'url')).toEqual(text('a+b'));
    expect(decode('caf%C3%A9 é', 'url')).toEqual(text('café é'));
    for (const bad of ['100%', '%zz', '%2', '%%20']) {
      expect(decode(bad, 'url'), bad).toEqual(refuse('bad-percent'));
    }
  });

  it('shows bytes that are not text as hex', () => {
    expect(decode('/w==', 'base64')).toEqual(binary('ff'));
    expect(decode('ff00', 'hex')).toEqual(binary('ff00'));
    expect(decode('%FF', 'url')).toEqual(binary('ff'));
  });

  it('reads entities', () => {
    expect(decode('&lt;b&gt; &amp; &copy;', 'entities')).toEqual(text('<b> & ©'));
  });

  it('refuses an unknown form and text over the limit', () => {
    expect(decode('a', 'rot13' as Encoding)).toEqual(refuse('out-of-range'));
    expect(decode('x'.repeat(100_001), 'hex')).toEqual(refuse('too-long'));
  });
});

describe('a round trip', () => {
  it('returns what was typed, in every form', () => {
    const samples = [
      '',
      'hello',
      'a b&c/é?=+%',
      'line\r\nbreak\ttab',
      '日本語 😀 👨‍👩‍👧',
      '<p class="x">&amp;</p>',
      '\0 ﻿',
    ];
    for (const form of ENCODINGS) {
      for (const sample of samples) {
        expect(decode(enc(sample, form), form), `${form}: ${JSON.stringify(sample)}`).toEqual(
          text(sample),
        );
      }
    }
  });
});
