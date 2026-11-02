// Turns an edit into a video file, in the browser, with Mediabunny. Two ways:
//
// - Copy: the compressed frames are copied across untouched. Fast and lossless, but a
//   cut can only start on a keyframe, so each cut start moves back to the keyframe
//   before it. Only possible when nothing is sped up and every clip has the same video
//   and audio format (e.g. trims, cuts and joins of recordings made with the same settings).
// - Re-encode: frames are decoded and encoded again, a few at a time. Cuts land on the
//   exact frame, sped-up parts drop frames down to 30 fps, and different formats and
//   sizes can be joined (smaller videos are letterboxed to the first clip's size).
//
// Sped-up parts are muted: the audio there is replaced with silence of the sped-up
// length, so sound stays in sync after them. The result is held in memory, like a
// compressed copy, and the source files are only read.
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  VideoSampleSink,
  VideoSampleSource,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type AudioCodec,
  type InputAudioTrack,
  type InputVideoTrack,
  type VideoCodec,
} from 'mediabunny';
import { isWebm } from '@/lib/formats';
import { platform } from '@/platform';
import { editLength, placeSegments, type Edit } from './model';
import type { EditSource } from './source';

export type RenderMode = 'copy' | 'encode';
type Container = 'mp4' | 'webm';

export interface RenderPlan {
  /** Why copying isn't possible, or undefined when it is. */
  copyBlocked?: string;
  /** With copy, the furthest a cut start moves back to reach a keyframe, in seconds. */
  copyShiftS: number;
  /** The container each mode writes. */
  copyContainer: Container;
  encodeContainer: Container;
  durationS: number;
}

export interface RenderResult {
  blob: Blob;
  mimeType: string;
  mode: RenderMode;
  durationS: number;
}

export class RenderCancelled extends Error {}

/** Under a frame at 30 fps: copying is as exact as re-encoding. */
export const EXACT_SHIFT_S = 1 / 30;

const VIDEO_CODECS: Record<Container, VideoCodec[]> = { mp4: ['avc', 'hevc', 'vp9', 'av1'], webm: ['vp9', 'vp8', 'av1'] };
const AUDIO_CODECS: Record<Container, AudioCodec[]> = { mp4: ['aac', 'opus'], webm: ['opus', 'vorbis'] };
const SUPPORTED: Record<Container, { video: string[]; audio: string[] }> = {
  mp4: { video: ['avc', 'hevc', 'vp9', 'av1', 'vp8'], audio: ['aac', 'opus', 'mp3', 'vorbis', 'flac'] },
  webm: { video: ['vp9', 'av1', 'vp8'], audio: ['opus', 'vorbis'] },
};

interface Opened {
  input: Input;
  video: InputVideoTrack;
  audio: InputAudioTrack | null;
  videoConfig: VideoDecoderConfig | null;
  audioConfig: AudioDecoderConfig | null;
  videoCodec: VideoCodec | null;
  audioCodec: AudioCodec | null;
}

async function open(source: EditSource): Promise<Opened> {
  const input = new Input({ source: new BlobSource(source.blob), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  if (!video) throw new Error(`${source.name} has no video.`);
  const audio = source.hasAudio ? await input.getPrimaryAudioTrack() : null;
  return {
    input,
    video,
    audio,
    videoConfig: await video.getDecoderConfig(),
    audioConfig: audio && (await audio.getDecoderConfig()),
    videoCodec: await video.getCodec(),
    audioCodec: audio && (await audio.getCodec()),
  };
}

const bytes = (data: AllowSharedBufferSource | undefined) => {
  if (!data) return undefined;
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(data);
};

const sameBytes = (a?: Uint8Array, b?: Uint8Array) => (!a && !b) || (!!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]));

function sameVideo(a: Opened, b: Opened) {
  return (
    a.videoCodec === b.videoCodec &&
    a.videoConfig?.codec === b.videoConfig?.codec &&
    a.videoConfig?.codedWidth === b.videoConfig?.codedWidth &&
    a.videoConfig?.codedHeight === b.videoConfig?.codedHeight &&
    sameBytes(bytes(a.videoConfig?.description), bytes(b.videoConfig?.description))
  );
}

function sameAudio(a: Opened, b: Opened) {
  if (!a.audio || !b.audio) return !a.audio && !b.audio;
  return (
    a.audioCodec === b.audioCodec &&
    a.audioConfig?.sampleRate === b.audioConfig?.sampleRate &&
    a.audioConfig?.numberOfChannels === b.audioConfig?.numberOfChannels &&
    sameBytes(bytes(a.audioConfig?.description), bytes(b.audioConfig?.description))
  );
}

