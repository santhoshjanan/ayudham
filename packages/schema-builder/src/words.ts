import type { Refusal } from './changes.ts';
import type { Finding } from './checks.ts';
import { topDefinition } from './definitions.ts';
import { definitionAt } from './fields.ts';
import { LIMITS } from './limits.ts';
import type { Draft, Item } from './model.ts';
import { itemAt, valuesOf } from './model.ts';

/** A type's name as people read it: the guided label, or the name spaced out. */
export const typeLabel = (type: string): string => {
  const definition = topDefinition(type);
  if (definition?.type === type) return definition.label;
  const spaced = type.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0) + spaced.slice(1).toLowerCase();
};

/** What an item is called in a list: its type and, if it has one, its name. */
export const itemTitle = (item: Item): string => {
  for (const property of ['name', 'headline']) {
    const value = valuesOf(item, property)[0];
    if (value && 'text' in value && value.text.trim() !== '') {
      return `${typeLabel(item.type)}: ${value.text.trim()}`;
    }
  }
  return typeLabel(item.type);
};

export interface FindingWords {
  /** Where the finding is: the top-level item, then each nested item down to it. */
  where: string;
  text: string;
}

/** A finding as a sentence, with the field named by the label the form gives it. */
export const findingWords = (draft: Draft, finding: Finding): FindingWords => {
  const at = { key: finding.item, steps: finding.steps };
  const top = draft.items.find((item) => item.key === finding.item);
  const holder = itemAt(draft, at);
  const definition = definitionAt(draft, at);
  const labelOf = (property: string): string =>
    definition?.fields.find((field) => field.property === property)?.label ?? property;
  const label = labelOf(finding.property);

  const trail = top ? [itemTitle(top)] : [];
  for (let depth = 1; depth <= finding.steps.length; depth += 1) {
    const nested = itemAt(draft, { key: finding.item, steps: finding.steps.slice(0, depth) });
    if (nested) trail.push(typeLabel(nested.type));
  }

  const sentence = (): string => {
    switch (finding.kind) {
      case 'missing-required':
        return finding.anyOf
          ? `Add at least one of: ${finding.anyOf.map(labelOf).join(', ')}.`
          : `${label} is required.`;
      case 'missing-recommended':
        return `${label} is recommended.`;
      case 'bad-url':
        return `${label} is not a full web address. It should start with https://.`;
      case 'bad-date':
        return `${label} is not a date or time in the expected form, such as 2026-10-13.`;
      case 'bad-number':
        return `${label} is not a plain number, such as 19.99.`;
      case 'bad-currency':
        return `${label} should be a three-letter currency code, such as USD.`;
      case 'out-of-range':
        return `${label} is outside the rating scale.`;
      case 'dangling-reference':
        return `${label} refers to an item that has been removed.`;
      case 'unknown-property':
        return `${holder ? typeLabel(holder.type) : 'This type'} has no property called ${finding.property}.`;
    }
  };

  return { where: trail.join(' › '), text: sentence() };
};

export const REFUSAL_WORDS: Record<Refusal, string> = {
  'too-many-items': `A draft holds at most ${LIMITS.items} items.`,
  'too-deep': `Items can be nested ${LIMITS.depth} deep at most.`,
  'too-many-values': `A property holds at most ${LIMITS.values} values.`,
  'too-many-properties': `An item holds at most ${LIMITS.properties} properties.`,
  'too-long': `A value can be ${LIMITS.text.toLocaleString('en')} characters at most.`,
  'not-found': 'That part of the draft is no longer there.',
  'duplicate-key': 'That item is already in the draft.',
  'bad-name': 'That name cannot be used. Names are letters and digits only.',
  'too-large': `A draft holds at most ${LIMITS.total.toLocaleString('en')} values in all.`,
};
