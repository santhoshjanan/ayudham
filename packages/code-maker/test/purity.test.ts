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
  const typeOnly = /\bimport\s+type\b[^;]*?from\s*['"]bwip-js\/generic['"]/g;
  const stripped = source.replace(typeOnly, '');
  for (const [, specifier = ''] of stripped.matchAll(
    /\b(?:from|import)\s*\(?\s*['"]([^'"]*)['"]/g,
  )) {
    if (!specifier.startsWith('./') && specifier !== 'fflate') found.push(`imports ${specifier}`);
  }
  const banned = BANNED.exec(source);
  if (banned) found.push(`mentions ${banned[1]}`);
  if (/Math\s*\.\s*random/.test(source)) found.push('mentions Math.random');
  return found;
}

describe('the purity check', () => {
  it('passes its own files, fflate, and type-only imports of bwip-js', () => {
    expect(
      violations(
        "import { ok } from './result.ts';\nimport { zipSync } from 'fflate';\nimport type { default as B } from 'bwip-js/generic';\n",
      ),
    ).toEqual([]);
  });

  it('catches a run-time import of bwip-js or anything else', () => {
    for (const line of [
      "import bwip from 'bwip-js/generic';",
      "import { readFileSync } from 'node:fs';",
      "import { z } from 'zod';",
      "const b = await import('bwip-js/generic');",
      "import type { X } from 'zod';",
    ]) {
      expect(violations(line), line).not.toEqual([]);
    }
  });

  it('catches a global, a clock and a random source of its own', () => {
    for (const line of [
      'globalThis.x;',
      'self.x;',
      'new Date();',
      'Math.random();',
      'fetch(u);',
      'crypto.getRandomValues(a);',
      'btoa(s);',
    ]) {
      expect(violations(line), line).not.toEqual([]);
    }
  });
});

describe('the package source', () => {
  it('imports only its own files and fflate, touches no global, and has no clock or random source of its own', () => {
    const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((name) =>
      name.endsWith('.ts'),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const name of files)
      expect(violations(readFileSync(`${SRC}/${name}`, 'utf8')), name).toEqual([]);
  });
});
