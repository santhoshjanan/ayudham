import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';

let visitors = 0;
const visitor = () => {
  visitors += 1;
  return {
    extraHTTPHeaders: { 'x-forwarded-for': `10.9.${visitors >> 8}.${visitors & 255}` },
  };
};

const WIDE = { width: 1280, height: 900 };
const NARROW = { width: 390, height: 844 };

/** A page on the text tools, hydrated, with the clipboard allowed. */
const open = async (browser: Browser, hash = '', viewport = WIDE): Promise<Page> => {
  const context = await browser.newContext({
    ...visitor(),
    viewport,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  await page.goto(`/text${hash}`);
  await page.locator('[data-ready]').waitFor();
  return page;
};

const results = (page: Page) => page.getByTestId('result');
const values = (page: Page) => page.getByTestId('result').locator('.value').allTextContents();
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const rail = (page: Page) => page.getByRole('complementary', { name: 'Results' });
const status = (page: Page) => rail(page).locator('p[role="status"]');
// WCAG 2.2 AA, the standard the design direction names.
const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

test('the page opens on a strong password that one press copies', async ({ browser }) => {
  const page = await open(browser);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Text tools');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Password', exact: true }),
  ).toBeVisible();
  await expect(results(page)).toHaveCount(1);
  const [made = ''] = await values(page);
  expect(made).toHaveLength(20);
  await expect(rail(page)).toContainText('128 bits');

  await page.getByRole('button', { name: 'Copy result 1' }).click();
  await expect(page.getByRole('button', { name: 'Copied result 1' })).toBeVisible();
  expect(await clipboard(page)).toBe(made);
});

test('Generate again is the one yellow button, and it makes a new password', async ({
  browser,
}) => {
  const page = await open(browser);
  const [first] = await values(page);
  await expect(page.locator('button.primary, a.button')).toHaveCount(1);
  await page.getByRole('button', { name: 'Generate again' }).click();
  await expect.poll(async () => (await values(page))[0]).not.toBe(first);
});

test('the server never makes a value: the page arrives without one', async ({ browser }) => {
  const context = await browser.newContext(visitor());
  const html = await (await context.request.get('/text')).text();
  expect(html).toContain('Text tools');
  expect(html).not.toContain('data-testid="result"');
  expect(html).not.toContain('Generate again');
});

test('without JavaScript the page says what it is and that it needs JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ ...visitor(), javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/text');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Text tools');
  // Playwright's text search skips noscript, so the element is found by its tag.
  await expect(page.locator('noscript p')).toContainText('need JavaScript');
  await expect(page.getByText('never sent to this site')).toBeVisible();
  await expect(results(page)).toHaveCount(0);
});

