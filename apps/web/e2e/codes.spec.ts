import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { calendarEvent, email, meCard, phone, place, sms, vCard, wifi } from '@pokerji/code-maker';
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { decodePng } from './decode.ts';

let visitors = 0;
const visitor = () => {
  visitors += 1;
  return {
    extraHTTPHeaders: { 'x-forwarded-for': `10.11.${visitors >> 8}.${visitors & 255}` },
  };
};

const WIDE = { width: 1280, height: 900 };
const NARROW = { width: 390, height: 844 };

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
  await expect(rail(page).locator('p[role="status"]')).toContainText(
    'é at position 3 cannot be carried by Code 39',
  );
  await expect(image(page)).toHaveClass(/old/);
  await expect(rail(page)).toContainText('the last code that could be made');
});

test('too long says by how much', async ({ browser }) => {
  const page = await open(browser, '#qr-text');
  await field(page, 'Text').fill('a'.repeat(3000));
  await expect(rail(page).locator('p[role="status"]')).toContainText(
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

const group = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const press = (page: Page, groupName: string, name: string) =>
  group(page, groupName).getByRole('button', { name, exact: true }).click();
const LINK = 'https://example.com/shapes';

test('every dot shape, corner shape and theme still scans', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  await expectCode(page, LINK);
  for (const dots of [
    'Rounded',
    'Circle',
    'Diamond',
    'Connected',
    'Vertical bars',
    'Horizontal bars',
    'Square',
  ]) {
    await press(page, 'Dots', dots);
    await expectCode(page, LINK);
  }
  for (const ring of ['Rounded', 'Circle', 'Leaf', 'Square']) {
    await press(page, 'Corner rings', ring);
    await expectCode(page, LINK);
  }
  // Diamond eyes are not offered: they did not decode.
  await expect(group(page, 'Corner eyes').getByRole('button', { name: 'Diamond' })).toHaveCount(0);
  for (const eye of ['Rounded', 'Circle', 'Square']) {
    await press(page, 'Corner eyes', eye);
    await expectCode(page, LINK);
  }
  for (const theme of ['Rainbow', 'Sunset', 'Ocean', 'Forest', 'Pool', 'Ink', 'Neon']) {
    await press(page, 'Themes', theme);
    await expect(group(page, 'Themes').getByRole('button', { name: theme })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectCode(page, LINK);
  }
  await press(page, 'Themes', 'Surprise me');
  await expectCode(page, LINK);
});

test('the colour field takes a picker or a typed hex, and refuses nonsense', async ({
  browser,
}) => {
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  const hex = page.getByRole('textbox', { name: 'Foreground', exact: true });
  const swatch = page.locator('input[type="color"]').and(page.getByLabel('Foreground'));
  await hex.fill('0E6F8C');
  await expect(swatch).toHaveValue('#0e6f8c');
  await expectCode(page, LINK);
  await hex.fill('zz');
  await expect(page.getByText('That is not a colour')).toBeVisible();
  await expect(swatch).toHaveValue('#0e6f8c');

  await swatch.fill('#5a2d82');
  await expect(hex).toHaveValue('#5a2d82');
});

test('contrast below 4.5:1 warns, below 2:1 stops export', async ({ browser }) => {
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  const hex = page.getByRole('textbox', { name: 'Foreground', exact: true });
  await hex.fill('#777777');
  const findings = page.getByTestId('finding');
  await expect(findings.filter({ hasText: 'contrast' })).toHaveAttribute('data-level', 'warning');
  await expect(copyImage(page)).toBeEnabled();
  await hex.fill('#bbbbbb');
  await expect(findings.filter({ hasText: 'too close' })).toHaveAttribute('data-level', 'refusal');
  await expect(findings.filter({ hasText: 'too close' })).toContainText('Stops export');
  await expect(copyImage(page)).toBeDisabled();
});

test('Invert swaps the colours and warns light on dark', async ({ browser }) => {
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  await page.getByRole('button', { name: 'Invert', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Foreground', exact: true })).toHaveValue(
    '#ffffff',
  );
  await expect(page.getByRole('textbox', { name: 'Background', exact: true })).toHaveValue(
    '#111417',
  );
  await expect(page.getByTestId('finding').filter({ hasText: 'light on dark' })).toBeVisible();
});

test('options change the code', async ({ browser }) => {
  const page = await open(browser);
  await field(page, 'Address').fill('https://example.com/a-rather-longer-address/for/density');
  const size = async () => {
    await expect(preview(page)).not.toHaveAttribute('aria-busy', 'true');
    const src = (await image(page).getAttribute('src')) ?? '';
    return Number(/viewBox="0 0 (\d+)/.exec(decodeURIComponent(src))?.[1]);
  };
  await field(page, 'Error correction').selectOption('L');
  await expect.poll(size).toBeGreaterThan(0);
  const low = await size();
  await field(page, 'Error correction').selectOption('H');
  await expect.poll(size).toBeGreaterThan(low);

  await field(page, 'Size').fill('2');
  await expect(rail(page).locator('p[role="status"]')).toContainText(
    'more than this code can hold',
  );
});

test('drawn codes show colours and the shapes note, not shape buttons', async ({ browser }) => {
  const page = await open(browser, '#code-128');
  await expect(page.getByRole('textbox', { name: 'Foreground', exact: true })).toBeVisible();
  await expect(page.getByText('Bar and stacked codes take colours and a quiet zone')).toBeVisible();
  await expect(group(page, 'Dots')).toHaveCount(0);
  await expect(group(page, 'Themes')).toHaveCount(0);
  await expect(field(page, 'Bar height (mm)')).toHaveValue('15');
});

/** An image made in the page and handed back as file bytes. */
const makeImage = (
  page: Page,
  {
    width,
    height,
    type,
    noise = false,
  }: { width: number; height: number; type: string; noise?: boolean },
  quality = 0.92,
) =>
  page
    .evaluate(
      async ({ width, height, type, noise, quality }) => {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d')!;
        if (noise) {
          const pixels = context.createImageData(width, height);
          const random = new Uint8Array(65536);
          for (let at = 0; at < pixels.data.length; at += 65536) {
            crypto.getRandomValues(random);
            pixels.data.set(random.subarray(0, Math.min(65536, pixels.data.length - at)), at);
          }
          for (let at = 3; at < pixels.data.length; at += 4) pixels.data[at] = 255;
          context.putImageData(pixels, 0, 0);
        } else {
          context.fillStyle = '#c62828';
          context.fillRect(0, 0, width, height);
        }
        const blob = await canvas.convertToBlob({ type, quality });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let at = 0; at < bytes.length; at += 32768)
          binary += String.fromCharCode(...bytes.subarray(at, at + 32768));
        return btoa(binary);
      },
      { width, height, type, noise, quality },
    )
    .then((base64) => Buffer.from(base64, 'base64'));

const chooseLogo = async (page: Page, name: string, mimeType: string, buffer: Buffer) =>
  page.getByLabel('Choose image').setInputFiles({ name, mimeType, buffer });

const findings = (page: Page) => page.getByTestId('finding');

test('a logo at the largest size each error correction allows still scans', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  await chooseLogo(
    page,
    'logo.png',
    'image/png',
    await makeImage(page, { width: 64, height: 64, type: 'image/png' }),
  );
  await expect(page.getByRole('button', { name: 'Remove logo' })).toBeVisible();
  for (const level of ['L', 'M', 'Q', 'H']) {
    await field(page, 'Error correction').selectOption(level);
    let largest = 0;
    for (let share = 10; share <= 40; share++) {
      await field(page, 'Logo size (%)').fill(String(share));
      await expect(preview(page)).not.toHaveAttribute('aria-busy', 'true');
      if ((await findings(page).filter({ hasText: 'logo covers' }).count()) > 0) break;
      largest = share;
    }
    // Every level must allow at least the smallest logo, or the offer is wrong.
    expect(largest, level).toBeGreaterThanOrEqual(10);
    console.log(`logo limit at ${level}: ${largest}%`);
    await field(page, 'Logo size (%)').fill(String(largest));
    for (const plate of ['Square', 'Rounded', 'Circle']) {
      await press(page, 'Plate', plate);
      await expect
        .poll(async () => (await readPreview(page))?.text, {
          message: `${level} ${largest}% ${plate}`,
        })
        .toBe(LINK);
    }
  }
});

test('a logo too large is refused before export', async ({ browser }) => {
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  await chooseLogo(
    page,
    'logo.png',
    'image/png',
    await makeImage(page, { width: 64, height: 64, type: 'image/png' }),
  );
  await field(page, 'Error correction').selectOption('L');
  await field(page, 'Logo size (%)').fill('40');
  await expect(findings(page).filter({ hasText: 'logo covers' })).toHaveAttribute(
    'data-level',
    'refusal',
  );
  await expect(copyImage(page)).toBeDisabled();
});

test('choosing a logo raises error correction to H, unless it was chosen', async ({ browser }) => {
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  const png = await makeImage(page, { width: 64, height: 64, type: 'image/png' });
  await chooseLogo(page, 'logo.png', 'image/png', png);
  await expect(field(page, 'Error correction')).toHaveValue('H');

  const other = await open(browser);
  await field(other, 'Address').fill(LINK);
  await field(other, 'Error correction').selectOption('Q');
  await chooseLogo(other, 'logo.png', 'image/png', png);
  await expect(field(other, 'Error correction')).toHaveValue('Q');
});

test('a photo is read on the device and the page stays responsive', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  await expectCode(page, LINK);
  const photo = await makeImage(
    page,
    { width: 4000, height: 3000, type: 'image/jpeg', noise: true },
    0.5,
  );
  expect(photo.length).toBeGreaterThan(3_000_000);
  expect(photo.length).toBeLessThan(5_000_000);

  const sent: string[] = [];
  page.on('request', (request) =>
    sent.push(`${request.method()} ${request.url()} ${request.postData() ?? ''}`),
  );
  const started = Date.now();
  await chooseLogo(page, 'photo.jpg', 'image/jpeg', photo);
  await expect(preview(page).locator('img')).toHaveAttribute('src', /image%2Fpng%3Bbase64/, {
    timeout: 3_000,
  });
  expect(Date.now() - started).toBeLessThan(3_000);
  for (const line of sent) expect(line).not.toMatch(/^POST|photo/);

  // A key press while a code with the photo is made takes no longer than 50 ms.
  const address = field(page, 'Address');
  await address.focus();
  await page.keyboard.press('End');
  await page.evaluate(() => {
    const seen = window as unknown as { worst: number };
    seen.worst = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) seen.worst = Math.max(seen.worst, entry.duration);
    }).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
  });
  for (let key = 0; key < 6; key++) {
    await page.keyboard.type('x');
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { worst: number }).worst)).toBeLessThan(
    50,
  );
});

