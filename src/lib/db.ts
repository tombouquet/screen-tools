// Recordings live in IndexedDB as a row per video plus its chunks. MediaRecorder hands
// over a chunk every few seconds and each one is written straight away, so a crash or
// a closed window loses at most one chunk. Only the latest few recordings are kept.
import { openDB, type DBSchema } from 'idb';

export const MAX_RECORDINGS = 5;

export interface RecordingRow {
  date: string;
  mimeType: string;
  /** Set when the recording stops cleanly. Missing after a crash. */
  durationMs?: number;
  /** True once the user has saved (downloaded) it. */
  saved?: boolean;
  /** WebM gets a duration header written so players can seek it. MP4 is always seekable. */
  seekable?: boolean;
}

export interface Recording extends RecordingRow {
  id: number;
}

interface Schema extends DBSchema {
  recordings: { key: number; value: RecordingRow };
  chunks: { key: number; value: { recording: number; data: Blob }; indexes: { recording: number } };
}

const db = openDB<Schema>('screen-recorder', 1, {
  upgrade(database) {
    database.createObjectStore('recordings', { autoIncrement: true });
    database.createObjectStore('chunks', { autoIncrement: true }).createIndex('recording', 'recording');
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
  const tx = database.transaction(['recordings', 'chunks'], 'readwrite');
  const chunks = tx.objectStore('chunks');
  for (const key of await chunks.index('recording').getAllKeys(id)) await chunks.delete(key);
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

/** Makes room for a new recording by deleting the oldest beyond the limit. */
export async function pruneRecordings(keep = MAX_RECORDINGS - 1): Promise<void> {
  const recordings = await listRecordings();
  for (const old of recordings.slice(keep)) await deleteRecording(old.id);
}
