import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/index.ts';

const valid = {
  DATABASE_URL: 'postgres://app:pw@db:5432/pokerji',
  VALKEY_URL: 'redis://app:pw@valkey:6379',
  ADDRESS_HMAC_SECRET: 'x'.repeat(32),
};

describe('loadConfig', () => {
  it('reads the environment, defaulting retention to 30 days and the key prefix to pokerji:', () => {
    expect(loadConfig(valid)).toEqual({
      databaseUrl: valid.DATABASE_URL,
      valkeyUrl: valid.VALKEY_URL,
      addressHmacSecret: valid.ADDRESS_HMAC_SECRET,
      retentionDays: 30,
      keyPrefix: 'pokerji:',
      backupRotationDays: null,
      migrations: 'apply',
    });
  });

  it('treats an empty optional value as not set, as a compose file passes it', () => {
    expect(loadConfig({ ...valid, BACKUP_ROTATION_DAYS: '' }).backupRotationDays).toBeNull();
    expect(loadConfig({ ...valid, BACKUP_ROTATION_DAYS: '14' }).backupRotationDays).toBe(14);
  });

  it('applies migrations unless told to check only', () => {
    expect(loadConfig(valid).migrations).toBe('apply');
    expect(loadConfig({ ...valid, MIGRATIONS: 'check' }).migrations).toBe('check');
    expect(() => loadConfig({ ...valid, MIGRATIONS: 'sometimes' })).toThrow(/MIGRATIONS/);
  });

  it('accepts a retention override and a key prefix', () => {
    const config = loadConfig({ ...valid, RETENTION_DAYS: '7', KEY_PREFIX: 'e2e-1:' });
    expect(config.retentionDays).toBe(7);
    expect(config.keyPrefix).toBe('e2e-1:');
  });

  it('rejects a key prefix that could collide with or escape its namespace', () => {
    for (const bad of ['', 'pokerji', 'Has Space:', '*:', 'x'.repeat(40) + ':']) {
      expect(() => loadConfig({ ...valid, KEY_PREFIX: bad })).toThrow(/KEY_PREFIX/);
    }
  });

  it('reads the backup rotation period, or leaves it unknown', () => {
    expect(loadConfig({ ...valid, BACKUP_ROTATION_DAYS: '14' }).backupRotationDays).toBe(14);
    expect(loadConfig(valid).backupRotationDays).toBeNull();
    expect(() => loadConfig({ ...valid, BACKUP_ROTATION_DAYS: '0' })).toThrow(
      /BACKUP_ROTATION_DAYS/,
    );
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
