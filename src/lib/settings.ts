// User preferences, kept in the app page's localStorage like the original extension.
// Every getter validates what's stored and falls back to the default.
import { isFormatSupported } from './formats';

export type CameraPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type CameraSize = 'small' | 'medium' | 'large';
export type CameraShape = 'default' | 'circle' | 'squircle';
export type OutputFormat = 'webm' | 'mp4';
export type ImageFormat = 'png' | 'jpg';
export type Theme = 'light' | 'dark' | 'system';
export const FRAME_RATES = [15, 24, 30, 60] as const;
export type FrameRate = (typeof FRAME_RATES)[number];
/** 'original' or one of the compression presets in compress.ts. */
export const SAVE_SIZES = ['original', 'high', 'balanced', 'small', 'smallest'] as const;
export type SaveSize = (typeof SAVE_SIZES)[number];
export type CaptureSource = 'screen' | 'camera' | 'screen-camera';
export type AudioSource = 'none' | 'microphone' | 'system-microphone' | 'system';

export const CAMERA_POSITIONS: CameraPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
export const CAMERA_SIZES: CameraSize[] = ['small', 'medium', 'large'];
export const CAMERA_SHAPES: CameraShape[] = ['squircle', 'default', 'circle'];

export const CAMERA_RESOLUTIONS = [
  { id: '1080p', label: '1080p Full HD', width: 1920, height: 1080 },
  { id: '720p', label: '720p HD', width: 1280, height: 720 },
  { id: '480p', label: '480p SD', width: 858, height: 480 },
  { id: '360p', label: '360p', width: 480, height: 360 },
  { id: '240p', label: '240p', width: 352, height: 240 },
] as const;
/** Caps on the screen capture; Chrome scales the source down to fit, keeping its shape. */
export const SCREEN_RESOLUTIONS = [
  { id: 'native', label: 'Native (full size)', width: 0, height: 0 },
  { id: '2160p', label: '4K (2160p)', width: 3840, height: 2160 },
  { id: '1440p', label: '1440p QHD', width: 2560, height: 1440 },
  { id: '1080p', label: '1080p Full HD', width: 1920, height: 1080 },
  { id: '720p', label: '720p HD', width: 1280, height: 720 },
  { id: '480p', label: '480p SD', width: 854, height: 480 },
] as const;
export type ScreenResolutionId = (typeof SCREEN_RESOLUTIONS)[number]['id'];

/** Width caps on saved screenshots; native keeps every pixel the screen captured. */
export const SCREENSHOT_QUALITIES = [
  { id: 'native', label: 'Native (full resolution)', maxWidth: 0 },
  { id: '2560', label: 'High (up to 2560 px wide)', maxWidth: 2560 },
  { id: '1920', label: 'Medium (up to 1920 px wide)', maxWidth: 1920 },
  { id: '1280', label: 'Small (up to 1280 px wide)', maxWidth: 1280 },
] as const;
export type ScreenshotQualityId = (typeof SCREENSHOT_QUALITIES)[number]['id'];

export type CameraResolutionId = (typeof CAMERA_RESOLUTIONS)[number]['id'];

export interface Settings {
  captureSource: CaptureSource;
  audioSource: AudioSource;
  format: OutputFormat;
  frameRate: FrameRate;
  screenResolution: ScreenResolutionId;
  cameraId: string;
  microphoneId: string;
  cameraResolution: CameraResolutionId;
  cameraPosition: CameraPosition;
  cameraSize: CameraSize;
  cameraShape: CameraShape;
  cameraZoom: number;
  cameraMirror: boolean;
  optimizeVideo: boolean;
  /** Show the save dialog (file name and size) instead of downloading the original straight away. */
  showSaveOptions: boolean;
  /** The size picked last time in the save dialog. */
  saveSize: SaveSize;
  /** The screenshot download format picked last time. */
  imageFormat: ImageFormat;
  screenshotQuality: ScreenshotQualityId;
  theme: Theme;
}

export const DEFAULT_SETTINGS: Settings = {
  captureSource: 'screen',
  audioSource: 'none',
  format: 'mp4',
  frameRate: 30,
  screenResolution: 'native',
  cameraId: '',
  microphoneId: '',
  cameraResolution: '1080p',
  cameraPosition: 'bottom-right',
  cameraSize: 'small',
  cameraShape: 'squircle',
  cameraZoom: 1,
  cameraMirror: true,
  optimizeVideo: true,
  showSaveOptions: true,
  saveSize: 'original',
  imageFormat: 'png',
  screenshotQuality: 'native',
  theme: 'system',
};

