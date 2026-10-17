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
  for (const path of ['/', '/poker', '/schema', '/text', '/codes', '/privacy']) {
    await page.goto(path);
    const footer = page.getByRole('contentinfo');
    await expect(footer).toContainText('Free and open source');
    await expect(footer).toContainText('Made in New Jersey with');
    // The heart is a drawing, so it is named for people who cannot see it.
    await expect(footer.getByRole('img', { name: 'love' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/santhoshjanan/ayudham',
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

test('no public page breaks the content security policy, from navigation on', async ({
  browser,
}) => {
  const context = await browser.newContext(visitor());
  await context.addInitScript(() => {
    const seen = window as unknown as { violations: string[] };
    seen.violations = [];
    document.addEventListener('securitypolicyviolation', (event) =>
      seen.violations.push(`${event.violatedDirective} ${event.blockedURI}`),
    );
  });
  const page = await context.newPage();
  const messages: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) messages.push(message.text());
  });
  for (const path of ['/', '/poker', '/schema', '/text', '/codes', '/privacy']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    const violations = await page.evaluate(
      () => (window as unknown as { violations: string[] }).violations,
    );
    expect(violations, path).toEqual([]);
  }
  expect(messages).toEqual([]);
});

test('the home page headline says what the site is, and its title names every tool', async ({
  browser,
}) => {
  const page = await (await browser.newContext(visitor())).newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Small tools, without the sign-up.',
  );
  for (const tool of [/planning poker/i, /schema markup/i, /text tools/i, /QR code/i]) {
    expect(await page.title()).toMatch(tool);
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
  for (const path of ['/', '/poker', '/schema', '/text', '/codes', '/privacy']) {
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
      'ayudham.app',
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    // A picture for link previews, by its full address, with its size and a description.
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      `${origin}/og.jpg`,
    );
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
      'content',
      '1200',
    );
    await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute(
      'content',
      '630',
    );
    expect(
      (await page.locator('meta[property="og:image:alt"]').getAttribute('content'))?.length,
    ).toBeGreaterThan(20);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
      'content',
      `${origin}/og.jpg`,
    );
  }
  const image = await page.request.get('/og.jpg');
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/jpeg');
  expect((await image.body()).length).toBeLessThan(300_000);
  {
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
  expect(text).not.toContain('Disallow: /schema');
  const origin = new URL(robots.url()).origin;
  expect(text).toContain(`Sitemap: ${origin}/sitemap.xml`);

  const sitemap = await context.request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()['content-type']).toContain('xml');
  const xml = await sitemap.text();
  for (const path of ['/', '/poker', '/schema', '/text', '/codes', '/privacy'])
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

test('the site offers every tool from the bar and from the home page', async ({ browser }) => {
  const page = await (await browser.newContext(visitor())).newPage();
  await page.goto('/');
  const bar = page.getByRole('navigation', { name: 'Site' });
  await expect(bar.getByRole('link', { name: 'Planning poker' })).toHaveAttribute('href', '/poker');
  await expect(bar.getByRole('link', { name: 'Schema markup' })).toHaveAttribute('href', '/schema');
  await expect(bar.getByRole('link', { name: 'Text tools' })).toHaveAttribute('href', '/text');
  await expect(bar.getByRole('link', { name: 'Codes' })).toHaveAttribute('href', '/codes');
  await expect(bar.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
  // Privacy stays last.
  await expect(bar.getByRole('link').last()).toHaveText('Privacy');

  await expect(page.getByRole('heading', { level: 2, name: 'Planning poker' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Schema markup builder' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Text tools' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Barcodes and QR codes' }),
  ).toBeVisible();
  // Each row of the programme carries its own next step.
  await expect(page.locator('.programme a.button')).toHaveCount(4);

  await page.getByRole('link', { name: 'Make a code' }).click();
  await expect(page).toHaveURL(/\/codes$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Barcodes and QR codes');
  await page.goto('/');

  await page.getByRole('link', { name: 'Open the tools' }).click();
  await expect(page).toHaveURL(/\/text$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Text tools');
  await bar.getByRole('link', { name: 'Schema markup' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schema markup builder');
});

test('on a phone the bar keeps the wordmark, Privacy and the theme toggle', async ({ browser }) => {
  const context = await browser.newContext({ ...visitor(), viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/');
  const bar = page.getByRole('navigation', { name: 'Site' });
  await expect(bar.getByRole('link', { name: 'Privacy' })).toBeVisible();
  await expect(bar.getByRole('link', { name: 'Planning poker' })).toBeHidden();
  await expect(bar.getByRole('link', { name: 'Schema markup' })).toBeHidden();
  await expect(bar.getByRole('link', { name: 'Text tools' })).toBeHidden();
  await expect(bar.getByRole('link', { name: 'Codes' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('the privacy page says what the builder does with what is typed', async ({ browser }) => {
  const page = await (await browser.newContext(visitor())).newPage();
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'The schema markup builder' })).toBeVisible();
  await expect(page.getByText('never sent to this site')).toBeVisible();
  await expect(page.getByText('ay-schema-draft')).toBeVisible();
});

test('the privacy page says the text tools send nothing and keep nothing', async ({ browser }) => {
  const page = await (await browser.newContext(visitor())).newPage();
  await page.goto('/privacy');
  const heading = page.getByRole('heading', { name: 'The text tools' });
  await expect(heading).toBeVisible();
  await expect(page.getByText('nothing is sent to this site and nothing is kept')).toBeVisible();
  await expect(page.getByText('EFF long word list')).toBeVisible();
});

test('the privacy page says a chosen logo is read on the device and nothing is kept', async ({
  browser,
}) => {
  const page = await (await browser.newContext(visitor())).newPage();
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Barcodes and QR codes' })).toBeVisible();
  await expect(
    page.getByText('A logo you choose is read on your device and never leaves it'),
  ).toBeVisible();
  await expect(page.getByText('Codes are encoded by bwip-js')).toContainText('fflate');
  // A browser's barcode reader is the device's own; the page must not call it the browser.
  await expect(page.getByText('your device’s own barcode reader')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('with it, inside the browser');
});

test('the text tools are a public page, and nothing beneath them is listed', async ({
  browser,
}) => {
  const context = await browser.newContext(visitor());
  const page = await context.request.get('/text');
  expect(page.status()).toBe(200);
  expect(page.headers()['x-robots-tag']).toBeUndefined();
  expect(page.headers()['set-cookie']).toBeUndefined();
  const list = await context.request.get('/text/eff_large_wordlist.txt');
  expect(list.status()).toBe(200);
  expect((await list.body()).length).toBe(108_800);
  expect((await context.request.get('/text/LICENSES.md')).status()).toBe(200);
});
