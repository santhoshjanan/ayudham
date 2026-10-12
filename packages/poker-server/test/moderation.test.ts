import { randomUUID } from 'node:crypto';
import { BUILT_IN_DECKS } from '@pokerji/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonymiseMe,
  clearRoomHistory,
  createApp,
  createRoomFlow,
  deleteHistoryRound,
  deleteRoomNow,
  findRoomByCode,
  joinRoomFlow,
  parseDeckText,
  recoverModerator,
  regenerateRecovery,
  removePasscode,
  resumeSession,
  roomHistory,
  saveRound,
  saveSettings,
  setPasscode,
  type Actor,
  type App,
} from '../src/index.ts';
import { fakeConnection } from './fakes.ts';
import { DATABASE_URL, testPrefix, testSchema, VALKEY_URL } from './services.ts';

let app: App;
let drop: () => Promise<void>;

beforeAll(async () => {
  const made = await testSchema();
  drop = made.drop;
  app = createApp(
    {
      databaseUrl: DATABASE_URL,
      valkeyUrl: VALKEY_URL,
      addressHmacSecret: 's'.repeat(32),
      retentionDays: 30,
      keyPrefix: testPrefix(),
      backupRotationDays: null,
    },
    { schema: made.schema, report: () => undefined },
  );
  await app.start();
});
afterAll(async () => {
  await app.stop();
  await drop();
});

const FIB = BUILT_IN_DECKS.fibonacci.deck;
const TEE = BUILT_IN_DECKS.tshirt.deck;
let n = 0;

/** A room with Mo (moderator) and Ann (voter), each from an address of their own. */
async function setup() {
  n += 1;
  const created = await createRoomFlow(app.flows, {
    address: `203.0.113.${n}`,
    name: 'Mo',
    deckId: 'fibonacci',
  });
  if (!created.ok) throw new Error('room was not created');
  const joined = await joinRoomFlow(app.flows, {
    address: `198.51.100.${n}`,
    code: created.code,
    name: 'Ann',
    role: 'voter',
    passcode: '',
  });
  if (!joined.ok) throw new Error('join failed');
  const who = async (token: string): Promise<Actor> => {
    const actor = await resumeSession(app.flows, { code: created.code, token });
    if (!actor) throw new Error('session did not resume');
    return actor;
  };
  return {
    code: created.code,
    recoveryToken: created.recoveryToken,
    moToken: created.sessionToken,
    annToken: joined.sessionToken,
    mo: await who(created.sessionToken),
    ann: await who(joined.sessionToken),
    who,
    annAddress: `198.51.100.${n}`,
  };
}

const joiner = (actor: Actor) => ({
  id: actor.session.id,
  name: actor.session.name,
  role: actor.session.role,
  moderator: actor.session.moderator,
});

const settings = (extra: Record<string, unknown> = {}) => ({
  deck: FIB,
  timerSeconds: null,
  music: null,
  ...extra,
});

const refused = { ok: false, reason: 'refused' };
const invalid = { ok: false, reason: 'invalid' };

describe('saveSettings', () => {
  it('saves a deck and a timer, and a live room shows them at once', async () => {
    const { code, mo } = await setup();
    const host = await app.registry.open(mo.room);
    const tab = fakeConnection();
    host?.connect(joiner(mo), tab.connection);

    expect(await saveSettings(app, mo, settings({ deck: TEE, timerSeconds: 90 }))).toEqual({
      ok: true,
    });
    expect(await findRoomByCode(app.db, code)).toMatchObject({ deck: TEE, timerSeconds: 90 });
    expect(tab.room()).toMatchObject({ deck: TEE, timer: { seconds: 90 } });
  });

  it('is refused for someone who is not a moderator', async () => {
    const { code, ann } = await setup();
    expect(await saveSettings(app, ann, settings({ deck: TEE }))).toEqual(refused);
    expect((await findRoomByCode(app.db, code))?.deck).toEqual(FIB);
  });

  it('rejects a timer out of range, a bad deck and an unknown track', async () => {
    const { mo } = await setup();
    for (const bad of [
      settings({ timerSeconds: 5 }),
      settings({ timerSeconds: 601 }),
      settings({ timerSeconds: 30.5 }),
      settings({ deck: { values: ['1'], specials: [] } }),
      settings({ deck: null }),
      settings({ music: 'not-a-track' }),
      null,
    ]) {
      expect(await saveSettings(app, mo, bad)).toEqual(invalid);
    }
  });

  it('refuses a deck change while votes are in, and saves nothing', async () => {
    const { code, mo } = await setup();
    const host = await app.registry.open(mo.room);
    host?.connect(joiner(mo), fakeConnection().connection);
    host?.receive(mo.session.id, { type: 'vote', card: '5' });

    expect(await saveSettings(app, mo, settings({ deck: TEE, timerSeconds: 60 }))).toEqual({
      ok: false,
      reason: 'busy',
    });
    expect(await findRoomByCode(app.db, code)).toMatchObject({ deck: FIB, timerSeconds: null });
  });

  it('allows a timer change while votes are in', async () => {
    const { mo } = await setup();
    const host = await app.registry.open(mo.room);
    const tab = fakeConnection();
    host?.connect(joiner(mo), tab.connection);
    host?.receive(mo.session.id, { type: 'vote', card: '5' });
    expect(await saveSettings(app, mo, settings({ timerSeconds: 45 }))).toEqual({ ok: true });
    expect(tab.room()).toMatchObject({ timer: { seconds: 45 }, you: { vote: '5' } });
  });
});

