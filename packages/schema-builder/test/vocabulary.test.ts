import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFINITIONS,
  describeProperty,
  expects,
  hasProperty,
  lineage,
  parseVocabulary,
  propertiesOf,
  searchProperties,
  searchTypes,
} from '../src/index.ts';

const STATIC = fileURLToPath(new URL('../../../apps/web/static/schema/', import.meta.url));

const SMALL = {
  version: 'test',
  types: {
    Thing: [],
    CreativeWork: ['Thing'],
    Article: ['CreativeWork'],
    Place: ['Thing'],
    Organization: ['Thing'],
    LocalBusiness: ['Organization', 'Place'],
    Enumeration: ['Thing'],
    ItemAvailability: ['Enumeration'],
    Offer: ['Thing'],
    Text: [],
    URL: ['Text'],
    Number: [],
    Integer: ['Number'],
    Boolean: [],
    Date: [],
    DateTime: [],
    Time: [],
    Quantity: [],
    Duration: ['Quantity'],
  },
  properties: {
    name: { d: ['Thing'], r: ['Text'], c: 'The name of the item.' },
    url: { d: ['Thing'], r: ['URL'], c: 'The address of the item.' },
    headline: { d: ['CreativeWork'], r: ['Text'], c: 'Headline of the article.' },
    wordCount: { d: ['Article'], r: ['Integer'], c: '' },
    geo: { d: ['Place'], r: ['Thing'], c: '' },
    legalName: { d: ['Organization'], r: ['Text'], c: '' },
    priceRange: { d: ['LocalBusiness'], r: ['Text'], c: '' },
    availability: { d: ['Offer'], r: ['ItemAvailability'], c: '' },
    category: { d: ['Offer'], r: ['ItemAvailability', 'Text', 'Thing'], c: '' },
    validFrom: { d: ['Offer'], r: ['DateTime', 'Date'], c: '' },
    logo: { d: ['Organization'], r: ['Thing', 'URL'], c: '' },
    isFree: { d: ['Offer'], r: ['Boolean'], c: '' },
    opens: { d: ['Place'], r: ['Time'], c: '' },
    prepTime: { d: ['CreativeWork'], r: ['Duration'], c: '' },
  },
  enums: { ItemAvailability: ['InStock', 'OutOfStock'] },
  dataTypes: ['Boolean', 'Date', 'DateTime', 'Number', 'Quantity', 'Text', 'Time'],
};

