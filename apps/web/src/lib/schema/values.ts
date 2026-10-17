import {
  expects,
  newItem,
  TEXT_KINDS,
  typeLabel,
  type Field,
  type TextKind,
  type Value,
  type Vocabulary,
} from '@ayudham/schema-builder';

/**
 * A kind of value a field offers, as the person chooses it: a text kind, 'boolean',
 * 'reference', or 'item:' followed by the type of a nested item.
 */
export type Spec = string;

export interface SpecOption {
  id: Spec;
  label: string;
}

const WORDS: Record<string, string> = {
  text: 'Text',
  url: 'Web address',
  number: 'Number',
  boolean: 'Yes or no',
  date: 'Date',
  dateTime: 'Date and time',
  time: 'Time',
  reference: 'An item from this page',
};

/** The most nested types offered for a property that only the vocabulary describes. */
const MOST_TYPES = 8;

const isTextKind = (spec: Spec): spec is TextKind =>
  (TEXT_KINDS as readonly string[]).includes(spec);

export const specOf = (value: Value): Spec =>
  value.kind === 'item' ? `item:${value.item.type}` : value.kind;

export const specLabel = (spec: Spec): string =>
  spec.startsWith('item:') ? typeLabel(spec.slice(5)) : (WORDS[spec] ?? spec);

/** An empty value of a kind. Text carries over when one text kind replaces another. */
export const blankFor = (spec: Spec, carry = ''): Value => {
  if (spec.startsWith('item:')) {
    return { kind: 'item', item: newItem(crypto.randomUUID(), spec.slice(5)) };
  }
  if (spec === 'reference') return { kind: 'reference', key: '' };
  if (spec === 'boolean') return { kind: 'boolean', on: true };
  return { kind: isTextKind(spec) ? spec : 'text', text: carry };
};

export const convert = (value: Value | undefined, spec: Spec): Value =>
  blankFor(spec, value && 'text' in value ? value.text : '');

/**
 * The kinds of value a field offers, first the one a new value starts as. A field that takes
 * an item also takes a reference, once there is another item on the page to refer to.
 */
export const specsFor = (
  field: Field,
  vocabulary: Vocabulary | undefined,
  others: boolean,
): SpecOption[] => {
  const options: SpecOption[] = [];
  const add = (id: Spec) => {
    if (!options.some((option) => option.id === id)) options.push({ id, label: specLabel(id) });
  };
  for (const kind of field.kinds) {
    if (kind === 'reference') continue;
    if (kind !== 'item') {
      add(kind);
      continue;
    }
    const types = field.nested
      ? Object.keys(field.nested)
      : vocabulary
        ? expects(vocabulary, field.property).itemTypes.slice(0, MOST_TYPES)
        : [];
    for (const type of types) add(`item:${type}`);
  }
  const takesItems = field.kinds.includes('item') || field.kinds.includes('reference');
  if (takesItems && others) add('reference');
  if (options.length === 0) add('text');
  return options;
};
