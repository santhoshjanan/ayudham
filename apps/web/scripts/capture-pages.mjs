// Captures the pages other than the live room, for design inspection.
// Run from apps/web with the built app listening on 127.0.0.1:4398.
import { chromium } from '@playwright/test';

const base = 'http://127.0.0.1:4398';
const out = '.impeccable/review';
let visitors = 0;
const visitor = (extra = {}) => ({
  extraHTTPHeaders: { 'x-forwarded-for': `10.8.${(visitors += 1)}.3` },
  ...extra,
});
const browser = await chromium.launch();

async function pages(name, viewport, colorScheme) {
  const shot = (page, label) =>
    page.screenshot({ path: `${out}/${name}-${label}.png`, fullPage: true });
  const context = await browser.newContext(
    visitor({ viewport, colorScheme, reducedMotion: 'reduce' }),
  );
  const mo = await context.newPage();
  await mo.goto(`${base}/`);
  // The row turns a moment after the page opens.
  await mo.locator('[data-testid="demo-row"] [data-flag="High"]').first().waitFor();
  await shot(mo, 'home');
  await mo.goto(`${base}/privacy`);
  await shot(mo, 'privacy');
  await mo.goto(`${base}/schema`);
  await mo.locator('[data-ready]').waitFor();
  await shot(mo, 'schema-empty');
  await mo.getByRole('button', { name: 'Product', exact: true }).click();
  await mo.getByLabel('Name', { exact: true }).fill('Sourdough loaf');
  await mo.getByRole('button', { name: 'Add offer' }).click();
  await mo.getByLabel('Price', { exact: true }).fill('6.50');
  await mo.getByLabel('Currency', { exact: true }).fill('USD');
  await mo.getByRole('button', { name: 'Organization', exact: true }).click();
  await mo.getByTestId('item').nth(1).getByLabel('Name', { exact: true }).fill('Acme Bakery');
  await shot(mo, 'schema-filled');
  await mo.getByRole('button', { name: 'Another type' }).click();
  await mo.getByLabel('Search Schema.org types').fill('rest');
  await shot(mo, 'schema-picker');
  if (viewport.width < 1024) {
    await mo.getByRole('button', { name: 'Markup', exact: true }).click();
    await mo.screenshot({ path: `${out}/${name}-schema-sheet.png` });
  }
  await mo.getByRole('button', { name: 'Clear', exact: true }).click();
  await mo.screenshot({ path: `${out}/${name}-schema-confirm.png` });
  await mo.getByRole('button', { name: 'Yes, clear' }).click();
  await mo.goto(`${base}/poker`);
  await mo.getByLabel('Your name').fill('Mo');
  await mo.getByRole('button', { name: 'Create room' }).click();
  await mo.getByRole('link', { name: 'Open the room' }).waitFor();
  await shot(mo, 'created');
  const path = await mo.getByRole('link', { name: 'Open the room' }).getAttribute('href');
  await mo.getByRole('link', { name: 'Open the room' }).click();
  await mo.getByTestId('participants').waitFor();

  const annContext = await browser.newContext(visitor({ viewport: { width: 900, height: 700 } }));
  const ann = await annContext.newPage();
  await ann.goto(`${base}${path}`);
  await ann.getByLabel('Your name').fill('Ann');
  await ann.getByRole('button', { name: 'Join' }).click();
  await ann.getByTestId('participants').waitFor();

  // Controls differ by width: a rail when wide, a bar with "More" when narrow.
  const narrow = viewport.width < 1024;
  const openMore = async () => {
    if (narrow && (await mo.getByRole('button', { name: 'More' }).count())) {
      await mo.getByRole('button', { name: 'More' }).click();
    }
  };
  await openMore();
  await mo.getByLabel('Story title').fill('PROJ-88 Export history as a file');
  await mo.getByRole('button', { name: 'Set title' }).click();
  if (narrow) await shot(mo, 'room-more-open');
  if (narrow) await mo.getByRole('button', { name: 'Close' }).click();
  await mo.getByRole('button', { name: 'Vote 5', exact: true }).click();
  await ann.getByRole('button', { name: 'Vote 13', exact: true }).click();
  if (narrow) await mo.screenshot({ path: `${out}/${name}-room-bar.png` });
  await mo.getByRole('button', { name: 'Reveal' }).click();
  await mo.getByTestId('result').waitFor({ timeout: 8000 });

  await mo.goto(`${base}${path}/history`);
  await shot(mo, 'history');
  await mo.goto(`${base}${path}/settings`);
  await shot(mo, 'settings');
  await mo.goto(`${base}${path}/recover`);
  await shot(mo, 'recover');
  await mo.goto(`${base}/nothing-here`);
  await shot(mo, 'missing');
  await annContext.close();
  await context.close();
}

await pages('pages-desktop-light', { width: 1440, height: 900 }, 'light');
await pages('pages-desktop-dark', { width: 1440, height: 900 }, 'dark');
await pages('pages-mobile-light', { width: 390, height: 844 }, 'light');
await pages('pages-mobile-dark', { width: 390, height: 844 }, 'dark');
await browser.close();
console.log('captured');
