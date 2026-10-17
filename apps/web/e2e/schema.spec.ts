import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';

let visitors = 0;
const visitor = () => {
  visitors += 1;
  return {
    extraHTTPHeaders: { 'x-forwarded-for': `10.7.${visitors >> 8}.${visitors & 255}` },
  };
};

const WIDE = { width: 1280, height: 900 };

/** A page on the builder, hydrated, with the clipboard allowed. */
const open = async (browser: Browser, viewport = WIDE): Promise<Page> => {
  const context = await browser.newContext({
    ...visitor(),
    viewport,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  await page.goto('/schema');
  await page.locator('[data-ready]').waitFor();
  return page;
};

const markup = (page: Page) => page.getByLabel('The markup', { exact: true });
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('ay-schema-draft'));
const rawJson = async (page: Page) => {
  await page.getByRole('button', { name: 'Raw JSON' }).click();
  return JSON.parse((await markup(page).textContent()) ?? '');
};

test('a guided item becomes markup that can be copied in both forms', async ({ browser }) => {
  const page = await open(browser);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schema markup builder');
  await expect(page.getByText('The markup appears here')).toBeVisible();

  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await page.getByLabel('Site name', { exact: true }).fill('Acme');
  await page.getByLabel('Home page', { exact: true }).fill('https://acme.example/');

  await page.getByRole('button', { name: 'Copy markup' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  const tag = await clipboard(page);
  expect(tag.startsWith('<script type="application/ld+json">\n{')).toBe(true);
  expect(tag.endsWith('}\n</script>')).toBe(true);

  await page.getByRole('button', { name: 'Raw JSON' }).click();
  await page.getByRole('button', { name: 'Copy markup' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(JSON.parse(await clipboard(page))).toEqual({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Acme',
    url: 'https://acme.example/',
  });
});

test('typing a word into an empty field keeps the caret in the field', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  const name = page.getByLabel('Site name', { exact: true });
  await name.click();
  await page.keyboard.type('Acme Bakery');
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('Acme Bakery');
});

test('nested items, repeated values and a choice all reach the markup', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Kettle');
  await page.getByRole('button', { name: 'Add offer' }).click();
  await page.getByLabel('Price', { exact: true }).fill('19.99');
  await page.getByLabel('Currency', { exact: true }).fill('USD');
  await page.getByLabel('Availability', { exact: true }).selectOption({ label: 'In stock' });
  await page.getByRole('button', { name: 'Add another', exact: true }).click();
  await page
    .getByRole('group', { name: 'Offer' })
    .nth(1)
    .getByLabel('Price', { exact: true })
    .fill('24.5');

  expect(await rawJson(page)).toEqual({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Kettle',
    offers: [
      {
        '@type': 'Offer',
        price: 19.99,
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
      },
      { '@type': 'Offer', price: 24.5 },
    ],
  });

  await page.getByRole('button', { name: 'Move Offer 2 up' }).click();
  expect((await rawJson(page)).offers[0]).toEqual({ '@type': 'Offer', price: 24.5 });
  await page.getByRole('button', { name: 'Remove Offer 1' }).click();
  expect((await rawJson(page)).offers).toMatchObject({ price: 19.99 });
});

test('two items become one graph, and one can refer to the other', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Organization', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Acme');
  await page.getByRole('button', { name: 'Article', exact: true }).click();

  const article = page.getByTestId('item').nth(1);
  await article.getByLabel('Headline', { exact: true }).fill('How we bake');
  await article.getByText('More fields').click();
  await article
    .getByLabel('Kind of value for Publisher')
    .selectOption({ label: 'An item from this page' });
  await article
    .getByLabel('Publisher', { exact: true })
    .selectOption({ label: 'Organization: Acme' });

  expect(await rawJson(page)).toEqual({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': '#organization', name: 'Acme' },
      { '@type': 'Article', headline: 'How we bake', publisher: { '@id': '#organization' } },
    ],
  });

  await article.getByRole('button', { name: 'Move Article up' }).click();
  expect((await rawJson(page))['@graph'][0]['@type']).toBe('Article');
});

