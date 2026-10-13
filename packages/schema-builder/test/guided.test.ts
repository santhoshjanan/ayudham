import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Draft, JsonObject } from '../src/index.ts';
import { check, GUIDED, parseVocabulary, serialize } from '../src/index.ts';
import { draftOf, make, nested, text } from './helpers.ts';

const vocabulary = parseVocabulary(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../apps/web/static/schema/vocabulary.json', import.meta.url)),
      'utf8',
    ),
  ),
)!;

const url = (address: string) => text(address, 'url');
const number = (typed: string) => text(typed, 'number');
const date = (typed: string) => text(typed, 'date');
const dateTime = (typed: string) => text(typed, 'dateTime');
const person = (name: string) => nested(make('Person', { name: text(name) }));
const postal = () =>
  nested(
    make('PostalAddress', {
      streetAddress: text('1 Main St'),
      addressLocality: text('Hoboken'),
      addressRegion: text('NJ'),
      postalCode: text('07030'),
      addressCountry: text('US'),
    }),
  );
const POSTAL = {
  '@type': 'PostalAddress',
  streetAddress: '1 Main St',
  addressLocality: 'Hoboken',
  addressRegion: 'NJ',
  postalCode: '07030',
  addressCountry: 'US',
};
const CONTEXT = { '@context': 'https://schema.org' };

