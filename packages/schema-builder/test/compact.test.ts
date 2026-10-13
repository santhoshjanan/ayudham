import { describe, expect, it } from 'vitest';
import { compact, summary } from '../scripts/compact.ts';

const id = (name: string) => ({ '@id': `schema:${name}` });

/** A release file in miniature, in the shape Schema.org publishes. */
const RELEASE = {
  '@context': { schema: 'https://schema.org/' },
  '@graph': [
    {
      '@id': 'schema:name',
      '@type': 'rdf:Property',
      'rdfs:comment': 'The name of the item.',
      'schema:domainIncludes': id('Thing'),
      'schema:rangeIncludes': id('Text'),
    },
    { '@id': 'schema:Thing', '@type': 'rdfs:Class', 'rdfs:comment': 'The most generic type.' },
    { '@id': 'schema:Text', '@type': ['rdfs:Class', 'schema:DataType'] },
    { '@id': 'schema:URL', '@type': 'rdfs:Class', 'rdfs:subClassOf': id('Text') },
    {
      '@id': 'schema:Offer',
      '@type': 'rdfs:Class',
      'rdfs:subClassOf': [id('Thing'), { '@id': 'bibo:Deal' }],
    },
    { '@id': 'schema:Enumeration', '@type': 'rdfs:Class', 'rdfs:subClassOf': id('Thing') },
    {
      '@id': 'schema:ItemAvailability',
      '@type': 'rdfs:Class',
      'rdfs:subClassOf': id('Enumeration'),
    },
    { '@id': 'schema:OutOfStock', '@type': 'schema:ItemAvailability' },
    { '@id': 'schema:InStock', '@type': 'schema:ItemAvailability' },
    {
      '@id': 'schema:availability',
      '@type': 'rdf:Property',
      'rdfs:comment': {
        '@language': 'en',
        '@value': 'Whether it is in stock&#x2014;or not. See [[Offer]].',
      },
      'schema:domainIncludes': [id('Offer'), id('Gone')],
      'schema:rangeIncludes': id('ItemAvailability'),
    },
    {
      '@id': 'schema:Gone',
      '@type': 'rdfs:Class',
      'schema:isPartOf': { '@id': 'https://attic.schema.org' },
    },
    {
      '@id': 'schema:New',
      '@type': 'rdfs:Class',
      'schema:isPartOf': { '@id': 'https://pending.schema.org' },
    },
    {
      '@id': 'schema:soon',
      '@type': 'rdf:Property',
      'schema:domainIncludes': id('Thing'),
      'schema:isPartOf': { '@id': 'https://pending.schema.org' },
    },
    {
      '@id': 'schema:orphan',
      '@type': 'rdf:Property',
      'schema:domainIncludes': id('New'),
      'schema:rangeIncludes': id('Text'),
    },
    { '@id': 'bibo:Issue', '@type': 'rdfs:Class' },
  ],
};

describe('compact', () => {
  const out = JSON.parse(compact(RELEASE, '0.1'));

  it('keeps types with their parents, and marks data types', () => {
    expect(out.version).toBe('0.1');
    expect(out.types).toEqual({
      Enumeration: ['Thing'],
      ItemAvailability: ['Enumeration'],
      Offer: ['Thing'],
      Text: [],
      Thing: [],
      URL: ['Text'],
    });
    expect(out.dataTypes).toEqual(['Text']);
  });

  it('keeps properties with where they belong, what they expect and one sentence', () => {
    expect(out.properties).toEqual({
      availability: {
        d: ['Offer'],
        r: ['ItemAvailability'],
        c: 'Whether it is in stock\u2014or not.',
      },
      name: { d: ['Thing'], r: ['Text'], c: 'The name of the item.' },
    });
  });

  it('lists the members of an enumeration in order', () => {
    expect(out.enums).toEqual({ ItemAvailability: ['InStock', 'OutOfStock'] });
  });

  it('drops pending and attic terms, terms from other vocabularies, and properties left with no type', () => {
    expect(out.types.Gone).toBeUndefined();
    expect(out.types.New).toBeUndefined();
    expect(out.types.Issue).toBeUndefined();
    expect(out.properties.soon).toBeUndefined();
    expect(out.properties.orphan).toBeUndefined();
  });

  it('gives identical output however the release is ordered', () => {
    const shuffled = { ...RELEASE, '@graph': [...RELEASE['@graph']].reverse() };
    expect(compact(shuffled, '0.1')).toBe(compact(RELEASE, '0.1'));
    expect(compact(RELEASE, '0.1').endsWith('}\n')).toBe(true);
  });

  it('accepts full addresses as well as the schema: prefix', () => {
    const full = {
      '@graph': [
        { '@id': 'https://schema.org/Thing', '@type': 'rdfs:Class' },
        {
          '@id': 'https://schema.org/name',
          '@type': 'rdf:Property',
          'schema:domainIncludes': { '@id': 'https://schema.org/Thing' },
        },
      ],
    };
    expect(JSON.parse(compact(full, '0.1')).properties.name.d).toEqual(['Thing']);
  });
});

describe('summary', () => {
  it('keeps the first sentence', () => {
    expect(summary('An offer to sell. For example a ticket.')).toBe('An offer to sell.');
  });

  it('does not stop at an abbreviation', () => {
    expect(summary('A form of offer (e.g. sell, lease). More here.')).toBe(
      'A form of offer (e.g. sell, lease).',
    );
  });

  it('strips markup, links and escaped line breaks, and decodes entities', () => {
    expect(
      summary('The <b>size</b> of [[Thing]]\\n\\nsee [docs](http://x.example) &amp; more'),
    ).toBe('The size of Thing see docs & more');
  });

  it('cuts a long sentence at 200 characters', () => {
    const cut = summary('x'.repeat(400));
    expect(cut.length).toBe(200);
    expect(cut.endsWith('…')).toBe(true);
  });
});
