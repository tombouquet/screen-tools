// Runs uploads to connected services from the app page (never the service worker, which
// Chrome stops when idle). Each upload is a row in IndexedDB, so its link and status
// survive a reload; progress also goes to in-memory listeners for the UI. Every running
// upload holds a Web Lock, so another window can tell which "uploading" rows are still
// alive and which were cut off by a closed window.
import { useSyncExternalStore } from 'react';
import { useBeforeUnload } from '@/hooks/use-before-unload';
import {
  addUpload,
  deleteUpload,
  getRecordingBlob,
  getScreenshot,
  getUpload,
  listUploads,
  updateUpload,
  type Upload,
  type UploadRow,
  type UploadSourceKind,
} from '@/lib/db';
import { authorizedFetch } from './auth';
import { getConnector, loadConnector } from './registry';
import { UploadError, type ConnectorId, type UploadJob, type UploadResult } from './types';

export interface UploadSource {
  kind: UploadSourceKind;
  id: number;
}

export interface StartUploadOptions {
  /** What's being uploaded, so it's listed with it. Leave out for files the app doesn't keep. */
  source?: UploadSource;
  connectorId: ConnectorId;
  job: Omit<UploadJob, 'resumeState'>;
  /**
   * True when `job.blob` is the source's stored file (an original recording), so a
   * resume can read it from there instead of keeping a second copy.
   */
  blobIsSource?: boolean;
}

export interface RunningUpload {
  id: number;
  /** Resolves with the result, or rejects with the error (`UploadCancelled` on Stop). */
  promise: Promise<UploadResult>;
}

export class UploadCancelled extends Error {
  constructor() {
    super('Upload stopped.');
    this.name = 'UploadCancelled';
  }
}

const MAX_RETRIES = 3;
const backoffMs = (attempt: number) => 1000 * 2 ** attempt;
/** How often progress is written to the row; the in-memory listeners get every update. */
const SAVE_EVERY_MS = 2000;
const LOCK_PREFIX = 'screen-tools-upload-';

// --- Live state, for the UI ---

export interface LiveUpload {
  sentBytes: number;
  size: number;
}

let live: ReadonlyMap<number, LiveUpload> = new Map();
/** Bumped whenever a row is added, changes status or goes, so lists know to reload. */
let version = 0;
const listeners = new Set<() => void>();
const controllers = new Map<number, AbortController>();

const notify = () => listeners.forEach((l) => l());

function setLive(id: number, value: LiveUpload | undefined): void {
  const next = new Map(live);
  if (value) next.set(id, value);
  else next.delete(id);
  live = next;
  notify();
}

function bump(): void {
  version++;
  notify();
}

export function subscribeUploads(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Uploads running in this window, by id. */
export const getLiveUploads = () => live;
export const getUploadsVersion = () => version;

/** True while this window has an upload running. */
export const useUploading = () => useSyncExternalStore(subscribeUploads, () => live.size > 0);

/** Makes Chrome ask before closing the window while an upload runs. */
export function useUploadGuard(): void {
  useBeforeUnload(useUploading());
}

// --- Running ---

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new UploadCancelled());
    });
  });

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Runs the connector with retries. The row already exists and says 'uploading'. */
async function run(id: number, row: UploadRow, blob: Blob): Promise<UploadResult> {
  const connector = await loadConnector(row.connector);
  const controller = new AbortController();
  controllers.set(id, controller);
  const { signal } = controller;
  let resumeState = row.resumeState;
  let sentBytes = row.sentBytes;
  let lastSaved = 0;
  setLive(id, { sentBytes, size: blob.size });

  const ctx = {
    fetch: authorizedFetch(row.connector),
    signal,
    onProgress: (bytes: number) => {
      sentBytes = bytes;
      setLive(id, { sentBytes, size: blob.size });
      if (Date.now() - lastSaved < SAVE_EVERY_MS) return;
      lastSaved = Date.now();
      // The status too, in case a window opening just as this started marked it interrupted.
      void updateUpload(id, { sentBytes, status: 'uploading' });
    },
    saveResumeState: async (state: unknown) => {
      resumeState = state;
      await updateUpload(id, { resumeState: state, sentBytes });
    },
  };

  const attempt = async () => {
    for (let retry = 0; ; retry++) {
      try {
        const job: UploadJob = { blob, fileName: row.fileName, mimeType: row.mimeType, kind: row.kind, share: row.share, resumeState };
        return await connector.upload(job, ctx);
      } catch (error) {
        if (signal.aborted) throw new UploadCancelled();
        if (!(error instanceof UploadError && error.retryable) || retry >= MAX_RETRIES) throw error;
        console.warn(`Upload ${id} failed, retrying`, error);
        await sleep(backoffMs(retry), signal);
      }
    }
  };

  try {
    // The lock tells other windows this upload is alive; it's released when this one closes.
    const result = await navigator.locks.request(LOCK_PREFIX + id, attempt);
    await updateUpload(id, { status: 'done', sentBytes: blob.size, result, error: undefined, blob: undefined, resumeState: undefined });
    // Without a source there's nowhere to list it, so the row isn't needed any more.
    if (row.sourceKind === undefined) await deleteUpload(id);
    return result;
  } catch (error) {
    if (error instanceof UploadCancelled || signal.aborted) {
      await deleteUpload(id);
      throw new UploadCancelled();
    }
    console.error(error);
    await updateUpload(id, { status: 'failed', sentBytes, error: errorMessage(error) });
    throw error;
  } finally {
    controllers.delete(id);
    setLive(id, undefined);
    bump();
  }
}

