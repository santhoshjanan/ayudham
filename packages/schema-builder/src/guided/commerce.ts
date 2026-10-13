import { address, aggregateRating, image, party } from './shared.ts';
import { define, field, OPT, REC, REQ, schema } from './shape.ts';

const BRAND = define('Brand', 'Brand', [field('name', 'Name', '', 'text', REC)]);

const PRODUCT_OFFER = define('Product.Offer', 'Offer', [
  field('price', 'Price', 'A number only, such as 19.99.', 'number', REQ),
  field('priceCurrency', 'Currency', 'Three-letter code, such as USD.', 'text', REC, {
    format: 'currency',
  }),
  field('availability', 'Availability', '', 'text', REC, {
    choices: schema(
      'InStock',
      'OutOfStock',
      'PreOrder',
      'BackOrder',
      'SoldOut',
      'LimitedAvailability',
      'InStoreOnly',
      'OnlineOnly',
      'PreSale',
      'Discontinued',
    ),
  }),
  field('priceValidUntil', 'Price valid until', '', 'date', REC),
  field('url', 'Where to buy', '', 'url', OPT),
  field('itemCondition', 'Condition', '', 'text', OPT, {
    choices: schema('NewCondition', 'UsedCondition', 'RefurbishedCondition', 'DamagedCondition'),
  }),
]);

const REVIEW = define('Review', 'Review', [
  party('author', 'Reviewer', '', REQ),
  field('reviewRating', 'Rating', '', 'item', REQ, { nested: { Rating: 'Rating' } }),
  field('datePublished', 'Published', '', 'date', REC),
  field('reviewBody', 'Review text', '', 'text', OPT),
]);

const EVENT_PLACE = define('Event.Place', 'Venue', [
  field('name', 'Venue name', '', 'text', REC),
  address(REQ),
]);

const EVENT_OFFER = define('Event.Offer', 'Tickets', [
  field('price', 'Price', 'A number only. 0 for a free event.', 'number', REC),
  field('priceCurrency', 'Currency', 'Three-letter code, such as USD.', 'text', REC, {
    format: 'currency',
  }),
  field('availability', 'Availability', '', 'text', REC, {
    choices: schema('InStock', 'SoldOut', 'PreOrder'),
  }),
  field('validFrom', 'On sale from', '', ['dateTime', 'date'], REC),
  field('url', 'Where to buy', '', 'url', REC),
]);

const PRODUCT = define(
  'Product',
  'Product',
  [
    field('name', 'Name', '', 'text', REQ),
    image(OPT),
    field('description', 'Description', '', 'text', OPT),
    field('sku', 'SKU', '', 'text', OPT),
    field('brand', 'Brand', '', 'item', OPT, { nested: { Brand: 'Brand' } }),
    field('offers', 'Offer', 'The price and whether it is in stock.', 'item', REC, {
      repeats: true,
      nested: { Offer: 'Product.Offer' },
    }),
    aggregateRating(OPT),
    field('review', 'Review', 'Only reviews your own site collected.', 'item', OPT, {
      repeats: true,
      nested: { Review: 'Review' },
    }),
  ],
  {
    oneOf: [['offers', 'aggregateRating', 'review']],
    note: 'For a page about one product.',
  },
);

const EVENT = define(
  'Event',
  'Event',
  [
    field('name', 'Name', '', 'text', REQ),
    field(
      'startDate',
      'Starts',
      'With the time zone, such as 2026-11-02T19:00:00-05:00.',
      ['dateTime', 'date'],
      REQ,
    ),
    field('location', 'Venue', '', 'item', REQ, { nested: { Place: 'Event.Place' } }),
    field('endDate', 'Ends', '', ['dateTime', 'date'], REC),
    field('eventStatus', 'Status', '', 'text', REC, {
      choices: schema(
        'EventScheduled',
        'EventCancelled',
        'EventPostponed',
        'EventRescheduled',
        'EventMovedOnline',
      ),
    }),
    field('description', 'Description', '', 'text', REC),
    image(REC),
    party('organizer', 'Organizer', '', REC),
    party('performer', 'Performer', '', REC, {
      repeats: true,
      nested: { Person: 'Party.Person', PerformingGroup: 'Party.Organization' },
    }),
    field('offers', 'Tickets', 'One entry for each kind of ticket.', 'item', REC, {
      repeats: true,
      nested: { Offer: 'Event.Offer' },
    }),
    field(
      'previousStartDate',
      'Previous start',
      'Only for a rescheduled event.',
      ['dateTime', 'date'],
      OPT,
    ),
  ],
  {
    note: 'Google shows events that take place somewhere physical and that the public can book.',
  },
);

export const COMMERCE = [BRAND, PRODUCT_OFFER, REVIEW, EVENT_PLACE, EVENT_OFFER, PRODUCT, EVENT];
