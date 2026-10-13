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
