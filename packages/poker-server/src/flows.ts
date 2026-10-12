import { BUILT_IN_DECKS, NAME_MAX, PASSCODE_MAX, roleSchema } from '@pokerji/protocol';
import type { Db } from './db.ts';
import { KEY_PREFIX, type Kv } from './kv.ts';
import { LIMITS, overLimit, withinLimit } from './limiter.ts';
import { findRoomByCode, insertRoom, touchRoom, type RoomRow } from './rooms.ts';
import {
  addressKey,
  hashPasscode,
  hashToken,
  newRoomCode,
  newToken,
  passcodeMatches,
} from './secrets.ts';
import {
  countSessions,
  deleteStalestSession,
  findSession,
  insertJoiningSession,
  insertSession,
  sessionNames,
  type SessionRow,
} from './sessions.ts';
import { deckIdSchema, nameSchema, normaliseAddress, roomCodeSchema } from './validate.ts';

export interface FlowDeps {
  db: Db;
  kv: Kv;
  /** Keys the HMAC that turns a client address into a rate-limit key. */
  addressSecret: string;
  keyPrefix?: string;
  /** Sessions one room may hold. Bounds what a single link can make the database store. */
  maxSessionsPerRoom?: number;
}

const DEFAULT_MAX_SESSIONS = 200;
const INVALID = { ok: false, reason: 'invalid' } as const;
/** One answer for every reason a request is turned away, so nothing can be inferred from it. */
const REFUSED = { ok: false, reason: 'refused' } as const;

const clientKey = (deps: FlowDeps, address: string) =>
  addressKey(deps.addressSecret, normaliseAddress(address));

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';

let dummyHash: Promise<string> | undefined;
/** A real Argon2 hash that no passcode matches, verified against when there is nothing else to check. */
const dummy = () => (dummyHash ??= hashPasscode('pokerji: there is no such passcode'));

/**
 * The name to store: the one asked for, or that name with a number when someone
 * in the room already has it. Compared without regard to case, so nobody can
 * pose as a colleague by re-using their name.
 */
function distinctName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n += 1) {
    const suffix = ` ${n}`;
    const candidate = `${name.slice(0, NAME_MAX - suffix.length)}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export type CreateResult =
  | { ok: true; code: string; sessionToken: string; recoveryToken: string }
  | { ok: false; reason: 'invalid' | 'refused' };

export async function createRoomFlow(
  deps: FlowDeps,
  input: { address: string; name: unknown; deckId: unknown },
): Promise<CreateResult> {
  const name = nameSchema.safeParse(input.name);
  const deckId = deckIdSchema.safeParse(input.deckId);
  if (!name.success || !deckId.success) return INVALID;

  const prefix = deps.keyPrefix ?? KEY_PREFIX;
  const client = clientKey(deps, input.address);
  if (!(await withinLimit(deps.kv, `create:${client}`, LIMITS.roomCreate, prefix))) return REFUSED;

  const recoveryToken = newToken();
  let room: RoomRow | undefined;
  for (let attempt = 0; attempt < 3 && !room; attempt += 1) {
    try {
      room = await insertRoom(deps.db, {
        code: newRoomCode(),
        deck: BUILT_IN_DECKS[deckId.data].deck,
        recoveryHash: hashToken(recoveryToken),
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  if (!room) return REFUSED;

  const sessionToken = newToken();
  await insertSession(deps.db, {
    roomId: room.id,
    tokenHash: hashToken(sessionToken),
    name: name.data,
    role: 'voter',
    moderator: true,
  });
  return { ok: true, code: room.code, sessionToken, recoveryToken };
}

export type JoinResult =
  { ok: true; sessionToken: string } | { ok: false; reason: 'invalid' | 'refused' };

export async function joinRoomFlow(
  deps: FlowDeps,
  input: { address: string; code: unknown; name: unknown; role: unknown; passcode: unknown },
): Promise<JoinResult> {
  const name = nameSchema.safeParse(input.name);
  const role = roleSchema.safeParse(input.role);
  if (!name.success || !role.success) return INVALID;

  const prefix = deps.keyPrefix ?? KEY_PREFIX;
  const client = clientKey(deps, input.address);
  if (!(await withinLimit(deps.kv, `join:${client}`, LIMITS.join, prefix))) return REFUSED;

  const code = roomCodeSchema.safeParse(input.code);
  const room = code.success ? await findRoomByCode(deps.db, code.data) : null;
  const passcode = typeof input.passcode === 'string' ? input.passcode.slice(0, PASSCODE_MAX) : '';

  // Exactly one Argon2 verification on every path, so timing does not reveal
  // whether the room exists or has a passcode.
  const matches = await passcodeMatches(passcode, room?.passcodeHash ?? (await dummy()));

  let admitted = room !== null && room.passcodeHash === null;
  if (room && room.passcodeHash !== null) {
    const perClient = `pass:${room.id}:${client}`;
    const perRoom = `pass:${room.id}`;
    const locked =
      (await overLimit(deps.kv, perClient, LIMITS.passcodeClient, prefix)) ||
      (await overLimit(deps.kv, perRoom, LIMITS.passcodeRoom, prefix));
    admitted = matches && !locked;
    if (!matches && !locked) {
      // Only failures count, so the right passcode never locks its owner out.
      await withinLimit(deps.kv, perClient, LIMITS.passcodeClient, prefix);
      await withinLimit(deps.kv, perRoom, LIMITS.passcodeRoom, prefix);
    }
  }
  if (!room || !admitted) return REFUSED;

  // A full room makes space by signing out whoever was seen longest ago, so a
  // room cannot be filled for good with sessions nobody uses. Moderators are kept.
  const limit = deps.maxSessionsPerRoom ?? DEFAULT_MAX_SESSIONS;
  const full = (await countSessions(deps.db, room.id)) >= limit;
  if (full && !(await deleteStalestSession(deps.db, room.id))) return REFUSED;

  // The name index can still refuse a name two people asked for at the same
  // instant; the next attempt sees the other one and picks the next number.
  const sessionToken = newToken();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const taken = new Set((await sessionNames(deps.db, room.id)).map((n) => n.toLowerCase()));
    try {
      const session = await insertJoiningSession(
        deps.db,
        {
          roomId: room.id,
          tokenHash: hashToken(sessionToken),
          name: distinctName(name.data, taken),
          role: role.data,
        },
        room.passcodeHash,
      );
      // The passcode changed while this join was being checked.
      if (!session) return REFUSED;
      await touchRoom(deps.db, room.id);
      return { ok: true, sessionToken };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return REFUSED;
}

/** Resolves a room code and a session cookie value to a room and a session, or nothing. */
export async function resumeSession(
  deps: { db: Db },
  input: { code: unknown; token: unknown },
): Promise<{ room: RoomRow; session: SessionRow } | null> {
  const code = roomCodeSchema.safeParse(input.code);
  if (!code.success || typeof input.token !== 'string' || input.token.length > 128) return null;
  const room = await findRoomByCode(deps.db, code.data);
  if (!room) return null;
  const session = await findSession(deps.db, room.id, hashToken(input.token));
  return session ? { room, session } : null;
}
