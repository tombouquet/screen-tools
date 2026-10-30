/**
 * Builds the Chrome Web Store listing images from the screenshot captures, in
 * the style set out in docs/reference/listing-image-style.md: a near-black
 * background, a headline with its benefit in red, ticks, and a crop of real UI
 * with one highlighted element.
 *
 *     pnpm screenshots   # captures first
 *     pnpm showcase
 *
 * Writes upload-ready images and their alt text to out/showcase/: 5
 * screenshots at 1280 × 800, a small promo tile at 440 × 280 and a marquee
 * promo tile at 1400 × 560, all PNGs with no alpha channel. Crops are in CSS
 * pixels of the capture (half its pixel size): when a captured view's layout
 * moves, update its crop here.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

/** A region of a capture, in CSS pixels. */
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Crop {
  /** A file under out/screenshots/, such as `03-screenshot-editor.png`. */
  capture: string;
  rect: Rect;
  /** How much to enlarge the crop on the canvas. */
  scale: number;
  /** Where the crop's top left corner sits on the canvas. */
  left: number;
  top: number;
  /** The one element to outline, in the same CSS pixels as `rect`. */
  highlight?: Rect;
}

interface Image {
  name: string;
  layout: 'split' | 'stacked' | 'small-tile' | 'marquee';
  /** The headline; the part after `|` shows in the accent colour. */
  headline: string;
  /** For promo tiles: a short line under the name. */
  tagline?: string;
  ticks: string[];
  crops: Crop[];
  alt: string;
}

/** Canvas size per layout, from the Chrome Web Store's image sizes. */
const SIZES: Record<Image['layout'], { width: number; height: number }> = {
  split: { width: 1280, height: 800 },
  stacked: { width: 1280, height: 800 },
  'small-tile': { width: 440, height: 280 },
  marquee: { width: 1400, height: 560 },
};

/** Captures are taken at 2× pixel density. */
const CAPTURE_SCALE = 2;

const IMAGES: Image[] = [
  {
    name: '01-record',
    layout: 'split',
    headline: 'Record your screen | and camera',
    ticks: ['Screen, window, tab or camera', 'Microphone and system audio', 'MP4 or WebM, up to 60 fps'],
    crops: [
      {
        capture: '01-recorder.png',
        rect: { x: 316, y: 128, width: 648, height: 568 },
        scale: 1.02,
        left: 584,
        top: 116,
        highlight: { x: 743, y: 264, width: 186, height: 88 },
      },
    ],
    alt: 'Recorder with screen and camera capture and system audio picked',
  },
  {
    name: '02-screenshot-editor',
    layout: 'stacked',
    headline: 'Mark up | any screenshot',
    ticks: ['Arrows, boxes and text', 'Pixelate private details', 'Crop, then copy or download'],
    crops: [
      {
        capture: '03-screenshot-editor.png',
        rect: { x: 0, y: 104, width: 1280, height: 616 },
        scale: 0.875,
        left: 80,
        top: 262,
        // The drawing tools and colours.
        highlight: { x: 30, y: 122, width: 456, height: 32 },
      },
    ],
    alt: 'Screenshot editor with a box, arrow, note and pixelated names',
  },
  {
    name: '03-latest-videos',
    layout: 'stacked',
    headline: 'Never lose | a recording',
    ticks: ['Saved to disk as you record', 'Recover one after a crash', 'Your latest 5 kept'],
    crops: [
      {
        capture: '05-videos.png',
        rect: { x: 204, y: 60, width: 874, height: 420 },
        scale: 1.28,
        left: 80,
        top: 262,
        highlight: { x: 222, y: 276, width: 838, height: 60 },
      },
    ],
    alt: 'Latest videos list with a recording recovered after a crash',
  },
  {
    name: '04-save-smaller',
    layout: 'split',
    headline: 'Smaller files, | ready to share',
    ticks: ['Size presets with estimates', 'Compressed on your computer', 'The original is kept'],
    crops: [
      {
        capture: '07-save-dialog.png',
        rect: { x: 384, y: 70, width: 512, height: 660 },
        scale: 1.02,
        left: 640,
        top: 70,
        highlight: { x: 400, y: 386, width: 480, height: 64 },
      },
    ],
    alt: 'Save dialog with size presets and estimated file sizes',
  },
  {
    name: '05-toolbar',
    layout: 'split',
    headline: 'One click | from the toolbar',
    ticks: ['Start a recording', 'Area, visible area or full page', 'Open videos and screenshots'],
    crops: [
      {
        capture: '02-popup.png',
        rect: { x: 0, y: 0, width: 288, height: 444 },
        scale: 1.5,
        left: 724,
        top: 66,
        highlight: { x: 12, y: 240, width: 264, height: 132 },
      },
    ],
    alt: 'Toolbar menu with record and screenshot buttons',
  },
  {
    name: 'small-promo-tile',
    layout: 'small-tile',
    headline: 'Screen Tools',
    tagline: 'Record your screen and | mark up screenshots',
    ticks: [],
    crops: [],
    alt: 'Screen Tools logo with its name and tagline',
  },
  {
    name: 'marquee-promo-tile',
    layout: 'marquee',
    headline: 'Screen Tools',
    tagline: 'Record your screen and | mark up screenshots',
    ticks: [],
    crops: [
      // The recorder, with the toolbar menu in front of it.
      {
        capture: '01-recorder.png',
        rect: { x: 316, y: 128, width: 648, height: 568 },
        scale: 0.8,
        left: 770,
        top: 62,
      },
      {
        capture: '02-popup.png',
        rect: { x: 0, y: 0, width: 288, height: 444 },
        scale: 1,
        left: 590,
        top: 96,
      },
    ],
    alt: 'Screen Tools logo beside its toolbar menu and recorder',
  },
];

