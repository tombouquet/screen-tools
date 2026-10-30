import { browser } from 'wxt/browser';

/** Saves a blob through the browser's normal download flow. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking straight away can cancel the download in some browser versions.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const appUrl = (route = '/') => browser.runtime.getURL(`/app.html#${route}`);

/** Opens a route of the app in a normal tab, where the browser can show permission prompts. */
export function openAppTab(route: string): void {
  void browser.tabs.create({ url: appUrl(route) });
}
