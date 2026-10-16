import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from '../src/zod.ts';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

describe('zod', () => {
  it('is reached only through the module that turns its Function probe off', () => {
    const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((name) =>
      name.endsWith('.ts'),
    );
    expect(files.length).toBeGreaterThan(1);
    for (const name of files) {
      if (name === 'zod.ts') continue;
      expect(readFileSync(`${SRC}/${name}`, 'utf8'), name).not.toMatch(/from 'zod(\/.*)?'/);
    }
    expect(z.config().jitless).toBe(true);
  });
});
