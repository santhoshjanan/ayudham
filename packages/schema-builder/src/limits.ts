/** Every bound on a draft. Enforced on each change and again on a draft read from storage. */
export const LIMITS = {
  items: 20,
  depth: 5,
  values: 50,
  properties: 100,
  text: 5_000,
  name: 100,
} as const;
