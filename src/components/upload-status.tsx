// Bits every upload shows: the progress bar, the "Uploaded" toast and error wording.
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { ReconnectNeeded, type Connector, type UploadResult } from '@/lib/connectors/types';
import { formatBytes } from '@/lib/formats';

export async function copyLink(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  } catch (error) {
    console.error(error);
    toast.error("Couldn't copy the link");
  }
}

export const openUrl = (url: string) => window.open(url, '_blank', 'noopener');

/** "Uploaded to Google Drive", with Copy link and Open. */
export function showUploadedToast(connector: Connector, result: UploadResult): void {
  const open = result.openUrl;
  const share = result.shareUrl;
  toast.success(`Uploaded to ${connector.name}`, {
    description: result.shareError,
    duration: 15_000,
    action: share ? { label: 'Copy link', onClick: () => void copyLink(share) } : open ? { label: 'Open', onClick: () => openUrl(open) } : undefined,
    cancel: share && open ? { label: 'Open', onClick: () => openUrl(open) } : undefined,
  });
}

/** Why an upload failed, in words that say what to do. */
export function uploadErrorMessage(connector: Connector, error: unknown): string {
  if (error instanceof ReconnectNeeded) return `Connect ${connector.name} again in Settings, then try again.`;
  return `Couldn't upload to ${connector.name}: ${error instanceof Error ? error.message : String(error)}`;
}

export function UploadProgress({ connector, sentBytes, size }: { connector: Connector; sentBytes: number; size: number }) {
  const percent = size ? Math.min(100, Math.round((sentBytes / size) * 100)) : 0;
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm">
        <span>
          Uploading to {connector.name} ({formatBytes(sentBytes)} of {formatBytes(size)})…
        </span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <Progress value={percent} />
      <p className="text-muted-foreground text-xs">Keep this window open until it's done.</p>
    </div>
  );
}
