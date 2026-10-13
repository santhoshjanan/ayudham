import { describe, expect, it } from 'vitest';
import {
  DEFINITIONS,
  GUIDED,
  nestedDefinition,
  RULES_CHECKED,
  topDefinition,
} from '../src/index.ts';

const all = Object.values(DEFINITIONS);

describe('the guided definitions', () => {
  it('offers the ten types in order', () => {
    expect(GUIDED).toEqual([
      'Organization',
      'LocalBusiness',
      'WebSite',
      'BreadcrumbList',
      'Article',
      'FAQPage',
      'Product',
      'Event',
      'Person',
      'Recipe',
    ]);
    for (const id of GUIDED) expect(DEFINITIONS[id]?.type).toBe(id);
  });

  it('files every definition under its own id', () => {
    for (const [id, definition] of Object.entries(DEFINITIONS)) expect(definition.id).toBe(id);
  });

  it('gives every field a label, at least one kind and no repeated property', () => {
    for (const definition of all) {
      const names = definition.fields.map((field) => field.property);
      expect(new Set(names).size, definition.id).toBe(names.length);
      for (const field of definition.fields) {
        expect(field.label, `${definition.id}.${field.property}`).not.toBe('');
        expect(field.kinds.length, `${definition.id}.${field.property}`).toBeGreaterThan(0);
      }
    }
  });

  it('points every nested item at a definition that exists', () => {
    for (const definition of all) {
      for (const field of definition.fields) {
        const where = `${definition.id}.${field.property}`;
        if (field.kinds.includes('item')) {
          expect(Object.keys(field.nested ?? {}).length, where).toBeGreaterThan(0);
        }
        for (const id of Object.values(field.nested ?? {})) {
          expect(DEFINITIONS[id], `${where} -> ${id}`).toBeDefined();
        }
      }
    }
  });

  it('offers choices only on text fields, as full Schema.org addresses', () => {
    for (const definition of all) {
      for (const field of definition.fields) {
        if (!field.choices) continue;
        expect(field.kinds[0]).toBe('text');
        for (const choice of field.choices) expect(choice).toMatch(/^https:\/\/schema\.org\/\w+$/);
      }
    }
  });

  it('names only its own fields in a one-of group', () => {
    for (const definition of all) {
      for (const group of definition.oneOf) {
        expect(group.length).toBeGreaterThan(1);
        for (const name of group) {
          expect(definition.fields.map((field) => field.property)).toContain(name);
        }
      }
    }
  });

  it('finds a top-level definition by type or variant, and nothing for a nested type', () => {
    expect(topDefinition('Article')?.id).toBe('Article');
    expect(topDefinition('BlogPosting')?.id).toBe('Article');
    expect(topDefinition('NewsArticle')?.id).toBe('Article');
    expect(topDefinition('Offer')).toBeUndefined();
    expect(topDefinition('PostalAddress')).toBeUndefined();
  });

  it('finds a nested definition through its field', () => {
    const offers = DEFINITIONS.Product?.fields.find((field) => field.property === 'offers');
    expect(nestedDefinition(offers, 'Offer')?.id).toBe('Product.Offer');
    expect(nestedDefinition(offers, 'Demand')).toBeUndefined();
    expect(nestedDefinition(undefined, 'Offer')).toBeUndefined();
  });

  it('marks the levels Google documents', () => {
    const levels = (id: string, level: string) =>
      DEFINITIONS[id]?.fields
        .filter((field) => field.level === level)
        .map((field) => field.property);
    expect(levels('Organization', 'required')).toEqual([]);
    expect(levels('LocalBusiness', 'required')).toEqual(['name', 'address']);
    expect(levels('WebSite', 'required')).toEqual(['name', 'url']);
    expect(levels('BreadcrumbList', 'required')).toEqual(['itemListElement']);
    expect(levels('Article', 'required')).toEqual([]);
    expect(levels('Article', 'recommended')).toEqual([
      'headline',
      'image',
      'datePublished',
      'dateModified',
      'author',
    ]);
    expect(levels('FAQPage', 'required')).toEqual([]);
    expect(levels('Product', 'required')).toEqual(['name']);
    expect(DEFINITIONS.Product?.oneOf).toEqual([['offers', 'aggregateRating', 'review']]);
    expect(levels('Product.Offer', 'required')).toEqual(['price']);
    expect(levels('Event', 'required')).toEqual(['name', 'startDate', 'location']);
    expect(levels('Event.Place', 'required')).toEqual(['address']);
    expect(levels('Person', 'required')).toEqual([]);
    expect(levels('Recipe', 'required')).toEqual(['name', 'image']);
    expect(levels('AggregateRating', 'required')).toEqual(['ratingValue']);
    expect(DEFINITIONS.AggregateRating?.oneOf).toEqual([['ratingCount', 'reviewCount']]);
  });

  it('says when the rules were last checked', () => {
    expect(RULES_CHECKED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
