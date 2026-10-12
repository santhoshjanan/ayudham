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

/*
 * Every change below names the room as well as the session, so a mistake in a
 * caller can never act on another room's session. Each returns whether a row matched.
 */

export async function setSessionRole(
  db: Db,
  roomId: string,
  id: string,
  role: Role,
): Promise<boolean> {
  const result = await db.query('update sessions set role = $3 where id = $2 and room_id = $1', [
    roomId,
    id,
    role,
  ]);
  return result.rowCount === 1;
}

export async function setSessionModerator(db: Db, roomId: string, id: string): Promise<boolean> {
  const result = await db.query(
    'update sessions set moderator = true where id = $2 and room_id = $1',
    [roomId, id],
  );
  return result.rowCount === 1;
}

export async function deleteSession(db: Db, roomId: string, id: string): Promise<boolean> {
  const result = await db.query('delete from sessions where id = $2 and room_id = $1', [
    roomId,
    id,
  ]);
  return result.rowCount === 1;
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

/**
 * Signs out the non-moderator who was seen longest ago, to make room in a full
 * room. Returns false when there is nobody who may be signed out.
 */
export async function deleteStalestSession(db: Db, roomId: string): Promise<boolean> {
  const result = await db.query(
    `delete from sessions where id = (
       select id from sessions
       where room_id = $1 and not moderator
       order by last_seen_at asc, created_at asc
       limit 1
     )`,
    [roomId],
  );
  return result.rowCount === 1;
}

export async function sessionNames(db: Db, roomId: string): Promise<string[]> {
  const result = await db.query<{ name: string }>('select name from sessions where room_id = $1', [
    roomId,
  ]);
  return result.rows.map((row) => row.name);
}

/**
 * Adds a session for someone joining, but only if the room's passcode is still
 * the one their join was checked against. The row lock makes this wait for a
 * passcode change in progress, so nobody can join a room on a check that is out
 * of date. Returns null when the passcode has changed.
 */
export async function insertJoiningSession(
  db: Db,
  session: { roomId: string; tokenHash: string; name: string; role: Role },
  checkedPasscodeHash: string | null,
): Promise<SessionRow | null> {
  const result = await db.query<SessionRow>(
    `insert into sessions (room_id, token_hash, name, role, moderator)
     select r.id, $2, $3, $4, false
     from rooms r
     where r.id = $1 and r.passcode_hash is not distinct from $5
     for share of r
     returning ${COLUMNS}`,
    [session.roomId, session.tokenHash, session.name, session.role, checkedPasscodeHash],
  );
  return result.rows[0] ?? null;
}
