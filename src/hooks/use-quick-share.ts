// "Upload and copy link": one click sends a screenshot to the destination used last
// (or the first connected one) with a share link, and copies the link when it's done.
// It runs through the same uploader as the Upload dialog, so it's listed, resumable
// and guarded the same way; only the progress shows in a toast instead of a dialog.
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { useConnectedDestinations, type UploadFile } from '@/components/upload-dialog';
import { openUrl, showUploadedToast, uploadErrorMessage } from '@/components/upload-status';
import { navigate } from '@/hooks/use-route';
import { copyTextNow } from '@/lib/clipboard';
import { useConnections } from '@/lib/connectors/connections';
import { ReconnectNeeded, type Connector } from '@/lib/connectors/types';
import { UploadCancelled, cancel, getLiveUploads, startUpload, subscribeUploads, useUploadGuard } from '@/lib/connectors/upload';
import { getSettings } from '@/lib/settings';

// Screenshots with a quick share running in this window, so their buttons wait.
let sharing: ReadonlySet<number> = new Set();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
function setSharing(id: number, on: boolean): void {
  const next = new Set(sharing);
  if (on) next.add(id);
  else next.delete(id);
  sharing = next;
  listeners.forEach((l) => l());
}

export interface QuickShare {
  /** Where it would go; undefined when nothing is connected (or connections are still loading). */
  destination: Connector | undefined;
  /** False until the connected accounts have loaded. */
  ready: boolean;
  isSharing: (screenshotId: number) => boolean;
  share: (screenshotId: number, getFile: () => Promise<UploadFile>, onUploaded?: () => void) => void;
}

export function useQuickShare(): QuickShare {
  const connections = useConnections();
  const destinations = useConnectedDestinations('image');
  const current = useSyncExternalStore(subscribe, () => sharing);
  useUploadGuard();
  const remembered = getSettings().saveDestination;
  const destination = destinations.find((d) => d.id === remembered) ?? destinations[0];
  return {
    destination,
    ready: connections !== undefined,
    isSharing: (id) => current.has(id),
    share: (id, getFile, onUploaded) => {
      if (!destination) {
        showConnectFirst();
        return;
      }
      if (sharing.has(id)) return;
      void quickShare(destination, id, getFile, onUploaded);
    },
  };
}

function showConnectFirst(): void {
  toast.info('Connect an upload service first', {
    description: 'Connect Google Drive, Dropbox or your own upload server in Settings, then try again.',
    action: { label: 'Open Settings', onClick: () => navigate('/settings/uploads') },
  });
}

async function quickShare(destination: Connector, id: number, getFile: () => Promise<UploadFile>, onUploaded?: () => void): Promise<void> {
  const toastId = toast.loading(`Uploading to ${destination.name}…`);
  setSharing(id, true);
  let unsubscribe: (() => void) | undefined;
  try {
    const file = await getFile();
    const running = await startUpload({
      source: { kind: 'screenshot', id },
      connectorId: destination.id,
      job: { ...file, kind: 'image', share: true },
    });
    let shown = -1;
    const showProgress = () => {
      const progress = getLiveUploads().get(running.id);
      if (!progress) return;
      const percent = progress.size ? Math.min(100, Math.round((progress.sentBytes / progress.size) * 100)) : 0;
      if (percent === shown) return;
      shown = percent;
      toast.loading(`Uploading to ${destination.name}… ${percent}%`, {
        id: toastId,
        description: 'Keep this window open until it’s done.',
        action: { label: 'Stop', onClick: () => cancel(running.id) },
      });
    };
    unsubscribe = subscribeUploads(showProgress);
    showProgress();

    const result = await running.promise;
    onUploaded?.();
    const link = result.shareUrl;
    if (link && (await copyTextNow(link))) {
      toast.success('Link copied', {
        id: toastId,
        description: `Uploaded to ${destination.name}. Paste the link anywhere to share it.`,
        duration: 15_000,
        action: { label: 'Open', onClick: () => openUrl(link) },
      });
    } else {
      // No link (e.g. a Workspace admin blocks public sharing), or the browser wouldn't
      // copy without a click: the usual toast has a Copy link button.
      toast.dismiss(toastId);
      showUploadedToast(destination, result);
    }
  } catch (error) {
    if (error instanceof UploadCancelled) {
      toast.dismiss(toastId);
      return;
    }
    console.error(error);
    toast.error(uploadErrorMessage(destination, error), {
      id: toastId,
      description: undefined,
      duration: 15_000,
      action: error instanceof ReconnectNeeded ? { label: 'Open Settings', onClick: () => navigate('/settings/uploads') } : undefined,
    });
  } finally {
    unsubscribe?.();
    setSharing(id, false);
  }
}
