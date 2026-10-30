import { FileVideo, Gauge, Save, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { RecordedVideo } from '@/components/recorded-video';
import { LargeFileNotice, useSaveVideo } from '@/components/save-video';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBytes, isWebm } from '@/lib/formats';
import { LARGE_FILE_BYTES } from '@/lib/compress';
import { makeSeekable } from '@/lib/optimize';
import { cn } from '@/lib/utils';

/** Plays a video file from disk, and can make an old WebM recording seekable. */
export function PlayerPage() {
  const [file, setFile] = useState<File>();
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const open = (picked: File | undefined) => {
    if (!picked) return;
    if (!picked.type.startsWith('video/')) {
      toast.error('Unsupported file type', { description: 'Pick a video file, such as WebM or MP4.' });
      return;
    }
    setFile(picked);
  };

  if (file) return <FileView file={file} onChange={setFile} onClose={() => setFile(undefined)} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Video player</CardTitle>
        <CardDescription>Play your recordings, and make older WebM files seekable.</CardDescription>
      </CardHeader>
      <CardContent>
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            open(event.dataTransfer.files[0]);
          }}
          className={cn(
            'text-muted-foreground flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-16 text-sm transition-colors',
            dragging ? 'border-primary bg-primary/5 text-foreground' : 'hover:bg-accent',
          )}
        >
          {dragging ? <FileVideo className="size-10" /> : <Upload className="size-10" />}
          <span className="text-foreground font-medium">{dragging ? 'Drop here' : 'Drop a video here'}</span>
          <span>or click to pick one</span>
        </button>
        <input
          ref={input}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => {
            open(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </CardContent>
    </Card>
  );
}

function FileView({ file, onChange, onClose }: { file: File; onChange: (file: File) => void; onClose: () => void }) {
  const [optimizing, setOptimizing] = useState(false);
  const { save: saveVideo, dialog: saveDialog } = useSaveVideo();

  const optimize = async () => {
    setOptimizing(true);
    try {
      const fixed = await makeSeekable(file);
      onChange(new File([fixed], file.name, { type: file.type }));
      toast.success('Video is now seekable', { description: 'Save it to keep the fixed copy.' });
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate">{file.name}</CardTitle>
        <CardDescription>
          {formatBytes(file.size)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {file.size > LARGE_FILE_BYTES && (
          <LargeFileNotice
            size={file.size}
            onCompress={() => void saveVideo(file, file.type, file.name, { suggestCompression: true })}
          />
        )}
        <RecordedVideo blob={file} />
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={onClose}>
            <X /> Close
          </Button>
          <div className="flex flex-wrap gap-2">
            {isWebm(file.type) && (
              <Button variant="outline" disabled={optimizing} onClick={() => void optimize()}>
                <Gauge /> {optimizing ? 'Optimizing…' : 'Make seekable'}
              </Button>
            )}
            <Button onClick={() => void saveVideo(file, file.type, file.name)}>
              <Save /> Save video
            </Button>
          </div>
        </div>
      </CardContent>
      {saveDialog}
    </Card>
  );
}