/** True when frames are stored out of display order (B-frames), which a copied cut end could break. */
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

/** Works out which ways this edit can be exported. */
export async function planRender(edit: Edit, sources: Map<string, EditSource>): Promise<RenderPlan> {
  const used = [...new Set(edit.map((c) => c.sourceId))].map((id) => sources.get(id)!);
  const first = used[0];
  const encodeContainer: Container = first && isWebm(first.mimeType) ? 'webm' : 'mp4';
  const plan: RenderPlan = { copyShiftS: 0, copyContainer: 'mp4', encodeContainer, durationS: editLength(edit) };
  if (!first) return { ...plan, copyBlocked: 'Nothing to export.' };
  if (placeSegments(edit).some((p) => p.segment.speed !== 1)) return { ...plan, copyBlocked: 'Some parts are sped up.' };

  const opened = new Map<string, Opened>();
  try {
    for (const source of used) opened.set(source.id, await open(source));
    const all = [...opened.values()];
    const head = all[0]!;
    if (!all.every((o) => sameVideo(head, o))) return { ...plan, copyBlocked: 'The clips have different video formats or sizes.' };
    if (!all.every((o) => sameAudio(head, o))) return { ...plan, copyBlocked: 'The clips have different sound formats.' };
    if (!head.videoCodec || !head.videoConfig) return { ...plan, copyBlocked: "This video's format can't be copied." };
    for (const o of all) if (await reordersFrames(o.video)) return { ...plan, copyBlocked: 'This video stores frames out of order.' };

    // Keep the source's container when it can hold these formats; otherwise MP4 can.
    const fits = (c: Container) =>
      SUPPORTED[c].video.includes(head.videoCodec!) && (!head.audioCodec || SUPPORTED[c].audio.includes(head.audioCodec));
    const copyContainer: Container = isWebm(first.mimeType) && fits('webm') ? 'webm' : 'mp4';
    if (!fits(copyContainer)) return { ...plan, copyBlocked: "This video's format can't be copied." };

    let copyShiftS = 0;
    for (const p of placeSegments(edit)) {
      const sink = new EncodedPacketSink(opened.get(p.clip.sourceId)!.video);
      const key = await sink.getKeyPacket(p.segment.start, { verifyKeyPackets: true });
      copyShiftS = Math.max(copyShiftS, key ? Math.max(0, p.segment.start - key.timestamp) : 0);
    }
    return { ...plan, copyContainer, copyShiftS };
  } finally {
    for (const o of opened.values()) o.input.dispose();
  }
}

export interface RenderJob {
  promise: Promise<RenderResult>;
  cancel: () => void;
}

export function renderEdit(
  edit: Edit,
  sources: Map<string, EditSource>,
  mode: RenderMode,
  plan: RenderPlan,
  onProgress: (fraction: number) => void,
): RenderJob {
  let cancelled = false;
  let output: Output | undefined;
  const check = () => {
    if (cancelled) throw new RenderCancelled();
  };

  const run = async (): Promise<RenderResult> => {
    const opened = new Map<string, Opened>();
    try {
      for (const id of new Set(edit.map((c) => c.sourceId))) opened.set(id, await open(sources.get(id)!));
      check();
      const container = mode === 'copy' ? plan.copyContainer : plan.encodeContainer;
      const target = new BufferTarget();
      output = new Output({
        format: container === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target,
      });
      const durationS =
        mode === 'copy'
          ? await copyInto(output, edit, opened, check, onProgress, plan.durationS)
          : await encodeInto(output, edit, sources, opened, container, check, onProgress, plan.durationS);
      check();
      await output.finalize();
      const mimeType = output.format.mimeType;
      return { blob: new Blob([target.buffer!], { type: mimeType }), mimeType, mode, durationS };
    } catch (error) {
      if (output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => {});
      throw cancelled ? new RenderCancelled() : error;
    } finally {
      for (const o of opened.values()) o.input.dispose();
    }
  };

  return {
    promise: run(),
    cancel: () => {
      cancelled = true;
      // Unblocks a write that's waiting on the encoder.
      if (output && output.state !== 'finalized' && output.state !== 'canceled') void output.cancel().catch(() => {});
    },
  };
}

