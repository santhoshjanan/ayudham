import { createHash, timingSafeEqual } from 'node:crypto';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

/**
 * Operational metrics, for a Prometheus server on a private network.
 *
 * The privacy rule here is the same as for `report(problem)`: nothing a person
 * typed, and nothing that identifies a room or a person, may appear. Every
 * series is an aggregate for the whole service. Every label value is chosen
 * from a fixed list in this file; a value that is not on its list is recorded
 * as "other", so no caller can turn a room code, a name or an address into a
 * label by mistake.
 *
 * Nothing here can break the app: each call is wrapped, and a failure is
 * swallowed and counted in `pokerji_metrics_errors_total`.
 */

const MESSAGE_TYPES = [
  'vote',
  'clearVote',
  'reveal',
  'newRound',
  'setTitle',
  'startTimer',
  'stopTimer',
  'setRole',
  'promote',
  'removeParticipant',
  'other',
] as const;
const REJECT_REASONS = ['rate_limited', 'oversize', 'invalid', 'other'] as const;
const CLOSE_REASONS = [
  'normal',
  'abnormal',
  'oversize',
  'rate_limited',
  'bad_message',
  'too_many_connections',
  'closed_by_server',
  'other',
] as const;
const UNLOAD_REASONS = ['idle', 'lock_lost', 'shutdown', 'other'] as const;
const REFUSAL_REASONS = [
  'bad_request',
  'auth',
  'rate_limited',
  'unavailable',
  'error',
  'other',
] as const;
/** The fixed first part of every rate-limit key the app builds. */
const BUCKETS = [
  'create',
  'create48',
  'join',
  'join48',
  'pass',
  'ws',
  'settings',
  'passcode',
  'recovery',
  'recover',
  'history',
  'anonymise',
  'other',
] as const;
const ROUTE_CLASSES = ['page', 'api', 'static', 'healthz'] as const;
const STATUS_CLASSES = ['1xx', '2xx', '3xx', '4xx', '5xx', 'other'] as const;

export type CloseReason = (typeof CLOSE_REASONS)[number];
export type RejectReason = (typeof REJECT_REASONS)[number];
export type UnloadReason = (typeof UNLOAD_REASONS)[number];
export type RefusalReason = (typeof REFUSAL_REASONS)[number];
export type RouteClass = (typeof ROUTE_CLASSES)[number];

/** The value if it is on the list, the fallback if it is anything else at all. */
const pick = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;

/**
 * Sorts a request into a coarse class. The path itself is never kept: room
 * codes are in paths.
 */
export function routeClass(method: unknown, url: unknown): RouteClass {
  const path = typeof url === 'string' ? (url.split('?')[0] ?? '') : '';
  if (path === '/healthz') return 'healthz';
  if (path.endsWith('/__data.json')) return 'api';
  if (path.startsWith('/_app/') || path.startsWith('/audio/') || /\.[a-z0-9]{2,5}$/i.test(path)) {
    return 'static';
  }
  return method === 'GET' || method === 'HEAD' ? 'page' : 'api';
}

/**
 * Whether a request may read the metrics. With no token configured, anyone who
 * can reach the port may. With one, the request must carry exactly it as a
 * bearer token; the comparison takes the same time whatever was sent.
 */
export function metricsAuthorized(header: string | undefined, token: string | undefined): boolean {
  if (!token) return true;
  const match = /^Bearer +(.+)$/i.exec(header ?? '');
  if (!match) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(match[1] ?? ''), digest(token));
}

const registry = new Registry();
const counter = (name: string, help: string, labelNames: string[] = []) =>
  new Counter({ name: `pokerji_${name}`, help, labelNames, registers: [registry] });
const gauge = (name: string, help: string, labelNames: string[] = []) =>
  new Gauge({ name: `pokerji_${name}`, help, labelNames, registers: [registry] });

const errors = counter('metrics_errors_total', 'Metric updates that failed and were ignored.');
const roomsActive = gauge('rooms_active', 'Rooms currently loaded in memory.');
const roomLoads = counter('room_loads_total', 'Rooms loaded into memory.');
const roomUnloads = counter('room_unloads_total', 'Rooms unloaded from memory.', ['reason']);
const sockets = gauge('websocket_connections', 'WebSocket connections currently open.');
const socketsTotal = counter('websocket_connections_total', 'WebSocket connections opened.');
const socketCloses = counter('websocket_closes_total', 'WebSocket connections closed.', ['reason']);
const upgradesRefused = counter(
  'websocket_upgrades_refused_total',
  'WebSocket upgrade requests refused before a connection was made.',
  ['reason'],
);
const messages = counter('websocket_messages_total', 'Messages accepted from browsers.', ['type']);
const messagesRejected = counter(
  'websocket_messages_rejected_total',
  'Messages from browsers refused before the room saw them.',
  ['reason'],
);
const rateLimitHits = counter('rate_limit_hits_total', 'Requests refused by a rate limit.', [
  'bucket',
]);
const rateLimitErrors = counter(
  'rate_limit_errors_total',
  'Rate-limit checks that could not reach Valkey and so refused.',
);
const lockWait = new Histogram({
  name: 'pokerji_room_lock_wait_seconds',
  help: 'Time spent asking Valkey for a room lock.',
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});
const lockFailures = counter(
  'room_lock_failures_total',
  'Room locks that could not be taken: held elsewhere, or Valkey failed.',
);
const lockLost = counter('room_lock_lost_total', 'Live rooms stopped because their lock was lost.');
const httpRequests = counter('http_requests_total', 'HTTP requests answered.', [
  'route_class',
  'status_class',
]);
const buildInfo = gauge('build_info', 'Always 1. The label carries the running version.', [
  'version',
]);

