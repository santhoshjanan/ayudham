// A drawing context for bwip-js that records shapes instead of writing SVG, so that one Drawing
// serves the SVG writer, the PDF writer and the page's canvas alike.
//
// Adapted from bwip-js's DrawingSVG (dist/bwip-js-gen.mjs), MIT licence,
// Copyright (c) 2011-2026 Mark Warren.

import type { Drawing, Layer } from './drawing.ts';
import { num } from './drawing.ts';
import type { Bwip } from './encode.ts';

type Point = [number, number];
type Font = { name: string; width: number; height: number; dx: number; rotate?: number };

/** bwip-js's constant for an ellipse as four cubic curves. */
const ELLIPSE_MAGIC = 0.55228475 - 0.00045;

const hex = (rgb: string): string => `#${rgb.toLowerCase()}`;
const bwipColour = (colour: string): string => colour.replace(/^#/, '').toLowerCase();

/** Shapes, by fill colour and rule, merged into one layer each. */
class Layers {
  #byKey = new Map<string, Layer>();
  add(colour: string, d: string, evenOdd: boolean): void {
    const key = `${colour}${evenOdd ? '#e' : ''}`;
    const layer = this.#byKey.get(key);
    if (layer) layer.d += ` ${d}`;
    else
      this.#byKey.set(key, {
        paint: { type: 'solid', colour },
        d,
        ...(evenOdd ? { evenOdd: true as const } : {}),
      });
  }
  get all(): Layer[] {
    return [...this.#byKey.values()];
  }
}

