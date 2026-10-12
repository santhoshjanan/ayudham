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
import { LIMITS, withinLimit } from './limiter.ts';
import {
  deleteRoom,
  setPasscodeHash,
  setRecoveryHash,
  updateRoomSettings,
  type RoomRow,
} from './rooms.ts';
import { addressKey, hashPasscode, hashToken, newToken, tokenMatches } from './secrets.ts';
import { deleteNonModeratorSessions, setSessionModerator, type SessionRow } from './sessions.ts';
import { normaliseAddress, passcodeSchema } from './validate.ts';

/**
 * Who is making a request: the room and session `resumeSession` found for it.
 * Always built from the current request, never from form data.
 */
export interface Actor {
  room: RoomRow;
  session: SessionRow;
}

export type FlowOutcome = { ok: true } | { ok: false; reason: 'invalid' | 'refused' | 'busy' };

const OK = { ok: true } as const;
const INVALID = { ok: false, reason: 'invalid' } as const;
/** The caller is not allowed to do this. */
const REFUSED = { ok: false, reason: 'refused' } as const;
/** The room is in a state that does not allow this right now. */
const BUSY = { ok: false, reason: 'busy' } as const;

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

  const host = app.registry.get(actor.room.id);
  const deckChanged = JSON.stringify(parsed.data.deck) !== JSON.stringify(actor.room.deck);
  // Checked before saving, so the stored settings and the live room never disagree.
  if (deckChanged && host && !host.canChangeDeck()) return BUSY;

  await updateRoomSettings(app.db, actor.room.id, parsed.data);
  host?.applySettings(parsed.data);
  return OK;
}

/** Sets or changes the passcode. Everyone except moderators is signed out and must rejoin with it. */
export async function setPasscode(app: App, actor: Actor, passcode: unknown): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
  const parsed = passcodeSchema.safeParse(passcode);
  if (!parsed.success) return INVALID;

  await setPasscodeHash(app.db, actor.room.id, await hashPasscode(parsed.data));
  const signedOut = await deleteNonModeratorSessions(app.db, actor.room.id);
  app.registry.get(actor.room.id)?.evict(signedOut);
  return OK;
}

export async function removePasscode(app: App, actor: Actor): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
  await setPasscodeHash(app.db, actor.room.id, null);
  return OK;
}

/** Issues a new recovery secret. The old link stops working. The secret is returned once. */
export async function regenerateRecovery(
  app: App,
  actor: Actor,
): Promise<{ ok: true; recoveryToken: string } | { ok: false; reason: 'refused' }> {
  if (!actor.session.moderator) return REFUSED;
  const recoveryToken = newToken();
  await setRecoveryHash(app.db, actor.room.id, hashToken(recoveryToken));
  return { ok: true, recoveryToken };
}

/** Makes a joined person a moderator if they hold the room's recovery secret. */
export async function recoverModerator(
  app: App,
  input: { address: string; actor: Actor; recoveryToken: unknown },
): Promise<boolean> {
  const client = addressKey(app.flows.addressSecret, normaliseAddress(input.address));
  if (!(await withinLimit(app.kv, `recover:${client}`, LIMITS.join, app.flows.keyPrefix))) {
    return false;
  }
  const { room, session } = input.actor;
  const token = input.recoveryToken;
  if (typeof token !== 'string' || token.length > 128) return false;
  if (!tokenMatches(token, room.recoveryHash)) return false;
  if (!session.moderator) {
    await setSessionModerator(app.db, room.id, session.id);
    app.registry.get(room.id)?.grantModerator(session.id);
  }
  return true;
}

/** Deletes the room and everything in it, now. Live connections are closed first. */
export async function deleteRoomNow(app: App, actor: Actor): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
  await app.registry.close(actor.room.id);
  await deleteRoom(app.db, actor.room.id);
  return OK;
}

/** Any member of the room may read its history. */
export function roomHistory(app: App, actor: Actor): Promise<SavedRound[]> {
  return listRounds(app.db, actor.room.id);
}

export async function deleteHistoryRound(
  app: App,
  actor: Actor,
  roundId: unknown,
): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
  if (typeof roundId !== 'string' || !UUID.test(roundId)) return INVALID;
  return (await deleteRound(app.db, actor.room.id, roundId)) ? OK : INVALID;
}

export async function clearRoomHistory(app: App, actor: Actor): Promise<FlowOutcome> {
  if (!actor.session.moderator) return REFUSED;
  await clearHistory(app.db, actor.room.id);
  return OK;
}

/** "Remove my name from history": clears the caller's name from their own votes in this room. */
export function anonymiseMe(app: App, actor: Actor): Promise<number> {
  return anonymiseSession(app.db, actor.room.id, actor.session.id);
}
