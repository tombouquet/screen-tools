// Google Drive. With the drive.file scope the app only sees files and folders it made
// itself, so uploads go to a "Screen Tools" folder it creates on first use.
import { DRIVE_API, errorReason, jsonBody, send, sendJson } from './google-drive/api';
import { uploadResumable } from './google-drive/resumable';
import { ReconnectNeeded, type AuthorizedFetch, type Connector, type UploadContext } from './types';

const FOLDER_NAME = 'Screen Tools';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Finds the Screen Tools folder, or makes it. The oldest wins if there's more than one. */
async function findOrCreateFolder(fetch: AuthorizedFetch, signal: AbortSignal): Promise<string> {
  const query = new URLSearchParams({
    q: `mimeType = '${FOLDER_MIME}' and name = '${FOLDER_NAME}' and trashed = false`,
    spaces: 'drive',
    orderBy: 'createdTime',
    pageSize: '1',
    fields: 'files(id)',
  });
  const { files } = await sendJson<{ files?: { id: string }[] }>(fetch, `${DRIVE_API}/files?${query}`, {
    signal,
  });
  const existing = files?.[0]?.id;
  if (existing) return existing;

  const folder = await sendJson<{ id: string }>(fetch, `${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    ...jsonBody({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
    signal,
  });
  return folder.id;
}

/** Makes the file open for anyone with the link. Returns why not, in plain English, if Google refuses. */
async function shareWithAnyone(fileId: string, ctx: UploadContext): Promise<string | undefined> {
  try {
    const res = await send(ctx.fetch, `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?fields=id`, {
      method: 'POST',
      ...jsonBody({ role: 'reader', type: 'anyone' }),
      signal: ctx.signal,
    });
    if (res.ok) return undefined;
    const reason = await errorReason(res);
    if (res.status === 403 && reason !== 'userRateLimitExceeded' && reason !== 'rateLimitExceeded') {
      return "Your Google account doesn't allow public links. It may be blocked by your Workspace admin.";
    }
    return "Google Drive couldn't make a public link right now.";
  } catch (err) {
    // The file is already uploaded, so only cancelling or signing out stops the result coming back.
    if (ctx.signal.aborted) throw err;
    if (err instanceof ReconnectNeeded) throw err;
    return "Google Drive couldn't make a public link right now.";
  }
}

export const googleDrive: Connector = {
  id: 'google-drive',
  name: 'Google Drive',
  description: 'Uploads go to a Screen Tools folder in your Drive.',
  accepts: ['video', 'image'],
  hosts: ['https://www.googleapis.com/*', 'https://oauth2.googleapis.com/*'],
  auth: {
    flow: 'implicit',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: import.meta.env.WXT_GOOGLE_CLIENT_ID ?? '',
    scopes: ['https://www.googleapis.com/auth/drive.file'],
    // Lets people pick which Google account. Silent renewal replaces it with prompt=none.
    authorizeParams: { include_granted_scopes: 'true', prompt: 'select_account' },
    silentParams: (account) => ({ prompt: 'none', ...(account.email ? { login_hint: account.email } : {}) }),
  },

  async fetchAccount(fetch) {
    const { user } = await sendJson<{
      user: { displayName?: string; emailAddress?: string; permissionId: string };
    }>(fetch, `${DRIVE_API}/about?fields=${encodeURIComponent('user(displayName,emailAddress,permissionId)')}`, {});
    return { id: user.permissionId, email: user.emailAddress, name: user.displayName };
  },

  async upload(job, ctx) {
    const file = await uploadResumable(job, ctx, () => findOrCreateFolder(ctx.fetch, ctx.signal));
    // webViewLink comes back because the session asked for it; the fallback is the same URL.
    const link = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
    const shareError = job.share ? await shareWithAnyone(file.id, ctx) : undefined;
    return {
      remoteId: file.id,
      openUrl: link,
      shareUrl: job.share && !shareError ? link : undefined,
      shareError,
    };
  },

  async revoke(tokens) {
    // Best effort: a token that's already expired or revoked is fine to leave.
    try {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: tokens.accessToken }),
      });
    } catch {
      // Nothing to do; disconnecting carries on.
    }
  },
};
