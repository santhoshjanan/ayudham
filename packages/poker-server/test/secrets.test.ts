import * as secrets from '../src/index.ts';
import { describe, expect, it } from 'vitest';
import {
  addressKey,
  hashPasscode,
  hashToken,
  newRoomCode,
  newToken,
  passcodeMatches,
  ROOM_CODE_LENGTH,
  tokenMatches,
} from '../src/index.ts';

describe('room codes', () => {
  it('are 12 letters and digits', () => {
    expect(ROOM_CODE_LENGTH).toBe(12);
    for (let i = 0; i < 200; i += 1) expect(newRoomCode()).toMatch(/^[A-Za-z0-9]{12}$/);
  });

  it('do not repeat', () => {
    const codes = new Set(Array.from({ length: 2_000 }, newRoomCode));
    expect(codes.size).toBe(2_000);
  });
});

describe('tokens', () => {
  it('are 256 random bits, URL-safe, and do not repeat', () => {
    const tokens = new Set(Array.from({ length: 500 }, newToken));
    expect(tokens.size).toBe(500);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hash to 64 hex characters, the same every time', () => {
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('match only their own hash', () => {
    const token = newToken();
    expect(tokenMatches(token, hashToken(token))).toBe(true);
    expect(tokenMatches(newToken(), hashToken(token))).toBe(false);
    expect(tokenMatches(token, 'not-a-hash')).toBe(false);
    expect(tokenMatches(token, '')).toBe(false);
  });
});

describe('addressKey', () => {
  it('is stable for one secret, different for another, and does not contain the address', () => {
    const key = addressKey('secret-one', '203.0.113.9');
    expect(key).toBe(addressKey('secret-one', '203.0.113.9'));
    expect(key).not.toBe(addressKey('secret-two', '203.0.113.9'));
    expect(key).not.toBe(addressKey('secret-one', '203.0.113.10'));
    expect(key).not.toContain('203.0.113.9');
    expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});

describe('passcodes', () => {
  it('are stored as Argon2id hashes that verify', async () => {
    const stored = await hashPasscode('correct horse');
    expect(stored).toMatch(/^\$argon2id\$/);
    expect(stored).not.toContain('correct horse');
    expect(await passcodeMatches('correct horse', stored)).toBe(true);
    expect(await passcodeMatches('wrong horse', stored)).toBe(false);
  });

  it('do not match a stored value that is not a hash', async () => {
    expect(await passcodeMatches('anything', 'not-a-hash')).toBe(false);
  });
});

describe('Argon2 under load', () => {
  it('checks as many passcodes as may run or wait, and refuses the rest as wrong', async () => {
    const stored = await secrets.hashPasscode('correct horse');
    const room = secrets.ARGON2_CONCURRENT + secrets.ARGON2_WAITING;
    const results = await Promise.all(
      Array.from({ length: room + 12 }, () => secrets.passcodeMatches('correct horse', stored)),
    );
    expect(results.filter(Boolean)).toHaveLength(room);
    expect(results.slice(room)).toEqual(Array<boolean>(12).fill(false));
  }, 30_000);

  it('never refuses to hash a new passcode for load', async () => {
    const hashes = await Promise.all(
      Array.from({ length: secrets.ARGON2_CONCURRENT + secrets.ARGON2_WAITING + 5 }, () =>
        secrets.hashPasscode('x'.repeat(12)),
      ),
    );
    expect(hashes.every((value) => value.startsWith('$argon2id$'))).toBe(true);
  }, 30_000);
});
