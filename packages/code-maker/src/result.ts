export const PROBLEMS = [
  'too-long',
  'bad-character',
  'bad-check-digit',
  'bad-length',
  'bad-escape',
  'empty',
  'out-of-range',
  'bad-colour',
  'bad-address',
  'bad-coordinates',
  'bad-date',
  'bad-email',
  'bad-phone',
  'logo-too-large',
  'contrast-too-low',
  'export-too-large',
  'not-encodable',
  'no-random',
] as const;

export type Problem = (typeof PROBLEMS)[number];

export type Result<T> = { ok: true; value: T } | { ok: false; problem: Problem };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const refuse = (problem: Problem): Result<never> => ({ ok: false, problem });

/** Fixed sentences: nothing typed ever reaches them. */
const SENTENCES: Record<Problem, string> = {
  'too-long':
    'That is more than this kind of code can hold. Shorten it, or choose a larger size or a lower error correction.',
  'bad-character': 'That contains a character this kind of code cannot carry.',
  'bad-check-digit': 'The check digit is wrong. Leave it off and it will be worked out.',
  'bad-length': 'That is not the length this kind of code needs.',
  'bad-escape':
    'That has a backslash sequence that is not one of \\n, \\r, \\t, \\\\, \\xHH or \\u{…}.',
  empty: 'Fill in the field this code needs.',
  'out-of-range': 'That option is outside what this kind of code allows.',
  'bad-colour': 'That is not a colour. Use a hex value such as #0e6f8c.',
  'bad-address': 'That is not a web address.',
  'bad-coordinates': 'Latitude must be between −90 and 90, and longitude between −180 and 180.',
  'bad-date': 'The dates do not make an event: check them, and that the end is after the start.',
  'bad-email': 'That is not an email address.',
  'bad-phone': 'That is not a phone number.',
  'logo-too-large':
    'The logo covers more of the code than its error correction can recover. Make it smaller or raise the error correction.',
  'contrast-too-low': 'The colours are too close for a scanner to tell apart.',
  'export-too-large': 'That export would be more than 10,000 pixels on a side.',
  'not-encodable': 'This kind of code cannot be made from that.',
  'no-random': 'This browser did not supply random numbers, so no colours were drawn.',
};

export const explain = (problem: Problem): string => SENTENCES[problem];
