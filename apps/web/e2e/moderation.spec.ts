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

test.describe('running a round', () => {
  test('the timer counts down for everyone and says when time is up', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    await expect(mo.getByTestId('timer')).toHaveCount(0);
    await mo.goto(`${path}/settings`);
    await mo.getByLabel('Timer in seconds').fill('10');
    await mo.getByRole('button', { name: 'Save settings' }).click();
    await mo.goto(path);
    const { page: ann } = await joinRoom(browser, path, 'Ann');

    await expect(ann.getByTestId('timer')).toHaveText('Timer: 10 seconds, not running');
    await expect(ann.getByRole('button', { name: 'Start timer' })).toHaveCount(0);
    await mo.getByRole('button', { name: 'Start timer' }).click();
    await expect(ann.getByTestId('timer')).toContainText('remaining');
    await expect(ann.getByText('Time is up.')).toBeVisible({ timeout: 15_000 });
    // The timer never reveals on its own.
    await expect(ann.getByTestId('result')).toHaveCount(0);
  });

  test('a moderator stops the timer', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    await mo.goto(`${path}/settings`);
    await mo.getByLabel('Timer in seconds').fill('60');
    await mo.getByRole('button', { name: 'Save settings' }).click();
    await mo.goto(path);
    await mo.getByRole('button', { name: 'Start timer' }).click();
    await expect(mo.getByTestId('timer')).toContainText('remaining');
    await mo.getByRole('button', { name: 'Stop timer' }).click();
    await expect(mo.getByTestId('timer')).toHaveText('Timer: 60 seconds, not running');
  });

  test('a moderator removes someone, who is told and cannot simply reconnect', async ({
    browser,
  }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await expect(mo.getByTestId('participants')).toContainText('Ann');
    await expect(ann.getByRole('button', { name: 'Remove Mo' })).toHaveCount(0);

    await mo.getByRole('button', { name: 'Remove Ann' }).click();
    await expect(ann.getByRole('heading', { level: 1 })).toHaveText(
      'You are no longer in this room',
    );
    await expect(mo.getByTestId('participants')).not.toContainText('Ann');
    await ann.reload();
    await expect(ann.getByRole('heading', { level: 1 })).toHaveText('Join the room');
  });

  test('a moderator makes someone a co-moderator', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await expect(ann.getByRole('button', { name: 'Reveal' })).toHaveCount(0);
    await mo.getByRole('button', { name: 'Make Ann a moderator' }).click();
    await expect(ann.getByRole('button', { name: 'Reveal' })).toBeVisible();
    await expect(ann.getByRole('link', { name: 'Settings' })).toBeVisible();
    // Moderators cannot remove each other.
    await expect(mo.getByRole('button', { name: 'Remove Ann' })).toHaveCount(0);
  });

  test('someone switches between voting and watching', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await vote(ann, '5');
    await ann.getByRole('button', { name: 'Watch instead' }).click();
    await expect(ann.getByText('You are watching.')).toBeVisible();
    await expect(mo.getByText('Watching')).toBeVisible();
    await expect(mo.getByTestId('participants')).not.toContainText('Ann');

    await ann.getByRole('button', { name: 'Vote instead' }).click();
    await expect(mo.getByTestId('participants')).toContainText('Ann not voted');
  });

  test('"Vote again" keeps the story and clears the votes', async ({ browser }) => {
    const { page: mo } = await createRoom(browser, 'Mo');
    await mo.getByLabel('Story title').fill('PROJ-9');
    await mo.getByRole('button', { name: 'Set title' }).click();
    await vote(mo, '5');
    await mo.getByRole('button', { name: 'Reveal' }).click();
    await expect(mo.getByTestId('result')).toContainText('Unanimous: 5', { timeout: 8_000 });
    await mo.getByRole('button', { name: 'Vote again' }).click();
    await expect(mo.getByRole('heading', { level: 1 })).toHaveText('PROJ-9');
    await expect(mo.getByTestId('participants')).toContainText('Mo not voted');
  });
});

