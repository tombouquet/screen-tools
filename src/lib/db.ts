// Recordings live in IndexedDB as a row per video plus its chunks. MediaRecorder hands
// over a chunk every few seconds and each one is written straight away, so a crash or
// a closed window loses at most one chunk. Screenshots are one row each. Only the
// latest few of each are kept. Uploads to connected services get a row each, so their
// progress and links survive a reload and an interrupted one can carry on.
import { openDB, type DBSchema } from 'idb';
import type { ConnectorId, MediaKind, UploadResult } from './connectors/types';

export const MAX_RECORDINGS = 5;
export const MAX_SCREENSHOTS = 10;

export interface RecordingRow {
  date: string;
  mimeType: string;
  /** Set when the recording stops cleanly. Missing after a crash. */
  durationMs?: number;
  /** True once the user has saved (downloaded) it. */
  saved?: boolean;
  /** WebM gets a duration header written so players can seek it. MP4 is always seekable. */
  seekable?: boolean;
  /** The file name the user gave it when saving, without the extension. */
  name?: string;
  /** A small JPEG of an early frame, for the list. Made the first time the list shows it. */
  thumbnail?: Blob;
}

export interface Recording extends RecordingRow {
  id: number;
}

export interface ScreenshotRow {
  date: string;
  /** The image with any edits flattened in. */
  blob: Blob;
  /** As captured, so edits can be reverted. */
  original: Blob;
  width: number;
  height: number;
  /** The page it was taken of. */
  title?: string;
  url?: string;
  /** True once annotated or cropped, so it can be reverted. */
  edited?: boolean;
  /** True once downloaded or copied. */
  saved?: boolean;
}

export interface Screenshot extends ScreenshotRow {
  id: number;
}

export type UploadSourceKind = 'recording' | 'screenshot';
export type UploadStatus = 'uploading' | 'done' | 'failed' | 'interrupted';

export interface UploadRow {
  /** What was uploaded. Missing for files that aren't kept here (e.g. one opened in the player). */
  sourceKind?: UploadSourceKind;
  sourceId?: number;
  connector: ConnectorId;
  fileName: string;
  mimeType: string;
  kind: MediaKind;
  share: boolean;
  /** Bytes in the file. */
  size: number;
  status: UploadStatus;
  /** Bytes the service has confirmed. */
  sentBytes: number;
  result?: UploadResult;
  error?: string;
  /** The connector's protocol state, so an interrupted upload can carry on. */
  resumeState?: unknown;
  /**
   * The file as uploaded, kept until it's done when it isn't the stored original (a
   * compressed copy or a re-encoded screenshot), so a retry sends the same bytes.
   */
  blob?: Blob;
  /** ISO date. */
  date: string;
}

export interface Upload extends UploadRow {
  id: number;
}

interface Schema extends DBSchema {
  recordings: { key: number; value: RecordingRow };
  chunks: { key: number; value: { recording: number; data: Blob }; indexes: { recording: number } };
  screenshots: { key: number; value: ScreenshotRow };
  uploads: { key: number; value: UploadRow; indexes: { source: [UploadSourceKind, number] } };
}

const db = openDB<Schema>('screen-tools', 2, {
  upgrade(database, oldVersion) {
    // Each step only adds, so data from older versions is kept.
    if (oldVersion < 1) {
      database.createObjectStore('recordings', { autoIncrement: true });
      database.createObjectStore('chunks', { autoIncrement: true }).createIndex('recording', 'recording');
      database.createObjectStore('screenshots', { autoIncrement: true });
    }
    if (oldVersion < 2) {
      // Rows without a source have no key for this index, so they're left out of it.
      database.createObjectStore('uploads', { autoIncrement: true }).createIndex('source', ['sourceKind', 'sourceId']);
    }
  },
});

export async function createRecording(mimeType: string): Promise<number> {
  return (await db).add('recordings', { date: new Date().toISOString(), mimeType });
}

export async function addChunk(recording: number, data: Blob): Promise<void> {
  await (await db).add('chunks', { recording, data });
}

export async function updateRecording(id: number, patch: Partial<RecordingRow>): Promise<void> {
  const database = await db;
  const tx = database.transaction('recordings', 'readwrite');
  const row = await tx.store.get(id);
  if (row) await tx.store.put({ ...row, ...patch }, id);
  await tx.done;
}

export async function getRecording(id: number): Promise<Recording | undefined> {
  const row = await (await db).get('recordings', id);
  return row && { ...row, id };
}

export async function getRecordingBlob(id: number): Promise<Blob | undefined> {
  const database = await db;
  const row = await database.get('recordings', id);
  if (!row) return undefined;
  // Chunk keys auto-increment, so index order is the order they were recorded in.
  const chunks = await database.getAllFromIndex('chunks', 'recording', id);
  if (!chunks.length) return undefined;
  return new Blob(
    chunks.map((c) => c.data),
    { type: row.mimeType.split(';')[0] },
  );
}

