import { describe, expect, it } from 'vitest';
import type { Finding } from '../src/index.ts';
import { check, parseVocabulary } from '../src/index.ts';
import { draftOf, make, nested, ref, text } from './helpers.ts';

const kinds = (findings: Finding[], kind: string) =>
  findings.filter((finding) => finding.kind === kind).map((finding) => finding.property);

describe('required and recommended', () => {
  it('reports what an empty guided item is missing', () => {
    const findings = check(draftOf(make('LocalBusiness', {}, 'shop')));
    expect(kinds(findings, 'missing-required')).toEqual(['name', 'address']);
    expect(kinds(findings, 'missing-recommended')).toEqual([
      'url',
      'telephone',
      'priceRange',
      'geo',
      'openingHoursSpecification',
    ]);
    expect(findings[0]).toEqual({
      item: 'shop',
      steps: [],
      property: 'name',
      kind: 'missing-required',
    });
  });

  it('treats a blank value as missing', () => {
    const draft = draftOf(
      make('WebSite', { name: text('  '), url: text('https://x.example', 'url') }),
    );
    expect(kinds(check(draft), 'missing-required')).toEqual(['name']);
  });

  it('applies a variant’s rules', () => {
    expect(kinds(check(draftOf(make('BlogPosting'))), 'missing-recommended')).toContain('headline');
  });

  it('has no required or recommended rules for a type outside the ten', () => {
    expect(check(draftOf(make('Movie')))).toEqual([]);
  });

  it('looks inside a nested item only once it has a value', () => {
    const empty = draftOf(make('Product', { name: text('Kettle'), offers: nested(make('Offer')) }));
    expect(kinds(check(empty), 'missing-required')).toEqual(['offers']);

    const started = draftOf(
      make(
        'Product',
        { name: text('Kettle'), offers: nested(make('Offer', { priceCurrency: text('USD') })) },
        'p',
      ),
    );
    const findings = check(started);
    expect(findings.filter((finding) => finding.kind === 'missing-required')).toEqual([
      {
        item: 'p',
        steps: [{ property: 'offers', index: 0 }],
        property: 'price',
        kind: 'missing-required',
      },
    ]);
    expect(kinds(findings, 'missing-recommended')).toEqual(['availability', 'priceValidUntil']);
  });

  it('reports a one-of group once, naming the group, and not its members again', () => {
    const findings = check(draftOf(make('Product', { name: text('Kettle') }, 'p')));
    expect(findings).toEqual([
      {
        item: 'p',
        steps: [],
        property: 'offers',
        kind: 'missing-required',
        anyOf: ['offers', 'aggregateRating', 'review'],
      },
    ]);
  });

  it('is satisfied by any member of a one-of group', () => {
    const rating = make('AggregateRating', {
      ratingValue: text('4.5', 'number'),
      reviewCount: text('12', 'number'),
      bestRating: text('5', 'number'),
      worstRating: text('1', 'number'),
    });
    const draft = draftOf(
      make('Product', { name: text('Kettle'), aggregateRating: nested(rating) }),
    );
    expect(check(draft)).toEqual([
      expect.objectContaining({ property: 'offers', kind: 'missing-recommended' }),
    ]);
  });

  it('uses the rules of the place a nested type appears in', () => {
    const product = draftOf(
      make('Product', {
        name: text('K'),
        offers: nested(make('Offer', { url: text('https://x.example', 'url') })),
      }),
    );
    const event = draftOf(
      make('Event', {
        name: text('Gig'),
        startDate: text('2026-11-02', 'date'),
        location: nested(make('Place', { name: text('Hall') })),
        offers: nested(make('Offer', { url: text('https://x.example', 'url') })),
      }),
    );
    expect(kinds(check(product), 'missing-required')).toEqual(['price']);
    expect(kinds(check(event), 'missing-required')).toEqual(['address']);
  });
});