const rootDir = join(import.meta.dirname, '..');
const capturesDir = join(rootDir, 'out', 'screenshots');
const outDir = join(rootDir, 'out', 'showcase');
const iconPath = join(rootDir, 'public', 'icon', '128.png');

/** Every colour and size comes from docs/reference/listing-image-style.md. */
const CSS = `
@import url("https://rsms.me/inter/inter.css");
* { box-sizing: border-box; }
body {
  position: relative; margin: 0; overflow: hidden;
  font-family: InterDisplay, Inter, sans-serif; color: #fff;
  background:
    radial-gradient(720px 560px at 6% 108%, rgb(239 68 68 / 26%), transparent 62%),
    radial-gradient(900px 640px at 96% -12%, rgb(64 64 72 / 70%), transparent 70%),
    #111113;
}
.motif { position: absolute; color: rgb(248 113 113 / 7%); }
.logo { position: absolute; top: 56px; left: 80px; display: flex; align-items: center; gap: 12px; font: 600 22px/1 Inter, sans-serif; }
.logo img { width: 44px; height: 44px; }
.text { position: absolute; left: 80px; }
h1 { margin: 0; font-size: 52px; font-weight: 700; line-height: 1.08; letter-spacing: -0.01em; }
em { font-style: normal; color: #f87171; }
ul { display: grid; gap: 16px; margin: 34px 0 0; padding: 0; list-style: none; }
.stacked ul { display: flex; gap: 36px; margin-top: 22px; }
li { display: flex; align-items: center; gap: 12px; font: 500 20px/1.3 Inter, sans-serif; color: #e4e4e7; }
li svg { flex: none; }
.ui {
  position: absolute; border-radius: 14px; background-repeat: no-repeat; background-color: #fff;
  box-shadow: 0 26px 70px rgb(0 0 0 / 55%), 0 0 0 1px rgb(255 255 255 / 8%);
}
.highlight {
  position: absolute; border: 3px solid #f87171; border-radius: 12px;
  box-shadow: 0 0 0 6px rgb(248 113 113 / 18%), 0 0 36px rgb(248 113 113 / 35%);
}
.tile { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.tile img { width: 76px; height: 76px; margin-bottom: 16px; }
.tile h1 { font-size: 38px; }
.tile p { margin: 10px 0 0; font: 500 18px/1.3 Inter, sans-serif; color: #e4e4e7; }
.marquee .brand { position: absolute; left: 80px; top: 50%; transform: translateY(-50%); width: 420px; }
.marquee .brand img { width: 104px; height: 104px; margin-bottom: 28px; }
.marquee h1 { font-size: 60px; }
.marquee p { margin: 16px 0 0; font: 500 26px/1.3 Inter, sans-serif; color: #e4e4e7; }
`;

const TICK = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#F87171"/><path d="m7 12.3 3.2 3.2L17 8.8" fill="none" stroke="#111113" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** The icon's ring and dot as an outline, placed partly off the canvas. */
function motif(layout: Image['layout']) {
  const place: Record<Image['layout'], string> = {
    split: 'width:620px;left:-170px;top:430px',
    stacked: 'width:560px;left:900px;top:-260px',
    'small-tile': 'width:340px;left:250px;top:110px',
    marquee: 'width:520px;left:-140px;top:250px',
  };
  return `<svg class="motif" style="${place[layout]}" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="6"/><circle cx="60" cy="60" r="28" fill="currentColor"/></svg>`;
}

