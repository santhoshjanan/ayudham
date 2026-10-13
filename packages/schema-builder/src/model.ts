export const TEXT_KINDS = ['text', 'number', 'date', 'dateTime', 'time', 'url'] as const;
export type TextKind = (typeof TEXT_KINDS)[number];
export type ValueKind = TextKind | 'boolean' | 'item' | 'reference';

/**
 * One value of a property. Text-like kinds hold what the person typed, valid or not;
 * whether it fits its kind is for the checks to say.
 */
export type Value =
  | { kind: TextKind; text: string }
  | { kind: 'boolean'; on: boolean }
  | { kind: 'item'; item: Item }
  | { kind: 'reference'; key: string };

export interface Property {
  name: string;
  values: Value[];
}

export interface Item {
  /** Local identifier, never written to the output. */
  key: string;
  type: string;
  /** The person's own `@id`, or empty. */
  id: string;
  properties: Property[];
}

export interface Draft {
  items: Item[];
}

/** One hop from an item to a nested item: the value at `index` of `property`. */
export interface Step {
  property: string;
  index: number;
}

/** Where an item is: a top-level item's key, then hops down to a nested one. */
export interface ItemPath {
  key: string;
  steps: Step[];
}

export const emptyDraft = (): Draft => ({ items: [] });

export const newItem = (key: string, type: string): Item => ({ key, type, id: '', properties: [] });

export const valuesOf = (item: Item, name: string): Value[] =>
  item.properties.find((property) => property.name === name)?.values ?? [];

export const itemAt = (draft: Draft, at: ItemPath): Item | undefined => {
  let item = draft.items.find((candidate) => candidate.key === at.key);
  for (const step of at.steps) {
    if (!item) return undefined;
    const value = valuesOf(item, step.property)[step.index];
    item = value?.kind === 'item' ? value.item : undefined;
  }
  return item;
};

/** Whether a value says nothing. `false` and `0` say something. */
export const blankValue = (value: Value): boolean => {
  switch (value.kind) {
    case 'boolean':
      return false;
    case 'reference':
      return value.key === '';
    case 'item':
      return blankItem(value.item);
    default:
      return value.text.trim() === '';
  }
};

export const blankItem = (item: Item): boolean =>
  item.properties.every((property) => property.values.every(blankValue));
