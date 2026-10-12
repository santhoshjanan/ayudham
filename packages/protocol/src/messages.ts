import { z } from 'zod';
import { cardSchema, type Deck } from './deck.ts';
import { TITLE_MAX } from './limits.ts';

export const roleSchema = z.enum(['voter', 'spectator']);
export type Role = z.infer<typeof roleSchema>;

export type Phase = 'voting' | 'counting' | 'revealed';
export type SaveStatus = 'none' | 'pending' | 'saved' | 'failed';

const participantId = z.string().min(1).max(64);

/** One line of text: no control characters, direction overrides or unpaired surrogates. */
const TITLE_PATTERN = /^[^\p{Cc}\p{Cs}\u202a-\u202e\u2066-\u2069]*$/u;
const title = z.string().trim().max(TITLE_MAX).regex(TITLE_PATTERN);

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('vote'), card: cardSchema }),
  z.strictObject({ type: z.literal('clearVote') }),
  z.strictObject({ type: z.literal('setRole'), role: roleSchema }),
  z.strictObject({ type: z.literal('setTitle'), title }),
  z.strictObject({ type: z.literal('reveal') }),
  z.strictObject({ type: z.literal('newRound'), keepTitle: z.boolean() }),
  z.strictObject({ type: z.literal('startTimer') }),
  z.strictObject({ type: z.literal('stopTimer') }),
  z.strictObject({ type: z.literal('removeParticipant'), participantId }),
  z.strictObject({ type: z.literal('promote'), participantId }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** Returns the message, or null for anything that is not exactly a known message. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = clientMessageSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export interface RoundResult {
  /** Mean of the value cards voted, or null when any of them is not a number. */
  average: number | null;
  /** Lowest and highest value card voted, by deck order. Null when no value card was voted. */
  low: string | null;
  high: string | null;
  /** True when at least one value card was voted and all value cards voted are the same. */
  unanimous: boolean;
  /** Cards that received votes, in deck order, values before specials. */
  distribution: { card: string; count: number }[];
  /** Participants holding the low and high cards. Both empty when unanimous. */
  lowIds: string[];
  highIds: string[];
}

export interface ParticipantView {
  id: string;
  name: string;
  role: Role;
  moderator: boolean;
  present: boolean;
  hasVoted: boolean;
  /** Always null before the revealed phase. */
  vote: string | null;
}

export interface RoomSnapshot {
  /** Server time in epoch milliseconds when this snapshot was built. */
  serverNow: number;
  you: { id: string; name: string; role: Role; moderator: boolean; vote: string | null };
  title: string;
  deck: Deck;
  phase: Phase;
  /** Counts up by one with each new round, so a page can tell a new round from an update. */
  round: number;
  /** Epoch milliseconds when the count ends; set only while counting. */
  revealAt: number | null;
  timer: { seconds: number | null; endsAt: number | null };
  music: string | null;
  participants: ParticipantView[];
  /** Null before the revealed phase. */
  result: RoundResult | null;
  saveStatus: SaveStatus;
}

export type ErrorCode = 'invalid' | 'forbidden' | 'rate_limited' | 'room_full';

export type ServerMessage =
  | { type: 'snapshot'; room: RoomSnapshot }
  | { type: 'timerExpired' }
  | { type: 'removed' }
  | { type: 'error'; code: ErrorCode };
