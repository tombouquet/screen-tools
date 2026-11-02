// The contract every upload destination implements. The settings page, save dialog and
// upload status only know about this interface and the list in registry.ts, so adding a
// service is one connector file plus its OAuth app settings. Upload servers are the
// exception: people add them in Settings, so each one is built from its saved settings.
import type { ComponentType } from 'react';

/** Upload servers get `server:<random id>`, one per server added in Settings. */
export type ConnectorId = 'local' | 'google-drive' | 'dropbox' | `server:${string}`;

export const isServerId = (id: string): id is `server:${string}` => id.startsWith('server:');

export type MediaKind = 'video' | 'image';

/**
 * How to sign in to a service with `browser.identity.launchWebAuthFlow`. The redirect is
 * always `browser.identity.getRedirectURL()` (`https://<extension-id>.chromiumapp.org/`),
 * which has to be registered with the service.
 */
export interface OAuthConfig {
  /**
   * `implicit`: the access token comes back in the redirect fragment, with no refresh
   * token; it's renewed by repeating the flow with `interactive: false` and `silentParams`.
   * `pkce`: an authorization code is exchanged at `tokenUrl` for access and refresh tokens.
   */
  flow: 'implicit' | 'pkce';
  authorizeUrl: string;
  /** PKCE only: where the code (and later the refresh token) is exchanged. */
  tokenUrl?: string;
  /** From the build env. Empty means the build has no app for this service and Connect is disabled. */
  clientId: string;
  scopes: string[];
  /** Joins `scopes` in the authorize URL. Defaults to a space. */
  scopeSeparator?: string;
  /** Added to every authorize URL, e.g. Dropbox's `token_access_type=offline`. */
  authorizeParams?: Record<string, string>;
  /** Implicit only: added when renewing without a prompt, e.g. `prompt=none` and `login_hint`. */
  silentParams?: (account: Account) => Record<string, string>;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Milliseconds since the epoch. Renewed a minute before this. */
  expiresAt: number;
}

/** Who's signed in, shown in Settings. */
export interface Account {
  id: string;
  email?: string;
  name?: string;
}

/** A connected account, kept in `browser.storage.local`. One per connector. */
export interface Connection {
  connector: ConnectorId;
  account: Account;
  /** Unused for upload servers, whose token (if any) is in `server`. */
  tokens: TokenSet;
  /** ISO date. */
  connectedAt: string;
  /** Only for upload servers: what was entered in Settings. */
  server?: UploadServerSettings;
}

/** An upload server as entered in Settings. See docs/guides/upload-servers.md. */
export interface UploadServerSettings {
  /** Shown in the save dialog, e.g. "Team uploads". */
  name: string;
  /** The URL that hands out upload URLs. */
  endpoint: string;
  /** Sent as `Authorization: Bearer <token>` when set. */
  token?: string;
  /** One of the ids in server-icons.ts; unset means the default server icon. */
  icon?: string;
}

/**
 * `fetch` with `Authorization: Bearer <token>` added. Renews the token first when it's
 * about to expire, and once more on a 401. Throws `ReconnectNeeded` when renewing fails.
 */
export type AuthorizedFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface UploadJob {
  blob: Blob;
  /** With extension, already cleaned for file systems. */
  fileName: string;
  /** Without codec parameters, e.g. `video/mp4`, `image/png`. */
  mimeType: string;
  kind: MediaKind;
  /** Make a link anyone can open. */
  share: boolean;
  /** Whatever this connector passed to `saveResumeState` in an earlier, interrupted attempt. */
  resumeState?: unknown;
}

export interface UploadContext {
  fetch: AuthorizedFetch;
  /** Bytes the service has confirmed, from 0 to `job.blob.size`. */
  onProgress: (sentBytes: number) => void;
  /**
   * Keeps protocol state (a resumable session URL, an offset) with the upload record, so
   * a later attempt can carry on instead of starting over. Must be JSON-serialisable.
   */
  saveResumeState: (state: unknown) => Promise<void>;
  /** Cancel. Pass it to every fetch. */
  signal: AbortSignal;
}

export interface UploadResult {
  /** The service's file id. Empty for local downloads. */
  remoteId: string;
  /** Opens the file in the service for its owner. */
  openUrl?: string;
  /** The public link, when `share` was asked for and the service allowed it. */
  shareUrl?: string;
  /** Why there's no public link even though one was asked for, e.g. a Workspace admin blocks public sharing. */
  shareError?: string;
}

export interface Connector {
  id: ConnectorId;
  /** "Google Drive". */
  name: string;
  /** One line for Settings, e.g. "Uploads go to a Screen Tools folder in your Drive." */
  description: string;
  /** Shown next to the name in Settings and the save dialog. Sized by `className`. */
  icon: ComponentType<{ className?: string }>;
  accepts: MediaKind[];
  /** Origins the API calls need, requested as optional host permissions on Connect. */
  hosts: string[];
  /** Null for destinations without a sign-in (the local download, upload servers). */
  auth: OAuthConfig | null;
  /**
   * `always` when every upload gets a public link anyway, so there's no share switch.
   * Defaults to `optional`.
   */
  links?: 'optional' | 'always';
  /** Called right after signing in. */
  fetchAccount?: (fetch: AuthorizedFetch) => Promise<Account>;
  upload: (job: UploadJob, ctx: UploadContext) => Promise<UploadResult>;
  /** Best effort, on Disconnect. */
  revoke?: (tokens: TokenSet) => Promise<void>;
}

/** The service refused or failed. `retryable` errors (network, 5xx, 429) are worth trying again. */
export class UploadError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

/** The connection can't be renewed without the user signing in again. */
export class ReconnectNeeded extends Error {
  constructor(readonly connector: ConnectorId) {
    super('Sign in again to keep uploading.');
    this.name = 'ReconnectNeeded';
  }
}