test('options change what is made, and several can be made and copied at once', async ({
  browser,
}) => {
  const page = await open(browser);
  for (const off of ['Lowercase', 'Uppercase', 'Symbols']) {
    await page.getByRole('button', { name: off, exact: true }).click();
  }
  await page.getByLabel('Length', { exact: true }).fill('8');
  await page.getByLabel('How many', { exact: true }).fill('5');
  await expect(results(page)).toHaveCount(5);
  const made = await values(page);
  for (const value of made) expect(value).toMatch(/^[0-9]{8}$/);
  await expect(rail(page)).toContainText('26 bits');

  await page.getByRole('button', { name: 'Copy all' }).click();
  expect(await clipboard(page)).toBe(made.join('\n'));

  await page.getByRole('button', { name: 'No look-alikes' }).click();
  await expect(page.getByRole('button', { name: 'No look-alikes' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const value of await values(page)) expect(value).toMatch(/^[2-9]{8}$/);
});

test('a number field left empty or out of range names the limit and keeps the last results', async ({
  browser,
}) => {
  const page = await open(browser);
  const [before] = await values(page);
  for (const typed of ['', '7', '257', '12.5']) {
    await page.getByLabel('Length', { exact: true }).fill(typed);
    await expect(status(page)).toContainText('Length must be 8 to 256');
    expect(await values(page)).toEqual([before]);
  }
  await page.getByLabel('Length', { exact: true }).fill('12');
  await expect(status(page)).toHaveCount(0);
  expect((await values(page))[0]).toHaveLength(12);

  for (const off of ['Lowercase', 'Uppercase', 'Digits', 'Symbols']) {
    await page.getByRole('button', { name: off, exact: true }).click();
  }
  await expect(status(page)).toContainText('Choose at least one kind of character');
});

test('the word list is fetched once, and only when the passphrase tool is opened', async ({
  browser,
}) => {
  const page = await open(browser);
  const fetched: string[] = [];
  page.on('request', (request) => fetched.push(new URL(request.url()).pathname));
  await page.getByRole('button', { name: 'Generate again' }).click();
  await page.getByRole('link', { name: 'Random string' }).click();
  await expect(results(page)).toHaveCount(1);
  expect(fetched).toEqual([]);

  await page.getByRole('link', { name: 'Passphrase' }).click();
  await expect(results(page)).toHaveCount(1);
  const [phrase = ''] = await values(page);
  expect(phrase.split('-')).toHaveLength(6);
  expect(phrase).toMatch(/^[a-z]+(-[a-z]+)+$/);
  await expect(rail(page)).toContainText('77 bits');

  await page.getByRole('button', { name: 'Capitals' }).click();
  await page.getByRole('button', { name: 'Add a digit' }).click();
  await page.getByLabel('Separator').selectOption({ label: 'Full stop' });
  await page.getByLabel('Words', { exact: true }).fill('4');
  const [changed = ''] = await values(page);
  expect(changed.split('.')).toHaveLength(4);
  expect(changed).toMatch(/[0-9]/);
  expect(changed).toMatch(/^[A-Z]/);

  await page.getByRole('link', { name: 'Password' }).click();
  await page.getByRole('link', { name: 'Passphrase' }).click();
  await expect(results(page)).toHaveCount(1);
  expect(fetched).toEqual(['/text/eff_large_wordlist.txt']);
});

test('a word list that does not arrive, or arrives changed, is refused and can be retried', async ({
  browser,
}) => {
  const page = await open(browser);
  let mode: 'missing' | 'changed' | 'real' = 'missing';
  await page.route('**/text/eff_large_wordlist.txt', async (route) => {
    if (mode === 'missing') return route.abort();
    if (mode === 'real') return route.continue();
    const real = await route.fetch();
    return route.fulfill({ response: real, body: (await real.text()).replace('abacus', 'abacas') });
  });

  await page.getByRole('link', { name: 'Passphrase' }).click();
  await expect(status(page)).toContainText('word list could not be loaded');
  await expect(results(page)).toHaveCount(0);

  mode = 'changed';
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(status(page)).toContainText('word list could not be loaded');
  await expect(results(page)).toHaveCount(0);

  // The other tools are unaffected.
  await page.getByRole('link', { name: 'Password' }).click();
  await expect(results(page)).toHaveCount(1);

  mode = 'real';
  await page.getByRole('link', { name: 'Passphrase' }).click();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(results(page)).toHaveCount(1);
  await expect(status(page)).toHaveCount(0);
});

test('random strings come in every kind', async ({ browser }) => {
  const page = await open(browser, '#random');
  const kind = page.getByLabel('Kind', { exact: true });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[0-9a-f]{32}$/);
  await expect(rail(page)).toContainText('128 bits');

  await kind.selectOption({ label: 'Base64' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  await kind.selectOption({ label: 'Base64URL' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await kind.selectOption({ label: 'Digits' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[0-9]{16}$/);
  await kind.selectOption({ label: 'Letters' });
  await page.getByLabel('Letters', { exact: true }).selectOption({ label: 'Lowercase' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[a-z]{16}$/);
  await kind.selectOption({ label: 'Letters and digits' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[A-Za-z0-9]{24}$/);

  await kind.selectOption({ label: 'Your own characters' });
  await expect(status(page)).toContainText('between 2 and 256 characters');
  await page.getByLabel('Characters to use').fill('xy');
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[xy]{16}$/);
  await page.getByLabel('Characters to use').fill('xx');
  await expect(status(page)).toContainText('same character twice');
});

test('PINs, numbers, identifiers and chance all give results', async ({ browser }) => {
  const page = await open(browser, '#number');
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[0-9]{6}$/);
  await page.getByLabel('Make', { exact: true }).selectOption({ label: 'A number in a range' });
  await page.getByLabel('From', { exact: true }).fill('10');
  await page.getByLabel('To', { exact: true }).fill('12');
  await expect.poll(async () => (await values(page))[0]).toMatch(/^1[0-2]$/);

  await page.getByRole('link', { name: 'Identifier' }).click();
  const kind = page.getByLabel('Kind', { exact: true });
  await expect
    .poll(async () => (await values(page))[0])
    .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await expect(rail(page)).not.toContainText('contains the time');
  await kind.selectOption({ label: 'UUID version 7' });
  await expect
    .poll(async () => (await values(page))[0])
    .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await expect(rail(page)).toContainText('contains the time');
  await kind.selectOption({ label: 'ULID' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  await kind.selectOption({ label: 'Short id' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[A-Za-z0-9_-]{21}$/);

  await page.getByRole('link', { name: 'Chance' }).click();
  await page.getByLabel('Dice', { exact: true }).fill('3');
  await expect(results(page)).toHaveCount(4);
  const rolled = await values(page);
  expect(rolled.slice(0, 3).every((roll) => /^[1-6]$/.test(roll))).toBe(true);
  expect(Number(rolled[3])).toBe(rolled.slice(0, 3).reduce((sum, roll) => sum + Number(roll), 0));

  await page.getByLabel('Use', { exact: true }).selectOption({ label: 'A coin' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^(Heads|Tails)$/);

  await page.getByLabel('Use', { exact: true }).selectOption({ label: 'A list of your own' });
  await expect(status(page)).toContainText('Type at least one line');
  await page.getByLabel('List', { exact: true }).fill('Ann\nBo\nCy\n');
  await page.getByLabel('How many to pick').fill('2');
  await expect(results(page)).toHaveCount(2);
  const picked = await values(page);
  expect(new Set(picked).size).toBe(2);
  expect(picked.every((name) => ['Ann', 'Bo', 'Cy'].includes(name))).toBe(true);
});
