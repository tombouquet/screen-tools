// Small preview images of recordings, for the Videos list.

const WIDTH = 320;
const TIMEOUT_MS = 8000;

/**
 * Grabs a frame a second in (or a tenth of the way, for short clips) as a JPEG. A WebM
 * without a duration header can't seek, so it gets its first frame. Resolves undefined
 * if the browser can't decode it in time.
 */
export async function makeThumbnail(blob: Blob): Promise<Blob | undefined> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  try {
    return await withTimeout(capture(video, url), TIMEOUT_MS);
  } catch (error) {
    console.warn("Couldn't make a thumbnail", error);
    return undefined;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function capture(video: HTMLVideoElement, url: string): Promise<Blob | undefined> {
  const loaded = once(video, 'loadeddata');
  video.src = url;
  await loaded;
  if (Number.isFinite(video.duration) && video.duration > 0) {
    const seeked = once(video, 'seeked');
    video.currentTime = Math.min(1, video.duration / 10);
    await seeked;
  }
  if (!video.videoWidth || !video.videoHeight) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = Math.round((WIDTH * video.videoHeight) / video.videoWidth);
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/jpeg', 0.8));
}

const once = (target: HTMLVideoElement, event: string) =>
  new Promise<void>((resolve, reject) => {
    target.addEventListener(event, () => resolve(), { once: true });
    target.addEventListener('error', () => reject(target.error ?? new Error('The video failed to load.')), { once: true });
  });

const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timed out.')), ms))]);
