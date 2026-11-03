import { ArrowLeft, Download, Film, Gauge, Link2, ShieldCheck, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/confirm-dialog';
import { EmptyMedia, MediaCard, MediaGrid, QuickAction } from '@/components/media-grid';
import { RecordedVideo } from '@/components/recorded-video';
import { RecordingLayout } from '@/components/recording-actions';
import { useSaveVideo } from '@/components/save-video';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UploadList } from '@/components/upload-list';
import { useQuickShare } from '@/hooks/use-quick-share';
import { navigate } from '@/hooks/use-route';
import {
  MAX_RECORDINGS,
  deleteRecording,
  getRecording,
  getRecordingBlob,
  listRecordings,
  liveRecordingIds,
  replaceRecordingBlob,
  updateRecording,
  type Recording,
} from '@/lib/db';
import { fileExtension, formatBytes, formatDuration, isWebm, recordingFileName } from '@/lib/formats';
import { LARGE_FILE_BYTES } from '@/lib/compress';
import { makeSeekable } from '@/lib/optimize';
import { makeThumbnail } from '@/lib/thumbnail';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function VideosPage({ id }: { id?: number }) {
  return id === undefined ? <VideoList /> : <VideoDetail id={id} />;
}

/** What a recording is called: the name it was saved as, or when it was made. */
const recordingTitle = (recording: Recording) => recording.name ?? dateFormat.format(new Date(recording.date));

/** The file name the save dialog starts from. */
const defaultFileName = (recording: Recording) =>
  recording.name
    ? `${recording.name}.${fileExtension(recording.mimeType)}`
    : recordingFileName(new Date(recording.date), recording.mimeType);

