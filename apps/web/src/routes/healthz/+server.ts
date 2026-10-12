import { runtime } from '#lib/server/pokerji.ts';

/** Liveness for the container: answers once the app has started. Touches no room data. */
export const GET = async () => {
  await runtime().started;
  return new Response('ok', { headers: { 'content-type': 'text/plain' } });
};
