import type { Definition, Field } from './definitions.ts';
import { nestedDefinition, topDefinition } from './definitions.ts';
import type { Draft, Item, ItemPath, ValueKind } from './model.ts';
import { valuesOf } from './model.ts';
import type { Vocabulary } from './vocabulary.ts';
import { describeProperty, expects, hasProperty } from './vocabulary.ts';

/**
 * The guided definition in force for the item at a path. A nested item's definition depends
 * on where it sits: an Offer inside a Product and one inside an Event have different rules.
 */
export const definitionAt = (draft: Draft, at: ItemPath): Definition | undefined => {
  let item = draft.items.find((candidate) => candidate.key === at.key);
  let definition = item ? topDefinition(item.type) : undefined;
  for (const step of at.steps) {
    if (!item) return undefined;
    const value = valuesOf(item, step.property)[step.index];
    if (value?.kind !== 'item') return undefined;
    const field = definition?.fields.find((candidate) => candidate.property === step.property);
    item = value.item;
    definition = nestedDefinition(field, item.type);
  }
  return item ? definition : undefined;
};

/**
 * A field for a property no guided definition covers. With the vocabulary it takes what the
 * property expects; without, the kinds of value the item already holds. A kind already held
 * is always kept, so a value can never be left without an input.
 */
export const propertyField = (item: Item, property: string, vocabulary?: Vocabulary): Field => {
  const held = valuesOf(item, property).map((value) => value.kind);
  const expected = vocabulary ? expects(vocabulary, property) : undefined;
  const kinds: ValueKind[] = [...new Set([...(expected?.kinds ?? []), ...held])];
  return {
    property,
    label: property,
    hint: vocabulary ? describeProperty(vocabulary, property) : '',
    kinds: kinds.length > 0 ? kinds : ['text'],
    level: 'optional',
    repeats: true,
    ...(expected && expected.choices.length > 0 ? { choices: expected.choices } : {}),
  };
};

/** What the editor shows for an item: the guided fields, then every further property it holds. */
export const fieldsFor = (
  item: Item,
  definition: Definition | undefined,
  vocabulary?: Vocabulary,
): Field[] => {
  const guided = definition?.fields ?? [];
  const covered = new Set(guided.map((field) => field.property));
  return [
    ...guided,
    ...item.properties
      .filter((property) => !covered.has(property.name))
      .map((property) => propertyField(item, property.name, vocabulary)),
  ];
};

/**
 * Whether an item of `type` can keep `property` when its type changes. A property is kept if
 * the guided form has it or the vocabulary gives it to the type. For a type nothing is known
 * about, everything is kept: there are no grounds to drop it.
 */
export const accepts = (
  type: string,
  definition: Definition | undefined,
  vocabulary: Vocabulary | undefined,
  property: string,
): boolean => {
  if (definition?.fields.some((field) => field.property === property)) return true;
  const known = vocabulary?.types.has(type) ?? false;
  if (!definition && !known) return true;
  return known && vocabulary !== undefined && hasProperty(vocabulary, type, property);
};
