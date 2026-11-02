// Runs Whisper off the main thread so the page stays responsive. Loaded only when
// someone clicks Transcribe, so transformers.js and onnxruntime never reach the popup
// or recorder bundles. See client.ts for the other side of the messages.
import { Tensor, env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
// Bundled with the extension: MV3 can't load code from a CDN, which is where
// transformers.js would fetch these from by default.
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import { NoAudioError, SAMPLE_RATE, readAudio } from './audio';
import { MODELS, type TranscriptionDevice } from './models';
import type { WorkerRequest, WorkerResponse } from './protocol';
import type { TranscriptSegment } from './transcript';

/** Whisper hears 30 seconds at a time. */
const WINDOW = 30 * SAMPLE_RATE;
/** A window that ends mid-sentence carries on from its last whole line, unless that would move on less than this. */
const MIN_STEP = 5 * SAMPLE_RATE;
/** Quieter than this (RMS) is silence; Whisper makes up words for silence, so it's skipped. */
const SILENCE = 0.002;

env.allowLocalModels = false;
env.useWasmCache = false;

// transformers.js reads its cache before the network, but won't load at all with remote
// models turned off. So downloads stay on and this guard stops any request off the
// extension unless the page holds the Hugging Face permission for this run.
let allowDownload = false;
const fetchFiles = env.fetch;
env.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), self.location.href);
  if (!allowDownload && url.origin !== self.location.origin) {
    return Promise.reject(new Error('The speech model needs to download again. Click Transcribe and allow huggingface.co.'));
  }
  return fetchFiles(input, init);
};
env.backends.onnx.wasm!.wasmPaths = { wasm: new URL(ortWasm, self.location.href).href, mjs: new URL(ortMjs, self.location.href).href };

const post = (message: WorkerResponse) => self.postMessage(message);

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void run(event.data).catch((error: unknown) => {
    post({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      noAudio: error instanceof NoAudioError,
    });
  });
};

async function run(request: WorkerRequest) {
  const started = performance.now();
  allowDownload = request.allowDownload;
  const { transcriber, device } = await load(request);
  post({ type: 'loaded', device });

  const reader = await readAudio(request.blob);
  // Whisper can tell the language, but transformers.js assumes English unless told, so
  // 'auto' is worked out from the first window with speech in it.
  let language: string | undefined = request.language === 'auto' ? undefined : request.language;
  let leftover: Float32Array = new Float32Array(0);
  let done = false;
  /** Samples already transcribed, i.e. where the next window starts. */
  let offset = 0;

  while (!done || leftover.length) {
    const pieces = [leftover];
    let have = leftover.length;
    while (have < WINDOW && !done) {
      const next = await reader.chunks.next();
      if (next.done) done = true;
      else {
        pieces.push(next.value);
        have += next.value.length;
      }
    }
    const all = concat(pieces, have);
    const window = all.subarray(0, WINDOW);
    const last = done && all.length <= WINDOW;

    let step = window.length;
    let segments: TranscriptSegment[] = [];
    if (rms(window) >= SILENCE) {
      language ??= await detectLanguage(transcriber, window);
      const output = await transcriber(window, { return_timestamps: true, language, task: 'transcribe' });
      const result = Array.isArray(output) ? output[0]! : output;
      ({ segments, step } = place(result.chunks ?? [], window.length, last));
    }
    const at = offset / SAMPLE_RATE;
    if (segments.length) post({ type: 'segments', segments: segments.map((s) => ({ ...s, start: s.start + at, end: s.end + at })) });
    offset += step;
    // Copied, not a view, so the whole window's buffer can be let go.
    leftover = all.slice(step);
    post({ type: 'progress', seconds: offset / SAMPLE_RATE, duration: reader.duration });
  }
  post({ type: 'done', device, language: language ?? request.language, elapsedMs: performance.now() - started });
}

/**
 * Whisper's own language detection: one decoder step after <|startoftranscript|>, and
 * the language token it rates highest. Falls back to English if the model can't say.
 */
async function detectLanguage(transcriber: AutomaticSpeechRecognitionPipeline, audio: Float32Array): Promise<string> {
  try {
    const { input_features } = (await transcriber.processor(audio)) as { input_features: Tensor };
    const config = transcriber.model.generation_config as unknown as {
      decoder_start_token_id: number;
      lang_to_id: Record<string, number>;
    };
    const start = new Tensor('int64', BigInt64Array.from([BigInt(config.decoder_start_token_id)]), [1, 1]);
    const { logits } = (await transcriber.model({ input_features, decoder_input_ids: start })) as { logits: Tensor };
    const scores = logits.data as ArrayLike<number>;
    let best = 'en';
    let bestScore = -Infinity;
    for (const [token, id] of Object.entries(config.lang_to_id)) {
      const score = Number(scores[id]);
      if (score > bestScore) {
        bestScore = score;
        best = token.slice(2, -2); // '<|fr|>' → 'fr'
      }
    }
    return best;
  } catch (error) {
    console.warn("Couldn't detect the language, using English", error);
    return 'en';
  }
}

async function load(request: WorkerRequest): Promise<{ transcriber: AutomaticSpeechRecognitionPipeline; device: TranscriptionDevice }> {
  const model = MODELS[request.model];
  // Bytes per file, so the progress bar covers the whole download.
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (info: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (info.status !== 'progress' || !info.file) return;
    files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    post({ type: 'download', loaded, total });
  };
  const make = (device: TranscriptionDevice) =>
    pipeline('automatic-speech-recognition', model.repo, { device, dtype: model.dtype[device], progress_callback });

  if (request.device === 'webgpu') {
    try {
      return { transcriber: await make('webgpu'), device: 'webgpu' };
    } catch (error) {
      // Some graphics cards have WebGPU but can't run the model; the processor always can.
      console.warn('WebGPU transcription failed, using WebAssembly', error);
    }
  }
  return { transcriber: await make('wasm'), device: 'wasm' };
}

/**
 * Turns Whisper's lines (timed from the window's start) into segments, and says how far
 * to move on. A line still going at the end of the window has no end time; unless this
 * is the last window, it's dropped and the next window starts where the last whole line
 * ended, so a sentence isn't cut in half.
 */
function place(
  chunks: { timestamp: [number, number | null]; text: string }[],
  length: number,
  last: boolean,
): { segments: TranscriptSegment[]; step: number } {
  const seconds = length / SAMPLE_RATE;
  const lines = chunks
    .map((c) => ({ start: Math.min(c.timestamp[0], seconds), end: c.timestamp[1], text: c.text.trim() }))
    .filter((c) => c.text && !/^[[(].*[\])]$/.test(c.text)); // [BLANK_AUDIO], (music) and the like

  const complete = lines.filter((c) => c.end !== null);
  const lastEnd = complete.length ? Math.min(complete.at(-1)!.end!, seconds) : 0;
  const carryOn = !last && lastEnd * SAMPLE_RATE >= MIN_STEP && complete.length < lines.length;
  const kept = carryOn ? complete : lines;
  return {
    segments: kept.map((c) => ({ start: c.start, end: Math.max(c.start, Math.min(c.end ?? seconds, seconds)), text: c.text })),
    step: carryOn ? Math.round(lastEnd * SAMPLE_RATE) : length,
  };
}

function concat(pieces: Float32Array[], length: number): Float32Array {
  if (pieces.length === 1) return pieces[0]!;
  const out = new Float32Array(length);
  let at = 0;
  for (const piece of pieces) {
    out.set(piece, at);
    at += piece.length;
  }
  return out;
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}
