import { describe, expect, it } from 'vitest';
import type { Finding } from '../src/index.ts';
import {
  check,
  findingWords,
  itemTitle,
  REFUSAL_WORDS,
  REFUSALS,
  typeLabel,
} from '../src/index.ts';
import { draftOf, make, nested, ref, text } from './helpers.ts';

describe('typeLabel', () => {
  it('uses a guided type’s label', () => {
    expect(typeLabel('LocalBusiness')).toBe('Local business');
    expect(typeLabel('FAQPage')).toBe('FAQ page');
  });

  it('spaces out any other type name', () => {
    expect(typeLabel('PostalAddress')).toBe('Postal address');
    expect(typeLabel('BlogPosting')).toBe('Blog posting');
    expect(typeLabel('Movie')).toBe('Movie');
  });
});

describe('itemTitle', () => {
  it('adds the name or headline when there is one', () => {
    expect(itemTitle(make('Organization', { name: text('Acme') }))).toBe('Organization: Acme');
    expect(itemTitle(make('Article', { headline: text(' Hi ') }))).toBe('Article: Hi');
    expect(itemTitle(make('Organization', { name: text('  ') }))).toBe('Organization');
    expect(itemTitle(make('Movie'))).toBe('Movie');
  });
});

describe('findingWords', () => {
  const words = (draft: ReturnType<typeof draftOf>, pick: (finding: Finding) => boolean) =>
    findingWords(draft, check(draft).find(pick)!);

  it('names the field by its label', () => {
    const draft = draftOf(make('WebSite', { name: text('Acme') }));
    expect(words(draft, (f) => f.property === 'url')).toEqual({
      where: 'Website: Acme',
      text: 'Home page is required.',
    });
    expect(words(draft, (f) => f.property === 'alternateName').text).toBe(
      'Other names is recommended.',
    );
  });

  it('says where a nested field is', () => {
    const draft = draftOf(
      make('Product', {
        name: text('Kettle'),
        offers: nested(make('Offer', { priceCurrency: text('USD') })),
      }),
    );
    expect(words(draft, (f) => f.property === 'price')).toEqual({
      where: 'Product: Kettle › Offer',
      text: 'Price is required.',
    });
  });

  it('lists the choices of an at-least-one group', () => {
    const draft = draftOf(make('Product', { name: text('Kettle') }));
    expect(words(draft, (f) => f.anyOf !== undefined).text).toBe(
      'Add at least one of: Offer, Average rating, Review.',
    );
  });

  it('has a sentence for every kind of malformed value', () => {
    const draft = draftOf(
      make('Movie', {
        url: text('nope', 'url'),
        dateCreated: text('nope', 'date'),
        duration: text('nope', 'number'),
        about: ref('gone'),
      }),
    );
    const sentences = check(draft).map((finding) => findingWords(draft, finding).text);
    expect(sentences).toEqual([
      'url is not a full web address. It should start with https://.',
      'dateCreated is not a date or time in the expected form, such as 2026-10-13.',
      'duration is not a plain number, such as 19.99.',
      'about refers to an item that has been removed.',
    ]);
  });

  it('has a sentence for a currency, a rating and an unknown property', () => {
    const at = { item: 'k', steps: [] };
    const draft = draftOf(make('Movie', {}, 'k'));
    const text = (finding: Finding) => findingWords(draft, finding).text;
    expect(text({ ...at, property: 'priceCurrency', index: 0, kind: 'bad-currency' })).toBe(
      'priceCurrency should be a three-letter currency code, such as USD.',
    );
    expect(text({ ...at, property: 'ratingValue', index: 0, kind: 'out-of-range' })).toBe(
      'ratingValue is outside the rating scale.',
    );
    expect(text({ ...at, property: 'bogus', kind: 'unknown-property' })).toBe(
      'Movie has no property called bogus.',
    );
  });

  it('still answers for a finding whose item is gone', () => {
    const finding: Finding = {
      item: 'gone',
      steps: [],
      property: 'name',
      kind: 'missing-required',
    };
    expect(findingWords(draftOf(), finding)).toEqual({ where: '', text: 'name is required.' });
  });
});

describe('REFUSAL_WORDS', () => {
  it('has a sentence for every refusal', () => {
    for (const refusal of REFUSALS) {
      expect(REFUSAL_WORDS[refusal], refusal).toMatch(/^[A-Z].+\.$/);
    }
  });
});
