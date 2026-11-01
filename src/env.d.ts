/// <reference types="chrome" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OAuth client ID of the Google Cloud "Web application" client. Unset disables Google Drive. */
  readonly WXT_GOOGLE_CLIENT_ID?: string;
  /** App key of the Dropbox app. Unset disables Dropbox. */
  readonly WXT_DROPBOX_APP_KEY?: string;
}
