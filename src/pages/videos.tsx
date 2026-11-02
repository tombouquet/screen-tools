import { ArrowLeft, Film, Gauge, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/confirm-dialog';
import { RecordedVideo } from '@/components/recorded-video';
import { LargeFileNotice, useSaveVideo } from '@/components/save-video';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UploadList } from '@/components/upload-list';
import { navigate } from '@/hooks/use-route';
import {
  MAX_RECORDINGS,
  deleteRecording,
  getRecording,
  getRecordingBlob,
  listRecordings,
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
  const thumbnails = useThumbnails(recordings);
  useEffect(() => {
    void listRecordings().then(setRecordings);
  }, []);

  return (
    <Card className={recordings?.length === 0 ? 'mx-auto my-auto w-full max-w-xl' : undefined}>
      <CardHeader>
        <CardTitle>Latest videos</CardTitle>
        <CardDescription>
          Your latest {MAX_RECORDINGS} recordings, saved as you record. Open one to play, save or delete it, including
          after a crash.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {recordings?.length === 0 && (
          <div className="text-muted-foreground flex flex-col items-center gap-3 py-10 text-sm">
            <Film className="size-8" />
            <p>
              No recordings yet.{' '}
              <button className="text-foreground underline underline-offset-4" onClick={() => navigate('/')}>
                Start a new recording
              </button>
            </p>
          </div>
        )}
        <ul className="divide-y">
          {recordings?.map((recording) => (
            <li key={recording.id}>
              <button
                className="hover:bg-accent flex w-full items-center gap-4 rounded-md px-3 py-3 text-left"
                onClick={() => navigate(`/videos/${recording.id}`)}
              >
                <span className="bg-muted relative flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border">
                  {thumbnails[recording.id] ? (
                    <img src={thumbnails[recording.id]} alt="" className="size-full object-cover" />
                  ) : (
                    <Film className="text-muted-foreground size-5" />
                  )}
                  {recording.durationMs !== undefined && (
                    <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 text-[10px] font-medium text-white tabular-nums">
                      {formatDuration(recording.durationMs)}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{recordingTitle(recording)}</span>
                  <span className="text-muted-foreground text-xs">
                    {recording.name && `${dateFormat.format(new Date(recording.date))} · `}
                    {recording.durationMs !== undefined ? formatDuration(recording.durationMs) : 'Recovered'} ·{' '}
                    {fileExtension(recording.mimeType).toUpperCase()}
                  </span>
                </span>
                {recording.durationMs === undefined && <Badge variant="outline">Interrupted</Badge>}
                {recording.saved ? <Badge variant="secondary">Saved</Badge> : <Badge variant="outline">Not saved</Badge>}
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function VideoDetail({ id }: { id: number }) {
  const [recording, setRecording] = useState<Recording | null>();
  const [blob, setBlob] = useState<Blob>();
  // The row is there but has no video, e.g. the window closed before the first chunk was written.
  const [empty, setEmpty] = useState(false);

  const load = useCallback(async () => {
    const [row, data] = await Promise.all([getRecording(id), getRecordingBlob(id)]);
    setRecording(row && data ? row : null);
    setEmpty(!!row && !data);
    setBlob(data);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

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

  const save = async (suggestCompression = false) => {
    const savedAs = await saveVideo(blob, recording.mimeType, defaultFileName(recording), { suggestCompression, recordingId: id });
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

  return (
    <Card className="my-auto">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>{recordingTitle(recording)}</CardTitle>
          <CardDescription>
            {recording.name && `${dateFormat.format(new Date(recording.date))} · `}
            {recording.durationMs !== undefined ? `${formatDuration(recording.durationMs)} · ` : ''}
            {fileExtension(recording.mimeType).toUpperCase()} · {formatBytes(blob.size)}
          </CardDescription>
        </div>
        {recording.saved ? <Badge variant="secondary">Saved</Badge> : <Badge variant="outline">Not saved</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        {blob.size > LARGE_FILE_BYTES && <LargeFileNotice size={blob.size} onCompress={() => void save(true)} />}
        <RecordedVideo blob={blob} durationMs={recording.durationMs} />
        <UploadList kind="recording" id={id} onUploaded={() => void markSaved()} />
        <div className="flex flex-wrap justify-between gap-2">
          <BackButton />
          <div className="flex flex-wrap gap-2">
            {canOptimize && (
              <Button variant="outline" disabled={optimizing} onClick={() => void optimize()}>
                <Gauge /> {optimizing ? 'Optimizing…' : 'Make seekable'}
              </Button>
            )}
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 /> Delete
            </Button>
            <Button onClick={() => void save()}>
              <Save /> Save video
            </Button>
          </div>
        </div>
      </CardContent>
      <ConfirmDeleteDialog open={confirmOpen} onOpenChange={setConfirmOpen} onConfirm={() => void remove()} />
      {saveDialog}
    </Card>
  );
}

function BackButton() {
  return (
    <Button variant="ghost" onClick={() => navigate('/videos')}>
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
