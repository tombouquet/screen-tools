// Uploading a screenshot to a connected service: pick where, whether to make a share
// link, then watch it go. Videos do this in the save dialog instead.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { OptionSelect } from '@/components/option-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { showUploadedToast, uploadErrorMessage, UploadProgress } from '@/components/upload-status';
import { useConnections } from '@/lib/connectors/connections';
import { connectorsFor, serverConnector } from '@/lib/connectors/registry';
import type { Connection, Connector, ConnectorId, MediaKind } from '@/lib/connectors/types';
import { UploadCancelled, cancel, getLiveUploads, startUpload, subscribeUploads, useUploadGuard, type UploadSource } from '@/lib/connectors/upload';
import { getSettings, updateSettings } from '@/lib/settings';

/** Services that take this kind of file and are connected, then upload servers in the order they were added. */
export function useConnectedDestinations(kind: MediaKind): Connector[] {
  const connections = useConnections();
  const builtIn = connectorsFor(kind).filter((c) => c.id !== 'local' && connections?.some((x) => x.connector === c.id));
  const servers = (connections ?? [])
    .map(serverConnector)
    .filter((c): c is Connector => Boolean(c?.accepts.includes(kind)))
    .sort((a, b) => connectedAt(connections, a.id).localeCompare(connectedAt(connections, b.id)));
  return [...builtIn, ...servers];
}

const connectedAt = (connections: Connection[] | undefined, id: ConnectorId) =>
  connections?.find((c) => c.connector === id)?.connectedAt ?? '';

export interface UploadFile {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

export function UploadDialog({
  open,
  onOpenChange,
  kind,
  source,
  getFile,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: MediaKind;
  source?: UploadSource;
  /** Called on Upload, so edits made up to then are included. */
  getFile: () => Promise<UploadFile>;
  onUploaded?: () => void;
}) {
  if (!open) return null;
  return <UploadDialogContent kind={kind} source={source} getFile={getFile} onUploaded={onUploaded} onClose={() => onOpenChange(false)} />;
}

function UploadDialogContent({
  kind,
  source,
  getFile,
  onUploaded,
  onClose,
}: {
  kind: MediaKind;
  source?: UploadSource;
  getFile: () => Promise<UploadFile>;
  onUploaded?: () => void;
  onClose: () => void;
}) {
  const destinations = useConnectedDestinations(kind);
  const [chosen, setChosen] = useState<ConnectorId>(getSettings().saveDestination);
  const [share, setShare] = useState(getSettings().shareLink);
  const [uploadId, setUploadId] = useState<number>();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const running = useRef<number>(undefined);
  // Set once the dialog is stopped or gone, so an upload still starting stops straight away.
  const closed = useRef(false);
  const live = useSyncExternalStore(subscribeUploads, getLiveUploads);
  useUploadGuard();

  // The remembered destination if it's connected, otherwise the first that is.
  const destination = destinations.find((d) => d.id === chosen) ?? destinations[0];

  // Closing the dialog some other way (e.g. leaving the page) stops the upload too.
  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
      if (running.current !== undefined) cancel(running.current);
    };
  }, []);

  const stop = () => {
    closed.current = true;
    if (running.current !== undefined) cancel(running.current);
    running.current = undefined;
    onClose();
  };

  const upload = async (connector: Connector) => {
    setError(undefined);
    setStarting(true);
    updateSettings({ shareLink: share });
    try {
      const file = await getFile();
      if (closed.current) return;
      const current = await startUpload({
        source,
        connectorId: connector.id,
        job: { ...file, kind, share: connector.links === 'always' || share },
      });
      if (closed.current) cancel(current.id);
      running.current = current.id;
      setUploadId(current.id);
      const result = await current.promise;
      if (running.current !== current.id) return;
      running.current = undefined;
      showUploadedToast(connector, result);
      onUploaded?.();
      onClose();
    } catch (reason) {
      if (reason instanceof UploadCancelled) return;
      console.error(reason);
      running.current = undefined;
      setUploadId(undefined);
      setError(uploadErrorMessage(connector, reason));
    } finally {
      setStarting(false);
    }
  };

  const progress = uploadId !== undefined ? live.get(uploadId) : undefined;
  const busy = starting || uploadId !== undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && stop()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && destination) void upload(destination);
          }}
        >
          <DialogHeader>
            <DialogTitle>Upload {kind === 'image' ? 'screenshot' : 'video'}</DialogTitle>
            <DialogDescription>{destination?.description ?? 'Connect a service in Settings first.'}</DialogDescription>
          </DialogHeader>

          {progress && destination ? (
            <UploadProgress connector={destination} sentBytes={progress.sentBytes} size={progress.size} />
          ) : (
            destination && (
              <div className="grid gap-4">
                {destinations.length > 1 && (
                  <div className="grid gap-2">
                    <Label htmlFor="upload-destination">Upload to</Label>
                    <OptionSelect
                      id="upload-destination"
                      items={destinations.map((d) => ({ value: d.id, label: d.name, icon: d.icon }))}
                      value={destination.id}
                      onValueChange={(id) => {
                        setChosen(id);
                        updateSettings({ saveDestination: id });
                      }}
                    />
                  </div>
                )}
                {destination.links !== 'always' && <ShareSwitch checked={share} onChange={setShare} disabled={busy} />}
              </div>
            )
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={stop}>
              {busy ? 'Stop' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={busy || !destination}>
              {busy ? 'Uploading…' : 'Upload'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ShareSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor="share-link">Create a share link</Label>
        <p className="text-muted-foreground text-xs">Anyone with the link can view it.</p>
      </div>
      <Switch id="share-link" checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
