import { describe, expect, it } from 'vitest';
import { emptyDraft, idsFor, serialize, toJson, toScriptTag } from '../src/index.ts';
import { draftOf, make, nested, ref, text } from './helpers.ts';

describe('serialize', () => {
  it('gives nothing for an empty draft', () => {
    expect(serialize(emptyDraft())).toBeUndefined();
    expect(toJson(emptyDraft())).toBe('');
    expect(toScriptTag(emptyDraft())).toBe('');
  });

  it('writes one item as one object with the context first', () => {
    const draft = draftOf(make('Thing', { name: text('Ada') }));
    expect(toJson(draft)).toBe(
      '{\n  "@context": "https://schema.org",\n  "@type": "Thing",\n  "name": "Ada"\n}',
    );
  });

  it('writes several items as one graph, in the draft’s order', () => {
    const draft = draftOf(
      make('Thing', { name: text('One') }),
      make('Thing', { name: text('Two') }),
    );
    expect(serialize(draft)).toEqual({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Thing', name: 'One' },
        { '@type': 'Thing', name: 'Two' },
      ],
    });
  });

  it('writes one value as a scalar and several as an array', () => {
    const draft = draftOf(
      make('Thing', {
        name: text('Ada'),
        sameAs: [text('https://a.example', 'url'), text('https://b.example', 'url')],
      }),
    );
    expect(serialize(draft)).toMatchObject({
      name: 'Ada',
      sameAs: ['https://a.example', 'https://b.example'],
    });
  });

  it('leaves out blank values, blank nested items and properties left with nothing', () => {
    const draft = draftOf(
      make('Product', {
        name: [text('  '), text('Kettle')],
        description: text(''),
        offers: nested(make('Offer', { price: text(' ', 'number') })),
      }),
    );
    expect(serialize(draft)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Kettle',
    });
  });

  it('still writes a top-level item that has no values yet', () => {
    expect(serialize(draftOf(make('Person')))).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Person',
    });
  });

  it('trims text, and writes a number only when it is exactly what was typed', () => {
    const draft = draftOf(
      make('Thing', {
        name: text('  Ada  '),
        a: text('42', 'number'),
        b: text('19.5', 'number'),
        c: text('19.50', 'number'),
        d: text('12,50', 'number'),
        e: text('-3', 'number'),
        f: text('007', 'number'),
      }),
    );
    expect(serialize(draft)).toMatchObject({
      name: 'Ada',
      a: 42,
      b: 19.5,
      c: '19.50',
      d: '12,50',
      e: -3,
      f: '007',
    });
  });

  it('writes booleans, including false', () => {
    const draft = draftOf(make('Thing', { isFamilyFriendly: { kind: 'boolean', on: false } }));
    expect(serialize(draft)).toMatchObject({ isFamilyFriendly: false });
  });

  it('writes a half-typed date or address as typed', () => {
    const draft = draftOf(
      make('Thing', { startDate: text('2026-13', 'date'), url: text('htp:/x', 'url') }),
    );
    expect(serialize(draft)).toMatchObject({ startDate: '2026-13', url: 'htp:/x' });
  });

  it('writes a nested item in place, with its own id when it has one', () => {
    const offer = { ...make('Offer', { price: text('9', 'number') }), id: '#offer' };
    const draft = draftOf(make('Product', { name: text('Kettle'), offers: nested(offer) }));
    expect(serialize(draft)).toMatchObject({
      offers: { '@type': 'Offer', '@id': '#offer', price: 9 },
    });
  });

  it('orders properties as the guided form does, then the rest as they were added', () => {
    const draft = draftOf(
      make('WebSite', {
        inLanguage: text('en'),
        alternateName: text('PJ'),
        url: text('https://pokerji.example', 'url'),
        name: text('pokerji'),
      }),
    );
    expect(Object.keys(serialize(draft) ?? {})).toEqual([
      '@context',
      '@type',
      'name',
      'url',
      'alternateName',
      'inLanguage',
    ]);
  });

  it('gives the same text for the same draft', () => {
    const draft = draftOf(make('Person', { name: text('Ada') }), make('Thing'));
    expect(toJson(draft)).toBe(toJson(structuredClone(draft)));
  });

  it('numbers breadcrumb steps from 1, counting only the steps that are written', () => {
    const draft = draftOf(
      make('BreadcrumbList', {
        itemListElement: [
          nested(make('ListItem', { name: text('Home'), item: text('https://x.example/', 'url') })),
          nested(make('ListItem')),
          nested(make('ListItem', { name: text('Shoes') })),
        ],
      }),
    );
    expect(serialize(draft)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://x.example/' },
        { '@type': 'ListItem', position: 2, name: 'Shoes' },
      ],
    });
  });
});

