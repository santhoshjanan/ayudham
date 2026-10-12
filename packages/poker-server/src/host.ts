import {
  apply,
  canChangeDeck,
  createRoom,
  snapshotFor,
  type Command,
  type Effect,
  type Joiner,
  type RoomSettings,
  type RoomState,
} from '@pokerji/poker-engine';
import {
  ROOM_UNLOAD_MS,
  type ClientMessage,
  type Role,
  type ServerMessage,
} from '@pokerji/protocol';
import type { RoundToSave } from './history.ts';

const WRITE_RETRY_MS = 5_000;
/** Ten minutes of retries at WRITE_RETRY_MS. After that a write is abandoned and reported. */
const MAX_WRITE_ATTEMPTS = 120;
const MAX_QUEUED_WRITES = 200;

/** Tabs or devices one participant may have connected. A fifth closes the oldest. */
export const MAX_CONNECTIONS_PER_PARTICIPANT = 4;

/** Messages one participant may send per window, across all their connections. */
export const MESSAGE_LIMIT = { max: 30, windowMs: 10_000 };

export interface Connection {
  send(text: string): void;
  close(): void;
}

export interface HostStore {
  saveRound(round: RoundToSave): Promise<void>;
  setRole(sessionId: string, role: Role): Promise<void>;
  setModerator(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}

export interface HostDeps {
  store: HostStore;
  now: () => number;
  /** Generates the durable id for a saved round. */
  newId: () => string;
  /** Receives a fixed description of a problem. Never room content. */
  report: (problem: string) => void;
}

interface Write {
  run: () => Promise<void>;
  problem: string;
  /** Set for a round save, so the room can be told whether it is saved. */
  roundSeq: number | null;
  attempts: number;
}

/**
 * One live room. Owns the engine state, gives every connection its own
 * snapshot after each change, and carries out the engine's effects.
 * A participant's id is their session id.
 */
export class RoomHost {
  private state: RoomState;
  private readonly deps: HostDeps;
  private readonly connections = new Map<string, Set<Connection>>();
  private readonly budgets = new Map<string, { start: number; count: number }>();
  /** People removed or evicted while this host is live. They may not reconnect to it. */
  private readonly removed = new Set<string>();
  /** Writes to the store, in order. A failure is retried; nothing later overtakes it. */
  private readonly writes: Write[] = [];
  private writing = false;
  private nextWriteAt = 0;
  private emptySince: number | null;
  private closed = false;

  constructor(settings: RoomSettings, deps: HostDeps) {
    this.state = createRoom(settings);
    this.deps = deps;
    this.emptySince = deps.now();
  }

  connect(joiner: Joiner, connection: Connection): void {
    if (this.closed) {
      this.safely(() => connection.close());
      return;
    }
    if (this.removed.has(joiner.id)) {
      this.safely(() => connection.send(JSON.stringify({ type: 'removed' })));
      this.safely(() => connection.close());
      return;
    }
    const open = this.connections.get(joiner.id) ?? new Set<Connection>();
    open.add(connection);
    this.connections.set(joiner.id, open);
    if (open.size > MAX_CONNECTIONS_PER_PARTICIPANT) {
      const oldest = open.values().next().value as Connection;
      open.delete(oldest);
      this.safely(() => oldest.close());
    }
    this.emptySince = null;
    this.dispatch({ type: 'join', participant: joiner });
  }

  /** The engine hears of a disconnect only when the participant's last connection closes. */
  disconnect(id: string, connection: Connection): void {
    const open = this.connections.get(id);
    if (!open || !open.delete(connection) || open.size > 0) return;
    this.connections.delete(id);
    this.noteIfEmpty();
    this.dispatch({ type: 'disconnect', id });
  }

  /** Counts one message against the participant's budget and says whether it may proceed. */
  allowMessage(id: string): boolean {
    const now = this.deps.now();
    const budget = this.budgets.get(id);
    if (!budget || now - budget.start >= MESSAGE_LIMIT.windowMs) {
      this.budgets.set(id, { start: now, count: 1 });
      return true;
    }
    budget.count += 1;
    return budget.count <= MESSAGE_LIMIT.max;
  }

  receive(id: string, message: ClientMessage): void {
    if (this.closed) return;
    this.dispatch({ type: 'client', from: id, message });
  }

  applySettings(settings: RoomSettings): void {
    this.dispatch({ type: 'settings', settings });
  }

  /** Signs people out of the live room. The caller has already deleted their sessions. */
  evict(ids: readonly string[]): void {
    for (const id of ids) this.removed.add(id);
    this.dispatch({ type: 'evict', ids });
  }

  grantModerator(id: string): void {
    this.dispatch({ type: 'grantModerator', id });
  }

  canChangeDeck(): boolean {
    return canChangeDeck(this.state);
  }

