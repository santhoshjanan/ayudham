import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const ROOM_CODE_LENGTH = 12;

/** A room's public link code: 12 characters, about 71 bits, from the system CSPRNG. */
export function newRoomCode(): string {
  return Array.from(
    { length: ROOM_CODE_LENGTH },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join('');
}

/** A 256-bit secret for a session cookie or a moderator recovery link. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens are high-entropy, so a plain SHA-256 is the right storage hash. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Turns a client address into an opaque rate-limit key. The address itself is never stored. */
export function addressKey(secret: string, address: string): string {
  return createHmac('sha256', secret).update(address).digest('base64url').slice(0, 22);
}

/** Passcodes are chosen by people, so they get a slow, salted hash: Argon2id. */
export function hashPasscode(passcode: string): Promise<string> {
  return hash(passcode);
}

export async function passcodeMatches(passcode: string, stored: string): Promise<boolean> {
  try {
    return await verify(stored, passcode);
  } catch {
    return false;
  }
}
