import { fail } from '@sveltejs/kit';
import { recoverModerator } from '@pokerji/poker-server';
import { actorOf } from '#lib/server/actor.ts';
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
      actor === null
        ? ({ ok: false } as const)
        : await recoverModerator(runtime().app, { actor, recoveryToken: form.get('token') });
    if (!recovered.ok) {
      // One message for every reason, so the page gives nothing away.
      return fail(403, {
        message:
          'That link did not work. Check that you copied all of it and that you have joined the room. A link works only once.',
      });
    }
    // The link that was just used is spent. Its replacement is shown once.
    return { recoveryToken: recovered.recoveryToken };
  },
};
