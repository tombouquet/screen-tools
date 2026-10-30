// Opens the recorder in its own small window when the toolbar popup asks (one window
// at a time) and takes screenshots. Opens the changelog after installs and version
// changes. Mid-recording the popup is off, so a toolbar click lands here and stops the
// recording.
import { appUrl } from '@/lib/download';
import type { AppMessage } from '@/lib/messages';
import { takeScreenshot } from '@/lib/screenshot';
import { resetToolbar } from '@/lib/toolbar';
import { currentVersion } from '@/lib/version';

const WINDOW_KEY = 'appWindowId';
const WIDTH = 960;
const HEIGHT = 780;

async function openApp(route = '/'): Promise<void> {
  const { [WINDOW_KEY]: existing } = await chrome.storage.session.get(WINDOW_KEY);
  if (typeof existing === 'number') {
    try {
      await chrome.windows.update(existing, { focused: true });
      // Only the hash changes, so the page doesn't reload.
      const [tab] = await chrome.tabs.query({ windowId: existing });
      if (route !== '/' && tab?.id !== undefined) await chrome.tabs.update(tab.id, { url: appUrl(route) });
      return;
    } catch {
      // The window was closed since.
    }
  }
  const created = await chrome.windows.create({
    url: appUrl(route),
    type: 'popup',
    width: WIDTH,
    height: HEIGHT,
    focused: true,
    ...(await centredPosition()),
  });
  if (created?.id !== undefined) await chrome.storage.session.set({ [WINDOW_KEY]: created.id });
}

/**
 * Centres the recorder over the Chrome window you're in, so it opens on the same
 * screen. Reading the screen itself would need the system.display permission.
 */
async function centredPosition(): Promise<{ left?: number; top?: number }> {
  try {
    const { left, top, width, height } = await chrome.windows.getLastFocused();
    if (left === undefined || top === undefined || width === undefined || height === undefined) return {};
    return {
      left: Math.max(left, Math.round(left + (width - WIDTH) / 2)),
      top: Math.max(top, Math.round(top + (height - HEIGHT) / 2)),
    };
  } catch {
    // No Chrome window open yet; Chrome picks the position.
    return {};
  }
}

/** Asks the recorder to stop. If none answers (it was closed), puts the menu back and opens it. */
async function stopRecording(): Promise<void> {
  const message: AppMessage = { type: 'stopRecording' };
  const stopped = await chrome.runtime.sendMessage(message).catch(() => false);
  if (stopped === true) return;
  await resetToolbar();
  // Needs Chrome 127; on older versions the next click opens the menu.
  await chrome.action.openPopup?.().catch(() => {});
}

export default defineBackground(() => {
  chrome.windows.onRemoved.addListener(async (windowId) => {
    const { [WINDOW_KEY]: existing } = await chrome.storage.session.get(WINDOW_KEY);
    if (existing !== windowId) return;
    await chrome.storage.session.remove(WINDOW_KEY);
    // Closing the recorder mid-recording leaves no page to put the menu back.
    await resetToolbar();
  });

  // Only fires while the popup is off, i.e. during a countdown or recording.
  chrome.action.onClicked.addListener(() => void stopRecording());

  chrome.runtime.onMessage.addListener((message: AppMessage) => {
    if (message?.type === 'openApp') void openApp(message.route);
    if (message?.type === 'screenshot') void takeScreenshot(message.mode, message.tabId, message.windowId, message.maxWidth);
  });

  chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
    // Reloading an unpacked extension also fires 'update' with the same version, so only a real change counts.
    if (reason === 'install' || (reason === 'update' && previousVersion !== currentVersion())) {
      void chrome.tabs.create({ url: appUrl('/changelog') });
    }
  });

  chrome.runtime.onStartup.addListener(() => {
    // Turns the menu back on, in case Chrome quit mid-recording.
    void resetToolbar();
  });
});
