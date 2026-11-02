// Takes screenshots of the current tab, in the background worker. The toolbar popup
// grants activeTab for that tab, which covers captureVisibleTab and injecting the area
// picker and scroll helpers. Each shot is stored, then opened in the editor. While the
// area picker is up or a full page scrolls, the popup is off and a toolbar click stops it.
import { browser } from 'wxt/browser';
import { platform } from '@/platform';
import { addScreenshot } from './db';
import { appUrl } from './download';
import type { ScreenshotMode } from './messages';
import {
  cancelAreaSelection,
  hideFixedElements,
  preparePage,
  restorePage,
  scrollPage,
  selectArea,
  type AreaSelection,
  type PageMetrics,
  type ScrollResult,
} from './page-scripts';
import { resetToolbar, showAreaSelection, showFullPageProgress } from './toolbar';

// Chrome allows two captureVisibleTab calls a second; Firefox has no such limit, so the gap is harmless there.
const CAPTURE_GAP_MS = 550;
// Canvas limits: 32 767 px a side and about 268 million pixels.
const MAX_SIDE = 32_767;
const MAX_AREA = 268_000_000;
// Very long pages stop here, about a minute of scrolling.
const MAX_FULL_PAGE_STEPS = 100;

// Stops the area picker or full-page scroll in progress; set only while one runs.
let stopCurrent: (() => void) | undefined;

/**
 * Stops a running screenshot: cancels the area picker, or ends a full page early,
 * keeping what's captured so far. False if none is running.
 */
export function stopScreenshot(): boolean {
  if (!stopCurrent) return false;
  stopCurrent();
  return true;
}

export async function takeScreenshot(mode: ScreenshotMode, tabId: number, windowId: number, maxWidth: number): Promise<void> {
  try {
    const tab = await browser.tabs.get(tabId);
    const captured =
      mode === 'visible'
        ? await captureVisible(windowId)
        : mode === 'area'
          ? await captureArea(tabId, windowId)
          : await captureFullPage(tabId, windowId);
    if (!captured) return;
    const blob = await limitWidth(captured, maxWidth);
    const { width, height } = await createImageBitmap(blob);
    const id = await addScreenshot({ blob, original: blob, width, height, title: tab.title, url: tab.url });
    await browser.tabs.create({ url: appUrl(`/screenshots/${id}`), index: tab.index + 1, openerTabId: tabId });
  } catch (error) {
    // The browser refusing a page is expected; console.error would list it on Chrome's extensions page.
    if (isBlockedPage(error)) console.warn(error);
    else console.error(error);
    browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: "Can't capture this page",
      message: platform.copy.blockedScreenshotMessage,
    });
  }
}

/**
 * The browser's errors for pages extensions can't touch: its own pages, the Web Store
 * ("The extensions gallery cannot be scripted.") and pages without host access.
 * Firefox says "Missing host permission for the tab" or "Missing activeTab permission".
 */
function isBlockedPage(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cannot be scripted|cannot access|permission is required|not in effect|missing (host|activeTab) permission/i.test(message);
}

async function captureVisible(windowId: number): Promise<Blob> {
  const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
  return (await fetch(dataUrl)).blob();
}

