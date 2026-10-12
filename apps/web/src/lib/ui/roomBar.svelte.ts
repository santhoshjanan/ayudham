/**
 * What the site bar shows while someone is in a room, so the room's link,
 * pages and "who am I" sit in the one bar instead of a second one beneath it.
 *
 * Only ever written in the browser (from an effect in the room component).
 * It must never be set during server rendering: module state on the server is
 * shared between requests, and this holds a person's name.
 */
export const roomBar = $state<{
  room: { code: string; name: string; owner: boolean; moderator: boolean } | null;
}>({ room: null });
