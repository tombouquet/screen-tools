import { ArrowLeft, Image as ImageIcon, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ConfirmDeleteDialog } from '@/components/confirm-dialog';
import { ScreenshotEditor } from '@/components/screenshot-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { navigate } from '@/hooks/use-route';
import { MAX_SCREENSHOTS, deleteScreenshot, getScreenshot, listScreenshots, updateScreenshot, type Screenshot } from '@/lib/db';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function ScreenshotsPage({ id }: { id?: number }) {
  return id === undefined ? <ScreenshotList /> : <ScreenshotDetail id={id} />;
}

/** An object URL for the blob, revoked when it changes or the component goes. */
function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

function ScreenshotList() {
  const [screenshots, setScreenshots] = useState<Screenshot[]>();
  const [deleting, setDeleting] = useState<number>();

  useEffect(() => {
    void listScreenshots().then(setScreenshots);
  }, []);

  const remove = async (id: number) => {
    await deleteScreenshot(id);
    setScreenshots((list) => list?.filter((s) => s.id !== id));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Screenshots</CardTitle>
        <CardDescription>
          Your latest {MAX_SCREENSHOTS} screenshots. Take one from the toolbar icon; open one to edit, download or copy it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {screenshots?.length === 0 && (
          <div className="text-muted-foreground flex flex-col items-center gap-3 py-10 text-sm">
            <ImageIcon className="size-8" />
            <p>No screenshots yet. Click the toolbar icon and pick a capture.</p>
          </div>
        )}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {screenshots?.map((screenshot) => (
            <li key={screenshot.id} className="group relative">
              <Thumbnail screenshot={screenshot} />
              <Button
                variant="destructive"
                size="icon-sm"
                aria-label="Delete"
                className="absolute top-2 right-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                onClick={() => setDeleting(screenshot.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
      <ConfirmDeleteDialog
        open={deleting !== undefined}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        onConfirm={() => deleting !== undefined && void remove(deleting)}
        title="Delete this screenshot?"
        description="It's removed from Screenshots. Copies you downloaded stay in your downloads."
      />
    </Card>
  );
}

function Thumbnail({ screenshot }: { screenshot: Screenshot }) {
  const url = useObjectUrl(screenshot.blob);
  return (
    <button
      className="hover:bg-accent flex w-full flex-col gap-2 rounded-lg border p-2 text-left select-none"
      onClick={() => navigate(`/screenshots/${screenshot.id}`)}
    >
      <span className="bg-muted flex aspect-video w-full items-center justify-center overflow-hidden rounded-md">
        {url && <img src={url} alt="" draggable={false} className="max-h-full max-w-full object-contain select-none" />}
      </span>
      <span className="min-w-0 px-1">
        <span className="block truncate text-sm font-medium">{screenshot.title || 'Screenshot'}</span>
        <span className="text-muted-foreground text-xs">
          {dateFormat.format(new Date(screenshot.date))} · {screenshot.width} × {screenshot.height}
        </span>
      </span>
    </button>
  );
}

function ScreenshotDetail({ id }: { id: number }) {
  const [screenshot, setScreenshot] = useState<Screenshot | null>();
  // Bumped on revert so the editor starts over on the original.
  const [revision, setRevision] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    void getScreenshot(id).then((row) => setScreenshot(row ?? null));
  }, [id]);

  if (screenshot === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Screenshot not found</CardTitle>
          <CardDescription>It may have been deleted, or replaced by newer screenshots.</CardDescription>
        </CardHeader>
        <CardContent>
          <BackButton />
        </CardContent>
      </Card>
    );
  }
  if (!screenshot) return null;

  const revert = async () => {
    const { width, height } = await createImageBitmap(screenshot.original);
    const patch = { blob: screenshot.original, width, height, edited: false };
    await updateScreenshot(id, patch);
    setScreenshot({ ...screenshot, ...patch });
    setRevision((n) => n + 1);
  };
  const remove = async () => {
    await deleteScreenshot(id);
    navigate('/screenshots');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={screenshot.url}>
              {screenshot.title || 'Screenshot'}
            </p>
            <p className="text-muted-foreground text-xs">{dateFormat.format(new Date(screenshot.date))}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {screenshot.saved ? <Badge variant="secondary">Saved</Badge> : <Badge variant="outline">Not saved</Badge>}
          <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
            <Trash2 /> Delete
          </Button>
        </div>
      </div>
      <ScreenshotEditor
        key={revision}
        screenshot={screenshot}
        onSaved={(patch) => setScreenshot({ ...screenshot, ...patch })}
        onRevert={() => void revert()}
      />
      <ConfirmDeleteDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => void remove()}
        title="Delete this screenshot?"
        description="It's removed from Screenshots. Copies you downloaded stay in your downloads."
      />
    </div>
  );
}

function BackButton() {
  return (
    <Button variant="ghost" size="sm" onClick={() => navigate('/screenshots')}>
      <ArrowLeft /> All screenshots
    </Button>
  );
}
