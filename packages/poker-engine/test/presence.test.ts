import { AWAY_DROP_MS, MAX_PARTICIPANTS, MODERATOR_HEADROOM } from '@ayudham/protocol';
import { describe, expect, it } from 'vitest';
import { apply, createRoom, snapshotFor, type RoomState } from '../src/index.ts';
import { ann, FIB, mo, run, seeded } from './helpers.ts';

const withVote = (state: RoomState, id: string, card: string): RoomState => ({
  ...state,
  participants: state.participants.map((p) => (p.id === id ? { ...p, vote: card } : p)),
});

describe('createRoom', () => {
  it('starts empty, in voting, on round 1', () => {
    expect(createRoom({ deck: FIB, timerSeconds: null, music: null })).toEqual({
      deck: FIB,
      timerSeconds: null,
      music: null,
      title: '',
      phase: 'voting',
      revealAt: null,
      timerEndsAt: null,
      roundSeq: 1,
      result: null,
      saveStatus: 'none',
      participants: [],
    });
  });
});

describe('join', () => {
  it('adds a present participant with no vote', () => {
    const state = run(createRoom({ deck: FIB, timerSeconds: null, music: null }), [
      { type: 'join', participant: ann },
    ]);
    expect(state.participants).toEqual([
      { ...ann, owner: false, present: true, awaySince: null, vote: null },
    ]);
  });

  it('keeps the vote and does not duplicate when someone reconnects mid-round', () => {
    const voted = withVote(seeded(), 'a', '5');
    const away = apply(voted, { type: 'disconnect', id: 'a' }, 1_000).state;
    const back = apply(away, { type: 'join', participant: ann }, 2_000).state;
    expect(back.participants.filter((p) => p.id === 'a')).toEqual([
      { ...ann, owner: false, present: true, awaySince: null, vote: '5' },
    ]);
    expect(back.participants).toHaveLength(3);
  });

  it('refuses the 51st participant and closes their connection', () => {
    const joins = Array.from({ length: MAX_PARTICIPANTS }, (_, i) => ({
      type: 'join' as const,
      participant: { id: `p${i}`, name: `P${i}`, role: 'voter' as const, moderator: false },
    }));
    const full = run(createRoom({ deck: FIB, timerSeconds: null, music: null }), joins);
    const outcome = apply(full, { type: 'join', participant: ann }, 0);
    expect(outcome.state).toBe(full);
    expect(outcome.effects).toEqual([
      { type: 'send', to: 'a', message: { type: 'error', code: 'room_full' } },
      { type: 'close', id: 'a' },
    ]);
  });

  it('lets an existing participant back into a full room', () => {
    const joins = Array.from({ length: MAX_PARTICIPANTS }, (_, i) => ({
      type: 'join' as const,
      participant: { id: `p${i}`, name: `P${i}`, role: 'voter' as const, moderator: false },
    }));
    const full = run(createRoom({ deck: FIB, timerSeconds: null, music: null }), joins);
    const outcome = apply(full, joins[0]!, 0);
    expect(outcome.effects).toEqual([]);
    expect(outcome.state.participants).toHaveLength(MAX_PARTICIPANTS);
  });
});

describe('join when full', () => {
  it('still lets a moderator in, so a full room cannot be left without one', () => {
    const joins = Array.from({ length: MAX_PARTICIPANTS }, (_, i) => ({
      type: 'join' as const,
      participant: { id: `p${i}`, name: `P${i}`, role: 'voter' as const, moderator: false },
    }));
    const full = run(createRoom({ deck: FIB, timerSeconds: null, music: null }), joins);
    const outcome = apply(full, { type: 'join', participant: mo }, 0);
    expect(outcome.effects).toEqual([]);
    expect(outcome.state.participants.at(-1)).toMatchObject({ id: 'm', moderator: true });
  });
});