test.describe('history', () => {
  async function playRound(browser: Browser) {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await mo.getByLabel('Story title').fill('PROJ-1 Login');
    await mo.getByRole('button', { name: 'Set title' }).click();
    await vote(mo, '3');
    await vote(ann, '8');
    await mo.getByRole('button', { name: 'Reveal' }).click();
    await expect(mo.getByTestId('result')).toContainText('Low 3, High 8', { timeout: 8_000 });
    return { mo, ann, path };
  }

  test('a finished round appears in history for everyone in the room', async ({ browser }) => {
    const { ann, path } = await playRound(browser);
    await ann.getByRole('link', { name: 'History' }).click();
    await expect(ann).toHaveURL(new RegExp(`${path}/history$`));
    const round = ann.getByTestId('round');
    await expect(round).toHaveCount(1);
    await expect(round).toContainText('PROJ-1 Login');
    await expect(round).toContainText('Low 3, High 8, average 5.5');
    await expect(round).toContainText('Mo: 3');
    await expect(round).toContainText('Ann: 8');
    await expect(ann.getByRole('button', { name: 'Delete this round' })).toHaveCount(0);
  });

  test('someone removes their own name, and only theirs', async ({ browser }) => {
    const { mo, ann, path } = await playRound(browser);
    await ann.goto(`${path}/history`);
    await ann.getByRole('button', { name: 'Remove my name from history' }).click();
    await expect(ann.getByRole('status')).toContainText('Your name was removed from 1 vote');
    await mo.goto(`${path}/history`);
    const round = mo.getByTestId('round');
    await expect(round).toContainText('Anonymous: 8');
    await expect(round).toContainText('Mo: 3');
    await expect(round).not.toContainText('Ann');
  });

  test('a moderator deletes a round', async ({ browser }) => {
    const { mo, path } = await playRound(browser);
    await mo.goto(`${path}/history`);
    await mo.getByRole('button', { name: 'Delete this round' }).click();
    await expect(mo.getByTestId('round')).toHaveCount(0);
    await expect(mo.getByText('No rounds have been saved yet.')).toBeVisible();
  });

  test('history says nothing false about a round played with a deck the room no longer uses', async ({
    browser,
  }) => {
    const { mo, path } = await playRound(browser);
    await mo.getByRole('button', { name: 'New round' }).click();
    await mo.goto(`${path}/settings`);
    await mo.getByLabel('Deck').selectOption('powersOfTwo');
    await mo.getByRole('button', { name: 'Save settings' }).click();
    await expect(mo.getByRole('status')).toHaveText('Settings saved.');
    await mo.goto(`${path}/history`);
    const round = mo.getByTestId('round');
    await expect(round).toContainText('Mo: 3');
    await expect(round).toContainText('Ann: 8');
    await expect(round).not.toContainText('Low');
    await expect(round).not.toContainText('Unanimous');
  });

  test('history is only for people in the room', async ({ browser }) => {
    const { path } = await playRound(browser);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${path}/history`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Join the room');
  });
});

test.describe('moderator recovery', () => {
  test('the moderator link makes a joined person a moderator', async ({ browser }) => {
    const { path, recovery } = await createRoom(browser, 'Mo');
    // A full address, so pasting it into a browser opens it rather than searching for it.
    expect(recovery).toMatch(
      new RegExp(`^http://127\\.0\\.0\\.1:4173${path}/recover#m=[A-Za-z0-9_-]{43}$`),
    );
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await expect(ann.getByRole('button', { name: 'Reveal' })).toHaveCount(0);

    await ann.goto(recovery);
    const become = ann.getByRole('button', { name: 'Become the owner' });
    await expect(become).toBeEnabled();
    // The secret leaves the address bar as soon as the page has read it.
    await expect(ann).toHaveURL(new RegExp(`${path}/recover$`));
    await become.click();
    await expect(ann).toHaveURL(new RegExp(`${path}$`));
    await expect(ann.getByRole('button', { name: 'Reveal' })).toBeVisible();
  });

  test('a wrong secret is refused', async ({ browser }) => {
    const { path } = await createRoom(browser, 'Mo');
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await expect(ann.getByTestId('participants')).toContainText('Ann');
    await ann.goto(`${path}/recover#m=${'x'.repeat(43)}`);
    await ann.getByRole('button', { name: 'Become the owner' }).click();
    await expect(ann.getByRole('alert')).toContainText('That link did not work');
  });

  test('someone who has not joined is asked to join first', async ({ browser }) => {
    const { path, recovery } = await createRoom(browser, 'Mo');
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(recovery);
    await expect(page.getByText('Join the room first')).toBeVisible();
    // The secret is kept for when they come back after joining.
    expect(page.url()).toContain('#m=');
    await expect(page.getByRole('button', { name: 'Become the owner' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Join the room' })).toHaveAttribute('href', path);
  });

  test('a new moderator link replaces the old one', async ({ browser }) => {
    const { page: mo, path, recovery } = await createRoom(browser, 'Mo');
    await mo.goto(`${path}/settings`);
    await mo.getByRole('button', { name: 'Make a new moderator link' }).click();
    const fresh = (await mo.getByTestId('recovery-link').textContent())?.trim() ?? '';
    expect(fresh).not.toBe(recovery);

    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await expect(ann.getByTestId('participants')).toContainText('Ann');
    await ann.goto(recovery);
    await ann.getByRole('button', { name: 'Become the owner' }).click();
    await expect(ann.getByRole('alert')).toContainText('That link did not work');
    await ann.goto(fresh);
    await ann.getByRole('button', { name: 'Become the owner' }).click();
    await expect(ann.getByRole('button', { name: 'Reveal' })).toBeVisible();
  });
});

test.describe('privacy page', () => {
  test('says what is stored and for how long, and is linked from the home page', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Privacy' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
    const main = page.getByRole('main');
    await expect(main).toContainText('30 days');
    await expect(main).toContainText('No accounts');
    await expect(main).toContainText('one cookie');
    await expect(main).toContainText('We do not store your IP address');
    await expect(main).toContainText('a moderator can delete those rounds');
    await expect(main).toContainText('for up to an hour');
    await expect(main).not.toContainText('theme');
  });
});

test.describe('ownership', () => {
  test('a co-moderator cannot delete the room or replace the moderator link', async ({
    browser,
  }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    const { page: ann, context } = await joinRoom(browser, path, 'Ann');
    await mo.getByRole('button', { name: 'Make Ann a moderator' }).click();
    await expect(ann.getByRole('link', { name: 'Settings' })).toBeVisible();

    await ann.goto(`${path}/settings`);
    await expect(ann.getByRole('button', { name: 'Set passcode' })).toBeVisible();
    await expect(ann.getByRole('button', { name: 'Delete this room' })).toHaveCount(0);
    await expect(ann.getByRole('button', { name: 'Make a new moderator link' })).toHaveCount(0);

    // Posting the forms directly is refused too: the page is not the only guard.
    const origin = new URL(ann.url()).origin;
    const deleted = await context.request.post(`${path}/settings?/delete`, {
      headers: { origin },
      form: { confirm: 'DELETE' },
    });
    expect(deleted.status()).toBe(403);
    const replaced = await context.request.post(`${path}/settings?/recovery`, {
      headers: { origin },
      form: {},
    });
    expect(replaced.status()).toBe(403);
    await mo.reload();
    await expect(mo.getByTestId('participants')).toContainText('Mo');
  });

  test('the owner takes moderator rights away again', async ({ browser }) => {
    const { page: mo, path } = await createRoom(browser, 'Mo');
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await expect(mo.getByTestId('participants')).toContainText('Mo not voted · owner');
    await mo.getByRole('button', { name: 'Make Ann a moderator' }).click();
    await expect(ann.getByRole('button', { name: 'Reveal' })).toBeVisible();
    // A co-moderator has no such button for the owner.
    await expect(ann.getByRole('button', { name: 'Remove moderator rights from Mo' })).toHaveCount(
      0,
    );

    await mo.getByRole('button', { name: 'Remove moderator rights from Ann' }).click();
    await expect(ann.getByRole('button', { name: 'Reveal' })).toHaveCount(0);
    await ann.reload();
    await expect(ann.getByRole('button', { name: 'Reveal' })).toHaveCount(0);
  });

  test('the moderator link hands the room over, and the previous owner stays a moderator', async ({
    browser,
  }) => {
    const { page: mo, path, recovery } = await createRoom(browser, 'Mo');
    const { page: ann } = await joinRoom(browser, path, 'Ann');
    await expect(ann.getByTestId('participants')).toContainText('Ann');
    await ann.goto(recovery);
    await ann.getByRole('button', { name: 'Become the owner' }).click();
    await expect(ann.getByTestId('participants')).toContainText('Ann not voted · owner');
    await expect(mo.getByTestId('participants')).toContainText('Mo not voted · moderator');
    await expect(mo.getByRole('button', { name: 'Reveal' })).toBeVisible();

    await ann.goto(`${path}/settings`);
    await expect(ann.getByRole('button', { name: 'Delete this room' })).toBeVisible();
    await mo.goto(`${path}/settings`);
    await expect(mo.getByRole('button', { name: 'Delete this room' })).toHaveCount(0);
  });
});
