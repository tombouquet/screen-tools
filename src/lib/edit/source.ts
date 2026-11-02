// The videos an edit is made from, and what the timeline shows of them: a strip of
// small frames and the loudness of the audio. Both are read with Mediabunny a little at
// a time, so a long recording is never decoded into memory all at once.
//
// The export copies the compressed frames as they are, never re-encoding. So a video can
// only be edited when its frames can be copied (no B-frames, a format MP4 or WebM can
// hold), and only videos with the same format and size can be joined.
import {
  ALL_FORMATS,
  AudioBufferSink,
  BlobSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  type AudioCodec,
  type InputVideoTrack,
  type VideoCodec,
} from 'mediabunny';
import { isWebm } from '@/lib/formats';
import { makeSeekable } from '@/lib/optimize';
import { newId, type Range } from './model';

/** What a copy needs to match: the compressed formats of the video and the sound. */
export interface SourceFormat {
  videoCodec: VideoCodec;
  videoConfig: VideoDecoderConfig;
  audioCodec: AudioCodec | null;
  audioConfig: AudioDecoderConfig | null;
}

export type Container = 'mp4' | 'webm';

const SUPPORTED: Record<Container, { video: string[]; audio: string[] }> = {
  mp4: { video: ['avc', 'hevc', 'vp9', 'av1', 'vp8'], audio: ['aac', 'opus', 'mp3', 'vorbis', 'flac'] },
  webm: { video: ['vp9', 'av1', 'vp8'], audio: ['opus', 'vorbis'] },
};

export interface EditSource {
  id: string;
  name: string;
  /** The file as stored or dropped in. Never changed. */
  blob: Blob;
  mimeType: string;
  /** What the preview plays: the same file, or a copy of a WebM with its duration written in so it can seek. */
  previewBlob: Blob;
  durationS: number;
  width: number;
  height: number;
  hasAudio: boolean;
  format: SourceFormat;
  /** Where the video's keyframes are, in seconds, in order. Cuts can only resume on one. */
  keyframes: number[];
  /** Set when it's a stored recording. */
  recordingId?: number;
}

/** Thrown when a video can't be edited or joined without re-encoding it. */
export class NotEditable extends Error {}

const UNSUPPORTED = "The editor can't work with this kind of video file. Recordings made with Screen Tools can always be edited.";

export interface Thumbnail {
  /** Seconds into the source. */
  time: number;
  image: ImageBitmap;
}

/** Loudness of the audio over short windows. */
export interface Loudness {
  windowS: number;
  /** Root mean square level per window, in dBFS. */
  rmsDb: Float32Array;
  /** Peak level per window, 0 to 1. */
  peak: Float32Array;
}

export const SILENT_DB = -100;

/**
 * Opens a video for editing. Throws `NotEditable` when its frames can't be copied, or
 * when `joinTo` is given and the two can't be copied into one file.
 */
export async function loadSource(blob: Blob, name: string, options: { recordingId?: number; joinTo?: EditSource } = {}): Promise<EditSource> {
  const mimeType = blob.type || 'video/mp4';
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('This file has no video track.');
    const audio = await input.getPrimaryAudioTrack();
    const durationS = await input.computeDuration();
    if (!(durationS > 0)) throw new Error('This file has no length.');
    const hasAudio = Boolean(audio && (await audio.canDecode()));

    const videoCodec = await video.getCodec();
    const videoConfig = await video.getDecoderConfig();
    if (!videoCodec || !videoConfig) throw new NotEditable(UNSUPPORTED);
    const sound = hasAudio ? audio : null;
    const format: SourceFormat = {
      videoCodec,
      videoConfig,
      audioCodec: sound && (await sound.getCodec()),
      audioConfig: sound && (await sound.getDecoderConfig()),
    };
    const container = copyContainer(mimeType, format);
    if (!container) {
      throw new NotEditable(UNSUPPORTED);
    }
    if (await reordersFrames(video)) {
      // B-frames: frames stored out of order, which a copied cut could break.
      throw new NotEditable(
        "This video was saved in a way the editor can't cut without lowering its quality. Recordings made with Screen Tools can always be edited.",
      );
    }
    if (options.joinTo) {
      const reason = whyNotJoinable(options.joinTo, { format, width: await video.getDisplayWidth(), height: await video.getDisplayHeight() });
      if (reason) throw new NotEditable(reason);
    }
    const keyframes = await findKeyframes(video);

    // MediaRecorder's WebM has no duration or index, so the browser seeks it slowly or
    // not at all. The preview plays an indexed copy; the stored recording is left as it is.
    const previewBlob = isWebm(mimeType) ? await seekableCopy(blob, durationS) : blob;
    return {
      id: newId(),
      name,
      blob,
      mimeType,
      previewBlob,
      durationS,
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
      hasAudio,
      format,
      keyframes,
      recordingId: options.recordingId,
    };
  } finally {
    input.dispose();
  }
}

