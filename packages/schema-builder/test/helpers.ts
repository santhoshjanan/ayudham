import type { Draft, Item, TextKind, Value } from '../src/index.ts';

export const text = (t: string, kind: TextKind = 'text'): Value => ({ kind, text: t });
export const nested = (item: Item): Value => ({ kind: 'item', item });
export const ref = (key: string): Value => ({ kind: 'reference', key });

let count = 0;

/** An item with the given properties, in the given order. */
export const make = (
  type: string,
  properties: Record<string, Value | Value[]> = {},
  key = `k${++count}`,
): Item => ({
  key,
  type,
  id: '',
  properties: Object.entries(properties).map(([name, value]) => ({
    name,
    values: [value].flat(),
  })),
});

export const draftOf = (...items: Item[]): Draft => ({ items });
