// Getting the media streams. The screen comes through chrome.desktopCapture, which
// offers screen, window and tab in one picker and, when asked, the system or tab audio.

export class CaptureError extends Error {
  constructor(
    readonly kind: 'cancelled' | 'camera' | 'microphone' | 'system-audio' | 'screen',
    message: string,
  ) {
    super(message);
  }
}

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

export interface Size {
  width: number;
  height: number;
}

/** The largest the screen capture may be. 0×0 means native: the screen at full pixel density, up to 4K. */
export function screenCaptureSize(cap: Size): Size {
  if (cap.width && cap.height) return cap;
  const ratio = window.devicePixelRatio || 1;
  return {
    width: Math.min(3840, Math.round(screen.width * ratio)),
    height: Math.min(2160, Math.round(screen.height * ratio)),
  };
}

export interface ScreenCapture {
  stream: MediaStream;
  /** False when system audio was asked for but the picked source has none to share. */
  hasAudio: boolean;
}

export function captureScreen(withAudio: boolean, frameRate: number, size: Size): Promise<ScreenCapture> {
  const sources: `${chrome.desktopCapture.DesktopCaptureSourceType}`[] = ['screen', 'window', 'tab'];
  if (withAudio) sources.push('audio');
  return new Promise((resolve, reject) => {
    chrome.desktopCapture.chooseDesktopMedia(sources, (streamId, options) => {
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
        .catch((error: unknown) => reject(new CaptureError('screen', describe(error))));
    });
  });
}

export async function captureCamera(
  deviceId: string,
  width: number,
  height: number,
  frameRate: number,
): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { deviceId: deviceId ? { ideal: deviceId } : undefined, width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: frameRate } },
    });
  } catch (error) {
    throw new CaptureError('camera', describe(error));
  }
}

export async function captureMicrophone(deviceId: string): Promise<MediaStream> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { ideal: deviceId } : undefined },
    });
    if (!stream.getAudioTracks().length) throw new Error('No audio track');
    return stream;
  } catch (error) {
    throw new CaptureError('microphone', describe(error));
  }
}

/** Mixes any number of audio streams into one track. */
export class AudioMixer {
  private readonly context = new AudioContext();
  private readonly destination = this.context.createMediaStreamDestination();

  add(stream: MediaStream): void {
    if (!stream.getAudioTracks().length) return;
    this.context.createMediaStreamSource(stream).connect(this.destination);
  }

  get stream(): MediaStream {
    return this.destination.stream;
  }

  close(): void {
    void this.context.close();
  }
}

export type PermissionState = 'granted' | 'partial' | 'denied' | 'error';

export interface PermissionCheck {
  state: PermissionState;
  camera: boolean;
  microphone: boolean;
  error?: string;
}

/** Asks for camera and microphone access (so device names show), then releases them. */
export async function checkPermissions(): Promise<PermissionCheck> {
  const tryGet = (constraints: MediaStreamConstraints) =>
    navigator.mediaDevices.getUserMedia(constraints).then(
      (stream) => {
        stream.getTracks().forEach((t) => t.stop());
        return { ok: true as const };
      },
      (error: unknown) => ({ ok: false as const, error }),
    );
  const [camera, microphone] = await Promise.all([tryGet({ video: true }), tryGet({ audio: true })]);
  if (camera.ok && microphone.ok) return { state: 'granted', camera: true, microphone: true };
  if (camera.ok || microphone.ok) return { state: 'partial', camera: camera.ok, microphone: microphone.ok };
  const error = !camera.ok ? camera.error : undefined;
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return { state: 'denied', camera: false, microphone: false };
  }
  return { state: 'error', camera: false, microphone: false, error: describe(error) };
}

export async function listDevices(): Promise<{ cameras: MediaDeviceInfo[]; microphones: MediaDeviceInfo[] }> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: devices.filter((d) => d.kind === 'videoinput' && d.deviceId),
    microphones: devices.filter((d) => d.kind === 'audioinput' && d.deviceId),
  };
}

function describe(error: unknown): string {
  if (error instanceof DOMException) return error.name === 'NotAllowedError' ? 'Permission denied' : error.message || error.name;
  return error instanceof Error ? error.message : String(error);
}