async function captureArea(tabId: number, windowId: number): Promise<Blob | undefined> {
  let selection: AreaSelection | null | undefined;
  try {
    await showAreaSelection();
    stopCurrent = () => void browser.scripting.executeScript({ target: { tabId }, func: cancelAreaSelection }).catch(() => {});
    const [injection] = await browser.scripting.executeScript({ target: { tabId }, func: selectArea });
    selection = injection?.result as AreaSelection | null | undefined;
  } finally {
    stopCurrent = undefined;
    await resetToolbar();
  }
  if (!selection) return undefined;
  const image = await createImageBitmap(await captureVisible(windowId));
  // Captured pixels per CSS pixel; covers both screen density and page zoom.
  const scale = image.width / selection.viewportWidth;
  const sx = Math.round(selection.x * scale);
  const sy = Math.round(selection.y * scale);
  const width = Math.min(image.width - sx, Math.round(selection.width * scale));
  const height = Math.min(image.height - sy, Math.round(selection.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.drawImage(image, sx, sy, width, height, 0, 0, width, height);
  return canvas.convertToBlob({ type: 'image/png' });
}

/** Scrolls down the page, stitching shots. Stopped early, it returns the part captured so far, or nothing. */
async function captureFullPage(tabId: number, windowId: number): Promise<Blob | undefined> {
  const run = async <T>(func: (...args: never[]) => T | Promise<T>, args: unknown[] = []): Promise<T> => {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId },
      func: func as () => T,
      args: args as [],
    });
    return injection?.result as T;
  };

  const pageUrl = withoutHash((await browser.tabs.get(tabId)).url);
  const page = await run<PageMetrics>(preparePage);
  let stopRequested = false;
  stopCurrent = () => (stopRequested = true);
  try {
    const stepCount = Math.min(MAX_FULL_PAGE_STEPS, Math.ceil(page.scrollHeight / page.viewportHeight));
    const totalHeight = Math.min(page.scrollHeight, stepCount * page.viewportHeight);
    let canvas: OffscreenCanvas | undefined;
    let scale = 1;
    let lastCapture = 0;
    let capturedHeight = 0;

    for (let step = 0; step < stepCount && !stopRequested; step++) {
      // Also turns the popup off, so a toolbar click can stop the capture.
      await showFullPageProgress(step + 1, stepCount);
      // Clamp the last step to the bottom; the browser would anyway, and we draw where it lands.
      const scrolled = await run<ScrollResult>(scrollPage, [Math.min(step * page.viewportHeight, totalHeight - page.viewportHeight)]);
      if (scrolled.stopped) break;
      const { y } = scrolled;
      if (step === 1) await run(hideFixedElements);
      await sleep(lastCapture + CAPTURE_GAP_MS - Date.now());
      // The shot is of whichever tab is showing, so stop if this one was left or navigated away.
      if (stopRequested || !(await isStillShowing(tabId, windowId, pageUrl))) break;
      lastCapture = Date.now();
      const image = await createImageBitmap(await captureVisible(windowId));

      if (!canvas) {
        const pixelsPerCss = image.width / page.viewportWidth;
        const width = image.width;
        const height = totalHeight * pixelsPerCss;
        // Shrink the whole image if it would be bigger than a canvas can be.
        const fit = Math.min(1, MAX_SIDE / height, MAX_SIDE / width, Math.sqrt(MAX_AREA / (width * height)));
        scale = pixelsPerCss * fit;
        canvas = new OffscreenCanvas(Math.round(width * fit), Math.round(height * fit));
      }
      const context = canvas.getContext('2d')!;
      const top = Math.round(y * scale);
      const height = Math.round(image.height * (canvas.width / image.width));
      context.drawImage(image, 0, top, canvas.width, height);
      capturedHeight = Math.min(canvas.height, Math.max(capturedHeight, top + height));
    }
    if (!canvas) return undefined;
    if (capturedHeight >= canvas.height) return await canvas.convertToBlob({ type: 'image/png' });
    // Stopped early: crop off the part never captured.
    const cropped = new OffscreenCanvas(canvas.width, capturedHeight);
    cropped.getContext('2d')!.drawImage(canvas, 0, 0);
    return await cropped.convertToBlob({ type: 'image/png' });
  } finally {
    stopCurrent = undefined;
    await run(restorePage, [page.scrollX, page.scrollY]).catch(() => undefined);
    await resetToolbar();
  }
}

/** The tab is still the active one in its window, on the same page. Hash changes don't count. */
async function isStillShowing(tabId: number, windowId: number, pageUrl: string): Promise<boolean> {
  const tab = await browser.tabs.get(tabId).catch(() => undefined);
  return !!tab && tab.active && tab.windowId === windowId && withoutHash(tab.url) === pageUrl;
}

const withoutHash = (url: string | undefined) => url?.split('#')[0] ?? '';

/** Scales the image down to `maxWidth`, keeping its shape. 0 or a narrower image passes through. */
async function limitWidth(blob: Blob, maxWidth: number): Promise<Blob> {
  const image = await createImageBitmap(blob);
  if (!maxWidth || image.width <= maxWidth) return blob;
  const width = maxWidth;
  const height = Math.round((image.height * maxWidth) / image.width);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  return canvas.convertToBlob({ type: 'image/png' });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
