/**
 * Captures the Chrome Web Store listing screenshots
 * (docs/guides/listing-screenshots.md). Builds the extension, loads it into a
 * headless Chromium, fills it with made-up recordings and screenshots, and
 * captures each view. Nothing else needs to be running.
 *
 *     pnpm screenshots
 *
 * Writes PNGs to out/screenshots/ at a 1280 × 800 window and 2× pixel density.
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { build } from 'wxt';
import { RECORDING_PAGE, SAMPLE_PAGES, type SamplePage } from './listing-samples.ts';

interface Shot {
  name: string;
  /** An extension page and hash route, such as `app.html#/videos`. */
  page: string;
  /** Text or a selector that shows once the view has its data. */
  ready: string;
  /** Sets up the view once it's ready, such as opening a dialog. */
  prepare?: (page: Page) => Promise<void>;
  /** Captures only this element, for views smaller than the window. */
  element?: string;
}

/** Seeded ids: rows are added oldest first to a fresh profile, so ids start at 1. */
const NEWEST_RECORDING = 5;
const NEWEST_SCREENSHOT = SAMPLE_PAGES.length;

const SHOTS: Shot[] = [
  { name: '01-recorder', page: 'app.html#/', ready: 'text=Start recording' },
  { name: '02-popup', page: 'popup.html', ready: 'text=Capture full page', element: '#root > div' },
  {
    name: '03-screenshot-editor',
    page: `app.html#/screenshots/${NEWEST_SCREENSHOT}`,
    ready: 'canvas',
    prepare: annotate,
  },
  { name: '04-screenshots', page: 'app.html#/screenshots', ready: 'img' },
  { name: '05-videos', page: 'app.html#/videos', ready: 'text=Not saved' },
  {
    name: '06-video',
    page: `app.html#/videos/${NEWEST_RECORDING}`,
    ready: 'video',
    prepare: (page) => showFrame(page, 3.2),
  },
  {
    name: '07-save-dialog',
    page: `app.html#/videos/${NEWEST_RECORDING}`,
    ready: 'video',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Save video' }).click();
      await page.getByText('% smaller').first().waitFor();
      await page.getByText('Balanced', { exact: true }).click();
      // The file name field takes focus with its text selected; drop the selection.
      await page.locator('#file-name').evaluate((input: HTMLInputElement) => input.setSelectionRange(0, 0));
    },
  },
];

const SCALE = 2;
const VIEWPORT = { width: 1280, height: 800 };

/** Size of the made-up pages behind the seeded screenshots, in CSS pixels. */
const SAMPLE_VIEWPORT = { width: 1440, height: 900 };

/** Seeded settings, in the shape of `Settings` in src/lib/settings.ts. */
const SETTINGS = { captureSource: 'screen-camera', audioSource: 'system-microphone', theme: 'system' };

const rootDir = join(import.meta.dirname, '..');
const outDir = join(rootDir, 'out', 'screenshots');
const extensionDir = join(rootDir, '.output', 'chrome-mv3');

await build({ root: rootDir });

const profile = await mkdtemp(join(tmpdir(), 'screen-tools-shots-'));
const context = await chromium.launchPersistentContext(profile, {
  // The full Chromium build; the default headless shell can't load extensions.
  channel: 'chromium',
  headless: true,
  viewport: VIEWPORT,
  deviceScaleFactor: SCALE,
  colorScheme: 'light',
  args: [
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    // A fake camera and microphone, allowed without a prompt, for the permission check in Settings.
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    // GPU raster in headless now and then repaints the editor canvas as stale tiles.
    '--disable-gpu',
  ],
});

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  // URL.origin is "null" for chrome-extension URLs in Node.
  const origin = `chrome-extension://${new URL(worker.url()).host}`;

  await seed(context, origin);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const shot of SHOTS) {
    await capture(context, origin, shot, join(outDir, `${shot.name}.png`));
    console.log(`${shot.name}.png`);
  }
  console.log(`\nSaved to ${outDir}`);
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}

