import { SYMBOLOGIES, type Symbology } from '@pokerji/code-maker';

/** What a QR code can hold, in the order the page offers them. An id is also its fragment. */
export const QR_KINDS = [
  { id: 'qr-link', label: 'Link', heading: 'Link' },
  { id: 'qr-text', label: 'Text', heading: 'Text' },
  { id: 'qr-card', label: 'Business card', heading: 'Business card' },
  { id: 'qr-event', label: 'Event', heading: 'Event' },
  { id: 'qr-wifi', label: 'Wi-Fi', heading: 'Wi-Fi network' },
  { id: 'qr-place', label: 'Location', heading: 'Location' },
  { id: 'qr-email', label: 'Email', heading: 'Email' },
  { id: 'qr-sms', label: 'SMS', heading: 'Text message' },
  { id: 'qr-phone', label: 'Phone', heading: 'Phone number' },
] as const;

export type QrKindId = (typeof QR_KINDS)[number]['id'];

const GROUP_LABELS = { '2d': '2D', product: 'Product', linear: 'Linear' } as const;

/** Every other code, grouped as the catalogue groups them. Plain QR is reached through a kind. */
export const OTHER_GROUPS: readonly { label: '2D' | 'Product' | 'Linear'; ids: string[] }[] = (
  ['2d', 'product', 'linear'] as const
).map((group) => ({
  label: GROUP_LABELS[group],
  ids: SYMBOLOGIES.filter((entry) => entry.group === group && entry.id !== 'qr').map(
    (entry) => entry.id,
  ),
}));

/** A QR kind's id, or a symbology's id other than plain QR. */
export type KindId = QrKindId | (string & {});

const ALL: ReadonlySet<string> = new Set<string>([
  ...QR_KINDS.map((kind) => kind.id),
  ...OTHER_GROUPS.flatMap((group) => group.ids),
]);

export const isQrKind = (kind: KindId): kind is QrKindId => kind.startsWith('qr-');

/**
 * The kind an address fragment names. The fragment is whatever someone put in a link, so it is
 * only ever compared with the list; anything else opens Link.
 */
export function kindFrom(hash: string): KindId {
  const name = hash.startsWith('#') ? hash.slice(1) : hash;
  return ALL.has(name) ? name : 'qr-link';
}

/** The symbology a kind is made with. */
export const symbologyOf = (kind: KindId): Symbology =>
  SYMBOLOGIES.find((entry) => entry.id === (isQrKind(kind) ? 'qr' : kind))!;

/** The heading for a kind's Content section. */
export const headingOf = (kind: KindId): string =>
  isQrKind(kind) ? QR_KINDS.find((entry) => entry.id === kind)!.heading : symbologyOf(kind).label;
