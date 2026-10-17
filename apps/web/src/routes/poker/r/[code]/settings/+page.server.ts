import { fail, redirect } from '@sveltejs/kit';
import {
  coModerators,
  deleteRoomNow,
  demoteModerator,
  parseDeckText,
  regenerateRecovery,
  removePasscode,
  saveSettings,
  SESSION_COOKIE,
  setPasscode,
} from '@ayudham/poker-server';
import { BUILT_IN_DECKS, type BuiltInDeckId, type Deck } from '@ayudham/protocol';
import { moderatorOf } from '#lib/server/actor.ts';
import { runtime } from '#lib/server/ayudham.ts';
import type { Actions, PageServerLoad } from './$types';

const builtInId = (deck: Deck): string =>
  Object.entries(BUILT_IN_DECKS).find(
    ([, known]) => JSON.stringify(known.deck) === JSON.stringify(deck),
  )?.[0] ?? 'custom';

const REFUSED = 'Only a moderator can do that.';
const OWNER_ONLY = 'Only the owner of this room can do that.';
const LIMITED = 'Too many changes in a short time. Wait a few minutes and try again.';

export const load: PageServerLoad = async (event) => {
  const actor = await moderatorOf(event);
  const { room, session } = actor;
  return {
    code: room.code,
    owner: session.owner,
    // Empty unless the caller is the owner.
    coModerators: await coModerators(runtime().app, actor),
    deckId: builtInId(room.deck),
    values: room.deck.values.join(', '),
    specials: room.deck.specials.join(', '),
    timerSeconds: room.timerSeconds,
    music: room.music,
    hasPasscode: room.passcodeHash !== null,
  };
};

export const actions: Actions = {
  settings: async (event) => {
    const actor = await moderatorOf(event);
    const form = await event.request.formData();
    const deckId = String(form.get('deck') ?? '');
    const deck =
      deckId === 'custom'
        ? parseDeckText(String(form.get('values') ?? ''), String(form.get('specials') ?? ''))
        : (BUILT_IN_DECKS[deckId as BuiltInDeckId]?.deck ?? null);
    const timer = String(form.get('timer') ?? '').trim();
    const music = String(form.get('music') ?? '');
    const result = await saveSettings(runtime().app, actor, {
      deck,
      timerSeconds: timer === '' ? null : Number(timer),
      music: music === '' ? null : music,
    });
    if (result.ok) return { notice: 'Settings saved.' };
    if (result.reason === 'limited') return fail(429, { message: LIMITED });
    if (result.reason === 'busy') {
      return fail(409, {
        message:
          'The deck can only change between rounds. Start a new round in the room, then save again.',
      });
    }
    return fail(result.reason === 'refused' ? 403 : 400, {
      message:
        result.reason === 'refused'
          ? REFUSED
          : 'The settings could not be saved. A deck needs 2 to 20 different cards of up to 4 characters, and a timer runs from 10 to 600 seconds.',
    });
  },

  passcode: async (event) => {
    const actor = await moderatorOf(event);
    const form = await event.request.formData();
    const result = await setPasscode(runtime().app, actor, form.get('passcode'));
    if (result.ok) {
      return {
        notice:
          'Passcode set. Everyone except moderators was signed out and needs it to come back.',
      };
    }
    if (result.reason === 'limited') return fail(429, { message: LIMITED });
    return fail(result.reason === 'refused' ? 403 : 400, {
      message: result.reason === 'refused' ? REFUSED : 'A passcode has 8 to 64 characters.',
    });
  },

  removePasscode: async (event) => {
    const actor = await moderatorOf(event);
    const result = await removePasscode(runtime().app, actor);
    if (!result.ok) {
      return result.reason === 'limited'
        ? fail(429, { message: LIMITED })
        : fail(403, { message: REFUSED });
    }
    return { notice: 'Passcode removed. Anyone with the link can join.' };
  },

  recovery: async (event) => {
    const actor = await moderatorOf(event);
    const result = await regenerateRecovery(runtime().app, actor);
    if (!result.ok) {
      return result.reason === 'limited'
        ? fail(429, { message: LIMITED })
        : fail(403, { message: OWNER_ONLY });
    }
    // Shown once. The old link no longer works.
    return { notice: 'New moderator link made.', recoveryToken: result.recoveryToken };
  },

  demote: async (event) => {
    const actor = await moderatorOf(event);
    const form = await event.request.formData();
    const result = await demoteModerator(runtime().app, actor, form.get('session'));
    if (result.ok) return { notice: 'Moderator rights removed.' };
    if (result.reason === 'limited') return fail(429, { message: LIMITED });
    return fail(result.reason === 'refused' ? 403 : 400, {
      message: result.reason === 'refused' ? OWNER_ONLY : 'That person is not a moderator.',
    });
  },

  delete: async (event) => {
    const actor = await moderatorOf(event);
    const form = await event.request.formData();
    if (form.get('confirm') !== 'DELETE') {
      return fail(400, { message: 'Type DELETE in capitals to confirm.' });
    }
    const result = await deleteRoomNow(runtime().app, actor);
    if (!result.ok) return fail(403, { message: OWNER_ONLY });
    event.cookies.delete(SESSION_COOKIE, { path: `/poker/r/${actor.room.code}` });
    redirect(303, '/poker');
  },
};
