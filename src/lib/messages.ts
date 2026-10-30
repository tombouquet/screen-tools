// Messages from extension pages (app, popup) to the background worker.
export type ScreenshotMode = 'area' | 'visible' | 'full';

export type AppMessage =
  | { type: 'checkForUpdate' }
  /** Opens the app window (or focuses it) at a route. */
  | { type: 'openApp'; route: string }
  /** `maxWidth` 0 keeps the native size. The worker can't read settings (they're in page localStorage). */
  | { type: 'screenshot'; mode: ScreenshotMode; tabId: number; windowId: number; maxWidth: number };
