// The production entry. SvelteKit's handler serves pages; WebSocket upgrades go to
// the runtime object the app's init hook put on globalThis when handler.js was imported.
import { createServer } from 'node:http';

const RUNTIME = Symbol.for('pokerji.runtime');

// A last resort. Node's own report of an uncaught error prints the error, and a database
// error can carry names and ids. Nothing reaches here today; this keeps the log promise
// true if something ever does.
for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, () => {
    console.error(JSON.stringify({ level: 'error', problem: 'unexpected failure, stopping' }));
    process.exit(1);
  });
}

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
  console.error(
    'ADDRESS_HEADER is required (behind a reverse proxy: x-forwarded-for, with XFF_DEPTH=1).',
  );
  process.exit(1);
}
if (migrateOnly) process.env.MIGRATIONS = 'apply';

// Metrics for a Prometheus server on a private network. Off unless METRICS_PORT is set.
// They are served on a port of their own so the public one can never expose them.
const publicPort = Number(process.env.PORT ?? 3000);
const metricsPort = process.env.METRICS_PORT ? Number(process.env.METRICS_PORT) : null;
const metricsToken = process.env.METRICS_TOKEN ?? '';
if (
  metricsPort !== null &&
  (!Number.isInteger(metricsPort) ||
    metricsPort < 1 ||
    metricsPort > 65535 ||
    metricsPort === publicPort)
) {
  console.error('METRICS_PORT must be a port number, and not the same as PORT.');
  process.exit(1);
}
if (metricsToken !== '' && metricsToken.length < 16) {
  console.error('METRICS_TOKEN must have 16 or more characters.');
  process.exit(1);
}

// The site's one origin, when ORIGIN is set. This version of the Node adapter takes a fixed
// origin only at build time, and one image serves any host, so the entry file states it on
// every request instead, in two headers of its own that it always overwrites. No header a
// client or a proxy sends can then change what the app believes its origin is.
let fixed = null;
if (process.env.ORIGIN) {
  const url = URL.canParse(process.env.ORIGIN) ? new URL(process.env.ORIGIN) : null;
  // Strict, because a value such as "poker.example.org:443" parses as a URL with no host.
  if (!url || !['https:', 'http:'].includes(url.protocol) || url.host === '') {
    console.error('ORIGIN must be a full origin, such as https://poker.example.org');
    process.exit(1);
  }
  fixed = url;
  process.env.PROTOCOL_HEADER = 'x-pokerji-protocol';
  process.env.HOST_HEADER = 'x-pokerji-host';
  delete process.env.PORT_HEADER;
}

// Imported only after the checks above, because importing it starts the app.
// The error is never printed: it can carry connection details.
let handler;
try {
  ({ handler } = await import('./build/handler.js'));
  await globalThis[RUNTIME]?.started;
} catch (error) {
  // These two messages are written by the app, name settings only, and are safe to show.
  const known = ['Invalid or missing configuration', 'Valkey cannot be reached'];
  const message = error instanceof Error ? error.message : '';
  if (known.some((start) => message.startsWith(start))) console.error(message);
  console.error(
    migrateOnly
      ? 'Migration failed. Check DATABASE_URL and that its role owns the schema.'
      : 'The app could not start. Check the configuration, the services, and that migrations are applied.',
  );
  process.exit(1);
}

if (migrateOnly) {
  if (!globalThis[RUNTIME]) {
    console.error('Migration failed: the app did not start.');
    process.exit(1);
  }
  await globalThis[RUNTIME].app.stop();
  console.log('Migrations applied.');
  process.exit(0);
}

const mark = (req) => {
  if (insecure) req.headers['x-forwarded-proto'] = 'http';
  if (fixed) {
    req.headers['x-pokerji-protocol'] = fixed.protocol.slice(0, -1);
    req.headers['x-pokerji-host'] = fixed.host;
  }
};

// The base headers for every response. Pages set their own on top in hooks.server.ts;
// files from the static folder never reach the hooks, so they get them here.
const harden = (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // The recordings never change under one name, and are large: let browsers keep them a week.
  if (req.url?.startsWith('/audio/')) {
    res.setHeader('Cache-Control', 'public, max-age=604800');
    // Only for a file that is there: a missing one must not be remembered as missing.
    const writeHead = res.writeHead;
    res.writeHead = function (status, ...rest) {
      if (status >= 400) this.removeHeader('Cache-Control');
      return writeHead.call(this, status, ...rest);
    };
  }
};

const notFound = (res) => {
  res.statusCode = 404;
  res.end('Not found');
};

const server = createServer((req, res) => {
  mark(req);
  harden(req, res);
  const app = globalThis[RUNTIME]?.app;
  // Counted by a coarse class and status only. The path is never recorded.
  res.on('finish', () => app?.metrics.httpRequest(req.method, req.url, res.statusCode));
  // Metrics are never served here, whatever the app's routes become.
  if ((req.url ?? '').split('?')[0] === '/metrics') return notFound(res);
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

// Longer than reverse proxies usually keep an idle connection (60 to 90 seconds), so the proxy never sends a
// request down a connection this side has just closed.
server.keepAliveTimeout = 95_000;
server.headersTimeout = 100_000;
server.listen(publicPort, process.env.HOST ?? '0.0.0.0');

// The metrics listener answers GET /metrics and nothing else: no pages, no other
// methods, no WebSockets. Publish its port on an internal network only.
let metricsServer = null;
if (metricsPort !== null && !migrateOnly) {
  // Rendered at most once a second, however often it is asked for.
  let scrape = { at: -Infinity, body: Promise.resolve('') };
  metricsServer = createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    const app = globalThis[RUNTIME]?.app;
    if (!app || req.method !== 'GET' || req.url !== '/metrics') return notFound(res);
    if (!app.metrics.authorized(req.headers.authorization, metricsToken)) {
      res.statusCode = 401;
      res.setHeader('WWW-Authenticate', 'Bearer');
      return res.end('Unauthorized');
    }
    if (Date.now() - scrape.at >= 1_000) scrape = { at: Date.now(), body: app.metrics.render() };
    scrape.body
      .then((body) => {
        // An empty body means the metrics could not be written; say so, not "all is well".
        if (body === '') {
          res.statusCode = 503;
          return res.end();
        }
        res.setHeader('Content-Type', app.metrics.contentType);
        res.end(body);
      })
      .catch(() => res.destroy());
  });
  // A monitoring server makes one short request at a time. Nothing else is expected here.
  metricsServer.maxConnections = 8;
  metricsServer.headersTimeout = 5_000;
  metricsServer.requestTimeout = 10_000;
  metricsServer.on('upgrade', (_req, socket) => socket.destroy());
  // Metrics are optional: a port that cannot be opened must not stop the app.
  metricsServer.on('error', () => {
    console.error('METRICS_PORT could not be opened. The app is running without metrics.');
  });
  metricsServer.listen(
    metricsPort,
    process.env.METRICS_HOST ?? process.env.HOST ?? '0.0.0.0',
    () => {
      console.log(
        metricsToken === ''
          ? 'Metrics are served on METRICS_PORT without a token. Keep that port on a private network.'
          : 'Metrics are served on METRICS_PORT and require the bearer token.',
      );
    },
  );
}

let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close();
    server.closeAllConnections();
    metricsServer?.close();
    metricsServer?.closeAllConnections();
    const stopped = globalThis[RUNTIME]?.app.stop() ?? Promise.resolve();
    stopped.finally(() => process.exit(0));
  });
}
