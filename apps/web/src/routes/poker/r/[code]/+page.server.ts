import { fail, redirect } from '@sveltejs/kit';
import { joinRoomFlow, resumeSession, SESSION_COOKIE } from '@pokerji/poker-server';
import { clientAddress } from '#lib/server/address.ts';
import { sessionCookie } from '#lib/server/cookie.ts';
import { runtime } from '#lib/server/pokerji.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const token = event.cookies.get(SESSION_COOKIE);
  const resumed = await resumeSession(runtime().app.flows, { code: event.params.code, token });
  // An unknown room and a room you have not joined look exactly the same: a join form.
  if (!resumed || token === undefined) return { joined: false as const };
  // Each visit renews the cookie's 30 days.
  event.cookies.set(
    SESSION_COOKIE,
    token,
    sessionCookie(resumed.room.code, runtime().app.config.retentionDays),
  );
  return { joined: true as const, code: resumed.room.code };
};

export const actions: Actions = {
  join: async (event) => {
    const form = await event.request.formData();
    const result = await joinRoomFlow(runtime().app.flows, {
      address: clientAddress(event),
      code: event.params.code,
      name: form.get('name'),
      role: form.get('role'),
      passcode: form.get('passcode'),
    });
    if (!result.ok) {
      return result.reason === 'invalid'
        ? fail(400, { message: 'Enter a name of 1 to 30 characters.' })
        : fail(403, {
            message: 'Could not join. Check the link and the passcode, then try again.',
          });
    }
    event.cookies.set(
      SESSION_COOKIE,
      result.sessionToken,
      sessionCookie(event.params.code, runtime().app.config.retentionDays),
    );
    redirect(303, event.url.pathname);
  },
};
