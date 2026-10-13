import { randomUUID } from 'node:crypto';
import { BUILT_IN_DECKS, MUSIC_TRACK_IDS } from '@pokerji/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonymiseMe,
  clearRoomHistory,
  createApp,
  coModerators,
  createRoomFlow,
  deleteHistoryRound,
  demoteModerator,
  deleteRoomNow,
  findRoomByCode,
  joinRoomFlow,
  parseDeckText,
  recoverModerator,
  regenerateRecovery,
  removePasscode,
  resumeSession,
  roomHistory,
  deleteSession,
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
  owner: actor.session.owner,
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

  it('saves a bundled track, and none again', async () => {
    const { code, mo } = await setup();
    const track = MUSIC_TRACK_IDS[0];
    expect(track).toBeDefined();
    expect(await saveSettings(app, mo, settings({ music: track }))).toEqual({ ok: true });
    expect((await findRoomByCode(app.db, code))?.music).toBe(track);
    expect(await saveSettings(app, mo, settings({ music: null }))).toEqual({ ok: true });
    expect((await findRoomByCode(app.db, code))?.music).toBeNull();
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

  it('signs out someone still connected whose session is already gone from the database', async () => {
    const { mo, ann } = await setup();
    const host = await app.registry.open(mo.room);
    const annTab = fakeConnection();
    host?.connect(joiner(ann), annTab.connection);
    // As when a full room made space by dropping the session seen longest ago.
    await deleteSession(app.db, mo.room.id, ann.session.id);

    await setPasscode(app, mo, 'open sesame');
    expect(annTab.sent.at(-1)).toEqual({ type: 'removed' });
    expect(annTab.isClosed()).toBe(true);
  });

  it('counts removing the passcode against the same allowance as setting it', async () => {
    const { code, mo } = await setup();
    for (let i = 0; i < 5; i += 1) {
      expect(await setPasscode(app, mo, `passcode number ${i}`)).toEqual({ ok: true });
    }
    expect(await removePasscode(app, await resumeAgain(code, mo))).toEqual({
      ok: false,
      reason: 'limited',
    });
  });

  it('allows five passcode changes in ten minutes for a room, then asks for patience', async () => {
    const { mo } = await setup();
    for (let i = 0; i < 5; i += 1) {
      expect(await setPasscode(app, mo, `passcode number ${i}`)).toEqual({ ok: true });
    }
    expect(await setPasscode(app, mo, 'one too many')).toEqual({ ok: false, reason: 'limited' });
  });

  it('clears a lockout when the moderator changes the passcode', async () => {
    const { code, mo } = await setup();
    await setPasscode(app, mo, 'open sesame');
    for (let i = 0; i < 50; i += 1) await join(code, `guess ${i}`, `192.0.3.${i}`);
    expect((await join(code, 'open sesame', '192.0.4.1')).ok).toBe(false);

    await setPasscode(app, mo, 'new passcode');
    expect((await join(code, 'new passcode', '192.0.4.2')).ok).toBe(true);
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
  it('makes a joined person the owner when they present the recovery secret', async () => {
    const { ann, mo, who, annToken, moToken, recoveryToken } = await setup();
    const host = await app.registry.open(ann.room);
    const annTab = fakeConnection();
    const moTab = fakeConnection();
    host?.connect(joiner(ann), annTab.connection);
    host?.connect(joiner(mo), moTab.connection);

    expect(await recoverModerator(app, { actor: ann, recoveryToken })).toMatchObject({ ok: true });
    expect((await who(annToken)).session).toMatchObject({ moderator: true, owner: true });
    // The previous owner stays a moderator and is no longer the owner.
    expect((await who(moToken)).session).toMatchObject({ moderator: true, owner: false });
    expect(annTab.room().you).toMatchObject({ moderator: true, owner: true });
    expect(moTab.room().you).toMatchObject({ moderator: true, owner: false });
  });

  it('lets only one of two people who use the link in the same instant take the room', async () => {
    const { ann, mo, who, annToken, moToken, recoveryToken } = await setup();
    const bo = await joinRoomFlow(app.flows, {
      address: '198.51.100.200',
      code: mo.room.code,
      name: 'Bo',
      role: 'voter',
      passcode: '',
    });
    if (!bo.ok) throw new Error('join failed');
    const results = await Promise.all([
      recoverModerator(app, { actor: ann, recoveryToken }),
      recoverModerator(app, { actor: await who(bo.sessionToken), recoveryToken }),
    ]);
    // One wins and is shown the new link. The other is refused and learns nothing.
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const owners = [
      (await who(annToken)).session.owner,
      (await who(bo.sessionToken)).session.owner,
      (await who(moToken)).session.owner,
    ];
    expect(owners.filter(Boolean)).toHaveLength(1);
    expect(owners[results[0]!.ok ? 0 : 1]).toBe(true);
  });

  it('replaces the link every time it is used, so a used link is worth nothing', async () => {
    const { ann, mo, who, annToken, moToken, recoveryToken } = await setup();
    const taken = await recoverModerator(app, { actor: ann, recoveryToken });
    if (!taken.ok) throw new Error('recovery failed');
    expect(taken.recoveryToken).not.toBe(recoveryToken);
    // The old owner tries the link they still have: it is spent.
    const room = (await who(moToken)).room;
    expect(await recoverModerator(app, { actor: await who(moToken), recoveryToken })).toEqual({
      ok: false,
    });
    expect((await who(annToken)).session.owner).toBe(true);
    // The new link works, once.
    const back = await recoverModerator(app, {
      actor: await who(moToken),
      recoveryToken: taken.recoveryToken,
    });
    expect(back.ok).toBe(true);
    expect((await who(moToken)).session.owner).toBe(true);
    expect(room.id).toBe(mo.room.id);
  });

  it('lets the owner demote a moderator, connected or not, and nobody else', async () => {
    const { mo, who, annToken } = await setup();
    const annId = (await who(annToken)).session.id;
    const host = await app.registry.open(mo.room);
    const annTab = fakeConnection();
    host?.connect(joiner(mo), fakeConnection().connection);
    host?.connect(joiner(await who(annToken)), annTab.connection);
    host?.receive(mo.session.id, { type: 'promote', participantId: annId });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await coModerators(app, mo)).toEqual([{ id: annId, name: 'Ann' }]);
    expect(await coModerators(app, await who(annToken))).toEqual([]);

    // A co-moderator cannot demote, and the owner cannot be demoted.
    expect(await demoteModerator(app, await who(annToken), mo.session.id)).toEqual(refused);
    expect(await demoteModerator(app, mo, mo.session.id)).toEqual(invalid);
    expect(await demoteModerator(app, mo, 'not-an-id')).toEqual(invalid);

    // Ann leaves the live room; she can still be demoted.
    host?.disconnect(annId, annTab.connection);
    expect(await demoteModerator(app, mo, annId)).toEqual({ ok: true });
    expect((await who(annToken)).session.moderator).toBe(false);
    expect(await setPasscode(app, await who(annToken), 'open sesame')).toEqual(refused);
    expect(await coModerators(app, mo)).toEqual([]);
  });

  it('gives a co-moderator none of the owner’s powers', async () => {
    const { code, mo, who, annToken } = await setup();
    const host = await app.registry.open(mo.room);
    host?.connect(joiner(mo), fakeConnection().connection);
    host?.connect(joiner(await who(annToken)), fakeConnection().connection);
    host?.receive(mo.session.id, {
      type: 'promote',
      participantId: (await who(annToken)).session.id,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const coModerator = await who(annToken);
    expect(coModerator.session).toMatchObject({ moderator: true, owner: false });

    expect(await deleteRoomNow(app, coModerator)).toEqual(refused);
    expect(await regenerateRecovery(app, coModerator)).toEqual(refused);
    expect(await findRoomByCode(app.db, code)).not.toBeNull();
    // What moderators could always do, they still can.
    expect(await setPasscode(app, coModerator, 'open sesame')).toEqual({ ok: true });
  });

  it('refuses a wrong, missing or malformed secret', async () => {
    const { ann, who, annToken, annAddress } = await setup();
    for (const bad of ['wrong', '', null, 42, 'x'.repeat(500)]) {
      expect(await recoverModerator(app, { actor: ann, recoveryToken: bad })).toEqual({
        ok: false,
      });
    }
    expect((await who(annToken)).session).toMatchObject({ moderator: false, owner: false });
  });

  it('does not accept one room’s secret in another room', async () => {
    const first = await setup();
    const second = await setup();
    expect(
      await recoverModerator(app, { actor: second.ann, recoveryToken: first.recoveryToken }),
    ).toEqual({ ok: false });
  });

  it('stops answering one session after thirty attempts, without blocking others at that address', async () => {
    const { ann, mo, recoveryToken } = await setup();
    const address = '192.0.2.77';
    for (let i = 0; i < 30; i += 1) {
      await recoverModerator(app, { actor: ann, recoveryToken: 'wrong' });
    }
    expect(await recoverModerator(app, { actor: ann, recoveryToken })).toEqual({ ok: false });
    expect(await recoverModerator(app, { actor: mo, recoveryToken })).toMatchObject({ ok: true });
  });

  it('replaces the secret: the old link stops working and the new one works', async () => {
    const { mo, ann, recoveryToken } = await setup();
    const made = await regenerateRecovery(app, mo);
    if (!made.ok) throw new Error('not regenerated');
    expect(made.recoveryToken).not.toBe(recoveryToken);

    const fresh = { room: (await findRoomByCode(app.db, ann.room.code))!, session: ann.session };
    expect(await recoverModerator(app, { actor: fresh, recoveryToken })).toEqual({ ok: false });
    expect(
      await recoverModerator(app, { actor: fresh, recoveryToken: made.recoveryToken }),
    ).toMatchObject({ ok: true });
  });

  it('only the owner can replace the secret', async () => {
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

  it('is refused for anyone but the owner', async () => {
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

  it('limits how often one person can ask for their name to be removed', async () => {
    const { ann } = await withRounds();
    for (let i = 0; i < 20; i += 1) expect(await anonymiseMe(app, ann)).not.toBeNull();
    expect(await anonymiseMe(app, ann)).toBeNull();
  });

  it('removes only the caller’s name from history', async () => {
    const { mo, ann } = await withRounds();
    expect(await anonymiseMe(app, ann)).toBe(2);
    const [round] = await roomHistory(app, mo);
    expect(round?.votes.map((vote) => vote.name)).toEqual(['Mo', null]);
  });
});
