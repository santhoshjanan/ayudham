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

// The dock is fixed to the viewport. A full-page capture would draw it across
// the middle of the page, over the content, so for those shots it is put back
// into the flow. Set through the style object, which the page's policy allows.
const fullPage = async (page, file) => {
  await page.evaluate(() => {
    scrollTo(0, 0);
    const dock = document.querySelector('.dock');
    if (dock) dock.style.position = 'static';
  });
  await page.screenshot({ path: file, fullPage: true });
  await page.evaluate(() => {
    const dock = document.querySelector('.dock');
    if (dock) dock.style.position = '';
  });
};
// A viewport capture always starts at the top of the document.
const viewportShot = async (page, file) => {
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(100);
  await page.screenshot({ path: file });
};

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

  // The join form, in this scene's own viewport and theme.
  const joinContext = await browser.newContext(
    visitor({ viewport, colorScheme, reducedMotion: 'reduce' }),
  );
  const joinPage = await joinContext.newPage();
  await joinPage.goto(`${base}${path}`);
  await joinPage.getByLabel('Your name').waitFor();
  await joinPage.screenshot({ path: `${out}/${name}-join.png`, fullPage: true });
  await joinContext.close();

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
    await page.getByLabel('Your name').fill(person);
    await page.getByRole('button', { name: 'Join' }).click();
    await page.getByTestId('participants').waitFor();
    if (card) await page.getByRole('button', { name: `Vote ${card}`, exact: true }).click();
    others.push(page);
  }

  // Below the rail's width the title field is behind "More".
  const narrow = viewport.width < 1024;
  if (narrow) await mo.getByRole('button', { name: 'More' }).click();
  await mo.getByLabel('Story title').fill('PROJ-214 Let people reset their own passcode');
  await mo.getByRole('button', { name: 'Set title' }).click();
  if (narrow) await mo.getByRole('button', { name: 'Close' }).click();
  await mo.getByRole('button', { name: 'Vote 3', exact: true }).click();
  await mo.waitForTimeout(400);
  await fullPage(mo, `${out}/${name}-voting.png`);
  // The dock is fixed to the viewport, so a viewport shot shows where it really sits.
  await viewportShot(mo, `${out}/${name}-voting-view.png`);

  await mo.getByRole('button', { name: 'Reveal' }).click();
  await mo.getByTestId('countdown').waitFor();
  await viewportShot(mo, `${out}/${name}-count.png`);
  await mo.getByTestId('result').waitFor({ timeout: 8000 });
  await mo.waitForTimeout(500);
  await fullPage(mo, `${out}/${name}-revealed.png`);
  await viewportShot(mo, `${out}/${name}-revealed-view.png`);
  for (const page of others) await page.context().close();
  await moContext.close();
}

await scene('desktop-light', { width: 1440, height: 900 }, 'light');
await scene('desktop-dark', { width: 1440, height: 900 }, 'dark');
await scene('mobile-light', { width: 390, height: 844 }, 'light');
await scene('mobile-dark', { width: 390, height: 844 }, 'dark');
await browser.close();
console.log('captured');
