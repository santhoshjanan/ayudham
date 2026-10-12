// Captures the live room in its main states for design inspection.
// Run from apps/web with the built app listening on 127.0.0.1:4398 (see scripts/smoke.sh for the environment).
import { chromium } from '@playwright/test';

const base = 'http://127.0.0.1:4398';
const out = '.impeccable/review';
let visitors = 0;
const visitor = (extra = {}) => ({
  extraHTTPHeaders: { 'x-forwarded-for': `10.9.${(visitors += 1)}.3` },
  ...extra,
});

const browser = await chromium.launch();

async function scene(name, viewport, colorScheme) {
  const moContext = await browser.newContext(
    visitor({ viewport, colorScheme, reducedMotion: 'reduce' }),
  );
  const mo = await moContext.newPage();
  await mo.goto(`${base}/poker`);
  await mo.screenshot({ path: `${out}/${name}-create.png`, fullPage: true });
  await mo.getByLabel('Your name').fill('Mo');
  await mo.getByRole('button', { name: 'Create room' }).click();
  const link = mo.getByRole('link', { name: 'Open the room' });
  const path = await link.getAttribute('href');
  await link.click();
  await mo.getByTestId('participants').waitFor();

  const others = [];
  for (const [person, card] of [
    ['Ann', '8'],
    ['Bo', '5'],
    ['Chidi', '5'],
    ['Dee', '13'],
    ['Eli', null],
  ]) {
    const context = await browser.newContext(visitor({ viewport: { width: 900, height: 700 } }));
    const page = await context.newPage();
    await page.goto(`${base}${path}`);
    if (person === 'Ann')
      await page.screenshot({ path: `${out}/${name}-join.png`, fullPage: true });
    await page.getByLabel('Your name').fill(person);
    await page.getByRole('button', { name: 'Join' }).click();
    await page.getByTestId('participants').waitFor();
    if (card) await page.getByRole('button', { name: `Vote ${card}`, exact: true }).click();
    others.push(page);
  }

  await mo.getByLabel('Story title').fill('PROJ-214 Let people reset their own passcode');
  await mo.getByRole('button', { name: 'Set title' }).click();
  await mo.getByRole('button', { name: 'Vote 3', exact: true }).click();
  await mo.waitForTimeout(400);
  await mo.screenshot({ path: `${out}/${name}-voting.png`, fullPage: true });

  await mo.getByRole('button', { name: 'Reveal' }).click();
  await mo.getByTestId('countdown').waitFor();
  await mo.screenshot({ path: `${out}/${name}-count.png` });
  await mo.getByTestId('result').waitFor({ timeout: 8000 });
  await mo.waitForTimeout(500);
  await mo.screenshot({ path: `${out}/${name}-revealed.png`, fullPage: true });
  for (const page of others) await page.context().close();
  await moContext.close();
}

await scene('desktop-light', { width: 1440, height: 900 }, 'light');
await scene('desktop-dark', { width: 1440, height: 900 }, 'dark');
await scene('mobile-light', { width: 390, height: 844 }, 'light');
await scene('mobile-dark', { width: 390, height: 844 }, 'dark');
await browser.close();
console.log('captured');
