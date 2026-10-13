import { describe, expect, it } from 'vitest';
import {
  addItem,
  addValue,
  blankItem,
  draftProblem,
  emptyDraft,
  itemAt,
  LIMITS,
  moveItem,
  moveValue,
  newItem,
  refersTo,
  removeItem,
  removeValue,
  setId,
  setType,
  setValue,
  valuesOf,
} from '../src/index.ts';
import { draftOf, make, nested, ref, text } from './helpers.ts';

const top = (key: string) => ({ key, steps: [] });

describe('items', () => {
  it('adds, moves and removes top-level items without mutating the draft', () => {
    const empty = emptyDraft();
    const one = addItem(empty, newItem('a', 'Person')).draft;
    const two = addItem(one, newItem('b', 'Organization')).draft;
    expect(empty.items).toEqual([]);
    expect(two.items.map((item) => item.key)).toEqual(['a', 'b']);
    expect(moveItem(two, 'b', -1).draft.items.map((item) => item.key)).toEqual(['b', 'a']);
    expect(moveItem(two, 'b', 1).draft).toBe(two);
    expect(removeItem(two, 'a').draft.items.map((item) => item.key)).toEqual(['b']);
  });

  it('refuses a twenty-first item, a repeated key and an unknown key', () => {
    let draft = emptyDraft();
    for (let n = 0; n < LIMITS.items; n += 1)
      draft = addItem(draft, newItem(`k${n}`, 'Thing')).draft;
    expect(addItem(draft, newItem('extra', 'Thing'))).toEqual({ draft, refused: 'too-many-items' });
    const small = draftOf(make('Thing', {}, 'a'));
    expect(addItem(small, newItem('a', 'Thing')).refused).toBe('duplicate-key');
    expect(removeItem(small, 'missing').refused).toBe('not-found');
  });
});

