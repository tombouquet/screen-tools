import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { editLength, type Edit } from '@/lib/edit/model';
import { RenderCancelled, renderEdit, type RenderJob, type RenderResult } from '@/lib/edit/render';
import { copyContainer, type EditSource } from '@/lib/edit/source';
import { formatDuration } from '@/lib/formats';

/** Copies the edit into a new file, with progress and a Stop button. */
export function ExportDialog({
  edit,
  sources,
  onDone,
  onClose,
}: {
  edit: Edit;
  sources: Map<string, EditSource>;
  onDone: (result: RenderResult) => void;
  onClose: () => void;
}) {
  const [fraction, setFraction] = useState<number>();
  const [error, setError] = useState<string>();
  const job = useRef<RenderJob>(undefined);
  useEffect(() => () => job.current?.cancel(), []);

  const durationS = editLength(edit);
  const head = edit[0] && sources.get(edit[0].sourceId);
  const container = head && copyContainer(head.mimeType, head.format);

  const start = () => {
    setError(undefined);
    setFraction(0);
    const current = renderEdit(edit, sources, setFraction);
    job.current = current;
    current.promise.then(
      (result) => {
        if (job.current !== current) return;
        job.current = undefined;
        onDone(result);
      },
      (reason: unknown) => {
        if (job.current !== current) return;
        job.current = undefined;
        setFraction(undefined);
        if (reason instanceof RenderCancelled) return;
        console.error(reason);
        setError(`Couldn't export this edit: ${reason instanceof Error ? reason.message : String(reason)}`);
      },
    );
  };

  const stop = () => {
    job.current?.cancel();
    job.current = undefined;
    setFraction(undefined);
  };

  const busy = fraction !== undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && (busy ? stop() : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export edit</DialogTitle>
          <DialogDescription>
            Makes a new {formatDuration(durationS * 1000)} {container === 'webm' ? 'WebM' : 'MP4'} video on your computer. The original stays as it is.
          </DialogDescription>
        </DialogHeader>

        {busy ? (
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Copying…</span>
              <span className="tabular-nums">{Math.round(fraction * 100)}%</span>
            </div>
            <Progress value={Math.round(fraction * 100)} />
            <p className="text-muted-foreground text-xs">Long videos can take a moment; keep this window open.</p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            The video and sound are copied as they are, so it's quick and keeps the full quality.
          </p>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={busy ? stop : onClose}>
            {busy ? 'Stop' : 'Cancel'}
          </Button>
          <Button type="button" disabled={busy || !durationS} onClick={start}>
            {busy ? 'Exporting…' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
