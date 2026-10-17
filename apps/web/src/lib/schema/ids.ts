import type { ItemPath } from '@ayudham/schema-builder';

/** An item's place in the draft as one string, for building DOM ids. */
export const pathId = (at: ItemPath): string =>
  [at.key, ...at.steps.flatMap((step) => [step.property, step.index])].join('-');

/** The DOM id of the control for one value of a property. A finding focuses it. */
export const fieldId = (at: ItemPath, property: string, index: number): string =>
  `f-${pathId(at)}-${property}-${index}`;
