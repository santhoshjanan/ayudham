import type { Field, Level } from './shape.ts';
import { define, field, OPT, REC, REQ } from './shape.ts';

export const POSTAL_ADDRESS = define('PostalAddress', 'Postal address', [
  field('streetAddress', 'Street address', 'Building number and street.', 'text', REC),
  field('addressLocality', 'Town or city', '', 'text', REC),
  field('addressRegion', 'Region', 'State, province or county.', 'text', REC),
  field('postalCode', 'Postal code', '', 'text', REC),
  field('addressCountry', 'Country', 'Two-letter code, such as US or GB.', 'text', REC),
]);

export const IMAGE_OBJECT = define('ImageObject', 'Image', [
  field('url', 'Image address', 'The full address of the image file.', 'url', REQ),
  field('caption', 'Caption', '', 'text', OPT),
]);

export const PARTY_PERSON = define('Party.Person', 'Person', [
  field('name', 'Name', '', 'text', REC),
  field('url', 'Web address', 'A page about this person.', 'url', REC),
]);

export const PARTY_ORGANIZATION = define('Party.Organization', 'Organization', [
  field('name', 'Name', '', 'text', REC),
  field('url', 'Web address', 'The organization’s site.', 'url', REC),
]);

export const RATING = define('Rating', 'Rating', [
  field('ratingValue', 'Rating', 'A number on the scale below.', 'number', REQ, {
    format: 'rating',
  }),
  field('bestRating', 'Best possible', '5 if left empty.', 'number', REC),
  field('worstRating', 'Worst possible', '1 if left empty.', 'number', REC),
]);

export const AGGREGATE_RATING = define(
  'AggregateRating',
  'Average rating',
  [
    field('ratingValue', 'Average rating', 'A number on the scale below.', 'number', REQ, {
      format: 'rating',
    }),
    field('ratingCount', 'Number of ratings', '', 'number', OPT),
    field('reviewCount', 'Number of reviews', '', 'number', OPT),
    field('bestRating', 'Best possible', '5 if left empty.', 'number', REC),
    field('worstRating', 'Worst possible', '1 if left empty.', 'number', REC),
  ],
  { oneOf: [['ratingCount', 'reviewCount']] },
);

export const SHARED = [
  POSTAL_ADDRESS,
  IMAGE_OBJECT,
  PARTY_PERSON,
  PARTY_ORGANIZATION,
  RATING,
  AGGREGATE_RATING,
];

export const image = (level: Level): Field =>
  field('image', 'Image', 'An image address, or an image with a caption.', ['url', 'item'], level, {
    repeats: true,
    nested: { ImageObject: 'ImageObject' },
  });

export const address = (level: Level, extra: Partial<Field> = {}): Field =>
  field('address', 'Address', '', 'item', level, {
    nested: { PostalAddress: 'PostalAddress' },
    ...extra,
  });

/** A field that takes a person or an organization. */
export const party = (
  property: string,
  label: string,
  hint: string,
  level: Level,
  extra: Partial<Field> = {},
): Field =>
  field(property, label, hint, 'item', level, {
    nested: { Person: 'Party.Person', Organization: 'Party.Organization' },
    ...extra,
  });

export const aggregateRating = (level: Level): Field =>
  field(
    'aggregateRating',
    'Average rating',
    'Only for ratings your own site collected.',
    'item',
    level,
    {
      nested: { AggregateRating: 'AggregateRating' },
    },
  );
