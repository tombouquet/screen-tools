// Dropbox, with App folder access: the app only sees /Apps/Screen Tools, and every path
// it sends or gets back is relative to that folder.
import { contentUpload, hasTag, readError, rpc, toUploadError, type DropboxError } from './dropbox/api';
import { ReconnectNeeded, UploadError, type Account, type Connector, type UploadContext, type UploadJob, type UploadResult } from './types';

/** Up to this size goes in one request; bigger files use an upload session. */
const SINGLE_UPLOAD_MAX = 8 * 1024 * 1024;
/** Session chunk size. Dropbox wants a multiple of 4 MiB for every chunk but the last. */
const CHUNK_SIZE = 8 * 1024 * 1024;

/** Where the app folder lives in the Dropbox web app, for the "Open" link. */
const APP_FOLDER_WEB = 'https://www.dropbox.com/home/Apps/Screen%20Tools';

interface ResumeState {
  sessionId: string;
  offset: number;
}

interface FileMetadata {
  id: string;
  name: string;
  path_display?: string;
  path_lower?: string;
}

const commitInfo = (fileName: string) => ({ path: `/${fileName}`, mode: 'add', autorename: true });

function validResume(state: unknown, size: number): ResumeState | null {
  if (!state || typeof state !== 'object') return null;
  const { sessionId, offset } = state as Partial<ResumeState>;
  if (typeof sessionId !== 'string' || !sessionId) return null;
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset <= 0 || offset > size) return null;
  return { sessionId, offset };
}

/** The offset Dropbox says it has, from an `incorrect_offset` lookup error (direct or under `lookup_failed`). */
function correctOffset(err: DropboxError | null): number | null {
  let e: unknown = err?.error;
  if (e && typeof e === 'object' && (e as { '.tag'?: string })['.tag'] === 'lookup_failed') {
    e = (e as { lookup_failed?: unknown }).lookup_failed;
  }
  if (!e || typeof e !== 'object' || (e as { '.tag'?: string })['.tag'] !== 'incorrect_offset') return null;
  const offset = (e as { correct_offset?: unknown }).correct_offset;
  return typeof offset === 'number' ? offset : null;
}

/** The session expired (48 hours), was already committed, or never existed. Start over. */
const sessionGone = (err: DropboxError | null) => hasTag(err, 'not_found') || hasTag(err, 'closed');

async function uploadSmall(job: UploadJob, ctx: UploadContext): Promise<FileMetadata> {
  const res = await contentUpload(ctx.fetch, 'files/upload', commitInfo(job.fileName), job.blob, ctx.signal);
  if (!res.ok) throw await toUploadError(res);
  ctx.onProgress(job.blob.size);
  return (await res.json()) as FileMetadata;
}

/**
 * Upload session: start with the first chunk, append the rest, then finish with an empty
 * body. The session id and confirmed offset are saved after every chunk so an interrupted
 * upload carries on from there.
 */
async function uploadSession(job: UploadJob, ctx: UploadContext): Promise<FileMetadata> {
  const { blob } = job;
  const size = blob.size;
  let state = validResume(job.resumeState, size);
  // Guards against looping forever if Dropbox keeps losing the session or the offset.
  let restarts = 0;
  let corrections = 0;

  const save = async (next: ResumeState | null) => {
    state = next;
    await ctx.saveResumeState(next);
    if (next) ctx.onProgress(next.offset);
  };
  const restart = async () => {
    if (++restarts > 2) throw new UploadError('Dropbox lost track of the upload. Try again.', true);
    await save(null);
    ctx.onProgress(0);
  };
  const correct = async (err: DropboxError | null) => {
    const offset = correctOffset(err);
    if (offset === null || !state) return false;
    if (++corrections > 5 || offset > size) {
      await restart();
      return true;
    }
    await save({ sessionId: state.sessionId, offset });
    return true;
  };

  if (state) ctx.onProgress(state.offset);

  for (;;) {
    if (!state) {
      const chunk = blob.slice(0, CHUNK_SIZE);
      const res = await contentUpload(ctx.fetch, 'files/upload_session/start', { close: false }, chunk, ctx.signal);
      if (!res.ok) throw await toUploadError(res);
      const { session_id } = (await res.json()) as { session_id: string };
      await save({ sessionId: session_id, offset: chunk.size });
      continue;
    }

    const cursor = { session_id: state.sessionId, offset: state.offset };

    if (state.offset < size) {
      const chunk = blob.slice(state.offset, state.offset + CHUNK_SIZE);
      const res = await contentUpload(ctx.fetch, 'files/upload_session/append_v2', { cursor, close: false }, chunk, ctx.signal);
      if (res.ok) {
        await save({ sessionId: state.sessionId, offset: state.offset + chunk.size });
        continue;
      }
      const err = await readError(res);
      if (await correct(err)) continue;
      if (sessionGone(err)) {
        await restart();
        continue;
      }
      throw await toUploadError(res, err);
    }

    const res = await contentUpload(
      ctx.fetch,
      'files/upload_session/finish',
      { cursor, commit: commitInfo(job.fileName) },
      new Blob([]),
      ctx.signal,
    );
    if (res.ok) {
      await ctx.saveResumeState(null);
      return (await res.json()) as FileMetadata;
    }
    const err = await readError(res);
    if (await correct(err)) continue;
    if (sessionGone(err)) {
      await restart();
      continue;
    }
    throw await toUploadError(res, err);
  }
}

