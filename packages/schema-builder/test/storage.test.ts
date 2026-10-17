import { describe, expect, it } from 'vitest';
import type { Item } from '../src/index.ts';
import { LIMITS, pack, STORAGE_KEY, STORAGE_VERSION, unpack } from '../src/index.ts';
import { draftOf, make, nested, ref, text } from './helpers.ts';

const stored = (draft: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ version: STORAGE_VERSION, form: 'script', draft, ...extra });

describe('stored drafts', () => {
  it('uses the key the privacy page names', () => {
    expect(STORAGE_KEY).toBe('ay-schema-draft');
  });

  it('reads back exactly what was packed', () => {
    const draft = draftOf(make('Organization', { name: text('Acme') }, 'org'), {
      ...make(
        'Article',
        {
          headline: text('Hi'),
          datePublished: text('2026-10-13', 'date'),
          isAccessibleForFree: { kind: 'boolean', on: true },
          publisher: ref('org'),
          author: nested(make('Person', { name: text('Ada') }, 'p')),
        },
        'art',
      ),
      id: '#article',
    });
    expect(unpack(pack({ draft, form: 'json' }))).toEqual({ draft, form: 'json' });
  });

  it('gives nothing for nothing', () => {
    expect(unpack(null)).toBeUndefined();
    expect(unpack(undefined)).toBeUndefined();
    expect(unpack('')).toBeUndefined();
  });

  it('gives nothing for text that is not JSON, or JSON that is not a draft', () => {
    for (const bad of [
      '{',
      'null',
      '[]',
      '"draft"',
      '42',
      '{"version":1}',
      '{"draft":{"items":[]}}',
    ]) {
      expect(unpack(bad), bad).toBeUndefined();
    }
  });

  it('gives nothing for another version', () => {
    expect(unpack(stored({ items: [] }, { version: 2 }))).toBeUndefined();
    expect(unpack(stored({ items: [] }, { version: '1' }))).toBeUndefined();
    expect(unpack(stored({ items: [] }))).toEqual({ draft: { items: [] }, form: 'script' });
  });

  it('gives nothing for an unknown output form', () => {
    expect(unpack(stored({ items: [] }, { form: 'xml' }))).toBeUndefined();
  });

  it('gives nothing for a value of an unknown kind or the wrong shape', () => {
    const withValue = (value: unknown) =>
      stored({
        items: [{ key: 'a', type: 'Thing', id: '', properties: [{ name: 'x', values: [value] }] }],
      });
    expect(unpack(withValue({ kind: 'text', text: 'ok' }))).toBeDefined();
    for (const bad of [
      { kind: 'html', text: '<b>' },
      { kind: 'text', text: 5 },
      { kind: 'text' },
      { kind: 'boolean', on: 'yes' },
      { kind: 'item', item: null },
      { kind: 'reference' },
      'plain',
      null,
    ]) {
      expect(unpack(withValue(bad)), JSON.stringify(bad)).toBeUndefined();
    }
  });

  it('gives nothing for fields it does not know', () => {
    expect(
      unpack(stored({ items: [{ key: 'a', type: 'Thing', id: '', properties: [], extra: 1 }] })),
    ).toBeUndefined();
    expect(
      unpack(
        stored({
          items: [
            {
              key: 'a',
              type: 'Thing',
              id: '',
              properties: [{ name: 'x', values: [{ kind: 'text', text: 'y', html: '<b>' }] }],
            },
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it('gives nothing for an item with no key or no type, or a property with no values', () => {
    expect(
      unpack(stored({ items: [{ key: '', type: 'Thing', id: '', properties: [] }] })),
    ).toBeUndefined();
    expect(
      unpack(stored({ items: [{ key: 'a', type: '', id: '', properties: [] }] })),
    ).toBeUndefined();
    expect(
      unpack(
        stored({
          items: [{ key: 'a', type: 'Thing', id: '', properties: [{ name: 'x', values: [] }] }],
        }),
      ),
    ).toBeUndefined();
  });

  it('gives nothing for a draft past any limit', () => {
    const many = Array.from({ length: LIMITS.items + 1 }, (_, n) => make('Thing', {}, `k${n}`));
    expect(unpack(stored({ items: many }))).toBeUndefined();

    const long = make('Thing', { name: text('x'.repeat(LIMITS.text + 1)) }, 'a');
    expect(unpack(stored({ items: [long] }))).toBeUndefined();

    const wide = make(
      'Thing',
      { name: Array.from({ length: LIMITS.values + 1 }, () => text('x')) },
      'a',
    );
    expect(unpack(stored({ items: [wide] }))).toBeUndefined();

    const twins = [make('Thing', {}, 'same'), make('Thing', {}, 'same')];
    expect(unpack(stored({ items: twins }))).toBeUndefined();
  });

  it('gives nothing for a draft nested too deep, however deep, without throwing', () => {
    const chain = (depth: number): Item =>
      depth === 1 ? make('Thing') : make('Thing', { about: nested(chain(depth - 1)) });
    expect(unpack(stored({ items: [chain(LIMITS.depth)] }))).toBeDefined();
    expect(unpack(stored({ items: [chain(LIMITS.depth + 1)] }))).toBeUndefined();
    expect(unpack(stored({ items: [chain(50)] }))).toBeUndefined();

    const absurd = `${'{"a":'.repeat(20_000)}1${'}'.repeat(20_000)}`;
    expect(() => unpack(absurd)).not.toThrow();
    expect(unpack(absurd)).toBeUndefined();
  });

  it('gives nothing for text too large to be a draft, without parsing it', () => {
    expect(unpack(' '.repeat(6_000_000))).toBeUndefined();
  });
});

describe('stored drafts the editor could never have made', () => {
  const item = (extra: Record<string, unknown>) =>
    stored({ items: [{ key: 'a', type: 'Thing', id: '', properties: [], ...extra }] });
  const value = { kind: 'text', text: 'x' };

  it('gives nothing for two properties of one name in an item', () => {
    const twice = [
      { name: 'x', values: [value] },
      { name: 'x', values: [value] },
    ];
    expect(unpack(item({ properties: twice }))).toBeUndefined();
    expect(unpack(item({ properties: [twice[0]] }))).toBeDefined();
  });

  it('gives nothing for a name that is not a plain Schema.org name', () => {
    for (const name of ['@context', '@type', '__proto__', 'a b', 'a-b', '<b>', 'x"y']) {
      expect(unpack(item({ properties: [{ name, values: [value] }] })), name).toBeUndefined();
      expect(unpack(item({ type: name })), name).toBeUndefined();
    }
    expect(unpack(item({ type: '3DModel' }))).toBeDefined();
  });

  it('gives nothing for a key that could not be part of an element id', () => {
    for (const key of ['a b', 'a"b', '__proto__', 'a.b']) {
      expect(unpack(item({ key })), key).toBeUndefined();
    }
    expect(unpack(item({ key: '0b9c2f0e-7d0a-4b1e-9a57-3f1f6c1d2e33' }))).toBeDefined();
  });

  it('gives nothing for a draft with more values in all than the editor can show', () => {
    const many = (count: number) =>
      Array.from({ length: LIMITS.items }, (_, n) =>
        make(
          'Thing',
          Object.fromEntries(
            Array.from({ length: count / LIMITS.items / 50 }, (_, p) => [
              `p${p}`,
              Array.from({ length: 50 }, () => text('x')),
            ]),
          ),
          `k${n}`,
        ),
      );
    expect(unpack(stored({ items: many(LIMITS.total) }))).toBeDefined();
    const over = many(LIMITS.total);
    over[0]!.properties.push({ name: 'extra', values: [text('x')] });
    expect(unpack(stored({ items: over }))).toBeUndefined();
  });
});
