import { gradientAxis, gradientRadius, num, type Drawing, type Paint } from './drawing.ts';

/** Escapes text for an attribute value. Nothing typed reaches the SVG, but nothing is trusted. */
const attr = (value: string | number): string =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64, by hand: the package uses no browser global. */
export function base64(bytes: Uint8Array): string {
  let out = '';
  for (let at = 0; at < bytes.length; at += 3) {
    const a = bytes[at]!;
    const b = bytes[at + 1];
    const c = bytes[at + 2];
    out += ALPHABET[a >> 2]! + ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? '=' : ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? '=' : ALPHABET[c & 63]!;
  }
  return out;
}

/** An SVG file of the drawing, sized when a size is given. The same drawing gives the same text. */
export function toSvg(drawing: Drawing, size: { width: number; height: number } | null): string {
  const { width, height } = drawing;
  const defs: string[] = [];
  const ids = new Map<string, string>();

  const fill = (paint: Paint): string => {
    if (paint.type === 'solid') return attr(paint.colour);
    const key = JSON.stringify(paint);
    let id = ids.get(key);
    if (!id) {
      id = `g${ids.size}`;
      ids.set(key, id);
      if (paint.type === 'linear') {
        const { x1, y1, x2, y2 } = gradientAxis(paint, width, height);
        defs.push(
          `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
            `<stop offset="0" stop-color="${attr(paint.from)}"/><stop offset="1" stop-color="${attr(paint.to)}"/></linearGradient>`,
        );
      } else {
        const { cx, cy, r } = gradientRadius(width, height);
        defs.push(
          `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${num(cx)}" cy="${num(cy)}" r="${r}">` +
            `<stop offset="0" stop-color="${attr(paint.inner)}"/><stop offset="1" stop-color="${attr(paint.outer)}"/></radialGradient>`,
        );
      }
    }
    return `url(#${id})`;
  };

  const body: string[] = [];
  if (drawing.background)
    body.push(
      `<rect width="${num(width)}" height="${num(height)}" fill="${fill(drawing.background)}"/>`,
    );
  for (const layer of drawing.layers) {
    body.push(
      `<path d="${attr(layer.d)}" fill="${fill(layer.paint)}"${layer.evenOdd ? ' fill-rule="evenodd"' : ''}/>`,
    );
  }
  if (drawing.logo) {
    const { x, y, size: side, png } = drawing.logo;
    body.push(
      `<image href="data:image/png;base64,${base64(png)}" x="${num(x)}" y="${num(y)}" width="${num(side)}" height="${num(side)}" preserveAspectRatio="xMidYMid meet"/>`,
    );
  }

  const sized = size ? ` width="${num(size.width)}" height="${num(size.height)}"` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(width)} ${num(height)}"${sized}>` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
    body.join('') +
    '</svg>\n'
  );
}
