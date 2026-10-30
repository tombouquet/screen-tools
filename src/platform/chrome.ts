// Chrome: the screen comes through chrome.desktopCapture, which offers screen, window
// and tab in one picker and, when asked, the system or tab audio.
import { browser, type Browser } from 'wxt/browser';
import { CaptureError, describeError, screenCaptureSize } from '@/lib/capture';
import type { Platform, ScreenCapture, Size } from './types';

/** The legacy Chrome-only constraints that turn a desktopCapture stream id into a stream. */
function desktopConstraints(streamId: string, frameRate: number, size: Size) {
  return {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: streamId,
      maxWidth: size.width,
      maxHeight: size.height,
      maxFrameRate: frameRate,
    },
  };
}

function captureScreen(withAudio: boolean, frameRate: number, size: Size): Promise<ScreenCapture> {
  const sources: `${Browser.desktopCapture.DesktopCaptureSourceType}`[] = ['screen', 'window', 'tab'];
  if (withAudio) sources.push('audio');
  return new Promise((resolve, reject) => {
    browser.desktopCapture.chooseDesktopMedia(sources, (streamId, options) => {
      if (!streamId) {
        reject(new CaptureError('cancelled', 'Screen sharing was cancelled'));
        return;
      }
      const wantAudio = withAudio && options.canRequestAudioTrack;
      const constraints = {
        video: desktopConstraints(streamId, frameRate, screenCaptureSize(size)),
        audio: wantAudio ? { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: streamId } } : false,
      } as unknown as MediaStreamConstraints;
      navigator.mediaDevices
        .getUserMedia(constraints)
        .then((stream) => resolve({ stream, hasAudio: stream.getAudioTracks().length > 0 }))
        .catch((error: unknown) => reject(new CaptureError('screen', describeError(error))));
    });
  });
}

export const chromePlatform: Platform = {
  id: 'chrome',
  name: 'Chrome',
  capabilities: {
    systemAudio: true,
    tabCapture: true,
    screenPickerNeedsGesture: false,
  },
  screen: { captureScreen },
  copy: {
    blockedScreenshotMessage: 'Chrome blocks screenshots of its own pages, the Web Store and some others. Try another tab.',
    pinHint: 'Pin Screen Tools: click the puzzle piece in the Chrome toolbar, then the pin next to Screen Tools.',
  },
};