describe('a parsed vocabulary', () => {
  const vocabulary = parseVocabulary(SMALL)!;

  it('refuses anything that is not a vocabulary', () => {
    expect(parseVocabulary(null)).toBeUndefined();
    expect(parseVocabulary('{}')).toBeUndefined();
    expect(parseVocabulary({ ...SMALL, types: [] })).toBeUndefined();
    expect(parseVocabulary({ ...SMALL, properties: { name: { d: 'Thing' } } })).toBeUndefined();
  });

  it('lists a type, then its ancestors nearest first, once each', () => {
    expect(lineage(vocabulary, 'Article')).toEqual(['Article', 'CreativeWork', 'Thing']);
    expect(lineage(vocabulary, 'LocalBusiness')).toEqual([
      'LocalBusiness',
      'Organization',
      'Place',
      'Thing',
    ]);
    expect(lineage(vocabulary, 'Nonsense')).toEqual([]);
  });

  it('lists a type’s own properties first, then each ancestor’s', () => {
    expect(propertiesOf(vocabulary, 'LocalBusiness')).toEqual([
      'priceRange',
      'legalName',
      'logo',
      'geo',
      'opens',
      'name',
      'url',
    ]);
    expect(propertiesOf(vocabulary, 'Nonsense')).toEqual([]);
  });

  it('says whether a type has a property', () => {
    expect(hasProperty(vocabulary, 'Article', 'name')).toBe(true);
    expect(hasProperty(vocabulary, 'Article', 'legalName')).toBe(false);
  });

  it('searches types by name, leaving out data types', () => {
    expect(searchTypes(vocabulary, 'art')).toEqual(['Article']);
    expect(searchTypes(vocabulary, 'o')).toEqual([
      'Offer',
      'Organization',
      'CreativeWork',
      'Enumeration',
      'LocalBusiness',
    ]);
    expect(searchTypes(vocabulary, 'text')).toEqual([]);
    expect(searchTypes(vocabulary, 'url')).toEqual([]);
    expect(searchTypes(vocabulary, '', 3)).toHaveLength(3);
  });

  it('searches a type’s properties', () => {
    expect(searchProperties(vocabulary, 'Article', 'na')).toEqual(['name']);
    expect(searchProperties(vocabulary, 'Article', 'e')).toEqual(['headline', 'prepTime', 'name']);
  });

  it('turns what a property expects into kinds, simplest first', () => {
    expect(expects(vocabulary, 'name')).toEqual({ kinds: ['text'], itemTypes: [], choices: [] });
    expect(expects(vocabulary, 'url').kinds).toEqual(['url']);
    expect(expects(vocabulary, 'wordCount').kinds).toEqual(['number']);
    expect(expects(vocabulary, 'isFree').kinds).toEqual(['boolean']);
    expect(expects(vocabulary, 'opens').kinds).toEqual(['time']);
    expect(expects(vocabulary, 'prepTime').kinds).toEqual(['text']);
    expect(expects(vocabulary, 'validFrom').kinds).toEqual(['date', 'dateTime']);
    expect(expects(vocabulary, 'logo')).toEqual({
      kinds: ['url', 'item', 'reference'],
      itemTypes: ['Thing'],
      choices: [],
    });
    expect(expects(vocabulary, 'availability')).toEqual({
      kinds: ['text'],
      itemTypes: [],
      choices: ['https://schema.org/InStock', 'https://schema.org/OutOfStock'],
    });
    // Free text is allowed too, so the list must not be the only way to answer.
    expect(expects(vocabulary, 'category')).toEqual({
      kinds: ['text', 'item', 'reference'],
      itemTypes: ['Thing'],
      choices: [],
    });
    expect(expects(vocabulary, 'nonsense')).toEqual({
      kinds: ['text'],
      itemTypes: [],
      choices: [],
    });
  });

  it('describes a property', () => {
    expect(describeProperty(vocabulary, 'name')).toBe('The name of the item.');
    expect(describeProperty(vocabulary, 'nonsense')).toBe('');
  });
});

describe('the bundled vocabulary', () => {
  const file = readFileSync(`${STATIC}vocabulary.json`);
  const vocabulary = parseVocabulary(JSON.parse(file.toString('utf8')))!;

  it('is the file LICENSES.md records', () => {
    const sha256 = createHash('sha256').update(file).digest('hex');
    expect(readFileSync(`${STATIC}LICENSES.md`, 'utf8')).toContain(`\`${sha256}\``);
  });

  it('parses, and is Schema.org 30.1', () => {
    expect(vocabulary.version).toBe('30.1');
    expect(vocabulary.types.size).toBeGreaterThan(800);
    expect(vocabulary.properties.size).toBeGreaterThan(1_300);
  });

  it('knows every type and property the guided forms use', () => {
    for (const definition of Object.values(DEFINITIONS)) {
      const types = [definition.type, ...definition.variants];
      for (const type of types) {
        expect(vocabulary.types.has(type), type).toBe(true);
        for (const field of definition.fields) {
          expect(hasProperty(vocabulary, type, field.property), `${type}.${field.property}`).toBe(
            true,
          );
        }
      }
      for (const field of definition.fields) {
        for (const type of Object.keys(field.nested ?? {})) {
          expect(vocabulary.types.has(type), `${definition.id}.${field.property}: ${type}`).toBe(
            true,
          );
        }
        for (const choice of field.choices ?? []) {
          const member = choice.slice('https://schema.org/'.length);
          expect(
            [...vocabulary.enums.values()].some((members) => members.includes(member)),
            choice,
          ).toBe(true);
        }
      }
    }
  });

  it('holds only plain text in descriptions', () => {
    for (const [name, property] of vocabulary.properties) {
      expect(property.comment, name).not.toMatch(/<[a-z/]/i);
      expect(property.comment.length, name).toBeLessThanOrEqual(200);
    }
  });
});
