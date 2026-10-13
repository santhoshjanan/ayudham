import type { Definition, Field } from './definitions.ts';
import { nestedDefinition, topDefinition } from './definitions.ts';
import type { Draft, Item, Step, Value } from './model.ts';
import { blankValue, valuesOf } from './model.ts';
import type { Vocabulary } from './vocabulary.ts';
import { hasProperty } from './vocabulary.ts';

export const FINDING_KINDS = [
  'missing-required',
  'missing-recommended',
  'bad-url',
  'bad-date',
  'bad-number',
  'bad-currency',
  'out-of-range',
  'dangling-reference',
  'unknown-property',
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export interface Finding {
  /** The key of the top-level item. */
  item: string;
  /** The way down from it to the item that holds `property`. */
  steps: Step[];
  property: string;
  /** Which value, when the finding is about one value. */
  index?: number;
  kind: FindingKind;
  /** On a missing-required finding for a one-of group: the properties in the group. */
  anyOf?: string[];
}

const URL_SHAPE = /^https?:\/\/[^\s/?#.][^\s/?#]*([/?#]\S*)?$/i;
const NUMBER_SHAPE = /^-?\d+(\.\d+)?$/;
const DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_SHAPE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)?$/;
const CURRENCY_SHAPE = /^[A-Za-z]{3}$/;

const isDate = (typed: string): boolean => {
  const match = DATE_SHAPE.exec(typed);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

/** A date and a time joined by T. A date alone is accepted too. */
const isDateTime = (typed: string): boolean => {
  const [date, time, ...rest] = typed.split('T');
  if (date === undefined || rest.length > 0) return false;
  return isDate(date) && (time === undefined || TIME_SHAPE.test(time));
};

const numberOf = (item: Item, property: string, otherwise: number): number => {
  const held = valuesOf(item, property).find((value) => !blankValue(value));
  if (held?.kind !== 'number' || !NUMBER_SHAPE.test(held.text.trim())) return otherwise;
  return Number(held.text.trim());
};

/**
 * Everything worth telling the person about a draft, in the draft's order. Required and
 * recommended apply to guided definitions only. Nothing here stops the output being used.
 */
export const check = (draft: Draft, vocabulary?: Vocabulary): Finding[] => {
  const findings: Finding[] = [];
  const keys = new Set(draft.items.map((item) => item.key));

  const malformed = (
    value: Value,
    field: Field | undefined,
    item: Item,
  ): FindingKind | undefined => {
    if (value.kind === 'reference') return keys.has(value.key) ? undefined : 'dangling-reference';
    if (value.kind === 'boolean' || value.kind === 'item') return undefined;
    const typed = value.text.trim();
    switch (value.kind) {
      case 'url':
        return URL_SHAPE.test(typed) ? undefined : 'bad-url';
      case 'date':
        return isDate(typed) ? undefined : 'bad-date';
      case 'dateTime':
        return isDateTime(typed) ? undefined : 'bad-date';
      case 'time':
        return TIME_SHAPE.test(typed) ? undefined : 'bad-date';
      case 'number': {
        if (!NUMBER_SHAPE.test(typed)) return 'bad-number';
        if (field?.format !== 'rating') return undefined;
        const rating = Number(typed);
        const inRange =
          rating >= numberOf(item, 'worstRating', 1) && rating <= numberOf(item, 'bestRating', 5);
        return inRange ? undefined : 'out-of-range';
      }
      default:
        return field?.format === 'currency' && !CURRENCY_SHAPE.test(typed)
          ? 'bad-currency'
          : undefined;
    }
  };

  const walk = (
    item: Item,
    definition: Definition | undefined,
    top: string,
    steps: Step[],
  ): void => {
    const missing = (property: string): boolean => valuesOf(item, property).every(blankValue);
    const here = { item: top, steps };

    if (definition) {
      const unmet = definition.oneOf.filter((group) => group.every(missing));
      const grouped = new Set(unmet.flat());
      for (const field of definition.fields) {
        if (field.level === 'optional' || grouped.has(field.property)) continue;
        if (!missing(field.property)) continue;
        findings.push({
          ...here,
          property: field.property,
          kind: field.level === 'required' ? 'missing-required' : 'missing-recommended',
        });
      }
      for (const group of unmet) {
        const [first] = group;
        if (first !== undefined) {
          findings.push({ ...here, property: first, kind: 'missing-required', anyOf: group });
        }
      }
    }

    for (const property of item.properties) {
      const field = definition?.fields.find((candidate) => candidate.property === property.name);
      if (vocabulary?.types.has(item.type) && !hasProperty(vocabulary, item.type, property.name)) {
        findings.push({ ...here, property: property.name, kind: 'unknown-property' });
      }
      property.values.forEach((value, index) => {
        if (blankValue(value)) return;
        if (value.kind === 'item') {
          walk(value.item, nestedDefinition(field, value.item.type), top, [
            ...steps,
            { property: property.name, index },
          ]);
          return;
        }
        const kind = malformed(value, field, item);
        if (kind) findings.push({ ...here, property: property.name, index, kind });
      });
    }
  };

  for (const item of draft.items) walk(item, topDefinition(item.type), item.key, []);
  return findings;
};
