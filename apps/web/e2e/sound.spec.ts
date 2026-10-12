import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { MUSIC_TRACK_IDS } from '@pokerji/protocol';

let visitors = 0;
const visitor = () => {
  visitors += 1;
  return {
    extraHTTPHeaders: { 'x-forwarded-for': `10.${visitors >> 8}.${visitors & 255}.${3}` },
  };
};

async function createRoom(browser: Browser, name: string) {
  const context = await browser.newContext(visitor());
  const page = await context.newPage();
  await page.goto('/poker');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create room' }).click();
  const link = page.getByRole('link', { name: 'Open the room' });
  const path = (await link.getAttribute('href')) ?? '';
  await link.click();
  await expect(page.getByTestId('participants')).toContainText(name);
  return { page, path, context };
}

/** Counts what a page asks the browser to play. It changes nothing about the page's behaviour. */
const countSounds = (context: BrowserContext) =>
  context.addInitScript(() => {
    const heard = { plays: 0, pauses: 0, notes: 0, devices: 0, closes: 0 };
    Object.assign(window, { heard });
    const { play, pause } = HTMLMediaElement.prototype;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      heard.plays += 1;
      return play.call(this);
    };
    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
      heard.pauses += 1;
      pause.call(this);
    };
    const { start } = OscillatorNode.prototype;
    OscillatorNode.prototype.start = function (this: OscillatorNode, when?: number) {
      heard.notes += 1;
      start.call(this, when);
    };
    const { close } = AudioContext.prototype;
    AudioContext.prototype.close = function (this: AudioContext) {
      heard.closes += 1;
      return close.call(this);
    };
    const Device = window.AudioContext;
    window.AudioContext = class extends Device {
      constructor(options?: AudioContextOptions) {
        super(options);
        heard.devices += 1;
      }
    };
  });
const heardBy = (page: Page) =>
  page.evaluate(() => (window as unknown as { heard: Record<string, number> }).heard);

async function joinRoom(browser: Browser, path: string, name: string) {
  const context = await browser.newContext(visitor());
  await countSounds(context);
  const page = await context.newPage();
  await page.goto(path);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByTestId('participants')).toContainText(name);
  return { page, context };
}

test('music is fetched only for a person who has turned sound on', async ({ browser }) => {
  const { page: mo, path } = await createRoom(browser, 'Mo');
  await mo.goto(`${path}/settings`);
  await mo.getByLabel('Music during the countdown').selectOption('chopin-waltz-op64-1');
  await mo.getByLabel('Timer in seconds').fill('20');
  await mo.getByRole('button', { name: 'Save settings' }).click();
  await expect(mo.getByRole('status')).toHaveText('Settings saved.');
  await mo.reload();
  await expect(mo.getByLabel('Music during the countdown')).toHaveValue('chopin-waltz-op64-1');

  const fetched: string[] = [];
  mo.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/audio/')) fetched.push(pathname);
  });
  await mo.goto(path);
  await expect(mo.getByRole('button', { name: 'Turn sound on' })).toBeVisible();
  await mo.getByRole('button', { name: 'Start timer' }).click();
  await expect(mo.getByTestId('timer')).toContainText('remaining');
  await mo.waitForTimeout(1_000);
  // Sound is off until asked for: nothing has been downloaded.
  expect(fetched).toEqual([]);

  await mo.getByRole('button', { name: 'Turn sound on' }).click();
  await expect(mo.getByRole('button', { name: 'Turn sound off' })).toBeVisible();
  await expect.poll(() => fetched).toContain('/audio/chopin-waltz-op64-1.mp3');

  // The choice is remembered in this browser, and only there.
  expect(await mo.evaluate(() => localStorage.getItem('pj-sound'))).toBe('1');
  await mo.reload();
  await expect(mo.getByRole('button', { name: 'Turn sound off' })).toBeVisible();
  await mo.getByRole('button', { name: 'Turn sound off' }).click();
  expect(await mo.evaluate(() => localStorage.getItem('pj-sound'))).toBe('0');
});

test('a room with no music fetches no audio even with sound on', async ({ browser }) => {
  const { page: mo, path } = await createRoom(browser, 'Mo');
  await mo.goto(`${path}/settings`);
  await mo.getByLabel('Timer in seconds').fill('20');
  await mo.getByRole('button', { name: 'Save settings' }).click();
  await expect(mo.getByRole('status')).toHaveText('Settings saved.');
  const fetched: string[] = [];
  mo.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/audio/')) fetched.push(request.url());
  });
  await mo.goto(path);
  await mo.getByRole('button', { name: 'Turn sound on' }).click();
  await mo.getByRole('button', { name: 'Start timer' }).click();
  await expect(mo.getByTestId('timer')).toContainText('remaining');
  await mo.waitForTimeout(1_000);
  expect(fetched).toEqual([]);
});

