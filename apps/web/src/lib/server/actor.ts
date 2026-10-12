import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { resumeSession, SESSION_COOKIE, type Actor } from '@pokerji/poker-server';
import { runtime } from '#lib/server/pokerji.ts';

/** The room and session this request belongs to, or null. Looked up fresh on every request. */
export function actorOf(event: RequestEvent): Promise<Actor | null> {
  return resumeSession(runtime().app.flows, {
    code: event.params.code,
    token: event.cookies.get(SESSION_COOKIE),
  });
}

/** A member of the room. Anyone else is sent to the join form, exactly as for an unknown room. */
export async function memberOf(event: RequestEvent): Promise<Actor> {
  const actor = await actorOf(event);
  if (!actor) redirect(303, `/poker/r/${event.params.code}`);
  return actor;
}

/**
 * A moderator of the room. This guards the page; every flow checks again, so a
 * route is never the only thing standing between a member and a moderator action.
 */
export async function moderatorOf(event: RequestEvent): Promise<Actor> {
  const actor = await memberOf(event);
  if (!actor.session.moderator) error(403, 'Only a moderator can open this page.');
  return actor;
}
