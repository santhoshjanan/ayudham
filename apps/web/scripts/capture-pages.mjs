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
  // The text tools: a generator, several results, a converter empty and filled, a refusal.
  const tool = async (id) => {
    await mo.goto(`${base}/text#${id}`);
    await mo.locator(`a[href="#${id}"][aria-current="true"]`).waitFor();
  };
  await mo.goto(`${base}/text`);
  await mo.locator('[data-ready]').waitFor();
  await shot(mo, 'text-password');
  await mo.getByLabel('How many', { exact: true }).fill('5');
  await mo.getByLabel('Length', { exact: true }).fill('64');
  await shot(mo, 'text-password-many');
  await mo.getByLabel('Length', { exact: true }).fill('4');
  await shot(mo, 'text-password-refused');
  await tool('passphrase');
  await mo.getByTestId('result').first().waitFor();
  await shot(mo, 'text-passphrase');
  await tool('id');
  await mo.getByLabel('Kind', { exact: true }).selectOption({ label: 'UUID version 7' });
  await shot(mo, 'text-identifier');
  await tool('case');
  await shot(mo, 'text-case-empty');
  await mo.getByLabel('Text', { exact: true }).fill("the return of the iPhone: a buyer's guide");
  await shot(mo, 'text-case');
  await tool('encode');
  await mo.getByRole('button', { name: 'Decode', exact: true }).click();
  await mo.getByLabel('Text', { exact: true }).fill('not base64!');
  await shot(mo, 'text-encode-refused');
  await tool('lines');
  await mo.getByLabel('Text', { exact: true }).fill('pear\napple\nfig\napple');
  await mo.getByRole('button', { name: 'Remove repeats' }).click();
  await mo.getByLabel('Order', { exact: true }).selectOption({ label: 'A to Z' });
  await shot(mo, 'text-lines');
  await tool('count');
  await mo.getByLabel('Text', { exact: true }).fill('Hello, wide world');
  await shot(mo, 'text-count');

  // The code maker: empty, each family, styled, a logo, a warning and a refusal.
  // A fresh load for each kind: a change of fragment alone keeps the page's state.
  const kind = async (id) => {
    await mo.goto('about:blank');
    await mo.goto(`${base}/codes#${id}`);
    await mo.locator('[data-ready]').waitFor();
  };
  const settle = () => mo.locator('[data-testid="preview"]:not([aria-busy="true"])').waitFor();
  const field = (label) =>
    mo.getByLabel(label, { exact: true }).and(mo.locator('input, textarea, select'));
  const press = (group, name) =>
    mo
      .getByRole('group', { name: group, exact: true })
      .getByRole('button', { name, exact: true })
      .click();
  await kind('qr-link');
  await shot(mo, 'codes-empty');
  await field('Address').fill('https://example.com/menu');
  await settle();
  await shot(mo, 'codes-link');
  await kind('qr-wifi');
  await field('Network name').fill('Guest network');
  await field('Password').fill('correct horse battery');
  await settle();
  await shot(mo, 'codes-wifi');
  await kind('qr-card');
  await field('Given name').fill('Ada');
  await field('Family name').fill('Lovelace');
  await field('Organisation').fill('Analytical Engines');
  await field('Mobile phone').fill('+44 20 7946 0000');
  await field('Email').fill('ada@example.com');
  await settle();
  await shot(mo, 'codes-card');
  await kind('ean-13');
  await field('Text').fill('590123412345');
  await settle();
  await shot(mo, 'codes-ean13');
  await kind('pdf417');
  await field('Text').fill('Boarding pass: seat 14C, gate 22, departs 09:40');
  await settle();
  await shot(mo, 'codes-pdf417');
  await kind('qr-link');
  await field('Address').fill('https://example.com/menu');
  await press('Themes', 'Ocean');
  await press('Dots', 'Circle');
  await press('Corner rings', 'Leaf');
  await settle();
  await shot(mo, 'codes-styled');
  const logo = await mo.evaluate(async () => {
    const canvas = new OffscreenCanvas(96, 96);
    const context = canvas.getContext('2d');
    context.fillStyle = '#0e6f8c';
    context.beginPath();
    context.arc(48, 48, 44, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffffff';
    context.font = 'bold 52px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('P', 48, 52);
    const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer());
    return btoa(String.fromCharCode(...bytes));
  });
  await mo.getByLabel('Choose image').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(logo, 'base64'),
  });
  await mo.getByRole('button', { name: 'Remove logo' }).waitFor();
  await settle();
  await shot(mo, 'codes-logo');
  await mo.getByRole('button', { name: 'Transparent' }).click();
  await settle();
  await shot(mo, 'codes-transparent');
  await kind('qr-link');
  await field('Address').fill('https://example.com/menu');
  await mo.getByRole('textbox', { name: 'Foreground', exact: true }).fill('#777777');
  await settle();
  await shot(mo, 'codes-warning');
  await mo.getByRole('textbox', { name: 'Foreground', exact: true }).fill('#cccccc');
  await settle();
  await shot(mo, 'codes-refused');
  await kind('code-39');
  await field('Text').fill('AB');
  await settle();
  await field('Text').fill('ABé');
  await settle();
  await shot(mo, 'codes-character');

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
