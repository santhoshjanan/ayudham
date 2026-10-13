import { expect, test } from '@playwright/test';

let visitors = 0;
const visitor = () => {
  visitors += 1;
  return {
    extraHTTPHeaders: { 'x-forwarded-for': `10.${visitors >> 8}.${visitors & 255}.${4}` },
  };
};

test('every public page ends with links to the source and to its maker', async ({ browser }) => {
  const page = await (await browser.newContext(visitor())).newPage();
  for (const path of ['/', '/poker', '/privacy']) {
    await page.goto(path);
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/santhoshjanan/pokerji',
    );
    await expect(footer.getByRole('link', { name: 'santhoshj.com' })).toHaveAttribute(
      'href',
      'https://santhoshj.com',
    );
    await expect(footer.getByRole('link', { name: 'phostrich.com' })).toHaveAttribute(
      'href',
      'https://phostrich.com',
    );
    for (const link of await footer.getByRole('link').all()) {
      if ((await link.getAttribute('href'))?.startsWith('http')) {
        await expect(link).toHaveAttribute('rel', /noopener/);
      }
    }
  }
});

test('the live room has no footer under the hand', async ({ browser }) => {
  const page = await (await browser.newContext(visitor())).newPage();
  await page.goto('/poker');
  await page.getByLabel('Your name').fill('Mo');
  await page.getByRole('button', { name: 'Create room' }).click();
  await page.getByRole('link', { name: 'Open the room' }).click();
  await expect(page.getByTestId('participants')).toContainText('Mo');
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
});

test('public pages describe themselves to search engines and link previews', async ({
  browser,
}) => {
  const page = await (await browser.newContext(visitor())).newPage();
  const origin = new URL((await page.goto('/'))!.url()).origin;
  const seen = new Set<string>();
  for (const path of ['/', '/poker', '/privacy']) {
    const response = await page.goto(path);
    expect(response?.headers()['x-robots-tag'], `${path} may be indexed`).toBeUndefined();
    const title = await page.title();
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(title.length).toBeGreaterThan(15);
    expect(description?.length).toBeGreaterThan(50);
    expect(description?.length).toBeLessThanOrEqual(160);
    // Each page has its own title and description.
    expect(seen.has(title) || seen.has(description ?? '')).toBe(false);
    seen.add(title).add(description ?? '');
    const canonical = `${origin}${path === '/' ? '/' : path}`;
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
      'content',
      description ?? '',
    );
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      'content',
      'pokerji',
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  }
});

test('rooms are kept out of search engines, by header and by robots.txt', async ({ browser }) => {
  const context = await browser.newContext(visitor());
  const room = await context.request.get('/poker/r/AAAAAAAAAAAA');
  expect(room.headers()['x-robots-tag']).toContain('noindex');

  const robots = await context.request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(robots.headers()['content-type']).toContain('text/plain');
  const text = await robots.text();
  expect(text).toContain('Disallow: /poker/r/');
  expect(text).not.toMatch(/^Disallow: \/$/m);
  const origin = new URL(robots.url()).origin;
  expect(text).toContain(`Sitemap: ${origin}/sitemap.xml`);

  const sitemap = await context.request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()['content-type']).toContain('xml');
  const xml = await sitemap.text();
  for (const path of ['/', '/poker', '/privacy'])
    expect(xml).toContain(`<loc>${origin}${path}</loc>`);
  expect(xml).not.toContain('/poker/r/');
});

test('the site has an icon', async ({ browser }) => {
  const context = await browser.newContext(visitor());
  const page = await context.newPage();
  await page.goto('/');
  const href = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(href).toBeTruthy();
  const icon = await context.request.get(href as string);
  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type']).toContain('image/svg+xml');
});
