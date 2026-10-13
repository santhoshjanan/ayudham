import { ok, refuse, type Result } from './result.ts';
import { checkText, splitLines } from './text.ts';

export const CASE_FORMS = [
  'camel',
  'pascal',
  'snake',
  'constant',
  'kebab',
  'train',
  'dot',
  'path',
  'title',
  'sentence',
  'upper',
  'lower',
] as const;
export type CaseForm = (typeof CASE_FORMS)[number];

/**
 * One word: capitals that end before a capitalised word (HTTP in HTTPResponse), a word with or
 * without its capital, a run of capitals, a run of digits, or a run of letters that have no case.
 */
const WORD = /\p{Lu}+(?=\p{Lu}\p{Ll})|\p{Lu}?\p{Ll}+|\p{Lu}+|\p{N}+|[\p{Lo}\p{Lt}\p{Lm}]+/gu;

/** The words of a line, for the programming forms. Apostrophes are dropped, not split on. */
export function words(line: string): string[] {
  return line.normalize('NFC').replace(/['’]/g, '').match(WORD) ?? [];
}

function upperFirst(word: string): string {
  const [first = '', ...rest] = [...word];
  return first.toUpperCase() + rest.join('');
}

const capital = (word: string): string => upperFirst(word.toLowerCase());
const lower = (word: string): string => word.toLowerCase();

type Programming = Exclude<CaseForm, 'title' | 'sentence' | 'upper' | 'lower'>;

const JOIN: Record<Programming, (parts: string[]) => string> = {
  camel: (parts) => parts.map((word, i) => (i === 0 ? lower(word) : capital(word))).join(''),
  pascal: (parts) => parts.map(capital).join(''),
  snake: (parts) => parts.map(lower).join('_'),
  constant: (parts) => parts.map((word) => word.toUpperCase()).join('_'),
  kebab: (parts) => parts.map(lower).join('-'),
  train: (parts) => parts.map(capital).join('-'),
  dot: (parts) => parts.map(lower).join('.'),
  path: (parts) => parts.map(lower).join('/'),
};

const SMALL = new Set('a an and as at but by for if in nor of on or per the to via vs'.split(' '));

const solid = (char: string): boolean => /[\p{L}\p{N}]/u.test(char);

/**
 * A written word as the punctuation before it, the word, and the punctuation after. Done with
 * loops: a pattern for this backtracks badly on a long run of punctuation.
 */
function edges(word: string): [string, string, string] {
  const chars = [...word];
  let from = 0;
  while (from < chars.length && !solid(chars[from]!)) from++;
  let to = chars.length;
  while (to > from && !solid(chars[to - 1]!)) to--;
  return [chars.slice(0, from).join(''), chars.slice(from, to).join(''), chars.slice(to).join('')];
}

/** True for a word with a capital after its first letter, such as iPhone or NASA. */
const inner = (core: string): boolean => /\p{Lu}/u.test([...core].slice(1).join(''));

/** True when the text has capitals and no lowercase letter at all. */
const shouting = (text: string): boolean => /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text);

function title(line: string, loud: boolean): string {
  const parts = line.split(/(\s+)/);
  const places = parts.map((_, i) => i).filter((i) => i % 2 === 0 && parts[i] !== '');
  let afterColon = false;
  places.forEach((place, n) => {
    const [lead, typed, trail] = edges(parts[place]!);
    const core = loud ? typed.toLowerCase() : typed;
    let out = core;
    if (core !== '' && !inner(core)) {
      const plain = core.toLowerCase();
      const small = SMALL.has(plain) && n > 0 && n < places.length - 1 && !afterColon;
      out = small ? plain : upperFirst(core);
    }
    parts[place] = lead + out + trail;
    afterColon = trail.includes(':');
  });
  return parts.join('');
}

function sentence(text: string, loud: boolean): string {
  let start = true;
  return text.replace(/\S+/g, (word) => {
    const [lead, typed, trail] = edges(word);
    const core = loud ? typed.toLowerCase() : typed;
    let out = core;
    if (core !== '' && !inner(core)) {
      out = core.toLowerCase();
      if (start || /^i(['’](m|ll|ve|d))?$/.test(out)) out = upperFirst(out);
    }
    if (/[.!?]/.test(core === '' ? lead : trail)) start = true;
    else if (core !== '') start = false;
    return lead + out + trail;
  });
}

export function convertCase(text: unknown, form: CaseForm): Result<string> {
  const checked = checkText(text);
  if (!checked.ok) return checked;
  const value = checked.value;
  if (!CASE_FORMS.includes(form)) return refuse('out-of-range');
  if (form === 'upper') return ok(value.toUpperCase());
  if (form === 'lower') return ok(value.toLowerCase());
  if (form === 'sentence') return ok(sentence(value, shouting(value)));
  if (form === 'title') {
    const loud = shouting(value);
    return ok(
      splitLines(value)
        .map((line) => title(line, loud))
        .join('\n'),
    );
  }
  const join = JOIN[form];
  return ok(
    splitLines(value)
      .map((line) => join(words(line)))
      .join('\n'),
  );
}

/** Every form at once, for a page that shows them side by side. */
export function allCases(text: unknown): Result<Record<CaseForm, string>> {
  const out = {} as Record<CaseForm, string>;
  for (const form of CASE_FORMS) {
    const made = convertCase(text, form);
    if (!made.ok) return made;
    out[form] = made.value;
  }
  return ok(out);
}