/** `plain | accent` → the accent part in red. */
function accented(text: string) {
  const [plain = '', accent = ''] = text.split('|').map((part) => part.trim());
  return accent ? `${plain} <em>${accent}</em>` : plain;
}

/** Text position for each layout, from the style guide's layout table. */
const TEXT_POSITION: Partial<Record<Image['layout'], string>> = {
  split: 'top:210px;width:460px',
  stacked: 'top:124px;right:80px',
};

async function cropHtml(crop: Crop) {
  const png = await readFile(join(capturesDir, crop.capture));
  // PNG width and height sit at bytes 16 and 20 of the header.
  const width = png.readUInt32BE(16) / CAPTURE_SCALE;
  const height = png.readUInt32BE(20) / CAPTURE_SCALE;
  const { rect, scale } = crop;

  const ui = `<div class="ui" style="left:${crop.left}px;top:${crop.top}px;width:${rect.width * scale}px;height:${rect.height * scale}px;background-image:url(data:image/png;base64,${png.toString('base64')});background-size:${width * scale}px ${height * scale}px;background-position:-${rect.x * scale}px -${rect.y * scale}px"></div>`;

  if (!crop.highlight) return ui;
  // The outline sits 8 px outside the element.
  const h = crop.highlight;
  const highlight = `<div class="highlight" style="left:${crop.left + (h.x - rect.x) * scale - 8}px;top:${crop.top + (h.y - rect.y) * scale - 8}px;width:${h.width * scale + 16}px;height:${h.height * scale + 16}px"></div>`;
  return ui + highlight;
}

async function imageHtml(image: Image, icon: string) {
  const { width, height } = SIZES[image.layout];
  const logo = `<img src="${icon}" alt="">`;
  const crops = (await Promise.all(image.crops.map(cropHtml))).join('');
  let content: string;

  if (image.layout === 'small-tile') {
    content = `<div class="tile">${logo}<h1>${image.headline}</h1><p>${accented(image.tagline ?? '').replace('<em>', '<br><em>')}</p></div>`;
  } else if (image.layout === 'marquee') {
    content = `${crops}<div class="brand">${logo}<h1>${image.headline}</h1><p>${accented(image.tagline ?? '')}</p></div>`;
  } else {
    const ticks = image.ticks.length ? `<ul>${image.ticks.map((tick) => `<li>${TICK}${tick}</li>`).join('')}</ul>` : '';
    content = `<div class="logo">${logo}Screen Tools</div>
<div class="text" style="${TEXT_POSITION[image.layout]}"><h1>${accented(image.headline)}</h1>${ticks}</div>
${crops}`;
  }

  return `<!doctype html><html><head><style>${CSS}
body { width: ${width}px; height: ${height}px; }</style></head><body class="${image.layout}">
${motif(image.layout)}
${content}
</body></html>`;
}

/**
 * The Web Store rejects PNGs with an alpha channel. The page is opaque, so
 * Chromium writes 24-bit RGB; stop if that ever changes.
 */
function assertNoAlpha(png: Buffer, name: string): Buffer {
  // Byte 25 of the header is the colour type: 2 is RGB, 6 is RGB with alpha.
  if (png[25] !== 2) throw new Error(`${name}.png has colour type ${png[25]}, not 24-bit RGB`);
  return png;
}

const missing = IMAGES.flatMap((image) => image.crops.map((crop) => crop.capture)).filter(
  (capture) => !existsSync(join(capturesDir, capture)),
);
if (missing.length > 0) {
  throw new Error(`Missing captures: ${[...new Set(missing)].join(', ')}. Run \`pnpm screenshots\` first.`);
}

const icon = `data:image/png;base64,${(await readFile(iconPath)).toString('base64')}`;
const browser = await chromium.launch();

try {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const page = await browser.newPage();

  for (const image of IMAGES) {
    await page.setViewportSize(SIZES[image.layout]);
    await page.setContent(await imageHtml(image, icon), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await writeFile(join(outDir, `${image.name}.png`), assertNoAlpha(await page.screenshot(), image.name));
    console.log(`${image.name}.png`);
  }

  const altText = IMAGES.map((image) => `${image.name}.png\n${image.alt}\n`).join('\n');
  await writeFile(join(outDir, 'alt-text.txt'), altText);
  console.log(`\nSaved to ${outDir}, with alt text in alt-text.txt`);
} finally {
  await browser.close();
}
