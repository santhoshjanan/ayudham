import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

/** Names the package may not mention, in code or in a comment. */
const BANNED =
  /\b(window|document|localStorage|sessionStorage|indexedDB|navigator|fetch|XMLHttpRequest|WebSocket|crypto|atob|btoa|Date|performance|Temporal|globalThis|self|process|Buffer|require)\b/;

/** What a source file does that the package may not. */
function violations(source: string): string[] {
  const found: string[] = [];
  for (const [, specifier = ''] of source.matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"]*)['"]/g)) {
    if (!specifier.startsWith('./')) found.push(`imports ${specifier}`);
  }
  const banned = BANNED.exec(source);
  if (banned) found.push(`mentions ${banned[1]}`);
  if (/Math\s*\.\s*random/.test(source)) found.push('mentions Math.random');
  return found;
}

describe('the purity check', () => {
  it('passes a file that imports only its neighbours', () => {
    expect(violations("import { ok } from './result.ts';\nexport const two = 1 + 1;\n")).toEqual(
      [],
    );
  });

  it('catches an import of anything but a neighbour', () => {
    for (const line of [
      "import { readFileSync } from 'node:fs';",
      'import { readFileSync } from "node:fs";',
      "import fs from 'fs';",
      "import { z } from 'zod';",
      "import '../test/helpers.ts';",
      "const fs = await import('node:fs');",
      "export * from 'zod';",
    ]) {
      expect(violations(line), line).not.toEqual([]);
    }
  });

  it('catches a global, a clock and a random source of its own', () => {
    for (const line of [
      'globalThis.crypto.getRandomValues(out);',
      'self.postMessage(1);',
      'process.env.HOME;',
      'Buffer.from(text);',
      "require('fs');",
      'performance.now();',
      'Temporal.Now.instant();',
      'new Date();',
      'Math.random();',
      'Math . random();',
      'new WebSocket(url);',
      'indexedDB.open(name);',
      'fetch(url);',
    ]) {
      expect(violations(line), line).not.toEqual([]);
    }
  });
});

describe('the package source', () => {
  it('imports only its own files, touches no global, and has no clock or random source of its own', () => {
    const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((name) =>
      name.endsWith('.ts'),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      expect(violations(readFileSync(`${SRC}/${name}`, 'utf8')), name).toEqual([]);
    }
  });
});
