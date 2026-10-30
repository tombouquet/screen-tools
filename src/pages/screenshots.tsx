import { ArrowLeft, Copy, Download, Image as ImageIcon, Trash2, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/confirm-dialog';
import { ScreenshotEditor } from '@/components/screenshot-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { navigate } from '@/hooks/use-route';
import { downloadBlob } from '@/lib/download';
import { screenshotFileName } from '@/lib/formats';
import { getSettings } from '@/lib/settings';
import { MAX_SCREENSHOTS, deleteScreenshot, getScreenshot, listScreenshots, updateScreenshot, type Screenshot } from '@/lib/db';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Stored screenshots are PNG; JPG is re-encoded on the way out. */
async function encode(blob: Blob, format: 'png' | 'jpg'): Promise<Blob> {
  if (format === 'png') return blob;
  const image = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(image.width, image.height);
  canvas.getContext('2d')!.drawImage(image, 0, 0);
  image.close();
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
}

async function copyScreenshot(screenshot: Screenshot): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': screenshot.blob })]);
    toast.success('Copied to clipboard');
    return true;
  } catch (error) {
    console.error(error);
    toast.error("Couldn't copy the image", { description: 'Download it instead.' });
    return false;
  }
}

async function downloadScreenshot(screenshot: Screenshot): Promise<void> {
  const format = getSettings().imageFormat;
  downloadBlob(await encode(screenshot.blob, format), screenshotFileName(new Date(screenshot.date), format));
}

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
  const markSaved = async (id: number) => {
    await updateScreenshot(id, { saved: true });
    setScreenshots((list) => list?.map((s) => (s.id === id ? { ...s, saved: true } : s)));
  };

  return (
    <Card className={screenshots?.length === 0 ? 'mx-auto my-auto w-full max-w-xl' : undefined}>
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
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <QuickAction
                  label="Copy"
                  icon={Copy}
                  onClick={() => void copyScreenshot(screenshot).then(async (ok) => {
                      if (ok) await markSaved(screenshot.id);
                    })}
                />
                <QuickAction
                  label={`Download ${getSettings().imageFormat.toUpperCase()}`}
                  icon={Download}
                  onClick={() => void downloadScreenshot(screenshot).then(() => markSaved(screenshot.id))}
                />
                <QuickAction label="Delete" icon={Trash2} destructive onClick={() => setDeleting(screenshot.id)} />
              </div>
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

function QuickAction({
  label,
  icon: Icon,
  destructive,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label={label}
            onClick={onClick}
            className={destructive ? 'text-destructive hover:text-destructive shadow-sm' : 'shadow-sm'}
          />
        }
      >
        <Icon />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
      <Card className="mx-auto my-auto w-full max-w-xl">
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
