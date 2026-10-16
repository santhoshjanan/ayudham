import { describe, expect, it } from 'vitest';
import { gradientAxis, toSvg, type Drawing } from '../src/index.ts';

const BASE: Drawing = {
  width: 29,
  height: 29,
  background: { type: 'solid', colour: '#ffffff' },
  layers: [
    { paint: { type: 'solid', colour: '#111417' }, d: 'M 4 4 L 5 4 L 5 5 L 4 5 Z' },
    {
      paint: { type: 'linear', from: '#0e6f8c', to: '#0a566d', angle: 90 },
      d: 'M 6 6 L 7 6 L 7 7 Z',
    },
    {
      paint: { type: 'radial', inner: '#b3261e', outer: '#6a1b9a' },
      d: 'M 8 8 L 9 8 L 9 9 Z',
      evenOdd: true,
    },
  ],
  logo: null,
};

describe('toSvg', () => {
  it('writes an SVG with a view box, a background and one path per layer', () => {
    const svg = toSvg(BASE, { width: 290, height: 290 });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('viewBox="0 0 29 29"');
    expect(svg).toContain('width="290" height="290"');
    expect(svg.match(/<path /g)).toHaveLength(3);
    expect(svg.match(/<rect /g)).toHaveLength(1);
    expect(svg).toContain('fill-rule="evenodd"');
  });

  it('writes gradients once each, with sequential ids, in the drawing’s own space', () => {
    const svg = toSvg(BASE, null);
    expect(svg).toContain('<linearGradient id="g0" gradientUnits="userSpaceOnUse"');
    expect(svg).toContain('<radialGradient id="g1" gradientUnits="userSpaceOnUse"');
    expect(svg).toContain('fill="url(#g0)"');
    expect(svg).toContain('stop-color="#0e6f8c"');
    const { x1, y1, x2, y2 } = gradientAxis(
      { type: 'linear', from: '#000000', to: '#ffffff', angle: 90 },
      29,
      29,
    );
    expect([x1, x2]).toEqual([14.5, 14.5]);
    expect(y1).toBeLessThan(y2);
  });

  it('is the same every time for the same drawing', () => {
    expect(toSvg(BASE, null)).toBe(toSvg(structuredClone(BASE), null));
  });

  it('places a logo only as a base64 PNG, so its bytes can never become markup', () => {
    const png = new TextEncoder().encode('<script>alert(1)</script>');
    const svg = toSvg(
      {
        ...BASE,
        logo: { width: 2, height: 1, rgba: new Uint8Array(8), png, x: 10, y: 10, size: 9 },
      },
      null,
    );
    expect(svg).toContain('href="data:image/png;base64,');
    expect(svg).toContain('x="10" y="10" width="9" height="9"');
    expect(svg).not.toContain('<script');
    expect(svg).not.toMatch(/\son\w+=/);
    expect(
      [...svg.matchAll(/href="([^"]*)"/g)].every(([, href]) =>
        href!.startsWith('data:image/png;base64,'),
      ),
    ).toBe(true);
  });

  it('writes no text, no script and no foreign reference', () => {
    const svg = toSvg(BASE, null);
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('http://www.w3.org/1999/xlink');
  });

  it('escapes anything odd that reaches it, and leaves out a transparent background', () => {
    const odd: Drawing = {
      ...BASE,
      background: null,
      layers: [{ paint: { type: 'solid', colour: '"><script>' }, d: 'M 0 0 Z' }],
    };
    const svg = toSvg(odd, null);
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('<rect');
  });

  it('encodes base64 exactly', () => {
    const svg = toSvg(
      {
        ...BASE,
        logo: {
          width: 1,
          height: 1,
          rgba: new Uint8Array(4),
          png: new TextEncoder().encode('Man'),
          x: 0,
          y: 0,
          size: 1,
        },
      },
      null,
    );
    expect(svg).toContain('base64,TWFu"');
    const two = toSvg(
      {
        ...BASE,
        logo: {
          width: 1,
          height: 1,
          rgba: new Uint8Array(4),
          png: new TextEncoder().encode('Ma'),
          x: 0,
          y: 0,
          size: 1,
        },
      },
      null,
    );
    expect(two).toContain('base64,TWE="');
  });
});