test('a file that is not an image, or over 5 MB, is refused in words', async ({ browser }) => {
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  await page
    .getByLabel('Choose image')
    .setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByText('That file is not an image this page can read')).toBeVisible();
  await page.getByLabel('Choose image').setInputFiles({
    name: 'huge.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(5_000_001, 1),
  });
  await expect(page.getByText('That image is larger than 5 MB')).toBeVisible();
  await page.getByLabel('Choose image').setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not really a png'),
  });
  await expect(page.getByText('That file is not an image this page can read')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove logo' })).toHaveCount(0);
});

test('Invert with a logo warns light on dark and keeps the logo check', async ({ browser }) => {
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  await chooseLogo(
    page,
    'logo.png',
    'image/png',
    await makeImage(page, { width: 64, height: 64, type: 'image/png' }),
  );
  await field(page, 'Logo size (%)').fill('40');
  await page.getByRole('button', { name: 'Invert', exact: true }).click();
  await expect(findings(page).filter({ hasText: 'light on dark' })).toHaveAttribute(
    'data-level',
    'warning',
  );
  await expect(findings(page).filter({ hasText: 'logo covers' })).toHaveAttribute(
    'data-level',
    'refusal',
  );
});

test('Aztec says it has no room for a logo, and bar codes offer none', async ({ browser }) => {
  const page = await open(browser, '#aztec');
  await expect(page.getByText('Aztec has no room for a logo')).toBeVisible();
  await expect(page.getByLabel('Choose image')).toHaveCount(0);
  const bars = await open(browser, '#code-128');
  await expect(bars.getByRole('heading', { name: 'Logo' })).toHaveCount(0);
});

