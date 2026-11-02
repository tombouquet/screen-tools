// The page's side of transcription: picks the device, asks for the Hugging Face
// permission, runs the worker and manages the downloaded model. The heavy code is all in
// the worker, which only loads on Transcribe.
import { browser } from 'wxt/browser';
import { platform } from '@/platform';
import { MODEL_CACHE, MODEL_HOSTS, MODELS, type TranscriptionDevice, type TranscriptionLanguage, type TranscriptionModel } from './models';
import type { WorkerRequest, WorkerResponse } from './protocol';
import type { TranscriptSegment } from './transcript';

/** WebGPU where the browser has it and offers a graphics adapter; otherwise WebAssembly. */
export async function pickDevice(): Promise<TranscriptionDevice> {
  if (!platform.capabilities.webGpuTranscription) return 'wasm';
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return 'wasm';
  try {
    return (await gpu.requestAdapter()) ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}

export const hasModelPermission = () => browser.permissions.contains({ origins: MODEL_HOSTS });

/**
 * Asks for the Hugging Face hosts. Call it straight from a click: the prompt needs the
 * gesture, so nothing may be awaited before it.
 */
export const requestModelPermission = () => browser.permissions.request({ origins: MODEL_HOSTS });

const suffix = { fp32: '', q8: '_quantized', q4: '_q4' } as const;

/** The two weight files a model loads on a device, as paths inside its repo. */
const weightFiles = (model: TranscriptionModel, device: TranscriptionDevice) => {
  const { repo, dtype } = MODELS[model];
  return [
    `${repo}/resolve/main/onnx/encoder_model${suffix[dtype[device].encoder_model]}.onnx`,
    `${repo}/resolve/main/onnx/decoder_model_merged${suffix[dtype[device].decoder_model_merged]}.onnx`,
  ];
};

async function cachedUrls(): Promise<string[]> {
  if (!('caches' in self) || !(await caches.has(MODEL_CACHE))) return [];
  return (await (await caches.open(MODEL_CACHE)).keys()).map((r) => r.url);
}

/**
 * The device whose weights for this model are already downloaded, `preferred` first.
 * Undefined when neither is, so transcribing needs a download.
 */
export async function cachedDevice(model: TranscriptionModel, preferred: TranscriptionDevice): Promise<TranscriptionDevice | undefined> {
  const urls = await cachedUrls();
  const has = (device: TranscriptionDevice) => weightFiles(model, device).every((file) => urls.some((url) => url.endsWith(file)));
  const other: TranscriptionDevice = preferred === 'webgpu' ? 'wasm' : 'webgpu';
  return has(preferred) ? preferred : has(other) ? other : undefined;
}

/** Bytes the downloaded models take up. */
export async function modelCacheBytes(): Promise<number> {
  if (!('caches' in self) || !(await caches.has(MODEL_CACHE))) return 0;
  const cache = await caches.open(MODEL_CACHE);
  let total = 0;
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (!response) continue;
    const length = Number(response.headers.get('content-length'));
    total += length > 0 ? length : (await response.blob()).size;
  }
  return total;
}

/** Deletes every downloaded model and gives back the Hugging Face permission. */
export async function deleteModels(): Promise<void> {
  if ('caches' in self) await caches.delete(MODEL_CACHE);
  await browser.permissions.remove({ origins: MODEL_HOSTS }).catch((error: unknown) => console.warn("Couldn't remove permissions", error));
}

export interface TranscribeHandlers {
  onDownload?: (loaded: number, total: number) => void;
  onLoaded?: (device: TranscriptionDevice) => void;
  onSegments?: (segments: TranscriptSegment[]) => void;
  onProgress?: (seconds: number, duration: number) => void;
}

export class TranscriptionCancelled extends Error {
  constructor() {
    super('Transcription cancelled.');
    this.name = 'TranscriptionCancelled';
  }
}

export class NoAudioError extends Error {}

export interface TranscribeResult {
  segments: TranscriptSegment[];
  device: TranscriptionDevice;
  /** Language code used, detected when Settings say 'auto'. */
  language: string;
  elapsedMs: number;
}

export interface TranscribeJob {
  /** Every segment, once it's finished. */
  result: Promise<TranscribeResult>;
  /** Stops the worker straight away; `result` rejects with TranscriptionCancelled. */
  cancel: () => void;
}

export function transcribe(
  blob: Blob,
  options: { model: TranscriptionModel; language: TranscriptionLanguage; device: TranscriptionDevice; allowDownload: boolean },
  handlers: TranscribeHandlers = {},
): TranscribeJob {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'transcribe' });
  const segments: TranscriptSegment[] = [];
  let cancel = () => {};
  const result = new Promise<TranscribeResult>((resolve, reject) => {
    cancel = () => {
      worker.terminate();
      reject(new TranscriptionCancelled());
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Transcription couldn't start."));
    };
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === 'download') handlers.onDownload?.(message.loaded, message.total);
      else if (message.type === 'loaded') handlers.onLoaded?.(message.device);
      else if (message.type === 'progress') handlers.onProgress?.(message.seconds, message.duration);
      else if (message.type === 'segments') {
        segments.push(...message.segments);
        handlers.onSegments?.([...segments]);
      } else if (message.type === 'done') {
        worker.terminate();
        resolve({ segments, device: message.device, language: message.language, elapsedMs: message.elapsedMs });
      } else {
        worker.terminate();
        reject(message.noAudio ? new NoAudioError(message.message) : new Error(message.message));
      }
    };
  });
  const request: WorkerRequest = { blob, ...options };
  worker.postMessage(request);
  return { result, cancel };
}
