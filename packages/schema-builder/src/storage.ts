import { z } from './zod.ts';
import { draftProblem } from './changes.ts';
import { LIMITS } from './limits.ts';
import type { Draft, Item, Value } from './model.ts';
import { TEXT_KINDS } from './model.ts';

export const STORAGE_KEY = 'pj-schema-draft';
export const STORAGE_VERSION = 1;

export type OutputForm = 'script' | 'json';

export interface Stored {
  draft: Draft;
  form: OutputForm;
}

/** Far larger than a draft within the limits. Anything longer is not parsed at all. */
const LARGEST = 5_000_000;

const Name = z.string().min(1).max(LIMITS.name);

const StoredValue: z.ZodType<Value> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.enum(TEXT_KINDS), text: z.string() }),
    z.strictObject({ kind: z.literal('boolean'), on: z.boolean() }),
    z.strictObject({ kind: z.literal('item'), item: StoredItem }),
    z.strictObject({ kind: z.literal('reference'), key: z.string() }),
  ]),
);

const StoredItem: z.ZodType<Item> = z.lazy(() =>
  z.strictObject({
    key: Name,
    type: Name,
    id: z.string(),
    properties: z.array(z.strictObject({ name: Name, values: z.array(StoredValue).min(1) })),
  }),
);

const Envelope = z.strictObject({
  version: z.literal(STORAGE_VERSION),
  form: z.enum(['script', 'json']),
  draft: z.strictObject({ items: z.array(StoredItem) }),
});

export const pack = (stored: Stored): string =>
  JSON.stringify({ version: STORAGE_VERSION, form: stored.form, draft: stored.draft });

/**
 * A stored draft read back. What is in storage is not trusted: a person, an extension or an
 * older version of the app may have written anything. Whatever is not a draft of this version
 * within every limit gives nothing, and this never throws.
 */
export const unpack = (text: string | null | undefined): Stored | undefined => {
  if (!text || text.length > LARGEST) return undefined;
  try {
    const parsed = Envelope.safeParse(JSON.parse(text));
    if (!parsed.success) return undefined;
    const { draft, form } = parsed.data;
    return draftProblem(draft) === undefined ? { draft, form } : undefined;
  } catch {
    // Not JSON, or nested so deep that reading it ran out of stack.
    return undefined;
  }
};
