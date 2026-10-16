import { describe, expect, it } from 'vitest';
import { decodeBars, decodeGrid, loadBwip } from './helpers.ts';

describe('the decoding helpers', () => {
  it('read back a QR grid made by bwip-js, without the network', async () => {
    const bwip = await loadBwip();
    const [made] = bwip.raw('qrcode', 'hello', {}) as Array<{
      pixs: number[];
      pixx: number;
      pixy: number;
    }>;
    expect(() => fetch('https://example.com/')).toThrow();
    const read = await decodeGrid(Uint8Array.from(made!.pixs), made!.pixx, made!.pixy);
    expect(read).toMatchObject({ text: 'hello', format: 'QRCode' });
  });

  it('read back a Code 128 made by bwip-js', async () => {
    const bwip = await loadBwip();
    const [made] = bwip.raw('code128', 'ABC-123', {}) as Array<{ sbs: number[] }>;
    expect(await decodeBars(made!.sbs)).toMatchObject({ text: 'ABC-123', format: 'Code128' });
  });
});
