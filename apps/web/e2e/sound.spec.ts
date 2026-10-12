import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, test, type Browser } from '@playwright/test';
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
  // Count what the page asks the browser to play; nothing here changes the page's behaviour.
  await context.addInitScript(() => {
    const heard = { plays: 0, pauses: 0, notes: 0 };
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
  });
  const heard = () =>
    mo.evaluate(() => (window as unknown as { heard: Record<string, number> }).heard);
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
  await expect.poll(heard).toEqual({ plays: 0, pauses: 0, notes: 1 });

  await mo.getByRole('button', { name: 'Start timer' }).click();
  await expect.poll(heard).toMatchObject({ plays: 1, pauses: 0 });

  // At zero the music has been stopped and the telegraph key sounds: three short, one long.
  await expect(mo.getByText('Time is up.')).toBeVisible({ timeout: 15_000 });
  await expect.poll(heard).toEqual({ plays: 1, pauses: 1, notes: 5 });

  // The reveal count ticks once for each of 3, 2, 1.
  await mo.getByRole('button', { name: 'Vote 5', exact: true }).click();
  await mo.getByRole('button', { name: 'Reveal' }).click();
  await expect(mo.getByTestId('result')).toBeVisible({ timeout: 8_000 });
  expect(await heard()).toEqual({ plays: 1, pauses: 1, notes: 8 });

  // Stopping a timer early ends the music with no beep.
  await mo.getByRole('button', { name: 'New round' }).click();
  await mo.getByRole('button', { name: 'Start timer' }).click();
  await expect.poll(heard).toMatchObject({ plays: 2 });
  await mo.getByRole('button', { name: 'Stop timer' }).click();
  await expect.poll(heard, { timeout: 5_000 }).toEqual({ plays: 2, pauses: 2, notes: 8 });
  expect(problems).toEqual([]);
});
