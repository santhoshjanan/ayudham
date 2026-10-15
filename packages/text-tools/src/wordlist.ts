import { ok, refuse, type Result } from './result.ts';

/** Words in the EFF long list: every outcome of five dice. */
export const WORD_COUNT = 7_776;

/** SHA-256 of `apps/web/static/text/eff_large_wordlist.txt`, which the page checks on arrival. */
export const WORD_LIST_SHA256 = 'addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e';

const LINE = /^[1-6]{5}\t([a-z]+(?:-[a-z]+)*)$/;

/**
 * The words of the list as published: a dice number, a tab and a word on each line. Anything
 * else is refused whole, so a changed list can never supply a word.
 */
export function readWordList(text: unknown): Result<string[]> {
  if (typeof text !== 'string') return refuse('bad-word-list');
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length !== WORD_COUNT) return refuse('bad-word-list');
  const words = new Set<string>();
  for (const line of lines) {
    const match = LINE.exec(line);
    if (!match) return refuse('bad-word-list');
    words.add(match[1]!);
  }
  return words.size === WORD_COUNT ? ok([...words]) : refuse('bad-word-list');
}
