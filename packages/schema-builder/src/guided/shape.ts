import type { ValueKind } from '../model.ts';

export type Level = 'required' | 'recommended' | 'optional';
export type Format = 'currency' | 'rating';

export interface Field {
  property: string;
  label: string;
  /** One plain line under the label. May be empty. */
  hint: string;
  /** The kinds of value the field takes. The first is what a new value starts as. */
  kinds: ValueKind[];
  level: Level;
  repeats: boolean;
  /** For an item value: the definition used for each type the field offers. */
  nested?: Record<string, string>;
  /** Values offered for a text field, as full Schema.org addresses. */
  choices?: string[];
  format?: Format;
  /** Nested items are written with a `position`, counted from 1. */
  numbered?: boolean;
}

export interface Definition {
  id: string;
  type: string;
  /** Other types the same form serves. */
  variants: string[];
  label: string;
  /** Shown above the form. Empty when there is nothing to say. */
  note: string;
  fields: Field[];
  /** Groups of properties of which at least one must have a value. */
  oneOf: string[][];
}

export const REQ: Level = 'required';
export const REC: Level = 'recommended';
export const OPT: Level = 'optional';

export const field = (
  property: string,
  label: string,
  hint: string,
  kinds: ValueKind | ValueKind[],
  level: Level,
  extra: Partial<Field> = {},
): Field => ({ property, label, hint, kinds: [kinds].flat(), level, repeats: false, ...extra });

/** A definition whose type is the last part of its id: `Product.Offer` is for `Offer`. */
export const define = (
  id: string,
  label: string,
  fields: Field[],
  extra: Partial<Definition> = {},
): Definition => ({
  id,
  type: id.split('.').pop() ?? id,
  variants: [],
  label,
  note: '',
  fields,
  oneOf: [],
  ...extra,
});

export const schema = (...names: string[]): string[] =>
  names.map((name) => `https://schema.org/${name}`);
