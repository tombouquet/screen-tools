// The speech models Transcribe can use, and what each costs to download. Shared by the
// Settings page, the Transcribe button and the worker, so it imports nothing heavy.

export const TRANSCRIPTION_MODELS = ['tiny', 'base', 'small'] as const;
export type TranscriptionModel = (typeof TRANSCRIPTION_MODELS)[number];

/** How the model runs: on the graphics card through WebGPU, or on the processor through WebAssembly. */
export type TranscriptionDevice = 'webgpu' | 'wasm';

/** ONNX weight precision per model part, as transformers.js names them. */
type Dtypes = { encoder_model: 'fp32' | 'q8' | 'q4'; decoder_model_merged: 'q8' | 'q4' };

interface ModelInfo {
  /** Hugging Face repo. Multilingual Whisper exported to ONNX for transformers.js. */
  repo: string;
  label: string;
  description: string;
  /**
   * WebGPU can't run 8-bit weights well (they fall back to the processor), so it gets
   * full-precision encoders and 4-bit decoders. WebAssembly runs 8-bit weights fastest.
   */
  dtype: Record<TranscriptionDevice, Dtypes>;
  /** Approximate download in MB, the sum of the two ONNX files plus a few small JSON files. */
  downloadMb: Record<TranscriptionDevice, number>;
}

export const MODELS: Record<TranscriptionModel, ModelInfo> = {
  tiny: {
    repo: 'onnx-community/whisper-tiny',
    label: 'Tiny',
    description: 'Fastest, rougher on accents and noise',
    dtype: { webgpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, wasm: { encoder_model: 'q8', decoder_model_merged: 'q8' } },
    downloadMb: { webgpu: 120, wasm: 41 },
  },
  base: {
    repo: 'onnx-community/whisper-base',
    label: 'Base',
    description: 'Good balance of speed and accuracy',
    dtype: { webgpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, wasm: { encoder_model: 'q8', decoder_model_merged: 'q8' } },
    downloadMb: { webgpu: 206, wasm: 77 },
  },
  small: {
    repo: 'onnx-community/whisper-small',
    label: 'Small',
    description: 'Most accurate, several times slower',
    // A full-precision encoder would be 350 MB, so Small uses 4-bit throughout on WebGPU.
    dtype: { webgpu: { encoder_model: 'q4', decoder_model_merged: 'q4' }, wasm: { encoder_model: 'q8', decoder_model_merged: 'q8' } },
    downloadMb: { webgpu: 300, wasm: 250 },
  },
};

/**
 * Hosts the weights come from: huggingface.co, which redirects the large files to its
 * CDN (`*.hf.co` today, `cdn-lfs.huggingface.co` before). Asked for as optional host
 * permissions on the first download. Keep in step with wxt.config.ts.
 */
export const MODEL_HOSTS = ['https://huggingface.co/*', 'https://*.huggingface.co/*', 'https://*.hf.co/*'];

/** Where transformers.js keeps downloaded files (its `env.cacheKey`), in the Cache API. */
export const MODEL_CACHE = 'transformers-cache';

/** Whisper's own language codes. Auto-detect leaves it out and lets the model decide. */
export const TRANSCRIPTION_LANGUAGES = [
  { id: 'auto', label: 'Detect automatically' },
  { id: 'en', label: 'English' },
  { id: 'zh', label: 'Chinese' },
  { id: 'nl', label: 'Dutch' },
  { id: 'fr', label: 'French' },
  { id: 'de', label: 'German' },
  { id: 'hi', label: 'Hindi' },
  { id: 'id', label: 'Indonesian' },
  { id: 'it', label: 'Italian' },
  { id: 'ja', label: 'Japanese' },
  { id: 'ko', label: 'Korean' },
  { id: 'pl', label: 'Polish' },
  { id: 'pt', label: 'Portuguese' },
  { id: 'ru', label: 'Russian' },
  { id: 'es', label: 'Spanish' },
  { id: 'sv', label: 'Swedish' },
  { id: 'tr', label: 'Turkish' },
  { id: 'uk', label: 'Ukrainian' },
  { id: 'vi', label: 'Vietnamese' },
] as const;
export type TranscriptionLanguage = (typeof TRANSCRIPTION_LANGUAGES)[number]['id'];