test('every bundled track is served, and matches its recorded licence entry', async ({
  browser,
}) => {
  const context = await browser.newContext(visitor());
  const licences = readFileSync('static/audio/LICENSES.md', 'utf8');
  expect(MUSIC_TRACK_IDS.length).toBeGreaterThan(0);
  // Nothing is served from the audio folder that the list and the licence record do not know.
  expect(readdirSync('static/audio').sort()).toEqual(
    ['LICENSES.md', ...MUSIC_TRACK_IDS.map((id) => `${id}.mp3`)].sort(),
  );
  for (const id of MUSIC_TRACK_IDS) {
    const response = await context.request.get(`/audio/${id}.mp3`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('audio/mpeg');
    const sha1 = createHash('sha1')
      .update(await response.body())
      .digest('hex');
    const row = licences.split('\n').find((line) => line.includes(`\`${id}.mp3\``));
    expect(row, `${id} has a row in LICENSES.md`).toBeDefined();
    expect(row).toContain('CC0 1.0');
    expect(row).toContain(sha1);
  }
});

test('with sound on: music through the countdown, silence and a beep at its end, ticks on the count', async ({
  browser,
}) => {
  const { page: mo, path, context } = await createRoom(browser, 'Mo');
  await countSounds(context);
  const heard = () => heardBy(mo);
  const problems: string[] = [];
  mo.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  mo.on('pageerror', (error) => problems.push(error.message));

  await mo.goto(`${path}/settings`);
  await mo.getByLabel('Music during the countdown').selectOption('bach-goldberg-var1');
  await mo.getByLabel('Timer in seconds').fill('10');
  await mo.getByRole('button', { name: 'Save settings' }).click();
  await expect(mo.getByRole('status')).toHaveText('Settings saved.');
  await mo.goto(path);

  // Turning sound on confirms itself with one tick.
  await mo.getByRole('button', { name: 'Turn sound on' }).click();
  await expect.poll(heard).toMatchObject({ plays: 0, pauses: 0, notes: 1 });

  await mo.getByRole('button', { name: 'Start timer' }).click();
  await expect.poll(heard).toMatchObject({ plays: 1, pauses: 0 });

  // At zero the music has been stopped and the telegraph key sounds: three short, one long.
  await expect(mo.getByText('Time is up.')).toBeVisible({ timeout: 15_000 });
  await expect.poll(heard).toMatchObject({ plays: 1, pauses: 1, notes: 5 });

  // The reveal count ticks once for each of 3, 2, 1.
  await mo.getByRole('button', { name: 'Vote 5', exact: true }).click();
  await mo.getByRole('button', { name: 'Reveal' }).click();
  await expect(mo.getByTestId('result')).toBeVisible({ timeout: 8_000 });
  expect(await heard()).toMatchObject({ plays: 1, pauses: 1, notes: 8 });

  // Stopping a timer early ends the music with no beep.
  await mo.getByRole('button', { name: 'New round' }).click();
  await mo.getByRole('button', { name: 'Start timer' }).click();
  await expect.poll(heard).toMatchObject({ plays: 2 });
  await mo.getByRole('button', { name: 'Stop timer' }).click();
  await expect.poll(heard, { timeout: 5_000 }).toMatchObject({ plays: 2, pauses: 2, notes: 8 });
  expect(problems).toEqual([]);
});

test('music stops at once for someone removed from the room', async ({ browser }) => {
  const { page: mo, path } = await createRoom(browser, 'Mo');
  await mo.goto(`${path}/settings`);
  await mo.getByLabel('Music during the countdown').selectOption('bach-goldberg-var1');
  await mo.getByLabel('Timer in seconds').fill('60');
  await mo.getByRole('button', { name: 'Save settings' }).click();
  await expect(mo.getByRole('status')).toHaveText('Settings saved.');
  await mo.goto(path);
  const { page: ann } = await joinRoom(browser, path, 'Ann');
  await ann.getByRole('button', { name: 'Turn sound on' }).click();

  await mo.getByRole('button', { name: 'Start timer' }).click();
  await expect.poll(() => heardBy(ann)).toMatchObject({ plays: 1, pauses: 0 });

  await mo.getByRole('button', { name: 'Manage people' }).click();
  await mo.getByRole('button', { name: 'Remove Ann' }).click();
  await mo.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(ann.getByText('You are no longer in this room')).toBeVisible();
  await expect.poll(() => heardBy(ann), { timeout: 3_000 }).toMatchObject({ pauses: 1 });
});

test('in a newly opened tab nothing sounds, and nothing is queued, until the person touches the page', async ({
  browser,
}) => {
  const { page: mo, path } = await createRoom(browser, 'Mo');
  const { page: first, context } = await joinRoom(browser, path, 'Ann');
  let ann = first;
  // Sound that is off opens no audio device.
  expect(await heardBy(ann)).toMatchObject({ devices: 0, notes: 0 });
  await ann.getByRole('button', { name: 'Turn sound on' }).click();
  await expect.poll(() => heardBy(ann)).toMatchObject({ devices: 1, notes: 1 });

  // The same person, the same saved choice, a page nobody has touched yet. (A reload in the
  // same tab keeps the browser's memory of the earlier click, so it would not show this.)
  await first.close();
  // Playwright's own page checks count as a touch, so the browser's answer to "has this page
  // been touched" is replaced by one that only a real pointer press changes.
  await context.addInitScript(() => {
    let touched = false;
    addEventListener('pointerdown', () => (touched = true), { capture: true });
    Object.defineProperty(Navigator.prototype, 'userActivation', {
      get: () => ({ hasBeenActive: touched, isActive: touched }),
    });
  });
  ann = await context.newPage();
  await ann.goto(path);
  await expect(ann.getByRole('button', { name: 'Turn sound off' })).toBeVisible();
  await mo.getByRole('button', { name: 'Vote 5', exact: true }).click();
  await mo.getByRole('button', { name: 'Reveal' }).click();
  await expect(ann.getByTestId('result')).toBeVisible({ timeout: 8_000 });
  // Notes asked for now would all play together at the first click, long after their moment.
  expect(await heardBy(ann)).toMatchObject({ devices: 0, notes: 0 });

  // Turning sound off closes the device again.
  await ann.getByRole('button', { name: 'Turn sound off' }).click();
  await ann.getByRole('button', { name: 'Turn sound on' }).click();
  await expect.poll(() => heardBy(ann)).toMatchObject({ devices: 1, notes: 1 });
  await ann.getByRole('button', { name: 'Turn sound off' }).click();
  await expect.poll(() => heardBy(ann)).toMatchObject({ closes: 1 });
});
