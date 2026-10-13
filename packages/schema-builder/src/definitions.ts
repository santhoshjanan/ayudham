import { COMMERCE } from './guided/commerce.ts';
import { CONTENT } from './guided/content.ts';
import type { Definition, Field } from './guided/shape.ts';
import { SHARED } from './guided/shared.ts';
import { SITE } from './guided/site.ts';

export type { Definition, Field, Format, Level } from './guided/shape.ts';

/** The date the levels were last compared with their sources. See RULES.md. */
export const RULES_CHECKED = '2026-10-13';

/** The guided types offered to start an item, in the order they are shown. */
export const GUIDED = [
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
];

export const DEFINITIONS: Record<string, Definition> = Object.fromEntries(
  [...SHARED, ...SITE, ...CONTENT, ...COMMERCE].map((definition) => [definition.id, definition]),
);

/** The guided definition for a top-level item of this type, if there is one. */
export const topDefinition = (type: string): Definition | undefined =>
  GUIDED.map((id) => DEFINITIONS[id]).find(
    (definition) => definition?.type === type || definition?.variants.includes(type),
  );

/** The definition a field uses for a nested item of this type, if it names one. */
export const nestedDefinition = (
  field: Field | undefined,
  type: string,
): Definition | undefined => {
  const id = field?.nested?.[type];
  return id === undefined ? undefined : DEFINITIONS[id];
};