describe('ids and references', () => {
  it('gives an id only to an item that has its own or is referred to', () => {
    const draft = draftOf(
      make('Organization', { name: text('Acme') }, 'org'),
      { ...make('WebSite', {}, 'site'), id: 'https://acme.example/#site' },
      make('Article', { publisher: ref('org') }, 'art'),
    );
    expect([...idsFor(draft)]).toEqual([
      ['site', 'https://acme.example/#site'],
      ['org', '#organization'],
    ]);
    expect(serialize(draft)).toEqual({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', '@id': '#organization', name: 'Acme' },
        { '@type': 'WebSite', '@id': 'https://acme.example/#site' },
        { '@type': 'Article', publisher: { '@id': '#organization' } },
      ],
    });
  });

  it('numbers the second and later referred-to items of one type', () => {
    const draft = draftOf(
      make('Person', {}, 'a'),
      make('Person', {}, 'b'),
      make('Person', {}, 'c'),
      make('Article', { author: [ref('a'), ref('b'), ref('c')] }, 'art'),
    );
    expect([...idsFor(draft).values()]).toEqual(['#person', '#person-2', '#person-3']);
  });

  it('never gives two items the same id', () => {
    const draft = draftOf(
      { ...make('Thing', {}, 'mine'), id: '#person' },
      make('Person', {}, 'a'),
      { ...make('Thing', {}, 'also'), id: '#person-2' },
      make('Person', {}, 'b'),
      make('Article', { author: [ref('a'), ref('b')] }, 'art'),
    );
    const ids = [...idsFor(draft).values()];
    expect(new Set(ids).size).toBe(ids.length);
    expect(idsFor(draft).get('a')).toBe('#person-3');
    expect(idsFor(draft).get('b')).toBe('#person-4');
  });

  it('refers by the person’s own id when the target has one', () => {
    const draft = draftOf(
      { ...make('Organization', {}, 'org'), id: 'https://acme.example/#org' },
      make('WebSite', { publisher: ref('org') }, 'site'),
    );
    expect(serialize(draft)).toMatchObject({
      '@graph': [{}, { publisher: { '@id': 'https://acme.example/#org' } }],
    });
  });

  it('drops a reference to an item that is gone, without throwing', () => {
    const draft = draftOf(make('Article', { headline: text('Hi'), author: ref('gone') }, 'art'));
    expect(serialize(draft)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Hi',
    });
  });

  it('finds a reference inside a nested item', () => {
    const draft = draftOf(
      make('Organization', {}, 'org'),
      make('Article', { author: nested(make('Person', { worksFor: ref('org') })) }, 'art'),
    );
    expect(idsFor(draft).get('org')).toBe('#organization');
  });
});

describe('the script tag', () => {
  it('wraps the JSON in a JSON-LD script element', () => {
    const tag = toScriptTag(draftOf(make('Thing', { name: text('Ada') })));
    expect(tag.startsWith('<script type="application/ld+json">\n{')).toBe(true);
    expect(tag.endsWith('}\n</script>')).toBe(true);
  });

  it('cannot be ended early by anything typed into a value', () => {
    const hostile = '</script><script>alert(1)</script><!-- <b>';
    const draft = draftOf(make('Thing', { name: text(hostile) }));
    const tag = toScriptTag(draft);
    const inside = tag.slice('<script type="application/ld+json">'.length, -'</script>'.length);
    expect(inside).not.toContain('<');
    expect(JSON.parse(inside)).toMatchObject({ name: hostile });
  });

  it('leaves the raw form alone', () => {
    const draft = draftOf(make('Thing', { name: text('a < b') }));
    expect(toJson(draft)).toContain('a < b');
  });
});