describe('malformed values', () => {
  const one = (kind: Parameters<typeof text>[1], typed: string) =>
    check(draftOf(make('Thing', { x: text(typed, kind) }, 'a')));

  it('accepts absolute web addresses only', () => {
    expect(one('url', 'https://example.com/a?b=c#d')).toEqual([]);
    expect(one('url', 'http://example.com')).toEqual([]);
    for (const bad of [
      'htp:/x',
      'example.com',
      '/about',
      'javascript:alert(1)',
      'https://',
      'https://a b',
    ]) {
      expect(one('url', bad), bad).toEqual([
        { item: 'a', steps: [], property: 'x', index: 0, kind: 'bad-url' },
      ]);
    }
  });

  it('accepts real dates only', () => {
    expect(one('date', '2026-10-13')).toEqual([]);
    expect(one('date', '2028-02-29')).toEqual([]);
    for (const bad of ['2026-13', '2026-13-01', '2026-02-30', '13/10/2026', '2026-10-13T08:00']) {
      expect(kinds(one('date', bad), 'bad-date'), bad).toEqual(['x']);
    }
  });

  it('accepts a date and time, with or without seconds and zone, or a date alone', () => {
    for (const good of [
      '2026-11-02T19:00',
      '2026-11-02T19:00:00',
      '2026-11-02T19:00:00Z',
      '2026-11-02T19:00:00-05:00',
      '2026-11-02',
    ]) {
      expect(one('dateTime', good), good).toEqual([]);
    }
    for (const bad of ['2026-11-02 19:00', '2026-11-02T25:00', 'tomorrow', '2026-11-02T19:00T']) {
      expect(kinds(one('dateTime', bad), 'bad-date'), bad).toEqual(['x']);
    }
  });

  it('accepts a time of day', () => {
    expect(one('time', '09:00')).toEqual([]);
    expect(one('time', '17:30:00')).toEqual([]);
    expect(kinds(one('time', '9am'), 'bad-date')).toEqual(['x']);
    expect(kinds(one('time', '24:00'), 'bad-date')).toEqual(['x']);
  });

  it('accepts plain numbers only', () => {
    for (const good of ['0', '42', '-3', '19.50', '007'])
      expect(one('number', good), good).toEqual([]);
    for (const bad of ['12,50', '$5', '1e3', 'five', '1.', '.5']) {
      expect(kinds(one('number', bad), 'bad-number'), bad).toEqual(['x']);
    }
  });

  it('says nothing about a blank value', () => {
    expect(one('url', '  ')).toEqual([]);
    expect(one('number', '')).toEqual([]);
  });

  it('checks a currency code where the form asks for one', () => {
    const offer = (currency: string) =>
      check(
        draftOf(
          make('Product', {
            name: text('K'),
            offers: nested(
              make('Offer', {
                price: text('5', 'number'),
                priceCurrency: text(currency),
                availability: text('https://schema.org/InStock'),
                priceValidUntil: text('2027-01-01', 'date'),
              }),
            ),
          }),
        ),
      );
    expect(offer('USD')).toEqual([]);
    expect(offer('usd')).toEqual([]);
    expect(kinds(offer('dollars'), 'bad-currency')).toEqual(['priceCurrency']);
    expect(kinds(offer('$'), 'bad-currency')).toEqual(['priceCurrency']);
  });

  it('checks a rating against the scale beside it, or 1 to 5', () => {
    const rated = (value: string, extra: Record<string, ReturnType<typeof text>> = {}) =>
      check(
        draftOf(
          make('Product', {
            name: text('K'),
            offers: nested(
              make('Offer', {
                price: text('5', 'number'),
                priceCurrency: text('USD'),
                availability: text('https://schema.org/InStock'),
                priceValidUntil: text('2027-01-01', 'date'),
              }),
            ),
            aggregateRating: nested(
              make('AggregateRating', {
                ratingValue: text(value, 'number'),
                ratingCount: text('3', 'number'),
                bestRating: text('5', 'number'),
                worstRating: text('1', 'number'),
                ...extra,
              }),
            ),
          }),
        ),
      );
    expect(rated('4.5')).toEqual([]);
    expect(kinds(rated('7'), 'out-of-range')).toEqual(['ratingValue']);
    expect(kinds(rated('0'), 'out-of-range')).toEqual(['ratingValue']);
    expect(rated('7', { bestRating: text('10', 'number') })).toEqual([]);
    expect(kinds(rated('seven'), 'out-of-range')).toEqual([]);
    expect(kinds(rated('seven'), 'bad-number')).toEqual(['ratingValue']);
  });

  it('reports a reference to an item that is gone, and not one that is there', () => {
    const draft = draftOf(
      make('Organization', { name: text('Acme') }, 'org'),
      make('Movie', { productionCompany: [ref('org'), ref('gone')] }, 'film'),
    );
    expect(check(draft).filter((finding) => finding.item === 'film')).toEqual([
      {
        item: 'film',
        steps: [],
        property: 'productionCompany',
        index: 1,
        kind: 'dangling-reference',
      },
    ]);
  });

  it('does not count a dangling reference as a missing value', () => {
    const draft = draftOf(
      make('WebSite', { name: ref('gone'), url: text('https://x.example', 'url') }),
    );
    expect(kinds(check(draft), 'missing-required')).toEqual([]);
    expect(kinds(check(draft), 'dangling-reference')).toEqual(['name']);
  });

  it('reports findings in the draft’s order, at any depth', () => {
    const draft = draftOf(
      make('Movie', { url: text('nope', 'url') }, 'a'),
      make(
        'Movie',
        {
          about: nested(
            make('Thing', { about: nested(make('Thing', { url: text('nope', 'url') })) }),
          ),
        },
        'b',
      ),
    );
    expect(check(draft)).toEqual([
      { item: 'a', steps: [], property: 'url', index: 0, kind: 'bad-url' },
      {
        item: 'b',
        steps: [
          { property: 'about', index: 0 },
          { property: 'about', index: 0 },
        ],
        property: 'url',
        index: 0,
        kind: 'bad-url',
      },
    ]);
  });
});

describe('with the vocabulary', () => {
  const vocabulary = parseVocabulary({
    version: 'test',
    types: { Thing: [], Movie: ['Thing'] },
    properties: {
      name: { d: ['Thing'], r: [], c: '' },
      duration: { d: ['Movie'], r: [], c: '' },
    },
    enums: {},
    dataTypes: [],
  })!;

  it('reports a property the type does not have', () => {
    const draft = draftOf(make('Thing', { name: text('x'), duration: text('PT2H') }, 'a'));
    expect(check(draft, vocabulary)).toEqual([
      { item: 'a', steps: [], property: 'duration', kind: 'unknown-property' },
    ]);
    expect(check(draftOf(make('Movie', { duration: text('PT2H') })), vocabulary)).toEqual([]);
  });

  it('says nothing about properties without the vocabulary, or for a type it does not know', () => {
    expect(check(draftOf(make('Thing', { duration: text('PT2H') })))).toEqual([]);
    expect(check(draftOf(make('Gadget', { whatever: text('x') })), vocabulary)).toEqual([]);
  });
});
