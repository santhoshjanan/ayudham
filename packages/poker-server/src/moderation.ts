import {
  deckSchema,
  MUSIC_TRACK_IDS,
  TIMER_MAX_SECONDS,
  TIMER_MIN_SECONDS,
  type Deck,
} from '@pokerji/protocol';
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
  updateRoomSettings,
  type RoomRow,
} from './rooms.ts';
import { hashPasscode, hashToken, newToken, tokenMatches } from './secrets.ts';
import { transferOwnership, type SessionRow } from './sessions.ts';
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
  app.registry.get(room.id)?.evict(signedOut);
  // Failed guesses at the old passcode no longer count against the room.
  await clearLimit(app.kv, `pass:${room.id}`, app.flows.keyPrefix);
  return OK;
}

export async function removePasscode(app: App, actor: Actor): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
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
 * Makes a joined person the room's owner if they hold the room's recovery
 * secret. Whoever was the owner stays a moderator. Attempts are limited per
 * session, so one person's wrong guesses cannot block anyone else.
 */
export async function recoverModerator(
  app: App,
  input: { actor: Actor; recoveryToken: unknown },
): Promise<boolean> {
  const { room, session } = input.actor;
  if (!(await allowed(app, `recover:${session.id}`, CHANGE_LIMITS.recover))) return false;
  const token = input.recoveryToken;
  if (typeof token !== 'string' || token.length > 128) return false;
  if (!tokenMatches(token, room.recoveryHash)) return false;
  if (!session.owner) {
    if (!(await transferOwnership(app.db, room.id, session.id))) return false;
    app.registry.get(room.id)?.transferOwnership(session.id);
  }
  return true;
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