test('an article can be switched to a blog posting without losing its fields', async ({
  browser,
}) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Article', exact: true }).click();
  await page.getByLabel('Headline', { exact: true }).fill('How we bake');
  await page.getByLabel('Type', { exact: true }).selectOption('BlogPosting');
  expect(await rawJson(page)).toMatchObject({ '@type': 'BlogPosting', headline: 'How we bake' });
});

test('markup typed into a value is shown as text and cannot end the script element', async ({
  browser,
}) => {
  const page = await open(browser);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  const hostile = '</script><img src=x onerror=alert(1)><b>bold</b>';
  await page.getByLabel('Site name', { exact: true }).fill(hostile);

  await expect(markup(page).locator('img, b')).toHaveCount(0);
  await expect(markup(page)).toContainText('\\u003c/script>');
  await page.getByRole('button', { name: 'Copy markup' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  const tag = await clipboard(page);
  const inside = tag.slice('<script type="application/ld+json">'.length, -'</script>'.length);
  expect(inside).not.toContain('<');
  expect(JSON.parse(inside).name).toBe(hostile);
  expect(errors).toEqual([]);
});

test('the markup can be downloaded in both forms', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await page.getByLabel('Site name', { exact: true }).fill('Acme');

  const [html] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(html.suggestedFilename()).toBe('schema.html');
  expect(await readFile(await html.path(), 'utf8')).toContain(
    '<script type="application/ld+json">',
  );

  await page.getByRole('button', { name: 'Raw JSON' }).click();
  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(json.suggestedFilename()).toBe('schema.jsonld');
  expect(JSON.parse(await readFile(await json.path(), 'utf8'))).toMatchObject({ name: 'Acme' });
});

test('the draft survives a reload, and Clear removes it', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await page.getByLabel('Site name', { exact: true }).fill('Acme');
  await page.getByRole('button', { name: 'Raw JSON' }).click();
  await expect.poll(() => stored(page)).toContain('Acme');

  await page.reload();
  await page.locator('[data-ready]').waitFor();
  await expect(page.getByLabel('Site name', { exact: true })).toHaveValue('Acme');
  await expect(page.getByRole('button', { name: 'Raw JSON' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clear the whole draft?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Site name', { exact: true })).toHaveValue('Acme');

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, clear' }).click();
  await expect(page.getByRole('heading', { name: 'What are you describing?' })).toBeVisible();
  await expect.poll(() => stored(page)).toBeNull();
});

test('a stored draft that is broken gives an empty page, not an error', async ({ browser }) => {
  const page = await open(browser);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const broken of ['{not json', '{"version":99,"form":"script","draft":{"items":[]}}', '[]']) {
    await page.evaluate((value) => localStorage.setItem('ay-schema-draft', value), broken);
    await page.reload();
    await page.locator('[data-ready]').waitFor();
    await expect(page.getByRole('heading', { name: 'What are you describing?' })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('nothing typed into the builder is sent anywhere', async ({ browser }) => {
  const page = await open(browser);
  const sent: string[] = [];
  page.on('request', (request) => sent.push(`${request.url()} ${request.postData() ?? ''}`));
  const secret = 'zebra-quartz-7731';

  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Add offer' }).click();
  await page.getByLabel('Price', { exact: true }).fill('7731.77');
  await page.getByRole('button', { name: 'Copy markup' }).click();
  await page.getByRole('button', { name: 'Raw JSON' }).click();
  await expect.poll(() => stored(page)).toContain(secret);
  await page.waitForTimeout(500);

  expect(sent.filter((line) => line.includes(secret) || line.includes('7731.77'))).toEqual([]);
  expect(sent.some((line) => line.includes('/schema/vocabulary.json'))).toBe(false);
});

test('the builder never breaks the content security policy', async ({ browser }) => {
  const page = await open(browser);
  const refused: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) refused.push(message.text());
  });
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Kettle');
  await page.getByRole('button', { name: 'Add offer' }).click();
  await page.getByRole('button', { name: 'Copy markup' }).click();
  await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(refused).toEqual([]);
});

test('without JavaScript the page says what it is and that it needs JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ ...visitor(), javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/schema');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schema markup builder');
  // Playwright's text search skips noscript, so the element is found by its tag.
  await expect(page.locator('noscript p')).toBeVisible();
  await expect(page.locator('noscript p')).toContainText('The builder needs JavaScript');
  await expect(page.getByRole('button', { name: 'Local business' })).toBeVisible();
  await expect(page.getByText('never sent to this site')).toBeVisible();
});

const result = (page: Page, name: string) =>
  page.locator('.results button', { has: page.locator('b', { hasText: new RegExp(`^${name}$`) }) });

test('the vocabulary is fetched only when the escape hatch is opened', async ({ browser }) => {
  const page = await open(browser);
  const asked: string[] = [];
  page.on('request', (request) => asked.push(new URL(request.url()).pathname));

  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await page.getByLabel('Site name', { exact: true }).fill('Acme');
  expect(asked).not.toContain('/schema/vocabulary.json');

  await page.getByRole('button', { name: 'Another type' }).click();
  await page.getByLabel('Search Schema.org types').fill('movie');
  await result(page, 'Movie').click();
  expect(asked.filter((path) => path === '/schema/vocabulary.json')).toHaveLength(1);

  const movie = page.getByTestId('item').nth(1);
  await expect(movie).toContainText('There are no required or recommended rules for this type');
  await movie.getByRole('button', { name: 'Add another property' }).click();
  await movie.getByLabel('Search properties of Movie').fill('duration');
  await result(page, 'duration').click();
  await movie.getByLabel('duration', { exact: true }).fill('PT2H');

  await movie.getByRole('button', { name: 'Add another property' }).click();
  await movie.getByLabel('Search properties of Movie').fill('director');
  await result(page, 'director').click();
  // A nested item of a type with no guided form starts empty: its properties are added too.
  const person = movie.getByRole('group', { name: 'Person' });
  await person.getByRole('button', { name: 'Add another property' }).click();
  await person.getByLabel('Search properties of Person').fill('name');
  await result(page, 'name').click();
  await person.getByLabel('name', { exact: true }).fill('Ada');

  expect((await rawJson(page))['@graph'][1]).toEqual({
    '@type': 'Movie',
    duration: 'PT2H',
    director: { '@type': 'Person', name: 'Ada' },
  });
  expect(asked.filter((path) => path === '/schema/vocabulary.json')).toHaveLength(1);
});

test('a guided item can take a property from the vocabulary', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await page.getByRole('button', { name: 'Add another property' }).click();
  await page.getByLabel('Search properties of Website').fill('inLanguage');
  await expect(result(page, 'inLanguage')).toContainText('The language of the content');
  await result(page, 'inLanguage').click();
  await page.getByLabel('inLanguage', { exact: true }).fill('en');
  expect(await rawJson(page)).toMatchObject({ '@type': 'WebSite', inLanguage: 'en' });
});

