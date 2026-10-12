import { resolve } from 'node:path';
import { dev } from '$app/env';
import { createApp, createUpgradeHandler, loadConfig, type App } from '@pokerji/poker-server';

export interface Runtime {
  app: App;
  upgrade: ReturnType<typeof createUpgradeHandler>;
  /** Resolves when the database is migrated and the timers are running. */
  started: Promise<void>;
}

const KEY = Symbol.for('pokerji.runtime');
type Holder = typeof globalThis & { [KEY]?: Runtime };

/**
 * The one runtime object for this process. It lives on globalThis so the
 * production entry (server.js) and the dev plugin reach the same instance as
 * the pages, and so a dev reload does not open a second set of connections.
 */
export function runtime(): Runtime {
  const holder = globalThis as Holder;
  if (!holder[KEY]) {
    const app = createApp(loadConfig(process.env), {
      migrationsDir:
        process.env.MIGRATIONS_DIR ??
        resolve(process.cwd(), '../../packages/poker-server/migrations'),
    });
    holder[KEY] = {
      app,
      upgrade: createUpgradeHandler(app, {
        env: process.env,
        defaultProtocol: dev ? 'http' : 'https',
      }),
      started: app.start(),
    };
  }
  return holder[KEY];
}
