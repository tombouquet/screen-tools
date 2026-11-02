// Upload servers: any server that hands out an upload URL and a public link for a file.
// The extension asks the server's endpoint for both, then sends the file straight to the
// upload URL. The format is in docs/guides/upload-servers.md; keep the two in step.
import { Server } from 'lucide-react';
import { browser } from 'wxt/browser';
import { saveConnection } from './connections';
import { UploadError, type Connection, type Connector, type UploadContext, type UploadJob, type UploadServerSettings } from './types';

/** What the endpoint answers with. */
interface UploadTarget {
  uploadUrl: string;
  publicUrl: string;
  headers?: Record<string, string>;
}

/** Thrown for settings that can't work, with wording for the form. */
export class InvalidServerSettings extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidServerSettings';
  }
}

function parseUrl(value: string): URL | undefined {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

/** The host permission for a URL. Match patterns leave the port out, so this covers every port. */
const hostPattern = (url: URL) => `${url.protocol}//${url.hostname}/*`;

export function uploadServerConnector(id: Connector['id'], settings: UploadServerSettings): Connector {
  const endpoint = parseUrl(settings.endpoint);
  const host = endpoint?.host ?? settings.endpoint;
  return {
    id,
    name: settings.name,
    description: `Uploads to ${host}. Every upload gets a link anyone can open.`,
    icon: Server,
    accepts: ['video', 'image'],
    hosts: endpoint ? [hostPattern(endpoint)] : [],
    auth: null,
    links: 'always',
    upload: (job, ctx) => upload(settings, job, ctx),
  };
}

/** Stands in for a server that was removed, so its old uploads still have a name. */
export const removedServer = (id: Connector['id']): Connector => ({
  ...uploadServerConnector(id, { name: 'Upload server', endpoint: '' }),
  description: 'This upload server was removed in Settings.',
  async upload() {
    throw new UploadError('This upload server was removed in Settings.', false);
  },
});

/** The server's own `error` message when it sends one, else a fallback. */
async function serverMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === 'string' && body.error ? body.error : fallback;
  } catch {
    return fallback;
  }
}

async function requestTarget(settings: UploadServerSettings, job: UploadJob, signal: AbortSignal): Promise<UploadTarget> {
  const { name } = settings;
  let res: Response;
  try {
    res = await fetch(settings.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.token ? { Authorization: `Bearer ${settings.token}` } : {}),
      },
      body: JSON.stringify({ filename: job.fileName, contentType: job.mimeType, size: job.blob.size }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new UploadError(`Couldn't reach ${name}. Check you're online and on the right network.`, true);
  }

  if (res.status === 401 || res.status === 403) {
    throw new UploadError(await serverMessage(res, `${name} refused the upload. Check its access token in Settings.`), false, res.status);
  }
  if (res.status === 413) throw new UploadError(await serverMessage(res, `This file is too big for ${name}.`), false, res.status);
  if (res.status === 429 || res.status >= 500) {
    throw new UploadError(await serverMessage(res, `${name} is busy. Try again in a moment.`), true, res.status);
  }
  if (!res.ok) throw new UploadError(await serverMessage(res, `${name} couldn't take this file (error ${res.status}).`), false, res.status);

  let body: Partial<UploadTarget>;
  try {
    body = (await res.json()) as Partial<UploadTarget>;
  } catch {
    throw new UploadError(`${name} didn't answer in the expected format.`, false);
  }
  const uploadUrl = typeof body.uploadUrl === 'string' ? parseUrl(body.uploadUrl) : undefined;
  const publicUrl = typeof body.publicUrl === 'string' ? parseUrl(body.publicUrl) : undefined;
  if (!uploadUrl || !publicUrl) throw new UploadError(`${name} didn't send an upload URL and a public link.`, false);
  const headers = body.headers && typeof body.headers === 'object' ? body.headers : undefined;
  return { uploadUrl: uploadUrl.href, publicUrl: publicUrl.href, headers };
}

/** PUTs the file with XMLHttpRequest, the only way to see upload progress. */
function put(target: UploadTarget, job: UploadJob, ctx: UploadContext, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', target.uploadUrl);
    xhr.setRequestHeader('Content-Type', job.mimeType);
    for (const [key, value] of Object.entries(target.headers ?? {})) {
      if (typeof value === 'string') xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => ctx.onProgress(event.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      // A 403 is usually an upload URL that expired; the retry asks for a new one.
      const retryable = xhr.status === 403 || xhr.status === 408 || xhr.status === 429 || xhr.status >= 500;
      reject(new UploadError(`${name} didn't accept the file (error ${xhr.status}).`, retryable, xhr.status));
    };
    xhr.onerror = () => reject(new UploadError(`The upload to ${name} was cut off. Check your connection.`, true));
    const abort = () => xhr.abort();
    xhr.onabort = () => reject(new DOMException('Upload stopped.', 'AbortError'));
    xhr.onloadend = () => ctx.signal.removeEventListener('abort', abort);
    ctx.signal.addEventListener('abort', abort, { once: true });
    xhr.send(job.blob);
  });
}

/** One request for the URLs, then one PUT. A retry starts over with fresh URLs, so nothing is resumed. */
async function upload(settings: UploadServerSettings, job: UploadJob, ctx: UploadContext) {
  ctx.onProgress(0);
  const target = await requestTarget(settings, job, ctx.signal);
  await put(target, job, ctx, settings.name);
  ctx.onProgress(job.blob.size);
  return { remoteId: target.publicUrl, openUrl: target.publicUrl, shareUrl: target.publicUrl };
}

/**
 * Checks the settings, asks for the host permission, makes sure the endpoint answers and
 * saves the server. Call it straight from a click: the permission prompt needs the
 * gesture, so nothing is awaited before it. Resolves undefined if the user says no.
 */
export async function addUploadServer(input: UploadServerSettings): Promise<Connection | undefined> {
  const name = input.name.trim();
  const endpoint = parseUrl(input.endpoint);
  if (!name) throw new InvalidServerSettings('Give the server a name.');
  if (!endpoint) throw new InvalidServerSettings('Enter a full URL starting with https:// or http://.');

  const granted = await browser.permissions.request({ origins: [hostPattern(endpoint)] });
  if (!granted) return undefined;

  try {
    // Any answer means the server is there; only the upload itself checks the format.
    await fetch(endpoint, { method: 'HEAD' });
  } catch {
    throw new InvalidServerSettings(`Couldn't reach ${endpoint.host}. Check the URL and that you're on the right network.`);
  }

  const token = input.token?.trim();
  const connection: Connection = {
    connector: `server:${crypto.randomUUID()}`,
    account: { id: endpoint.host, name },
    // Upload servers have no sign-in to renew.
    tokens: { accessToken: '', expiresAt: Number.MAX_SAFE_INTEGER },
    connectedAt: new Date().toISOString(),
    server: { name, endpoint: endpoint.href, ...(token ? { token } : {}) },
  };
  await saveConnection(connection);
  return connection;
}