/** Each guided type filled in, and the markup it should give. */
const CASES: Record<string, { draft: Draft; markup: JsonObject; required: string[] }> = {
  Organization: {
    draft: draftOf(
      make('Organization', {
        sameAs: [url('https://social.example/acme'), url('https://video.example/acme')],
        name: text('Acme'),
        url: url('https://acme.example'),
        logo: url('https://acme.example/logo.png'),
        address: postal(),
        contactPoint: nested(make('ContactPoint', { telephone: text('+1 201 555 0100') })),
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'Organization',
      name: 'Acme',
      url: 'https://acme.example',
      logo: 'https://acme.example/logo.png',
      address: POSTAL,
      contactPoint: { '@type': 'ContactPoint', telephone: '+1 201 555 0100' },
      sameAs: ['https://social.example/acme', 'https://video.example/acme'],
    },
    required: [],
  },
  LocalBusiness: {
    draft: draftOf(
      make('LocalBusiness', {
        name: text('Acme Bakery'),
        address: postal(),
        geo: nested(
          make('GeoCoordinates', { latitude: number('40.74399'), longitude: number('-74.03236') }),
        ),
        openingHoursSpecification: nested(
          make('OpeningHoursSpecification', {
            dayOfWeek: [text('https://schema.org/Saturday'), text('https://schema.org/Sunday')],
            opens: text('08:00', 'time'),
            closes: text('14:00', 'time'),
          }),
        ),
        priceRange: text('$$'),
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'LocalBusiness',
      name: 'Acme Bakery',
      address: POSTAL,
      priceRange: '$$',
      geo: { '@type': 'GeoCoordinates', latitude: 40.74399, longitude: -74.03236 },
      openingHoursSpecification: {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['https://schema.org/Saturday', 'https://schema.org/Sunday'],
        opens: '08:00',
        closes: '14:00',
      },
    },
    required: ['name', 'address'],
  },
  WebSite: {
    draft: draftOf(
      make('WebSite', {
        name: text('Acme'),
        url: url('https://acme.example/'),
        alternateName: text('AC'),
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'WebSite',
      name: 'Acme',
      url: 'https://acme.example/',
      alternateName: 'AC',
    },
    required: ['name', 'url'],
  },
  BreadcrumbList: {
    draft: draftOf(
      make('BreadcrumbList', {
        itemListElement: [
          nested(make('ListItem', { name: text('Home'), item: url('https://acme.example/') })),
          nested(
            make('ListItem', { name: text('Bread'), item: url('https://acme.example/bread') }),
          ),
          nested(make('ListItem', { name: text('Sourdough') })),
        ],
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://acme.example/' },
        { '@type': 'ListItem', position: 2, name: 'Bread', item: 'https://acme.example/bread' },
        { '@type': 'ListItem', position: 3, name: 'Sourdough' },
      ],
    },
    required: ['itemListElement'],
  },
  Article: {
    draft: draftOf(
      make('BlogPosting', {
        headline: text('How we bake'),
        image: url('https://acme.example/oven.jpg'),
        datePublished: dateTime('2026-10-13T08:00:00+00:00'),
        dateModified: date('2026-10-14'),
        author: [
          nested(make('Person', { name: text('Ada'), url: url('https://acme.example/ada') })),
          nested(make('Organization', { name: text('Acme') })),
        ],
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'BlogPosting',
      headline: 'How we bake',
      image: 'https://acme.example/oven.jpg',
      datePublished: '2026-10-13T08:00:00+00:00',
      dateModified: '2026-10-14',
      author: [
        { '@type': 'Person', name: 'Ada', url: 'https://acme.example/ada' },
        { '@type': 'Organization', name: 'Acme' },
      ],
    },
    required: [],
  },
  FAQPage: {
    draft: draftOf(
      make('FAQPage', {
        mainEntity: [
          nested(
            make('Question', {
              name: text('Do you deliver?'),
              acceptedAnswer: nested(make('Answer', { text: text('Yes, within Hoboken.') })),
            }),
          ),
          nested(
            make('Question', {
              name: text('Is it vegan?'),
              acceptedAnswer: nested(make('Answer', { text: text('The sourdough is.') })),
            }),
          ),
        ],
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Do you deliver?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes, within Hoboken.' },
        },
        {
          '@type': 'Question',
          name: 'Is it vegan?',
          acceptedAnswer: { '@type': 'Answer', text: 'The sourdough is.' },
        },
      ],
    },
    required: [],
  },
  Product: {
    draft: draftOf(
      make('Product', {
        name: text('Sourdough loaf'),
        brand: nested(make('Brand', { name: text('Acme') })),
        offers: nested(
          make('Offer', {
            price: number('6.50'),
            priceCurrency: text('USD'),
            availability: text('https://schema.org/InStock'),
            priceValidUntil: date('2027-01-31'),
          }),
        ),
        aggregateRating: nested(
          make('AggregateRating', {
            ratingValue: number('4.6'),
            reviewCount: number('87'),
            bestRating: number('5'),
            worstRating: number('1'),
          }),
        ),
        review: nested(
          make('Review', {
            author: person('Grace'),
            reviewRating: nested(
              make('Rating', {
                ratingValue: number('5'),
                bestRating: number('5'),
                worstRating: number('1'),
              }),
            ),
            datePublished: date('2026-09-30'),
          }),
        ),
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'Product',
      name: 'Sourdough loaf',
      brand: { '@type': 'Brand', name: 'Acme' },
      offers: {
        '@type': 'Offer',
        price: '6.50',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        priceValidUntil: '2027-01-31',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: 4.6,
        reviewCount: 87,
        bestRating: 5,
        worstRating: 1,
      },
      review: {
        '@type': 'Review',
        author: { '@type': 'Person', name: 'Grace' },
        reviewRating: { '@type': 'Rating', ratingValue: 5, bestRating: 5, worstRating: 1 },
        datePublished: '2026-09-30',
      },
    },
    required: ['name', 'offers'],
  },
  Event: {
    draft: draftOf(
      make('Event', {
        name: text('Bread night'),
        startDate: dateTime('2026-11-02T19:00:00-05:00'),
        endDate: dateTime('2026-11-02T21:00:00-05:00'),
        location: nested(make('Place', { name: text('Acme Bakery'), address: postal() })),
        eventStatus: text('https://schema.org/EventScheduled'),
        performer: nested(make('PerformingGroup', { name: text('The Crusts') })),
        offers: nested(
          make('Offer', {
            price: number('0'),
            priceCurrency: text('USD'),
            availability: text('https://schema.org/InStock'),
            validFrom: date('2026-10-01'),
            url: url('https://acme.example/tickets'),
          }),
        ),
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'Event',
      name: 'Bread night',
      startDate: '2026-11-02T19:00:00-05:00',
      location: { '@type': 'Place', name: 'Acme Bakery', address: POSTAL },
      endDate: '2026-11-02T21:00:00-05:00',
      eventStatus: 'https://schema.org/EventScheduled',
      performer: { '@type': 'PerformingGroup', name: 'The Crusts' },
      offers: {
        '@type': 'Offer',
        price: 0,
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        validFrom: '2026-10-01',
        url: 'https://acme.example/tickets',
      },
    },
    required: ['name', 'startDate', 'location'],
  },
  Person: {
    draft: draftOf(
      make('Person', {
        name: text('Ada Lovelace'),
        url: url('https://acme.example/ada'),
        jobTitle: text('Head baker'),
        worksFor: nested(make('Organization', { name: text('Acme') })),
        sameAs: url('https://social.example/ada'),
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'Person',
      name: 'Ada Lovelace',
      url: 'https://acme.example/ada',
      jobTitle: 'Head baker',
      worksFor: { '@type': 'Organization', name: 'Acme' },
      sameAs: 'https://social.example/ada',
    },
    required: [],
  },
  Recipe: {
    draft: draftOf(
      make('Recipe', {
        name: text('Sourdough'),
        image: nested(
          make('ImageObject', {
            url: url('https://acme.example/loaf.jpg'),
            caption: text('A loaf'),
          }),
        ),
        author: person('Ada'),
        prepTime: text('PT30M'),
        cookTime: text('PT45M'),
        recipeYield: text('1 loaf'),
        recipeIngredient: [text('500 g flour'), text('350 g water'), text('10 g salt')],
        recipeInstructions: [
          nested(make('HowToStep', { text: text('Mix everything.') })),
          nested(make('HowToStep', { name: text('Bake'), text: text('Bake at 230 C.') })),
        ],
        nutrition: nested(make('NutritionInformation', { calories: text('120 calories') })),
      }),
    ),
    markup: {
      ...CONTEXT,
      '@type': 'Recipe',
      name: 'Sourdough',
      image: { '@type': 'ImageObject', url: 'https://acme.example/loaf.jpg', caption: 'A loaf' },
      author: { '@type': 'Person', name: 'Ada' },
      prepTime: 'PT30M',
      cookTime: 'PT45M',
      recipeYield: '1 loaf',
      recipeIngredient: ['500 g flour', '350 g water', '10 g salt'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Mix everything.' },
        { '@type': 'HowToStep', text: 'Bake at 230 C.', name: 'Bake' },
      ],
      nutrition: { '@type': 'NutritionInformation', calories: '120 calories' },
    },
    required: ['name', 'image'],
  },
};

describe('each guided type', () => {
  it('has a case here', () => {
    expect(Object.keys(CASES)).toEqual(GUIDED);
  });

  it.each(GUIDED)('%s, filled in, gives the expected markup in the form’s order', (id) => {
    const { draft, markup } = CASES[id]!;
    const out = serialize(draft);
    expect(out).toEqual(markup);
    expect(JSON.stringify(out)).toBe(JSON.stringify(markup));
  });

  it.each(GUIDED)('%s, filled in, has nothing required missing and nothing malformed', (id) => {
    const findings = check(CASES[id]!.draft, vocabulary);
    expect(findings.filter((finding) => finding.kind !== 'missing-recommended')).toEqual([]);
  });

  it.each(GUIDED)('%s, empty, is missing exactly its required fields', (id) => {
    const findings = check(draftOf(make(id)), vocabulary);
    expect(
      findings
        .filter((finding) => finding.kind === 'missing-required')
        .map((finding) => finding.property),
    ).toEqual(CASES[id]!.required);
    expect(findings.filter((finding) => !finding.kind.startsWith('missing-'))).toEqual([]);
  });
});
