import { z } from 'zod';
import type { ValueKind } from './model.ts';

const Names = z.array(z.string());

const Raw = z.object({
  version: z.string(),
  types: z.record(z.string(), Names),
  properties: z.record(z.string(), z.object({ d: Names, r: Names, c: z.string() })),
  enums: z.record(z.string(), Names),
  dataTypes: Names,
});

export interface VocabularyProperty {
  /** The types the property belongs to. */
  domains: string[];
  /** The types of value it expects. */
  ranges: string[];
  comment: string;
}

export interface Vocabulary {
  version: string;
  /** Each type's parents. */
  types: Map<string, string[]>;
  properties: Map<string, VocabularyProperty>;
  /** Each enumeration's members. */
  enums: Map<string, string[]>;
  dataTypes: Set<string>;
  /** The properties that name each type directly, in alphabetical order. */
  own: Map<string, string[]>;
}

/** The vocabulary file's contents as something to query, or nothing if it is not one. */
export const parseVocabulary = (input: unknown): Vocabulary | undefined => {
  const parsed = Raw.safeParse(input);
  if (!parsed.success) return undefined;
  const raw = parsed.data;
  const own = new Map<string, string[]>();
  const properties = new Map<string, VocabularyProperty>();
  for (const name of Object.keys(raw.properties).sort()) {
    const property = raw.properties[name];
    if (!property) continue;
    properties.set(name, { domains: property.d, ranges: property.r, comment: property.c });
    for (const type of property.d) own.set(type, [...(own.get(type) ?? []), name]);
  }
  return {
    version: raw.version,
    types: new Map(Object.entries(raw.types)),
    properties,
    enums: new Map(Object.entries(raw.enums)),
    dataTypes: new Set(raw.dataTypes),
    own,
  };
};

/** A type, then its ancestors nearest first, each once. Empty for an unknown type. */
export const lineage = (vocabulary: Vocabulary, type: string): string[] => {
  if (!vocabulary.types.has(type)) return [];
  const found = [type];
  for (let index = 0; index < found.length; index += 1) {
    for (const parent of vocabulary.types.get(found[index] ?? '') ?? []) {
      if (!found.includes(parent)) found.push(parent);
    }
  }
  return found;
};

/** Every property a type can have: its own first, then each ancestor's, nearest first. */
export const propertiesOf = (vocabulary: Vocabulary, type: string): string[] => {
  const found = new Set<string>();
  for (const ancestor of lineage(vocabulary, type)) {
    for (const name of vocabulary.own.get(ancestor) ?? []) found.add(name);
  }
  return [...found];
};

export const hasProperty = (vocabulary: Vocabulary, type: string, property: string): boolean => {
  const domains = vocabulary.properties.get(property)?.domains ?? [];
  return lineage(vocabulary, type).some((ancestor) => domains.includes(ancestor));
};

const isData = (vocabulary: Vocabulary, type: string): boolean =>
  lineage(vocabulary, type).some((ancestor) => vocabulary.dataTypes.has(ancestor));

/** Names containing the query, those that start with it first. */
const matching = (names: string[], query: string, limit: number): string[] => {
  const wanted = query.trim().toLowerCase();
  const hits = names.filter((name) => name.toLowerCase().includes(wanted));
  const starts = hits.filter((name) => name.toLowerCase().startsWith(wanted));
  return [...starts, ...hits.filter((name) => !starts.includes(name))].slice(0, limit);
};

/** Types an item can be, by name. Data types such as Text are left out. */
export const searchTypes = (vocabulary: Vocabulary, query: string, limit = 20): string[] =>
  matching(
    [...vocabulary.types.keys()].filter((type) => !isData(vocabulary, type)).sort(),
    query,
    limit,
  );

export const searchProperties = (
  vocabulary: Vocabulary,
  type: string,
  query: string,
  limit = 20,
): string[] => matching(propertiesOf(vocabulary, type), query, limit);

export interface Expected {
  /** The kinds of value the property takes, simplest first. Never empty. */
  kinds: ValueKind[];
  /** The types a nested item may be. */
  itemTypes: string[];
  /** The values offered, when the property expects a member of an enumeration. */
  choices: string[];
}

const ORDER: ValueKind[] = [
  'text',
  'url',
  'number',
  'boolean',
  'date',
  'dateTime',
  'time',
  'item',
  'reference',
];

const DATA_KINDS: Record<string, ValueKind> = {
  URL: 'url',
  Text: 'text',
  Number: 'number',
  Boolean: 'boolean',
  Date: 'date',
  DateTime: 'dateTime',
  Time: 'time',
  Quantity: 'text',
};

/** What a property expects, as kinds of value. An unknown property takes text. */
export const expects = (vocabulary: Vocabulary, property: string): Expected => {
  const kinds = new Set<ValueKind>();
  const itemTypes: string[] = [];
  const choices: string[] = [];
  for (const range of vocabulary.properties.get(property)?.ranges ?? []) {
    const ancestors = lineage(vocabulary, range);
    // URL is a kind of Text, so the nearest data type decides.
    const data = ancestors.find((ancestor) => Object.hasOwn(DATA_KINDS, ancestor));
    if (data !== undefined && isData(vocabulary, range)) {
      kinds.add(DATA_KINDS[data] ?? 'text');
    } else if (ancestors.includes('Enumeration')) {
      kinds.add('text');
      for (const member of vocabulary.enums.get(range) ?? []) {
        choices.push(`https://schema.org/${member}`);
      }
    } else {
      kinds.add('item');
      kinds.add('reference');
      itemTypes.push(range);
    }
  }
  if (kinds.size === 0) kinds.add('text');
  return { kinds: ORDER.filter((kind) => kinds.has(kind)), itemTypes, choices };
};

export const describeProperty = (vocabulary: Vocabulary, property: string): string =>
  vocabulary.properties.get(property)?.comment ?? '';