/** Copies compressed frames; returns the length written. */
async function copyInto(
  output: Output,
  edit: Edit,
  opened: Map<string, Opened>,
  check: () => void,
  onProgress: (fraction: number) => void,
  totalS: number,
): Promise<number> {
  const head = opened.get(edit[0]!.sourceId)!;
  const videoSource = new EncodedVideoPacketSource(head.videoCodec!);
  output.addVideoTrack(videoSource);
  const audioSource = head.audio && head.audioCodec ? new EncodedAudioPacketSource(head.audioCodec) : undefined;
  if (audioSource) output.addAudioTrack(audioSource);
  await output.start();

  let offset = 0;
  let videoSeq = 0;
  let audioSeq = 0;
  for (const p of placeSegments(edit)) {
    const o = opened.get(p.clip.sourceId)!;
    const videoSink = new EncodedPacketSink(o.video);
    const key =
      (await videoSink.getKeyPacket(p.segment.start, { verifyKeyPackets: true })) ??
      (await videoSink.getFirstKeyPacket({ verifyKeyPackets: true }));
    if (!key) continue;
    const from = key.timestamp;
    const to = p.segment.end;
    // The segment really ends where its last frame does, so the next one starts right after it.
    const last = await videoSink.getPacket(to, { metadataOnly: true });
    const until = last && last.timestamp < to ? last.timestamp + last.duration : to;

    const copyVideo = async () => {
      for await (const packet of videoSink.packets(key)) {
        check();
        if (packet.timestamp >= to) break;
        const first = videoSeq === 0;
        await videoSource.add(
          packet.clone({ timestamp: offset + packet.timestamp - from, sequenceNumber: videoSeq++ }),
          first ? { decoderConfig: head.videoConfig! } : undefined,
        );
        onProgress(Math.min(0.99, (offset + packet.timestamp - from) / Math.max(totalS, 0.001)));
      }
    };
    const copyAudio = async () => {
      if (!audioSource || !o.audio) return;
      const sink = new EncodedPacketSink(o.audio);
      const start = (await sink.getPacket(from)) ?? (await sink.getFirstPacket());
      if (!start) return;
      for await (const packet of sink.packets(start)) {
        check();
        if (packet.timestamp + packet.duration > until + 1e-3) break;
        if (packet.timestamp < from - 1e-6) continue;
        const first = audioSeq === 0;
        await audioSource.add(
          packet.clone({ timestamp: offset + packet.timestamp - from, sequenceNumber: audioSeq++ }),
          first && head.audioConfig ? { decoderConfig: head.audioConfig } : undefined,
        );
      }
    };
    await together(output, [copyVideo, copyAudio]);
    offset += until - from;
  }
  return offset;
}

/** Sound is written in one layout throughout: stereo at 48 kHz. */
const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
/** Sped-up parts are written at up to this many frames per second. */
const FAST_FPS = 30;

/**
 * Runs a segment's video and audio side by side, so the muxer can interleave them. If
 * one fails, the output is cancelled so the other doesn't wait on it forever.
 */
async function together(output: Output, tasks: (() => Promise<void>)[]) {
  const results = await Promise.allSettled(
    tasks.map((task) =>
      task().catch(async (error: unknown) => {
        if (output.state !== 'canceled' && output.state !== 'finalized') await output.cancel().catch(() => {});
        throw error;
      }),
    ),
  );
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) throw failed.reason;
}

