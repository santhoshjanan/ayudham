import { fail, redirect } from '@sveltejs/kit';
import { recoverModerator } from '@pokerji/poker-server';
import { actorOf } from '#lib/server/actor.ts';
import { clientAddress } from '#lib/server/address.ts';
import { runtime } from '#lib/server/pokerji.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
  code: event.params.code,
  joined: (await actorOf(event)) !== null,
});

export const actions: Actions = {
  default: async (event) => {
    const actor = await actorOf(event);
    const form = await event.request.formData();
    const recovered =
      actor !== null &&
      (await recoverModerator(runtime().app, {
        address: clientAddress(event),
        actor,
        recoveryToken: form.get('token'),
      }));
    if (!recovered) {
      // One message for every reason, so the page gives nothing away.
      return fail(403, {
        message:
          'That link did not work. Check that you copied all of it and that you have joined the room.',
      });
    }
    redirect(303, `/poker/r/${event.params.code}`);
  },
};
