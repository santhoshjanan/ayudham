import {
  deckSchema,
  MUSIC_TRACK_IDS,
  TIMER_MAX_SECONDS,
  TIMER_MIN_SECONDS,
  type Deck,
} from '@ayudham/protocol';
import { z } from 'zod';
import type { App } from './app.ts';
import {
  anonymiseSession,
  clearHistory,
  deleteRound,
  listRounds,
  type SavedRound,
} from './history.ts';
import { clearLimit, withinLimit, type Limit } from './limiter.ts';
import {
  deleteRoom,
  setPasscodeAndSignOut,
  setPasscodeHash,
  setRecoveryHash,
  swapRecoveryHash,
  updateRoomSettings,
  type RoomRow,
} from './rooms.ts';
import { hashPasscode, hashToken, newToken, tokenMatches } from './secrets.ts';
import { clearSessionModerator, listCoModerators, takeRoom, type SessionRow } from './sessions.ts';
import { passcodeSchema } from './validate.ts';

/**
 * Who is making a request: the room and session `resumeSession` found for it.
 * Always built from the current request, never from form data.
 */
export interface Actor {
  room: RoomRow;
  session: SessionRow;
}

export type FlowOutcome =
  { ok: true } | { ok: false; reason: 'invalid' | 'refused' | 'busy' | 'limited' };

const OK = { ok: true } as const;
const INVALID = { ok: false, reason: 'invalid' } as const;
/** The caller is not allowed to do this. */
const REFUSED = { ok: false, reason: 'refused' } as const;
/** The room is in a state that does not allow this right now. */
const BUSY = { ok: false, reason: 'busy' } as const;
/** Too many of these in a short time. */
const LIMITED = { ok: false, reason: 'limited' } as const;

/**
 * How often each kind of change may be made. Anyone can create a room and so
 * become a moderator, so these bound what one person can cost the service;
 * a passcode change in particular is a deliberately slow hash.
 */
const CHANGE_LIMITS = {
  settings: { max: 60, windowSeconds: 600 },
  passcode: { max: 5, windowSeconds: 600 },
  recovery: { max: 10, windowSeconds: 3_600 },
  history: { max: 120, windowSeconds: 600 },
  anonymise: { max: 20, windowSeconds: 600 },
  recover: { max: 30, windowSeconds: 600 },
} as const satisfies Record<string, Limit>;

const HISTORY_PAGE = 200;

const allowed = (app: App, key: string, limit: Limit) =>
  withinLimit(app.kv, key, limit, app.flows.keyPrefix);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const settingsSchema = z.object({
  deck: deckSchema,
  timerSeconds: z.number().int().min(TIMER_MIN_SECONDS).max(TIMER_MAX_SECONDS).nullable(),
  music: z
    .string()
    .refine((id) => MUSIC_TRACK_IDS.includes(id))
    .nullable(),
});

/** Reads a custom deck typed as text: cards separated by commas or spaces. */
export function parseDeckText(values: string, specials: string): Deck | null {
  const cards = (text: string) => text.split(/[\s,]+/u).filter((card) => card !== '');
  const parsed = deckSchema.safeParse({ values: cards(values), specials: cards(specials) });
  return parsed.success ? parsed.data : null;
}

export async function saveSettings(app: App, actor: Actor, input: unknown): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const { room } = actor;
  if (!(await allowed(app, `settings:${room.id}`, CHANGE_LIMITS.settings))) return LIMITED;

  // The live room goes first: it checks and applies in one step, so the stored
  // settings can never say one deck while the room plays another.
  const host = app.registry.get(room.id);
  if (host && !host.applySettings(parsed.data)) return BUSY;
  try {
    await updateRoomSettings(app.db, room.id, parsed.data);
  } catch (error) {
    host?.applySettings({ deck: room.deck, timerSeconds: room.timerSeconds, music: room.music });
    throw error;
  }
  return OK;
}

/** Sets or changes the passcode. Everyone except moderators is signed out and must rejoin with it. */
export async function setPasscode(app: App, actor: Actor, passcode: unknown): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
  const parsed = passcodeSchema.safeParse(passcode);
  if (!parsed.success) return INVALID;
  const { room } = actor;
  if (!(await allowed(app, `passcode:${room.id}`, CHANGE_LIMITS.passcode))) return LIMITED;

  const signedOut = await setPasscodeAndSignOut(app.db, room.id, await hashPasscode(parsed.data));
  const host = app.registry.get(room.id);
  host?.evict(signedOut);
  // And anyone connected whose stored session had already gone, so nobody outlasts the change.
  host?.evictAllButModerators();
  // Failed guesses at the old passcode no longer count against the room.
  await clearLimit(app.kv, `pass:${room.id}`, app.flows.keyPrefix);
  return OK;
}

export async function removePasscode(app: App, actor: Actor): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
  if (!(await allowed(app, `passcode:${actor.room.id}`, CHANGE_LIMITS.passcode))) return LIMITED;
  await setPasscodeHash(app.db, actor.room.id, null);
  await clearLimit(app.kv, `pass:${actor.room.id}`, app.flows.keyPrefix);
  return OK;
}