describe('parseDeckText', () => {
  it('reads cards separated by commas or spaces', () => {
    expect(parseDeckText('1, 2,3  5', '? ☕')).toEqual({
      values: ['1', '2', '3', '5'],
      specials: ['?', '☕'],
    });
    expect(parseDeckText('S M L', '')).toEqual({ values: ['S', 'M', 'L'], specials: [] });
  });

  it('returns nothing for a deck that is not valid', () => {
    expect(parseDeckText('', '')).toBeNull();
    expect(parseDeckText('1', '')).toBeNull();
    expect(parseDeckText('1 1 2', '')).toBeNull();
    expect(parseDeckText('1 2 TOOLONG', '')).toBeNull();
    expect(parseDeckText(Array.from({ length: 21 }, (_, i) => i).join(' '), '')).toBeNull();
  });
});

describe('setPasscode and removePasscode', () => {
  const join = (code: string, passcode: string, address: string) =>
    joinRoomFlow(app.flows, { address, code, name: 'Bo', role: 'voter', passcode });

  it('requires the passcode from then on, and removing it opens the room again', async () => {
    const { code, mo } = await setup();
    expect(await setPasscode(app, mo, 'open sesame')).toEqual({ ok: true });
    expect((await join(code, '', '192.0.2.1')).ok).toBe(false);
    expect((await join(code, 'open sesame', '192.0.2.2')).ok).toBe(true);

    expect(await removePasscode(app, await resumeAgain(code, mo))).toEqual({ ok: true });
    expect((await join(code, '', '192.0.2.3')).ok).toBe(true);
  });

  it('signs everyone but moderators out, in the database and in the live room', async () => {
    const { code, mo, ann, moToken, annToken } = await setup();
    const host = await app.registry.open(mo.room);
    const annTab = fakeConnection();
    const moTab = fakeConnection();
    host?.connect(joiner(ann), annTab.connection);
    host?.connect(joiner(mo), moTab.connection);

    await setPasscode(app, mo, 'open sesame');
    expect(await resumeSession(app.flows, { code, token: annToken })).toBeNull();
    expect(await resumeSession(app.flows, { code, token: moToken })).not.toBeNull();
    expect(annTab.sent.at(-1)).toEqual({ type: 'removed' });
    expect(annTab.isClosed()).toBe(true);
    expect(moTab.isClosed()).toBe(false);
  });

  it('rejects a passcode that is too short, too long or not text', async () => {
    const { code, mo } = await setup();
    for (const bad of ['short77', 'x'.repeat(65), '', null, 12345678]) {
      expect(await setPasscode(app, mo, bad)).toEqual(invalid);
    }
    expect((await findRoomByCode(app.db, code))?.passcodeHash).toBeNull();
  });

  it('is refused for someone who is not a moderator', async () => {
    const { code, ann } = await setup();
    expect(await setPasscode(app, ann, 'open sesame')).toEqual(refused);
    expect(await removePasscode(app, ann)).toEqual(refused);
    expect((await findRoomByCode(app.db, code))?.passcodeHash).toBeNull();
  });

  async function resumeAgain(code: string, actor: Actor): Promise<Actor> {
    const room = await findRoomByCode(app.db, code);
    if (!room) throw new Error('room is gone');
    return { room, session: actor.session };
  }
});

