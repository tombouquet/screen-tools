import { ArrowLeft, Copy, Download, Image as ImageIcon, Link2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/confirm-dialog';
import { MediaTitle } from '@/components/media-bar';
import { EmptyMedia, MediaCard, MediaGrid, QuickAction } from '@/components/media-grid';
import { ScreenshotEditor } from '@/components/screenshot-editor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { UploadFile } from '@/components/upload-dialog';
import { useQuickShare } from '@/hooks/use-quick-share';
import { navigate } from '@/hooks/use-route';
import { copyImageNow } from '@/lib/clipboard';
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

/** The screenshot in the download format, for uploading. */
async function screenshotFile(screenshot: Screenshot): Promise<UploadFile> {
  const format = getSettings().imageFormat;
  return {
    blob: await encode(screenshot.blob, format),
    fileName: screenshotFileName(new Date(screenshot.date), format),
    mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
  };
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
  const quickShare = useQuickShare();

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
          Your latest {MAX_SCREENSHOTS} screenshots. Open one to edit it; Share link uploads one and copies the link in one click.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {screenshots?.length === 0 && (
          <EmptyMedia icon={ImageIcon}>No screenshots yet. Click the toolbar icon and pick a capture.</EmptyMedia>
        )}
        <MediaGrid>
          {screenshots?.map((screenshot) => (
            <MediaCard
              key={screenshot.id}
              preview={<ScreenshotPreview screenshot={screenshot} />}
              title={screenshot.title || 'Screenshot'}
              details={`${dateFormat.format(new Date(screenshot.date))} · ${screenshot.width} × ${screenshot.height}`}
              onOpen={() => navigate(`/screenshots/${screenshot.id}`)}
              pinActions={quickShare.isSharing(screenshot.id)}
              actions={
                <>
                  <QuickAction
                    label={quickShare.destination ? `Share link: upload to ${quickShare.destination.name} and copy the link` : 'Share link'}
                    icon={Link2}
                    primary
                    busy={quickShare.isSharing(screenshot.id)}
                    disabled={!quickShare.ready || quickShare.isSharing(screenshot.id)}
                    onClick={() => quickShare.share(screenshot.id, () => screenshotFile(screenshot), () => void markSaved(screenshot.id))}
                  />
                  <QuickAction
                    label="Copy"
                    icon={Copy}
                    onClick={() =>
                      void copyScreenshot(screenshot).then(async (ok) => {
                        if (ok) await markSaved(screenshot.id);
                      })
                    }
                  />
                  <QuickAction
                    label={`Download ${getSettings().imageFormat.toUpperCase()}`}
                    icon={Download}
                    onClick={() => void downloadScreenshot(screenshot).then(() => markSaved(screenshot.id))}
                  />
                  <QuickAction label="Delete" icon={Trash2} destructive onClick={() => setDeleting(screenshot.id)} />
                </>
              }
            />
          ))}
        </MediaGrid>
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

function ScreenshotPreview({ screenshot }: { screenshot: Screenshot }) {
  const url = useObjectUrl(screenshot.blob);
  return url ? <img src={url} alt="" draggable={false} className="max-h-full max-w-full object-contain select-none" /> : null;
}

/**
 * True when the route says this screenshot was just taken (`?new`). The flag is taken
 * off the address straight away, so a reload or Back doesn't count it as new again.
 */
function useJustCaptured(id: number): boolean {
  const [fresh] = useState(() => /\?(.*&)?new(&|=|$)/.test(window.location.hash));
  useEffect(() => {
    if (fresh) history.replaceState(history.state, '', `#/screenshots/${id}`);
  }, [fresh, id]);
  return fresh;
}

/** Copies a fresh screenshot to the clipboard when "Copy screenshots to the clipboard" is on. */
function useAutoCopy(screenshot: Screenshot | null | undefined, fresh: boolean): void {
  const done = useRef(false);
  useEffect(() => {
    if (!fresh || !screenshot || done.current || !getSettings().copyScreenshots) return;
    done.current = true;
    const png = screenshot.blob;
    void copyImageNow(png).then((copied) => {
      if (copied) toast.success('Copied to clipboard', { description: 'Paste it anywhere, or edit it here first.' });
      else
        toast.info("Couldn't copy it straight away", {
          description: 'The browser only allows it with a click.',
          duration: 15_000,
          action: { label: 'Copy', onClick: () => void copyScreenshot(screenshot) },
        });
    });
  }, [screenshot, fresh]);
}

function ScreenshotDetail({ id }: { id: number }) {
  const [screenshot, setScreenshot] = useState<Screenshot | null>();
  // Bumped on revert so the editor starts over on the original.
  const [revision, setRevision] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fresh = useJustCaptured(id);
  useAutoCopy(screenshot, fresh);

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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ScreenshotEditor
        key={revision}
        title={
          <MediaTitle
            back={{ to: '/screenshots', label: 'All screenshots' }}
            title={screenshot.title || 'Screenshot'}
            details={dateFormat.format(new Date(screenshot.date))}
          />
        }
        screenshot={screenshot}
        onSaved={(patch) => setScreenshot({ ...screenshot, ...patch })}
        onRevert={() => void revert()}
        onDelete={() => setConfirmOpen(true)}
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
