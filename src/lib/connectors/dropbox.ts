// Dropbox. Placeholder until the connector lands.
import { UploadError, type Connector } from './types';

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
    scopes: ['account_info.read', 'files.content.write', 'sharing.write'],
    authorizeParams: { token_access_type: 'offline' },
  },
  async upload() {
    throw new UploadError('Dropbox uploads are not available yet.', false);
  },
};
