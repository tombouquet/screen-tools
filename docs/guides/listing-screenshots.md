# Listing screenshots

The Chrome Web Store listing images are built from screenshots of the real extension, running on made-up recordings and screenshots. Read this guide to capture the screenshots, change what they show, or add one.

## Capturing the screenshots

Run the capture script from the repo root:

```bash
pnpm screenshots
```

The script builds the extension, loads it into a headless Chromium, and saves 7 views to `out/screenshots/`:

| File                       | View                                                            |
| -------------------------- | --------------------------------------------------------------- |
| `01-recorder.png`          | Record page, with Screen + camera and System + mic picked       |
| `02-popup.png`             | Toolbar popup, cropped to the menu                              |
| `03-screenshot-editor.png` | Screenshot editor with a box, arrow, note, highlight and pixelate |
| `04-screenshots.png`       | Screenshots list                                                |
| `05-videos.png`            | Latest videos, including an interrupted recording               |
| `06-video.png`             | A recording in the player                                       |
| `07-save-dialog.png`       | Save dialog with the size presets and Balanced picked           |

Each view is captured at a 1280 × 800 window and 2× pixel density, so 2560 × 1600 pixels, which keeps crops sharp when they're enlarged. The listing images themselves are built from these captures by a second script, in the style set out in [Listing image style](../reference/listing-image-style.md#image-set). To capture at 1× instead, set `SCALE` in the script to 1.

The first run on a machine can fail with "Executable doesn't exist". Download the browser once, then rerun the script:

```bash
pnpm exec playwright install chromium
```

`out/` is ignored by git, so the captures never end up in a commit.

## How the capture works

[`scripts/capture-screenshots.ts`](../../scripts/capture-screenshots.ts) runs `wxt build`, then starts Playwright's Chromium with the built extension from `.output/chrome-mv3` loaded through `--load-extension`, and opens the extension's own pages: `app.html#/…` and `popup.html`.

The script loads the real extension instead of running its pages on a dev server with the `chrome.*` APIs stubbed out:

- Every `chrome.*` call works as it does for a user, so a new API call in a page can't break the capture or show a state no user sees.
- No screenshot code goes into `src/`, so nothing can leak into the production build.
- IndexedDB and `localStorage` belong to the extension's origin, so the script can fill them before it opens a page.

It needs the full Chromium build (`channel: 'chromium'`), because Playwright's default headless shell can't load extensions. Chromium also gets a fake camera and microphone, allowed without a prompt.

## The data

Before capturing, the script fills the extension with made-up data, so every view looks in use:

- **Screenshots:** [`scripts/listing-samples.ts`](../../scripts/listing-samples.ts) holds 4 made-up web pages: an analytics dashboard, a docs site, a bakery and a task board. The script renders each one at 1440 × 900 and 2× in a plain tab, and stores the result as a screenshot with the page's title and address.
- **Recordings:** the script records an 8-second 1080p WebM of a pointer moving over the dashboard, with Chrome's own `MediaRecorder` on a canvas. It stores it as 5 recordings with different dates, lengths and saved states. One has no length, so Latest videos shows it as interrupted and recovered.
- **Settings:** Screen + camera and System + mic are picked on the Record page.

Every name, number, email address and site in the data is invented, and every address uses the `.example` domain. Dates count back from the moment you capture, so the screenshots always look recent.

The script writes the data straight to IndexedDB, in the schema of [`src/lib/db.ts`](../../src/lib/db.ts). When that schema changes, change `seed` in the script to match.

## Adding a screenshot

Each screenshot is an entry in `SHOTS` in the capture script: a file name, the extension page to open, and a `ready` locator that shows once the view has its data. To set up the view first, such as opening a dialog, give the entry a `prepare` function. To capture one element instead of the window, as with the popup, give it an `element` selector.

The editor shot draws its annotations with the editor's own tools, through Playwright's mouse, in `annotate`. Points there are fractions of the image, so they hold when the window size changes. Placing text dispatches only a `pointerdown` on the canvas: under Playwright, the `mousedown` that follows a full click takes focus from the new text box, and the box closes empty.

Chromium is started with `--disable-gpu`: with GPU raster on, the editor canvas now and then repaints as stale tiles, which show as a 2 × 2 grid of the same image.