const STORAGE_KEY = 'settings';
const CHANGE_EVENT = 'settings-change';

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

function sanitize(raw: Partial<Record<keyof Settings | 'askFileName', unknown>>): Settings {
  const d = DEFAULT_SETTINGS;
  const zoom = Number(raw.cameraZoom);
  return {
    captureSource: oneOf(raw.captureSource, ['screen', 'camera', 'screen-camera'], d.captureSource),
    audioSource: oneOf(raw.audioSource, ['none', 'microphone', 'system-microphone', 'system'], d.audioSource),
    // MP4 is the default, but older Chrome versions can only record WebM.
    format: isFormatSupported('mp4') ? oneOf(raw.format, ['webm', 'mp4'], d.format) : 'webm',
    frameRate: FRAME_RATES.includes(Number(raw.frameRate) as FrameRate) ? (Number(raw.frameRate) as FrameRate) : d.frameRate,
    screenResolution: oneOf(raw.screenResolution, SCREEN_RESOLUTIONS.map((r) => r.id), d.screenResolution),
    cameraId: typeof raw.cameraId === 'string' ? raw.cameraId : d.cameraId,
    microphoneId: typeof raw.microphoneId === 'string' ? raw.microphoneId : d.microphoneId,
    cameraResolution: oneOf(raw.cameraResolution, CAMERA_RESOLUTIONS.map((r) => r.id), d.cameraResolution),
    cameraPosition: oneOf(raw.cameraPosition, CAMERA_POSITIONS, d.cameraPosition),
    cameraSize: oneOf(raw.cameraSize, CAMERA_SIZES, d.cameraSize),
    // 'square' was renamed 'squircle'; keep the choice of anyone who picked it.
    cameraShape: oneOf(raw.cameraShape === 'square' ? 'squircle' : raw.cameraShape, CAMERA_SHAPES, d.cameraShape),
    cameraZoom: zoom >= 1 && zoom <= 2 ? zoom : d.cameraZoom,
    cameraMirror: typeof raw.cameraMirror === 'boolean' ? raw.cameraMirror : d.cameraMirror,
    optimizeVideo: typeof raw.optimizeVideo === 'boolean' ? raw.optimizeVideo : d.optimizeVideo,
    // Was `askFileName` before the save dialog also offered sizes.
    showSaveOptions: typeof (raw.showSaveOptions ?? raw.askFileName) === 'boolean' ? Boolean(raw.showSaveOptions ?? raw.askFileName) : d.showSaveOptions,
    saveSize: oneOf(raw.saveSize, SAVE_SIZES, d.saveSize),
    imageFormat: oneOf(raw.imageFormat, ['png', 'jpg'], d.imageFormat),
    screenshotQuality: oneOf(raw.screenshotQuality, SCREENSHOT_QUALITIES.map((q) => q.id), d.screenshotQuality),
    theme: oneOf(raw.theme, ['light', 'dark', 'system'], d.theme),
  };
}

let cache: Settings | undefined;

export function getSettings(): Settings {
  if (!cache) {
    try {
      cache = sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
    } catch {
      cache = { ...DEFAULT_SETTINGS };
    }
  }
  return cache;
}

export function updateSettings(patch: Partial<Settings>): void {
  cache = sanitize({ ...getSettings(), ...patch });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Switches capture source. System audio needs a screen, so camera-only drops it. */
export function setCaptureSource(captureSource: CaptureSource): void {
  const { audioSource } = getSettings();
  updateSettings({
    captureSource,
    ...(captureSource === 'camera' && audioSource.startsWith('system')
      ? { audioSource: audioSource === 'system-microphone' ? 'microphone' : 'none' }
      : {}),
  });
}

export function subscribeSettings(listener: () => void): () => void {
  // `storage` fires when another extension page (e.g. the options tab) changes them.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cache = undefined;
    listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function screenResolution(id: ScreenResolutionId) {
  return SCREEN_RESOLUTIONS.find((r) => r.id === id) ?? SCREEN_RESOLUTIONS[0];
}

/** 0 means no cap. */
export function screenshotMaxWidth(id: ScreenshotQualityId): number {
  return SCREENSHOT_QUALITIES.find((q) => q.id === id)?.maxWidth ?? 0;
}

export function cameraResolution(id: CameraResolutionId) {
  return CAMERA_RESOLUTIONS.find((r) => r.id === id) ?? CAMERA_RESOLUTIONS[0];
}
