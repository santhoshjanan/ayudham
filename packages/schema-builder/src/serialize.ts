import type { Definition } from './definitions.ts';
import { nestedDefinition, topDefinition } from './definitions.ts';
import type { Draft, Item, Value } from './model.ts';
import { valuesOf } from './model.ts';

export type Json = string | number | boolean | Json[] | JsonObject;
export interface JsonObject {
  [key: string]: Json;
}

const CONTEXT = 'https://schema.org';

const collectReferences = (item: Item, into: Set<string>): void => {
  for (const property of item.properties) {
    for (const value of property.values) {
      if (value.kind === 'reference') into.add(value.key);
      if (value.kind === 'item') collectReferences(value.item, into);
    }
  }
};

/**
 * The `@id` each top-level item is written with, by key. An item has one when the person set
 * it, or when something refers to the item. A generated id is `#` and the type in lower case,
 * numbered from the second of a type, and never one already in use.
 */
export const idsFor = (draft: Draft): Map<string, string> => {
  const referred = new Set<string>();
  for (const item of draft.items) collectReferences(item, referred);

  const ids = new Map<string, string>();
  const used = new Set<string>();
  for (const item of draft.items) {
    const own = item.id.trim();
    if (own === '') continue;
    ids.set(item.key, own);
    used.add(own);
  }

  const counts = new Map<string, number>();
  for (const item of draft.items) {
    if (ids.has(item.key) || !referred.has(item.key)) continue;
    const base = `#${item.type.toLowerCase()}`;
    let count = (counts.get(base) ?? 0) + 1;
    let id = count === 1 ? base : `${base}-${count}`;
    while (used.has(id)) {
      count += 1;
      id = `${base}-${count}`;
    }
    counts.set(base, count);
    used.add(id);
    ids.set(item.key, id);
  }
  return ids;
};

/** A value that is not a nested item, as JSON. `undefined` means it is left out. */
const writeScalar = (
  value: Exclude<Value, { kind: 'item' }>,
  ids: Map<string, string>,
): Json | undefined => {
  if (value.kind === 'boolean') return value.on;
  if (value.kind === 'reference') {
    const id = ids.get(value.key);
    return id === undefined ? undefined : { '@id': id };
  }
  const typed = value.text.trim();
  if (typed === '') return undefined;
  if (value.kind !== 'number') return typed;
  // A JSON number only when it reads back exactly as typed: "19.50" and "007" stay text.
  const parsed = Number(typed);
  return String(parsed) === typed ? parsed : typed;
};

/**
 * An item as JSON. A nested item with nothing to say is left out; a top-level one is always
 * written. `position` is set for a step of a numbered list.
 */
const writeItem = (
  item: Item,
  definition: Definition | undefined,
  ids: Map<string, string>,
  top: boolean,
  position?: number,
): JsonObject | undefined => {
  const out: JsonObject = { '@type': item.type };
  const id = top ? ids.get(item.key) : item.id.trim();
  if (id) out['@id'] = id;
  if (position !== undefined) out.position = position;

  const fields = definition?.fields ?? [];
  const order = new Set([
    ...fields.map((field) => field.property),
    ...item.properties.map((property) => property.name),
  ]);
  let wrote = false;
  for (const name of order) {
    const field = fields.find((candidate) => candidate.property === name);
    const written: Json[] = [];
    for (const value of valuesOf(item, name)) {
      const json =
        value.kind === 'item'
          ? writeItem(
              value.item,
              nestedDefinition(field, value.item.type),
              ids,
              false,
              field?.numbered ? written.length + 1 : undefined,
            )
          : writeScalar(value, ids);
      if (json !== undefined) written.push(json);
    }
    const [only] = written;
    if (only === undefined) continue;
    out[name] = written.length === 1 ? only : written;
    wrote = true;
  }
  return wrote || top || id ? out : undefined;
};

/** The draft as a JSON-LD object: one item on its own, several as one `@graph`. */
export const serialize = (draft: Draft): JsonObject | undefined => {
  const ids = idsFor(draft);
  const items = draft.items
    .map((item) => writeItem(item, topDefinition(item.type), ids, true))
    .filter((item) => item !== undefined);
  const [only] = items;
  if (only === undefined) return undefined;
  return items.length === 1
    ? { '@context': CONTEXT, ...only }
    : { '@context': CONTEXT, '@graph': items };
};

export const toJson = (draft: Draft): string => {
  const out = serialize(draft);
  return out === undefined ? '' : JSON.stringify(out, null, 2);
};

/**
 * The draft as a script element to paste into a page. Every `<` in the JSON is written as
 * `\u003c`, so nothing typed into a value can end the element or open a comment.
 */
export const toScriptTag = (draft: Draft): string => {
  const json = toJson(draft);
  if (json === '') return '';
  return `<script type="application/ld+json">\n${json.replaceAll('<', '\\u003c')}\n</script>`;
};
