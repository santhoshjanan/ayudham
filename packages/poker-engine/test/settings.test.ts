import { BUILT_IN_DECKS } from '@pokerji/protocol';
import { describe, expect, it } from 'vitest';
import { apply, canChangeDeck } from '../src/index.ts';
import { FIB, msg, run, seeded } from './helpers.ts';

const TEE = BUILT_IN_DECKS.tshirt.deck;
const vote = msg('a', { type: 'vote', card: '8' });
const reveal = msg('m', { type: 'reveal' });

describe('canChangeDeck', () => {
  it('is true before anyone has voted and after a reveal, false otherwise', () => {
    expect(canChangeDeck(seeded())).toBe(true);
    const voted = run(seeded(), [vote]);
    expect(canChangeDeck(voted)).toBe(false);
    const counting = apply(voted, reveal, 0).state;
    expect(canChangeDeck(counting)).toBe(false);
    const revealed = apply(counting, { type: 'tick' }, 3_000).state;
    expect(canChangeDeck(revealed)).toBe(true);
  });
});

describe('settings', () => {
  it('changes the deck by starting a new round that keeps the title', () => {
    const titled = run(seeded(), [msg('m', { type: 'setTitle', title: 'PROJ-1' })]);
    const next = apply(
      titled,
      { type: 'settings', settings: { deck: TEE, timerSeconds: 60, music: null } },
      0,
    ).state;
    expect(next).toMatchObject({ deck: TEE, title: 'PROJ-1', roundSeq: 2, phase: 'voting' });
  });

  it('refuses the whole change when the deck cannot change right now', () => {
    const voted = run(seeded(), [vote]);
    const outcome = apply(
      voted,
      { type: 'settings', settings: { deck: TEE, timerSeconds: 30, music: 'nocturne' } },
      0,
    );
    expect(outcome.state).toBe(voted);
  });

  it('changes timer and music mid-round without disturbing votes', () => {
    const voted = run(seeded(), [vote]);
    const next = apply(
      voted,
      { type: 'settings', settings: { deck: FIB, timerSeconds: 30, music: 'nocturne' } },
      0,
    ).state;
    expect(next).toMatchObject({ timerSeconds: 30, music: 'nocturne', roundSeq: 1 });
    expect(next.participants.find((p) => p.id === 'a')?.vote).toBe('8');
  });

  it('stops a running timer when the timer is switched off', () => {
    const running = apply(seeded(), msg('m', { type: 'startTimer' }), 0).state;
    const next = apply(
      running,
      { type: 'settings', settings: { deck: FIB, timerSeconds: null, music: null } },
      1_000,
    ).state;
    expect(next).toMatchObject({ timerSeconds: null, timerEndsAt: null });
  });
});
