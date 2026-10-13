import type { RoomSettings } from '@pokerji/poker-engine';
import type { Deck } from '@pokerji/protocol';
import type { Db } from './db.ts';

export interface RoomRow {
  id: string;
  code: string;
  deck: Deck;
  timerSeconds: number | null;
  music: string | null;
  passcodeHash: string | null;
  recoveryHash: string;
  lastActiveAt: Date;
}

const COLUMNS = `id, code, deck, timer_seconds as "timerSeconds", music,
  passcode_hash as "passcodeHash", recovery_hash as "recoveryHash",
  last_active_at as "lastActiveAt"`;

export async function insertRoom(
  db: Db,
  room: { code: string; deck: Deck; recoveryHash: string },
): Promise<RoomRow> {
  const result = await db.query<RoomRow>(
    `insert into rooms (code, deck, recovery_hash) values ($1, $2::jsonb, $3) returning ${COLUMNS}`,
    [room.code, JSON.stringify(room.deck), room.recoveryHash],
  );
  return result.rows[0] as RoomRow;
}

export async function findRoomByCode(db: Db, code: string): Promise<RoomRow | null> {
  const result = await db.query<RoomRow>(`select ${COLUMNS} from rooms where code = $1`, [code]);
  return result.rows[0] ?? null;
}

export async function updateRoomSettings(
  db: Db,
  id: string,
  settings: RoomSettings,
): Promise<void> {
  await db.query(
    `update rooms set deck = $2::jsonb, timer_seconds = $3, music = $4, last_active_at = now()
     where id = $1`,
    [id, JSON.stringify(settings.deck), settings.timerSeconds, settings.music],
  );
}

export async function setPasscodeHash(db: Db, id: string, hash: string | null): Promise<boolean> {
  const result = await db.query('update rooms set passcode_hash = $2 where id = $1', [id, hash]);
  return result.rowCount === 1;
}

export async function setRecoveryHash(db: Db, id: string, hash: string): Promise<boolean> {
  const result = await db.query('update rooms set recovery_hash = $2 where id = $1', [id, hash]);
  return result.rowCount === 1;
}

/**
 * Replaces the recovery secret only if it is still the one given. Of two people
 * using the same link at the same moment, exactly one gets true.
 */
export async function swapRecoveryHash(
  db: Db,
  id: string,
  expected: string,
  next: string,
): Promise<boolean> {
  const result = await db.query(
    'update rooms set recovery_hash = $3 where id = $1 and recovery_hash = $2',
    [id, expected, next],
  );
  return result.rowCount === 1;
}

export async function touchRoom(db: Db, id: string): Promise<void> {
  await db.query('update rooms set last_active_at = now() where id = $1', [id]);
}

export async function deleteRoom(db: Db, id: string): Promise<boolean> {
  const result = await db.query('delete from rooms where id = $1', [id]);
  return result.rowCount === 1;
}

/**
 * The retention job: removes rooms, and everything under them, unused for too long.
 * Refuses a period under one day, which would delete rooms that are in use.
 */
export async function deleteInactiveRooms(db: Db, olderThanDays: number): Promise<number> {
  if (!Number.isInteger(olderThanDays) || olderThanDays < 1) {
    throw new RangeError('Retention period must be a whole number of days, at least 1');
  }
  const result = await db.query(
    'delete from rooms where last_active_at < now() - make_interval(days => $1)',
    [olderThanDays],
  );
  return result.rowCount ?? 0;
}

/**
 * Sets the passcode and signs out everyone except moderators as one step, so
 * no join can slip between the two. Returns the ids of the sessions removed.
 */
export async function setPasscodeAndSignOut(db: Db, id: string, hash: string): Promise<string[]> {
  const client = await db.connect();
  try {
    await client.query('begin');
    await client.query('update rooms set passcode_hash = $2 where id = $1', [id, hash]);
    const gone = await client.query<{ id: string }>(
      'delete from sessions where room_id = $1 and not moderator returning id',
      [id],
    );
    await client.query('commit');
    return gone.rows.map((row) => row.id);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
