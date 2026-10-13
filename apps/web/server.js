// The production entry. SvelteKit's handler serves pages; WebSocket upgrades go to
// the runtime object the app's init hook put on globalThis when handler.js was imported.
import { createServer } from 'node:http';

const RUNTIME = Symbol.for('pokerji.runtime');

// Local testing only. Marks every request as plain HTTP so form posts and
// sockets pass the origin checks without a TLS proxy, and drops the cookie's
// Secure flag. Needs PROTOCOL_HEADER=x-forwarded-proto.
const insecure = process.env.INSECURE_HTTP === '1';
const loopback = ['127.0.0.1', '::1', 'localhost'].includes(process.env.HOST ?? '');
// A one-shot run that applies database migrations and exits. It serves nothing.
const migrateOnly = process.env.MIGRATE_ONLY === '1';

if (insecure && !loopback) {
  console.error('INSECURE_HTTP is for local testing only: HOST must be a loopback address.');
  process.exit(1);
}
if (!insecure && !migrateOnly && !process.env.ADDRESS_HEADER) {
  // Without it every visitor looks like the proxy, and one person can use up everyone's limits.
  console.error('ADDRESS_HEADER is required (behind Traefik: x-forwarded-for, with XFF_DEPTH=1).');
  process.exit(1);
}
if (migrateOnly) process.env.MIGRATIONS = 'apply';

// Imported only after the checks above, because importing it starts the app.
// The error is never printed: it can carry connection details.
let handler;
try {
  ({ handler } = await import('./build/handler.js'));
  await globalThis[RUNTIME]?.started;
} catch {
  console.error(
    migrateOnly
      ? 'Migration failed. Check DATABASE_URL and that its role owns the schema.'
      : 'The app could not start. Check the configuration, the services, and that migrations are applied.',
  );
  process.exit(1);
}

if (migrateOnly) {
  await globalThis[RUNTIME]?.app.stop();
  console.log('Migrations applied.');
  process.exit(0);
}

const mark = (req) => {
  if (insecure) req.headers['x-forwarded-proto'] = 'http';
};

const server = createServer((req, res) => {
  mark(req);
  handler(req, res, () => {
    res.statusCode = 404;
    res.end('Not found');
  });
});

server.on('upgrade', (req, socket, head) => {
  mark(req);
  const runtime = globalThis[RUNTIME];
  if (!runtime) {
    socket.destroy();
    return;
  }
  runtime.upgrade(req, socket, head);
});

server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0');

let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close();
    server.closeAllConnections();
    const stopped = globalThis[RUNTIME]?.app.stop() ?? Promise.resolve();
    stopped.finally(() => process.exit(0));
  });
}
