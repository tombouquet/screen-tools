// A recording's uploads: where each went, how it's going, and its links.
import { Copy, ExternalLink, Play, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { copyLink, openUrl, showUploadedToast, uploadErrorMessage } from '@/components/upload-status';
import { useUploads } from '@/hooks/use-uploads';
import { useConnections } from '@/lib/connectors/connections';
import { getConnector, serverConnector } from '@/lib/connectors/registry';
import type { ConnectorId } from '@/lib/connectors/types';
import { UploadCancelled, resume, retry, useUploadGuard, type RunningUpload } from '@/lib/connectors/upload';
import type { Upload, UploadSourceKind } from '@/lib/db';
import { formatBytes } from '@/lib/formats';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function UploadList({ kind, id, onUploaded }: { kind: UploadSourceKind; id: number; onUploaded?: () => void }) {
  const { uploads, live } = useUploads(kind, id);
  // Upload servers are named from their saved settings, which load after the first render.
  const connections = useConnections();
  useUploadGuard();
  if (!uploads.length) return null;

  const connectorFor = (connectorId: ConnectorId) => {
    const connection = connections?.find((c) => c.connector === connectorId);
    return (connection && serverConnector(connection)) ?? getConnector(connectorId);
  };

  const restart = async (upload: Upload, start: (id: number) => Promise<RunningUpload>) => {
    const connector = connectorFor(upload.connector);
    try {
      const running = await start(upload.id);
      showUploadedToast(connector, await running.promise);
      onUploaded?.();
    } catch (error) {
      if (error instanceof UploadCancelled) return;
      console.error(error);
      toast.error(uploadErrorMessage(connector, error));
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Uploads</h3>
      <ul className="divide-y rounded-lg border">
        {uploads.map((upload) => {
          const connector = connectorFor(upload.connector);
          const progress = live.get(upload.id);
          const running = Boolean(progress) || upload.status === 'uploading';
          const sent = progress?.sentBytes ?? upload.sentBytes;
          const size = progress?.size ?? upload.size;
          const percent = size ? Math.min(100, Math.round((sent / size) * 100)) : 0;
          const { openUrl: open, shareUrl: share } = upload.result ?? {};
          return (
            <li key={upload.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-48 flex-1 space-y-1">
                <p className="text-sm">
                  <span className="font-medium">{connector.name}</span>{' '}
                  <span className="text-muted-foreground text-xs">
                    · {dateFormat.format(new Date(upload.date))} · {formatBytes(upload.size)}
                  </span>
                </p>
                {running ? (
                  <div className="flex items-center gap-2">
                    <Progress value={percent} className="flex-1" />
                    <span className="text-muted-foreground text-xs tabular-nums">{percent}%</span>
                  </div>
                ) : upload.status === 'failed' ? (
                  <p className="text-destructive text-xs">{upload.error ?? 'Upload failed.'}</p>
                ) : upload.status === 'interrupted' ? (
                  <p className="text-muted-foreground text-xs">
                    Stopped at {percent}% when the window closed.
                  </p>
                ) : (
                  upload.result?.shareError && <p className="text-muted-foreground text-xs">{upload.result.shareError}</p>
                )}
              </div>
              {!running && <StatusBadge upload={upload} />}
              <div className="flex gap-1">
                {!running && upload.status === 'interrupted' && (
                  <Button size="sm" variant="outline" onClick={() => void restart(upload, resume)}>
                    <Play /> Resume
                  </Button>
                )}
                {!running && upload.status === 'failed' && (
                  <Button size="sm" variant="outline" onClick={() => void restart(upload, retry)}>
                    <RotateCw /> Retry
                  </Button>
                )}
                {upload.status === 'done' && share && (
                  <Button size="sm" variant="outline" onClick={() => void copyLink(share)}>
                    <Copy /> Copy link
                  </Button>
                )}
                {upload.status === 'done' && open && (
                  <Button size="sm" variant="ghost" onClick={() => openUrl(open)}>
                    <ExternalLink /> Open
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatusBadge({ upload }: { upload: Upload }) {
  switch (upload.status) {
    case 'done':
      return <Badge variant="secondary">Uploaded</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    case 'interrupted':
      return <Badge variant="outline">Interrupted</Badge>;
    default:
      return null;
  }
}
