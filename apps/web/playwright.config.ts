import { defineConfig } from '@playwright/test';

const PORT = 4173;

// The tests run against a real build behind the real entry file, so the
// Content Security Policy, the cookie and the origin checks are all in force.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: 'pnpm build && node server.js',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      INSECURE_HTTP: '1',
      PROTOCOL_HEADER: 'x-forwarded-proto',
      // The tests give each browser context its own address through this header.
      ADDRESS_HEADER: 'x-forwarded-for',
      XFF_DEPTH: '1',
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgres://pokerji:pokerji_dev@127.0.0.1:5432/pokerji',
      VALKEY_URL: process.env.VALKEY_URL ?? 'redis://:pokerji_dev@127.0.0.1:6379',
      ADDRESS_HMAC_SECRET: 'end-to-end-tests-only-address-hmac-secret',
      // A fresh namespace each run, so rate limits from earlier runs do not carry over.
      KEY_PREFIX: `e2e-${Date.now()}:`,
    },
  },
});
