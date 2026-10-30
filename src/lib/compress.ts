// Re-encodes a video smaller with the browser's own (usually hardware) encoders, through
// Mediabunny and WebCodecs. Each preset caps the resolution and sets a bitrate, which
// is also what the size estimate is worked out from. Presets the browser has no encoder
// for are marked, so the save dialog doesn't offer them.
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  ConversionCanceledError,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type AudioCodec,
  type VideoCodec,
} from 'mediabunny';
import { platform } from '@/platform';
import { isWebm } from './formats';

/** Above this, the app suggests compressing: roughly the attachment limit of email and most chat apps. */
export const LARGE_FILE_BYTES = 25 * 1024 * 1024;

export type PresetId = 'high' | 'balanced' | 'small' | 'smallest';

export interface CompressionPreset {
  id: PresetId;
  label: string;
  description: string;
  /** Output is scaled down to fit within this height (and the matching 16:9 width). */
  maxHeight: number;
  /** Video bitrate at the full maxHeight; scaled down for smaller outputs. */
  videoBitrate: number;
  audioBitrate: number;
}

export const PRESETS: CompressionPreset[] = [
  {
    id: 'high',
    label: 'High quality',
    description: 'Up to 1080p. Small text stays sharp.',
    maxHeight: 1080,
    videoBitrate: 4_000_000,
    audioBitrate: 128_000,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Up to 720p. Good for sharing.',
    maxHeight: 720,
    videoBitrate: 2_000_000,
    audioBitrate: 96_000,
  },
  {
    id: 'small',
    label: 'Small',
    description: 'Up to 720p at a lower bitrate. Fine for chat apps.',
    maxHeight: 720,
    videoBitrate: 1_000_000,
    audioBitrate: 64_000,
  },
  {
    id: 'smallest',
    label: 'Smallest',
    description: 'Up to 480p. Small text may blur.',
    maxHeight: 480,
    videoBitrate: 500_000,
    audioBitrate: 48_000,
  },
];

export interface VideoInfo {
  durationS: number;
  width: number;
  height: number;
  hasAudio: boolean;
  size: number;
}

export interface PresetPlan {
  preset: CompressionPreset;
  width: number;
  height: number;
  videoBitrate: number;
  audioBitrate: number;
  estimatedBytes: number;
  /** False when the estimate isn't meaningfully smaller than the file already is. */
  worthIt: boolean;
  /** False when the browser can't encode this size (or its audio), so it can't be offered. */
  encodable: boolean;
}

/** Reads the length, size and tracks of a video. */
export async function analyzeVideo(blob: Blob): Promise<VideoInfo> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('This file has no video track');
    const audio = await input.getPrimaryAudioTrack();
    return {
      durationS: await input.computeDuration(),
      width: video.displayWidth,
      height: video.displayHeight,
      hasAudio: Boolean(audio),
      size: blob.size,
    };
  } finally {
    input.dispose();
  }
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** What a preset would produce for this video, including the estimated file size. */
function planPreset(preset: CompressionPreset, info: VideoInfo): Omit<PresetPlan, 'encodable'> {
  const maxWidth = (preset.maxHeight * 16) / 9;
  const scale = Math.min(1, preset.maxHeight / info.height, maxWidth / info.width);
  const width = even(info.width * scale);
  const height = even(info.height * scale);
  // Fewer pixels than the preset's full size need proportionally fewer bits.
  const pixelShare = Math.min(1, (width * height) / (maxWidth * preset.maxHeight));
  const videoBitrate = Math.round(preset.videoBitrate * pixelShare);
  const audioBitrate = info.hasAudio ? preset.audioBitrate : 0;
  // Container overhead is a couple of percent.
  const estimatedBytes = Math.round((((videoBitrate + audioBitrate) * info.durationS) / 8) * 1.02);
  return {
    preset,
    width,
    height,
    videoBitrate,
    audioBitrate,
    estimatedBytes,
    worthIt: estimatedBytes < info.size * 0.9,
  };
}

/** Plans every preset for this video and checks the browser can encode each one. */
export async function planPresets(info: VideoInfo, mimeType: string): Promise<PresetPlan[]> {
  return Promise.all(
    PRESETS.map(async (preset) => {
      const plan = planPreset(preset, info);
      const { videoCodec, audioCodec } = await pickCodecs(mimeType, plan);
      return { ...plan, encodable: Boolean(videoCodec) && (!info.hasAudio || Boolean(audioCodec)) };
    }),
  );
}