/** Presses a download button and returns the file it saves, with its suggested name. */
const download = async (page: Page, name: string) => {
  const [saved] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name, exact: true }).click(),
  ]);
  return { name: saved.suggestedFilename(), bytes: readFileSync((await saved.path())!) };
};
const NAME = /^code-qr-link-\d{8}-\d{6}\.(png|jpg|svg|pdf|zip)$/;

test('each download opens and decodes', async ({ browser }) => {
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  await expectCode(page, LINK);

  const png = await download(page, 'PNG');
  expect(png.name).toMatch(NAME);
  expect((await decodePng(png.bytes))?.text).toBe(LINK);
  const jpg = await download(page, 'JPG');
  expect(jpg.name).toMatch(NAME);
  expect((await decodePng(jpg.bytes))?.text).toBe(LINK);

  const svg = await download(page, 'SVG');
  const text = svg.bytes.toString('utf8');
  expect(text).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  expect(text).not.toContain('<script');
  expect(
    await page.evaluate((markup) => {
      const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
      return parsed.querySelector('parsererror') === null;
    }, text),
  ).toBe(true);

  const pdf = await download(page, 'PDF');
  expect(pdf.bytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBe(1);

  const zip = await download(page, 'All as ZIP');
  expect(zip.name).toMatch(NAME);
  const files = Object.keys(unzipSync(new Uint8Array(zip.bytes))).sort();
  expect(files).toHaveLength(4);
  for (const file of files) expect(file).toMatch(NAME);
  expect(files.map((file) => file.split('.').pop())).toEqual(['jpg', 'pdf', 'png', 'svg']);
});

test('a print size gives the right pixels', async ({ browser }) => {
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  await expectCode(page, LINK);
  await page.getByRole('button', { name: 'Print size', exact: true }).click();
  await field(page, 'Width (mm)').fill('50');
  await field(page, 'Resolution').selectOption('600');
  const png = await download(page, 'PNG');
  expect(png.bytes.readUInt32BE(16)).toBe(1181);
});

test('a tiny print size warns that modules are too small', async ({ browser }) => {
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  await field(page, 'Size').fill('40');
  await page.getByRole('button', { name: 'Print size', exact: true }).click();
  await field(page, 'Width (mm)').fill('10');
  await expect(page.getByText('smaller than 0.25 mm')).toBeVisible();
  await field(page, 'Width (mm)').fill('100');
  await expect(page.getByText('smaller than 0.25 mm')).toHaveCount(0);
});

test('Copy image puts a PNG on the clipboard', async ({ browser }) => {
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  await expectCode(page, LINK);
  await copyImage(page).click();
  await expect(rail(page).getByText('Copied', { exact: true })).toBeAttached();
  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    if (!item?.types.includes('image/png')) return null;
    const bytes = new Uint8Array(await (await item.getType('image/png')).arrayBuffer());
    let binary = '';
    for (let at = 0; at < bytes.length; at += 32768)
      binary += String.fromCharCode(...bytes.subarray(at, at + 32768));
    return btoa(binary);
  });
  expect(copied).not.toBeNull();
  expect((await decodePng(Buffer.from(copied!, 'base64')))?.text).toBe(LINK);
});

