// Drive's resumable upload protocol: open a session, PUT the file in chunks, and pick up
// from the last confirmed byte when an earlier attempt was interrupted.
// https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable
import { UploadError, type UploadContext, type UploadJob } from '../types';
import { DRIVE_UPLOAD_API, send, toUploadError } from './api';

/** 8 MiB. Every chunk but the last has to be a multiple of 256 KiB. */
const CHUNK_SIZE = 32 * 256 * 1024;

/** A 308 that confirms nothing new this many times in a row means something's wrong. */
const MAX_STALLS = 3;

export interface DriveFile {
  id: string;
  webViewLink?: string;
}

/** What's kept between attempts. Name and size guard against resuming into the wrong file. */
interface ResumeState {
  sessionUri: string;
  fileName: string;
  size: number;
}

type SessionStatus = { done: DriveFile } | { offset: number } | { expired: true };

function readResumeState(job: UploadJob): ResumeState | undefined {
  const state = job.resumeState as Partial<ResumeState> | null | undefined;
  if (
    typeof state?.sessionUri === 'string' &&
    state.fileName === job.fileName &&
    state.size === job.blob.size
  ) {
    return state as ResumeState;
  }
  return undefined;
}

/** The next byte to send, from a 308's `Range: bytes=0-42` header. No header means nothing arrived. */
function nextOffset(res: Response): number {
  const match = /bytes=0-(\d+)/.exec(res.headers.get('Range') ?? '');
  return match ? Number(match[1]) + 1 : 0;
}

const isExpired = (status: number) => status === 404 || status === 410;

/** Opens a session and returns its URI. Metadata goes here; the bytes follow in PUTs. */
async function startSession(job: UploadJob, ctx: UploadContext, folderId: string): Promise<string> {
  const url = `${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,webViewLink`;
  const res = await send(ctx.fetch, url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': job.mimeType,
      'X-Upload-Content-Length': String(job.blob.size),
    },
    body: JSON.stringify({ name: job.fileName, mimeType: job.mimeType, parents: [folderId] }),
    signal: ctx.signal,
  });
  if (!res.ok) throw await toUploadError(res);

  const sessionUri = res.headers.get('Location');
  if (!sessionUri) throw new UploadError("Google Drive didn't start the upload. Try again.", true);
  await ctx.saveResumeState({ sessionUri, fileName: job.fileName, size: job.blob.size } satisfies ResumeState);
  return sessionUri;
}

/** Asks how much of an interrupted upload Drive already has. */
async function querySession(sessionUri: string, size: number, ctx: UploadContext): Promise<SessionStatus> {
  const res = await send(ctx.fetch, sessionUri, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${size}` },
    signal: ctx.signal,
  });
  if (res.status === 200 || res.status === 201) return { done: (await res.json()) as DriveFile };
  if (res.status === 308) return { offset: nextOffset(res) };
  if (isExpired(res.status)) return { expired: true };
  throw await toUploadError(res);
}

/**
 * Uploads `job.blob`, resuming the saved session when there is one. `folderId` is only
 * called when a new session is needed, so resuming skips the folder lookup.
 */
export async function uploadResumable(
  job: UploadJob,
  ctx: UploadContext,
  folderId: () => Promise<string>,
): Promise<DriveFile> {
  const size = job.blob.size;
  let sessionUri: string | undefined;
  let offset = 0;

  const saved = readResumeState(job);
  if (saved) {
    const status = await querySession(saved.sessionUri, size, ctx);
    if ('done' in status) {
      ctx.onProgress(size);
      return status.done;
    }
    if ('offset' in status) {
      sessionUri = saved.sessionUri;
      offset = status.offset;
    }
  }

  // Sessions last a week. One that's gone mid-upload gets one fresh start.
  let restarted = false;
  let stalls = 0;
  sessionUri ??= await startSession(job, ctx, await folderId());
  ctx.onProgress(offset);

  for (;;) {
    const end = Math.min(offset + CHUNK_SIZE, size);
    const res = await send(ctx.fetch, sessionUri, {
      method: 'PUT',
      // An empty file still needs one PUT to finish the session.
      headers: { 'Content-Range': size === 0 ? 'bytes */0' : `bytes ${offset}-${end - 1}/${size}` },
      body: job.blob.slice(offset, end),
      signal: ctx.signal,
    });

    if (res.status === 200 || res.status === 201) {
      ctx.onProgress(size);
      return (await res.json()) as DriveFile;
    }

    if (res.status === 308) {
      const confirmed = nextOffset(res);
      stalls = confirmed > offset ? 0 : stalls + 1;
      if (stalls >= MAX_STALLS) throw new UploadError('The upload to Google Drive stalled. Try again.', true);
      offset = confirmed;
      ctx.onProgress(offset);
      continue;
    }

    if (isExpired(res.status) && !restarted) {
      restarted = true;
      offset = 0;
      sessionUri = await startSession(job, ctx, await folderId());
      ctx.onProgress(0);
      continue;
    }

    const error = await toUploadError(res);
    // Drive says any other 4xx (rate limits aside) spoils the session, so don't resume into it.
    if (error instanceof UploadError && !error.retryable) {
      await ctx.saveResumeState(null);
    }
    throw error;
  }
}
