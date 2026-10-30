import type { OutputFormat } from './settings';

// Preferred first. H.264 in WebM matches the original extension and is cheap to encode.
const MIME_TYPES: Record<OutputFormat, string[]> = {
  mp4: ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'],
  webm: ['video/webm;codecs=h264,opus', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
};

const supported = (type: string) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type);

/** Options for format selects; MP4 is greyed out where Chrome can't record it. */
export function formatOptions(): { value: OutputFormat; label: string; disabled?: boolean }[] {
  const mp4 = isFormatSupported('mp4');
  return [
    { value: 'mp4', label: mp4 ? 'MP4' : 'MP4 (not supported)', disabled: !mp4 },
    { value: 'webm', label: 'WebM' },
  ];
}

export function isFormatSupported(format: OutputFormat): boolean {
  return MIME_TYPES[format].some(supported);
}

/** The best MIME type for the format, falling back to WebM when MP4 isn't available. */
export function pickMimeType(format: OutputFormat): string {
  return MIME_TYPES[format].find(supported) ?? MIME_TYPES.webm.find(supported) ?? 'video/webm';
}

export const isWebm = (mimeType: string) => mimeType.startsWith('video/webm');

export function fileExtension(mimeType: string): string {
  return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
}

/** e.g. screen-recording-2026-10-29-223000.webm */
export function recordingFileName(date: Date, mimeType: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `screen-recording-${stamp}.${fileExtension(mimeType)}`;
}

/** 'clip.final.webm' → { base: 'clip.final', extension: '.webm' }. */
export function splitFileName(fileName: string): { base: string; extension: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return { base: fileName, extension: '' };
  return { base: fileName.slice(0, dot), extension: fileName.slice(dot) };
}

/** Removes characters that aren't allowed in file names, and a typed-in video extension. */
export function cleanFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\.(mp4|webm)$/i, '')
    .trim()
    .replace(/^\.+/, '');
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
