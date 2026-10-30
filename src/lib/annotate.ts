// Screenshot annotations: a list of shapes in image pixels plus an optional crop,
// drawn over the captured image. Edits replace the whole Doc, so undo is a history of Docs.

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Tool = 'crop' | 'pen' | 'highlighter' | 'arrow' | 'rect' | 'ellipse' | 'text' | 'blur';

export type Shape =
  | { kind: 'pen' | 'highlighter'; points: Point[]; color: string; size: number }
  | { kind: 'arrow' | 'rect' | 'ellipse'; from: Point; to: Point; color: string; size: number }
  | { kind: 'text'; at: Point; text: string; color: string; size: number }
  | { kind: 'blur'; from: Point; to: Point };

export interface Doc {
  shapes: Shape[];
  /** In image pixels; undefined means the whole image. */
  crop?: Rect;
}

export const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#000000', '#ffffff'];
export const STROKE_SIZES = [1, 2, 4] as const;

/** A stroke width that looks the same on small and large screenshots. */
export const baseStroke = (imageWidth: number) => Math.max(2, Math.round(imageWidth / 400));

export function rectFrom(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

export const fontFor = (size: number) => `600 ${size * 7}px system-ui, sans-serif`;

/** The visible area: the crop, or the whole image. */
export const viewRect = (image: { width: number; height: number }, doc: Doc): Rect =>
  doc.crop ?? { x: 0, y: 0, width: image.width, height: image.height };

/**
 * Draws the image and shapes onto `context`, whose canvas is sized to the view rect.
 * `draft` is a shape still being drawn.
 */
export function render(context: CanvasRenderingContext2D, image: CanvasImageSource & { width: number; height: number }, doc: Doc, draft?: Shape): void {
  const view = viewRect(image, doc);
  context.save();
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.translate(-view.x, -view.y);
  context.drawImage(image, 0, 0);
  for (const shape of draft ? [...doc.shapes, draft] : doc.shapes) drawShape(context, image, shape);
  context.restore();
}

function drawShape(context: CanvasRenderingContext2D, image: CanvasImageSource, shape: Shape): void {
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  switch (shape.kind) {
    case 'pen':
    case 'highlighter': {
      if (shape.kind === 'highlighter') {
        context.globalAlpha = 0.35;
        context.lineWidth = shape.size * 6;
        context.lineCap = 'butt';
      } else {
        context.lineWidth = shape.size;
      }
      context.strokeStyle = shape.color;
      context.beginPath();
      shape.points.forEach((p, i) => (i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y)));
      if (shape.points.length === 1) context.lineTo(shape.points[0]!.x + 0.1, shape.points[0]!.y);
      context.stroke();
      break;
    }
    case 'rect': {
      const r = rectFrom(shape.from, shape.to);
      context.strokeStyle = shape.color;
      context.lineWidth = shape.size;
      context.strokeRect(r.x, r.y, r.width, r.height);
      break;
    }
    case 'ellipse': {
      const r = rectFrom(shape.from, shape.to);
      context.strokeStyle = shape.color;
      context.lineWidth = shape.size;
      context.beginPath();
      context.ellipse(r.x + r.width / 2, r.y + r.height / 2, r.width / 2, r.height / 2, 0, 0, Math.PI * 2);
      context.stroke();
      break;
    }
    case 'arrow': {
      const { from, to } = shape;
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const head = shape.size * 4;
      context.strokeStyle = context.fillStyle = shape.color;
      context.lineWidth = shape.size;
      context.beginPath();
      context.moveTo(from.x, from.y);
      // Stop the line inside the head so its round cap doesn't poke out.
      context.lineTo(to.x - Math.cos(angle) * head * 0.5, to.y - Math.sin(angle) * head * 0.5);
      context.stroke();
      context.beginPath();
      context.moveTo(to.x, to.y);
      context.lineTo(to.x - head * Math.cos(angle - Math.PI / 7), to.y - head * Math.sin(angle - Math.PI / 7));
      context.lineTo(to.x - head * Math.cos(angle + Math.PI / 7), to.y - head * Math.sin(angle + Math.PI / 7));
      context.closePath();
      context.fill();
      break;
    }
    case 'text': {
      context.font = fontFor(shape.size);
      context.textBaseline = 'top';
      context.fillStyle = shape.color;
      // A contrasting outline keeps text readable on any background.
      context.strokeStyle = shape.color === '#ffffff' ? '#000000' : '#ffffff';
      context.lineWidth = Math.max(2, shape.size);
      shape.text.split('\n').forEach((line, i) => {
        const y = shape.at.y + i * shape.size * 8.5;
        context.strokeText(line, shape.at.x, y);
        context.fillText(line, shape.at.x, y);
      });
      break;
    }
    case 'blur': {
      const r = rectFrom(shape.from, shape.to);
      if (r.width < 1 || r.height < 1) break;
      pixelate(context, image, r);
      break;
    }
  }
  context.restore();
}

/** Covers `r` with big blocks of the original image, which can't be undone like a blur. */
function pixelate(context: CanvasRenderingContext2D, image: CanvasImageSource, r: Rect): void {
  const block = Math.max(8, Math.round(Math.min(r.width, r.height) / 12));
  const small = new OffscreenCanvas(Math.max(1, Math.ceil(r.width / block)), Math.max(1, Math.ceil(r.height / block)));
  const smallContext = small.getContext('2d')!;
  smallContext.drawImage(image, r.x, r.y, r.width, r.height, 0, 0, small.width, small.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(small, 0, 0, small.width, small.height, r.x, r.y, r.width, r.height);
}

/** The finished image: crop and shapes flattened in. */
export function flatten(image: CanvasImageSource & { width: number; height: number }, doc: Doc, type: 'image/png' | 'image/jpeg'): Promise<Blob> {
  const view = viewRect(image, doc);
  const canvas = new OffscreenCanvas(Math.round(view.width), Math.round(view.height));
  const context = canvas.getContext('2d')! as unknown as CanvasRenderingContext2D;
  render(context, image, doc);
  return canvas.convertToBlob({ type, quality: 0.92 });
}
