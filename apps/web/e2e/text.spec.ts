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

test('options change what is made, and several can be made and copied at once', async ({
  browser,
}) => {
  const page = await open(browser);
  for (const off of ['Lowercase', 'Uppercase', 'Symbols']) {
    await page.getByRole('button', { name: off, exact: true }).click();
  }
  await page.getByLabel('Length', { exact: true }).fill('8');
  await page.getByLabel('How many', { exact: true }).fill('5');
  await expect(results(page)).toHaveCount(5);
  const made = await values(page);
  for (const value of made) expect(value).toMatch(/^[0-9]{8}$/);
  await expect(rail(page)).toContainText('26 bits');

  await page.getByRole('button', { name: 'Copy all' }).click();
  expect(await clipboard(page)).toBe(made.join('\n'));

  await page.getByRole('button', { name: 'No look-alikes' }).click();
  await expect(page.getByRole('button', { name: 'No look-alikes' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const value of await values(page)) expect(value).toMatch(/^[2-9]{8}$/);
});

test('a number field left empty or out of range names the limit and keeps the last results', async ({
  browser,
}) => {
  const page = await open(browser);
  const [before] = await values(page);
  for (const typed of ['', '7', '257', '12.5']) {
    await page.getByLabel('Length', { exact: true }).fill(typed);
    await expect(status(page)).toContainText('Length must be 8 to 256');
    expect(await values(page)).toEqual([before]);
  }
  await page.getByLabel('Length', { exact: true }).fill('12');
  await expect(status(page)).toHaveCount(0);
  expect((await values(page))[0]).toHaveLength(12);

  for (const off of ['Lowercase', 'Uppercase', 'Digits', 'Symbols']) {
    await page.getByRole('button', { name: off, exact: true }).click();
  }
  await expect(status(page)).toContainText('Choose at least one kind of character');
});

test('the word list is fetched once, and only when the passphrase tool is opened', async ({
  browser,
}) => {
  const page = await open(browser);
  const fetched: string[] = [];
  page.on('request', (request) => fetched.push(new URL(request.url()).pathname));
  await page.getByRole('button', { name: 'Generate again' }).click();
  await page.getByRole('link', { name: 'Random string' }).click();
  await expect(results(page)).toHaveCount(1);
  expect(fetched).toEqual([]);

  await page.getByRole('link', { name: 'Passphrase' }).click();
  await expect(results(page)).toHaveCount(1);
  const [phrase = ''] = await values(page);
  expect(phrase.split('-')).toHaveLength(6);
  expect(phrase).toMatch(/^[a-z]+(-[a-z]+)+$/);
  await expect(rail(page)).toContainText('77 bits');

  await page.getByRole('button', { name: 'Capitals' }).click();
  await page.getByRole('button', { name: 'Add a digit' }).click();
  await page.getByLabel('Separator').selectOption({ label: 'Full stop' });
  await page.getByLabel('Words', { exact: true }).fill('4');
  const [changed = ''] = await values(page);
  expect(changed.split('.')).toHaveLength(4);
  expect(changed).toMatch(/[0-9]/);
  expect(changed).toMatch(/^[A-Z]/);

  await page.getByRole('link', { name: 'Password' }).click();
  await page.getByRole('link', { name: 'Passphrase' }).click();
  await expect(results(page)).toHaveCount(1);
  expect(fetched).toEqual(['/text/eff_large_wordlist.txt']);
});

test('a word list that does not arrive, or arrives changed, is refused and can be retried', async ({
  browser,
}) => {
  const page = await open(browser);
  let mode: 'missing' | 'changed' | 'real' = 'missing';
  await page.route('**/text/eff_large_wordlist.txt', async (route) => {
    if (mode === 'missing') return route.abort();
    if (mode === 'real') return route.continue();
    const real = await route.fetch();
    return route.fulfill({ response: real, body: (await real.text()).replace('abacus', 'abacas') });
  });

  await page.getByRole('link', { name: 'Passphrase' }).click();
  await expect(status(page)).toContainText('word list could not be loaded');
  await expect(results(page)).toHaveCount(0);

  mode = 'changed';
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(status(page)).toContainText('word list could not be loaded');
  await expect(results(page)).toHaveCount(0);

  // The other tools are unaffected.
  await page.getByRole('link', { name: 'Password' }).click();
  await expect(results(page)).toHaveCount(1);

  mode = 'real';
  await page.getByRole('link', { name: 'Passphrase' }).click();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(results(page)).toHaveCount(1);
  await expect(status(page)).toHaveCount(0);
});

test('random strings come in every kind', async ({ browser }) => {
  const page = await open(browser, '#random');
  const kind = page.getByLabel('Kind', { exact: true });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[0-9a-f]{32}$/);
  await expect(rail(page)).toContainText('128 bits');

  await kind.selectOption({ label: 'Base64' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  await kind.selectOption({ label: 'Base64URL' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await kind.selectOption({ label: 'Digits' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[0-9]{16}$/);
  await kind.selectOption({ label: 'Letters' });
  await page.getByLabel('Letters', { exact: true }).selectOption({ label: 'Lowercase' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[a-z]{16}$/);
  await kind.selectOption({ label: 'Letters and digits' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[A-Za-z0-9]{24}$/);

  await kind.selectOption({ label: 'Your own characters' });
  await expect(status(page)).toContainText('between 2 and 256 characters');
  await page.getByLabel('Characters to use').fill('xy');
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[xy]{16}$/);
  await page.getByLabel('Characters to use').fill('xx');
  await expect(status(page)).toContainText('same character twice');
});

test('PINs, numbers, identifiers and chance all give results', async ({ browser }) => {
  const page = await open(browser, '#number');
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[0-9]{6}$/);
  await page.getByLabel('Make', { exact: true }).selectOption({ label: 'A number in a range' });
  await page.getByLabel('From', { exact: true }).fill('10');
  await page.getByLabel('To', { exact: true }).fill('12');
  await expect.poll(async () => (await values(page))[0]).toMatch(/^1[0-2]$/);

  await page.getByRole('link', { name: 'Identifier' }).click();
  const kind = page.getByLabel('Kind', { exact: true });
  await expect
    .poll(async () => (await values(page))[0])
    .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await expect(rail(page)).not.toContainText('contains the time');
  await kind.selectOption({ label: 'UUID version 7' });
  await expect
    .poll(async () => (await values(page))[0])
    .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await expect(rail(page)).toContainText('contains the time');
  await kind.selectOption({ label: 'ULID' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  await kind.selectOption({ label: 'Short id' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^[A-Za-z0-9_-]{21}$/);

  await page.getByRole('link', { name: 'Chance' }).click();
  await page.getByLabel('Dice', { exact: true }).fill('3');
  await expect(results(page)).toHaveCount(4);
  const rolled = await values(page);
  expect(rolled.slice(0, 3).every((roll) => /^[1-6]$/.test(roll))).toBe(true);
  expect(Number(rolled[3])).toBe(rolled.slice(0, 3).reduce((sum, roll) => sum + Number(roll), 0));

  await page.getByLabel('Use', { exact: true }).selectOption({ label: 'A coin' });
  await expect.poll(async () => (await values(page))[0]).toMatch(/^(Heads|Tails)$/);

  await page.getByLabel('Use', { exact: true }).selectOption({ label: 'A list of your own' });
  await expect(status(page)).toContainText('Type at least one line');
  await page.getByLabel('List', { exact: true }).fill('Ann\nBo\nCy\n');
  await page.getByLabel('How many to pick').fill('2');
  await expect(results(page)).toHaveCount(2);
  const picked = await values(page);
  expect(new Set(picked).size).toBe(2);
  expect(picked.every((name) => ['Ann', 'Bo', 'Cy'].includes(name))).toBe(true);
});

const text = (page: Page) => page.getByLabel('Text', { exact: true });
const named = (page: Page, name: string) =>
  results(page)
    .filter({ has: page.locator('.name', { hasText: new RegExp(`^${name}$`) }) })
    .locator('.value');

test('a link straight to a tool opens it, and Back returns to the tool before', async ({
  browser,
}) => {
  const page = await open(browser, '#hash');
  await expect(page.getByRole('heading', { level: 2, name: 'Hash', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Hash' })).toHaveAttribute('aria-current', 'true');

  await page.getByRole('link', { name: 'Slug' }).click();
  await expect(page).toHaveURL(/\/text#slug$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Slug', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 2, name: 'Hash', exact: true })).toBeVisible();

  const stranger = await open(browser, '#<img src=x onerror=alert(1)>');
  await expect(
    stranger.getByRole('heading', { level: 2, name: 'Password', exact: true }),
  ).toBeVisible();
});

test('case shows every form at once, each with its own copy', async ({ browser }) => {
  const page = await open(browser, '#case');
  await expect(rail(page)).toContainText('appear here');
  await expect(rail(page).getByRole('button', { name: 'Copy', exact: true })).toBeDisabled();

  await text(page).fill('parseHTTPResponse2 now');
  await expect(results(page)).toHaveCount(12);
  await expect(named(page, 'camelCase')).toHaveText('parseHttpResponse2Now');
  await expect(named(page, 'PascalCase')).toHaveText('ParseHttpResponse2Now');
  await expect(named(page, 'snake_case')).toHaveText('parse_http_response_2_now');
  await expect(named(page, 'CONSTANT_CASE')).toHaveText('PARSE_HTTP_RESPONSE_2_NOW');
  await expect(named(page, 'kebab-case')).toHaveText('parse-http-response-2-now');
  await expect(named(page, 'Train-Case')).toHaveText('Parse-Http-Response-2-Now');
  await expect(named(page, 'dot.case')).toHaveText('parse.http.response.2.now');
  await expect(named(page, 'path/case')).toHaveText('parse/http/response/2/now');

  await text(page).fill("the return of the iPhone: a buyer's guide");
  await expect(named(page, 'Title Case')).toHaveText("The Return of the iPhone: A Buyer's Guide");
  await expect(named(page, 'Sentence case')).toHaveText(
    "The return of the iPhone: a buyer's guide",
  );
  await expect(named(page, 'UPPER CASE')).toHaveText("THE RETURN OF THE IPHONE: A BUYER'S GUIDE");
  await expect(named(page, 'lower case')).toHaveText("the return of the iphone: a buyer's guide");

  await page.getByRole('button', { name: 'Copy Title Case' }).click();
  expect(await clipboard(page)).toBe("The Return of the iPhone: A Buyer's Guide");
  await page.getByRole('button', { name: 'Copy all' }).click();
  expect(await clipboard(page)).toContain("Title Case: The Return of the iPhone: A Buyer's Guide");
});

test('slug makes an address-safe name, line by line', async ({ browser }) => {
  const page = await open(browser, '#slug');
  await text(page).fill('Crème Brûlée, the Recipe!\nStraße 2');
  await expect(results(page)).toHaveCount(1);
  expect(await values(page)).toEqual(['creme-brulee-the-recipe\nstrasse-2']);
  await page.getByRole('button', { name: 'Copy', exact: true }).first().click();
  expect(await clipboard(page)).toBe('creme-brulee-the-recipe\nstrasse-2');

  await text(page).fill('日本語');
  await expect(rail(page)).toContainText('come out empty');
});

test('encoding and decoding go both ways and say what is wrong', async ({ browser }) => {
  const page = await open(browser, '#encode');
  const form = page.getByLabel('Form', { exact: true });
  await text(page).fill('a b&c/é');
  await expect.poll(() => values(page)).toEqual(['YSBiJmMvw6k=']);
  await form.selectOption({ label: 'Base64URL' });
  await expect.poll(() => values(page)).toEqual(['YSBiJmMvw6k']);
  await form.selectOption({ label: 'Hex' });
  await expect.poll(() => values(page)).toEqual(['61206226632fc3a9']);
  await form.selectOption({ label: 'URL' });
  await expect.poll(() => values(page)).toEqual(['a%20b%26c%2F%C3%A9']);
  await form.selectOption({ label: 'HTML entities' });
  await text(page).fill('<b>Tom & Jerry</b>');
  await expect.poll(() => values(page)).toEqual(['&lt;b&gt;Tom &amp; Jerry&lt;/b&gt;']);

  await page.getByRole('button', { name: 'Decode', exact: true }).click();
  await text(page).fill('&lt;b&gt;Tom &amp; Jerry&lt;/b&gt; &copy;');
  await expect.poll(() => values(page)).toEqual(['<b>Tom & Jerry</b> ©']);
  // What was decoded is shown as text, never as markup.
  await expect(rail(page).locator('b', { hasText: 'Tom' })).toHaveCount(0);

  await form.selectOption({ label: 'Base64' });
  await text(page).fill('YSBiJmMvw6k=');
  await expect.poll(() => values(page)).toEqual(['a b&c/é']);
  await text(page).fill('not base64!');
  await expect(status(page)).toContainText('That is not Base64');
  await expect(results(page)).toHaveCount(0);

  await text(page).fill('/w==');
  await expect.poll(() => values(page)).toEqual(['ff']);
  await expect(rail(page)).toContainText('not text');

  await form.selectOption({ label: 'Hex' });
  await text(page).fill('6');
  await expect(status(page)).toContainText('odd number of digits');
  await form.selectOption({ label: 'URL' });
  await text(page).fill('100%');
  await expect(status(page)).toContainText('not followed by two hex digits');
});

test('hash gives the three SHA-2 sums of the text exactly as typed', async ({ browser }) => {
  const page = await open(browser, '#hash');
  await expect(rail(page)).toContainText('appear here');
  await text(page).fill('abc');
  await expect(results(page)).toHaveCount(3);
  await expect(named(page, 'SHA-256')).toHaveText(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  await expect(named(page, 'SHA-384')).toHaveText(
    'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
  );
  await expect(named(page, 'SHA-512')).toHaveText(
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
  );
  await text(page).fill('abc\n');
  await expect(named(page, 'SHA-256')).toHaveText(
    'edeaaff3f1774ad2888673770c6d64097e391bc362d7d6fb34982ddf0efd18cb',
  );
  await expect(rail(page)).toContainText('not a way to store passwords');
  await text(page).fill('');
  await expect(results(page)).toHaveCount(0);
});

test('lines are tidied in a fixed order, and counts are stated', async ({ browser }) => {
  const page = await open(browser, '#lines');
  await text(page).fill('pear\napple\n\npear\nApple\n');
  await expect.poll(() => values(page)).toEqual(['pear\napple\n\npear\nApple']);
  await page.getByRole('button', { name: 'Remove blank lines' }).click();
  await page.getByRole('button', { name: 'Remove repeats' }).click();
  await expect.poll(() => values(page)).toEqual(['pear\napple\nApple']);
  await page.getByRole('button', { name: 'Ignore case' }).click();
  await expect.poll(() => values(page)).toEqual(['pear\napple']);
  await page.getByLabel('Order', { exact: true }).selectOption({ label: 'A to Z' });
  await page.getByRole('button', { name: 'Number the lines' }).click();
  await expect.poll(() => values(page)).toEqual(['1. apple\n2. pear']);
  await page.getByRole('button', { name: 'Copy', exact: true }).first().click();
  expect(await clipboard(page)).toBe('1. apple\n2. pear');

  await page.getByLabel('Order', { exact: true }).selectOption({ label: 'Shuffled' });
  await expect(page.getByRole('button', { name: 'Shuffle again' })).toBeVisible();
  const [shuffled = ''] = await values(page);
  expect(
    shuffled
      .split('\n')
      .map((line) => line.replace(/^\d+\. /, ''))
      .sort(),
  ).toEqual(['apple', 'pear']);

  await page.getByRole('link', { name: 'Count' }).click();
  await text(page).fill('Hello, wide world\n👨‍👩‍👧');
  await expect(named(page, 'Characters')).toHaveText('19');
  await expect(named(page, 'Without white space')).toHaveText('16');
  await expect(named(page, 'Words')).toHaveText('4');
  await expect(named(page, 'Lines')).toHaveText('2');
  await expect(named(page, 'Bytes')).toHaveText('36');
  // A count is not something to copy alone; Copy all takes them together.
  await expect(results(page).getByRole('button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy all' }).click();
  expect(await clipboard(page)).toContain('Words: 4');
});

const TOOL_IDS = [
  'password',
  'passphrase',
  'random',
  'number',
  'id',
  'chance',
  'case',
  'slug',
  'encode',
  'hash',
  'lines',
  'count',
];

test('a failed random source clears old results and converters still work', async ({ browser }) => {
  const page = await open(browser);
  await expect(results(page)).toHaveCount(1);
  await page.evaluate(() => {
    crypto.getRandomValues = () => {
      throw new Error('unavailable');
    };
  });
  await page.getByRole('button', { name: 'Generate again' }).click();
  await expect(status(page)).toContainText('nothing was generated');
  await expect(results(page)).toHaveCount(0);
  await page.getByRole('link', { name: 'Slug', exact: true }).click();
  await text(page).fill('Still works');
  await expect.poll(() => values(page)).toEqual(['still-works']);
});

test('a refused hash clears old sums, reports the failure and can recover', async ({ browser }) => {
  const page = await open(browser, '#hash');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await text(page).fill('abc');
  await expect(results(page)).toHaveCount(3);
  await page.evaluate(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = (...args) =>
      args[0] === 'SHA-384' ? Promise.reject(new Error('unavailable')) : digest(...args);
  });
  await text(page).fill('different');
  await expect(status(page)).toContainText('cannot make hashes');
  await expect(results(page)).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.reload();
  await page.locator('[data-ready]').waitFor();
  await text(page).fill('abc');
  await expect(results(page)).toHaveCount(3);
});
const TYPED = ['case', 'slug', 'encode', 'hash', 'lines', 'count'];

/** Opens every tool in turn, types the secret where there is a box, and gathers every result. */
const useEveryTool = async (page: Page, secret: string): Promise<string[]> => {
  const seen: string[] = [];
  for (const id of TOOL_IDS) {
    await page.goto(`/text#${id}`);
    await expect(page.locator(`a[href="#${id}"]`)).toHaveAttribute('aria-current', 'true');
    if (TYPED.includes(id)) await text(page).fill(secret);
    await expect(results(page).first()).toBeVisible();
    if (!TYPED.includes(id)) await page.getByRole('button', { name: 'Generate again' }).click();
    seen.push(...(await values(page)));
    await rail(page).getByRole('button', { name: /^Copy/ }).first().click();
  }
  return seen;
};

test('nothing typed or made is sent anywhere, and the only fetch is the word list', async ({
  browser,
}) => {
  const page = await open(browser);
  const sent: string[] = [];
  page.on('request', (request) =>
    sent.push(
      `${request.method()} ${request.url()} ${JSON.stringify(request.headers())} ${request.postData() ?? ''}`,
    ),
  );
  const secret = 'zebra-quartz-7731';
  const made = await useEveryTool(page, secret);
  await page.waitForTimeout(500);

  expect(made.length).toBeGreaterThanOrEqual(12);
  // Short values (a die, a coin, a PIN) could match ordinary request text by chance.
  const telling = made.filter((value) => value.length >= 8);
  expect(telling.length).toBeGreaterThanOrEqual(8);
  for (const line of sent) {
    expect(line).not.toContain(secret);
    expect(line).not.toContain(encodeURIComponent(secret));
    for (const value of telling) expect(line, value).not.toContain(value);
  }
  expect(sent.map((line) => new URL(line.split(' ')[1] ?? '').pathname)).toEqual([
    '/text/eff_large_wordlist.txt',
  ]);
});

test('nothing is kept: no storage entry, no cookie, nothing in the address but the tool', async ({
  browser,
}) => {
  const page = await open(browser);
  const kept = () =>
    page.evaluate(() => ({
      local: Object.keys(localStorage).sort(),
      session: Object.keys(sessionStorage).sort(),
      cookie: document.cookie,
    }));
  const before = await kept();
  await useEveryTool(page, 'zebra-quartz-7731');
  expect(await kept()).toEqual(before);
  expect(new URL(page.url()).search).toBe('');
  expect(new URL(page.url()).pathname).toBe('/text');
  expect(new URL(page.url()).hash).toBe('#count');

  // A reload starts again from nothing.
  await page.reload();
  await page.locator('[data-ready]').waitFor();
  await expect(text(page)).toHaveValue('');
});

test('the text tools never break the content security policy', async ({ browser }) => {
  const page = await open(browser);
  const refused: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) refused.push(message.text());
  });
  page.on('pageerror', (error) => refused.push(error.message));
  await useEveryTool(page, 'zebra-quartz-7731');
  expect(refused).toEqual([]);
});

test('no field hands what is typed to a spelling service or a saved-form store', async ({
  browser,
}) => {
  const page = await open(browser);
  for (const id of [...TYPED, 'chance', 'random']) {
    await page.goto(`/text#${id}`);
    await expect(page.locator(`a[href="#${id}"]`)).toHaveAttribute('aria-current', 'true');
    if (id === 'chance') {
      await page.getByLabel('Use', { exact: true }).selectOption({ label: 'A list of your own' });
    }
    if (id === 'random') {
      await page.getByLabel('Kind', { exact: true }).selectOption({ label: 'Your own characters' });
    }
    const boxes = page.locator('main textarea, main input[type="text"]');
    expect(await boxes.count(), id).toBeGreaterThan(0);
    for (const box of await boxes.all()) {
      await expect(box).toHaveAttribute('spellcheck', 'false');
      await expect(box).toHaveAttribute('autocomplete', 'off');
      await expect(box).toHaveAttribute('autocapitalize', 'off');
      await expect(box).toHaveAttribute('autocorrect', 'off');
    }
  }
  for (const number of await page.locator('main input[type="number"]').all()) {
    await expect(number).toHaveAttribute('autocomplete', 'off');
  }
});

test('on a phone the results follow the options and nothing scrolls sideways', async ({
  browser,
}) => {
  const page = await open(browser, '', NARROW);
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth);
  const top = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())?.y ?? 0;
  expect(await top(rail(page))).toBeGreaterThan(
    await top(page.getByLabel('Length', { exact: true })),
  );

  await page.getByLabel('Length', { exact: true }).fill('256');
  await page.getByLabel('How many', { exact: true }).fill('100');
  await expect(results(page)).toHaveCount(100);
  expect(await wide()).toBeLessThanOrEqual(NARROW.width);

  await page.goto('/text#encode');
  await text(page).fill('x'.repeat(100_000));
  await expect(results(page)).toHaveCount(1);
  expect(await wide()).toBeLessThanOrEqual(NARROW.width);
});

test('every tool meets WCAG 2.2 AA in both themes, and no result is red', async ({ browser }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({ ...visitor(), viewport: WIDE, colorScheme });
    const page = await context.newPage();
    for (const id of TOOL_IDS) {
      await page.goto(`/text#${id}`);
      await page.locator('[data-ready]').waitFor();
      await expect(page.locator(`a[href="#${id}"]`)).toHaveAttribute('aria-current', 'true');
      if (TYPED.includes(id)) await text(page).fill('Hello, wide world');
      await expect(results(page).first()).toBeVisible();
      expect((await scan(page)).violations, `${id} in ${colorScheme}`).toEqual([]);
      await expect(page.locator('main .danger, main [role="alert"]')).toHaveCount(0);
    }
    await context.close();
  }
});

test('a tool can be reached and used with the keyboard alone', async ({ browser }) => {
  const page = await open(browser);
  await page.getByRole('link', { name: 'Password', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Passphrase' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Passphrase', exact: true }),
  ).toBeVisible();
  // Choosing a tool leaves focus on its link, so the next press steps on.
  await expect(page.getByRole('link', { name: 'Passphrase' })).toBeFocused();
  await expect(results(page)).toHaveCount(1);
  const [first] = await values(page);
  await page.getByRole('button', { name: 'Generate again' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await values(page))[0]).not.toBe(first);
});

test('the next step stays visible while a long desktop results rail scrolls', async ({
  browser,
}) => {
  const page = await open(browser);
  await page.getByLabel('How many', { exact: true }).fill('100');
  await page.getByLabel('Length', { exact: true }).fill('64');
  await expect(results(page)).toHaveCount(100);
  await rail(page).scrollIntoViewIfNeeded();
  await rail(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(async () => {
      const frame = await rail(page).boundingBox();
      const button = await page.getByRole('button', { name: 'Generate again' }).boundingBox();
      return (
        !!frame &&
        !!button &&
        button.y >= frame.y &&
        button.y + button.height <= frame.y + frame.height
      );
    })
    .toBe(true);
});