/** Decodes and re-encodes; returns the length written. */
async function encodeInto(
  output: Output,
  edit: Edit,
  sources: Map<string, EditSource>,
  opened: Map<string, Opened>,
  container: Container,
  check: () => void,
  onProgress: (fraction: number) => void,
  totalS: number,
): Promise<number> {
  const first = sources.get(edit[0]!.sourceId)!;
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const width = even(first.width);
  const height = even(first.height);
  const videoCodec = await getFirstEncodableVideoCodec(VIDEO_CODECS[container], { width, height });
  if (!videoCodec) throw new Error(`${platform.name} can't encode video on this computer.`);
  const videoSource = new VideoSampleSource({
    codec: videoCodec,
    quality: QUALITY_HIGH,
    sizeChangeBehavior: 'contain',
    transform: { width, height },
  });
  output.addVideoTrack(videoSource);

  const withSound = [...opened.values()].some((o) => o.audio);
  const audioCodec = withSound
    ? await getFirstEncodableAudioCodec(AUDIO_CODECS[container], { numberOfChannels: CHANNELS, sampleRate: SAMPLE_RATE })
    : null;
  if (withSound && !audioCodec) throw new Error(`${platform.name} can't encode sound on this computer.`);
  const audioSource = audioCodec ? new AudioSampleSource({ codec: audioCodec, quality: QUALITY_HIGH }) : undefined;
  if (audioSource) output.addAudioTrack(audioSource);
  await output.start();

  let offset = 0;
  // The last frame written, so a join never puts two frames a few milliseconds apart.
  let lastFrameAt = -Infinity;
  for (const p of placeSegments(edit)) {
    const o = opened.get(p.clip.sourceId)!;
    const { start, end, speed } = p.segment;
    const length = (end - start) / speed;

    const encodeVideo = async () => {
      let nextAllowed = lastFrameAt + 1 / 240;
      for await (const sample of new VideoSampleSink(o.video).samples(start, end)) {
        try {
          check();
          const at = offset + (Math.max(sample.timestamp, start) - start) / speed;
          if (at >= offset + length || at < nextAllowed) continue;
          nextAllowed = at + (speed !== 1 ? 1 / FAST_FPS : 1 / 240);
          lastFrameAt = at;
          sample.setTimestamp(at);
          sample.setDuration(speed !== 1 ? 1 / FAST_FPS : sample.duration);
          await videoSource.add(sample);
          onProgress(Math.min(0.99, at / Math.max(totalS, 0.001)));
        } finally {
          sample.close();
        }
      }
    };

    const encodeAudio = async () => {
      if (!audioSource) return;
      // Written up to here, in the result's time. Gaps are filled with silence so sound never drifts.
      let written = offset;
      if (speed === 1 && o.audio) {
        for await (const sample of new AudioSampleSink(o.audio).samples(start, end)) {
          try {
            check();
            const from = Math.max(start, sample.timestamp, start + (written - offset));
            const piece = convert(sample, from, Math.min(end, sample.timestamp + sample.duration), offset + (from - start));
            if (!piece) continue;
            try {
              if (piece.timestamp > written + 0.001) await addSilence(audioSource, written, piece.timestamp - written);
              await audioSource.add(piece);
              written = piece.timestamp + piece.duration;
            } finally {
              piece.close();
            }
          } finally {
            sample.close();
          }
        }
      }
      if (written < offset + length - 0.001) await addSilence(audioSource, written, offset + length - written);
    };

    await together(output, [encodeVideo, encodeAudio]);
    offset += length;
  }
  return offset;
}

/**
 * The part of an audio sample between two source times, as a new stereo 48 kHz sample
 * at `at` in the result. Mono is copied to both sides, and other rates are resampled.
 */
function convert(sample: AudioSample, from: number, to: number, at: number): AudioSample | undefined {
  const rate = sample.sampleRate;
  const startFrame = Math.max(0, Math.round((from - sample.timestamp) * rate));
  const endFrame = Math.min(sample.numberOfFrames, Math.round((to - sample.timestamp) * rate));
  const frames = endFrame - startFrame;
  if (frames <= 0) return undefined;
  const planes = Array.from({ length: sample.numberOfChannels }, (_, c) => {
    const plane = new Float32Array(frames);
    sample.copyTo(plane, { planeIndex: c, format: 'f32-planar', frameOffset: startFrame, frameCount: frames });
    return plane;
  });
  const outFrames = rate === SAMPLE_RATE ? frames : Math.max(1, Math.round((frames * SAMPLE_RATE) / rate));
  const data = new Float32Array(outFrames * CHANNELS);
  for (let c = 0; c < CHANNELS; c++) {
    const plane = planes[Math.min(c, planes.length - 1)]!;
    const out = data.subarray(c * outFrames, (c + 1) * outFrames);
    if (outFrames === frames) out.set(plane);
    else {
      // Linear interpolation: fine for speech and screen recordings.
      const step = (frames - 1) / Math.max(1, outFrames - 1);
      for (let i = 0; i < outFrames; i++) {
        const x = i * step;
        const j = Math.floor(x);
        const k = Math.min(frames - 1, j + 1);
        out[i] = plane[j]! + (plane[k]! - plane[j]!) * (x - j);
      }
    }
  }
  return new AudioSample({ data, format: 'f32-planar', numberOfChannels: CHANNELS, sampleRate: SAMPLE_RATE, timestamp: at });
}

/** Writes silence in half-second pieces. */
async function addSilence(source: AudioSampleSource, at: number, seconds: number) {
  const chunk = SAMPLE_RATE / 2;
  let frames = Math.round(seconds * SAMPLE_RATE);
  let time = at;
  while (frames > 0) {
    const n = Math.min(chunk, frames);
    const sample = new AudioSample({
      data: new Float32Array(n * CHANNELS),
      format: 'f32-planar',
      numberOfChannels: CHANNELS,
      sampleRate: SAMPLE_RATE,
      timestamp: time,
    });
    try {
      await source.add(sample);
    } finally {
      sample.close();
    }
    frames -= n;
    time += n / SAMPLE_RATE;
  }
}
