import { expect, test, type Browser, type Page } from '@playwright/test';

// Each browser context is a different visitor with its own address, so the
// tests do not trip the per-address limits on each other's behalf.
let visitors = 0;
const visitor = () => {
  visitors += 1;
  return {
    extraHTTPHeaders: { 'x-forwarded-for': `10.${visitors >> 8}.${visitors & 255}.${2}` },
  };
};

async function createRoom(browser: Browser, name: string) {
  const context = await browser.newContext(visitor());
  const page = await context.newPage();
  await page.goto('/poker');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create room' }).click();
  const recovery = (await page.getByTestId('recovery-link').textContent())?.trim() ?? '';
  const link = page.getByRole('link', { name: 'Open the room' });
  const path = (await link.getAttribute('href')) ?? '';
  await link.click();
  await expect(page.getByTestId('participants')).toContainText(name);
  return { page, path, context, recovery };
}

async function joinRoom(
  browser: Browser,
  path: string,
  name: string,
  options: { passcode?: string; role?: string } = {},
) {
  const context = await browser.newContext(visitor());
  const page = await context.newPage();
  await page.goto(path);
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel(options.role ?? 'Voter').check();
  if (options.passcode !== undefined) {
    await page.getByLabel('Passcode, if the room has one').fill(options.passcode);
  }
  await page.getByRole('button', { name: 'Join' }).click();
  return { page, context };
}

const vote = (page: Page, card: string) =>
  page.getByRole('button', { name: `Vote ${card}`, exact: true }).click();

const refusal = 'Could not join. Check the link and the passcode, then try again.';

test.describe('settings', () => {
  test('a moderator changes the deck and the room uses it', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    await mo.goto(`${path}/settings`);
    await mo.getByLabel('Deck').selectOption('custom');
    await mo.getByLabel('Value cards').fill('S, M, L');
    await mo.getByLabel('Special cards').fill('?');
    await mo.getByRole('button', { name: 'Save settings' }).click();
    await expect(mo.getByRole('status')).toHaveText('Settings saved.');

    await mo.goto(path);
    await expect(mo.getByRole('button', { name: 'Vote M', exact: true })).toBeVisible();
    await expect(mo.getByRole('button', { name: 'Vote 5', exact: true })).toHaveCount(0);
  });

  test('a deck that is not valid is refused with a reason', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    await mo.goto(`${path}/settings`);
    await mo.getByLabel('Deck').selectOption('custom');
    await mo.getByLabel('Value cards').fill('only');
    await mo.getByRole('button', { name: 'Save settings' }).click();
    await expect(mo.getByRole('alert')).toContainText('could not be saved');
  });

  test('someone who is not a moderator cannot open settings or post to them', async ({
    browser,
  }) => {
    const { path } = await createRoom(browser, 'Mo');
    const { page: ann, context } = await joinRoom(browser, path, 'Ann');
    await expect(ann.getByTestId('participants')).toContainText('Ann');
    const opened = await ann.goto(`${path}/settings`);
    expect(opened?.status()).toBe(403);

    const posted = await context.request.post(`${path}/settings?/delete`, {
      headers: { origin: new URL(ann.url()).origin },
      form: {},
    });
    expect(posted.status()).toBe(403);
    await ann.goto(path);
    await expect(ann.getByTestId('participants')).toContainText('Ann');
  });

  test('someone who has not joined is sent to the join form', async ({ browser }) => {
    const { path } = await createRoom(browser, 'Mo');
    const context = await browser.newContext(visitor());
    const page = await context.newPage();
    await page.goto(`${path}/settings`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Join the room');
  });

  test('setting a passcode signs others out, and they need it to return', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await expect(ann.getByTestId('participants')).toContainText('Ann');

    await mo.goto(`${path}/settings`);
    await mo.getByLabel('New passcode').fill('open sesame');
    await mo.getByRole('button', { name: 'Set passcode' }).click();
    await expect(mo.getByRole('status')).toContainText('Passcode set');

    await expect(ann.getByRole('heading', { level: 1 })).toHaveText(
      'You are no longer in this room',
    );

    const wrong = await joinRoom(browser, path, 'Bo', { passcode: 'wrong guess' });
    await expect(wrong.page.getByRole('alert')).toHaveText(refusal);
    const right = await joinRoom(browser, path, 'Cy', { passcode: 'open sesame' });
    await expect(right.page.getByTestId('participants')).toContainText('Cy');
  });

  test('a passcode shorter than eight characters is refused', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    await mo.goto(`${path}/settings`);
    await mo.getByLabel('New passcode').fill('short77');
    await mo.getByRole('button', { name: 'Set passcode' }).click();
    await expect(mo.getByRole('alert')).toContainText('8 to 64 characters');
  });

  test('deleting the room closes it for everyone', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await expect(ann.getByTestId('participants')).toContainText('Ann');

    await mo.goto(`${path}/settings`);
    await mo.getByLabel('Type DELETE to confirm').fill('DELETE');
    await mo.getByRole('button', { name: 'Delete this room' }).click();
    await expect(mo).toHaveURL(/\/poker$/);

    await expect(ann.getByRole('heading', { level: 1 })).toHaveText('Join the room', {
      timeout: 20_000,
    });
    const again = await joinRoom(browser, path, 'Bo');
    await expect(again.page.getByRole('alert')).toHaveText(refusal);
  });
});
