import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

describe('the package source', () => {
  it('imports no Node built-in, touches no browser global, and has no clock or random source of its own', () => {
    const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((name) =>
      name.endsWith('.ts'),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const source = readFileSync(`${SRC}/${name}`, 'utf8');
      expect(source, name).not.toMatch(/from 'node:/);
      expect(source, name).not.toMatch(
        /\b(window|document|localStorage|sessionStorage|navigator|fetch|crypto|atob|btoa|Date)\b/,
      );
      expect(source, name).not.toMatch(/Math\.random/);
    }
  });
});
