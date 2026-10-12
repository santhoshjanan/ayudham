import type {
  ClientMessage,
  Deck,
  Phase,
  Role,
  RoundResult,
  SaveStatus,
  ServerMessage,
} from '@pokerji/protocol';

export interface Participant {
  id: string;
  name: string;
  role: Role;
  moderator: boolean;
  present: boolean;
  /** Epoch milliseconds when the last connection closed; null while present. */
  awaySince: number | null;
  vote: string | null;
}

export interface RoomSettings {
  deck: Deck;
  timerSeconds: number | null;
  music: string | null;
}

export interface RoomState extends RoomSettings {
  title: string;
  phase: Phase;
  revealAt: number | null;
  timerEndsAt: number | null;
  /** Increases by one with every new round. Identifies a round to the host. */
  roundSeq: number;
  result: RoundResult | null;
  saveStatus: SaveStatus;
  participants: readonly Participant[];
}

export interface Joiner {
  id: string;
  name: string;
  role: Role;
  moderator: boolean;
}

export type Command =
  | { type: 'join'; participant: Joiner }
  | { type: 'disconnect'; id: string }
  | { type: 'tick' }
  | { type: 'client'; from: string; message: ClientMessage }
  | { type: 'settings'; settings: RoomSettings }
  | { type: 'evict'; ids: readonly string[] }
  | { type: 'grantModerator'; id: string }
  | { type: 'roundSaved'; seq: number; ok: boolean };

export type Effect =
  | { type: 'send'; to: string; message: ServerMessage }
  | { type: 'announce'; message: ServerMessage }
  | { type: 'close'; id: string }
  | {
      type: 'persistRound';
      seq: number;
      title: string;
      votes: { participantId: string; name: string; card: string }[];
    }
  | { type: 'persistRole'; id: string; role: Role }
  | { type: 'persistModerator'; id: string }
  | { type: 'deleteSession'; id: string };

export interface Outcome {
  state: RoomState;
  effects: Effect[];
}

export function createRoom(settings: RoomSettings): RoomState {
  return {
    deck: settings.deck,
    timerSeconds: settings.timerSeconds,
    music: settings.music,
    title: '',
    phase: 'voting',
    revealAt: null,
    timerEndsAt: null,
    roundSeq: 1,
    result: null,
    saveStatus: 'none',
    participants: [],
  };
}
