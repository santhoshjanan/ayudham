import { beforeEach, describe, expect, it } from 'vitest';
import { metrics, metricsAuthorized, routeClass } from '../src/index.ts';

beforeEach(() => metrics.reset());

/** The value of one sample line, such as `name{label="x"}`. */
const sample = async (line: string) => {
  const text = await metrics.render();
  const found = text.split('\n').find((entry) => entry.startsWith(`${line} `));
  return found === undefined ? undefined : Number(found.slice(line.length + 1));
};

describe('metrics', () => {
  it('counts rooms loaded and unloaded, and how many are live', async () => {
    metrics.roomLoaded();
    metrics.roomLoaded();
    metrics.roomUnloaded('idle');
    expect(await sample('pokerji_rooms_active')).toBe(1);
    expect(await sample('pokerji_room_loads_total')).toBe(2);
    expect(await sample('pokerji_room_unloads_total{reason="idle"}')).toBe(1);
  });

  it('counts connections, and why each one closed', async () => {
    metrics.socketOpened();
    metrics.socketOpened();
    metrics.socketClosed('rate_limited');
    expect(await sample('pokerji_websocket_connections')).toBe(1);
    expect(await sample('pokerji_websocket_connections_total')).toBe(2);
    expect(await sample('pokerji_websocket_closes_total{reason="rate_limited"}')).toBe(1);
  });

  it('counts messages by type, rejected ones by reason, and refused upgrades', async () => {
    metrics.messageReceived('vote');
    metrics.messageReceived('vote');
    metrics.messageRejected('oversize');
    metrics.upgradeRefused('auth');
    expect(await sample('pokerji_websocket_messages_total{type="vote"}')).toBe(2);
    expect(await sample('pokerji_websocket_messages_rejected_total{reason="oversize"}')).toBe(1);
    expect(await sample('pokerji_websocket_upgrades_refused_total{reason="auth"}')).toBe(1);
  });

  it('never lets a value that is not on the fixed list become a label', async () => {
    const secret = 'ROOMCODE1234';
    metrics.messageReceived(`vote ${secret}`);
    metrics.messageRejected(secret);
    metrics.socketClosed(secret);
    metrics.roomUnloaded(secret);
    metrics.upgradeRefused(secret);
    metrics.rateLimitHit(`${secret}:abc`);
    metrics.httpRequest('GET', `/poker/r/${secret}`, 200);
    metrics.httpRequest(secret, `/${secret}`, 999);
    const text = await metrics.render();
    expect(text).not.toContain(secret);
    expect(await sample('pokerji_websocket_messages_total{type="other"}')).toBe(1);
    expect(await sample('pokerji_rate_limit_hits_total{bucket="other"}')).toBe(1);
  });

  it('names a rate-limit bucket by the fixed first part of its key, dropping the rest', async () => {
    metrics.rateLimitHit('join:Zm9vYmFy');
    metrics.rateLimitHit('pass:0b0e4a52-1111-4222-8333-444455556666:Zm9vYmFy');
    metrics.rateLimitHit('create:all');
    metrics.rateLimitError();
    const text = await metrics.render();
    expect(text).not.toContain('Zm9vYmFy');
    expect(text).not.toContain('0b0e4a52');
    expect(await sample('pokerji_rate_limit_hits_total{bucket="join"}')).toBe(1);
    expect(await sample('pokerji_rate_limit_hits_total{bucket="pass"}')).toBe(1);
    expect(await sample('pokerji_rate_limit_hits_total{bucket="create"}')).toBe(1);
    expect(await sample('pokerji_rate_limit_errors_total')).toBe(1);
  });

  it('records the wait for a room lock, and failures to get one', async () => {
    metrics.lockWaited(0.003);
    metrics.lockWaited(2);
    metrics.lockFailed();
    metrics.lockLost();
    expect(await sample('pokerji_room_lock_wait_seconds_count')).toBe(2);
    expect(await sample('pokerji_room_lock_wait_seconds_bucket{le="0.005"}')).toBe(1);
    expect(await sample('pokerji_room_lock_failures_total')).toBe(1);
    expect(await sample('pokerji_room_lock_lost_total')).toBe(1);
  });

  it('counts requests by a coarse class and status class only', async () => {
    metrics.httpRequest('GET', '/poker/r/AAAAAAAAAAAA?x=1', 200);
    metrics.httpRequest('POST', '/poker', 303);
    metrics.httpRequest('GET', '/healthz', 200);
    metrics.httpRequest('GET', '/_app/immutable/chunk.js', 304);
    expect(await sample('pokerji_http_requests_total{route_class="page",status_class="2xx"}')).toBe(
      1,
    );
    expect(await sample('pokerji_http_requests_total{route_class="api",status_class="3xx"}')).toBe(
      1,
    );
    expect(
      await sample('pokerji_http_requests_total{route_class="healthz",status_class="2xx"}'),
    ).toBe(1);
    expect(
      await sample('pokerji_http_requests_total{route_class="static",status_class="3xx"}'),
    ).toBe(1);
  });

  it('reports whether Valkey and Postgres answer, asking each at most once in a while', async () => {
    let asked = 0;
    metrics.setProbes({
      valkey: async () => {
        asked += 1;
      },
      postgres: async () => {
        throw new Error('down');
      },
    });
    expect(await sample('pokerji_valkey_up')).toBe(1);
    expect(await sample('pokerji_postgres_up')).toBe(0);
    await metrics.render();
    await metrics.render();
    expect(asked).toBe(1);
  });

  it('counts a probe that never answers as down, without holding the scrape up', async () => {
    metrics.setProbes({
      valkey: () => new Promise(() => undefined),
      postgres: async () => undefined,
    });
    const started = Date.now();
    expect(await sample('pokerji_valkey_up')).toBe(0);
    expect(Date.now() - started).toBeLessThan(3_000);
  }, 10_000);

  it('carries the build version, and refuses one that is not a plain version string', async () => {
    metrics.setVersion('1.4.2');
    expect(await sample('pokerji_build_info{version="1.4.2"}')).toBe(1);
    metrics.setVersion('1.0"} injected{x="');
    const text = await metrics.render();
    expect(text).not.toContain('injected');
    expect(await sample('pokerji_build_info{version="unknown"}')).toBe(1);
  });

  it('swallows a failure inside a metric call and counts it', async () => {
    // A histogram refuses a value that is not a number.
    expect(() => metrics.lockWaited(Number.NaN)).not.toThrow();
    expect(() => metrics.lockWaited('soon' as unknown as number)).not.toThrow();
    expect(await sample('pokerji_metrics_errors_total')).toBeGreaterThanOrEqual(1);
  });

  it('writes the Prometheus text format, with every metric prefixed and described', async () => {
    metrics.roomLoaded();
    const text = await metrics.render();
    expect(metrics.contentType).toContain('text/plain');
    expect(text).toContain('# TYPE pokerji_rooms_active gauge');
    expect(text).toContain('# HELP pokerji_rooms_active ');
    const names = text
      .split('\n')
      .filter((line) => line.startsWith('# TYPE '))
      .map((line) => line.split(' ')[2] ?? '');
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) expect(name).toMatch(/^pokerji_[a-z_]+$/);
  });
});

