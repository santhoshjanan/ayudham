// Captures the beat after a live reveal, with motion on, for design inspection.
// Run from apps/web with the built app listening on 127.0.0.1:4398.
import { chromium } from '@playwright/test';

const base = 'http://127.0.0.1:4398';
const out = '.impeccable/review';
let visitors = 0;
const visitor = (extra = {}) => ({
  extraHTTPHeaders: { 'x-forwarded-for': `10.9.${(visitors += 1)}.3` },
  ...extra,
});
const browser = await chromium.launch();

async function beat(name, viewport, colorScheme, votes) {
  const people = [];
  let path = '';
  for (const [index, [who]] of votes.entries()) {
    const context = await browser.newContext(visitor({ viewport, colorScheme }));
    const page = await context.newPage();
    if (index === 0) {
      await page.goto(`${base}/poker`);
      await page.getByLabel('Your name').fill(who);
      await page.getByRole('button', { name: 'Create room' }).click();
      const link = page.getByRole('link', { name: 'Open the room' });
      path = await link.getAttribute('href');
      await link.click();
    } else {
      await page.goto(`${base}${path}`);
      await page.getByLabel('Your name').fill(who);
      await page.getByRole('button', { name: 'Join' }).click();
    }
    await page.getByTestId('participants').waitFor();
    people.push(page);
  }
  for (const [index, [, card]] of votes.entries()) {
    await people[index].getByRole('button', { name: `Vote ${card}`, exact: true }).click();
  }
  const mo = people[0];
  await mo.getByRole('button', { name: 'Reveal' }).click();
  await mo.getByTestId('result').waitFor({ timeout: 8000 });
  for (const at of [250, 600, 1000, 2000]) {
    await mo.waitForTimeout(at === 250 ? 150 : at === 600 ? 300 : at === 1000 ? 350 : 1000);
    await mo.screenshot({ path: `${out}/beat-${name}-${at}.png` });
  }
}

const split = [
  ['Mo', '5'],
  ['Ann', '13'],
  ['Sam', '3'],
  ['Priya', '5'],
  ['Luis', '8'],
];
await beat('desktop-light', { width: 1440, height: 900 }, 'light', split);
await beat('mobile-dark', { width: 390, height: 844 }, 'dark', split);
await beat(
  'desktop-dark-unanimous',
  { width: 1440, height: 900 },
  'dark',
  split.map(([who]) => [who, '5']),
);
await browser.close();
console.log('captured');