type ShareOutcome = { shareUrl: string } | { shareError: string };

const linkUrl = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const url = (value as { url?: unknown }).url;
  return typeof url === 'string' ? url : undefined;
};

/** A link that already exists for this file, from list_shared_links. */
async function existingLink(ctx: UploadContext, fileId: string): Promise<string | undefined> {
  const res = await rpc(ctx.fetch, 'sharing/list_shared_links', { path: fileId, direct_only: true }, ctx.signal);
  if (!res.ok) return undefined;
  const { links } = (await res.json()) as { links?: unknown[] };
  return links?.map(linkUrl).find(Boolean);
}

/** Makes a public link. Never throws for a refusal: the file is already saved, so that's a shareError. */
async function share(ctx: UploadContext, file: FileMetadata): Promise<ShareOutcome> {
  try {
    const res = await rpc(ctx.fetch, 'sharing/create_shared_link_with_settings', { path: file.id }, ctx.signal);
    if (res.ok) {
      const url = linkUrl(await res.json());
      if (url) return { shareUrl: url };
      return { shareError: "Dropbox didn't return a share link." };
    }
    if (res.status === 401) return { shareError: 'Reconnect Dropbox to make share links.' };
    const err = await readError(res);
    if (hasTag(err, 'shared_link_already_exists')) {
      // Usually comes with the existing link's metadata; otherwise look it up.
      const exists = err?.error?.shared_link_already_exists as { metadata?: unknown } | undefined;
      const url = linkUrl(exists?.metadata) ?? linkUrl(exists) ?? (await existingLink(ctx, file.id));
      if (url) return { shareUrl: url };
      return { shareError: "Couldn't find the existing Dropbox share link." };
    }
    if (hasTag(err, 'email_not_verified')) {
      return { shareError: 'Verify your Dropbox email address to make share links.' };
    }
    if (res.status === 429 || res.status >= 500) {
      return { shareError: "Dropbox didn't make a share link this time. Share it from Dropbox instead." };
    }
    return { shareError: "Dropbox didn't allow a public link for this file." };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    if (err instanceof ReconnectNeeded) return { shareError: 'Reconnect Dropbox to make share links.' };
    return { shareError: "Couldn't reach Dropbox to make a share link." };
  }
}

/** Opens the app folder in the Dropbox web app with this file previewed. */
function webUrl(file: FileMetadata) {
  const path = file.path_display ?? `/${file.name}`;
  const slash = path.lastIndexOf('/');
  const folder = path.slice(0, slash).split('/').map(encodeURIComponent).join('/');
  return `${APP_FOLDER_WEB}${folder}?preview=${encodeURIComponent(path.slice(slash + 1))}`;
}

export const dropbox: Connector = {
  id: 'dropbox',
  name: 'Dropbox',
  description: 'Uploads go to Apps/Screen Tools in your Dropbox.',
  accepts: ['video', 'image'],
  hosts: ['https://api.dropboxapi.com/*', 'https://content.dropboxapi.com/*'],
  auth: {
    flow: 'pkce',
    authorizeUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    clientId: import.meta.env.WXT_DROPBOX_APP_KEY ?? '',
    // sharing.read is for list_shared_links, when a link already exists.
    scopes: ['account_info.read', 'files.content.write', 'sharing.write', 'sharing.read'],
    authorizeParams: { token_access_type: 'offline' },
  },

  async fetchAccount(fetch): Promise<Account> {
    const res = await rpc(fetch, 'users/get_current_account', undefined);
    if (!res.ok) throw await toUploadError(res);
    const account = (await res.json()) as { account_id: string; email?: string; name?: { display_name?: string } };
    return { id: account.account_id, email: account.email, name: account.name?.display_name };
  },

  async upload(job, ctx): Promise<UploadResult> {
    const file =
      job.blob.size <= SINGLE_UPLOAD_MAX && !job.resumeState ? await uploadSmall(job, ctx) : await uploadSession(job, ctx);
    const result: UploadResult = { remoteId: file.id, openUrl: webUrl(file) };
    if (job.share) {
      const outcome = await share(ctx, file);
      if ('shareUrl' in outcome) {
        result.shareUrl = outcome.shareUrl;
        result.openUrl = outcome.shareUrl;
      } else {
        result.shareError = outcome.shareError;
      }
    }
    return result;
  },

  async revoke(tokens) {
    try {
      await fetch('https://api.dropboxapi.com/2/auth/token/revoke', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
    } catch {
      // Best effort: the tokens are forgotten locally either way.
    }
  },
};
