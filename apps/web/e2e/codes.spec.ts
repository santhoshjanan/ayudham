import { expect, test, type Browser, type Page } from '@playwright/test';
import { calendarEvent, email, meCard, phone, place, sms, vCard, wifi } from '@pokerji/code-maker';
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

/** A form control by its label (a section may carry the same name). */
const field = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).and(page.locator('input, textarea, select'));
const kindLink = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'QR code kinds' }).getByRole('link', { name, exact: true });
const rail = (page: Page) => page.getByRole('complementary', { name: 'Your code' });

const CARD = {
  given: 'Ada',
  family: 'Lovelace',
  organisation: 'Analytical Engines',
  phones: [{ number: '+44 20 7946 0000', kind: 'cell' as const }],
  emails: ['ada@example.com'],
  website: 'https://example.com/',
};

const fillCard = async (page: Page) => {
  await field(page, 'Given name').fill(CARD.given);
  await field(page, 'Family name').fill(CARD.family);
  await field(page, 'Organisation').fill(CARD.organisation);
  await field(page, 'Mobile phone').fill(CARD.phones[0]!.number);
  await field(page, 'Email').fill(CARD.emails[0]!);
  await field(page, 'Website').fill(CARD.website);
};

const unwrap = (made: { ok: true; value: string } | { ok: false }) => {
  if (!made.ok) throw new Error('the builder refused the test values');
  return made.value;
};

test('each QR kind makes a code that decodes to its payload', async ({ browser }) => {
  const page = await open(browser, '#qr-text');
  await field(page, 'Text').fill('Hello, world');
  await expectCode(page, 'Hello, world');

  await kindLink(page, 'Business card').click();
  await fillCard(page);
  await expectCode(page, unwrap(vCard(CARD)));
  await field(page, 'Format').selectOption('MECARD');
  await expectCode(page, unwrap(meCard(CARD)));

  await kindLink(page, 'Event').click();
  await field(page, 'Title').fill('Launch');
  await field(page, 'Starts').fill('2026-11-02T09:30');
  await field(page, 'Ends').fill('2026-11-02T10:30');
  await field(page, 'Place').fill('Hall 2; east');
  const offset = await page.evaluate(() => -new Date('2026-11-02T09:30').getTimezoneOffset());
  const event = {
    title: 'Launch',
    start: '2026-11-02T09:30',
    end: '2026-11-02T10:30',
    allDay: false,
    place: 'Hall 2; east',
  };
  await expectCode(page, unwrap(calendarEvent({ ...event, utcOffsetMinutes: offset })));
  await page.getByRole('button', { name: 'Convert to UTC' }).click();
  await expectCode(page, unwrap(calendarEvent({ ...event, utcOffsetMinutes: null })));

  await kindLink(page, 'Wi-Fi').click();
  await field(page, 'Network name').fill('Home; net');
  await field(page, 'Password').fill('p:ss "word"');
  await expectCode(
    page,
    unwrap(wifi({ ssid: 'Home; net', password: 'p:ss "word"', security: 'wpa', hidden: false })),
  );

  await kindLink(page, 'Location').click();
  await field(page, 'Latitude').fill('51.5');
  await field(page, 'Longitude').fill('-0.12');
  await expectCode(page, unwrap(place({ kind: 'coordinates', latitude: 51.5, longitude: -0.12 })));
  await page.getByRole('button', { name: 'An address', exact: true }).click();
  await field(page, 'Address').fill('10 Downing St, London');
  await field(page, 'Write as').selectOption('OpenStreetMap');
  await expectCode(
    page,
    unwrap(place({ kind: 'address', address: '10 Downing St, London', as: 'openstreetmap' })),
  );

  await kindLink(page, 'Email').click();
  await field(page, 'To').fill('ada@example.com');
  await field(page, 'Subject').fill('Hello & welcome');
  await field(page, 'Message').fill('Line one\nLine two');
  await expectCode(page, unwrap(email('ada@example.com', 'Hello & welcome', 'Line one\nLine two')));

  await kindLink(page, 'SMS').click();
  await field(page, 'Number').fill('+1 (555) 010-0000');
  await field(page, 'Message').fill('On my way');
  await expectCode(page, unwrap(sms('+1 (555) 010-0000', 'On my way')));

  await kindLink(page, 'Phone').click();
  await field(page, 'Number').fill('+1 555 010 0000');
  await expectCode(page, unwrap(phone('+1 555 010 0000')));
});

