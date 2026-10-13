import { describe, expect, it } from 'vitest';
import { fromUtf8, toBase64, toHex, utf8 } from '../src/index.ts';

describe('byte helpers', () => {
  it('turns text into UTF-8 and back', () => {
    expect([...utf8('é€')]).toEqual([0xc3, 0xa9, 0xe2, 0x82, 0xac]);
    expect(fromUtf8(utf8('é€ 😀'))).toBe('é€ 😀');
  });

  it('keeps a byte-order mark instead of swallowing it', () => {
    expect(fromUtf8(Uint8Array.of(0xef, 0xbb, 0xbf, 0x61))).toBe('﻿a');
  });

  it('answers null for bytes that are not text', () => {
    expect(fromUtf8(Uint8Array.of(0xff))).toBeNull();
    expect(fromUtf8(Uint8Array.of(0xc3))).toBeNull();
  });

  it('writes lowercase hex, two digits a byte', () => {
    expect(toHex(Uint8Array.of(0, 1, 0xab, 0xff))).toBe('0001abff');
    expect(toHex(new Uint8Array(0))).toBe('');
  });

  it('writes Base64 with padding and Base64URL without', () => {
    const cases: Array<[string, string, string]> = [
      ['', '', ''],
      ['f', 'Zg==', 'Zg'],
      ['fo', 'Zm8=', 'Zm8'],
      ['foo', 'Zm9v', 'Zm9v'],
      ['foob', 'Zm9vYg==', 'Zm9vYg'],
      ['>>>???', 'Pj4+Pz8/', 'Pj4-Pz8_'],
    ];
    for (const [text, padded, url] of cases) {
      expect(toBase64(utf8(text))).toBe(padded);
      expect(toBase64(utf8(text), true)).toBe(url);
    }
  });
});
