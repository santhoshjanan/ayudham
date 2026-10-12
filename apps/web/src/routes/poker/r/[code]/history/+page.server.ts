import { fail } from '@sveltejs/kit';
import {
  anonymiseMe,
  clearRoomHistory,
  deleteHistoryRound,
  roomHistory,
} from '@pokerji/poker-server';
import { memberOf } from '#lib/server/actor.ts';
import { runtime } from '#lib/server/pokerji.ts';
import { summarise } from '#lib/summary.ts';
import type { Actions, PageServerLoad } from './$types';

const REFUSED = 'Only a moderator can do that.';

export const load: PageServerLoad = async (event) => {
  const actor = await memberOf(event);
  const rounds = await roomHistory(runtime().app, actor);
  return {
    code: actor.room.code,
    moderator: actor.session.moderator,
    rounds: rounds.map((round) => ({
      id: round.id,
      title: round.title,
      // Rendered on the server in UTC, so server and browser output match.
      revealed: `${round.revealedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      summary: summarise(
        actor.room.deck,
        round.votes.map((vote) => vote.card),
      ),
      votes: round.votes.map((vote) => ({ name: vote.name, card: vote.card })),
    })),
  };
};

export const actions: Actions = {
  anonymise: async (event) => {
    const actor = await memberOf(event);
    const changed = await anonymiseMe(runtime().app, actor);
    return {
      notice:
        changed === 0
          ? 'Your name is not on any saved vote.'
          : `Your name was removed from ${changed} ${changed === 1 ? 'vote' : 'votes'}.`,
    };
  },

  deleteRound: async (event) => {
    const actor = await memberOf(event);
    const form = await event.request.formData();
    const result = await deleteHistoryRound(runtime().app, actor, form.get('round'));
    if (result.ok) return { notice: 'Round deleted.' };
    return fail(result.reason === 'refused' ? 403 : 400, {
      message: result.reason === 'refused' ? REFUSED : 'That round could not be found.',
    });
  },

  clear: async (event) => {
    const actor = await memberOf(event);
    const result = await clearRoomHistory(runtime().app, actor);
    if (!result.ok) return fail(403, { message: REFUSED });
    return { notice: 'All history deleted.' };
  },
};