/** The sample each code is tested with, and what a reader gives back (as in the package's tests). */
const SAMPLES: Record<string, [string, string]> = {
  'micro-qr': ['HELLO 123', 'HELLO 123'],
  rmqr: ['HELLO 123', 'HELLO 123'],
  'data-matrix': ['Hello 123', 'Hello 123'],
  'data-matrix-rect': ['Hello', 'Hello'],
  aztec: ['Hello, world', 'Hello, world'],
  'aztec-compact': ['Hello', 'Hello'],
  'aztec-rune': ['42', '042'],
  pdf417: ['Hello, world', 'Hello, world'],
  'pdf417-compact': ['Hello', 'Hello'],
  'micro-pdf417': ['HELLO 123', 'HELLO 123'],
  maxicode: ['Hello, world', 'Hello, world'],
  'ean-13': ['590123412345', '5901234123457'],
  'ean-8': ['96385074', '96385074'],
  'upc-a': ['012345678905', '0012345678905'],
  'upc-e': ['01234565', '0012345000065'],
  isbn: ['978-1-56581-231-4', '9781565812314'],
  issn: ['0311-175X', '9770311175001'],
  'code-128': ['ABC-123', 'ABC-123'],
  'gs1-128': ['(01)09521234543213', '(01)09521234543213'],
  'code-39': ['CODE-39', 'CODE-39'],
  'code-39-ext': ['Code 39e', 'Code 39e'],
  'code-93': ['CODE 93', 'CODE 93'],
  itf: ['12345678', '12345678'],
  'itf-14': ['15400141288763', '15400141288763'],
  codabar: ['A40156B', 'A40156B'],
  'databar-omni': ['(01)24012345678905', '(01)24012345678905'],
  'databar-limited': ['(01)15012345678907', '(01)15012345678907'],
  'databar-expanded': ['(01)95012345678903(3103)000123', '(01)95012345678903(3103)000123'],
};

test('every other code is offered and decodes', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await open(browser);
  const offered = await page
    .getByLabel('Other codes')
    .locator('option:not([value=""])')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(offered.filter((id) => id !== 'dotcode').sort()).toEqual(Object.keys(SAMPLES).sort());
  for (const id of offered.filter((id) => id !== 'dotcode')) {
    await page.getByLabel('Other codes').selectOption(id);
    const [typed, read] = SAMPLES[id]!;
    await field(page, 'Text').fill(typed);
    await expect
      .poll(async () => (await readPreview(page))?.text, { message: id, timeout: 10_000 })
      .toBe(read);
  }

  await page.getByLabel('Other codes').selectOption('dotcode');
  await field(page, 'Text').fill('Hello');
  await expect(image(page)).toBeVisible();
  await expect(rail(page)).toContainText('no reader is available here to check it');
});

test('a refused character is named, and the last code stays marked as old', async ({ browser }) => {
  const page = await open(browser, '#code-39');
  await field(page, 'Text').fill('AB');
  await expectCode(page, 'AB', 'Code39');
  await field(page, 'Text').fill('ABé');
  await expect(rail(page).getByRole('status')).toContainText(
    'é at position 3 cannot be carried by Code 39',
  );
  await expect(image(page)).toHaveClass(/old/);
  await expect(rail(page)).toContainText('the last code that could be made');
});

test('too long says by how much', async ({ browser }) => {
  const page = await open(browser, '#qr-text');
  await field(page, 'Text').fill('a'.repeat(3000));
  await expect(rail(page).getByRole('status')).toContainText(
    'characters more than this code can hold',
  );
});

test("switching kind keeps each kind's own fields", async ({ browser }) => {
  const page = await open(browser, '#qr-wifi');
  await field(page, 'Network name').fill('Secret network');
  await field(page, 'Password').fill('hunter22');
  await kindLink(page, 'Business card').click();
  await field(page, 'Given name').fill('Ada');
  await expect.poll(async () => (await readPreview(page))?.text ?? '').toContain('Ada');
  const card = (await readPreview(page))!.text;
  expect(card).not.toContain('Secret network');
  expect(card).not.toContain('hunter22');

  await kindLink(page, 'Wi-Fi').click();
  await expect(field(page, 'Network name')).toHaveValue('Secret network');
  await expect(field(page, 'Password')).toHaveValue('hunter22');
  await expectCode(
    page,
    unwrap(wifi({ ssid: 'Secret network', password: 'hunter22', security: 'wpa', hidden: false })),
  );
});

test('escapes and the UTF-8 marker are honoured', async ({ browser }) => {
  const page = await open(browser, '#qr-text');
  await page.getByText('Text options').click();
  await page.getByRole('button', { name: 'Read escapes' }).click();
  await field(page, 'Text').fill('a\\tb');
  await expectCode(page, 'a\tb');

  await page.getByRole('button', { name: 'Read escapes' }).click();
  await field(page, 'Text').fill('Grüße');
  await expectCode(page, 'Grüße');
  expect((await readPreview(page))?.hasECI).toBe(true);
  await page.getByRole('button', { name: 'UTF-8 marker' }).click();
  await expect.poll(async () => (await readPreview(page))?.hasECI).toBe(false);
});