test('refused export disables Copy image and every download', async ({ browser }) => {
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  await expectCode(page, LINK);
  await page.getByRole('textbox', { name: 'Foreground', exact: true }).fill('#eeeeee');
  await expect(copyImage(page)).toBeDisabled();
  for (const name of ['PNG', 'JPG', 'SVG', 'PDF', 'All as ZIP'])
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
});

const READ_BACK =
  /Read back by this browser: it matched\.|Read back by this browser: it did not match|This browser has no barcode reader/;

test('read-back says matched, or not available, honestly', async ({ browser }) => {
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  await expectCode(page, LINK);
  await expect(page.getByTestId('read-back')).toHaveText(READ_BACK);

  // A reader that reads something else must never be reported as a match.
  const context = await browser.newContext(visitor());
  await context.addInitScript(() => {
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {
      static async getSupportedFormats() {
        return ['qr_code'];
      }
      async detect() {
        return [{ rawValue: 'https://example.com/elsewhere', format: 'qr_code' }];
      }
    };
  });
  const stubbed = await context.newPage();
  await stubbed.goto('/codes');
  await stubbed.locator('[data-ready]').waitFor();
  await field(stubbed, 'Address').fill(LINK);
  await expect(stubbed.getByTestId('read-back')).toContainText('did not match');
});

