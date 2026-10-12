export const MAX_PARTICIPANTS = 50;
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
 * Ids of the bundled music tracks. Empty until tracks are chosen and their
 * licences recorded; until then a room's music setting can only be "none".
 */
export const MUSIC_TRACK_IDS: readonly string[] = [];