/** Records what bwip-js draws for one code, at scale 1, in its own units. */
export function record(
  bwip: Bwip,
  bcid: string,
  text: string,
  options: Record<string, string | number | boolean>,
  colours: { foreground: string; background: string | null; text?: string },
): Drawing {
  const fontlib = bwip.FontLib;
  const layers = new Layers();
  let opts: Record<string, number | string> = {};
  let width = 0;
  let height = 0;
  let dx = 0;
  let dy = 0;
  let path = '';

  const at = (x: number, y: number): string => `${num(x + dx)} ${num(y + dy)}`;

  const context = {
    setopts(fixed: Record<string, number | string>) {
      opts = fixed;
    },
    scale() {
      // No adjustment: the drawing is vector, in bwip-js's own units.
    },
    measure(str: string, font: string, fwidth: number, fheight: number) {
      const id = fontlib.lookup(font);
      let measured = 0;
      let ascent = 0;
      let descent = 0;
      for (let index = 0; index < str.length; index++) {
        const glyph = fontlib.getglyph(id, str.charCodeAt(index), fwidth | 0, fheight | 0);
        if (!glyph) continue;
        ascent = Math.max(ascent, glyph.top);
        descent = Math.max(descent, glyph.height - glyph.top);
        measured += index === str.length - 1 ? glyph.left + glyph.width : glyph.advance;
      }
      return { width: measured, ascent, descent };
    },
    init(w: number, h: number) {
      const n = (key: string): number => Number(opts[key] ?? 0);
      width = w + n('paddingleft') + n('paddingright');
      height = h + n('paddingtop') + n('paddingbottom');
      dx = n('paddingleft');
      dy = n('paddingtop');
    },
    line(x0: number, y0: number, x1: number, y1: number, lw: number, rgb: string) {
      // A stroke of width lw, recorded as the rectangle it covers. bwip-js hands over coordinates
      // to be snapped as its own drawing does: truncated to whole units, then, for an odd width at
      // scale 1, moved back half a unit. Without that, every odd-width bar sits half a module late.
      const w = Math.round(lw) || 1;
      x0 |= 0;
      y0 |= 0;
      x1 |= 0;
      y1 |= 0;
      if (w & 1) {
        if (x0 === x1) [x0, x1] = [x0 - 0.5, x1 - 0.5];
        if (y0 === y1) [y0, y1] = [y0 - 0.5, y1 - 0.5];
      }
      if (x0 === x1) {
        const top = Math.min(y0, y1);
        const x = x0 - w / 2;
        layers.add(hex(rgb), rectAt(x, top, w, Math.abs(y1 - y0)), false);
      } else {
        const left = Math.min(x0, x1);
        const y = y0 - w / 2;
        layers.add(hex(rgb), rectAt(left, y, Math.abs(x1 - x0), w), false);
      }
    },
    polygon(points: Point[]) {
      path += `${path ? ' ' : ''}M ${at(points[0]![0], points[0]![1])}`;
      for (const [x, y] of points.slice(1)) path += ` L ${at(x, y)}`;
      path += ' Z';
    },
    hexagon(points: Point[]) {
      this.polygon(points);
    },
    ellipse(x: number, y: number, rx: number, ry: number) {
      const kx = rx * ELLIPSE_MAGIC;
      const ky = ry * ELLIPSE_MAGIC;
      path +=
        `${path ? ' ' : ''}M ${at(x - rx, y)}` +
        ` C ${at(x - rx, y - ky)} ${at(x - kx, y - ry)} ${at(x, y - ry)}` +
        ` C ${at(x + kx, y - ry)} ${at(x + rx, y - ky)} ${at(x + rx, y)}` +
        ` C ${at(x + rx, y + ky)} ${at(x + kx, y + ry)} ${at(x, y + ry)}` +
        ` C ${at(x - kx, y + ry)} ${at(x - rx, y + ky)} ${at(x - rx, y)} Z`;
    },
    fill(rgb: string) {
      // bwip-js fills polygons and ellipses even-odd, which is how MaxiCode's rings get their holes.
      if (path) layers.add(hex(rgb), path, true);
      path = '';
    },
    clip() {
      // None of the curated symbologies clips; refuse rather than draw something wrong.
      throw new Error('bwipp.recorderClipUnsupported#0: clipping is not supported');
    },
    unclip() {},
    text(x: number, y: number, str: string, rgb: string, font: Font) {
      const id = fontlib.lookup(font.name);
      const fw = font.width | 0;
      const fh = font.height | 0;
      const angle = ((font.rotate ?? 0) * Math.PI) / 180;
      const origin: Point = [x, y];
      // Glyph points, turned about the text's origin when bwip-js asks for rotated text.
      const turn = (px: number, py: number): string => {
        if (!angle) return at(px, py);
        const ox = px - origin[0];
        const oy = py - origin[1];
        return at(
          origin[0] + ox * Math.cos(angle) + oy * Math.sin(angle),
          origin[1] - ox * Math.sin(angle) + oy * Math.cos(angle),
        );
      };
      let cursor = x;
      let d = '';
      for (let index = 0; index < str.length; index++) {
        const code = str.charCodeAt(index);
        const glyph = fontlib.getpaths(id, code, fw, fh);
        if (glyph?.length) {
          let current: Point = [cursor, y];
          for (const segment of glyph) {
            if (segment.type === 'M' || segment.type === 'L') {
              current = [segment.x + cursor, y - segment.y];
              d += `${d ? ' ' : ''}${segment.type} ${turn(...current)}`;
            } else if (segment.type === 'Q') {
              // A quadratic curve, written as the cubic curve that traces it exactly.
              const control: Point = [segment.cx + cursor, y - segment.cy];
              const end: Point = [segment.x + cursor, y - segment.y];
              const c1: Point = [
                current[0] + (2 / 3) * (control[0] - current[0]),
                current[1] + (2 / 3) * (control[1] - current[1]),
              ];
              const c2: Point = [
                end[0] + (2 / 3) * (control[0] - end[0]),
                end[1] + (2 / 3) * (control[1] - end[1]),
              ];
              d += ` C ${turn(...c1)} ${turn(...c2)} ${turn(...end)}`;
              current = end;
            } else {
              const end: Point = [segment.x + cursor, y - segment.y];
              d += ` C ${turn(segment.cx1 + cursor, y - segment.cy1)} ${turn(segment.cx2 + cursor, y - segment.cy2)} ${turn(...end)}`;
              current = end;
            }
          }
          d += ' Z';
        }
        cursor += fontlib.getglyph(id, code, fw, fh).advance + (font.dx | 0);
      }
      if (d) layers.add(hex(rgb), d, false);
    },
    end() {
      return null;
    },
  };

  const rectAt = (x: number, y: number, w: number, h: number): string =>
    `M ${at(x, y)} L ${at(x + w, y)} L ${at(x + w, y + h)} L ${at(x, y + h)} Z`;

  const params = {
    bcid,
    text,
    ...options,
    scale: 1,
    barcolor: bwipColour(colours.foreground),
    textcolor: bwipColour(colours.text ?? colours.foreground),
    ...(colours.background && colours.background !== 'transparent'
      ? { backgroundcolor: bwipColour(colours.background) }
      : {}),
  };
  bwip.render(params as never, context as never);
  return {
    width,
    height,
    background:
      colours.background && colours.background !== 'transparent'
        ? { type: 'solid', colour: colours.background.toLowerCase() }
        : null,
    layers: layers.all,
    logo: null,
  };
}
