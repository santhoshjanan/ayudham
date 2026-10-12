import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/index.ts';

const valid = {
  DATABASE_URL: 'postgres://app:pw@db:5432/pokerji',
  VALKEY_URL: 'redis://app:pw@valkey:6379',
  ADDRESS_HMAC_SECRET: 'x'.repeat(32),
};

describe('loadConfig', () => {
  it('reads the environment and defaults retention to 30 days', () => {
    expect(loadConfig(valid)).toEqual({
      databaseUrl: valid.DATABASE_URL,
      valkeyUrl: valid.VALKEY_URL,
      addressHmacSecret: valid.ADDRESS_HMAC_SECRET,
      retentionDays: 30,
    });
  });

  it('accepts a retention override', () => {
    expect(loadConfig({ ...valid, RETENTION_DAYS: '7' }).retentionDays).toBe(7);
  });

  it('names every missing or invalid variable', () => {
    expect(() => loadConfig({ VALKEY_URL: 'not a url', RETENTION_DAYS: '0' })).toThrow(
      /DATABASE_URL.*VALKEY_URL.*ADDRESS_HMAC_SECRET.*RETENTION_DAYS/s,
    );
  });

  it('rejects a short HMAC secret without echoing it', () => {
    const attempt = () => loadConfig({ ...valid, ADDRESS_HMAC_SECRET: 'too-short-secret' });
    expect(attempt).toThrow(/ADDRESS_HMAC_SECRET/);
    expect(attempt).not.toThrow(/too-short-secret/);
  });
});
