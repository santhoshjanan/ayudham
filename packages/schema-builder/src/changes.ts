import { LIMITS } from './limits.ts';
import type { Draft, Item, ItemPath, Step, Value } from './model.ts';
import { valuesOf } from './model.ts';

export const REFUSALS = [
  'too-many-items',
  'too-deep',
  'too-many-values',
  'too-many-properties',
  'too-long',
  'not-found',
  'duplicate-key',
  'bad-name',
  'too-large',
] as const;
export type Refusal = (typeof REFUSALS)[number];

/** The result of a change. When `refused` is set, `draft` is the one passed in, untouched. */
export interface Change {
  draft: Draft;
  refused?: Refusal;
}

/** A type or property name: letters and digits only, as every Schema.org name is. */
const NAME = /^[A-Za-z0-9]+$/;
/** An item's key: what `crypto.randomUUID` gives, and safe inside an element id. */
const KEY = /^[A-Za-z0-9-]+$/;

/** How many values an item holds, at every depth. */
const weigh = (item: Item): number =>
  item.properties.reduce(
    (sum, property) =>
      sum +
      property.values.reduce(
        (held, value) => held + 1 + (value.kind === 'item' ? weigh(value.item) : 0),
        0,
      ),
    0,
  );

/** How many values a draft holds, at every depth. */
export const countValues = (draft: Draft): number =>
  draft.items.reduce((sum, item) => sum + weigh(item), 0);

/** What is wrong with a value held by an item at `depth`, if anything. */
export const valueProblem = (value: Value, depth: number): Refusal | undefined => {
  if (value.kind === 'item') return itemProblem(value.item, depth + 1);
  if (value.kind === 'boolean') return undefined;
  const held = value.kind === 'reference' ? value.key : value.text;
  return held.length > LIMITS.text ? 'too-long' : undefined;
};

/** What is wrong with an item at `depth` (a top-level item is at depth 1), if anything. */
export const itemProblem = (item: Item, depth: number): Refusal | undefined => {
  if (depth > LIMITS.depth) return 'too-deep';
  if (item.type.length > LIMITS.name || item.key.length > LIMITS.name) return 'too-long';
  if (item.id.length > LIMITS.text) return 'too-long';
  if (!NAME.test(item.type) || !KEY.test(item.key)) return 'bad-name';
  if (item.properties.length > LIMITS.properties) return 'too-many-properties';
  const names = new Set(item.properties.map((property) => property.name));
  if (names.size !== item.properties.length) return 'duplicate-key';
  for (const property of item.properties) {
    if (property.name.length > LIMITS.name) return 'too-long';
    if (!NAME.test(property.name)) return 'bad-name';
    if (property.values.length > LIMITS.values) return 'too-many-values';
    for (const value of property.values) {
      const problem = valueProblem(value, depth);
      if (problem) return problem;
    }
  }
  return undefined;
};

export const draftProblem = (draft: Draft): Refusal | undefined => {
  if (draft.items.length > LIMITS.items) return 'too-many-items';
  const keys = new Set(draft.items.map((item) => item.key));
  if (keys.size !== draft.items.length) return 'duplicate-key';
  for (const item of draft.items) {
    const problem = itemProblem(item, 1);
    if (problem) return problem;
  }
  return countValues(draft) > LIMITS.total ? 'too-large' : undefined;
};

const refuse = (draft: Draft, refused: Refusal): Change => ({ draft, refused });

const swap = <T>(list: T[], index: number, by: -1 | 1): T[] => {
  const one = list[index];
  const other = list[index + by];
  if (one === undefined || other === undefined) return list;
  const next = [...list];
  next[index] = other;
  next[index + by] = one;
  return next;
};

/** Replaces one property's values. A property left with none is dropped. */
const withValues = (item: Item, name: string, change: (values: Value[]) => Value[]): Item => {
  const known = item.properties.some((property) => property.name === name);
  const properties = known
    ? item.properties.map((property) =>
        property.name === name ? { name, values: change(property.values) } : property,
      )
    : [...item.properties, { name, values: change([]) }];
  return { ...item, properties: properties.filter((property) => property.values.length > 0) };
};

