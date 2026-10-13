export interface MarkupPart {
  kind: 'name' | 'value' | 'mark';
  text: string;
}

const TOKEN = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g;

/**
 * The markup cut into property names, values and everything else, for showing it in two
 * inks. The parts joined give back the text exactly. A script element around the JSON
 * counts as everything else.
 */
export const markupParts = (text: string): MarkupPart[] => {
  const parts: MarkupPart[] = [];
  const push = (kind: MarkupPart['kind'], piece: string): void => {
    if (piece === '') return;
    const last = parts.at(-1);
    if (last?.kind === kind) last.text += piece;
    else parts.push({ kind, text: piece });
  };

  const open = text.indexOf('{');
  const close = text.lastIndexOf('}');
  if (open < 0 || close < open) {
    push('mark', text);
    return parts;
  }

  const body = text.slice(open, close + 1);
  push('mark', text.slice(0, open));
  let at = 0;
  for (const match of body.matchAll(TOKEN)) {
    push('mark', body.slice(at, match.index));
    at = match.index + match[0].length;
    const named = match[0].startsWith('"') && /^\s*:/.test(body.slice(at));
    push(named ? 'name' : 'value', match[0]);
  }
  push('mark', body.slice(at));
  push('mark', text.slice(close + 1));
  return parts;
};
