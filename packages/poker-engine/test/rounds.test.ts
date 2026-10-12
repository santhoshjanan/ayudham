import { AWAY_DROP_MS } from '@pokerji/protocol';
import { describe, expect, it } from 'vitest';
import { apply, snapshotFor } from '../src/index.ts';
import { forbidden, msg, run, seeded } from './helpers.ts';

const vote = (from: string, card: string) => msg(from, { type: 'vote', card });
const reveal = msg('m', { type: 'reveal' });
const voteOf = (state: ReturnType<typeof seeded>, id: string) =>
  state.participants.find((p) => p.id === id)?.vote;

describe('voting', () => {
  it('records a vote and lets the voter change it', () => {
    const state = run(seeded(), [vote('a', '5'), vote('a', '8')]);
    expect(voteOf(state, 'a')).toBe('8');
  });

  it('clears a vote', () => {
    const state = run(seeded(), [vote('a', '5'), msg('a', { type: 'clearVote' })]);
    expect(voteOf(state, 'a')).toBeNull();
  });

  it('accepts a special card', () => {
    expect(voteOf(run(seeded(), [vote('a', '?')]), 'a')).toBe('?');
  });

  it('refuses a card that is not in the deck and changes nothing', () => {
    const state = seeded();
    const outcome = apply(state, vote('a', 'XL'), 0);
    expect(outcome.state).toBe(state);
    expect(outcome.effects).toEqual([forbidden('a')]);
  });

  it('refuses a vote from a spectator', () => {
    expect(apply(seeded(), vote('s', '5'), 0).effects).toEqual([forbidden('s')]);
  });

  it('ignores a message from someone who is not in the room', () => {
    const state = seeded();
    expect(apply(state, vote('nobody', '5'), 0)).toEqual({ state, effects: [] });
  });
});

describe('reveal', () => {
  it('locks votes for three seconds, then reveals and asks for the round to be saved', () => {
    const voted = run(seeded(), [
      msg('m', { type: 'setTitle', title: 'PROJ-1' }),
      vote('m', '3'),
      vote('a', '8'),
    ]);
    const counting = apply(voted, reveal, 1_000);
    expect(counting.state).toMatchObject({ phase: 'counting', revealAt: 4_000 });
    expect(counting.effects).toEqual([]);

    expect(apply(counting.state, vote('a', '5'), 2_000).effects).toEqual([forbidden('a')]);
    expect(apply(counting.state, msg('a', { type: 'clearVote' }), 2_000).effects).toEqual([
      forbidden('a'),
    ]);
    expect(apply(counting.state, { type: 'tick' }, 3_999).state.phase).toBe('counting');

    const done = apply(counting.state, { type: 'tick' }, 4_000);
    expect(done.state).toMatchObject({ phase: 'revealed', revealAt: null, saveStatus: 'pending' });
    expect(done.state.result).toMatchObject({
      average: 5.5,
      low: '3',
      high: '8',
      unanimous: false,
      lowIds: ['m'],
      highIds: ['a'],
    });
    expect(done.effects).toEqual([
      {
        type: 'persistRound',
        seq: 1,
        title: 'PROJ-1',
        votes: [
          { participantId: 'm', name: 'Mo', card: '3' },
          { participantId: 'a', name: 'Ann', card: '8' },
        ],
      },
    ]);
  });

  it('reveals a round with no votes without saving it', () => {
    const counting = apply(seeded(), reveal, 0).state;
    const done = apply(counting, { type: 'tick' }, 3_000);
    expect(done.state).toMatchObject({ phase: 'revealed', saveStatus: 'none' });
    expect(done.effects).toEqual([]);
  });

  it('still reveals when the moderator disconnects during the count', () => {
    const counting = apply(run(seeded(), [vote('m', '3'), vote('a', '8')]), reveal, 0).state;
    const gone = apply(counting, { type: 'disconnect', id: 'm' }, 500).state;
    const done = apply(gone, { type: 'tick' }, 3_000).state;
    expect(done.phase).toBe('revealed');
    expect(done.result?.lowIds).toEqual(['m']);
  });

  it('does not drop an away voter while the count is running', () => {
    const away = apply(run(seeded(), [vote('a', '8')]), { type: 'disconnect', id: 'a' }, 0).state;
    const counting = apply(away, reveal, AWAY_DROP_MS - 1_000).state;
    const during = apply(counting, { type: 'tick' }, AWAY_DROP_MS).state;
    expect(during.participants.map((p) => p.id)).toContain('a');
  });

  it('cannot be started twice or by a non-moderator', () => {
    const counting = apply(seeded(), reveal, 0).state;
    expect(apply(counting, reveal, 100).effects).toEqual([forbidden('m')]);
    expect(apply(seeded(), msg('a', { type: 'reveal' }), 0).effects).toEqual([forbidden('a')]);
  });

  it('refuses votes once revealed', () => {
    const revealed = apply(apply(seeded(), reveal, 0).state, { type: 'tick' }, 3_000).state;
    expect(apply(revealed, vote('a', '5'), 4_000).effects).toEqual([forbidden('a')]);
  });
});

