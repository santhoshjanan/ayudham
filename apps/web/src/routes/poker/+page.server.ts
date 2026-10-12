import { fail } from '@sveltejs/kit';
import { createRoomFlow, SESSION_COOKIE } from '@pokerji/poker-server';
import { clientAddress } from '#lib/server/address.ts';
import { sessionCookie } from '#lib/server/cookie.ts';
import { runtime } from '#lib/server/pokerji.ts';
import type { Actions } from './$types';

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const result = await createRoomFlow(runtime().app.flows, {
      address: clientAddress(event),
      name: form.get('name'),
      deckId: form.get('deck'),
    });
    if (!result.ok) {
      return result.reason === 'invalid'
        ? fail(400, { message: 'Enter a name of 1 to 30 characters and choose a deck.' })
        : fail(429, { message: 'A room could not be created right now. Try again later.' });
    }
    event.cookies.set(SESSION_COOKIE, result.sessionToken, sessionCookie(result.code));
    // Shown once. It is never stored in readable form and cannot be shown again.
    return { created: { code: result.code, recoveryToken: result.recoveryToken } };
  },
};
