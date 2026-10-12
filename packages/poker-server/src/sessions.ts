import type { Role } from '@pokerji/protocol';
import type { Db } from './db.ts';

export interface SessionRow {
  id: string;
  roomId: string;
  name: string;
  role: Role;
  moderator: boolean;
}

const COLUMNS = `id, room_id as "roomId", name, role, moderator`;

export async function insertSession(
  db: Db,
  session: { roomId: string; tokenHash: string; name: string; role: Role; moderator: boolean },
): Promise<SessionRow> {
  const result = await db.query<SessionRow>(
    `insert into sessions (room_id, token_hash, name, role, moderator)
     values ($1, $2, $3, $4, $5) returning ${COLUMNS}`,
    [session.roomId, session.tokenHash, session.name, session.role, session.moderator],
  );
  return result.rows[0] as SessionRow;
}

/** Looks a session up by its token hash, within one room, and records that it was seen. */
export async function findSession(
  db: Db,
  roomId: string,
  tokenHash: string,
): Promise<SessionRow | null> {
  const result = await db.query<SessionRow>(
    `update sessions set last_seen_at = now()
     where room_id = $1 and token_hash = $2 returning ${COLUMNS}`,
    [roomId, tokenHash],
  );
  return result.rows[0] ?? null;
}

export async function setSessionRole(db: Db, id: string, role: Role): Promise<void> {
  await db.query('update sessions set role = $2 where id = $1', [id, role]);
}

export async function setSessionModerator(db: Db, id: string): Promise<void> {
  await db.query('update sessions set moderator = true where id = $1', [id]);
}

export async function deleteSession(db: Db, id: string): Promise<void> {
  await db.query('delete from sessions where id = $1', [id]);
}

/** Signs out everyone except moderators. Used when a passcode is set or changed. */
export async function deleteNonModeratorSessions(db: Db, roomId: string): Promise<string[]> {
  const result = await db.query<{ id: string }>(
    'delete from sessions where room_id = $1 and not moderator returning id',
    [roomId],
  );
  return result.rows.map((row) => row.id);
}

export async function countSessions(db: Db, roomId: string): Promise<number> {
  const result = await db.query<{ count: number }>(
    'select count(*)::int as count from sessions where room_id = $1',
    [roomId],
  );
  return result.rows[0]?.count ?? 0;
}