describe('recovery', () => {
  it('makes a joined person a moderator when they present the recovery secret', async () => {
    const { ann, who, annToken, annAddress, recoveryToken } = await setup();
    const host = await app.registry.open(ann.room);
    const tab = fakeConnection();
    host?.connect(joiner(ann), tab.connection);

    expect(await recoverModerator(app, { address: annAddress, actor: ann, recoveryToken })).toBe(
      true,
    );
    expect((await who(annToken)).session.moderator).toBe(true);
    expect(tab.room().you.moderator).toBe(true);
  });

  it('refuses a wrong, missing or malformed secret', async () => {
    const { ann, who, annToken, annAddress } = await setup();
    for (const bad of ['wrong', '', null, 42, 'x'.repeat(500)]) {
      expect(
        await recoverModerator(app, { address: annAddress, actor: ann, recoveryToken: bad }),
      ).toBe(false);
    }
    expect((await who(annToken)).session.moderator).toBe(false);
  });

  it('does not accept one room’s secret in another room', async () => {
    const first = await setup();
    const second = await setup();
    expect(
      await recoverModerator(app, {
        address: second.annAddress,
        actor: second.ann,
        recoveryToken: first.recoveryToken,
      }),
    ).toBe(false);
  });

  it('stops answering after thirty attempts from one client, even for the right secret', async () => {
    const { ann, recoveryToken } = await setup();
    const address = '192.0.2.77';
    for (let i = 0; i < 30; i += 1) {
      await recoverModerator(app, { address, actor: ann, recoveryToken: 'wrong' });
    }
    expect(await recoverModerator(app, { address, actor: ann, recoveryToken })).toBe(false);
  });

  it('replaces the secret: the old link stops working and the new one works', async () => {
    const { mo, ann, annAddress, recoveryToken } = await setup();
    const made = await regenerateRecovery(app, mo);
    if (!made.ok) throw new Error('not regenerated');
    expect(made.recoveryToken).not.toBe(recoveryToken);

    const fresh = { room: (await findRoomByCode(app.db, ann.room.code))!, session: ann.session };
    expect(await recoverModerator(app, { address: annAddress, actor: fresh, recoveryToken })).toBe(
      false,
    );
    expect(
      await recoverModerator(app, {
        address: annAddress,
        actor: fresh,
        recoveryToken: made.recoveryToken,
      }),
    ).toBe(true);
  });

  it('only a moderator can replace the secret', async () => {
    const { ann } = await setup();
    expect(await regenerateRecovery(app, ann)).toEqual(refused);
  });
});

describe('deleteRoomNow', () => {
  it('closes the live room and removes the room', async () => {
    const { code, mo, ann } = await setup();
    const host = await app.registry.open(mo.room);
    const tab = fakeConnection();
    host?.connect(joiner(ann), tab.connection);

    expect(await deleteRoomNow(app, mo)).toEqual({ ok: true });
    expect(tab.isClosed()).toBe(true);
    expect(app.registry.get(mo.room.id)).toBeUndefined();
    expect(await findRoomByCode(app.db, code)).toBeNull();
  });

  it('is refused for someone who is not a moderator', async () => {
    const { code, ann } = await setup();
    expect(await deleteRoomNow(app, ann)).toEqual(refused);
    expect(await findRoomByCode(app.db, code)).not.toBeNull();
  });
});

describe('history', () => {
  async function withRounds() {
    const made = await setup();
    const ids = [randomUUID(), randomUUID()];
    for (const [index, id] of ids.entries()) {
      await saveRound(app.db, made.mo.room.id, {
        id,
        title: `PROJ-${index + 1}`,
        votes: [
          { sessionId: made.mo.session.id, name: 'Mo', card: '3' },
          { sessionId: made.ann.session.id, name: 'Ann', card: '8' },
        ],
      });
    }
    return { ...made, ids };
  }

  it('lists the room’s rounds, newest first, to any member', async () => {
    const { ann } = await withRounds();
    const rounds = await roomHistory(app, ann);
    expect(rounds.map((round) => round.title)).toEqual(['PROJ-2', 'PROJ-1']);
  });

  it('lets a moderator delete one round or all of them, and nobody else', async () => {
    const { mo, ann, ids } = await withRounds();
    expect(await deleteHistoryRound(app, ann, ids[0])).toEqual(refused);
    expect(await clearRoomHistory(app, ann)).toEqual(refused);
    expect(await roomHistory(app, mo)).toHaveLength(2);

    expect(await deleteHistoryRound(app, mo, ids[0])).toEqual({ ok: true });
    expect((await roomHistory(app, mo)).map((round) => round.title)).toEqual(['PROJ-2']);
    expect(await clearRoomHistory(app, mo)).toEqual({ ok: true });
    expect(await roomHistory(app, mo)).toEqual([]);
  });

  it('rejects a round id that is not an id, or belongs to another room', async () => {
    const { mo } = await withRounds();
    const other = await withRounds();
    for (const bad of ['nope', '', null, 7]) {
      expect(await deleteHistoryRound(app, mo, bad)).toEqual(invalid);
    }
    expect(await deleteHistoryRound(app, mo, other.ids[0])).toEqual(invalid);
    expect(await roomHistory(app, other.mo)).toHaveLength(2);
  });

  it('removes only the caller’s name from history', async () => {
    const { mo, ann } = await withRounds();
    expect(await anonymiseMe(app, ann)).toBe(2);
    const [round] = await roomHistory(app, mo);
    expect(round?.votes.map((vote) => vote.name)).toEqual(['Mo', null]);
  });
});
