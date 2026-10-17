import { randomUUID } from 'node:crypto';
import { BUILT_IN_DECKS } from '@ayudham/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonymiseSession,
  clearHistory,
  deleteRound,
  deleteSession,
  findRoomByCode,
  insertRoom,
  insertSession,
  listRounds,
  saveRound,
  type Db,
} from '../src/index.ts';
import { testDb } from './services.ts';

let db: Db;
let drop: () => Promise<void>;
beforeAll(async () => {
  ({ db, drop } = await testDb());
});
afterAll(() => drop());

let n = 0;
async function setup() {
  const room = await insertRoom(db, {
    code: `room${(n += 1)}`,
    deck: BUILT_IN_DECKS.fibonacci.deck,
    recoveryHash: 'rh',
  });
  const person = (name: string) =>
    insertSession(db, {
      roomId: room.id,
      tokenHash: `hash${(n += 1)}`,
      name,
      role: 'voter',
      moderator: false,
    });
  return { room, ann: await person('Ann'), bo: await person('Bo') };
}

describe('saveRound with a limit on how many a room keeps', () => {
  it('keeps the newest rounds and deletes the rest with their votes', async () => {
    const { room, ann } = await setup();
    for (let i = 1; i <= 5; i += 1) {
      await saveRound(
        db,
        room.id,
        {
          id: randomUUID(),
          title: `R${i}`,
          votes: [{ sessionId: ann.id, name: 'Ann', card: '5' }],
        },
        3,
      );
    }
    const kept = await listRounds(db, room.id);
    expect(kept.map((round) => round.title)).toEqual(['R5', 'R4', 'R3']);
    const votes = await db.query(
      'select 1 from votes v join rounds r on r.id = v.round_id where r.room_id = $1',
      [room.id],
    );
    expect(votes.rowCount).toBe(3);
  });
});

describe('history', () => {
  it('saves a round with its votes in order and lists newest first', async () => {
    const { room, ann, bo } = await setup();
    const first = randomUUID();
    const second = randomUUID();
    await saveRound(db, room.id, {
      id: first,
      title: 'PROJ-1',
      votes: [
        { sessionId: ann.id, name: 'Ann', card: '3' },
        { sessionId: bo.id, name: 'Bo', card: '8' },
      ],
    });
    await saveRound(db, room.id, {
      id: second,
      title: 'PROJ-2',
      votes: [{ sessionId: bo.id, name: 'Bo', card: '5' }],
    });
    const rounds = await listRounds(db, room.id);
    expect(rounds.map((round) => round.title)).toEqual(['PROJ-2', 'PROJ-1']);
    expect(rounds[1]).toMatchObject({
      id: first,
      votes: [
        { sessionId: ann.id, name: 'Ann', card: '3' },
        { sessionId: bo.id, name: 'Bo', card: '8' },
      ],
    });
    expect(rounds[1]?.revealedAt).toBeInstanceOf(Date);
  });

  it('saves a round only once when asked twice', async () => {
    const { room, ann } = await setup();
    const round = {
      id: randomUUID(),
      title: 'PROJ-1',
      votes: [{ sessionId: ann.id, name: 'Ann', card: '3' }],
    };
    await saveRound(db, room.id, round);
    await saveRound(db, room.id, round);
    const rounds = await listRounds(db, room.id);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]?.votes).toHaveLength(1);
  });

  it('still saves a vote whose session was deleted before the save', async () => {
    const { room, ann, bo } = await setup();
    await deleteSession(db, room.id, ann.id);
    await saveRound(db, room.id, {
      id: randomUUID(),
      title: 'PROJ-1',
      votes: [
        { sessionId: ann.id, name: 'Ann', card: '3' },
        { sessionId: bo.id, name: 'Bo', card: '8' },
      ],
    });
    expect((await listRounds(db, room.id))[0]?.votes).toEqual([
      { sessionId: null, name: 'Ann', card: '3' },
      { sessionId: bo.id, name: 'Bo', card: '8' },
    ]);
  });

  it('does not link a vote to a session from another room', async () => {
    const { room, ann } = await setup();
    const other = await setup();
    await saveRound(db, room.id, {
      id: randomUUID(),
      title: 'T',
      votes: [
        { sessionId: ann.id, name: 'Ann', card: '3' },
        { sessionId: other.ann.id, name: 'Stranger', card: '8' },
      ],
    });
    expect((await listRounds(db, room.id))[0]?.votes).toEqual([
      { sessionId: ann.id, name: 'Ann', card: '3' },
      { sessionId: null, name: 'Stranger', card: '8' },
    ]);
  });

  it('counts saving a round as room activity', async () => {
    const { room, ann } = await setup();
    await db.query(`update rooms set last_active_at = now() - interval '5 days' where id = $1`, [
      room.id,
    ]);
    await saveRound(db, room.id, {
      id: randomUUID(),
      title: 'T',
      votes: [{ sessionId: ann.id, name: 'Ann', card: '3' }],
    });
    const reloaded = await findRoomByCode(db, room.code);
    expect(Date.now() - (reloaded?.lastActiveAt.getTime() ?? 0)).toBeLessThan(60_000);
  });

  it('returns only the newest rounds when asked for a limited number', async () => {
    const { room, ann } = await setup();
    for (const title of ['A', 'B', 'C']) {
      await saveRound(db, room.id, {
        id: randomUUID(),
        title,
        votes: [{ sessionId: ann.id, name: 'Ann', card: '3' }],
      });
    }
    expect((await listRounds(db, room.id, 2)).map((round) => round.title)).toEqual(['C', 'B']);
  });

  it('returns an empty list for a room with no rounds', async () => {
    const { room } = await setup();
    expect(await listRounds(db, room.id)).toEqual([]);
  });

  it('deletes one round, but only through its own room', async () => {
    const { room, ann } = await setup();
    const other = await setup();
    const id = randomUUID();
    await saveRound(db, room.id, {
      id,
      title: 'T',
      votes: [{ sessionId: ann.id, name: 'Ann', card: '3' }],
    });
    expect(await deleteRound(db, other.room.id, id)).toBe(false);
    expect(await listRounds(db, room.id)).toHaveLength(1);
    expect(await deleteRound(db, room.id, id)).toBe(true);
    expect(await listRounds(db, room.id)).toEqual([]);
  });

  it('clears all history for a room', async () => {
    const { room, ann } = await setup();
    for (const title of ['A', 'B']) {
      await saveRound(db, room.id, {
        id: randomUUID(),
        title,
        votes: [{ sessionId: ann.id, name: 'Ann', card: '3' }],
      });
    }
    expect(await clearHistory(db, room.id)).toBe(2);
    expect(await listRounds(db, room.id)).toEqual([]);
  });

  it('removes one person’s name from their votes and leaves others alone', async () => {
    const { room, ann, bo } = await setup();
    const other = await setup();
    await saveRound(db, room.id, {
      id: randomUUID(),
      title: 'T',
      votes: [
        { sessionId: ann.id, name: 'Ann', card: '3' },
        { sessionId: bo.id, name: 'Bo', card: '8' },
      ],
    });
    expect(await anonymiseSession(db, other.room.id, ann.id)).toBe(0);
    expect(await anonymiseSession(db, room.id, ann.id)).toBe(1);
    expect((await listRounds(db, room.id))[0]?.votes).toEqual([
      { sessionId: ann.id, name: null, card: '3' },
      { sessionId: bo.id, name: 'Bo', card: '8' },
    ]);
  });
});
