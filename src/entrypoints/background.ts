// Opens the recorder in its own small window when the toolbar popup asks (one window
// at a time), takes screenshots, and runs the update check. Opens the changelog after
// installs and version changes.
import { appUrl } from '@/lib/download';
import type { AppMessage } from '@/lib/messages';
import { takeScreenshot } from '@/lib/screenshot';
import { CHECK_ALARM, applyBadge, checkForUpdate, checkIfStale, openUpdateNotification, scheduleChecks } from '@/lib/updates';
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

export default defineBackground(() => {
  chrome.windows.onRemoved.addListener(async (windowId) => {
    const { [WINDOW_KEY]: existing } = await chrome.storage.session.get(WINDOW_KEY);
    if (existing === windowId) await chrome.storage.session.remove(WINDOW_KEY);
  });

  chrome.runtime.onMessage.addListener((message: AppMessage) => {
    if (message?.type === 'checkForUpdate') void checkIfStale();
    if (message?.type === 'openApp') void openApp(message.route);
    if (message?.type === 'screenshot') void takeScreenshot(message.mode, message.tabId, message.windowId, message.maxWidth);
  });

  chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
    // Reloading an unpacked extension also fires 'update' with the same version, so only a real change counts.
    if (reason === 'install' || (reason === 'update' && previousVersion !== currentVersion())) {
      void chrome.tabs.create({ url: appUrl('/changelog') });
    }
    // Right away from the last stored release, in case the fresh check fails.
    void applyBadge();
    scheduleChecks();
  });

  chrome.runtime.onStartup.addListener(() => {
    void applyBadge();
    scheduleChecks();
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CHECK_ALARM) void checkForUpdate();
  });

  chrome.notifications.onClicked.addListener((id) => void openUpdateNotification(id, appUrl('/changelog')));
});
