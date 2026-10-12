import { describe, expect, it } from 'vitest';
import { apply, createRoom, snapshotFor } from '../src/index.ts';
import { FIB, forbidden, mo, msg, run, seeded } from './helpers.ts';

const start = msg('m', { type: 'startTimer' });
const stop = msg('m', { type: 'stopTimer' });
const expired = { type: 'announce', message: { type: 'timerExpired' } };

describe('timer', () => {
  it('starts from the room setting and appears in snapshots', () => {
    const state = apply(seeded(), start, 10_000).state;
    expect(state.timerEndsAt).toBe(70_000);
    expect(snapshotFor(state, 'a', 10_000)?.timer).toEqual({ seconds: 60, endsAt: 70_000 });
  });

  it('cannot start in a room with no timer set', () => {
    const noTimer = run(createRoom({ deck: FIB, timerSeconds: null, music: null }), [
      { type: 'join', participant: mo },
    ]);
    expect(apply(noTimer, start, 0).effects).toEqual([forbidden('m')]);
  });

  it('announces expiry once and never reveals on its own', () => {
    const running = apply(seeded(), start, 0).state;
    expect(apply(running, { type: 'tick' }, 59_999).effects).toEqual([]);
    const ended = apply(running, { type: 'tick' }, 60_000);
    expect(ended.effects).toEqual([expired]);
    expect(ended.state).toMatchObject({ timerEndsAt: null, phase: 'voting' });
    expect(apply(ended.state, { type: 'tick' }, 61_000).effects).toEqual([]);
  });

  it('stops without announcing', () => {
    const stopped = apply(apply(seeded(), start, 0).state, stop, 5_000);
    expect(stopped.state.timerEndsAt).toBeNull();
    expect(stopped.effects).toEqual([]);
    expect(apply(stopped.state, { type: 'tick' }, 60_000).effects).toEqual([]);
  });

  it('cannot be stopped when it is not running', () => {
    expect(apply(seeded(), stop, 0).effects).toEqual([forbidden('m')]);
  });

  it('is stopped by a reveal and does not announce afterwards', () => {
    const running = apply(seeded(), start, 0).state;
    const counting = apply(running, msg('m', { type: 'reveal' }), 58_000).state;
    expect(counting.timerEndsAt).toBeNull();
    const done = apply(counting, { type: 'tick' }, 61_000);
    expect(done.state.phase).toBe('revealed');
    expect(done.effects).toEqual([]);
  });

  it('cannot start once the round is revealed', () => {
    const revealed = apply(
      apply(seeded(), msg('m', { type: 'reveal' }), 0).state,
      { type: 'tick' },
      3_000,
    ).state;
    expect(apply(revealed, start, 4_000).effects).toEqual([forbidden('m')]);
  });
});
