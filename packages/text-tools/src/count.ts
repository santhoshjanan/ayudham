import { utf8 } from './bytes.ts';
import { ok, type Result } from './result.ts';
import { checkText, listLines } from './text.ts';

export type Counts = {
  /** Characters as a reader counts them: an emoji or an accented letter is one. */
  characters: number;
  /** Characters that are not white space. */
  solid: number;
  words: number;
  lines: number;
  /** Bytes as UTF-8. */
  bytes: number;
};

type Splitter = { segment(text: string): Iterable<{ segment: string }> };

let splitter: Splitter | null | undefined;

/**
 * The text as a reader's characters. Made on first use, never when the package loads: a browser
 * without a grapheme splitter must still run every other tool. There, code points are counted.
 */
function pieces(text: string): Iterable<string> {
  if (splitter === undefined) {
    try {
      splitter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    } catch {
      splitter = null;
    }
  }
  if (splitter === null) return text;
  const split = splitter;
  return (function* () {
    for (const { segment } of split.segment(text)) yield segment;
  })();
}

export function count(text: unknown): Result<Counts> {
  const checked = checkText(text);
  if (!checked.ok) return checked;
  const value = checked.value;
  let characters = 0;
  let solid = 0;
  for (const segment of pieces(value)) {
    characters++;
    if (segment.trim() !== '') solid++;
  }
  return ok({
    characters,
    solid,
    words: value.match(/\S+/g)?.length ?? 0,
    lines: listLines(value).length,
    bytes: utf8(value).length,
  });
}
