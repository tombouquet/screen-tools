// Google Drive. Placeholder until the connector lands.
import { UploadError, type Connector } from './types';

export const googleDrive: Connector = {
  id: 'google-drive',
  name: 'Google Drive',
  description: 'Uploads go to a Screen Tools folder in your Drive.',
  accepts: ['video', 'image'],
  hosts: ['https://www.googleapis.com/*'],
  auth: {
    flow: 'implicit',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: import.meta.env.WXT_GOOGLE_CLIENT_ID ?? '',
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  },
  async upload() {
    throw new UploadError('Google Drive uploads are not available yet.', false);
  },
};