describe('routeClass', () => {
  it('sorts a request into one of four classes, never keeping the path', () => {
    expect(routeClass('GET', '/')).toBe('page');
    expect(routeClass('GET', '/poker/r/AAAAAAAAAAAA/history')).toBe('page');
    expect(routeClass('HEAD', '/privacy')).toBe('page');
    expect(routeClass('POST', '/poker/r/AAAAAAAAAAAA/settings?/passcode')).toBe('api');
    expect(routeClass('GET', '/poker/r/AAAAAAAAAAAA/__data.json')).toBe('api');
    expect(routeClass('GET', '/healthz')).toBe('healthz');
    expect(routeClass('GET', '/audio/bach-goldberg-aria.mp3')).toBe('static');
    expect(routeClass('GET', '/_app/immutable/x.js')).toBe('static');
    expect(routeClass('GET', '/favicon.svg')).toBe('static');
    expect(routeClass('GET', '/robots.txt')).toBe('static');
  });
});

describe('metricsAuthorized', () => {
  it('lets anyone in when no token is configured', () => {
    expect(metricsAuthorized(undefined, undefined)).toBe(true);
    expect(metricsAuthorized('Bearer anything', '')).toBe(true);
  });

  it('requires exactly the configured bearer token', () => {
    const token = 'a-long-scrape-token-0123456789';
    expect(metricsAuthorized(`Bearer ${token}`, token)).toBe(true);
    expect(metricsAuthorized(`bearer ${token}`, token)).toBe(true);
    expect(metricsAuthorized(undefined, token)).toBe(false);
    expect(metricsAuthorized('', token)).toBe(false);
    expect(metricsAuthorized(token, token)).toBe(false);
    expect(metricsAuthorized(`Bearer ${token}x`, token)).toBe(false);
    expect(metricsAuthorized(`Bearer ${token.slice(0, -1)}`, token)).toBe(false);
    expect(metricsAuthorized(`Basic ${token}`, token)).toBe(false);
  });
});
