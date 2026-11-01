// Calls to the Dropbox HTTP API (v2), and turning its errors into UploadErrors.
// Reference: https://www.dropbox.com/developers/documentation/http/documentation
import { ReconnectNeeded, UploadError, type AuthorizedFetch } from '../types';

const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

/** Waits this long at most for a 429's Retry-After before giving up on the attempt. */
const MAX_RETRY_AFTER_MS = 60_000;
const RATE_LIMIT_RETRIES = 3;

/** A 409 from Dropbox: a typed endpoint error. */
export interface DropboxError {
  error_summary?: string;
  error?: { '.tag'?: string; [key: string]: unknown };
}

/**
 * The JSON for the Dropbox-API-Arg header. Headers must be ASCII, so every character from
 * 0x7F up is escaped as \uXXXX (what Dropbox's own SDK does). File names can contain them.
 */
export const headerSafeJson = (value: unknown) =>
  JSON.stringify(value).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      reject(signal?.reason);
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/**
 * Sends one request. Network failures become retryable UploadErrors; a 429 waits for its
 * Retry-After and tries again a few times, so a short burst of rate limiting doesn't fail
 * the upload. Any other response is returned as is.
 */
async function send(fetch: AuthorizedFetch, url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', ...init });
    } catch (err) {
      if (isAbort(err) || err instanceof ReconnectNeeded || err instanceof UploadError) throw err;
      throw new UploadError("Couldn't reach Dropbox. Check your connection and try again.", true);
    }
    if (res.status !== 429 || attempt >= RATE_LIMIT_RETRIES) return res;
    const seconds = Number(res.headers.get('Retry-After'));
    const wait = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 2 ** attempt * 1000;
    if (wait > MAX_RETRY_AFTER_MS) return res;
    await sleep(wait, init.signal ?? undefined);
  }
}

/** An RPC endpoint on api.dropboxapi.com. `arg` undefined means the endpoint takes no arguments. */
export function rpc(fetch: AuthorizedFetch, route: string, arg: unknown, signal?: AbortSignal) {
  // Endpoints without arguments want no body and no Content-Type at all.
  const init: RequestInit =
    arg === undefined
      ? { signal }
      : { signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(arg) };
  return send(fetch, `${API}/${route}`, init);
}

/** A content-upload endpoint on content.dropboxapi.com: arguments in a header, bytes in the body. */
export function contentUpload(fetch: AuthorizedFetch, route: string, arg: unknown, body: Blob, signal?: AbortSignal) {
  return send(fetch, `${CONTENT}/${route}`, {
    signal,
    headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': headerSafeJson(arg) },
    body,
  });
}

/** The typed error body of a 409, or null when there isn't one. */
export async function readError(res: Response): Promise<DropboxError | null> {
  if (res.status !== 409) return null;
  try {
    return (await res.json()) as DropboxError;
  } catch {
    return null;
  }
}

/** True when `summary` (e.g. "path/insufficient_space/..") names this tag at any depth. */
export const hasTag = (err: DropboxError | null, tag: string) =>
  !!err?.error_summary && err.error_summary.split('/').some((part) => part.replace(/\.+$/, '') === tag);

/** Short user-facing messages for the write errors people can act on. */
const WRITE_ERRORS: Record<string, string> = {
  insufficient_space: 'Your Dropbox is full.',
  no_write_permission: "Dropbox didn't allow saving to the Screen Tools folder.",
  disallowed_name: "Dropbox won't save a file with this name.",
  malformed_path: "Dropbox won't save a file with this name.",
  conflict: 'Something in the Screen Tools folder is in the way of this file.',
  operation_suppressed: "Dropbox didn't allow saving to the Screen Tools folder.",
};

/** Turns a failed response into the UploadError to throw. Reads the body. */
export async function toUploadError(res: Response, err?: DropboxError | null): Promise<UploadError | ReconnectNeeded> {
  const { status } = res;
  // AuthorizedFetch has already tried renewing the token once.
  if (status === 401) return new ReconnectNeeded('dropbox');
  if (status === 429) return new UploadError('Dropbox is busy. Try again in a minute.', true, status);
  if (status >= 500) return new UploadError("Dropbox isn't responding right now. Try again soon.", true, status);
  const body = err === undefined ? await readError(res) : err;
  if (hasTag(body, 'too_many_write_operations')) {
    return new UploadError('Dropbox is busy. Try again in a minute.', true, status);
  }
  for (const [tag, message] of Object.entries(WRITE_ERRORS)) {
    if (hasTag(body, tag)) return new UploadError(message, false, status);
  }
  return new UploadError("Dropbox couldn't save the file.", false, status);
}
