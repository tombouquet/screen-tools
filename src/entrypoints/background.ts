// Opens the recorder in its own small window when the toolbar popup asks (one window
// at a time) and takes screenshots. Opens the home page after installs and version
// changes. Mid-recording the popup is off, so a toolbar click lands here and stops the
// recording.
import { browser } from 'wxt/browser';
import { appUrl } from '@/lib/download';
import type { AppMessage } from '@/lib/messages';
import { takeScreenshot } from '@/lib/screenshot';
import { resetToolbar } from '@/lib/toolbar';
import { currentVersion } from '@/lib/version';

const WINDOW_KEY = 'appWindowId';
const WIDTH = 960;
const HEIGHT = 780;

async function openApp(route = '/'): Promise<void> {
  const { [WINDOW_KEY]: existing } = await browser.storage.session.get(WINDOW_KEY);
  if (typeof existing === 'number') {
    try {
      await browser.windows.update(existing, { focused: true });
      // Only the hash changes, so the page doesn't reload.
      const [tab] = await browser.tabs.query({ windowId: existing });
      if (route !== '/' && tab?.id !== undefined) await browser.tabs.update(tab.id, { url: appUrl(route) });
      return;
    } catch {
      // The window was closed since.
    }
  }
  const created = await browser.windows.create({
    url: appUrl(route),
    type: 'popup',
    width: WIDTH,
    height: HEIGHT,
    focused: true,
    ...(await centredPosition()),
  });
  if (created?.id !== undefined) await browser.storage.session.set({ [WINDOW_KEY]: created.id });
}

/**
 * Centres the recorder over the browser window you're in, so it opens on the same
 * screen. Reading the screen itself would need the system.display permission.
 */
async function centredPosition(): Promise<{ left?: number; top?: number }> {
  try {
    const { left, top, width, height } = await browser.windows.getLastFocused();
    if (left === undefined || top === undefined || width === undefined || height === undefined) return {};
    return {
      left: Math.max(left, Math.round(left + (width - WIDTH) / 2)),
      top: Math.max(top, Math.round(top + (height - HEIGHT) / 2)),
    };
  } catch {
    // No browser window open yet; the browser picks the position.
    return {};
  }
}

/** Asks the recorder to stop. If none answers (it was closed), puts the menu back and opens it. */
async function stopRecording(): Promise<void> {
  const message: AppMessage = { type: 'stopRecording' };
  const stopped = await browser.runtime.sendMessage(message).catch(() => false);
  if (stopped === true) return;
  await resetToolbar();
  // Needs Chrome 127 or a Firefox that allows it here; otherwise the next click opens the menu.
  await browser.action.openPopup?.().catch(() => {});
}

export default defineBackground(() => {
  browser.windows.onRemoved.addListener(async (windowId) => {
    const { [WINDOW_KEY]: existing } = await browser.storage.session.get(WINDOW_KEY);
    if (existing !== windowId) return;
    await browser.storage.session.remove(WINDOW_KEY);
    // Closing the recorder mid-recording leaves no page to put the menu back.
    await resetToolbar();
  });

  // Only fires while the popup is off, i.e. during a countdown or recording.
  browser.action.onClicked.addListener(() => void stopRecording());

  browser.runtime.onMessage.addListener((message: AppMessage) => {
    if (message?.type === 'openApp') void openApp(message.route);
    if (message?.type === 'screenshot') void takeScreenshot(message.mode, message.tabId, message.windowId, message.maxWidth);
  });

  browser.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
    // Reloading an unpacked extension also fires 'update' with the same version, so only a real change counts.
    if (reason === 'install' || (reason === 'update' && previousVersion !== currentVersion())) {
      void browser.tabs.create({ url: appUrl('/home') });
    }
  });

  browser.runtime.onStartup.addListener(() => {
    // Turns the menu back on, in case the browser quit mid-recording.
    void resetToolbar();
  });
});
