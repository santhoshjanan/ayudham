const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** Options for the session cookie. It is scoped to one room and unreadable by scripts. */
export function sessionCookie(url: URL, code: string) {
  return {
    path: `/poker/r/${code}`,
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax' as const,
    maxAge: THIRTY_DAYS,
  };
}