describe('join when far over the limit', () => {
  it('turns even a moderator away, so moderator rights cannot grow a room without bound', () => {
    const joins = Array.from({ length: MAX_PARTICIPANTS + MODERATOR_HEADROOM }, (_, i) => ({
      type: 'join' as const,
      participant: { id: `p${i}`, name: `P${i}`, role: 'voter' as const, moderator: true },
    }));
    const full = run(createRoom({ deck: FIB, timerSeconds: null, music: null }), joins);
    expect(full.participants).toHaveLength(MAX_PARTICIPANTS + MODERATOR_HEADROOM);
    const outcome = apply(full, { type: 'join', participant: mo }, 0);
    expect(outcome.state).toBe(full);
    expect(outcome.effects).toEqual([
      { type: 'send', to: 'm', message: { type: 'error', code: 'room_full' } },
      { type: 'close', id: 'm' },
    ]);
  });
});

describe('disconnect and tick', () => {
  it('marks a participant away without removing them', () => {
    const state = apply(seeded(), { type: 'disconnect', id: 'a' }, 5_000).state;
    expect(state.participants.find((p) => p.id === 'a')).toMatchObject({
      present: false,
      awaySince: 5_000,
    });
  });

  it('ignores a disconnect for someone who is not in the room', () => {
    const state = seeded();
    expect(apply(state, { type: 'disconnect', id: 'nobody' }, 0).state).toBe(state);
  });

  it('drops a participant after ten minutes away, and not before', () => {
    const away = apply(seeded(), { type: 'disconnect', id: 'a' }, 0).state;
    const early = apply(away, { type: 'tick' }, AWAY_DROP_MS - 1).state;
    expect(early.participants.map((p) => p.id)).toEqual(['m', 'a', 's']);
    const late = apply(away, { type: 'tick' }, AWAY_DROP_MS).state;
    expect(late.participants.map((p) => p.id)).toEqual(['m', 's']);
  });

  it('returns the same state from a tick when nothing is due', () => {
    const state = seeded();
    expect(apply(state, { type: 'tick' }, 1_000_000).state).toBe(state);
  });
});

describe('evict and grantModerator', () => {
  it('removes the named participants and tells them', () => {
    const outcome = apply(seeded(), { type: 'evict', ids: ['a', 'nobody'] }, 0);
    expect(outcome.state.participants.map((p) => p.id)).toEqual(['m', 's']);
    expect(outcome.effects).toEqual([
      { type: 'send', to: 'a', message: { type: 'removed' } },
      { type: 'close', id: 'a' },
    ]);
  });

  it('grants moderator rights', () => {
    const state = apply(seeded(), { type: 'grantModerator', id: 'a' }, 0).state;
    expect(state.participants.find((p) => p.id === 'a')?.moderator).toBe(true);
  });
});

describe('snapshotFor', () => {
  it('returns null for someone who is not in the room', () => {
    expect(snapshotFor(seeded(), 'nobody', 0)).toBeNull();
  });

  it('describes the room for one participant', () => {
    expect(snapshotFor(seeded(), 'a', 1234)).toEqual({
      serverNow: 1234,
      you: { id: 'a', name: 'Ann', role: 'voter', moderator: false, owner: false, vote: null },
      title: '',
      deck: FIB,
      phase: 'voting',
      round: 1,
      revealAt: null,
      timer: { seconds: 60, endsAt: null },
      music: null,
      participants: [
        { ...mo, present: true, hasVoted: false, vote: null },
        { ...ann, owner: false, present: true, hasVoted: false, vote: null },
        {
          id: 's',
          name: 'Sam',
          role: 'spectator',
          moderator: false,
          owner: false,
          present: true,
          hasVoted: false,
          vote: null,
        },
      ],
      result: null,
      saveStatus: 'none',
    });
  });

  it('shows your own vote to you and hides it from others while voting', () => {
    const voted = withVote(seeded(), 'a', '8');
    expect(snapshotFor(voted, 'a', 0)?.you.vote).toBe('8');
    const seenByMo = snapshotFor(voted, 'm', 0);
    expect(seenByMo?.participants.find((p) => p.id === 'a')).toMatchObject({
      hasVoted: true,
      vote: null,
    });
  });
});