/**
 * Uploads a file to a connected service. The local connector isn't tracked: it just
 * downloads. Rejects with `UploadCancelled` after `cancel`, `ReconnectNeeded` when the
 * account needs signing in again, or the connector's error.
 */
export async function startUpload({ source, connectorId, job, blobIsSource }: StartUploadOptions): Promise<RunningUpload> {
  if (connectorId === 'local') {
    // A download has no account, progress or resume, so it gets an inert context.
    const ctx = { fetch, onProgress: () => {}, saveResumeState: async () => {}, signal: new AbortController().signal };
    return { id: 0, promise: getConnector('local').upload(job, ctx) };
  }
  const row: UploadRow = {
    sourceKind: source?.kind,
    sourceId: source?.id,
    connector: connectorId,
    fileName: job.fileName,
    mimeType: job.mimeType,
    kind: job.kind,
    share: job.share,
    size: job.blob.size,
    status: 'uploading',
    sentBytes: 0,
    blob: blobIsSource && source ? undefined : job.blob,
    date: new Date().toISOString(),
  };
  const id = await addUpload(row);
  bump();
  return { id, promise: run(id, row, job.blob) };
}

/** Stops a running upload and forgets it. */
export function cancel(uploadId: number): void {
  controllers.get(uploadId)?.abort();
}

async function sourceBlob(upload: Upload): Promise<Blob | undefined> {
  if (upload.blob) return upload.blob;
  if (upload.sourceKind === 'recording' && upload.sourceId !== undefined) return getRecordingBlob(upload.sourceId);
  if (upload.sourceKind === 'screenshot' && upload.sourceId !== undefined) return (await getScreenshot(upload.sourceId))?.blob;
  return undefined;
}

/**
 * Carries on with an interrupted or failed upload, passing the connector the state it
 * saved so it can pick up where it stopped. `fresh` starts over instead.
 */
export async function resume(uploadId: number, options: { fresh?: boolean } = {}): Promise<RunningUpload> {
  let fresh = options.fresh ?? false;
  if (controllers.has(uploadId)) throw new Error('That upload is already running.');
  const upload = await getUpload(uploadId);
  if (!upload) throw new Error('That upload is gone.');
  const blob = await sourceBlob(upload);
  if (!blob) throw new Error("The file is gone, so it can't be uploaded again.");
  // The stored recording can change (e.g. made seekable); a session for other bytes is no use.
  if (blob.size !== upload.size) fresh = true;
  const patch: Partial<UploadRow> = {
    size: blob.size,
    status: 'uploading',
    error: undefined,
    ...(fresh ? { resumeState: undefined, sentBytes: 0 } : {}),
  };
  await updateUpload(uploadId, patch);
  bump();
  const { id: _id, ...row } = upload;
  return { id: uploadId, promise: run(uploadId, { ...row, ...patch }, blob) };
}

/**
 * Tries a failed upload again. It carries on from the service's saved session when there
 * is one (e.g. the network dropped for longer than the retries waited), so a big file
 * doesn't start over; the connectors start a new session if that one is gone.
 */
export async function retry(uploadId: number): Promise<RunningUpload> {
  const upload = await getUpload(uploadId);
  return resume(uploadId, { fresh: !upload?.resumeState });
}

/**
 * Marks rows left 'uploading' by a window that's gone as 'interrupted'. Uploads still
 * running in another window hold their lock and are left alone.
 */
async function markInterrupted(): Promise<void> {
  const held = new Set((await navigator.locks.query()).held?.map((lock) => lock.name));
  let changed = false;
  for (const upload of await listUploads()) {
    if (upload.status !== 'uploading' || held.has(LOCK_PREFIX + upload.id) || controllers.has(upload.id)) continue;
    // Nothing lists an upload without a source, so there's nothing to resume it from.
    if (upload.sourceKind === undefined) await deleteUpload(upload.id);
    else await updateUpload(upload.id, { status: 'interrupted' });
    changed = true;
  }
  if (changed) bump();
}

// Once per app page, when anything first imports the uploader.
if (typeof window !== 'undefined' && 'locks' in navigator) {
  void markInterrupted().catch((error: unknown) => console.error("Couldn't check old uploads", error));
}