/** The container a copy of this source is written in: its own when it can hold the formats, else MP4. */
export function copyContainer(mimeType: string, format: SourceFormat): Container | undefined {
  const fits = (c: Container) =>
    SUPPORTED[c].video.includes(format.videoCodec) && (!format.audioCodec || SUPPORTED[c].audio.includes(format.audioCodec));
  if (isWebm(mimeType) && fits('webm')) return 'webm';
  return fits('mp4') ? 'mp4' : undefined;
}

const bytes = (data: AllowSharedBufferSource | undefined) => {
  if (!data) return undefined;
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(data);
};

const sameBytes = (a?: Uint8Array, b?: Uint8Array) => (!a && !b) || (!!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]));

const CODEC_NAMES: Record<string, string> = {
  avc: 'H.264',
  hevc: 'H.265',
  vp8: 'VP8',
  vp9: 'VP9',
  av1: 'AV1',
};
const codecName = (codec: string) => CODEC_NAMES[codec] ?? codec;

type Shape = Pick<EditSource, 'format' | 'width' | 'height'>;

/** Why two videos can't be copied into one file, or undefined when they can. */
function whyNotJoinable(edit: Shape, added: Shape): string | undefined {
  const [a, b] = [edit.format, added.format];
  const [av, bv] = [a.videoConfig, b.videoConfig];
  if (av.codedWidth !== bv.codedWidth || av.codedHeight !== bv.codedHeight || edit.width !== added.width || edit.height !== added.height) {
    return `It's a different size (${added.width}×${added.height}) from this video (${edit.width}×${edit.height}).`;
  }
  if (a.videoCodec !== b.videoCodec || av.codec !== bv.codec || !sameBytes(bytes(av.description), bytes(bv.description))) {
    return a.videoCodec === b.videoCodec
      ? 'It was recorded with different video settings from this video.'
      : `It's in a different video format (${codecName(b.videoCodec)}) from this video (${codecName(a.videoCodec)}).`;
  }
  if (!a.audioConfig !== !b.audioConfig) return a.audioConfig ? 'It has no sound and this video does.' : "It has sound and this video doesn't.";
  if (
    a.audioConfig &&
    b.audioConfig &&
    (a.audioCodec !== b.audioCodec ||
      a.audioConfig.sampleRate !== b.audioConfig.sampleRate ||
      a.audioConfig.numberOfChannels !== b.audioConfig.numberOfChannels ||
      !sameBytes(bytes(a.audioConfig.description), bytes(b.audioConfig.description)))
  ) {
    return "Its sound was recorded with different settings from this video's.";
  }
  return undefined;
}

/** True when frames are stored out of display order (B-frames), which a copied cut could break. */
async function reordersFrames(track: InputVideoTrack): Promise<boolean> {
  const sink = new EncodedPacketSink(track);
  let latest = -Infinity;
  let seen = 0;
  for await (const packet of sink.packets(undefined, undefined, { metadataOnly: true })) {
    if (packet.timestamp < latest - 1e-6) return true;
    latest = Math.max(latest, packet.timestamp);
    if (++seen >= 300) break;
  }
  return false;
}

async function findKeyframes(track: InputVideoTrack): Promise<number[]> {
  const sink = new EncodedPacketSink(track);
  const times: number[] = [];
  let packet = await sink.getFirstKeyPacket({ metadataOnly: true });
  while (packet) {
    times.push(packet.timestamp);
    packet = await sink.getNextKeyPacket(packet, { metadataOnly: true });
  }
  return times.length ? times : [0];
}

/** The keyframe at or before a time of a source (or its first one). */
export function keyframeBefore(source: EditSource, time: number): number {
  const list = source.keyframes;
  let lo = 0;
  let hi = list.length - 1;
  if (time < list[0]! + 1e-3) return list[0]!;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (list[mid]! <= time + 1e-3) lo = mid;
    else hi = mid - 1;
  }
  return list[lo]!;
}

/**
 * The same video and sound in an MP4, with the frames copied rather than re-encoded, so
 * the preview can seek anywhere straight away. Falls back to writing the duration in.
 */
