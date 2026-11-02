// Saving to this computer, through the browser's normal download flow.
import { HardDrive } from 'lucide-react';
import { downloadBlob } from '@/lib/download';
import type { Connector } from './types';

export const local: Connector = {
  id: 'local',
  name: 'This computer',
  description: 'Goes to your downloads folder.',
  icon: HardDrive,
  accepts: ['video', 'image'],
  hosts: [],
  auth: null,
  async upload(job) {
    downloadBlob(job.blob, job.fileName);
    return { remoteId: '' };
  },
};
