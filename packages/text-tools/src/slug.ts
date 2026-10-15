import { ok, type Result } from './result.ts';
import { checkText, splitLines } from './text.ts';

/** Letters that have no accent to strip, spelled out. */
const SPELLED: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ł: 'l',
  þ: 'th',
};

function slugLine(line: string): string {
  return line
    .toLowerCase()
    .replace(/[ßæœøđłþ]/g, (char) => SPELLED[char] ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Each line as a URL slug: lowercase letters and digits, joined by single hyphens. */
export function slug(text: unknown): Result<string> {
  const checked = checkText(text);
  if (!checked.ok) return checked;
  return ok(splitLines(checked.value).map(slugLine).join('\n'));
}
