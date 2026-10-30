// A squircle (superellipse, |x|ⁿ + |y|ⁿ = 1): a square with continuously curved
// corners, like app icons. Points are in unit space, -1 to 1 on both axes, so the
// canvas compositor and the settings preview can share one outline.
const EXPONENT = 4.5;
const STEPS = 96;

export const SQUIRCLE_POINTS: readonly (readonly [number, number])[] = Array.from({ length: STEPS }, (_, i) => {
  const t = (i / STEPS) * Math.PI * 2;
  const curve = (v: number) => Math.sign(v) * Math.abs(v) ** (2 / EXPONENT);
  return [curve(Math.cos(t)), curve(Math.sin(t))] as const;
});

/** Adds a squircle filling the box to the current canvas path. */
export function traceSquircle(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const r = size / 2;
  SQUIRCLE_POINTS.forEach(([px, py], i) => {
    const sx = x + r + px * r;
    const sy = y + r + py * r;
    if (i === 0) context.moveTo(sx, sy);
    else context.lineTo(sx, sy);
  });
  context.closePath();
}

/** The same outline as a CSS clip-path. */
export const SQUIRCLE_CLIP_PATH = `polygon(${SQUIRCLE_POINTS.map(
  ([px, py]) => `${(((px + 1) / 2) * 100).toFixed(2)}% ${(((py + 1) / 2) * 100).toFixed(2)}%`,
).join(', ')})`;