/** Issues a new recovery secret. The old link stops working. The secret is returned once. */
export async function regenerateRecovery(
  app: App,
  actor: Actor,
): Promise<{ ok: true; recoveryToken: string } | { ok: false; reason: 'refused' | 'limited' }> {
  // Owner only: a new link is a new way to take the room over.
  if (!actor.session.owner) return REFUSED;
  if (!(await allowed(app, `recovery:${actor.room.id}`, CHANGE_LIMITS.recovery))) return LIMITED;
  const recoveryToken = newToken();
  await setRecoveryHash(app.db, actor.room.id, hashToken(recoveryToken));
  return { ok: true, recoveryToken };
}

/**
 * Makes a joined person the room's owner if they hold the room's moderator
 * link secret. Whoever was the owner stays a moderator. The secret is replaced
 * every time it is used, and the new one returned once: a link that has been
 * used is spent, so a copy of it is worth nothing afterwards. Attempts are
 * limited per session, so one person's wrong guesses cannot block anyone else.
 */
export async function recoverModerator(
  app: App,
  input: { actor: Actor; recoveryToken: unknown },
): Promise<{ ok: true; recoveryToken: string } | { ok: false }> {
  const FAILED = { ok: false } as const;
  const { room, session } = input.actor;
  if (!(await allowed(app, `recover:${session.id}`, CHANGE_LIMITS.recover))) return FAILED;
  const token = input.recoveryToken;
  if (typeof token !== 'string' || token.length > 128) return FAILED;
  if (!tokenMatches(token, room.recoveryHash)) return FAILED;
  // Of two people using the link at the same moment, one finds it unspent and the other
  // is refused. Spending it and taking the room are one step, so nothing that fails
  // part-way can leave the link spent and shown to nobody.
  const recoveryToken = newToken();
  const next = hashToken(recoveryToken);
  if (session.owner) {
    if (!(await swapRecoveryHash(app.db, room.id, room.recoveryHash, next))) return FAILED;
  } else {
    if (!(await takeRoom(app.db, room.id, session.id, room.recoveryHash, next))) return FAILED;
    app.registry.get(room.id)?.transferOwnership(session.id);
  }
  return { ok: true, recoveryToken };
}

/** The moderators the owner may demote. Empty for anyone who is not the owner. */
export async function coModerators(
  app: App,
  actor: Actor,
): Promise<{ id: string; name: string }[]> {
  if (!actor.session.owner) return [];
  return listCoModerators(app.db, actor.room.id);
}

/**
 * Takes moderator rights away from someone. Owner only. It is stored first and
 * then shown in the live room, and it works whether or not that person is
 * connected: a moderator who has left the room can still act over HTTP.
 */
export async function demoteModerator(
  app: App,
  actor: Actor,
  sessionId: unknown,
): Promise<FlowOutcome> {
  if (!actor.session.owner) return REFUSED;
  if (typeof sessionId !== 'string' || !UUID.test(sessionId)) return INVALID;
  if (!(await allowed(app, `settings:${actor.room.id}`, CHANGE_LIMITS.settings))) return LIMITED;
  if (!(await clearSessionModerator(app.db, actor.room.id, sessionId))) return INVALID;
  app.registry.get(actor.room.id)?.revokeModerator(sessionId);
  return OK;
}

/** Deletes the room and everything in it, now. Live connections are closed first. */
export async function deleteRoomNow(app: App, actor: Actor): Promise<FlowOutcome> {
  // Owner only: deletion is immediate and cannot be undone.
  if (!actor.session.owner) return REFUSED;
  await app.registry.close(actor.room.id);
  await deleteRoom(app.db, actor.room.id);
  return OK;
}

/** Any member of the room may read its history: the newest rounds, up to a fixed number. */
export function roomHistory(app: App, actor: Actor): Promise<SavedRound[]> {
  return listRounds(app.db, actor.room.id, HISTORY_PAGE);
}

export async function deleteHistoryRound(
  app: App,
  actor: Actor,
  roundId: unknown,
): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
  if (typeof roundId !== 'string' || !UUID.test(roundId)) return INVALID;
  if (!(await allowed(app, `history:${actor.room.id}`, CHANGE_LIMITS.history))) return LIMITED;
  return (await deleteRound(app.db, actor.room.id, roundId)) ? OK : INVALID;
}

export async function clearRoomHistory(app: App, actor: Actor): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
  if (!(await allowed(app, `history:${actor.room.id}`, CHANGE_LIMITS.history))) return LIMITED;
  await clearHistory(app.db, actor.room.id);
  return OK;
}

/**
 * "Remove my name from history": clears the caller's name from their own votes
 * in this room. Returns how many votes changed, or null when asked too often.
 */
export async function anonymiseMe(app: App, actor: Actor): Promise<number | null> {
  if (!(await allowed(app, `anonymise:${actor.session.id}`, CHANGE_LIMITS.anonymise))) return null;
  return anonymiseSession(app.db, actor.room.id, actor.session.id);
}
