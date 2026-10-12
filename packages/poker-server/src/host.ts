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

const SAVE_RETRY_MS = 5_000;

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

/**
 * One live room. Owns the engine state, gives every connection its own
 * snapshot after each change, and carries out the engine's effects.
 * A participant's id is their session id.
 */
export class RoomHost {
  private state: RoomState;
  private readonly deps: HostDeps;
  private readonly connections = new Map<string, Set<Connection>>();
  private readonly saveQueue: { seq: number; round: RoundToSave }[] = [];
  private saving = false;
  private nextSaveAt = 0;
  private emptySince: number | null;

  constructor(settings: RoomSettings, deps: HostDeps) {
    this.state = createRoom(settings);
    this.deps = deps;
    this.emptySince = deps.now();
  }

  connect(joiner: Joiner, connection: Connection): void {
    const open = this.connections.get(joiner.id) ?? new Set<Connection>();
    open.add(connection);
    this.connections.set(joiner.id, open);
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

  receive(id: string, message: ClientMessage): void {
    this.dispatch({ type: 'client', from: id, message });
  }

  applySettings(settings: RoomSettings): void {
    this.dispatch({ type: 'settings', settings });
  }

  evict(ids: readonly string[]): void {
    this.dispatch({ type: 'evict', ids });
  }

  grantModerator(id: string): void {
    this.dispatch({ type: 'grantModerator', id });
  }

  canChangeDeck(): boolean {
    return canChangeDeck(this.state);
  }

  /** Call at least every 250 ms. Advances time-driven state and retries failed saves. */
  tick(): void {
    this.dispatch({ type: 'tick' });
    if (this.saveQueue.length > 0 && !this.saving && this.deps.now() >= this.nextSaveAt) {
      void this.drainSaves();
    }
  }

  shouldUnload(): boolean {
    return (
      this.emptySince !== null &&
      this.saveQueue.length === 0 &&
      this.deps.now() - this.emptySince >= ROOM_UNLOAD_MS
    );
  }

  closeAll(): void {
    for (const id of [...this.connections.keys()]) this.drop(id);
  }

  private dispatch(command: Command): void {
    const before = this.state;
    const outcome = apply(before, command, this.deps.now());
    this.state = outcome.state;
    if (this.state !== before) this.broadcast();
    for (const effect of outcome.effects) this.perform(effect);
  }

  private perform(effect: Effect): void {
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
      case 'persistRound':
        this.saveQueue.push({
          seq: effect.seq,
          round: {
            id: this.deps.newId(),
            title: effect.title,
            votes: effect.votes.map((vote) => ({
              sessionId: vote.participantId,
              name: vote.name,
              card: vote.card,
            })),
          },
        });
        void this.drainSaves();
        return;
      case 'persistRole':
        this.inBackground(this.deps.store.setRole(effect.id, effect.role), 'save role');
        return;
      case 'persistModerator':
        this.inBackground(this.deps.store.setModerator(effect.id), 'save moderator');
        return;
      case 'deleteSession':
        this.inBackground(this.deps.store.deleteSession(effect.id), 'delete session');
        return;
    }
  }

  /** Saves queued rounds oldest first. A failure stops the drain; tick() retries later. */
  private async drainSaves(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try {
      while (this.saveQueue.length > 0) {
        const next = this.saveQueue[0] as { seq: number; round: RoundToSave };
        try {
          await this.deps.store.saveRound(next.round);
        } catch {
          this.deps.report('save round');
          this.nextSaveAt = this.deps.now() + SAVE_RETRY_MS;
          this.dispatch({ type: 'roundSaved', seq: next.seq, ok: false });
          return;
        }
        this.saveQueue.shift();
        this.dispatch({ type: 'roundSaved', seq: next.seq, ok: true });
      }
    } finally {
      this.saving = false;
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

  private inBackground(work: Promise<void>, problem: string): void {
    work.catch(() => this.deps.report(problem));
  }
}
