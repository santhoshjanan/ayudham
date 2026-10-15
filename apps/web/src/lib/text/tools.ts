import { explain, type Problem } from '@pokerji/text-tools';

export const GROUPS = ['Generate', 'Convert'] as const;

/** Every tool, in the order the page offers them. An id is also the tool's fragment. */
export const TOOLS = [
  { id: 'password', group: 'Generate', label: 'Password' },
  { id: 'passphrase', group: 'Generate', label: 'Passphrase' },
  { id: 'random', group: 'Generate', label: 'Random string' },
  { id: 'number', group: 'Generate', label: 'PIN and number' },
  { id: 'id', group: 'Generate', label: 'Identifier' },
  { id: 'chance', group: 'Generate', label: 'Chance' },
  { id: 'case', group: 'Convert', label: 'Case' },
  { id: 'slug', group: 'Convert', label: 'Slug' },
  { id: 'encode', group: 'Convert', label: 'Encode and decode' },
  { id: 'hash', group: 'Convert', label: 'Hash' },
  { id: 'lines', group: 'Convert', label: 'Lines' },
  { id: 'count', group: 'Convert', label: 'Count' },
] as const;

export type ToolId = (typeof TOOLS)[number]['id'];

/**
 * The tool an address fragment names. The fragment is whatever someone put in a link, so it is
 * only ever compared with the list; anything else opens the first tool.
 */
export function toolFrom(hash: string): ToolId {
  const name = hash.startsWith('#') ? hash.slice(1) : hash;
  return TOOLS.find((tool) => tool.id === name)?.id ?? 'password';
}

/** One result in the rail. `plain` marks a value there is no point copying alone, such as a count. */
export type Row = { name?: string; value: string; plain?: boolean };

/** The sentence for a refusal. A tool supplies its own for an option outside its limits. */
export const say = (problem: Problem, range?: string): string =>
  problem === 'out-of-range' && range ? range : explain(problem);

/** Every result as lines of text, for Copy all. */
export const joined = (rows: Row[]): string =>
  rows.map((row) => (row.name ? `${row.name}: ${row.value}` : row.value)).join('\n');