test('when the vocabulary cannot be loaded the guided forms still work, and it can be retried', async ({
  browser,
}) => {
  const page = await open(browser);
  await page.route('**/schema/vocabulary.json', (route) => route.abort());
  await page.getByRole('button', { name: 'Another type' }).click();
  await expect(page.getByText('The Schema.org vocabulary could not be loaded')).toBeVisible();

  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await page.getByLabel('Site name', { exact: true }).fill('Acme');
  expect(await rawJson(page)).toMatchObject({ name: 'Acme' });

  await page.unroute('**/schema/vocabulary.json');
  await page.getByRole('button', { name: 'Try again' }).first().click();
  await expect(page.getByLabel('Search Schema.org types')).toBeVisible();
});

test('a restored draft with a type outside the ten fetches the vocabulary at once', async ({
  browser,
}) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Another type' }).click();
  await page.getByLabel('Search Schema.org types').fill('movie');
  await result(page, 'Movie').click();
  const movie = page.getByTestId('item').first();
  await movie.getByRole('button', { name: 'Add another property' }).click();
  await movie.getByLabel('Search properties of Movie').fill('duration');
  await result(page, 'duration').click();
  await movie.getByLabel('duration', { exact: true }).fill('PT2H');
  await expect.poll(() => stored(page)).toContain('PT2H');

  const asked: string[] = [];
  page.on('request', (request) => asked.push(new URL(request.url()).pathname));
  await page.reload();
  await page.locator('[data-ready]').waitFor();
  await expect(page.getByLabel('duration', { exact: true })).toHaveValue('PT2H');
  await expect.poll(() => asked).toContain('/schema/vocabulary.json');
  // Once it has loaded, the field carries the vocabulary's description.
  await expect(page.getByText('The duration of the item')).toBeVisible();
});

