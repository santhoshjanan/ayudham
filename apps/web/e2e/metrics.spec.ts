import { expect, test } from '@playwright/test';

// The metrics listener is on its own port (see playwright.config.ts).
const METRICS = 'http://127.0.0.1:4174';
const NAME = 'Quillon-Marrow-58';
const TITLE = 'PROJ-9911 Gallimaufry widdershins';

test('the public port never serves metrics', async ({ request }) => {
  for (const path of ['/metrics', '/metrics?x=1']) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('ayudham_');
  }
  expect((await request.post('/metrics')).status()).toBe(404);
});

test('the metrics port serves only GET /metrics', async ({ request }) => {
  const scrape = await request.get(`${METRICS}/metrics`);
  expect(scrape.status()).toBe(200);
  expect(scrape.headers()['content-type']).toContain('text/plain');
  expect(await scrape.text()).toContain('ayudham_build_info');
  for (const path of ['/', '/poker', '/healthz', '/metrics/', '/metrics?x=1', '/robots.txt']) {
    expect((await request.get(`${METRICS}${path}`)).status(), path).toBe(404);
  }
  expect((await request.post(`${METRICS}/metrics`)).status()).toBe(404);
  expect((await request.put(`${METRICS}/metrics`)).status()).toBe(404);
  expect((await request.delete(`${METRICS}/metrics`)).status()).toBe(404);
});

test('a round played in a browser is counted, and nothing about it is in the scrape', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '10.200.7.5' },
  });
  const page = await context.newPage();
  await page.goto('/poker');
  await page.getByLabel('Your name').fill(NAME);
  await page.getByRole('button', { name: 'Create room' }).click();
  const link = page.getByRole('link', { name: 'Open the room' });
  const path = (await link.getAttribute('href')) ?? '';
  const code = path.split('/').at(-1) ?? '';
  expect(code).toHaveLength(12);
  await link.click();
  await expect(page.getByTestId('participants')).toContainText(NAME);
  await page.getByLabel('Story title').fill(TITLE);
  await page.getByRole('button', { name: 'Set title' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE);
  await page.getByRole('button', { name: 'Vote 13', exact: true }).click();
  await expect(page.getByTestId('participants')).toContainText(`${NAME} voted`);
  const cookies = await context.cookies();

  // The listener writes a fresh scrape at most once a second, so ask until this round shows.
  let text = '';
  await expect
    .poll(async () => {
      text = await (await request.get(`${METRICS}/metrics`)).text();
      return /^ayudham_websocket_messages_total\{type="vote"\} [1-9]/m.test(text);
    })
    .toBe(true);
  const value = (line: string) => {
    const found = text.split('\n').find((entry) => entry.startsWith(`${line} `));
    return found === undefined ? 0 : Number(found.slice(line.length + 1));
  };
  expect(value('ayudham_rooms_active')).toBeGreaterThanOrEqual(1);
  expect(value('ayudham_websocket_connections')).toBeGreaterThanOrEqual(1);
  expect(value('ayudham_websocket_messages_total{type="setTitle"}')).toBeGreaterThanOrEqual(1);
  expect(value('ayudham_websocket_messages_total{type="vote"}')).toBeGreaterThanOrEqual(1);
  expect(
    value('ayudham_http_requests_total{route_class="page",status_class="2xx"}'),
  ).toBeGreaterThanOrEqual(1);

  for (const secret of [
    code,
    NAME,
    TITLE,
    'Gallimaufry',
    '10.200.7.5',
    ...cookies.map((c) => c.value),
  ]) {
    expect(secret.length).toBeGreaterThan(5);
    expect(text).not.toContain(secret);
  }
  // No path of any kind, and no label value that is not a short plain word.
  expect(text).not.toContain('/poker');
  for (const [, labelValue] of text.matchAll(/[a-z_]+="([^"]*)"/g)) {
    expect(labelValue).toMatch(/^[A-Za-z0-9+._-]{1,40}$/);
  }
});
