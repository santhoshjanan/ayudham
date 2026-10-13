// Turns a downloaded Schema.org release file into the vocabulary file the builder reads.
//   node packages/schema-builder/scripts/compact-vocabulary.ts <release.jsonld> <version> <out.json>
// Run by hand when moving to a new release, then update apps/web/static/schema/LICENSES.md.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { compact } from './compact.ts';

const [source, version, target] = process.argv.slice(2);
if (!source || !version || !target) {
  console.error('usage: compact-vocabulary.ts <release.jsonld> <version> <out.json>');
  process.exit(1);
}

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

const release = readFileSync(source);
const output = compact(JSON.parse(release.toString('utf8')), version);
writeFileSync(target, output);

console.log(`release   sha256 ${sha256(release)}`);
console.log(`output    sha256 ${sha256(output)}`);
console.log(`output    ${Buffer.byteLength(output)} bytes, ${gzipSync(output).length} gzipped`);