test('changing a type asks before it drops properties', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Kettle');
  await page.getByText('More fields').click();
  await page.getByLabel('SKU', { exact: true }).fill('K-1');

  const change = async (query: string, type: string) => {
    await page.getByRole('button', { name: 'Change type' }).click();
    await page.getByLabel('Search Schema.org types').fill(query);
    await result(page, type).click();
  };

  // A person has a name but no SKU.
  await change('person', 'Person');
  await expect(page.getByRole('heading', { name: 'Change the type to Person?' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('sku');
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await rawJson(page)).toMatchObject({ '@type': 'Product', sku: 'K-1' });

  await change('person', 'Person');
  await page.getByRole('button', { name: 'Yes, change' }).click();
  expect(await rawJson(page)).toEqual({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Kettle',
  });

  // An organization has a name too, so nothing is lost and nothing is asked.
  await change('organization', 'Organization');
  expect(await rawJson(page)).toEqual({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Kettle',
  });
});

const NARROW = { width: 390, height: 844 };
// WCAG 2.2 AA, the standard the design direction names.
const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
const findings = (page: Page) => page.getByRole('region', { name: 'What to check' });

test('findings say what is missing and take you to the field', async ({ browser }) => {
  const page = await open(browser);
  await expect(findings(page)).toContainText('Nothing to check yet');

  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await expect(findings(page)).toContainText('2 required');
  await expect(findings(page).getByRole('button', { name: /Name is required/ })).toBeVisible();
  await expect(
    findings(page).getByRole('button', {
      name: /Add at least one of: Offer, Average rating, Review/,
    }),
  ).toBeVisible();

  await findings(page)
    .getByRole('button', { name: /Name is required/ })
    .click();
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await page.keyboard.type('Kettle');
  await expect(findings(page).getByRole('button', { name: /Name is required/ })).toHaveCount(0);

  await findings(page)
    .getByRole('button', { name: /Add at least one of/ })
    .click();
  await expect(page.getByRole('button', { name: 'Add offer' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByLabel('Price', { exact: true }).fill('12,50');
  await expect(
    findings(page).getByRole('button', { name: /Price is not a plain number/ }),
  ).toContainText('Product: Kettle › Offer');
  await expect(findings(page).locator('.badge', { hasText: 'Check' })).toHaveCount(1);
});

test('a finding opens a closed item before it moves focus', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await page.getByTestId('item').locator('summary').click();
  await expect(page.getByLabel('Site name', { exact: true })).toBeHidden();
  await findings(page)
    .getByRole('button', { name: /Site name is required/ })
    .click();
  await expect(page.getByLabel('Site name', { exact: true })).toBeFocused();
});

test('findings are never told apart by colour alone, and never red', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  const rows = findings(page).getByRole('button');
  await expect(rows.first()).toContainText('Required');
  await expect(rows.last()).toContainText('Recommended');
  // No finding, and nothing inside one, is drawn in the colour kept for flags and deletion.
  const reds = await rows.evaluateAll((buttons) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--danger-text)';
    document.body.append(probe);
    const danger = getComputedStyle(probe).color;
    probe.remove();
    return buttons
      .flatMap((button) => [button, ...button.querySelectorAll('*')])
      .filter((node) => getComputedStyle(node).color === danger).length;
  });
  expect(reds).toBe(0);
});

