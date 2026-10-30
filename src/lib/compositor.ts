// Draws the screen and camera onto one canvas and records that canvas, like the
// original: the camera sits in a corner over the screen, or fills the frame on its own.
import type { CameraPosition, CameraShape, CameraSize } from './settings';
import { traceSquircle } from './squircle';
import { startTicker } from './ticker';

/**
 * Overlay width as a share of the frame (for the 16:9 default shape). Relative, so the
 * camera looks the same size whatever resolution the screen is captured at.
 * At 1080p: small 480 px, medium 640 px, large 864 px wide.
 */
const OVERLAY_SHARE: Record<CameraSize, number> = { small: 0.25, medium: 1 / 3, large: 0.45 };
/** Gap between the overlay and the frame edge, as a share of the frame (24 px at 1080p). */
const MARGIN_SHARE = 0.0125;

export interface CameraOverlay {
  position: CameraPosition;
  size: CameraSize;
  shape: CameraShape;
  zoom: number;
  mirror: boolean;
}

interface Layer {
  video: HTMLVideoElement;
  /** Fills the canvas when unset; otherwise drawn as a corner overlay. */
  overlay?: CameraOverlay;
  mirror?: boolean;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Plays a stream in a detached, muted <video> so its frames can be drawn. */
export async function videoFor(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Could not play the media stream'));
  });
  await video.play();
  return video;
}

export class Compositor {
  private readonly canvas = document.createElement('canvas');
  private readonly context = this.canvas.getContext('2d', { alpha: false })!;
  private layers: Layer[] = [];
  private stopTicker?: () => void;

  constructor(
    width: number,
    height: number,
    private readonly fps: number,
  ) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /** Background layer, scaled to fit with letterboxing. */
  addFullFrame(video: HTMLVideoElement, mirror = false): void {
    this.layers.unshift({ video, mirror });
  }

  addOverlay(video: HTMLVideoElement, overlay: CameraOverlay): void {
    this.layers.push({ video, overlay });
  }

  start(): MediaStream {
    this.stopTicker = startTicker(() => this.draw(), this.fps);
    return this.canvas.captureStream(this.fps);
  }

  stop(): void {
    this.stopTicker?.();
    this.stopTicker = undefined;
    for (const layer of this.layers) layer.video.srcObject = null;
    this.layers = [];
  }

  private draw(): void {
    const { context, canvas } = this;
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (const layer of this.layers) {
      const { video } = layer;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) continue;
      if (layer.overlay) this.drawOverlay(video, layer.overlay);
      else this.drawVideo(video, contain(video, canvas), layer.mirror);
    }
  }

  private drawOverlay(video: HTMLVideoElement, overlay: CameraOverlay): void {
    const { context } = this;
    const box = overlayBox(overlay, this.canvas.width, this.canvas.height);
    context.save();
    context.beginPath();
    if (overlay.shape === 'circle') {
      context.arc(box.x + box.width / 2, box.y + box.height / 2, box.width / 2, 0, Math.PI * 2);
    } else if (overlay.shape === 'squircle') {
      traceSquircle(context, box.x, box.y, box.width);
    } else {
      context.rect(box.x, box.y, box.width, box.height);
    }
    context.clip();
    this.drawVideo(video, zoomed(cover(video, box), box, overlay.zoom), overlay.mirror, box);
    context.restore();
  }

  /** Draws the video into `target`, flipped around `mirrorBox` (default `target`) when mirrored. */
  private drawVideo(video: HTMLVideoElement, target: Box, mirror?: boolean, mirrorBox: Box = target): void {
    const { context } = this;
    if (!mirror) {
      context.drawImage(video, target.x, target.y, target.width, target.height);
      return;
    }
    context.save();
    const centre = mirrorBox.x + mirrorBox.width / 2;
    context.translate(centre * 2, 0);
    context.scale(-1, 1);
    context.drawImage(video, target.x, target.y, target.width, target.height);
    context.restore();
  }
}

/** Where the camera overlay goes: 16:9 for the default shape, a square box for circle and squircle. */
export function overlayBox(overlay: CameraOverlay, canvasWidth: number, canvasHeight: number): Box {
  // Sized against the widest 16:9 area that fits, so ultrawide and portrait captures
  // don't get an overlay that swamps them.
  const reference = Math.min(canvasWidth, (canvasHeight * 16) / 9);
  const margin = Math.max(8, Math.round(reference * MARGIN_SHARE));
  const width16x9 = reference * OVERLAY_SHARE[overlay.size];
  const height = (width16x9 * 9) / 16;
  const width = overlay.shape === 'default' ? width16x9 : height;
  const x = overlay.position.endsWith('left') ? margin : canvasWidth - margin - width;
  const y = overlay.position.startsWith('top') ? margin : canvasHeight - margin - height;
  return { x, y, width, height };
}

/** Scales the video to fit inside the area, centred. */
function contain(video: HTMLVideoElement, area: { width: number; height: number }): Box {
  const scale = Math.min(area.width / video.videoWidth, area.height / video.videoHeight);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  return { x: (area.width - width) / 2, y: (area.height - height) / 2, width, height };
}

/** Scales the video to fill the box, centred; the overflow is clipped. */
function cover(video: HTMLVideoElement, box: Box): Box {
  const scale = Math.max(box.width / video.videoWidth, box.height / video.videoHeight);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
}

function zoomed(target: Box, box: Box, zoom: number): Box {
  const width = target.width * zoom;
  const height = target.height * zoom;
  return { x: box.x + box.width / 2 - width / 2, y: box.y + box.height / 2 - height / 2, width, height };
}
