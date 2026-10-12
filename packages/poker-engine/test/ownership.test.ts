import { describe, expect, it } from 'vitest';
import { apply, snapshotFor } from '../src/index.ts';
import { ann, forbidden, mo, msg, run, seeded } from './helpers.ts';

const promote = (from: string, participantId: string) =>
  msg(from, { type: 'promote', participantId });
const flags = (state: ReturnType<typeof seeded>, id: string) => {
  const person = state.participants.find((p) => p.id === id);
  return { moderator: person?.moderator, owner: person?.owner };
};
const owners = (state: ReturnType<typeof seeded>) =>
  state.participants.filter((p) => p.owner).map((p) => p.id);

describe('ownership', () => {
  it('starts with the creator as the only owner, and says so in snapshots', () => {
    const state = seeded();
    expect(owners(state)).toEqual(['m']);
    expect(snapshotFor(state, 'a', 0)?.you.owner).toBe(false);
    expect(snapshotFor(state, 'a', 0)?.participants.map((p) => p.owner)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('takes moderator rights away when the host says the owner demoted someone', () => {
    const twoMods = run(seeded(), [promote('m', 'a')]);
    const demoted = apply(twoMods, { type: 'revokeModerator', id: 'a' }, 0).state;
    expect(flags(demoted, 'a')).toEqual({ moderator: false, owner: false });
    expect(apply(demoted, msg('a', { type: 'reveal' }), 0).effects).toEqual([forbidden('a')]);
  });

  it('never demotes the owner', () => {
    const state = apply(seeded(), { type: 'revokeModerator', id: 'm' }, 0).state;
    expect(flags(state, 'm')).toEqual({ moderator: true, owner: true });
  });

  it('hands ownership to one person, who becomes a moderator; the previous owner stays one', () => {
    const next = apply(seeded(), { type: 'transferOwnership', id: 'a' }, 0).state;
    expect(flags(next, 'a')).toEqual({ moderator: true, owner: true });
    expect(flags(next, 'm')).toEqual({ moderator: true, owner: false });
    expect(owners(next)).toEqual(['a']);
  });

  it('takes ownership from the old owner even when the new owner is not in the live room', () => {
    const next = apply(seeded(), { type: 'transferOwnership', id: 'someone-not-here' }, 0).state;
    expect(owners(next)).toEqual([]);
    expect(flags(next, 'm')).toEqual({ moderator: true, owner: false });
  });

  it('believes the stored owner when they join, so there is never a second one', () => {
    // Ann became the owner while she was not in the live room.
    const without = apply(seeded(), { type: 'evict', ids: ['a'] }, 0).state;
    const joined = apply(
      without,
      { type: 'join', participant: { ...ann, moderator: true, owner: true } },
      0,
    ).state;
    expect(owners(joined)).toEqual(['a']);
    expect(flags(joined, 'm')).toEqual({ moderator: true, owner: false });
  });

  it('updates someone already in the room who rejoins as the owner', () => {
    const rejoined = apply(
      seeded(),
      { type: 'join', participant: { ...ann, moderator: true, owner: true } },
      0,
    ).state;
    expect(owners(rejoined)).toEqual(['a']);
    expect(flags(rejoined, 'a')).toEqual({ moderator: true, owner: true });
    expect(rejoined.participants).toHaveLength(3);
  });

  it('leaves ownership alone when anyone else rejoins', () => {
    const rejoined = apply(seeded(), { type: 'join', participant: mo }, 0).state;
    expect(owners(rejoined)).toEqual(['m']);
    const other = apply(seeded(), { type: 'join', participant: ann }, 0).state;
    expect(owners(other)).toEqual(['m']);
  });

  it('never lets the owner be removed, whoever asks', () => {
    // A moderator who is no longer the owner cannot remove the new owner.
    const transferred = apply(seeded(), { type: 'transferOwnership', id: 'a' }, 0).state;
    const remove = msg('m', { type: 'removeParticipant', participantId: 'a' });
    const outcome = apply(transferred, remove, 0);
    expect(outcome.state).toBe(transferred);
    expect(outcome.effects).toEqual([forbidden('m')]);
  });

  it('keeps a moderator from being removed until they are demoted', () => {
    const twoMods = run(seeded(), [promote('m', 'a')]);
    const remove = msg('m', { type: 'removeParticipant', participantId: 'a' });
    expect(apply(twoMods, remove, 0).effects).toEqual([forbidden('m')]);
    const demoted = apply(twoMods, { type: 'revokeModerator', id: 'a' }, 0).state;
    expect(apply(demoted, remove, 0).state.participants.map((p) => p.id)).toEqual(['m', 's']);
  });
});
