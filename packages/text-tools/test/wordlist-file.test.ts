import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readWordList, WORD_LIST_SHA256 } from '../src/index.ts';

const STATIC = fileURLToPath(new URL('../../../apps/web/static/text/', import.meta.url));

describe('the vendored word list', () => {
  const file = readFileSync(`${STATIC}eff_large_wordlist.txt`);

  it('has the checksum the package and the licence record give', () => {
    const sum = createHash('sha256').update(file).digest('hex');
    expect(WORD_LIST_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(sum).toBe(WORD_LIST_SHA256);
    expect(readFileSync(`${STATIC}LICENSES.md`, 'utf8')).toContain(`\`${sum}\``);
  });

  it('is read whole', () => {
    const read = readWordList(file.toString('utf8'));
    if (!read.ok) throw new Error(read.problem);
    expect(read.value).toHaveLength(7_776);
    expect(read.value[0]).toBe('abacus');
    expect(read.value.at(-1)).toBe('zoom');
  });
});
