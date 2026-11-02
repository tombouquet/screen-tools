// Reads a video's sound as 16 kHz mono, the input Whisper takes, a piece at a time so a
// long recording never sits in memory whole (an hour at 16 kHz is still 230 MB of floats).
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input, type AudioSample } from 'mediabunny';

export const SAMPLE_RATE = 16_000;

export class NoAudioError extends Error {
  constructor() {
    super('This video has no sound to transcribe.');
    this.name = 'NoAudioError';
  }
}

export interface AudioReader {
  /** Seconds of sound, from the file's metadata. 0 when it doesn't say. */
  duration: number;
  /** 16 kHz mono samples, in order, in pieces of whatever size the decoder hands over. */
  chunks: AsyncGenerator<Float32Array, void, unknown>;
}

export async function readAudio(blob: Blob): Promise<AudioReader> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new NoAudioError();
  if (!(await track.canDecode())) throw new Error("This browser can't decode the video's sound.");
  const duration = (await track.getDurationFromMetadata().catch(() => null)) ?? (await input.computeDuration().catch(() => 0));

  async function* chunks() {
    const resampler = new Resampler(track!.sampleRate, SAMPLE_RATE);
    try {
      for await (const sample of new AudioSampleSink(track!).samples()) {
        try {
          // A sample can start before 0 (codec priming); there's nothing to hear before the video starts.
          if (sample.timestamp + sample.duration <= 0) continue;
          const out = resampler.push(downmix(sample));
          if (out.length) yield out;
        } finally {
          sample.close();
        }
      }
    } finally {
      input.dispose();
    }
  }
  return { duration, chunks: chunks() };
}

/** Averages the channels into one. */
function downmix(sample: AudioSample): Float32Array {
  const frames = sample.numberOfFrames;
  const mono = new Float32Array(frames);
  const plane = new Float32Array(frames);
  for (let c = 0; c < sample.numberOfChannels; c++) {
    sample.copyTo(plane, { planeIndex: c, format: 'f32-planar' });
    for (let i = 0; i < frames; i++) mono[i]! += plane[i]!;
  }
  if (sample.numberOfChannels > 1) for (let i = 0; i < frames; i++) mono[i]! /= sample.numberOfChannels;
  return mono;
}

/**
 * Streaming sample-rate converter. Each output sample is the average of the input
 * samples it covers, which also filters out the highs that would alias when going down
 * from 44.1 or 48 kHz. Good enough for speech recognition, which only needs up to 8 kHz.
 */
class Resampler {
  private readonly ratio: number;
  /** Input samples not yet used up, and the absolute index of the first one. */
  private pending = new Float32Array(0);
  private pendingStart = 0;
  /** Index of the next output sample. */
  private next = 0;

  constructor(inputRate: number, outputRate: number) {
    this.ratio = inputRate / outputRate;
  }

  push(input: Float32Array): Float32Array {
    const buffer = new Float32Array(this.pending.length + input.length);
    buffer.set(this.pending);
    buffer.set(input, this.pending.length);
    const end = this.pendingStart + buffer.length;

    const out = new Float32Array(Math.ceil(buffer.length / this.ratio) + 1);
    let count = 0;
    for (;;) {
      const from = Math.floor(this.next * this.ratio);
      const to = Math.max(from + 1, Math.floor((this.next + 1) * this.ratio));
      if (to > end) break;
      let sum = 0;
      for (let i = from; i < to; i++) sum += buffer[i - this.pendingStart]!;
      out[count++] = sum / (to - from);
      this.next++;
    }
    const keepFrom = Math.min(end, Math.floor(this.next * this.ratio));
    this.pending = buffer.slice(keepFrom - this.pendingStart);
    this.pendingStart = keepFrom;
    return out.subarray(0, count);
  }
}