/** Applies `change` to the item at `at`, rebuilding every item above it. */
const edit = (
  draft: Draft,
  at: ItemPath,
  change: (item: Item, depth: number) => Item | Refusal,
): Change => {
  const walk = (item: Item, steps: Step[], depth: number): Item | Refusal => {
    const [step, ...rest] = steps;
    if (!step) return change(item, depth);
    const value = valuesOf(item, step.property)[step.index];
    if (value?.kind !== 'item') return 'not-found';
    const next = walk(value.item, rest, depth + 1);
    if (typeof next === 'string') return next;
    return withValues(item, step.property, (values) =>
      values.map((held, index) => (index === step.index ? { kind: 'item', item: next } : held)),
    );
  };
  const position = draft.items.findIndex((item) => item.key === at.key);
  const top = draft.items[position];
  if (!top) return refuse(draft, 'not-found');
  const next = walk(top, at.steps, 1);
  if (typeof next === 'string') return refuse(draft, next);
  return { draft: { items: draft.items.map((item, index) => (index === position ? next : item)) } };
};

export const addItem = (draft: Draft, item: Item): Change => {
  if (draft.items.length >= LIMITS.items) return refuse(draft, 'too-many-items');
  if (draft.items.some((held) => held.key === item.key)) return refuse(draft, 'duplicate-key');
  const problem = itemProblem(item, 1);
  if (problem) return refuse(draft, problem);
  if (countValues(draft) + weigh(item) > LIMITS.total) return refuse(draft, 'too-large');
  return { draft: { items: [...draft.items, item] } };
};

export const removeItem = (draft: Draft, key: string): Change =>
  draft.items.some((item) => item.key === key)
    ? { draft: { items: draft.items.filter((item) => item.key !== key) } }
    : refuse(draft, 'not-found');

/** Moves an item one place. At either end the draft comes back as it was. */
export const moveItem = (draft: Draft, key: string, by: -1 | 1): Change => {
  const index = draft.items.findIndex((item) => item.key === key);
  if (index < 0) return refuse(draft, 'not-found');
  const items = swap(draft.items, index, by);
  return items === draft.items ? { draft } : { draft: { items } };
};

/** Changes an item's type, keeping only the properties `keeps` accepts. */
export const setType = (
  draft: Draft,
  at: ItemPath,
  type: string,
  keeps: (property: string) => boolean,
): Change =>
  edit(draft, at, (item) =>
    type.length > LIMITS.name
      ? 'too-long'
      : !NAME.test(type)
        ? 'bad-name'
        : { ...item, type, properties: item.properties.filter((property) => keeps(property.name)) },
  );

export const setId = (draft: Draft, at: ItemPath, id: string): Change =>
  edit(draft, at, (item) => (id.length > LIMITS.text ? 'too-long' : { ...item, id }));

export const addValue = (draft: Draft, at: ItemPath, property: string, value: Value): Change => {
  const adds = 1 + (value.kind === 'item' ? weigh(value.item) : 0);
  if (countValues(draft) + adds > LIMITS.total) return refuse(draft, 'too-large');
  return edit(draft, at, (item, depth) => {
    if (property.length > LIMITS.name) return 'too-long';
    if (!NAME.test(property)) return 'bad-name';
    const held = valuesOf(item, property);
    if (held.length === 0 && item.properties.length >= LIMITS.properties) {
      return 'too-many-properties';
    }
    if (held.length >= LIMITS.values) return 'too-many-values';
    return valueProblem(value, depth) ?? withValues(item, property, (values) => [...values, value]);
  });
};

export const setValue = (draft: Draft, at: ItemPath, step: Step, value: Value): Change =>
  edit(draft, at, (item, depth) => {
    if (valuesOf(item, step.property)[step.index] === undefined) return 'not-found';
    return (
      valueProblem(value, depth) ??
      withValues(item, step.property, (values) =>
        values.map((held, index) => (index === step.index ? value : held)),
      )
    );
  });

export const removeValue = (draft: Draft, at: ItemPath, step: Step): Change =>
  edit(draft, at, (item) =>
    valuesOf(item, step.property)[step.index] === undefined
      ? 'not-found'
      : withValues(item, step.property, (values) =>
          values.filter((_, index) => index !== step.index),
        ),
  );

/** Moves a value one place within its property. At either end nothing changes. */
export const moveValue = (draft: Draft, at: ItemPath, step: Step, by: -1 | 1): Change =>
  edit(draft, at, (item) =>
    valuesOf(item, step.property)[step.index] === undefined
      ? 'not-found'
      : withValues(item, step.property, (values) => swap(values, step.index, by)),
  );

const mentions = (item: Item, key: string): boolean =>
  item.properties.some((property) =>
    property.values.some(
      (value) =>
        (value.kind === 'reference' && value.key === key) ||
        (value.kind === 'item' && mentions(value.item, key)),
    ),
  );

/** Whether anything in the draft refers to the top-level item `key`. */
export const refersTo = (draft: Draft, key: string): boolean =>
  draft.items.some((item) => mentions(item, key));
