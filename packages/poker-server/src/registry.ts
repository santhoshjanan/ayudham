import type { RoomHost } from './host.ts';
import { KEY_PREFIX, type Kv } from './kv.ts';
import { acquireRoomLock, type RoomLock } from './lock.ts';
import type { RoomRow } from './rooms.ts';

export interface RegistryDeps {
  kv: Kv;
  /** Identifies this server instance to the lock. */
  owner: string;
  now: () => number;
  makeHost: (room: RoomRow) => RoomHost;
  lockTtlMs?: number;
  lockPrefix?: string;
}

interface LiveRoom {
  host: RoomHost;
  lock: RoomLock;
  refreshedAt: number;
}

/**
 * The live rooms on this instance. A room is loaded under a Valkey lock, so
 * only one instance is ever its authority, and unloaded once it has been idle.
 */
export class RoomRegistry {
  private readonly deps: RegistryDeps;
  private readonly ttlMs: number;
  private readonly live = new Map<string, LiveRoom>();
  private readonly opening = new Map<string, Promise<RoomHost | null>>();
  private sweeping = false;

  constructor(deps: RegistryDeps) {
    this.deps = deps;
    this.ttlMs = deps.lockTtlMs ?? 15_000;
  }

  get(roomId: string): RoomHost | undefined {
    return this.live.get(roomId)?.host;
  }

  /** The host for a room, loading it if needed. Null when another instance holds the room. */
  open(room: RoomRow): Promise<RoomHost | null> {
    const existing = this.live.get(room.id);
    if (existing) return Promise.resolve(existing.host);
    const pending = this.opening.get(room.id);
    if (pending) return pending;
    const attempt = this.load(room).finally(() => this.opening.delete(room.id));
    this.opening.set(room.id, attempt);
    return attempt;
  }

  /**
   * Call at least every 250 ms. Every host is ticked first and synchronously,
   * so a slow Valkey can never delay a reveal or a timer. Lock upkeep and
   * unloading then run concurrently, and never overlap with a previous sweep.
   */
  async sweep(): Promise<void> {
    for (const entry of [...this.live.values()]) {
      try {
        entry.host.tick();
      } catch {
        // One room failing must not stop the others being ticked.
      }
    }
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const now = this.deps.now();
      await Promise.all([...this.live].map(([roomId, entry]) => this.upkeep(roomId, entry, now)));
    } finally {
      this.sweeping = false;
    }
  }

  async close(roomId: string): Promise<void> {
    const entry = this.live.get(roomId);
    if (!entry) return;
    this.live.delete(roomId);
    await entry.host.shutdown();
    await entry.lock.release().catch(() => undefined);
  }

  async closeEverything(): Promise<void> {
    await Promise.all([...this.live.keys()].map((roomId) => this.close(roomId)));
  }

  private async upkeep(roomId: string, entry: LiveRoom, now: number): Promise<void> {
    if (entry.host.shouldUnload()) {
      this.live.delete(roomId);
      await entry.host.shutdown();
      await entry.lock.release().catch(() => undefined);
      return;
    }
    if (now - entry.refreshedAt < this.ttlMs / 3) return;
    entry.refreshedAt = now;
    // If Valkey cannot be reached the room keeps running; only a lost lock stops it.
    const held = await entry.lock.refresh().catch(() => true);
    // The entry may have been closed or replaced while we waited.
    if (!held && this.live.get(roomId) === entry) {
      this.live.delete(roomId);
      await entry.host.shutdown();
    }
  }

  private async load(room: RoomRow): Promise<RoomHost | null> {
    const lock = await acquireRoomLock(
      this.deps.kv,
      room.id,
      this.deps.owner,
      this.ttlMs,
      this.deps.lockPrefix ?? KEY_PREFIX,
    );
    if (!lock) return null;
    try {
      const host = this.deps.makeHost(room);
      this.live.set(room.id, { host, lock, refreshedAt: this.deps.now() });
      return host;
    } catch (error) {
      await lock.release().catch(() => undefined);
      throw error;
    }
  }
}
