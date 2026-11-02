import { useEffect, useState, useSyncExternalStore } from 'react';
import { getLiveUploads, getUploadsVersion, subscribeUploads, type LiveUpload } from '@/lib/connectors/upload';
import { listUploads, type Upload, type UploadSourceKind } from '@/lib/db';

/** A recording's or screenshot's uploads, newest first, with live progress for running ones. */
export function useUploads(kind: UploadSourceKind, id: number): { uploads: Upload[]; live: ReadonlyMap<number, LiveUpload> } {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const live = useSyncExternalStore(subscribeUploads, getLiveUploads);
  // Reload the rows whenever one is added, finishes or goes.
  const version = useSyncExternalStore(subscribeUploads, getUploadsVersion);
  useEffect(() => {
    let stale = false;
    void listUploads(kind, id).then((rows) => !stale && setUploads(rows));
    return () => {
      stale = true;
    };
  }, [kind, id, version]);
  return { uploads, live };
}