test('on a narrow screen Copy is docked and the markup opens as a sheet', async ({ browser }) => {
  const page = await open(browser, NARROW);
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await page.getByLabel('Site name', { exact: true }).fill('Acme');

  const copy = page.getByRole('button', { name: 'Copy markup' });
  await expect(copy).toBeVisible();
  await expect(copy).toBeInViewport();
  await expect(markup(page)).toBeHidden();

  await page.getByRole('button', { name: 'Markup', exact: true }).click();
  await expect(markup(page)).toBeVisible();
  await expect(markup(page)).toContainText('"Acme"');
  await expect(findings(page)).toBeVisible();

  // A finding closes the sheet, which would otherwise cover the field it leads to.
  await findings(page)
    .getByRole('button', { name: /Home page is required/ })
    .click();
  await expect(markup(page)).toBeHidden();
  await expect(page.getByLabel('Home page', { exact: true })).toBeFocused();

  await page.getByRole('button', { name: 'Markup', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(markup(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Markup', exact: true })).toBeFocused();

  // The footer is still there, and can be scrolled clear of the dock.
  const footer = page.getByRole('contentinfo');
  await footer.scrollIntoViewIfNeeded();
  const dockTop = (await page.locator('.output').boundingBox())!.y;
  const footerBox = (await footer.boundingBox())!;
  expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(dockTop + 1);
  // The page itself never scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('on a wide screen there is no sheet button and the markup is always shown', async ({
  browser,
}) => {
  const page = await open(browser);
  await expect(page.getByRole('button', { name: 'Markup', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Website', exact: true }).click();
  await expect(markup(page)).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [name, viewport] of [
    ['wide', WIDE],
    ['narrow', NARROW],
  ] as const) {
    test(`the builder has no accessibility violations (${colorScheme}, ${name})`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ ...visitor(), viewport, colorScheme });
      const page = await context.newPage();
      await page.goto('/schema');
      await page.locator('[data-ready]').waitFor();
      expect((await scan(page)).violations).toEqual([]);

      await page.getByRole('button', { name: 'Product', exact: true }).click();
      await page.getByLabel('Name', { exact: true }).fill('Kettle');
      await page.getByRole('button', { name: 'Add offer' }).click();
      await page.getByLabel('Price', { exact: true }).fill('19.99');
      await page.getByRole('button', { name: 'Another type' }).click();
      await page.getByLabel('Search Schema.org types').waitFor();
      if (name === 'narrow')
        await page.getByRole('button', { name: 'Markup', exact: true }).click();
      expect((await scan(page)).violations).toEqual([]);
    });
  }
}

// ---- From the code review and the security audit ----

test('a finding about an empty nested item lands on that item', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Local business', exact: true }).click();
  await page.getByRole('button', { name: 'Add address' }).click();
  await findings(page)
    .getByRole('button', { name: /Address is required/ })
    .click();
  await expect(page.getByRole('group', { name: 'Postal address' })).toBeFocused();
});

test('a finding about a field under closed More fields opens them and lands on it', async ({
  browser,
}) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByText('More fields').click();
  await page.getByRole('button', { name: 'Add average rating' }).click();
  await page.getByLabel('Average rating', { exact: true }).fill('4');
  await expect(page.getByLabel('Number of ratings', { exact: true })).toBeHidden();
  await findings(page)
    .getByRole('button', { name: /Add at least one of: Number of ratings, Number of reviews/ })
    .click();
  await expect(page.getByLabel('Number of ratings', { exact: true })).toBeFocused();
});

test('a yes-or-no property can be set to no, and unset', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Article', exact: true }).click();
  await page.getByRole('button', { name: 'Add another property' }).click();
  await page.getByLabel('Search properties of Article').fill('isAccessibleForFree');
  await result(page, 'isAccessibleForFree').click();
  const free = page.getByLabel('isAccessibleForFree', { exact: true });
  await free.selectOption({ label: 'No' });
  expect(await rawJson(page)).toEqual({
    '@context': 'https://schema.org',
    '@type': 'Article',
    isAccessibleForFree: false,
  });
  await free.selectOption({ label: 'Yes' });
  expect(await rawJson(page)).toMatchObject({ isAccessibleForFree: true });
  await free.selectOption({ label: 'Not set' });
  expect(await rawJson(page)).toEqual({ '@context': 'https://schema.org', '@type': 'Article' });
});