async function capture(context: BrowserContext, origin: string, shot: Shot, path: string) {
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(`  page error: ${error.message}`));
  await page.goto(`${origin}/${shot.page}`);
  await page.locator(shot.ready).first().waitFor({ timeout: 30_000 });
  await shot.prepare?.(page);
  // Let fonts, images and any transitions settle.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await (shot.element ? page.locator(shot.element).screenshot({ path }) : page.screenshot({ path }));
  await page.close();
}

/**
 * Fills the extension with made-up screenshots and recordings, and the settings
 * the shots show. Writes straight to IndexedDB in the schema of src/lib/db.ts.
 */
async function seed(context: BrowserContext, origin: string) {
  const screenshots = [];
  for (const sample of SAMPLE_PAGES) screenshots.push({ title: sample.title, url: sample.url, ...(await renderSample(context, sample)) });
  const video = await recordSample(context, await renderSample(context, RECORDING_PAGE));

  const page = await context.newPage();
  await page.goto(`${origin}/app.html#/player`);
  await page.evaluate(
    async ({ screenshots, video, settings }) => {
      localStorage.setItem('settings', JSON.stringify(settings));
      const bytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

      // The app opens the same database on load; whichever opens first creates the stores.
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('screen-tools', 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('recordings', { autoIncrement: true });
          request.result.createObjectStore('chunks', { autoIncrement: true }).createIndex('recording', 'recording');
          request.result.createObjectStore('screenshots', { autoIncrement: true });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const done = (tx: IDBTransaction) =>
        new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

      const shotsTx = db.transaction('screenshots', 'readwrite');
      screenshots.forEach((shot, i) => {
        const blob = new Blob([bytes(shot.png)], { type: 'image/png' });
        shotsTx.objectStore('screenshots').add({
          date: ago((screenshots.length - i) * 47),
          blob,
          original: blob,
          width: shot.width,
          height: shot.height,
          title: shot.title,
          url: shot.url,
          saved: i % 2 === 0,
        });
      });
      await done(shotsTx);

      // Oldest first. The newest is the one the player and save dialog shots open.
      const videoBlob = new Blob([bytes(video.data)], { type: 'video/webm' });
      const recordings = [
        { minutes: 4 * 24 * 60, durationMs: 312_000, saved: true },
        { minutes: 2 * 24 * 60 + 95, durationMs: 98_000, saved: true },
        { minutes: 26 * 60, durationMs: undefined, saved: false },
        { minutes: 190, durationMs: 1_046_000, saved: true },
        { minutes: 12, durationMs: video.durationMs, saved: false },
      ];
      for (const recording of recordings) {
        const tx = db.transaction(['recordings', 'chunks'], 'readwrite');
        const id = await new Promise<IDBValidKey>((resolve) => {
          const request = tx.objectStore('recordings').add({
            date: ago(recording.minutes),
            mimeType: 'video/webm;codecs=vp9',
            durationMs: recording.durationMs,
            saved: recording.saved,
            seekable: true,
          });
          request.onsuccess = () => resolve(request.result);
        });
        tx.objectStore('chunks').add({ recording: id, data: videoBlob });
        await done(tx);
      }
      db.close();
    },
    { screenshots, video, settings: SETTINGS },
  );
  await page.close();
}

/** Renders a made-up page at 2×, as a screenshot of it would come out on a high-density screen. */
async function renderSample(context: BrowserContext, sample: SamplePage) {
  const page = await context.newPage();
  await page.setViewportSize(SAMPLE_VIEWPORT);
  await page.setContent(sample.html);
  const png = (await page.screenshot()).toString('base64');
  await page.close();
  return { png, width: SAMPLE_VIEWPORT.width * SCALE, height: SAMPLE_VIEWPORT.height * SCALE };
}

/**
 * Records a short 1080p WebM of a pointer moving over a made-up page, with
 * Chrome's own MediaRecorder, and writes its duration in so it's seekable.
 */
async function recordSample(context: BrowserContext, frame: { png: string }) {
  const page = await context.newPage();
  await page.goto('about:blank');
  const video = await page.evaluate(async (png) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const context = canvas.getContext('2d')!;
    const seconds = 8;

    const draw = (t: number) => {
      // A slow zoom towards the chart, with a pointer gliding across it.
      const zoom = 1 + 0.12 * t;
      const width = image.width / zoom;
      const height = (width * 1080) / 1920;
      context.drawImage(image, (image.width - width) * 0.35 * t, 0, width, height, 0, 0, 1920, 1080);
      const x = 420 + 900 * t;
      const y = 640 - 160 * Math.sin(t * Math.PI);
      context.fillStyle = 'rgb(239 68 68 / 30%)';
      context.beginPath();
      context.arc(x, y, 34, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#0f172a';
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x, y + 34);
      context.lineTo(x + 9, y + 26);
      context.lineTo(x + 24, y + 26);
      context.closePath();
      context.fill();
    };

    draw(0);
    const recorder = new MediaRecorder(canvas.captureStream(30), {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 12_000_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    const start = performance.now();
    recorder.start();
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        const t = (performance.now() - start) / 1000 / seconds;
        draw(Math.min(1, t));
        if (t >= 1) {
          clearInterval(timer);
          resolve();
        }
      }, 1000 / 30);
    });
    recorder.stop();
    await stopped;
    const durationMs = Math.round(performance.now() - start);
    const blob = new Blob(chunks, { type: 'video/webm' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { data: btoa(binary), durationMs };
  }, frame.png);
  await page.close();
  return video;
}

