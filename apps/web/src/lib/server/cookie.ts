import { dev } from '$app/env';

// The cookie is Secure everywhere except local development and local testing.
// It is deliberately not derived from the request: a forwarded-protocol header
// must never be able to switch it off.
const insecure = dev || process.env.INSECURE_HTTP === '1';

/**
 * Options for the session cookie. It is scoped to one room and unreadable by scripts.
 * It lasts as long as the server keeps an unused session, so the two end together.
 */
export function sessionCookie(code: string, retentionDays: number) {
  return {
    path: `/poker/r/${code}`,
    httpOnly: true,
    secure: !insecure,
    sameSite: 'lax' as const,
    maxAge: retentionDays * 24 * 60 * 60,
  };
}
