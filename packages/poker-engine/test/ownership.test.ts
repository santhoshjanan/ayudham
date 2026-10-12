import { describe, expect, it } from 'vitest';
import { apply, snapshotFor } from '../src/index.ts';
import { forbidden, msg, run, seeded } from './helpers.ts';

const promote = (from: string, participantId: string) =>
  msg(from, { type: 'promote', participantId });
const demote = (from: string, participantId: string) =>
  msg(from, { type: 'demote', participantId });
const flags = (state: ReturnType<typeof seeded>, id: string) => {
  const person = state.participants.find((p) => p.id === id);
  return { moderator: person?.moderator, owner: person?.owner };
};

describe('ownership', () => {
  it('starts with the creator as the only owner, and says so in snapshots', () => {
    const state = seeded();
    expect(state.participants.map((p) => p.owner)).toEqual([true, false, false]);
    expect(snapshotFor(state, 'a', 0)?.you.owner).toBe(false);
    expect(snapshotFor(state, 'a', 0)?.participants.map((p) => p.owner)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('lets the owner take moderator rights away, and asks for that to be saved', () => {
    const twoMods = run(seeded(), [promote('m', 'a')]);
    const outcome = apply(twoMods, demote('m', 'a'), 0);
    expect(flags(outcome.state, 'a')).toEqual({ moderator: false, owner: false });
    expect(outcome.effects).toEqual([{ type: 'persistDemotion', id: 'a' }]);
    expect(apply(outcome.state, msg('a', { type: 'reveal' }), 0).effects).toEqual([forbidden('a')]);
  });

  it('refuses a demotion by a moderator who is not the owner', () => {
    const threeMods = run(seeded(), [promote('m', 'a'), promote('m', 's')]);
    const outcome = apply(threeMods, demote('a', 's'), 0);
    expect(outcome.state).toBe(threeMods);
    expect(outcome.effects).toEqual([forbidden('a')]);
    expect(apply(threeMods, demote('a', 'm'), 0).effects).toEqual([forbidden('a')]);
  });

  it('refuses demoting yourself, someone who is not a moderator, or someone who is not there', () => {
    const state = seeded();
    for (const target of ['m', 'a', 'nobody']) {
      expect(apply(state, demote('m', target), 0).effects).toEqual([forbidden('m')]);
    }
  });

  it('hands ownership to one person, who becomes a moderator; the previous owner stays one', () => {
    const next = apply(seeded(), { type: 'transferOwnership', id: 'a' }, 0).state;
    expect(flags(next, 'a')).toEqual({ moderator: true, owner: true });
    expect(flags(next, 'm')).toEqual({ moderator: true, owner: false });
    expect(next.participants.filter((p) => p.owner)).toHaveLength(1);
    // The new owner can now demote the old one.
    expect(flags(apply(next, demote('a', 'm'), 0).state, 'm')).toEqual({
      moderator: false,
      owner: false,
    });
  });

  it('ignores a transfer to someone who is not in the room', () => {
    const state = seeded();
    expect(apply(state, { type: 'transferOwnership', id: 'nobody' }, 0).state).toBe(state);
  });

  it('keeps a moderator from being removed until they are demoted', () => {
    const twoMods = run(seeded(), [promote('m', 'a')]);
    const remove = msg('m', { type: 'removeParticipant', participantId: 'a' });
    expect(apply(twoMods, remove, 0).effects).toEqual([forbidden('m')]);
    const demoted = apply(twoMods, demote('m', 'a'), 0).state;
    expect(apply(demoted, remove, 0).state.participants.map((p) => p.id)).toEqual(['m', 's']);
  });
});
