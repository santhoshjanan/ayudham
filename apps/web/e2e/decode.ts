import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// The test-only decoder. It downloads its WebAssembly from a public CDN unless handed the bytes,
// so it is always handed the local file, and any attempt at the network fails loudly.
const require = createRequire(import.meta.url);
const wasm = readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm'));

let ready: Promise<typeof import('zxing-wasm/reader')> | undefined;

function reader() {
  ready ??= (async () => {
    const zxing = await import('zxing-wasm/reader');
    const fetched = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error('the test decoder may not use the network');
    };
    try {
      await zxing.prepareZXingModule({
        overrides: {
          wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.length),
        },
        fireImmediately: true,
      });
    } finally {
      globalThis.fetch = fetched;
    }
    return zxing;
  })();
  return ready;
}

export type Decoded = { text: string; format: string; hasECI: boolean; bytes: Uint8Array };

/** The first code found in a PNG (or JPG), or null. */
export async function decodePng(png: Buffer, formats: string[] = []): Promise<Decoded | null> {
  const zxing = await reader();
  const found = await zxing.readBarcodes(new Uint8Array(png), {
    tryHarder: true,
    formats: formats as never,
  });
  const first = found.find((code) => code.isValid);
  return first
    ? { text: first.text, format: first.format, hasECI: first.hasECI, bytes: first.bytes }
    : null;
}
