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
  // Revoking straight away can cancel the download in some Chrome versions.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Opens a route of the app in a normal tab, where Chrome can show permission prompts. */
export function openAppTab(route: string): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL(`/app.html#${route}`) });
}
