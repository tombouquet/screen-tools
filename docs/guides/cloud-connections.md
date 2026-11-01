# Cloud connections

Screen Tools can upload recordings and screenshots to Google Drive and Dropbox. Each service needs an OAuth app that the maintainer sets up once, and the build reads the app's public ID from the environment. Read this guide to set up the apps, build with them, or add another service.

A build without an ID still works: the service shows in Settings with Connect turned off.

## How sign-in works

Every service signs in through `chrome.identity.launchWebAuthFlow`, which works in Chrome, Edge and Brave and lets the user pick an account. The redirect URI is always:

```text
https://<extension-id>.chromiumapp.org/
```

Register that exact URI, with the trailing slash, with each service. The extension ID has to stay the same between builds for it to match; see [Keeping the extension ID stable](#keeping-the-extension-id-stable).

- **Google** uses the implicit token flow. There's no refresh token; the token is renewed silently by repeating the flow with `prompt=none`.
- **Dropbox** uses PKCE with `token_access_type=offline`, which returns a refresh token.

Neither flow uses a client secret, and there's no server. The client ID and app key are public identifiers, not secrets.

## Environment variables

Copy `.env.example` to `.env.local` and fill it in. `.env.local` is ignored by git.

| Variable | What it holds |
| --- | --- |
| `WXT_GOOGLE_CLIENT_ID` | Google OAuth client ID, ending in `.apps.googleusercontent.com` |
| `WXT_DROPBOX_APP_KEY` | Dropbox app key |
| `WXT_EXTENSION_KEY` | The store public key, so dev builds get the store extension ID |

`pnpm dev` and `pnpm build` read these at build time, so any build that should offer uploads, including release builds, needs them set.

## Google Drive

Uploads use the `drive.file` scope, which only gives access to files the extension created. They go to a Screen Tools folder in the user's Drive.

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project, for example "Screen Tools".
2. Open **APIs & Services → Library**, find **Google Drive API** and click **Enable**.
3. Open **Google Auth Platform** (the OAuth consent screen) and set it up:
   - **App name:** Screen Tools.
   - **User support email** and **developer contact:** your address.
   - **Audience:** External.
   - **Branding:** app logo, home page and privacy policy link. Point the privacy policy at a published copy of [PRIVACY.md](../../PRIVACY.md). Google asks you to verify the domains of these links in Search Console, so host them on a domain you own.
   - **Data access:** add the scope `https://www.googleapis.com/auth/drive.file`.
4. Open **Clients → Create client**:
   - **Application type:** Web application. (The "Chrome extension" type only works with `chrome.identity.getAuthToken`, which is Chrome-only and can't pick an account.)
   - **Authorised redirect URIs:** `https://<extension-id>.chromiumapp.org/`.
   - Leave **Authorised JavaScript origins** empty.
5. Copy the client ID into `.env.local` as `WXT_GOOGLE_CLIENT_ID`.
6. While the app is in **Testing**, only the test users you add under **Audience** can sign in. To open it to everyone, click **Publish app**.
7. Submit the app for verification under **Verification Center**. `drive.file` is a non-sensitive scope, so it needs only brand verification (name, logo, home page and privacy policy), not the security review that sensitive and restricted scopes need. Google says this usually takes a few business days. Until it's verified, users see an "unverified app" warning.

Google's docs: [Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).

## Dropbox

Uploads go to the app folder, `Apps/Screen Tools`, in the user's Dropbox. The app can't see anything outside it.

1. Open the [Dropbox App Console](https://www.dropbox.com/developers/apps) and click **Create app**.
2. Pick **Scoped access**, then **App folder**.
3. Name the app **Screen Tools**. The folder in users' Dropbox is named after the app. You can't rename an app once it has production status.
4. On the **Permissions** tab, tick these and click **Submit**:
   - `account_info.read`, to show who's connected
   - `files.content.write`, to upload
   - `sharing.write`, to create share links
5. On the **Settings** tab, under **OAuth 2**, add the redirect URI `https://<extension-id>.chromiumapp.org/`. Leave **Allow public clients (Implicit Grant & PKCE)** on.
6. Copy the **App key** into `.env.local` as `WXT_DROPBOX_APP_KEY`. Don't use the app secret.

A new app has development status. Up to 500 Dropbox users can link it, and once 50 have, you have two weeks to get production approval before new users are blocked. Apply for production from the **Settings** tab before that. See the [Dropbox developer guide](https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide).

## Keeping the extension ID stable

Chrome derives the extension ID from the manifest's `key`. Without one, an unpacked build gets an ID from its folder path, so the redirect URI changes between machines and doesn't match what's registered.

Set `WXT_EXTENSION_KEY` to the store's public key and the build writes it to `manifest.key`, so every build gets the store ID:

1. In the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole), open the item, then **Package → View public key**.
2. Copy the key without the `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----` lines, as one line.
3. Put it in `.env.local` as `WXT_EXTENSION_KEY`.

Load the build and check the ID on `chrome://extensions` matches the store's. Register both redirect URIs with each service if you also test with an ID of your own.

## Adding a service

Each destination is a connector. Settings, the save dialog and upload status only know about the `Connector` interface in [`src/lib/connectors/types.ts`](../../src/lib/connectors/types.ts) and the list in [`registry.ts`](../../src/lib/connectors/registry.ts).

1. Add the ID to the `ConnectorId` union in `types.ts`.
2. Write `src/lib/connectors/<id>.ts` exporting a `Connector`: its name, description, the kinds it accepts, the API hosts it calls, its `OAuthConfig` and an `upload` function. `google-drive.ts` and `dropbox.ts` are the examples for the implicit and PKCE flows.
3. Add it to `CONNECTORS` in `registry.ts`, in the order it should show.
4. Add its `hosts` to `optional_host_permissions` in `wxt.config.ts`. They're requested when the user clicks Connect, not at install.
5. Read its client ID from a new `WXT_*` variable, and add that to `.env.example` and the table above.
6. Register the service's OAuth app with the same redirect URI, and add the service to [PRIVACY.md](../../PRIVACY.md).

`upload` gets an `AuthorizedFetch` that adds the token and renews it, so a connector only speaks the service's upload API. Throw `UploadError` with `retryable: true` for network errors, 5xx and 429, and use `saveResumeState` if the service supports resumable uploads.