type Probe = () => Promise<unknown>;
const PROBE_EVERY_MS = 5_000;
const PROBE_TIMEOUT_MS = 1_000;
let probes: { valkey: Probe; postgres: Probe } | null = null;
let probedAt = -Infinity;
let probing: Promise<void> | null = null;
const valkeyUp = gauge('valkey_up', '1 if Valkey answered the last check, 0 if not.');
const postgresUp = gauge('postgres_up', '1 if Postgres answered the last check, 0 if not.');

/** 1 if the probe answers in time, 0 if it fails or does not answer. */
async function answers(probe: Probe): Promise<number> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('no answer')), PROBE_TIMEOUT_MS);
      }),
    ]);
    return 1;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

/** Asks both services, at most once every few seconds however often it is scraped. */
async function probe(): Promise<void> {
  if (!probes || Date.now() - probedAt < PROBE_EVERY_MS) return;
  probing ??= (async () => {
    try {
      const { valkey, postgres } = probes;
      const [kv, db] = await Promise.all([answers(valkey), answers(postgres)]);
      valkeyUp.set(kv);
      postgresUp.set(db);
      probedAt = Date.now();
    } finally {
      probing = null;
    }
  })();
  await probing;
}

/** Runs a metric update. A failure is counted and goes no further. */
function safe(update: () => void): void {
  try {
    update();
  } catch {
    try {
      errors.inc();
    } catch {
      // Counting the failure failed too. There is nothing left to do, and nothing to throw.
    }
  }
}

let defaultsStarted = false;

export const metrics = {
  roomLoaded: () =>
    safe(() => {
      roomLoads.inc();
      roomsActive.inc();
    }),
  roomUnloaded: (reason: unknown) =>
    safe(() => {
      roomUnloads.inc({ reason: pick(UNLOAD_REASONS, reason, 'other') });
      roomsActive.dec();
    }),
  socketOpened: () =>
    safe(() => {
      socketsTotal.inc();
      sockets.inc();
    }),
  socketClosed: (reason: unknown) =>
    safe(() => {
      socketCloses.inc({ reason: pick(CLOSE_REASONS, reason, 'other') });
      sockets.dec();
    }),
  upgradeRefused: (reason: unknown) =>
    safe(() => upgradesRefused.inc({ reason: pick(REFUSAL_REASONS, reason, 'other') })),
  messageReceived: (type: unknown) =>
    safe(() => messages.inc({ type: pick(MESSAGE_TYPES, type, 'other') })),
  messageRejected: (reason: unknown) =>
    safe(() => messagesRejected.inc({ reason: pick(REJECT_REASONS, reason, 'other') })),
  /** Takes the limiter's key and keeps only its fixed first part. */
  rateLimitHit: (key: unknown) =>
    safe(() => {
      const first = typeof key === 'string' ? key.split(':')[0] : undefined;
      rateLimitHits.inc({ bucket: pick(BUCKETS, first, 'other') });
    }),
  rateLimitError: () => safe(() => rateLimitErrors.inc()),
  lockWaited: (seconds: number) => safe(() => lockWait.observe(seconds)),
  lockFailed: () => safe(() => lockFailures.inc()),
  lockLost: () => safe(() => lockLost.inc()),
  httpRequest: (method: unknown, url: unknown, status: unknown) =>
    safe(() => {
      const code = typeof status === 'number' ? Math.floor(status / 100) : 0;
      httpRequests.inc({
        route_class: routeClass(method, url),
        status_class: pick(STATUS_CLASSES, `${code}xx`, 'other'),
      });
    }),

  /** The running version, if it looks like one. Anything else is "unknown". */
  setVersion: (version: unknown) =>
    safe(() => {
      const plain =
        typeof version === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(version);
      buildInfo.reset();
      buildInfo.set({ version: plain ? (version as string) : 'unknown' }, 1);
    }),
  /** How to ask whether Valkey and Postgres are there. Each must be cheap. */
  setProbes: (next: { valkey: Probe; postgres: Probe }) => {
    probes = next;
    probedAt = -Infinity;
  },
  /** Starts the standard Node process metrics (memory, event loop, GC, file handles). Once. */
  startDefaults: () =>
    safe(() => {
      if (defaultsStarted) return;
      defaultsStarted = true;
      collectDefaultMetrics({ register: registry });
    }),

  contentType: registry.contentType,
  /** The scrape body. Never throws: on failure it is empty. */
  render: async (): Promise<string> => {
    try {
      await probe();
      return await registry.metrics();
    } catch {
      safe(() => undefined);
      return '';
    }
  },
  /** Tests only: every value back to zero, and no probes. */
  reset: () => {
    registry.resetMetrics();
    probes = null;
    probedAt = -Infinity;
  },
};

export type Metrics = typeof metrics;
