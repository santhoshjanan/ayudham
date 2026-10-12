import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/index.ts';

const parse = (value: unknown) => parseClientMessage(JSON.stringify(value));

describe('parseClientMessage', () => {
  it.each([
    [{ type: 'vote', card: '5' }],
    [{ type: 'clearVote' }],
    [{ type: 'setRole', role: 'spectator' }],
    [{ type: 'setTitle', title: 'PROJ-12 Login page' }],
    [{ type: 'setTitle', title: '' }],
    [{ type: 'reveal' }],
    [{ type: 'newRound', keepTitle: true }],
    [{ type: 'startTimer' }],
    [{ type: 'stopTimer' }],
    [{ type: 'removeParticipant', participantId: 'p1' }],
    [{ type: 'promote', participantId: 'p1' }],
  ])('accepts %j', (message) => {
    expect(parse(message)).toEqual(message);
  });

  it('trims the title', () => {
    expect(parse({ type: 'setTitle', title: '  PROJ-1  ' })).toEqual({
      type: 'setTitle',
      title: 'PROJ-1',
    });
  });

  it('rejects text that is not JSON', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage('')).toBeNull();
  });

  it.each([
    [null],
    [[]],
    ['vote'],
    [{ type: 'nope' }],
    [{ type: 'vote' }],
    [{ type: 'vote', card: '5', extra: 1 }],
    [{ type: 'vote', card: 'TOOLONG' }],
    [{ type: 'setRole', role: 'moderator' }],
    [{ type: 'setTitle', title: 'x'.repeat(201) }],
    [{ type: 'newRound' }],
    [{ type: 'newRound', keepTitle: 'yes' }],
    [{ type: 'promote', participantId: '' }],
    [{ type: 'promote', participantId: 'x'.repeat(65) }],
    [{ type: 'reveal', force: true }],
  ])('rejects %j', (message) => {
    expect(parse(message)).toBeNull();
  });
});