  /** Call at least every 250 ms. Advances time-driven state and retries failed writes. */
  tick(): void {
    const now = this.deps.now();
    this.dispatch({ type: 'tick' });
    for (const [id, budget] of this.budgets) {
      if (now - budget.start >= MESSAGE_LIMIT.windowMs) this.budgets.delete(id);
    }
    if (this.writes.length > 0 && now >= this.nextWriteAt) void this.drainWrites();
  }

  shouldUnload(): boolean {
    return (
      this.emptySince !== null &&
      this.writes.length === 0 &&
      this.deps.now() - this.emptySince >= ROOM_UNLOAD_MS
    );
  }

  closeAll(): void {
    for (const id of [...this.connections.keys()]) this.drop(id);
  }

  /**
   * Ends this host for good: closes every connection, refuses new ones, and
   * makes one last attempt to store whatever is still queued.
   */
  async shutdown(): Promise<void> {
    this.closed = true;
    this.closeAll();
    this.nextWriteAt = 0;
    await this.drainWrites();
  }

  private dispatch(command: Command): void {
    const before = this.state;
    const outcome = apply(before, command, this.deps.now());
    this.state = outcome.state;
    if (this.state !== before) this.broadcast();
    for (const effect of outcome.effects) this.perform(effect);
  }

  private perform(effect: Effect): void {
    const store = this.deps.store;
    switch (effect.type) {
      case 'send':
        this.sendTo(effect.to, effect.message);
        return;
      case 'announce':
        for (const id of [...this.connections.keys()]) this.sendTo(id, effect.message);
        return;
      case 'close':
        this.drop(effect.id);
        return;
      case 'persistRound': {
        const round: RoundToSave = {
          id: this.deps.newId(),
          title: effect.title,
          votes: effect.votes.map((vote) => ({
            sessionId: vote.participantId,
            name: vote.name,
            card: vote.card,
          })),
        };
        this.enqueue(() => store.saveRound(round), 'save round', effect.seq);
        return;
      }
      case 'persistRole':
        this.enqueue(() => store.setRole(effect.id, effect.role), 'save role');
        return;
      case 'persistModerator':
        this.enqueue(() => store.setModerator(effect.id), 'save moderator');
        return;
      case 'deleteSession':
        this.removed.add(effect.id);
        this.enqueue(() => store.deleteSession(effect.id), 'delete session');
        return;
    }
  }

  private enqueue(run: () => Promise<void>, problem: string, roundSeq: number | null = null): void {
    if (this.writes.length >= MAX_QUEUED_WRITES) {
      this.deps.report('write queue full');
      if (roundSeq !== null) this.dispatch({ type: 'roundSaved', seq: roundSeq, ok: false });
      return;
    }
    this.writes.push({ run, problem, roundSeq, attempts: 0 });
    if (this.deps.now() >= this.nextWriteAt) {
      void this.drainWrites();
    } else if (roundSeq !== null) {
      // Queued behind a failing write: say so now rather than leave it looking in progress.
      this.dispatch({ type: 'roundSaved', seq: roundSeq, ok: false });
    }
  }

  /** Performs queued writes oldest first. A failure stops the drain; tick() retries later. */
  private async drainWrites(): Promise<void> {
    if (this.writing) return;
    this.writing = true;
    try {
      while (this.writes.length > 0) {
        const next = this.writes[0] as Write;
        try {
          await next.run();
        } catch {
          next.attempts += 1;
          this.deps.report(next.problem);
          if (next.attempts >= MAX_WRITE_ATTEMPTS) {
            this.writes.shift();
            this.deps.report('write abandoned');
            if (next.roundSeq !== null) {
              this.dispatch({ type: 'roundSaved', seq: next.roundSeq, ok: false });
            }
            continue;
          }
          this.nextWriteAt = this.deps.now() + WRITE_RETRY_MS;
          for (const queued of [...this.writes]) {
            if (queued.roundSeq !== null) {
              this.dispatch({ type: 'roundSaved', seq: queued.roundSeq, ok: false });
            }
          }
          return;
        }
        this.writes.shift();
        if (next.roundSeq !== null) {
          this.dispatch({ type: 'roundSaved', seq: next.roundSeq, ok: true });
        }
      }
    } finally {
      this.writing = false;
    }
  }

  private broadcast(): void {
    const now = this.deps.now();
    for (const id of [...this.connections.keys()]) {
      const room = snapshotFor(this.state, id, now);
      if (room) this.sendTo(id, { type: 'snapshot', room });
    }
  }

  private sendTo(id: string, message: ServerMessage): void {
    const text = JSON.stringify(message);
    for (const connection of this.connections.get(id) ?? []) {
      this.safely(() => connection.send(text));
    }
  }

  private drop(id: string): void {
    const open = this.connections.get(id);
    if (!open) return;
    this.connections.delete(id);
    for (const connection of open) this.safely(() => connection.close());
    this.noteIfEmpty();
  }

  private noteIfEmpty(): void {
    if (this.connections.size === 0 && this.emptySince === null) {
      this.emptySince = this.deps.now();
    }
  }

  private safely(action: () => void): void {
    try {
      action();
    } catch {
      this.deps.report('connection');
    }
  }
}
