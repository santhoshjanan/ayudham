import { gradientAxis, gradientRadius, type Drawing, type Paint } from '@ayudham/code-maker';

type Context = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function fillOf(context: Context, paint: Paint, drawing: Drawing): string | CanvasGradient {
  if (paint.type === 'solid') return paint.colour;
  if (paint.type === 'linear') {
    const { x1, y1, x2, y2 } = gradientAxis(paint, drawing.width, drawing.height);
    const gradient = context.createLinearGradient(x1, y1, x2, y2);
    gradient.addColorStop(0, paint.from);
    gradient.addColorStop(1, paint.to);
    return gradient;
  }
  const { cx, cy, r } = gradientRadius(drawing.width, drawing.height);
  const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, r);
  gradient.addColorStop(0, paint.inner);
  gradient.addColorStop(1, paint.outer);
  return gradient;
}

/**
 * Paints a drawing onto a canvas, `scale` pixels to a unit: the same shapes, gradients and logo
 * the SVG and PDF writers draw, so every format shows the same code.
 */
export function drawOn(context: Context, drawing: Drawing, scale: number): void {
  context.save();
  context.scale(scale, scale);
  if (drawing.background) {
    context.fillStyle = fillOf(context, drawing.background, drawing);
    context.fillRect(0, 0, drawing.width, drawing.height);
  }
  for (const layer of drawing.layers) {
    context.fillStyle = fillOf(context, layer.paint, drawing);
    context.fill(new Path2D(layer.d), layer.evenOdd ? 'evenodd' : 'nonzero');
  }
  if (drawing.logo) {
    const { width, height, rgba, x, y, size } = drawing.logo;
    const image = new OffscreenCanvas(width, height);
    image
      .getContext('2d')!
      .putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    // Fitted in its square, centred, keeping its proportions.
    const fit = size / Math.max(width, height);
    const w = width * fit;
    const h = height * fit;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, x + (size - w) / 2, y + (size - h) / 2, w, h);
  }
  context.restore();
}
