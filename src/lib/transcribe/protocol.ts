// Messages between the page (client.ts) and the transcription worker (worker.ts).
import type { TranscriptionDevice, TranscriptionLanguage, TranscriptionModel } from './models';
import type { TranscriptSegment } from './transcript';

export interface WorkerRequest {
  blob: Blob;
  model: TranscriptionModel;
  language: TranscriptionLanguage;
  /** The device to try first. WebGPU falls back to WebAssembly if it fails. */
  device: TranscriptionDevice;
  /** False without the Hugging Face permission: then only an already downloaded model can load. */
  allowDownload: boolean;
}

export type WorkerResponse =
  /** Model files coming in, summed over every file seen so far. */
  | { type: 'download'; loaded: number; total: number }
  | { type: 'loaded'; device: TranscriptionDevice }
  /** Lines transcribed so far from the latest window, timed from the start of the video. */
  | { type: 'segments'; segments: TranscriptSegment[] }
  | { type: 'progress'; seconds: number; duration: number }
  /** `language` is the one used: as picked, or as detected for 'auto'. */
  | { type: 'done'; device: TranscriptionDevice; language: string; elapsedMs: number }
  | { type: 'error'; message: string; noAudio: boolean };