/** Replaces a recording's chunks with one blob, e.g. after making it seekable. */
export async function replaceRecordingBlob(id: number, blob: Blob): Promise<void> {
  const database = await db;
  const tx = database.transaction('chunks', 'readwrite');
  for (const key of await tx.store.index('recording').getAllKeys(id)) await tx.store.delete(key);
  await tx.store.add({ recording: id, data: blob });
  await tx.done;
}

export async function deleteRecording(id: number): Promise<void> {
  const database = await db;
  const tx = database.transaction(['recordings', 'chunks', 'uploads'], 'readwrite');
  const chunks = tx.objectStore('chunks');
  for (const key of await chunks.index('recording').getAllKeys(id)) await chunks.delete(key);
  const uploads = tx.objectStore('uploads');
  for (const key of await uploads.index('source').getAllKeys(['recording', id])) await uploads.delete(key);
  await tx.objectStore('recordings').delete(id);
  await tx.done;
}

/** Newest first. */
export async function listRecordings(): Promise<Recording[]> {
  const database = await db;
  const tx = database.transaction('recordings');
  const [rows, keys] = await Promise.all([tx.store.getAll(), tx.store.getAllKeys()]);
  return rows.map((row, i) => ({ ...row, id: keys[i]! })).sort((a, b) => b.id - a.id);
}

/** Makes room for a new recording by deleting the oldest beyond the limit. One still uploading is kept. */
export async function pruneRecordings(keep = MAX_RECORDINGS - 1): Promise<void> {
  const recordings = await listRecordings();
  for (const old of recordings.slice(keep)) {
    if (await isUploading('recording', old.id)) continue;
    await deleteRecording(old.id);
  }
}

/** Stores a new screenshot and deletes the oldest beyond the limit. */
export async function addScreenshot(row: Omit<ScreenshotRow, 'date'>): Promise<number> {
  const database = await db;
  const id = await database.add('screenshots', { ...row, date: new Date().toISOString() });
  const keys = await database.getAllKeys('screenshots');
  for (const old of keys.sort((a, b) => b - a).slice(MAX_SCREENSHOTS)) await deleteScreenshot(old);
  return id;
}

export async function getScreenshot(id: number): Promise<Screenshot | undefined> {
  const row = await (await db).get('screenshots', id);
  return row && { ...row, id };
}

export async function updateScreenshot(id: number, patch: Partial<ScreenshotRow>): Promise<void> {
  const database = await db;
  const tx = database.transaction('screenshots', 'readwrite');
  const row = await tx.store.get(id);
  if (row) await tx.store.put({ ...row, ...patch }, id);
  await tx.done;
}

export async function deleteScreenshot(id: number): Promise<void> {
  const database = await db;
  const tx = database.transaction(['screenshots', 'uploads'], 'readwrite');
  const uploads = tx.objectStore('uploads');
  for (const key of await uploads.index('source').getAllKeys(['screenshot', id])) await uploads.delete(key);
  await tx.objectStore('screenshots').delete(id);
  await tx.done;
}

/** Newest first. */
export async function listScreenshots(): Promise<Screenshot[]> {
  const database = await db;
  const tx = database.transaction('screenshots');
  const [rows, keys] = await Promise.all([tx.store.getAll(), tx.store.getAllKeys()]);
  return rows.map((row, i) => ({ ...row, id: keys[i]! })).sort((a, b) => b.id - a.id);
}

export async function addUpload(row: UploadRow): Promise<number> {
  return (await db).add('uploads', row);
}

export async function getUpload(id: number): Promise<Upload | undefined> {
  const row = await (await db).get('uploads', id);
  return row && { ...row, id };
}

/** Patches an upload. Does nothing if it was deleted meanwhile (e.g. with its recording). */
export async function updateUpload(id: number, patch: Partial<UploadRow>): Promise<void> {
  const database = await db;
  const tx = database.transaction('uploads', 'readwrite');
  const row = await tx.store.get(id);
  if (row) await tx.store.put({ ...row, ...patch }, id);
  await tx.done;
}

export async function deleteUpload(id: number): Promise<void> {
  await (await db).delete('uploads', id);
}

/** A recording's or screenshot's uploads, newest first. Without a source, every upload. */
export async function listUploads(kind?: UploadSourceKind, sourceId?: number): Promise<Upload[]> {
  const database = await db;
  const tx = database.transaction('uploads');
  // An index's getAllKeys gives primary keys, in the same order as its getAll.
  const [rows, keys] =
    kind !== undefined && sourceId !== undefined
      ? await Promise.all([
          tx.store.index('source').getAll([kind, sourceId]),
          tx.store.index('source').getAllKeys([kind, sourceId]),
        ])
      : await Promise.all([tx.store.getAll(), tx.store.getAllKeys()]);
  return rows.map((row, i) => ({ ...row, id: keys[i]! })).sort((a, b) => b.id - a.id);
}

async function isUploading(kind: UploadSourceKind, id: number): Promise<boolean> {
  return (await listUploads(kind, id)).some((u) => u.status === 'uploading');
}
