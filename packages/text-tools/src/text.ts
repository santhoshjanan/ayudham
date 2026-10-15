import { LIMITS } from './limits.ts';
import { ok, refuse, type Result } from './result.ts';

/** The first check of every function that takes typed text. */
export function checkText(text: unknown): Result<string> {
  return typeof text === 'string' && text.length <= LIMITS.text ? ok(text) : refuse('too-long');
}

export function splitLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/);
}

/** The lines of a list. An empty line after a final line break is not a line. */
export function listLines(text: string): string[] {
  const list = splitLines(text);
  if (list.at(-1) === '') list.pop();
  return list;
}
