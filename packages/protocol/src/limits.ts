export const MAX_PARTICIPANTS = 50;
/**
 * A moderator may join a full room, so it is never left without one. This many
 * over the limit and no further, so moderator rights cannot grow a room without bound.
 */
export const MODERATOR_HEADROOM = 10;
export const MAX_MESSAGE_BYTES = 2048;
export const TITLE_MAX = 200;
export const NAME_MIN = 1;
export const NAME_MAX = 30;
export const DECK_MAX_CARDS = 20;
export const CARD_MAX_CHARS = 4;
export const TIMER_MIN_SECONDS = 10;
export const TIMER_MAX_SECONDS = 600;
export const REVEAL_COUNT_MS = 3_000;
export const AWAY_DROP_MS = 600_000;
export const ROOM_UNLOAD_MS = 300_000;
/** Raised from 4 after the security audit: short passcodes fall to patient guessing. */
export const PASSCODE_MIN = 8;
export const PASSCODE_MAX = 64;
/** WebSocket close code: this connection was closed because the participant opened too many. */
export const CLOSE_TOO_MANY_CONNECTIONS = 4001;

/**
 * The bundled music. An id is also the file name: `/audio/<id>.mp3`. Every track
 * needs a row in `apps/web/static/audio/LICENSES.md` showing a CC0 release by
 * whoever made the recording; a browser test checks the row and the file agree.
 */
export const MUSIC_TRACKS = [
  { id: 'chopin-nocturne-op9-2', title: 'Chopin: Nocturne in E-flat major, Op. 9 No. 2' },
  { id: 'chopin-waltz-op64-1', title: 'Chopin: “Minute” Waltz, Op. 64 No. 1' },
  { id: 'bach-goldberg-aria', title: 'Bach: Goldberg Variations, Aria' },
  { id: 'bach-goldberg-var1', title: 'Bach: Goldberg Variations, Variation 1' },
] as const satisfies readonly { id: string; title: string }[];
export const MUSIC_TRACK_IDS: readonly string[] = MUSIC_TRACKS.map((track) => track.id);
