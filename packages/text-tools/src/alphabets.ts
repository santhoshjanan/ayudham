export const LOWER = 'abcdefghijklmnopqrstuvwxyz';
export const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const DIGITS = '0123456789';
export const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?/';

/** Characters easily mistaken for one another, left out on request. */
export const LOOKALIKES = '0Oo1lI|';

export const BASE64 = UPPER + LOWER + DIGITS + '+/';
export const URL_SAFE = UPPER + LOWER + DIGITS + '-_';

/** Crockford's Base32, as ULID uses it: no I, L, O or U. */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
