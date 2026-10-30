// Messages from extension pages (app, popup) to the background worker.
export type ScreenshotMode = 'area' | 'visible' | 'full';

export type AppMessage =
  | { type: 'checkForUpdate' }
  /** Opens the app window (or focuses it) at a route. */
  | { type: 'openApp'; route: string }
  | { type: 'screenshot'; mode: ScreenshotMode; tabId: number; windowId: number };
