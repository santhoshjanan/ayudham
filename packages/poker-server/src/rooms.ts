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

export async function setPasscodeHash(db: Db, id: string, hash: string | null): Promise<void> {
  await db.query('update rooms set passcode_hash = $2 where id = $1', [id, hash]);
}

export async function setRecoveryHash(db: Db, id: string, hash: string): Promise<void> {
  await db.query('update rooms set recovery_hash = $2 where id = $1', [id, hash]);
}

export async function touchRoom(db: Db, id: string): Promise<void> {
  await db.query('update rooms set last_active_at = now() where id = $1', [id]);
}

export async function deleteRoom(db: Db, id: string): Promise<void> {
  await db.query('delete from rooms where id = $1', [id]);
}

/** The retention job: removes rooms, and everything under them, unused for too long. */
export async function deleteInactiveRooms(db: Db, olderThanDays: number): Promise<number> {
  const result = await db.query(
    'delete from rooms where last_active_at < now() - make_interval(days => $1)',
    [olderThanDays],
  );
  return result.rowCount ?? 0;
}
