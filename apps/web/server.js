// The production entry. SvelteKit's handler serves pages; WebSocket upgrades go to
// the runtime object the app's init hook put on globalThis when handler.js was imported.
import { createServer } from 'node:http';
import { handler } from './build/handler.js';

const RUNTIME = Symbol.for('pokerji.runtime');

// Local testing only. Marks every request as plain HTTP so form posts and
// sockets pass the origin checks without a TLS proxy. Needs PROTOCOL_HEADER=x-forwarded-proto.
const insecure = process.env.INSECURE_HTTP === '1';
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

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    server.close();
    server.closeAllConnections();
    const stopping = globalThis[RUNTIME]?.app.stop() ?? Promise.resolve();
    stopping.finally(() => process.exit(0));
  });
}
