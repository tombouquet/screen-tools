// What each browser does differently. Shared code asks `platform` (see index.ts)
// instead of checking which browser it's in.

export interface Size {
  width: number;
  height: number;
}

export interface ScreenCapture {
  stream: MediaStream;
  /** False when system audio was asked for but the picked source has none to share. */
  hasAudio: boolean;
}

export interface PlatformCapabilities {
  /** Can record the system or tab audio along with the screen. */
  systemAudio: boolean;
  /** The screen picker offers browser tabs as well as screens and windows. */
  tabCapture: boolean;
  /** The screen picker only opens from a click in the page, so the toolbar can't start a recording on its own. */
  screenPickerNeedsGesture: boolean;
}

export interface ScreenCaptureProvider {
  /** Shows the browser's screen picker and returns the picked source, capped at `size`. */
  captureScreen(withAudio: boolean, frameRate: number, size: Size): Promise<ScreenCapture>;
}

export interface Platform {
  id: 'chrome' | 'firefox';
  /** The browser's name, as users know it. */
  name: string;
  capabilities: PlatformCapabilities;
  screen: ScreenCaptureProvider;
  copy: {
    /** The notification text when the browser won't let us screenshot a page. */
    blockedScreenshotMessage: string;
    /** How to pin the toolbar icon. */
    pinHint: string;
  };
}