/** Compressed copies stay WebM if they were WebM; everything else becomes MP4. */
export const compressedExtension = (mimeType: string) => (isWebm(mimeType) ? '.webm' : '.mp4');

/** The best-quality preset that gets under the sharing limit, else the smallest that helps. */
export function suggestedPreset(plans: PresetPlan[]): PresetId | undefined {
  const useful = plans.filter((p) => p.worthIt && p.encodable);
  return (useful.find((p) => p.estimatedBytes <= LARGE_FILE_BYTES) ?? useful.at(-1))?.preset.id;
}

const VIDEO_CODECS: Record<'mp4' | 'webm', VideoCodec[]> = {
  mp4: ['avc', 'hevc', 'vp9', 'av1'],
  webm: ['vp9', 'vp8', 'av1'],
};
const AUDIO_CODECS: Record<'mp4' | 'webm', AudioCodec[]> = {
  mp4: ['aac', 'opus'],
  webm: ['opus', 'vorbis'],
};

/** The first video and audio codecs the browser can encode for this plan, in the file's container. */
async function pickCodecs(mimeType: string, plan: Pick<PresetPlan, 'width' | 'height' | 'videoBitrate' | 'audioBitrate'>) {
  const container = isWebm(mimeType) ? 'webm' : 'mp4';
  const videoQuality = new Quality({ bitrate: plan.videoBitrate, bitrateMode: 'variable' });
  const audioQuality = new Quality({ bitrate: plan.audioBitrate || 64_000, bitrateMode: 'variable' });
  const [videoCodec, audioCodec] = await Promise.all([
    getFirstEncodableVideoCodec(VIDEO_CODECS[container], { width: plan.width, height: plan.height, quality: videoQuality }),
    getFirstEncodableAudioCodec(AUDIO_CODECS[container], { quality: audioQuality }),
  ]);
  return { container, videoCodec, audioCodec, videoQuality, audioQuality };
}

export interface CompressedVideo {
  blob: Blob;
  mimeType: string;
  presetId: PresetId;
}

export class CompressionCancelled extends Error {}

export interface CompressionJob {
  promise: Promise<CompressedVideo>;
  cancel: () => void;
}

/** Starts compressing. Keeps the container (MP4 stays MP4, WebM stays WebM). */
export function compressVideo(
  blob: Blob,
  mimeType: string,
  plan: PresetPlan,
  onProgress: (fraction: number) => void,
): CompressionJob {
  let conversion: Conversion | undefined;
  let cancelled = false;

  const run = async (): Promise<CompressedVideo> => {
    const { container, videoCodec, audioCodec, videoQuality, audioQuality } = await pickCodecs(mimeType, plan);
    const format = container === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' });
    if (!videoCodec) throw new Error(`${platform.name} can't encode video on this computer`);

    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    try {
      return await convert(input, format, videoCodec, audioCodec, videoQuality, audioQuality);
    } finally {
      input.dispose();
    }
  };

  const convert = async (
    input: Input,
    format: Mp4OutputFormat | WebMOutputFormat,
    videoCodec: VideoCodec,
    audioCodec: AudioCodec | null,
    videoQuality: Quality,
    audioQuality: Quality,
  ): Promise<CompressedVideo> => {
    const target = new BufferTarget();
    const output = new Output({ format, target });
    conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: { width: plan.width, height: plan.height, fit: 'contain', codec: videoCodec, quality: videoQuality },
      audio: audioCodec ? { codec: audioCodec, quality: audioQuality } : { discard: true },
    });
    if (cancelled) throw new CompressionCancelled();
    if (!conversion.isValid) {
      const reasons = conversion.discardedTracks.map((t) => t.reason).join(', ');
      throw new Error(`This video can't be compressed (${reasons || 'unsupported format'})`);
    }
    conversion.onProgress = (fraction) => onProgress(fraction);
    try {
      await conversion.execute();
    } catch (error) {
      if (error instanceof ConversionCanceledError) throw new CompressionCancelled();
      throw error;
    }
    const outputType = format.mimeType;
    return {
      blob: new Blob([target.buffer!], { type: outputType }),
      mimeType: outputType,
      presetId: plan.preset.id,
    };
  };

  return {
    promise: run(),
    cancel: () => {
      cancelled = true;
      void conversion?.cancel();
    },
  };
}
