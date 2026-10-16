import { expect, test, type Browser, type Page } from '@playwright/test';
import { decodePng } from './decode.ts';

let visitors = 0;
const visitor = () => {
  visitors += 1;
  return {
    extraHTTPHeaders: { 'x-forwarded-for': `10.11.${visitors >> 8}.${visitors & 255}` },
  };
};

const WIDE = { width: 1280, height: 900 };

/** A page on the code maker, hydrated, with the clipboard allowed. */
const open = async (browser: Browser, hash = '', viewport = WIDE): Promise<Page> => {
  const context = await browser.newContext({
    ...visitor(),
    viewport,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  await page.goto(`/codes${hash}`);
  await page.locator('[data-ready]').waitFor();
  return page;
};

const preview = (page: Page) => page.getByTestId('preview');
const image = (page: Page) => preview(page).locator('img');
const copyImage = (page: Page) => page.getByRole('button', { name: 'Copy image' });

/** The preview as a picture, decoded by the test-only decoder. */
const readPreview = async (page: Page, formats?: string[]) => {
  await expect(image(page)).toBeVisible();
  await expect(preview(page)).not.toHaveAttribute('aria-busy', 'true');
  return decodePng(await preview(page).screenshot(), formats);
};

/** Waits until the preview decodes to the given text. */
const expectCode = async (page: Page, text: string, format = 'QRCode') => {
  await expect
    .poll(async () => {
      const read = await readPreview(page);
      return read && `${read.format}:${read.text}`;
    })
    .toBe(`${format}:${text}`);
};

test('opens on Link with an empty preview, then makes a QR code that decodes', async ({
  browser,
}) => {
  const page = await open(browser);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Barcodes and QR codes');
  await expect(preview(page).locator('.empty')).toBeVisible();
  await expect(copyImage(page)).toBeDisabled();

  await page.getByLabel('Address', { exact: true }).fill('https://example.com/');
  await expectCode(page, 'https://example.com/');
  await expect(copyImage(page)).toBeEnabled();
  await expect(page.locator('button.primary')).toHaveCount(1);
  await expect(page.locator('button.primary')).toHaveText('Copy image');
});

test('the server never makes a code', async ({ browser }) => {
  const context = await browser.newContext(visitor());
  const html = await (await context.request.get('/codes')).text();
  expect(html).toContain('Barcodes and QR codes');
  expect(html).not.toContain('data-testid="preview"');
  expect(html).not.toContain('data:image/svg');
});

test('without JavaScript the page says so', async ({ browser }) => {
  const context = await browser.newContext({ ...visitor(), javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/codes');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Barcodes and QR codes');
  await expect(page.locator('noscript p')).toContainText('needs JavaScript');
  await expect(page.locator('.about')).toContainText('Nothing you type, choose or add is sent');
  await expect(preview(page)).toHaveCount(0);
});

test('a link straight to a kind opens it, and an unknown fragment opens Link', async ({
  browser,
}) => {
  const page = await open(browser, '#qr-wifi');
  await expect(page.getByRole('heading', { level: 2, name: 'Wi-Fi network' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Wi-Fi' })).toHaveAttribute('aria-current', 'true');

  const other = await open(browser, '#<img>');
  await expect(other.getByRole('heading', { level: 2, name: 'Link' })).toBeVisible();
  await expect(other.getByLabel('Address', { exact: true })).toBeVisible();
});

test('the worker failing mid-session leaves the page working', async ({ browser }) => {
  const page = await open(browser);
  await page.getByLabel('Address', { exact: true }).fill('https://example.com/one');
  await expectCode(page, 'https://example.com/one');

  // From here every message to the worker fails, and the page must notice and carry on.
  await page.evaluate(() => {
    const seen = window as unknown as { emptied: boolean };
    seen.emptied = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="preview"] .empty')) seen.emptied = true;
    }).observe(document.body, { subtree: true, childList: true });
    Worker.prototype.postMessage = () => {
      throw new Error('the worker is gone');
    };
  });
  await page.getByLabel('Address', { exact: true }).fill('https://example.com/two');
  await expectCode(page, 'https://example.com/two');
  expect(await page.evaluate(() => (window as unknown as { emptied: boolean }).emptied)).toBe(
    false,
  );
});