test('a 600 dpi export at the size limit is ready within 3 seconds and the page stays usable', async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  await expectCode(page, LINK);
  await page.getByRole('button', { name: 'Print size', exact: true }).click();
  await field(page, 'Resolution').selectOption('600');
  await field(page, 'Width (mm)').fill('423');
  const started = Date.now();
  const saving = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Making…' })).toBeVisible();
  // The page answers while the file is made.
  await field(page, 'Address').evaluate((input: HTMLInputElement) => {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
  await page.keyboard.type('/x');
  await expect(field(page, 'Address')).toHaveValue(`${LINK}/x`);
  const saved = await saving;
  expect(Date.now() - started).toBeLessThan(3_000);
  expect(readFileSync((await saved.path())!).readUInt32BE(16)).toBe(9992);
});

const SENTINEL = 'Zebra7Quokka';
const SECOND = 'Okapi4Narwhal';
const KINDS = [
  'qr-link',
  'qr-text',
  'qr-card',
  'qr-event',
  'qr-wifi',
  'qr-place',
  'qr-email',
  'qr-sms',
  'qr-phone',
  'code-128',
];

/** Every typing field in the Content section, filled with the sentinel. */
const fillAll = async (page: Page, value: string) => {
  const boxes = page
    .locator('section[aria-labelledby="c-content"]')
    .locator('input[type="text"], textarea');
  for (const box of await boxes.all()) await box.fill(value);
};

test('nothing typed, chosen or uploaded is sent anywhere', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await open(browser);
  const seen: string[] = [];
  page.on('request', async (request) => {
    seen.push(
      [
        request.method(),
        request.url(),
        JSON.stringify(await request.allHeaders()),
        request.postData() ?? '',
      ].join(' '),
    );
  });
  for (const kind of KINDS) {
    await page.goto(`/codes#${kind}`);
    await page.locator('[data-ready]').waitFor();
    await fillAll(page, SENTINEL);
  }
  await page.goto('/codes#qr-link');
  await field(page, 'Address').fill(`https://example.com/${SENTINEL}`);
  await expectCode(page, `https://example.com/${SENTINEL}`);
  // A logo whose file carries a second sentinel after its image data.
  const png = await makeImage(page, { width: 64, height: 64, type: 'image/png' });
  await chooseLogo(page, 'logo.png', 'image/png', Buffer.concat([png, Buffer.from(SECOND)]));
  await expect(page.getByRole('button', { name: 'Remove logo' })).toBeVisible();
  for (const name of ['PNG', 'JPG', 'SVG', 'PDF', 'All as ZIP']) await download(page, name);
  await copyImage(page).click();
  await expect(rail(page).getByText('Copied', { exact: true })).toBeAttached();

  for (const line of seen) {
    expect(line).not.toContain(SENTINEL);
    expect(line).not.toContain(SECOND);
    expect(line).not.toContain('example.com');
  }
  // After the page itself: only scripts of this site, fetched with GET.
  const after = seen.filter((line) => !/ http:\/\/127\.0\.0\.1:\d+\/codes /.test(line));
  for (const line of after)
    expect(line).toMatch(/^GET http:\/\/127\.0\.0\.1:\d+\/(_app\/immutable\/|favicon)/);
});

test('nothing is kept', async ({ browser }) => {
  const page = await open(browser);
  const stored = () =>
    page.evaluate(async () => ({
      local: Object.keys(localStorage).sort(),
      session: Object.keys(sessionStorage).sort(),
      cookie: document.cookie,
      databases: ((await indexedDB.databases?.()) ?? []).map((entry) => entry.name),
    }));
  const before = await stored();
  await field(page, 'Address').fill(LINK);
  await expectCode(page, LINK);
  await press(page, 'Themes', 'Ocean');
  await page.getByRole('link', { name: 'Wi-Fi' }).click();
  await field(page, 'Network name').fill(SENTINEL);
  await download(page, 'PNG');
  expect(await stored()).toEqual(before);
  expect(new URL(page.url()).hash).toBe('#qr-wifi');
  expect(page.url()).not.toContain(SENTINEL);
  await page.reload();
  await page.locator('[data-ready]').waitFor();
  await expect(field(page, 'Network name')).toHaveValue('');
  await expect(preview(page).locator('.empty')).toBeVisible();
});

