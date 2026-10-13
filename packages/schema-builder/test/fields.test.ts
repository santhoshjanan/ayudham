import { describe, expect, it } from 'vitest';
import {
  accepts,
  DEFINITIONS,
  definitionAt,
  fieldsFor,
  parseVocabulary,
  propertyField,
  topDefinition,
} from '../src/index.ts';
import { draftOf, make, nested, ref, text } from './helpers.ts';

const vocabulary = parseVocabulary({
  version: 'test',
  types: {
    Thing: [],
    WebSite: ['Thing'],
    Enumeration: ['Thing'],
    Genre: ['Enumeration'],
    Text: [],
    URL: ['Text'],
  },
  properties: {
    name: { d: ['Thing'], r: ['Text'], c: 'The name of the item.' },
    url: { d: ['Thing'], r: ['URL'], c: '' },
    alternateName: { d: ['Thing'], r: ['Text'], c: '' },
    about: { d: ['WebSite'], r: ['Thing'], c: 'The subject matter.' },
    genre: { d: ['WebSite'], r: ['Genre'], c: '' },
  },
  enums: { Genre: ['Comedy'] },
  dataTypes: ['Text'],
})!;

describe('definitionAt', () => {
  const draft = draftOf(
    make(
      'Product',
      {
        offers: nested(make('Offer')),
        review: nested(make('Review', { reviewRating: nested(make('Rating')) })),
        isRelatedTo: nested(make('Product')),
      },
      'p',
    ),
    make('Movie', {}, 'm'),
  );
  const at = (...steps: [string, number][]) => ({
    key: 'p',
    steps: steps.map(([property, index]) => ({ property, index })),
  });

  it('finds the definition for a top-level item', () => {
    expect(definitionAt(draft, at())?.id).toBe('Product');
    expect(definitionAt(draft, { key: 'm', steps: [] })).toBeUndefined();
  });

  it('finds the definition a nested item is edited with', () => {
    expect(definitionAt(draft, at(['offers', 0]))?.id).toBe('Product.Offer');
    expect(definitionAt(draft, at(['review', 0], ['reviewRating', 0]))?.id).toBe('Rating');
  });

  it('finds none under a property the form does not guide, or off the end of a path', () => {
    expect(definitionAt(draft, at(['isRelatedTo', 0]))).toBeUndefined();
    expect(definitionAt(draft, at(['offers', 3]))).toBeUndefined();
    expect(definitionAt(draft, { key: 'gone', steps: [] })).toBeUndefined();
  });
});

describe('fieldsFor', () => {
  it('lists the guided fields, then further properties in the order they were added', () => {
    const item = make('WebSite', { genre: text('x'), name: text('pokerji'), about: text('y') });
    const fields = fieldsFor(item, topDefinition('WebSite'), vocabulary);
    expect(fields.map((field) => field.property)).toEqual([
      'name',
      'url',
      'alternateName',
      'genre',
      'about',
    ]);
    expect(fields[0]?.level).toBe('required');
    expect(fields[3]?.level).toBe('optional');
  });

  it('lists only what an unguided item holds', () => {
    const item = make('Thing', { url: text('https://x.example', 'url') });
    expect(fieldsFor(item, undefined, vocabulary).map((field) => field.property)).toEqual(['url']);
    expect(fieldsFor(make('Thing'), undefined, vocabulary)).toEqual([]);
  });
});

describe('propertyField', () => {
  it('describes a property from the vocabulary', () => {
    expect(propertyField(make('WebSite'), 'about', vocabulary)).toEqual({
      property: 'about',
      label: 'about',
      hint: 'The subject matter.',
      kinds: ['item', 'reference'],
      level: 'optional',
      repeats: true,
    });
    expect(propertyField(make('WebSite'), 'genre', vocabulary)).toMatchObject({
      kinds: ['text'],
      choices: ['https://schema.org/Comedy'],
    });
  });

  it('falls back to the kinds already held when the vocabulary is not loaded', () => {
    const item = make('Thing', { about: [nested(make('Thing')), ref('x'), nested(make('Thing'))] });
    expect(propertyField(item, 'about')).toEqual({
      property: 'about',
      label: 'about',
      hint: '',
      kinds: ['item', 'reference'],
      level: 'optional',
      repeats: true,
    });
    expect(propertyField(make('Thing'), 'anything').kinds).toEqual(['text']);
  });

  it('keeps a kind the item already holds, even if the vocabulary does not expect it', () => {
    const item = make('WebSite', { about: text('typed') });
    expect(propertyField(item, 'about', vocabulary).kinds).toEqual(['item', 'reference', 'text']);
  });
});

describe('accepts', () => {
  it('keeps a property the guided form has', () => {
    expect(accepts('WebSite', DEFINITIONS.WebSite, undefined, 'name')).toBe(true);
    expect(accepts('WebSite', DEFINITIONS.WebSite, undefined, 'about')).toBe(false);
  });

  it('keeps a property the vocabulary gives the type', () => {
    expect(accepts('WebSite', DEFINITIONS.WebSite, vocabulary, 'about')).toBe(true);
    expect(accepts('Thing', undefined, vocabulary, 'about')).toBe(false);
  });

  it('keeps everything for a type nothing is known about', () => {
    expect(accepts('Gadget', undefined, undefined, 'whatever')).toBe(true);
    expect(accepts('Gadget', undefined, vocabulary, 'whatever')).toBe(true);
  });
});
