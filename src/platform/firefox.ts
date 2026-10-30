// Firefox: the screen comes through the standard getDisplayMedia picker (screens and
// windows only, no audio), which only opens from a click in the page.
import { CaptureError, describeError, screenCaptureSize } from '@/lib/capture';
import type { Platform, ScreenCapture, Size } from './types';

async function captureScreen(_withAudio: boolean, frameRate: number, size: Size): Promise<ScreenCapture> {
  const { width, height } = screenCaptureSize(size);
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { max: width }, height: { max: height }, frameRate: { ideal: frameRate, max: frameRate } },
      audio: false,
    });
    return { stream, hasAudio: false };
  } catch (error) {
    // Firefox reports closing the picker as NotAllowedError.
    if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
      throw new CaptureError('cancelled', 'Screen sharing was cancelled');
    }
    throw new CaptureError('screen', describeError(error));
  }
}

export const firefoxPlatform: Platform = {
  id: 'firefox',
  name: 'Firefox',
  capabilities: {
    systemAudio: false,
    tabCapture: false,
    screenPickerNeedsGesture: true,
  },
  screen: { captureScreen },
  copy: {
    blockedScreenshotMessage:
      'Firefox blocks screenshots of its own pages (about: pages, addons.mozilla.org, reader view) and some others. Try another tab.',
    pinHint:
      'Pin Screen Tools: click the puzzle piece (Extensions) in the Firefox toolbar, then the gear next to Screen Tools and Pin to Toolbar.',
  },
};