test('the content security policy is never broken', async ({ browser }) => {
  const context = await browser.newContext({
    ...visitor(),
    viewport: WIDE,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
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
  await page.goto('/codes');
  await page.locator('[data-ready]').waitFor();
  // Counted from here: at load every page of the site reports zod's own probe for `Function`,
  // which the policy blocks as intended and which nothing on this page uses.
  await page.evaluate(() => ((window as unknown as { violations: string[] }).violations = []));
  await field(page, 'Address').fill(LINK);
  await expectCode(page, LINK);
  await press(page, 'Themes', 'Rainbow');
  const png = await makeImage(page, { width: 64, height: 64, type: 'image/png' });
  await chooseLogo(page, 'logo.png', 'image/png', png);
  await page.getByRole('button', { name: 'Remove logo' }).waitFor();
  for (const name of ['PNG', 'JPG', 'SVG', 'PDF', 'All as ZIP']) await download(page, name);
  await copyImage(page).click();
  await expect(rail(page).getByText('Copied', { exact: true })).toBeAttached();
  await page.getByLabel('Other codes').selectOption('pdf417');
  await field(page, 'Text').fill('Hello');
  await expect(image(page)).toBeVisible();
  expect(messages).toEqual([]);
  expect(
    await page.evaluate(() => (window as unknown as { violations: string[] }).violations),
  ).toEqual([]);
});

test('every field keeps text away from spelling and translation services', async ({ browser }) => {
  const page = await open(browser);
  await field(page, 'Address').fill(LINK);
  await expect(rail(page)).toHaveAttribute('translate', 'no');
  for (const kind of [...KINDS, 'pdf417']) {
    await page.goto(`/codes#${kind}`);
    await page.locator('[data-ready]').waitFor();
    const boxes = page.locator('main input:not([type="file"]):not([type="color"]), main textarea');
    expect(await boxes.count()).toBeGreaterThan(0);
    for (const box of await boxes.all()) {
      const id = (await box.getAttribute('id')) ?? 'unnamed';
      expect(await box.getAttribute('spellcheck'), `${kind} ${id}`).toBe('false');
      expect(await box.getAttribute('autocomplete'), `${kind} ${id}`).toBe('off');
      expect(await box.getAttribute('autocapitalize'), `${kind} ${id}`).toBe('off');
      expect(await box.getAttribute('autocorrect'), `${kind} ${id}`).toBe('off');
      expect(await box.getAttribute('translate'), `${kind} ${id}`).toBe('no');
    }
  }
});

test('on a phone the code comes first and nothing scrolls sideways', async ({ browser }) => {
  const page = await open(browser, '#qr-card', NARROW);
  const top = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!.y;
  expect(await top(preview(page))).toBeLessThan(
    await top(page.locator('section[aria-labelledby="c-content"]')),
  );
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth);
  await field(page, 'Given name').fill('Maximiliana-Alexandrina');
  await field(page, 'Family name').fill('Featherstonehaugh-Cholmondeley');
  await field(page, 'Organisation').fill('The Exceptionally Long-Named Organisation of Things');
  await field(page, 'Website').fill(`https://example.com/${'very-long-path-'.repeat(12)}`);
  await field(page, 'Note').fill('word '.repeat(150));
  await expect(image(page)).toBeVisible();
  expect(await wide()).toBeLessThanOrEqual(NARROW.width);

  await page.goto('/codes#pdf417');
  await page.locator('[data-ready]').waitFor();
  await field(page, 'Columns').fill('30');
  await field(page, 'Text').fill('x'.repeat(800));
  await expect(image(page)).toBeVisible();
  expect(await wide()).toBeLessThanOrEqual(NARROW.width);
});

const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

test('WCAG 2.2 AA in both themes', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const colorScheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({ ...visitor(), viewport: WIDE, colorScheme });
    const page = await context.newPage();
    for (const [kind, typed] of [
      ['qr-link', LINK],
      ['qr-card', null],
      ['qr-event', null],
      ['data-matrix', 'Hello'],
      ['pdf417', 'Hello'],
      ['ean-13', '590123412345'],
      ['code-128', 'ABC-123'],
    ] as const) {
      await page.goto(`/codes#${kind}`);
      await page.locator('[data-ready]').waitFor();
      if (kind === 'qr-link') await field(page, 'Address').fill(typed!);
      else if (kind === 'qr-card') await field(page, 'Given name').fill('Ada');
      else if (kind === 'qr-event') await field(page, 'Title').fill('Launch');
      else await field(page, 'Text').fill(typed!);
      if (kind === 'qr-link') {
        await expect(image(page)).toBeVisible();
        const png = await makeImage(page, { width: 64, height: 64, type: 'image/png' });
        await chooseLogo(page, 'logo.png', 'image/png', png);
        await page.getByRole('button', { name: 'Print size', exact: true }).click();
        await page.getByRole('button', { name: 'Corner colour' }).click();
      }
      await expect(preview(page)).not.toHaveAttribute('aria-busy', 'true');
      expect((await scan(page)).violations, `${kind} in ${colorScheme}`).toEqual([]);
      await expect(page.locator('main .danger, main [role="alert"]')).toHaveCount(0);
    }
    await context.close();
  }
});

