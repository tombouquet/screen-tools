// Signing in to upload destinations with chrome.identity.launchWebAuthFlow, which works in
// every Chromium browser and lets people pick the account. No client secrets and no
// server: Google uses the implicit token flow, renewed silently; Dropbox uses PKCE with a
// refresh token. The `identity` permission and each service's API origins are optional
// and only requested when someone clicks Connect.
import { getConnector } from './registry';
import { getConnection, listConnections, removeConnection, saveConnection } from './connections';
import {
  ReconnectNeeded,
  type Account,
  type AuthorizedFetch,
  type Connection,
  type Connector,
  type ConnectorId,
  type OAuthConfig,
  type TokenSet,
} from './types';

/** Renew this long before the token runs out, so an upload doesn't start with a dying token. */
const RENEW_MARGIN_MS = 60_000;
/** Silent renewals give a JavaScript redirect this long before giving up. */
const SILENT_TIMEOUT_MS = 20_000;

/** The user closed the sign-in window or said no. Not worth an error toast. */
export class SignInCancelled extends Error {
  constructor() {
    super('Sign-in was cancelled.');
    this.name = 'SignInCancelled';
  }
}

function requireAuth(connector: Connector): OAuthConfig {
  if (!connector.auth) throw new Error(`${connector.name} doesn't need signing in.`);
  if (!connector.auth.clientId) throw new Error(`${connector.name} isn't available in this build.`);
  return connector.auth;
}

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const randomString = (bytes = 32) => base64Url(crypto.getRandomValues(new Uint8Array(bytes)));

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function authorizeUrl(auth: OAuthConfig, params: Record<string, string>): string {
  const url = new URL(auth.authorizeUrl);
  const all = {
    client_id: auth.clientId,
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: auth.scopes.join(auth.scopeSeparator ?? ' '),
    ...auth.authorizeParams,
    ...params,
  };
  for (const [key, value] of Object.entries(all)) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * Runs the web auth flow and returns the redirect's parameters (query and fragment merged)
 * once its `state` matches.
 */
async function runFlow(url: string, state: string, interactive: boolean): Promise<URLSearchParams> {
  let redirect: string | undefined;
  try {
    redirect = await chrome.identity.launchWebAuthFlow(
      interactive
        ? { url, interactive: true }
        : { url, interactive: false, abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: SILENT_TIMEOUT_MS },
    );
  } catch (error) {
    // Chrome reports a closed sign-in window as "The user did not approve access."
    if (interactive && /did not approve|cancel/i.test(String(error))) throw new SignInCancelled();
    throw error;
  }
  if (!redirect) throw new SignInCancelled();
  const parsed = new URL(redirect);
  const params = new URLSearchParams(parsed.search);
  for (const [key, value] of new URLSearchParams(parsed.hash.replace(/^#/, ''))) params.set(key, value);
  if (params.get('state') !== state) throw new Error('Sign-in failed: the response did not match the request.');
  const error = params.get('error');
  if (error === 'access_denied') throw new SignInCancelled();
  if (error) throw new Error(`Sign-in failed: ${params.get('error_description') ?? error}`);
  return params;
}

const expiresAt = (expiresIn: string | number | null | undefined) =>
  Date.now() + (Number(expiresIn) > 0 ? Number(expiresIn) * 1000 : 3600_000);

/** Implicit flow: the token comes straight back in the redirect fragment. */
async function implicitTokens(auth: OAuthConfig, interactive: boolean, extra: Record<string, string> = {}): Promise<TokenSet> {
  const state = randomString(16);
  const params = await runFlow(authorizeUrl(auth, { response_type: 'token', state, ...extra }), state, interactive);
  const accessToken = params.get('access_token');
  if (!accessToken) throw new Error('Sign-in failed: no access token came back.');
  return { accessToken, expiresAt: expiresAt(params.get('expires_in')) };
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function postToken(auth: OAuthConfig, body: Record<string, string>): Promise<TokenResponse> {
  if (!auth.tokenUrl) throw new Error('This connector has no token URL.');
  const response = await fetch(auth.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !json.access_token) {
    throw new Error(`Sign-in failed: ${json.error_description ?? json.error ?? `HTTP ${response.status}`}`);
  }
  return json;
}

/** PKCE: an authorization code exchanged for access and refresh tokens. */
async function pkceTokens(auth: OAuthConfig): Promise<TokenSet> {
  const state = randomString(16);
  const verifier = randomString(48);
  const params = await runFlow(
    authorizeUrl(auth, {
      response_type: 'code',
      state,
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: 'S256',
    }),
    state,
    true,
  );
  const code = params.get('code');
  if (!code) throw new Error('Sign-in failed: no authorization code came back.');
  const json = await postToken(auth, {
    grant_type: 'authorization_code',
    code,
    client_id: auth.clientId,
    redirect_uri: chrome.identity.getRedirectURL(),
    code_verifier: verifier,
  });
  return { accessToken: json.access_token!, refreshToken: json.refresh_token, expiresAt: expiresAt(json.expires_in) };
}

/** `fetch` with a fixed token, for the account lookup before the connection is saved. */
const bearerFetch =
  (tokens: TokenSet): AuthorizedFetch =>
  (input, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
    return fetch(input, { ...init, headers });
  };

/**
 * Signs in to a service and saves the connection. Call it straight from a click: the
 * permission request needs the user gesture, so nothing is awaited before it.
 * Throws `SignInCancelled` if the user backs out.
 */
export async function connect(connector: Connector): Promise<Connection> {
  const granted = await chrome.permissions.request({ permissions: ['identity'], origins: connector.hosts });
  if (!granted) throw new SignInCancelled();
  const auth = requireAuth(connector);
  const tokens = auth.flow === 'pkce' ? await pkceTokens(auth) : await implicitTokens(auth, true);
  const account: Account = connector.fetchAccount ? await connector.fetchAccount(bearerFetch(tokens)) : { id: connector.id };
  const connection: Connection = { connector: connector.id, account, tokens, connectedAt: new Date().toISOString() };
  await saveConnection(connection);
  return connection;
}

// One renewal at a time per connector, shared by every request that needs it.
const renewing = new Map<ConnectorId, Promise<TokenSet>>();

async function renewTokens(connection: Connection): Promise<TokenSet> {
  const connector = getConnector(connection.connector);
  const auth = requireAuth(connector);
  if (auth.flow === 'pkce') {
    const refreshToken = connection.tokens.refreshToken;
    if (!refreshToken) throw new Error('No refresh token.');
    const json = await postToken(auth, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: auth.clientId });
    // Dropbox keeps the same refresh token; take a new one if a service rotates them.
    return { accessToken: json.access_token!, refreshToken: json.refresh_token ?? refreshToken, expiresAt: expiresAt(json.expires_in) };
  }
  return implicitTokens(auth, false, auth.silentParams?.(connection.account));
}

/** Renews the stored tokens, or throws `ReconnectNeeded`. `stale` is the token that stopped working. */
function renew(id: ConnectorId, stale: string): Promise<TokenSet> {
  let pending = renewing.get(id);
  if (!pending) {
    pending = (async () => {
      const connection = await getConnection(id);
      if (!connection) throw new ReconnectNeeded(id);
      // Another page may have renewed it already.
      if (connection.tokens.accessToken !== stale && connection.tokens.expiresAt - RENEW_MARGIN_MS > Date.now()) {
        return connection.tokens;
      }
      let tokens: TokenSet;
      try {
        tokens = await renewTokens(connection);
      } catch (error) {
        console.warn(`Couldn't renew the ${id} connection`, error);
        throw new ReconnectNeeded(id);
      }
      await saveConnection({ ...connection, tokens });
      return tokens;
    })().finally(() => renewing.delete(id));
    renewing.set(id, pending);
  }
  return pending;
}

async function currentTokens(id: ConnectorId): Promise<TokenSet> {
  const pending = renewing.get(id);
  if (pending) return pending;
  const connection = await getConnection(id);
  if (!connection) throw new ReconnectNeeded(id);
  if (connection.tokens.expiresAt - RENEW_MARGIN_MS > Date.now()) return connection.tokens;
  return renew(id, connection.tokens.accessToken);
}

/**
 * `fetch` signed in as the connected account. Renews the token a minute before it runs
 * out, and once more if the service answers 401. Throws `ReconnectNeeded` when it can't.
 */
export function authorizedFetch(id: ConnectorId): AuthorizedFetch {
  return async (input, init = {}) => {
    const send = (tokens: TokenSet) => bearerFetch(tokens)(input, init);
    const tokens = await currentTokens(id);
    const response = await send(tokens);
    if (response.status !== 401) return response;
    return send(await renew(id, tokens.accessToken));
  };
}

/**
 * Forgets the account: revokes the token (best effort), deletes the connection and gives
 * back the service's host permissions. `identity` stays while another connection needs it.
 */
export async function disconnect(id: ConnectorId): Promise<void> {
  const connector = getConnector(id);
  const connection = await getConnection(id);
  if (connection && connector.revoke) {
    await connector.revoke(connection.tokens).catch((error: unknown) => console.warn(`Couldn't revoke ${id}`, error));
  }
  await removeConnection(id);
  const others = await listConnections();
  // Keep origins another connected service also uses.
  const stillNeeded = new Set(others.flatMap((c) => getConnector(c.connector).hosts));
  const origins = connector.hosts.filter((host) => !stillNeeded.has(host));
  const permissions: chrome.runtime.ManifestPermission[] = others.length ? [] : ['identity'];
  if (!origins.length && !permissions.length) return;
  await chrome.permissions
    .remove({ origins, permissions })
    .catch((error: unknown) => console.warn("Couldn't remove permissions", error));
}
