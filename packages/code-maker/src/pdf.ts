import { zlibSync } from 'fflate';
import { gradientAxis, gradientRadius, num, type Drawing, type Paint } from './drawing.ts';

export type PdfPage = { kind: 'fit'; widthMm: number } | { kind: 'a4' | 'letter'; widthMm: number };

const POINTS_PER_MM = 72 / 25.4;
const PAGES = { a4: [595.28, 841.89], letter: [612, 792] } as const;

const rgb = (colour: string): string => {
  const valid = /^#[0-9a-f]{6}$/.test(colour) ? colour : '#000000';
  return [1, 3, 5].map((at) => num(parseInt(valid.slice(at, at + 2), 16) / 255)).join(' ');
};

/** Path data in the drawing grammar, as PDF path operators. */
function pathOps(d: string): string {
  const out: string[] = [];
  const tokens = d.trim().split(/\s+/);
  for (let at = 0; at < tokens.length;) {
    const command = tokens[at++];
    if (command === 'M' || command === 'L') {
      out.push(`${tokens[at]} ${tokens[at + 1]} ${command === 'M' ? 'm' : 'l'}`);
      at += 2;
    } else if (command === 'C') {
      out.push(`${tokens.slice(at, at + 6).join(' ')} c`);
      at += 6;
    } else if (command === 'Z') {
      out.push('h');
    } else {
      break;
    }
  }
  return out.join('\n');
}

/** One byte a character, by a plain loop: half a million characters of path data must be quick. */
function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let at = 0; at < text.length; at++) out[at] = text.charCodeAt(at) & 0xff;
  return out;
}

