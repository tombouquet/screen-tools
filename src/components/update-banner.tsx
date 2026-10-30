import { ArrowUpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAvailableUpdate } from '@/hooks/use-update';
import { RELEASES_URL, currentVersion } from '@/lib/version';

export function UpdateBanner() {
  const update = useAvailableUpdate();
  if (!update) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-green-600/40 bg-green-600/10 px-4 py-3 text-sm">
      <ArrowUpCircle className="size-5 shrink-0 text-green-600" />
      <div className="min-w-60 flex-1">
        <p className="font-medium">
          v{update.latestVersion} is available. You're on v{currentVersion()}.
        </p>
        <p className="text-muted-foreground text-xs">
          Download the zip from the release, unzip it over your current folder, then reload the extension.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={update.releaseUrl ?? RELEASES_URL} target="_blank" rel="noreferrer" />}
        >
          What's new
        </Button>
        <Button size="sm" onClick={() => chrome.runtime.reload()}>
          Reload extension
        </Button>
      </div>
    </div>
  );
}
