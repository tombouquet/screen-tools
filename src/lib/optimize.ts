// MediaRecorder writes WebM without a duration, so players can't seek it. This writes
// the duration into the file header. MP4 from MediaRecorder doesn't need it.
import fixWebmDuration from 'fix-webm-duration';

export async function makeSeekable(blob: Blob, durationMs?: number): Promise<Blob> {
  const duration = durationMs || (await probeDuration(blob));
  if (!duration) return blob;
  return fixWebmDuration(blob, duration, { logger: false });
}

/**
 * Finds the length of a file with no duration header (a recovered recording or a
 * dropped file): seeking far past the end makes Chrome scan to the real end.
 */
export function probeDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    const done = (seconds: number) => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      resolve(Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0);
    };
    video.preload = 'metadata';
    video.onerror = () => done(0);
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) return done(video.duration);
      video.ondurationchange = () => {
        if (Number.isFinite(video.duration)) done(video.duration);
      };
      video.currentTime = Number.MAX_SAFE_INTEGER;
    };
    video.src = url;
  });
}
