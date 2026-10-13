import { LIMITS } from './limits.ts';

export const PROBLEMS = [
  'too-long',
  'out-of-range',
  'no-classes',
  'alphabet-size',
  'alphabet-space',
  'alphabet-repeat',
  'no-random',
  'bad-word-list',
  'empty-list',
  'bad-base64',
  'bad-hex',
  'odd-hex',
  'bad-percent',
] as const;

export type Problem = (typeof PROBLEMS)[number];

export type Result<T> = { ok: true; value: T } | { ok: false; problem: Problem };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const refuse = (problem: Problem): Result<never> => ({ ok: false, problem });

/** True for a whole number from `min` to `max`. Options arrive from form fields, so anything can. */
export function whole(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

const SENTENCES: Record<Problem, string> = {
  'too-long': `That is more than ${LIMITS.text.toLocaleString('en')} characters, the most this tool takes.`,
  'out-of-range': 'That value is outside what this tool allows.',
  'no-classes': 'Choose at least one kind of character.',
  'alphabet-size': `An alphabet needs between ${LIMITS.alphabetMin} and ${LIMITS.alphabetMax} characters.`,
  'alphabet-space': 'An alphabet cannot contain white space or control characters.',
  'alphabet-repeat': 'An alphabet cannot contain the same character twice.',
  'no-random': 'This browser did not supply random numbers, so nothing was generated.',
  'bad-word-list': 'The word list could not be read.',
  'empty-list': 'Type at least one line to pick from.',
  'bad-base64': 'That is not Base64: it has a character or a length that Base64 never has.',
  'bad-hex': 'That is not hex: only 0 to 9 and a to f are allowed.',
  'odd-hex': 'That is not hex: it has an odd number of digits.',
  'bad-percent': 'That has a % that is not followed by two hex digits.',
};

export const explain = (problem: Problem): string => SENTENCES[problem];