test('a property that takes text or a listed value accepts typed text', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByRole('button', { name: 'Add another property' }).click();
  await page.getByLabel('Search properties of Product').fill('category');
  await result(page, 'category').click();
  await page.getByLabel('category', { exact: true }).fill('Apparel > Shoes');
  expect(await rawJson(page)).toMatchObject({ category: 'Apparel > Shoes' });
});

test('an item can be given its own identifier', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Organization', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Acme');
  await page.getByLabel('Identifier', { exact: true }).fill('https://acme.example/#org');
  expect(await rawJson(page)).toEqual({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': 'https://acme.example/#org',
    name: 'Acme',
  });
});

test('an empty builder tab does not delete a draft made in another tab', async ({ browser }) => {
  const context = await browser.newContext({ ...visitor(), viewport: WIDE });
  const ready = async () => {
    const page = await context.newPage();
    await page.goto('/schema');
    await page.locator('[data-ready]').waitFor();
    return page;
  };
  const idle = await ready();
  const working = await ready();
  await working.getByRole('button', { name: 'Website', exact: true }).click();
  await working.getByLabel('Site name', { exact: true }).fill('Acme');
  await expect.poll(() => stored(working)).toContain('Acme');
  await working.close();
  // The tab that never held a draft is left; it must not take the other's with it.
  await idle.goto('/privacy');
  const later = await ready();
  await expect(later.getByLabel('Site name', { exact: true })).toHaveValue('Acme');
});

test('fields do not hand what is typed to the browser’s spelling service', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Organization', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('spellcheck', 'false');
  await expect(page.getByLabel('Description', { exact: true })).toHaveAttribute(
    'spellcheck',
    'false',
  );
});

test('a stored draft the editor could never have made gives an empty page', async ({ browser }) => {
  const page = await open(browser);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const value = { kind: 'text', text: 'x' };
  const draft = (properties: unknown[]) =>
    JSON.stringify({
      version: 1,
      form: 'script',
      draft: { items: [{ key: 'a', type: 'Thing', id: '', properties }] },
    });
  for (const hostile of [
    draft([
      { name: 'x', values: [value] },
      { name: 'x', values: [value] },
    ]),
    draft([{ name: '@context', values: [{ kind: 'text', text: 'https://evil.example/' }] }]),
  ]) {
    await page.evaluate((text) => localStorage.setItem('ay-schema-draft', text), hostile);
    await page.reload();
    await page.locator('[data-ready]').waitFor();
    await expect(page.getByRole('heading', { name: 'What are you describing?' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schema markup builder');
  }
  expect(errors).toEqual([]);
});

test('a choice field keeps the column’s full width, as before the text tools', async ({
  browser,
}) => {
  const page = await open(browser);
  await page.getByRole('button', { name: 'Event', exact: true }).click();
  const status = page.getByLabel('Status', { exact: true });
  const name = page.getByLabel('Name', { exact: true });
  await expect(status).toBeVisible();
  const [statusBox, nameBox] = [await status.boundingBox(), await name.boundingBox()];
  expect(statusBox?.width).toBeCloseTo(nameBox?.width ?? 0, 0);
});
