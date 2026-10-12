import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.ts';
import { forbidden, msg, run, seeded } from './helpers.ts';

const remove = (from: string, participantId: string) =>
  msg(from, { type: 'removeParticipant', participantId });
const promote = (from: string, participantId: string) =>
  msg(from, { type: 'promote', participantId });

describe('removeParticipant', () => {
  it('removes the participant, tells them, closes their connection and deletes their session', () => {
    const outcome = apply(seeded(), remove('m', 'a'), 0);
    expect(outcome.state.participants.map((p) => p.id)).toEqual(['m', 's']);
    expect(outcome.effects).toEqual([
      { type: 'send', to: 'a', message: { type: 'removed' } },
      { type: 'close', id: 'a' },
      { type: 'deleteSession', id: 'a' },
    ]);
  });

  it('cannot be used on yourself, on another moderator, or on someone who is not there', () => {
    const twoMods = run(seeded(), [promote('m', 'a')]);
    expect(apply(twoMods, remove('m', 'm'), 0).effects).toEqual([forbidden('m')]);
    expect(apply(twoMods, remove('m', 'a'), 0).effects).toEqual([forbidden('m')]);
    expect(apply(twoMods, remove('m', 'nobody'), 0).effects).toEqual([forbidden('m')]);
  });
});

describe('promote', () => {
  it('makes a co-moderator who can then run the round', () => {
    const outcome = apply(seeded(), promote('m', 'a'), 0);
    expect(outcome.effects).toEqual([{ type: 'persistModerator', id: 'a' }]);
    const revealing = apply(outcome.state, msg('a', { type: 'reveal' }), 0);
    expect(revealing.state.phase).toBe('counting');
  });

  it('does nothing when the target is already a moderator', () => {
    const twoMods = run(seeded(), [promote('m', 'a')]);
    expect(apply(twoMods, promote('m', 'a'), 0)).toEqual({ state: twoMods, effects: [] });
  });

  it('is refused for a target who is not there', () => {
    expect(apply(seeded(), promote('m', 'nobody'), 0).effects).toEqual([forbidden('m')]);
  });
});