/** A one-page vector PDF of the drawing. No dates, producer or id: the same drawing, the same bytes. */
export function toPdf(drawing: Drawing, page: PdfPage): Uint8Array {
  const scale = (Math.max(1, page.widthMm) * POINTS_PER_MM) / drawing.width;
  const codeWidth = drawing.width * scale;
  const codeHeight = drawing.height * scale;
  const [pageWidth, pageHeight] = page.kind === 'fit' ? [codeWidth, codeHeight] : PAGES[page.kind];
  const left = (pageWidth - codeWidth) / 2;
  const top = (pageHeight - codeHeight) / 2;

  const objects: Uint8Array[] = [];
  const add = (body: Uint8Array | string): number => {
    objects.push(typeof body === 'string' ? latin1(body) : body);
    return objects.length;
  };
  const stream = (dictionary: string, data: Uint8Array): Uint8Array => {
    // The fastest level: on path data it packs as small as level 6, at a quarter of the time.
    const packed = zlibSync(data, { level: 1 });
    const head = latin1(
      `<< ${dictionary} /Filter /FlateDecode /Length ${packed.length} >>\nstream\n`,
    );
    const tail = latin1('\nendstream');
    const out = new Uint8Array(head.length + packed.length + tail.length);
    out.set(head, 0);
    out.set(packed, head.length);
    out.set(tail, head.length + packed.length);
    return out;
  };

  // Objects 1 to 4 are fixed: catalog, pages, page, content. Shadings and images follow.
  const reserved = [new Uint8Array(), new Uint8Array(), new Uint8Array(), new Uint8Array()];
  objects.push(...reserved);
  const shadings: string[] = [];
  const shadingIds = new Map<string, string>();
  const shading = (paint: Exclude<Paint, { type: 'solid' }>): string => {
    const key = JSON.stringify(paint);
    let name = shadingIds.get(key);
    if (!name) {
      name = `Sh${shadingIds.size}`;
      const [c0, c1] =
        paint.type === 'linear' ? [paint.from, paint.to] : [paint.inner, paint.outer];
      const fn = `<< /FunctionType 2 /Domain [0 1] /C0 [${rgb(c0)}] /C1 [${rgb(c1)}] /N 1 >>`;
      let coords: string;
      if (paint.type === 'linear') {
        const { x1, y1, x2, y2 } = gradientAxis(paint, drawing.width, drawing.height);
        coords = `/ShadingType 2 /Coords [${x1} ${y1} ${x2} ${y2}]`;
      } else {
        const { cx, cy, r } = gradientRadius(drawing.width, drawing.height);
        coords = `/ShadingType 3 /Coords [${num(cx)} ${num(cy)} 0 ${num(cx)} ${num(cy)} ${r}]`;
      }
      const id = add(`<< ${coords} /ColorSpace /DeviceRGB /Function ${fn} /Extend [true true] >>`);
      shadings.push(`/${name} ${id} 0 R`);
      shadingIds.set(key, name);
    }
    return name;
  };

  const ops: string[] = [
    // Drawing units, y downwards, placed on the page.
    `q ${num(scale)} 0 0 ${num(-scale)} ${num(left)} ${num(pageHeight - top)} cm`,
  ];
  const paintPath = (paint: Paint, path: string, evenOdd: boolean): void => {
    if (paint.type === 'solid') {
      ops.push(`${rgb(paint.colour)} rg`, path, evenOdd ? 'f*' : 'f');
    } else {
      ops.push('q', path, evenOdd ? 'W* n' : 'W n', `/${shading(paint)} sh`, 'Q');
    }
  };
  if (drawing.background) {
    paintPath(drawing.background, `0 0 ${num(drawing.width)} ${num(drawing.height)} re`, false);
  }
  for (const layer of drawing.layers)
    paintPath(layer.paint, pathOps(layer.d), layer.evenOdd === true);

  let image = '';
  if (drawing.logo && drawing.logo.width > 0 && drawing.logo.height > 0) {
    const { width, height, rgba, x, y, size } = drawing.logo;
    const pixels = width * height;
    const colour = new Uint8Array(pixels * 3);
    const alpha = new Uint8Array(pixels);
    for (let at = 0; at < pixels; at++) {
      colour[at * 3] = rgba[at * 4] ?? 0;
      colour[at * 3 + 1] = rgba[at * 4 + 1] ?? 0;
      colour[at * 3 + 2] = rgba[at * 4 + 2] ?? 0;
      alpha[at] = rgba[at * 4 + 3] ?? 0;
    }
    const mask = add(
      stream(
        `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8`,
        alpha,
      ),
    );
    const picture = add(
      stream(
        `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ${mask} 0 R`,
        colour,
      ),
    );
    image = `/XObject << /Im0 ${picture} 0 R >>`;
    // Fitted inside its square, keeping the image's proportions.
    const fit = Math.min(size / width, size / height);
    const w = width * fit;
    const h = height * fit;
    const ix = x + (size - w) / 2;
    const iy = y + (size - h) / 2;
    ops.push(`q ${num(w)} 0 0 ${num(-h)} ${num(ix)} ${num(iy + h)} cm /Im0 Do Q`);
  }
  ops.push('Q');

  objects[0] = latin1('<< /Type /Catalog /Pages 2 0 R >>');
  objects[1] = latin1('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const resources = `<< ${shadings.length ? `/Shading << ${shadings.join(' ')} >> ` : ''}${image} >>`;
  objects[2] = latin1(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageWidth)} ${num(pageHeight)}] /Resources ${resources} /Contents 4 0 R >>`,
  );
  objects[3] = stream('', latin1(ops.join('\n')));

  // Assemble, keeping each object's byte offset for the cross-reference table.
  const parts: Uint8Array[] = [latin1('%PDF-1.4\n%âãÏÓ\n')];
  const offsets: number[] = [];
  let length = parts[0]!.length;
  objects.forEach((body, index) => {
    offsets.push(length);
    const head = latin1(`${index + 1} 0 obj\n`);
    const tail = latin1('\nendobj\n');
    parts.push(head, body, tail);
    length += head.length + body.length + tail.length;
  });
  const xref = length;
  const table = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  parts.push(
    latin1(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${table}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
    ),
  );
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
