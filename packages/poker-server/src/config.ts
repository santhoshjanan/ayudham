import { z } from 'zod';

const url = z.string().refine((value) => URL.canParse(value));

const schema = z.object({
  DATABASE_URL: url,
  VALKEY_URL: url,
  ADDRESS_HMAC_SECRET: z.string().min(32),
  RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  KEY_PREFIX: z
    .string()
    .regex(/^[a-z0-9:_-]{0,31}:$/)
    .default('pokerji:'),
  BACKUP_ROTATION_DAYS: z.coerce.number().int().min(1).max(3650).optional(),
  MIGRATIONS: z.enum(['apply', 'check']).default('apply'),
});

export interface Config {
  databaseUrl: string;
  valkeyUrl: string;
  /** Keys the HMAC that turns a client address into a rate-limit key. */
  addressHmacSecret: string;
  retentionDays: number;
  /** Namespace for this app's Valkey keys. The production ACL user is limited to it. */
  keyPrefix: string;
  /** How long database backups are kept, for the privacy page. Null when not stated. */
  backupRotationDays: number | null;
  /** "check" for a database role that cannot change the schema: verify it, never alter it. */
  migrations?: 'apply' | 'check';
}

/** Reads configuration. The error names bad variables and never includes their values. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid or missing configuration: ${names.join(', ')}`);
  }
  return {
    databaseUrl: parsed.data.DATABASE_URL,
    valkeyUrl: parsed.data.VALKEY_URL,
    addressHmacSecret: parsed.data.ADDRESS_HMAC_SECRET,
    retentionDays: parsed.data.RETENTION_DAYS,
    keyPrefix: parsed.data.KEY_PREFIX,
    backupRotationDays: parsed.data.BACKUP_ROTATION_DAYS ?? null,
    migrations: parsed.data.MIGRATIONS,
  };
}
