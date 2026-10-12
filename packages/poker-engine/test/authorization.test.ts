import type { ClientMessage } from '@pokerji/protocol';
import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.ts';
import { forbidden, msg, seeded } from './helpers.ts';

/** Voting phase with the timer running, so every message has a state in which it can succeed. */
const base = () => apply(seeded(), msg('m', { type: 'startTimer' }), 0).state;

/** Someone other than the actor who is not a moderator. */
const target = (actor: string) => (actor === 'a' ? 's' : 'a');

type Row = [
  name: string,
  build: (actor: string) => ClientMessage,
  allowed: { m: boolean; a: boolean; s: boolean },
];

const everyone = { m: true, a: true, s: true };
const votersOnly = { m: true, a: true, s: false };
const moderatorOnly = { m: true, a: false, s: false };

const matrix: Row[] = [
  ['vote', () => ({ type: 'vote', card: '5' }), votersOnly],
  ['clearVote', () => ({ type: 'clearVote' }), votersOnly],
  ['setRole', () => ({ type: 'setRole', role: 'spectator' }), everyone],
  ['setTitle', () => ({ type: 'setTitle', title: 'PROJ-9' }), moderatorOnly],
  ['reveal', () => ({ type: 'reveal' }), moderatorOnly],
  ['newRound', () => ({ type: 'newRound', keepTitle: true }), moderatorOnly],
  ['startTimer', () => ({ type: 'startTimer' }), moderatorOnly],
  ['stopTimer', () => ({ type: 'stopTimer' }), moderatorOnly],
  [
    'removeParticipant',
    (actor) => ({ type: 'removeParticipant', participantId: target(actor) }),
    moderatorOnly,
  ],
  ['promote', (actor) => ({ type: 'promote', participantId: target(actor) }), moderatorOnly],
];

describe('authorization matrix', () => {
  for (const [name, build, allowed] of matrix) {
    for (const actor of ['m', 'a', 's'] as const) {
      const verdict = allowed[actor] ? 'allows' : 'refuses';
      it(`${verdict} ${name} from ${actor}`, () => {
        const state = base();
        const outcome = apply(state, msg(actor, build(actor)), 1_000);
        if (allowed[actor]) {
          expect(outcome.effects).not.toContainEqual(forbidden(actor));
        } else {
          expect(outcome.state).toBe(state);
          expect(outcome.effects).toEqual([forbidden(actor)]);
        }
      });
    }
  }

  it('covers every client message type', () => {
    const covered = matrix.map(([name]) => name).sort();
    expect(covered).toEqual(
      [
        'clearVote',
        'newRound',
        'promote',
        'removeParticipant',
        'reveal',
        'setRole',
        'setTitle',
        'startTimer',
        'stopTimer',
        'vote',
      ].sort(),
    );
  });
});
