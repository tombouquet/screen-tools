// Talking to the Drive v3 API: one wrapper that turns network failures and error
// responses into UploadError, so the rest of the connector only handles the happy path.
import { ReconnectNeeded, UploadError, type AuthorizedFetch } from '../types';

export const DRIVE_API = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

/** Drive's error body: `{ error: { code, message, errors: [{ reason, message }] } }`. */
interface DriveErrorBody {
  error?: { message?: string; errors?: { reason?: string; message?: string }[] };
}

/** 403 reasons that clear up on their own, so another attempt later is worth it. */
const RETRYABLE_REASONS = new Set(['userRateLimitExceeded', 'rateLimitExceeded', 'backendError']);

/** Cancelling and needing to sign in again aren't upload failures, so they pass through untouched. */
const passesThrough = (err: unknown) =>
  err instanceof UploadError ||
  err instanceof ReconnectNeeded ||
  (err instanceof DOMException && err.name === 'AbortError');

/** `fetch` that throws a retryable UploadError instead of a bare TypeError when the network drops. */
export async function send(fetch: AuthorizedFetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (passesThrough(err)) throw err;
    throw new UploadError("Couldn't reach Google Drive. Check your connection.", true);
  }
}

/** The first `reason` in a Drive error body, or undefined when the body isn't one. */
export async function errorReason(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.clone().json()) as DriveErrorBody;
    return body.error?.errors?.[0]?.reason;
  } catch {
    return undefined;
  }
}

/** Turns a failed response into an UploadError with a short message for the user. */
export async function toUploadError(res: Response): Promise<UploadError | ReconnectNeeded> {
  const { status } = res;
  const reason = await errorReason(res);

  if (status === 401) return new ReconnectNeeded('google-drive');
  if (status === 429 || status >= 500 || (reason && RETRYABLE_REASONS.has(reason))) {
    return new UploadError('Google Drive is busy right now. Try again in a moment.', true, status);
  }
  if (reason === 'storageQuotaExceeded' || reason === 'quotaExceeded') {
    return new UploadError('Your Google Drive is full.', false, status);
  }
  if (reason === 'domainPolicy') {
    return new UploadError('Your Google Workspace admin has turned off Drive apps.', false, status);
  }
  if (status === 403) {
    return new UploadError("Google Drive didn't allow this upload.", false, status);
  }
  return new UploadError(`Google Drive couldn't take this file (error ${status}).`, false, status);
}

/** Sends a request and parses its JSON, throwing an UploadError for anything but a 2xx. */
export async function sendJson<T>(fetch: AuthorizedFetch, url: string, init: RequestInit): Promise<T> {
  const res = await send(fetch, url, init);
  if (!res.ok) throw await toUploadError(res);
  return (await res.json()) as T;
}

export const jsonBody = (body: unknown): Pick<RequestInit, 'body' | 'headers'> => ({
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json; charset=UTF-8' },
});