describe('values', () => {
  it('adds, changes, moves and removes values of a top-level item', () => {
    const start = draftOf(make('Person', {}, 'a'));
    const one = addValue(start, top('a'), 'name', text('Ada')).draft;
    const two = addValue(one, top('a'), 'name', text('Countess')).draft;
    expect(valuesOf(two.items[0]!, 'name')).toEqual([text('Ada'), text('Countess')]);
    const moved = moveValue(two, top('a'), { property: 'name', index: 1 }, -1).draft;
    expect(valuesOf(moved.items[0]!, 'name')).toEqual([text('Countess'), text('Ada')]);
    const changed = setValue(
      moved,
      top('a'),
      { property: 'name', index: 0 },
      text('Lovelace'),
    ).draft;
    expect(valuesOf(changed.items[0]!, 'name')[0]).toEqual(text('Lovelace'));
    const removed = removeValue(changed, top('a'), { property: 'name', index: 0 }).draft;
    expect(valuesOf(removed.items[0]!, 'name')).toEqual([text('Ada')]);
    expect(valuesOf(start.items[0]!, 'name')).toEqual([]);
  });

  it('drops a property when its last value is removed', () => {
    const start = draftOf(make('Person', { name: text('Ada') }, 'a'));
    const removed = removeValue(start, top('a'), { property: 'name', index: 0 }).draft;
    expect(removed.items[0]!.properties).toEqual([]);
  });

  it('reaches a nested item through a path', () => {
    const start = draftOf(make('Product', { offers: nested(make('Offer', {}, 'o')) }, 'p'));
    const at = { key: 'p', steps: [{ property: 'offers', index: 0 }] };
    const next = addValue(start, at, 'price', text('9.50', 'number')).draft;
    expect(valuesOf(itemAt(next, at)!, 'price')).toEqual([text('9.50', 'number')]);
    expect(itemAt(start, at)!.properties).toEqual([]);
  });

  it('refuses a path that does not lead to an item', () => {
    const start = draftOf(make('Person', { name: text('Ada') }, 'a'));
    const bad = { key: 'a', steps: [{ property: 'name', index: 0 }] };
    expect(addValue(start, bad, 'x', text('y')).refused).toBe('not-found');
    expect(setValue(start, top('a'), { property: 'name', index: 5 }, text('y')).refused).toBe(
      'not-found',
    );
    expect(itemAt(start, bad)).toBeUndefined();
  });

  it('refuses the fifty-first value and the hundred-and-first property', () => {
    let draft = draftOf(make('Thing', {}, 'a'));
    for (let n = 0; n < LIMITS.values; n += 1)
      draft = addValue(draft, top('a'), 'name', text('x')).draft;
    expect(addValue(draft, top('a'), 'name', text('x')).refused).toBe('too-many-values');

    let wide = draftOf(make('Thing', {}, 'a'));
    for (let n = 0; n < LIMITS.properties; n += 1)
      wide = addValue(wide, top('a'), `p${n}`, text('x')).draft;
    expect(addValue(wide, top('a'), 'another', text('x')).refused).toBe('too-many-properties');
    expect(addValue(wide, top('a'), 'p0', text('y')).refused).toBeUndefined();
  });

  it('refuses text longer than the limit and names longer than the limit', () => {
    const start = draftOf(make('Thing', {}, 'a'));
    const long = 'x'.repeat(LIMITS.text + 1);
    expect(addValue(start, top('a'), 'name', text(long)).refused).toBe('too-long');
    expect(addValue(start, top('a'), 'n'.repeat(LIMITS.name + 1), text('x')).refused).toBe(
      'too-long',
    );
    expect(setId(start, top('a'), long).refused).toBe('too-long');
    expect(
      addValue(start, top('a'), 'name', text('x'.repeat(LIMITS.text))).refused,
    ).toBeUndefined();
  });

  it('refuses nesting deeper than five items', () => {
    let draft = draftOf(make('Thing', {}, 'd1'));
    const steps: { property: string; index: number }[] = [];
    for (let depth = 2; depth <= LIMITS.depth; depth += 1) {
      const change = addValue(
        draft,
        { key: 'd1', steps: [...steps] },
        'about',
        nested(make('Thing')),
      );
      expect(change.refused).toBeUndefined();
      draft = change.draft;
      steps.push({ property: 'about', index: 0 });
    }
    expect(addValue(draft, { key: 'd1', steps }, 'about', nested(make('Thing'))).refused).toBe(
      'too-deep',
    );
    expect(draftProblem(draft)).toBeUndefined();
  });

  it('counts the depth of a nested item that arrives already filled', () => {
    const deep = make('Thing', { about: nested(make('Thing', { about: nested(make('Thing')) })) });
    const start = draftOf(
      make(
        'Thing',
        { about: nested(make('Thing', { about: nested(make('Thing', {}, 'c')) }, 'b')) },
        'a',
      ),
    );
    const at = {
      key: 'a',
      steps: [
        { property: 'about', index: 0 },
        { property: 'about', index: 0 },
      ],
    };
    expect(addValue(start, at, 'about', nested(deep)).refused).toBe('too-deep');
  });
});

describe('type and id', () => {
  it('keeps only the properties the new type has', () => {
    const start = draftOf(
      make('Article', { headline: text('Hi'), wordCount: text('9', 'number') }, 'a'),
    );
    const next = setType(start, top('a'), 'Person', (property) => property === 'headline').draft;
    expect(next.items[0]).toMatchObject({ type: 'Person', properties: [{ name: 'headline' }] });
  });

  it('sets an id', () => {
    const start = draftOf(make('Person', {}, 'a'));
    expect(setId(start, top('a'), '#me').draft.items[0]!.id).toBe('#me');
  });
});

describe('references and blanks', () => {
  it('finds a reference at any depth', () => {
    const draft = draftOf(
      make('Organization', {}, 'org'),
      make('Article', { author: nested(make('Person', { worksFor: ref('org') })) }, 'art'),
    );
    expect(refersTo(draft, 'org')).toBe(true);
    expect(refersTo(draft, 'art')).toBe(false);
  });

  it('treats whitespace and empty nested items as blank, and false as a value', () => {
    expect(blankItem(make('Offer', { price: text('  ', 'number') }))).toBe(true);
    expect(blankItem(make('Product', { offers: nested(make('Offer')) }))).toBe(true);
    expect(blankItem(make('Offer', { price: text('0', 'number') }))).toBe(false);
    expect(blankItem(make('Thing', { isFamilyFriendly: { kind: 'boolean', on: false } }))).toBe(
      false,
    );
  });
});
