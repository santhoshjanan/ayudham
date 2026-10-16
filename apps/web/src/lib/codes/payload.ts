import { linkPayload, type Result, type TextOptions } from '@pokerji/code-maker';
import { symbologyOf, type KindId } from './kinds.ts';

export type Payload = { text: string; id: string; textOptions: TextOptions };

export type LinkFields = { address: string; eci: boolean };

/** Each kind's fields as the page first shows them. */
export function blankFields(kind: KindId): Record<string, unknown> {
  if (kind === 'qr-link') return { address: '', eci: false } satisfies LinkFields;
  return {};
}

const LF = { escapes: false, trim: false, newline: 'lf' } as const;

/** The text a kind's fields make, and how the encoder should read it. */
export function payloadFor(kind: KindId, fields: Record<string, unknown>): Result<Payload> {
  const id = symbologyOf(kind).id;
  if (kind === 'qr-link') {
    const { address, eci } = fields as LinkFields;
    const made = linkPayload(address);
    return made.ok
      ? { ok: true, value: { text: made.value, id, textOptions: { ...LF, eci } } }
      : made;
  }
  return { ok: false, problem: 'empty' };
}
