import { dev } from '$app/env';

const THIRTY_DAYS = 60 * 60 * 24 * 30;

// The cookie is Secure everywhere except local development and local testing.
// It is deliberately not derived from the request: a forwarded-protocol header
// must never be able to switch it off.
const insecure = dev || process.env.INSECURE_HTTP === '1';

/** Options for the session cookie. It is scoped to one room and unreadable by scripts. */
export function sessionCookie(code: string) {
  return {
    path: `/poker/r/${code}`,
    httpOnly: true,
    secure: !insecure,
    sameSite: 'lax' as const,
    maxAge: THIRTY_DAYS,
  };
}
