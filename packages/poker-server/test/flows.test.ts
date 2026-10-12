import { BUILT_IN_DECKS } from '@pokerji/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createKv,
  createRoomFlow,
  findRoomByCode,
  hashPasscode,
  joinRoomFlow,
  resumeSession,
  setPasscodeHash,
  type Db,
  type FlowDeps,
} from '../src/index.ts';
import { testDb, testPrefix, VALKEY_URL } from './services.ts';

let db: Db;
let drop: () => Promise<void>;
const kv = createKv(VALKEY_URL);
beforeAll(async () => {
  ({ db, drop } = await testDb());
});
afterAll(async () => {
  await drop();
  await kv.quit();
});

/** Fresh rate-limit counters for each test. */
const deps = (extra: Partial<FlowDeps> = {}): FlowDeps => ({
  db,
  kv,
  addressSecret: 's'.repeat(32),
  keyPrefix: testPrefix(),
  ...extra,
});

const create = (flow: FlowDeps, address = '203.0.113.1') =>
  createRoomFlow(flow, { address, name: 'Mo', deckId: 'fibonacci' });

async function room(flow: FlowDeps) {
  const created = await create(flow);
  if (!created.ok) throw new Error('room was not created');
  return created;
}

const join = (flow: FlowDeps, code: unknown, extra: Record<string, unknown> = {}) =>
  joinRoomFlow(flow, {
    address: '203.0.113.2',
    code,
    name: 'Ann',
    role: 'voter',
    passcode: '',
    ...extra,
  });

describe('createRoomFlow', () => {
  it('creates a room and a moderator session, and returns secrets that resolve', async () => {
    const flow = deps();
    const created = await room(flow);
    expect(created.code).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(created.recoveryToken).not.toBe(created.sessionToken);

    const stored = await findRoomByCode(db, created.code);
    expect(stored?.deck).toEqual(BUILT_IN_DECKS.fibonacci.deck);
    expect(stored?.recoveryHash).not.toContain(created.recoveryToken);

    const resumed = await resumeSession(flow, { code: created.code, token: created.sessionToken });
    expect(resumed?.session).toMatchObject({ name: 'Mo', role: 'voter', moderator: true });
  });

  it('rejects a bad name or deck without creating anything', async () => {
    const flow = deps();
    expect(await createRoomFlow(flow, { address: 'a', name: '', deckId: 'fibonacci' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await createRoomFlow(flow, { address: 'a', name: 'Mo', deckId: 'nope' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('refuses the eleventh room from one client in an hour, and not another client', async () => {
    const flow = deps();
    for (let i = 0; i < 10; i += 1) expect((await create(flow)).ok).toBe(true);
    expect(await create(flow)).toEqual({ ok: false, reason: 'refused' });
    expect((await create(flow, '203.0.113.99')).ok).toBe(true);
  });

  it('counts one IPv6 /64 as one client', async () => {
    const flow = deps();
    for (let i = 0; i < 10; i += 1) await create(flow, `2001:db8:1:2::${i + 1}`);
    expect(await create(flow, '2001:db8:1:2:ffff::1')).toEqual({ ok: false, reason: 'refused' });
  });
});

describe('joinRoomFlow', () => {
  it('admits someone to an open room', async () => {
    const flow = deps();
    const { code } = await room(flow);
    const joined = await join(flow, code, { role: 'spectator' });
    if (!joined.ok) throw new Error('join failed');
    const resumed = await resumeSession(flow, { code, token: joined.sessionToken });
    expect(resumed?.session).toMatchObject({ name: 'Ann', role: 'spectator', moderator: false });
  });

  it('rejects a bad name or role as invalid', async () => {
    const flow = deps();
    const { code } = await room(flow);
    expect(await join(flow, code, { name: '' })).toEqual({ ok: false, reason: 'invalid' });
    expect(await join(flow, code, { role: 'moderator' })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('gives the same answer for an unknown room, a malformed code and a wrong passcode', async () => {
    const flow = deps();
    const { code } = await room(flow);
    const stored = await findRoomByCode(db, code);
    await setPasscodeHash(db, stored?.id as string, await hashPasscode('open sesame'));

    const refused = { ok: false, reason: 'refused' };
    expect(await join(flow, 'AAAAAAAAAAAA')).toEqual(refused);
    expect(await join(flow, 'not-a-code')).toEqual(refused);
    expect(await join(flow, 42)).toEqual(refused);
    expect(await join(flow, code, { passcode: 'wrong' })).toEqual(refused);
    expect(await join(flow, code, { passcode: '' })).toEqual(refused);
    expect(await join(flow, code, { passcode: 12345 })).toEqual(refused);
  });

  it('admits someone with the right passcode', async () => {
    const flow = deps();
    const { code } = await room(flow);
    const stored = await findRoomByCode(db, code);
    await setPasscodeHash(db, stored?.id as string, await hashPasscode('open sesame'));
    expect((await join(flow, code, { passcode: 'open sesame' })).ok).toBe(true);
  });

  it('locks one client out after five wrong passcodes, and nobody else', async () => {
    const flow = deps();
    const { code } = await room(flow);
    const stored = await findRoomByCode(db, code);
    await setPasscodeHash(db, stored?.id as string, await hashPasscode('open sesame'));

    for (let i = 0; i < 5; i += 1) await join(flow, code, { passcode: `guess ${i}` });
    expect(await join(flow, code, { passcode: 'open sesame' })).toEqual({
      ok: false,
      reason: 'refused',
    });
    const other = await join(flow, code, { passcode: 'open sesame', address: '203.0.113.50' });
    expect(other.ok).toBe(true);
  });

  it('does not count a correct passcode as a failure', async () => {
    const flow = deps();
    const { code } = await room(flow);
    const stored = await findRoomByCode(db, code);
    await setPasscodeHash(db, stored?.id as string, await hashPasscode('open sesame'));
    for (let i = 0; i < 7; i += 1) {
      expect((await join(flow, code, { passcode: 'open sesame' })).ok).toBe(true);
    }
  });

  it('refuses the thirty-first join attempt from one client in ten minutes', async () => {
    const flow = deps();
    const { code } = await room(flow);
    for (let i = 0; i < 30; i += 1) await join(flow, 'AAAAAAAAAAAA');
    expect(await join(flow, code)).toEqual({ ok: false, reason: 'refused' });
  });

  it('refuses a join when the room already holds its maximum of sessions', async () => {
    const flow = deps({ maxSessionsPerRoom: 2 });
    const { code } = await room(flow);
    expect((await join(flow, code)).ok).toBe(true);
    expect(await join(flow, code)).toEqual({ ok: false, reason: 'refused' });
  });
});

describe('resumeSession', () => {
  it('returns nothing for a wrong, missing or malformed token or code', async () => {
    const flow = deps();
    const { code, sessionToken } = await room(flow);
    expect(await resumeSession(flow, { code, token: 'wrong' })).toBeNull();
    expect(await resumeSession(flow, { code, token: undefined })).toBeNull();
    expect(await resumeSession(flow, { code, token: 'x'.repeat(5_000) })).toBeNull();
    expect(await resumeSession(flow, { code: 'not-a-code', token: sessionToken })).toBeNull();
    expect(await resumeSession(flow, { code: 'AAAAAAAAAAAA', token: sessionToken })).toBeNull();
  });

  it('does not accept one room’s session in another room', async () => {
    const flow = deps();
    const first = await room(flow);
    const second = await room(flow);
    expect(await resumeSession(flow, { code: second.code, token: first.sessionToken })).toBeNull();
  });
});
