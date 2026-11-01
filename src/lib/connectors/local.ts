// Saving to this computer, through the browser's normal download flow.
import { downloadBlob } from '@/lib/download';
import type { Connector } from './types';

export const local: Connector = {
  id: 'local',
  name: 'This computer',
  description: 'Goes to your downloads folder.',
  accepts: ['video', 'image'],
  hosts: [],
  auth: null,
  async upload(job) {
    downloadBlob(job.blob, job.fileName);
    return { remoteId: '' };
  },
};
