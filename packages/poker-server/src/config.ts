import { z } from 'zod';

const url = z.string().refine((value) => URL.canParse(value));

const schema = z.object({
  DATABASE_URL: url,
  VALKEY_URL: url,
  ADDRESS_HMAC_SECRET: z.string().min(32),
  RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
});

export interface Config {
  databaseUrl: string;
  valkeyUrl: string;
  /** Keys the HMAC that turns a client address into a rate-limit key. */
  addressHmacSecret: string;
  retentionDays: number;
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
  };
}