/** Seeks the player so it shows a frame from mid-recording rather than the first one. */
async function showFrame(page: Page, seconds: number) {
  const video = page.locator('video');
  await video.evaluate((element: HTMLVideoElement, seconds) => (element.currentTime = seconds), seconds);
  // Wait until the frame is decoded and the loading spinner has gone.
  await page.waitForFunction(() => {
    const element = document.querySelector('video');
    return element && !element.seeking && element.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA;
  });
  await page.waitForTimeout(1000);
}

/**
 * Draws on the seeded dashboard with the editor's own tools: a box round the
 * revenue card, an arrow and a note on the busiest day, a highlight on the
 * heading, and the customer emails pixelated. Points are fractions of the image.
 */
async function annotate(page: Page) {
  const canvas = page.locator('canvas');
  // The canvas starts empty at 300 × 150; wait for the screenshot to load and the preview to settle at its size.
  await page.waitForFunction(() => {
    const element = document.querySelector('canvas');
    return element && element.width > 300 && element.getBoundingClientRect().width > 600;
  });
  await page.waitForTimeout(300);
  const box = (await canvas.boundingBox())!;
  const at = (x: number, y: number) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
  const drag = async (from: [number, number], to: [number, number]) => {
    const a = at(...from);
    const b = at(...to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 12 });
    await page.mouse.up();
  };
  const tool = (label: string) => page.getByRole('button', { name: label, exact: true }).click();
  const colour = (hex: string) => page.getByRole('radio', { name: hex }).click();

  await tool('Rectangle');
  await drag([0.016, 0.178], [0.262, 0.352]);
  await tool('Highlighter');
  await colour('#f59e0b');
  await drag([0.026, 0.124], [0.172, 0.124]);
  await tool('Arrow');
  await colour('#ef4444');
  await drag([0.25, 0.445], [0.405, 0.47]);
  await tool('Text');
  const note = at(0.04, 0.41);
  // Only a pointerdown: under Playwright the mousedown that follows a click takes
  // focus from the new text box, which closes it empty.
  await canvas.dispatchEvent('pointerdown', { clientX: note.x, clientY: note.y, button: 0, pointerId: 1, isPrimary: true });
  const input = page.getByPlaceholder('Type, then Enter');
  await input.waitFor();
  await input.fill('Busiest day');
  await input.press('Enter');
  await tool('Blur (pixelate)');
  await drag([0.675, 0.5], [0.8, 0.77]);
  // Park the pointer off the canvas so no hover state shows.
  await page.mouse.move(2, 2);
}
