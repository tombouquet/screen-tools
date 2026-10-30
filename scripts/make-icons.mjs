// Draws the extension icon (red record dot in a ring on a dark rounded square) and
// writes public/icon/{16,32,48,128}.png, which WXT picks up for the manifest.
// No dependencies. Run from the repo root: node scripts/make-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

// Shapes in a 128×128 space, painted in order: [inside(x, y), [r, g, b]].
const roundedRect = (x0, y0, x1, y1, r) => (x, y) => {
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r));
  const dy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 && dx * dx + dy * dy <= r * r;
};
const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

const BG = [23, 23, 23];
const RING = [250, 250, 250];
const DOT = [239, 68, 68];
const shapes = [
  [roundedRect(0, 0, 128, 128, 28), BG],
  [circle(64, 64, 42), RING],
  [circle(64, 64, 34), BG],
  [circle(64, 64, 24), DOT],
];

const SAMPLES = 8;

function render(size) {
  const scale = 128 / size;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let px = 0; px < size; px++) {
      // Average SAMPLES² points per pixel for anti-aliasing.
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) * scale;
          const y = (py + (sy + 0.5) / SAMPLES) * scale;
          let color = null;
          for (const [inside, c] of shapes) if (inside(x, y)) color = c;
          if (color) (r += color[0]), (g += color[1]), (b += color[2]), a++;
        }
      }
      if (a) row.set([r / a, g / a, b / a, (a / SAMPLES ** 2) * 255].map(Math.round), 1 + px * 4);
    }
    rows.push(row);
  }
  return png(size, Buffer.concat(rows));
}

function png(size, pixels) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync('public/icon', { recursive: true });
for (const size of [16, 32, 48, 128]) fs.writeFileSync(`public/icon/${size}.png`, render(size));
