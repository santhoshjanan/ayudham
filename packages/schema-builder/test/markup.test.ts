import { describe, expect, it } from 'vitest';
import { markupParts, toJson, toScriptTag } from '../src/index.ts';
import { draftOf, make, nested, text } from './helpers.ts';

const draft = draftOf(
  make('Product', {
    name: text('A "quoted": name </script>'),
    isFamilyFriendly: { kind: 'boolean', on: true },
    offers: nested(make('Offer', { price: text('9', 'number') })),
  }),
);

describe('markupParts', () => {
  it('gives nothing for nothing', () => {
    expect(markupParts('')).toEqual([]);
  });

  it('gives back the text exactly, in both forms', () => {
    for (const form of [toJson(draft), toScriptTag(draft)]) {
      expect(
        markupParts(form)
          .map((part) => part.text)
          .join(''),
      ).toBe(form);
    }
  });

  it('tells property names from values and from punctuation', () => {
    expect(markupParts('{\n  "name": "Ada",\n  "age": 36\n}')).toEqual([
      { kind: 'mark', text: '{\n  ' },
      { kind: 'name', text: '"name"' },
      { kind: 'mark', text: ': ' },
      { kind: 'value', text: '"Ada"' },
      { kind: 'mark', text: ',\n  ' },
      { kind: 'name', text: '"age"' },
      { kind: 'mark', text: ': ' },
      { kind: 'value', text: '36' },
      { kind: 'mark', text: '\n}' },
    ]);
  });

  it('keeps a value whole when it holds quotes, colons and angle brackets', () => {
    const values = markupParts(toJson(draft)).filter((part) => part.kind === 'value');
    expect(values.map((part) => part.text)).toEqual([
      '"https://schema.org"',
      '"Product"',
      '"A \\"quoted\\": name </script>"',
      '"Offer"',
      '9',
      'true',
    ]);
  });

  it('treats the script element around the JSON as punctuation', () => {
    const parts = markupParts(toScriptTag(draft));
    expect(parts[0]).toEqual({ kind: 'mark', text: '<script type="application/ld+json">\n{\n  ' });
    expect(parts.at(-1)).toEqual({ kind: 'mark', text: '\n}\n</script>' });
  });

  it('treats text that is not markup as punctuation', () => {
    expect(markupParts('nothing here')).toEqual([{ kind: 'mark', text: 'nothing here' }]);
  });
});
