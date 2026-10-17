import type { RoomSnapshot } from '@ayudham/protocol';
import { find } from './outcome.ts';
import type { RoomState } from './state.ts';

/**
 * The room as one participant may see it. This is the only place vote secrecy
 * is enforced: other people's votes and the result appear only once revealed.
 */
export function snapshotFor(state: RoomState, id: string, now: number): RoomSnapshot | null {
  const you = find(state, id);
  if (!you) return null;
  const open = state.phase === 'revealed';
  return {
    serverNow: now,
    you: {
      id: you.id,
      name: you.name,
      role: you.role,
      moderator: you.moderator,
      owner: you.owner,
      vote: you.vote,
    },
    title: state.title,
    deck: state.deck,
    phase: state.phase,
    round: state.roundSeq,
    revealAt: state.revealAt,
    timer: { seconds: state.timerSeconds, endsAt: state.timerEndsAt },
    music: state.music,
    participants: state.participants.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      moderator: p.moderator,
      owner: p.owner,
      present: p.present,
      hasVoted: p.vote !== null,
      vote: open ? p.vote : null,
    })),
    result: open ? state.result : null,
    saveStatus: state.saveStatus,
  };
}