describe('new round', () => {
  const revealed = () =>
    apply(
      apply(
        run(seeded(), [msg('m', { type: 'setTitle', title: 'PROJ-1' }), vote('a', '8')]),
        reveal,
        0,
      ).state,
      { type: 'tick' },
      3_000,
    ).state;

  it('clears votes and the result, keeps the title when asked, and advances the round', () => {
    const next = apply(revealed(), msg('m', { type: 'newRound', keepTitle: true }), 5_000).state;
    expect(next).toMatchObject({
      phase: 'voting',
      title: 'PROJ-1',
      roundSeq: 2,
      result: null,
      saveStatus: 'none',
    });
    expect(next.participants.every((p) => p.vote === null)).toBe(true);
  });

  it('clears the title when asked', () => {
    const next = apply(revealed(), msg('m', { type: 'newRound', keepTitle: false }), 5_000).state;
    expect(next.title).toBe('');
  });

  it('can reset a round that is still in voting', () => {
    const next = run(seeded(), [vote('a', '8'), msg('m', { type: 'newRound', keepTitle: true })]);
    expect(next.roundSeq).toBe(2);
    expect(voteOf(next, 'a')).toBeNull();
  });

  it('is refused during the count and for non-moderators', () => {
    const counting = apply(seeded(), reveal, 0).state;
    const newRound = { type: 'newRound', keepTitle: true } as const;
    expect(apply(counting, msg('m', newRound), 100).effects).toEqual([forbidden('m')]);
    expect(apply(revealed(), msg('a', newRound), 5_000).effects).toEqual([forbidden('a')]);
  });
});

describe('roundSaved', () => {
  const pending = () =>
    apply(apply(run(seeded(), [vote('a', '8')]), reveal, 0).state, { type: 'tick' }, 3_000).state;

  it('marks the round saved or failed, and saved again after a retry', () => {
    const failed = apply(pending(), { type: 'roundSaved', seq: 1, ok: false }, 0).state;
    expect(failed.saveStatus).toBe('failed');
    expect(apply(failed, { type: 'roundSaved', seq: 1, ok: true }, 0).state.saveStatus).toBe(
      'saved',
    );
  });

  it('ignores a confirmation for an earlier round', () => {
    const next = apply(pending(), msg('m', { type: 'newRound', keepTitle: true }), 0).state;
    expect(apply(next, { type: 'roundSaved', seq: 1, ok: true }, 0).state).toBe(next);
  });

  it('ignores a confirmation when nothing was being saved', () => {
    const state = seeded();
    expect(apply(state, { type: 'roundSaved', seq: 1, ok: true }, 0).state).toBe(state);
  });
});

describe('setRole', () => {
  it('moves a voter to spectator, discards their vote and asks for the role to be saved', () => {
    const outcome = apply(
      run(seeded(), [vote('a', '5')]),
      msg('a', { type: 'setRole', role: 'spectator' }),
      0,
    );
    expect(outcome.state.participants.find((p) => p.id === 'a')).toMatchObject({
      role: 'spectator',
      vote: null,
    });
    expect(outcome.effects).toEqual([{ type: 'persistRole', id: 'a', role: 'spectator' }]);
  });

  it('does nothing when the role is unchanged', () => {
    const state = seeded();
    expect(apply(state, msg('s', { type: 'setRole', role: 'spectator' }), 0)).toEqual({
      state,
      effects: [],
    });
  });

  it('is refused during the count', () => {
    const counting = apply(seeded(), reveal, 0).state;
    expect(apply(counting, msg('a', { type: 'setRole', role: 'spectator' }), 100).effects).toEqual([
      forbidden('a'),
    ]);
  });

  it('keeps a revealed vote on show when its owner becomes a spectator', () => {
    const revealed = apply(
      apply(run(seeded(), [vote('a', '8')]), reveal, 0).state,
      { type: 'tick' },
      3_000,
    ).state;
    const next = apply(revealed, msg('a', { type: 'setRole', role: 'spectator' }), 4_000).state;
    expect(voteOf(next, 'a')).toBe('8');
  });
});

describe('setTitle', () => {
  it('is for moderators, during voting only', () => {
    const title = { type: 'setTitle', title: 'PROJ-2' } as const;
    expect(apply(seeded(), msg('m', title), 0).state.title).toBe('PROJ-2');
    expect(apply(seeded(), msg('a', title), 0).effects).toEqual([forbidden('a')]);
    const revealed = apply(apply(seeded(), reveal, 0).state, { type: 'tick' }, 3_000).state;
    expect(apply(revealed, msg('m', title), 4_000).effects).toEqual([forbidden('m')]);
  });
});

describe('vote secrecy', () => {
  const voting = () => run(seeded(), [vote('m', '3'), vote('a', '8')]);

  it('never shows another person a vote before the reveal, during voting or the count', () => {
    const counting = apply(voting(), reveal, 0).state;
    for (const state of [voting(), counting]) {
      for (const viewer of ['m', 'a', 's']) {
        const snapshot = snapshotFor(state, viewer, 0);
        expect(snapshot?.result).toBeNull();
        expect(snapshot?.participants.map((p) => p.vote)).toEqual([null, null, null]);
        expect(snapshot?.participants.map((p) => p.hasVoted)).toEqual([true, true, false]);
      }
    }
  });

  it('shows each person only their own vote before the reveal', () => {
    expect(snapshotFor(voting(), 'a', 0)?.you.vote).toBe('8');
    expect(snapshotFor(voting(), 'm', 0)?.you.vote).toBe('3');
    expect(snapshotFor(voting(), 's', 0)?.you.vote).toBeNull();
  });

  it('shows every vote and the result to everyone after the reveal', () => {
    const revealed = apply(apply(voting(), reveal, 0).state, { type: 'tick' }, 3_000).state;
    for (const viewer of ['m', 'a', 's']) {
      const snapshot = snapshotFor(revealed, viewer, 3_000);
      expect(snapshot?.participants.map((p) => p.vote)).toEqual(['3', '8', null]);
      expect(snapshot?.result?.high).toBe('8');
    }
  });
});
