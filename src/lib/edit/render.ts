// Turns an edit into a video file, in the browser, with Mediabunny. The compressed
// frames are copied across untouched, never re-encoded: quick and lossless. That's why
// every segment starts on a keyframe (see model.ts) and why only videos with the same
// format and size can be joined (see source.ts). The result is held in memory, like a
// compressed copy, and the source files are only read.
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  type InputAudioTrack,
  type InputVideoTrack,
} from 'mediabunny';
import { editLength, placeSegments, type Edit } from './model';
import { copyContainer, type EditSource } from './source';

export interface RenderResult {
  blob: Blob;
  mimeType: string;
  durationS: number;
}

export class RenderCancelled extends Error {}

interface Opened {
  input: Input;
  video: InputVideoTrack;
  audio: InputAudioTrack | null;
}

async function open(source: EditSource): Promise<Opened> {
  const input = new Input({ source: new BlobSource(source.blob), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  if (!video) throw new Error(`${source.name} has no video.`);
  const audio = source.hasAudio ? await input.getPrimaryAudioTrack() : null;
  return { input, video, audio };
}

export interface RenderJob {
  promise: Promise<RenderResult>;
  cancel: () => void;
}

export function renderEdit(edit: Edit, sources: Map<string, EditSource>, onProgress: (fraction: number) => void): RenderJob {
  let cancelled = false;
  let output: Output | undefined;
  const check = () => {
    if (cancelled) throw new RenderCancelled();
  };

  const run = async (): Promise<RenderResult> => {
    const opened = new Map<string, Opened>();
    try {
      const head = sources.get(edit[0]!.sourceId)!;
      for (const id of new Set(edit.map((c) => c.sourceId))) opened.set(id, await open(sources.get(id)!));
      check();
      const target = new BufferTarget();
      output = new Output({
        format: copyContainer(head.mimeType, head.format) === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target,
      });
      const durationS = await copyInto(output, edit, head, opened, check, onProgress, editLength(edit));
      check();
      await output.finalize();
      const mimeType = output.format.mimeType;
      return { blob: new Blob([target.buffer!], { type: mimeType }), mimeType, durationS };
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
      // Unblocks a write that's waiting on the muxer.
      if (output && output.state !== 'finalized' && output.state !== 'canceled') void output.cancel().catch(() => {});
    },
  };
}

/** Copies compressed frames; returns the length written. */
async function copyInto(
  output: Output,
  edit: Edit,
  head: EditSource,
  opened: Map<string, Opened>,
  check: () => void,
  onProgress: (fraction: number) => void,
  totalS: number,
): Promise<number> {
  const { videoCodec, videoConfig, audioCodec, audioConfig } = head.format;
  const videoSource = new EncodedVideoPacketSource(videoCodec);
  output.addVideoTrack(videoSource);
  const audioSource = audioCodec ? new EncodedAudioPacketSource(audioCodec) : undefined;
  if (audioSource) output.addAudioTrack(audioSource);
  await output.start();

  let offset = 0;
  let videoSeq = 0;
  let audioSeq = 0;
  for (const p of placeSegments(edit)) {
    const o = opened.get(p.clip.sourceId)!;
    const videoSink = new EncodedPacketSink(o.video);
    // Segments start on keyframes (see model.ts); the slack only absorbs rounding.
    const key = (await videoSink.getKeyPacket(p.segment.start + 1e-3)) ?? (await videoSink.getFirstKeyPacket());
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
          first ? { decoderConfig: videoConfig } : undefined,
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
          first && audioConfig ? { decoderConfig: audioConfig } : undefined,
        );
      }
    };
    await together(output, [copyVideo, copyAudio]);
    offset += until - from;
  }
  return offset;
}

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
