import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { runtime } from '#lib/server/pokerji.ts';

export const init: ServerInit = async () => {
  await runtime().started;
};

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // Not "no-referrer": that makes browsers send "Origin: null" on same-site form posts,
  // which the cross-site check then refuses. "same-origin" still sends nothing to other sites.
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (event.url.pathname.startsWith('/poker')) {
    // Room links are secrets and create responses carry one: never cache or index them.
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
};