async function seekableCopy(blob: Blob, durationS: number): Promise<Blob> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    // MP4 holds every codec MediaRecorder writes to WebM, so nothing is re-encoded.
    const conversion = await Conversion.init({ input, output, tracks: 'primary', showWarnings: false });
    if (!conversion.isValid) throw new Error("Can't copy this video");
    await conversion.execute();
    return new Blob([target.buffer!], { type: 'video/mp4' });
  } catch {
    return makeSeekable(blob, durationS * 1000);
  } finally {
    input.dispose();
  }
}

const THUMB_HEIGHT = 48;

/** About one frame every few seconds, between 8 and 120 of them, as small images. */
export async function makeThumbnails(source: EditSource, signal: AbortSignal): Promise<Thumbnail[]> {
  const input = new Input({ source: new BlobSource(source.blob), formats: ALL_FORMATS });
  const thumbnails: Thumbnail[] = [];
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return [];
    const count = Math.round(Math.min(120, Math.max(8, source.durationS / 3)));
    const step = source.durationS / count;
    const times = Array.from({ length: count }, (_, i) => i * step + step / 2);
    const width = Math.max(2, Math.round((THUMB_HEIGHT * 2 * source.width) / source.height));
    const sink = new CanvasSink(track, { width, height: THUMB_HEIGHT * 2, fit: 'cover' });
    let i = 0;
    for await (const wrapped of sink.canvasesAtTimestamps(times)) {
      if (signal.aborted) break;
      const time = times[i++]!;
      if (!wrapped) continue;
      thumbnails.push({ time, image: await createImageBitmap(wrapped.canvas) });
    }
  } finally {
    input.dispose();
  }
  if (signal.aborted) {
    thumbnails.forEach((t) => t.image.close());
    return [];
  }
  return thumbnails;
}

const WINDOW_S = 0.05;

/** Decodes the audio a buffer at a time and keeps only its level per 50 ms. */
export async function measureLoudness(
  source: EditSource,
  signal: AbortSignal,
  onProgress?: (fraction: number) => void,
): Promise<Loudness | undefined> {
  if (!source.hasAudio) return undefined;
  const input = new Input({ source: new BlobSource(source.blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return undefined;
    const windows = Math.ceil(source.durationS / WINDOW_S) + 1;
    const sumSquares = new Float64Array(windows);
    const counts = new Uint32Array(windows);
    const peak = new Float32Array(windows);
    for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers()) {
      if (signal.aborted) return undefined;
      const rate = buffer.sampleRate;
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
      for (let i = 0; i < buffer.length; i++) {
        const w = Math.floor((timestamp + i / rate) / WINDOW_S);
        if (w < 0 || w >= windows) continue;
        // The loudest channel, so a one-sided microphone still counts.
        let value = 0;
        for (const data of channels) value = Math.max(value, Math.abs(data[i]!));
        sumSquares[w] = sumSquares[w]! + value * value;
        counts[w] = counts[w]! + 1;
        if (value > peak[w]!) peak[w] = value;
      }
      onProgress?.(Math.min(1, timestamp / source.durationS));
    }
    const rmsDb = new Float32Array(windows);
    for (let w = 0; w < windows; w++) {
      const rms = counts[w] ? Math.sqrt(sumSquares[w]! / counts[w]!) : 0;
      rmsDb[w] = rms > 0 ? Math.max(SILENT_DB, 20 * Math.log10(rms)) : SILENT_DB;
    }
    return { windowS: WINDOW_S, rmsDb, peak };
  } finally {
    input.dispose();
  }
}

/** Speech fades in and out; this much is left at each end of a quiet stretch. */
const PADDING_S = 0.2;

/** Stretches where the audio stays under `thresholdDb` for at least `minS` seconds, in source time. */
export function findSilences(loudness: Loudness, thresholdDb: number, minS: number, durationS: number): Range[] {
  const ranges: Range[] = [];
  let runStart = -1;
  const close = (endWindow: number) => {
    const start = runStart * loudness.windowS;
    const end = Math.min(durationS, endWindow * loudness.windowS);
    if (end - start >= minS) {
      // Keep a little sound either side, except at the very start and end of the video.
      const padStart = start <= 0 ? 0 : PADDING_S;
      const padEnd = end >= durationS - loudness.windowS ? 0 : PADDING_S;
      if (end - padEnd - (start + padStart) > 0.1) ranges.push({ start: start + padStart, end: end - padEnd });
    }
    runStart = -1;
  };
  for (let w = 0; w < loudness.rmsDb.length; w++) {
    if (loudness.rmsDb[w]! < thresholdDb) {
      if (runStart < 0) runStart = w;
    } else if (runStart >= 0) close(w);
  }
  if (runStart >= 0) close(loudness.rmsDb.length);
  return ranges;
}