function VideoList() {
  const [recordings, setRecordings] = useState<Recording[]>();
  const [live, setLive] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<number>();
  const thumbnails = useThumbnails(recordings);
  const quickShare = useQuickShare('video');
  const { save: saveVideo, dialog: saveDialog } = useSaveVideo();
  useEffect(() => {
    void listRecordings().then(setRecordings);
    void liveRecordingIds().then(setLive);
  }, []);

  const patch = (id: number, change: Partial<Recording>) =>
    setRecordings((list) => list?.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const markSaved = async (id: number) => {
    await updateRecording(id, { saved: true });
    patch(id, { saved: true });
  };
  const download = async (recording: Recording) => {
    const blob = await getRecordingBlob(recording.id);
    if (!blob) return;
    const savedAs = await saveVideo(blob, recording.mimeType, defaultFileName(recording), {
      recordingId: recording.id,
      destination: 'local',
      // A big file opens the save dialog on a smaller size.
      suggestCompression: blob.size > LARGE_FILE_BYTES,
    });
    if (!savedAs) return;
    await markSaved(recording.id);
    // The save dialog stores a name that differs from the default; mirror it here.
    if (savedAs !== defaultBase(recording)) patch(recording.id, { name: savedAs });
  };
  const remove = async (id: number) => {
    await deleteRecording(id);
    setRecordings((list) => list?.filter((r) => r.id !== id));
  };

  return (
    <Card className={recordings?.length === 0 ? 'mx-auto my-auto w-full max-w-xl' : undefined}>
      <CardHeader>
        <CardTitle>Videos</CardTitle>
        <CardDescription>
          Your latest {MAX_RECORDINGS} recordings, saved as you record. Open one to play it; Share link uploads one and
          copies the link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {recordings?.length === 0 && (
          <EmptyMedia icon={Film}>
            No recordings yet.{' '}
            <button className="text-foreground underline underline-offset-4" onClick={() => navigate('/')}>
              Start a new recording
            </button>
          </EmptyMedia>
        )}
        <MediaGrid>
          {recordings?.map((recording) => {
            const recordingNow = live.has(recording.id);
            const sharing = quickShare.isSharing(recording.id);
            return (
              <MediaCard
                key={recording.id}
                preview={
                  <>
                    {thumbnails[recording.id] ? (
                      <img src={thumbnails[recording.id]} alt="" draggable={false} className="size-full object-cover" />
                    ) : (
                      <Film className="text-muted-foreground size-5" />
                    )}
                    {(recordingNow || recording.durationMs === undefined) && (
                      <span className="absolute top-1.5 left-1.5">
                        {recordingNow ? <Badge variant="destructive">Recording</Badge> : <Badge variant="secondary">Interrupted</Badge>}
                      </span>
                    )}
                    {recording.durationMs !== undefined && (
                      <span className="absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1 text-[11px] font-medium text-white tabular-nums">
                        {formatDuration(recording.durationMs)}
                      </span>
                    )}
                  </>
                }
                title={recordingTitle(recording)}
                details={
                  <>
                    {recording.name && `${dateFormat.format(new Date(recording.date))} · `}
                    {recording.durationMs !== undefined ? formatDuration(recording.durationMs) : 'Recovered'} ·{' '}
                    {fileExtension(recording.mimeType).toUpperCase()}
                  </>
                }
                onOpen={() => navigate(`/videos/${recording.id}`)}
                pinActions={sharing}
                // A recording still going in another window can't be shared or deleted yet.
                actions={
                  !recordingNow && (
                    <>
                      <QuickAction
                        label={quickShare.destination ? `Share link: upload to ${quickShare.destination.name} and copy the link` : 'Share link'}
                        icon={Link2}
                        primary
                        busy={sharing}
                        disabled={!quickShare.ready || sharing}
                        onClick={() =>
                          quickShare.share(
                            recording.id,
                            async () => {
                              const blob = await getRecordingBlob(recording.id);
                              if (!blob) throw new Error('The recording is missing.');
                              return { blob, fileName: defaultFileName(recording), mimeType: recording.mimeType };
                            },
                            () => void markSaved(recording.id),
                          )
                        }
                      />
                      <QuickAction label="Download" icon={Download} onClick={() => void download(recording)} />
                      <QuickAction label="Delete" icon={Trash2} destructive onClick={() => setDeleting(recording.id)} />
                    </>
                  )
                }
              />
            );
          })}
        </MediaGrid>
      </CardContent>
      <ConfirmDeleteDialog
        open={deleting !== undefined}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        onConfirm={() => deleting !== undefined && void remove(deleting)}
      />
      {saveDialog}
    </Card>
  );
}

function VideoDetail({ id }: { id: number }) {
  const [recording, setRecording] = useState<Recording | null>();
  const [blob, setBlob] = useState<Blob>();
  // The row is there but has no video, e.g. the window closed before the first chunk was written.
  const [empty, setEmpty] = useState(false);
  // Still being recorded in another window: deleting or rewriting it now would lose it.
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    const [row, data, liveIds] = await Promise.all([getRecording(id), getRecordingBlob(id), liveRecordingIds()]);
    setLive(liveIds.has(id));
    setRecording(row && data ? row : null);
    setEmpty(!!row && !data);
    setBlob(data);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (live) {
    return (
      <Card className="mx-auto my-auto w-full max-w-xl">
        <CardHeader>
          <CardTitle>Still recording</CardTitle>
          <CardDescription>This video is being recorded in another window. Stop it there to play, save or delete it.</CardDescription>
        </CardHeader>
        <CardContent>
          <BackButton />
        </CardContent>
      </Card>
    );
  }

  if (recording === null) {
    return (
      <Card className="mx-auto my-auto w-full max-w-xl">
        <CardHeader>
          <CardTitle>{empty ? 'Nothing was recorded' : 'Video not found'}</CardTitle>
          <CardDescription>
            {empty
              ? 'The recording ended before any video was saved.'
              : 'It may have been deleted, or replaced by newer recordings.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-between gap-2">
          <BackButton />
          {empty && (
            <Button
              variant="destructive"
              onClick={() => void deleteRecording(id).then(() => navigate('/videos'))}
            >
              <Trash2 /> Delete
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }
  if (!recording || !blob) return null;
  return <RecordingView id={id} recording={recording} blob={blob} onChange={setRecording} reload={load} />;
}

function RecordingView({
  id,
  recording,
  blob,
  onChange,
  reload,
}: {
  id: number;
  recording: Recording;
  blob: Blob;
  onChange: (recording: Recording) => void;
  reload: () => Promise<void>;
}) {
  const [optimizing, setOptimizing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { save: saveVideo, dialog: saveDialog } = useSaveVideo();
  const quickShare = useQuickShare('video');
  const sharing = quickShare.isSharing(id);

  const save = async (suggestCompression = false) => {
    const savedAs = await saveVideo(blob, recording.mimeType, defaultFileName(recording), {
      suggestCompression,
      recordingId: id,
      destination: 'local',
    });
    if (!savedAs) return;
    // The save dialog stores a name that differs from the default; mirror it here.
    await markSaved(savedAs !== defaultBase(recording) ? savedAs : undefined);
  };
  // A finished upload counts as saving it. A new name was already stored by the save dialog.
  const markSaved = async (name?: string) => {
    await updateRecording(id, { saved: true });
    onChange({ ...recording, saved: true, ...(name ? { name } : {}) });
  };
  const optimize = async () => {
    setOptimizing(true);
    try {
      const fixed = await makeSeekable(blob, recording.durationMs);
      await replaceRecordingBlob(id, fixed);
      await updateRecording(id, { seekable: true });
      toast.success('Video is now seekable');
      await reload();
    } finally {
      setOptimizing(false);
    }
  };
  const remove = async () => {
    await deleteRecording(id);
    navigate('/videos');
  };

  const canOptimize = isWebm(recording.mimeType) && !recording.seekable;
  const big = blob.size > LARGE_FILE_BYTES;
  const size = formatBytes(blob.size);

  return (
    <>
      <RecordingLayout
        back={{ to: '/videos', label: 'All videos' }}
        title={recordingTitle(recording)}
        details={
          <>
            {recording.name && `${dateFormat.format(new Date(recording.date))} · `}
            {recording.durationMs !== undefined ? `${formatDuration(recording.durationMs)} · ` : ''}
            {fileExtension(recording.mimeType).toUpperCase()} · {size}
          </>
        }
        saved={Boolean(recording.saved)}
        onDelete={() => setConfirmOpen(true)}
        share={{
          quickShare,
          sharing,
          onShare: () =>
            quickShare.share(
              id,
              async () => ({ blob, fileName: defaultFileName(recording), mimeType: recording.mimeType }),
              () => void markSaved(),
            ),
        }}
        // A big file opens the save dialog on a smaller size.
        onDownload={() => void save(big)}
        menu={[
          ...(canOptimize
            ? [{ label: optimizing ? 'Making seekable…' : 'Make seekable', icon: Gauge, disabled: optimizing, onClick: () => void optimize() }]
            : []),
        ]}
        note={
          <>
            <ShieldCheck className="size-4 shrink-0" />
            <span className="truncate">
              {big
                ? `At ${size}, it's big for email and chat. Download suggests a smaller size.`
                : recording.saved
                  ? 'Saved. It stays here too.'
                  : `Not saved yet. It stays here until ${MAX_RECORDINGS} newer recordings replace it.`}
            </span>
          </>
        }
        video={<RecordedVideo fill blob={blob} durationMs={recording.durationMs} />}
        below={<UploadList kind="recording" id={id} onUploaded={() => void markSaved()} />}
      />
      <ConfirmDeleteDialog open={confirmOpen} onOpenChange={setConfirmOpen} onConfirm={() => void remove()} />
      {saveDialog}
    </>
  );
}

function BackButton() {
  return (
    <Button variant="ghost" size="sm" onClick={() => navigate('/videos')}>
      <ArrowLeft /> All videos
    </Button>
  );
}

/** The default file name without its extension, to tell whether the user changed it. */
const defaultBase = (recording: Recording) => defaultFileName(recording).replace(/\.[^.]+$/, '');

/**
 * Object URLs of the recordings' thumbnails. Makes the missing ones one at a time,
 * newest first, and keeps them on the recording so it's only done once.
 */
function useThumbnails(recordings: Recording[] | undefined): Record<number, string> {
  const [urls, setUrls] = useState<Record<number, string>>({});
  useEffect(() => {
    if (!recordings) return;
    let cancelled = false;
    const made: string[] = [];
    const show = (id: number, blob: Blob) => {
      const url = URL.createObjectURL(blob);
      made.push(url);
      setUrls((current) => ({ ...current, [id]: url }));
    };
    for (const recording of recordings) if (recording.thumbnail) show(recording.id, recording.thumbnail);
    void (async () => {
      for (const recording of recordings) {
        if (recording.thumbnail || cancelled) continue;
        const blob = await getRecordingBlob(recording.id);
        const thumbnail = blob && (await makeThumbnail(blob));
        if (!thumbnail || cancelled) continue;
        await updateRecording(recording.id, { thumbnail });
        show(recording.id, thumbnail);
      }
    })();
    return () => {
      cancelled = true;
      made.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [recordings]);
  return urls;
}
