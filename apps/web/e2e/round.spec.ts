import { expect, test, type Browser, type Page } from '@playwright/test';

// Each browser context is a different visitor with its own address, so the
// tests do not trip the per-address limits on each other's behalf.
let visitors = 0;
const visitor = () => {
  visitors += 1;
  return {
    extraHTTPHeaders: { 'x-forwarded-for': `10.${visitors >> 8}.${visitors & 255}.${1}` },
  };
};

async function createRoom(browser: Browser, name: string) {
  const context = await browser.newContext(visitor());
  const page = await context.newPage();
  await page.goto('/poker');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create room' }).click();
  const link = page.getByRole('link', { name: 'Open the room' });
  const path = await link.getAttribute('href');
  if (!path) throw new Error('no room link');
  await link.click();
  await expect(page.getByTestId('participants')).toContainText(name);
  return { page, path, context };
}

async function joinRoom(browser: Browser, path: string, name: string, role = 'Voter') {
  const context = await browser.newContext(visitor());
  const page = await context.newPage();
  await page.goto(path);
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel(role).check();
  await page.getByRole('button', { name: 'Join' }).click();
  return { page, context };
}

const vote = (page: Page, card: string) =>
  page.getByRole('button', { name: `Vote ${card}`, exact: true }).click();

test('two people estimate a story and see the result together', async ({ browser }) => {
  const { page: mo, path } = await createRoom(browser, 'Mo');
  const { page: ann } = await joinRoom(browser, path, 'Ann');
  await expect(mo.getByTestId('participants')).toContainText('Ann');

  await mo.getByLabel('Story title').fill('PROJ-1 Login page');
  await mo.getByRole('button', { name: 'Set title' }).click();
  await expect(ann.getByRole('heading', { level: 1 })).toHaveText('PROJ-1 Login page');

  await vote(mo, '3');
  await vote(ann, '8');

  // Each sees that the other has voted, and nothing about what they chose.
  await expect(ann.getByTestId('participants')).toContainText('Mo voted');
  await expect(mo.getByTestId('participants')).toContainText('Ann voted');
  await expect(ann.getByTestId('participants')).not.toContainText('3');
  await expect(mo.getByTestId('participants')).not.toContainText('8');
  await expect(ann.getByTestId('result')).toHaveCount(0);

  await mo.getByRole('button', { name: 'Reveal' }).click();
  await expect(ann.getByTestId('countdown')).toBeVisible();
  await expect(ann.getByRole('button', { name: 'Vote 5', exact: true })).toBeDisabled();

  for (const page of [mo, ann]) {
    await expect(page.getByTestId('result')).toContainText('Low 3, High 8', { timeout: 8_000 });
    await expect(page.getByTestId('result')).toContainText('Average 5.5');
    await expect(page.getByTestId('participants')).toContainText('Mo: 3');
    await expect(page.getByTestId('participants')).toContainText('Ann: 8');
  }

  await mo.getByRole('button', { name: 'New round' }).click();
  await expect(ann.getByRole('heading', { level: 1 })).toHaveText('No story yet');
  await expect(ann.getByTestId('participants')).toContainText('Ann not voted');
});

test('a spectator watches without a hand', async ({ browser }) => {
  const { page: mo, path } = await createRoom(browser, 'Mo');
  const { page: sam } = await joinRoom(browser, path, 'Sam', 'Spectator');
  await expect(sam.getByText('You are watching.')).toBeVisible();
  await expect(sam.getByRole('heading', { name: 'Your hand' })).toHaveCount(0);
  await expect(sam.getByRole('button', { name: 'Vote 5', exact: true })).toHaveCount(0);
  await expect(mo.getByText('Watching')).toBeVisible();
  await expect(sam.getByRole('button', { name: 'Reveal' })).toHaveCount(0);
});

test('reloading the page keeps you in the room with the current state', async ({ browser }) => {
  const { page: mo, path } = await createRoom(browser, 'Mo');
  await mo.getByLabel('Story title').fill('PROJ-2');
  await mo.getByRole('button', { name: 'Set title' }).click();
  await vote(mo, '5');
  await mo.reload();
  await expect(mo.getByRole('heading', { level: 1 })).toHaveText('PROJ-2');
  await expect(mo.getByTestId('participants')).toContainText('Mo voted');
  await expect(mo.getByRole('button', { name: 'Vote 5', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(mo.url()).toContain(path);
});

test('an unknown room looks like any other room and cannot be joined', async ({ browser }) => {
  const { page } = await joinRoom(browser, '/poker/r/AAAAAAAAAAAA', 'Ann');
  await expect(page.getByRole('alert')).toHaveText(
    'Could not join. Check the link and the passcode, then try again.',
  );
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Join the room');
});

test('the session cookie is scoped to its room and hidden from scripts', async ({ browser }) => {
  const { page, path, context } = await createRoom(browser, 'Mo');
  const cookies = await context.cookies();
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatchObject({
    name: 'pj_session',
    path,
    httpOnly: true,
    sameSite: 'Lax',
  });
  expect(await page.evaluate(() => document.cookie)).toBe('');
});

test('pages carry the security headers, and the policy does not break the app', async ({
  browser,
  request,
}) => {
  const response = await request.get('/poker/r/AAAAAAAAAAAA');
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-/);
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('same-origin');
  expect(headers['cache-control']).toBe('no-store');
  expect(headers['x-robots-tag']).toContain('noindex');

  const violations: string[] = [];
  const context = await browser.newContext(visitor());
  const page = await context.newPage();
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await page.goto('/poker');
  await page.getByLabel('Your name').fill('Mo');
  await page.getByRole('button', { name: 'Create room' }).click();
  await page.getByRole('link', { name: 'Open the room' }).click();
  await expect(page.getByTestId('participants')).toContainText('Mo');
  expect(violations).toEqual([]);
});

test('someone who takes a name already in use is given a numbered one', async ({ browser }) => {
  const { page: mo, path } = await createRoom(browser, 'Mo');
  const { page: copy } = await joinRoom(browser, path, 'mo');
  await expect(copy.getByTestId('participants')).toContainText('mo 2');
  await expect(mo.getByTestId('participants')).toContainText('mo 2');
});

test('a fifth tab closes the oldest, which says why instead of reconnecting', async ({
  browser,
}) => {
  const { page: first, path, context } = await createRoom(browser, 'Mo');
  const others: Page[] = [];
  for (let i = 0; i < 4; i += 1) {
    const page = await context.newPage();
    await page.goto(path);
    await expect(page.getByTestId('participants')).toContainText('Mo');
    others.push(page);
  }
  await expect(first.getByRole('heading', { level: 1 })).toHaveText(
    'This room is open in too many tabs',
  );
  // It stays that way: it does not reconnect and push another tab out.
  await first.waitForTimeout(2_500);
  for (const page of others) {
    await expect(page.getByTestId('participants')).toContainText('Mo');
  }
});