/** Presses Tab until the focused element is the one wanted. */
const tabTo = async (page: Page, wanted: ReturnType<Page['locator']>) => {
  for (let step = 0; step < 150; step++) {
    await page.keyboard.press('Tab');
    if (await wanted.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('never reached by Tab');
};

test('keyboard alone', async ({ browser }) => {
  const page = await open(browser);
  await tabTo(page, kindLink(page, 'Text'));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: 'Text', exact: true })).toBeVisible();
  await page.locator('body').focus();
  await tabTo(page, kindLink(page, 'Link'));
  await page.keyboard.press('Enter');
  await tabTo(page, field(page, 'Address'));
  await page.keyboard.type(LINK);
  await tabTo(page, group(page, 'Themes').getByRole('button', { name: 'Ocean' }));
  await page.keyboard.press('Space');
  await expect(group(page, 'Themes').getByRole('button', { name: 'Ocean' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expectCode(page, LINK);
  await page.locator('body').focus();
  await tabTo(page, copyImage(page));
  await page.keyboard.press('Enter');
  await expect(rail(page).getByText('Copied', { exact: true })).toBeAttached();
});

/** The longest a key press took to be handled and painted, over a few presses. */
const worstKeystroke = async (page: Page, box: ReturnType<Page['locator']>) => {
  await box.evaluate((element: HTMLInputElement | HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  });
  await page.evaluate(() => {
    const seen = window as unknown as { worst: number };
    seen.worst = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) seen.worst = Math.max(seen.worst, entry.duration);
    }).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
  });
  for (let press = 0; press < 6; press++) {
    await page.keyboard.type('x');
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(500);
  return page.evaluate(() => (window as unknown as { worst: number }).worst);
};

test('typing never waits', async ({ browser }) => {
  test.setTimeout(60_000);
  // The first code, within a second of opening.
  const context = await browser.newContext({ ...visitor(), viewport: WIDE });
  const first = await context.newPage();
  const opened = Date.now();
  await first.goto('/codes');
  await first.locator('[data-ready]').waitFor();
  await field(first, 'Address').fill(LINK);
  await expect(image(first)).toBeVisible();
  expect(Date.now() - opened).toBeLessThan(1_000);

  const page = await open(browser);
  await field(page, 'Error correction').selectOption('H');
  await field(page, 'Size').fill('40');
  await field(page, 'Address').fill(`https://example.com/${'a'.repeat(400)}`);
  await expect(image(page)).toBeVisible();
  expect(await worstKeystroke(page, field(page, 'Address'))).toBeLessThan(50);

  await page.goto('/codes#qr-card');
  await page.locator('[data-ready]').waitFor();
  await field(page, 'Given name').fill('Ada');
  await field(page, 'Note').fill('n'.repeat(994));
  await expect(image(page)).toBeVisible();
  expect(await worstKeystroke(page, field(page, 'Note'))).toBeLessThan(50);
});
