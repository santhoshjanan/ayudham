import { randomUUID } from 'node:crypto';
import type { Config } from './config.ts';
import { createPool, type Db } from './db.ts';
import type { FlowDeps } from './flows.ts';
import { saveRound } from './history.ts';
import { RoomHost, type HostStore } from './host.ts';
import { createKv, type Kv } from './kv.ts';
import { migrate } from './migrate.ts';
import { RoomRegistry } from './registry.ts';
import { deleteInactiveRooms } from './rooms.ts';
import { deleteSession, setSessionModerator, setSessionRole } from './sessions.ts';

const SWEEP_MS = 250;
const RETENTION_MS = 60 * 60 * 1_000;

export interface AppOptions {
  /** Receives fixed descriptions of problems. Defaults to one JSON line on stderr. */
  report?: (problem: string) => void;
  /** Confines the database to one Postgres schema. Tests use it. */
  schema?: string;
  migrationsDir?: string;
}

export interface App {
  db: Db;
  kv: Kv;
  registry: RoomRegistry;
  flows: FlowDeps;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** The store a room host writes through, bound to its own room. */
export function hostStore(db: Db, roomId: string): HostStore {
  return {
    saveRound: (round) => saveRound(db, roomId, round),
    setRole: async (sessionId, role) => {
      await setSessionRole(db, roomId, sessionId, role);
    },
    setModerator: async (sessionId) => {
      await setSessionModerator(db, roomId, sessionId);
    },
    deleteSession: async (sessionId) => {
      await deleteSession(db, roomId, sessionId);
    },
  };
}

/** Wires the pieces into one object. Nothing connects or runs until start(). */
export function createApp(config: Config, options: AppOptions = {}): App {
  const report =
    options.report ??
    ((problem: string) => console.error(JSON.stringify({ level: 'error', problem })));
  const db = createPool(config.databaseUrl, options.schema);
  const kv = createKv(config.valkeyUrl);
  const registry = new RoomRegistry({
    kv,
    owner: randomUUID(),
    now: Date.now,
    lockPrefix: config.keyPrefix,
    makeHost: (room) =>
      new RoomHost(
        { deck: room.deck, timerSeconds: room.timerSeconds, music: room.music },
        { store: hostStore(db, room.id), now: Date.now, newId: randomUUID, report },
      ),
  });

  let timers: NodeJS.Timeout[] = [];
  const retain = () =>
    deleteInactiveRooms(db, config.retentionDays).then(
      () => undefined,
      () => report('retention'),
    );

  return {
    db,
    kv,
    registry,
    flows: { db, kv, addressSecret: config.addressHmacSecret, keyPrefix: config.keyPrefix },
    async start() {
      await migrate(db, options.migrationsDir);
      await retain();
      timers = [
        // Not awaited: a slow sweep must never delay the next tick.
        setInterval(() => {
          registry.sweep().catch(() => report('sweep'));
        }, SWEEP_MS),
        setInterval(() => {
          void retain();
        }, RETENTION_MS),
      ];
      for (const timer of timers) timer.unref();
    },
    async stop() {
      for (const timer of timers) clearInterval(timer);
      timers = [];
      await registry.closeEverything();
      await db.end();
      kv.disconnect();
    },
  };
}
