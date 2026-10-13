import { address, image, party } from './shared.ts';
import { define, field, OPT, REC, REQ, schema } from './shape.ts';

const CONTACT_POINT = define('ContactPoint', 'Contact point', [
  field('contactType', 'What it is for', 'Such as customer service or sales.', 'text', OPT),
  field('telephone', 'Telephone', 'With the country code, such as +1 201 555 0100.', 'text', REC),
  field('email', 'Email', '', 'text', REC),
]);

const GEO_COORDINATES = define('GeoCoordinates', 'Coordinates', [
  field('latitude', 'Latitude', 'At least five decimal places.', 'number', REC),
  field('longitude', 'Longitude', 'At least five decimal places.', 'number', REC),
]);

const OPENING_HOURS = define('OpeningHoursSpecification', 'Opening hours', [
  field('dayOfWeek', 'Days', '', 'text', REC, {
    repeats: true,
    choices: schema('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
  }),
  field('opens', 'Opens', 'Such as 09:00.', 'time', REC),
  field('closes', 'Closes', 'Such as 17:30.', 'time', REC),
  field('validFrom', 'From', 'Only for seasonal hours.', 'date', OPT),
  field('validThrough', 'Until', 'Only for seasonal hours.', 'date', OPT),
]);

const BREADCRUMB_ITEM = define('Breadcrumb.ListItem', 'Step', [
  field('name', 'Title', 'What the breadcrumb says.', 'text', REQ),
  field('item', 'Page address', 'May be left empty on the last step.', 'url', REC),
]);

const ORGANIZATION = define(
  'Organization',
  'Organization',
  [
    field('name', 'Name', '', 'text', REC),
    field('url', 'Website', '', 'url', REC),
    field('logo', 'Logo', 'The address of the logo image.', ['url', 'item'], REC, {
      nested: { ImageObject: 'ImageObject' },
    }),
    field('description', 'Description', '', 'text', REC),
    field('alternateName', 'Also known as', '', 'text', REC),
    field('legalName', 'Registered name', '', 'text', REC),
    field('email', 'Email', '', 'text', REC),
    field('telephone', 'Telephone', 'With the country code.', 'text', REC),
    address(REC, { repeats: true }),
    field('contactPoint', 'Contact point', '', 'item', REC, {
      repeats: true,
      nested: { ContactPoint: 'ContactPoint' },
    }),
    field(
      'sameAs',
      'Profiles elsewhere',
      'Addresses of pages about it on other sites.',
      'url',
      REC,
      {
        repeats: true,
      },
    ),
    field('foundingDate', 'Founded', '', 'date', REC),
    field('taxID', 'Tax ID', '', 'text', OPT),
    field('vatID', 'VAT ID', '', 'text', OPT),
    field('iso6523Code', 'ISO 6523 code', '', 'text', OPT),
    field('naics', 'NAICS code', '', 'text', OPT),
    field('globalLocationNumber', 'Global Location Number', '', 'text', OPT),
    field('duns', 'DUNS number', '', 'text', OPT),
    field('leiCode', 'LEI code', '', 'text', OPT),
  ],
  { note: 'Put this on your home page or a page that describes the organization.' },
);

const LOCAL_BUSINESS = define(
  'LocalBusiness',
  'Local business',
  [
    field('name', 'Name', '', 'text', REQ),
    address(REQ),
    field('url', 'Website', 'The page for this location.', 'url', REC),
    field('telephone', 'Telephone', 'With the country code.', 'text', REC),
    field('priceRange', 'Price range', 'Such as $$ or $10-15.', 'text', REC),
    field('geo', 'Coordinates', '', 'item', REC, {
      nested: { GeoCoordinates: 'GeoCoordinates' },
    }),
    field(
      'openingHoursSpecification',
      'Opening hours',
      'One entry for each set of days.',
      'item',
      REC,
      {
        repeats: true,
        nested: { OpeningHoursSpecification: 'OpeningHoursSpecification' },
      },
    ),
    image(OPT),
  ],
  {
    note: 'For a more exact type, such as Restaurant or Dentist, choose “Another type”.',
  },
);

const WEB_SITE = define(
  'WebSite',
  'Website',
  [
    field('name', 'Site name', '', 'text', REQ),
    field('url', 'Home page', 'The address of the home page.', 'url', REQ),
    field('alternateName', 'Other names', 'A shorter name or an acronym.', 'text', REC, {
      repeats: true,
    }),
  ],
  { note: 'This belongs on the home page only.' },
);

const BREADCRUMB_LIST = define('BreadcrumbList', 'Breadcrumbs', [
  field('itemListElement', 'Steps', 'From the top of the site down to this page.', 'item', REQ, {
    repeats: true,
    numbered: true,
    nested: { ListItem: 'Breadcrumb.ListItem' },
  }),
]);

const PERSON = define(
  'Person',
  'Person',
  [
    field('name', 'Name', '', 'text', REC),
    field('url', 'Web address', 'A page about this person.', 'url', REC),
    image(REC),
    field('jobTitle', 'Job title', '', 'text', REC),
    party('worksFor', 'Works for', '', REC, { nested: { Organization: 'Party.Organization' } }),
    field(
      'sameAs',
      'Profiles elsewhere',
      'Addresses of pages about them on other sites.',
      'url',
      REC,
      {
        repeats: true,
      },
    ),
    field('description', 'Description', '', 'text', OPT),
    field('email', 'Email', '', 'text', OPT),
    field('telephone', 'Telephone', '', 'text', OPT),
    address(OPT),
  ],
  {
    note: 'Google documents no search result for a person on their own, so nothing here is required.',
  },
);

export const SITE = [
  CONTACT_POINT,
  GEO_COORDINATES,
  OPENING_HOURS,
  BREADCRUMB_ITEM,
  ORGANIZATION,
  LOCAL_BUSINESS,
  WEB_SITE,
  BREADCRUMB_LIST,
  PERSON,
];
