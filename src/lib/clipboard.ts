// Writing screenshots and links to the clipboard from an app page. Chrome lets a focused
// page write without a click. Firefox needs a click, or the optional `clipboardWrite`
// permission, which is asked for when "Copy screenshots to the clipboard" is turned on.
import { browser } from 'wxt/browser';
import { platform } from '@/platform';

const CLIPBOARD_PERMISSION = { permissions: ['clipboardWrite'] } as Parameters<typeof browser.permissions.request>[0];
/** How long a copy waits for the page to get focus back before giving up. */
const FOCUS_WAIT_MS = 30_000;

/** True when this browser lets the app copy without a click, or already allowed it. */
export async function hasClipboardAccess(): Promise<boolean> {
  if (!platform.capabilities.clipboardNeedsPermission) return true;
  return browser.permissions.contains(CLIPBOARD_PERMISSION).catch(() => false);
}

/**
 * Asks for clipboard access where the browser needs it. Call straight from a click,
 * before any `await`, or Firefox refuses to show the prompt.
 */
export function requestClipboardAccess(): Promise<boolean> {
  if (!platform.capabilities.clipboardNeedsPermission) return Promise.resolve(true);
  return browser.permissions.request(CLIPBOARD_PERMISSION).catch((error: unknown) => {
    console.error(error);
    return false;
  });
}

/** Resolves once the page has focus (straight away if it has), or false after a while. */
function whenFocused(): Promise<boolean> {
  if (document.hasFocus()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (focused: boolean) => {
      window.removeEventListener('focus', onFocus);
      clearTimeout(timer);
      resolve(focused);
    };
    const onFocus = () => done(true);
    const timer = setTimeout(() => done(false), FOCUS_WAIT_MS);
    window.addEventListener('focus', onFocus);
  });
}

/**
 * Puts a PNG on the clipboard without a click. Waits for the page to have focus first,
 * since the browser refuses a page in the background. False if it couldn't.
 */
export async function copyImageNow(png: Blob): Promise<boolean> {
  try {
    if (!(await whenFocused())) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch (error) {
    console.warn("Couldn't copy the screenshot", error);
    return false;
  }
}

/** Puts text on the clipboard, e.g. a share link once an upload ends. False if the browser refused. */
export async function copyTextNow(text: string): Promise<boolean> {
  try {
    if (!(await whenFocused())) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.warn("Couldn't copy the link", error);
    return false;
  }
}
