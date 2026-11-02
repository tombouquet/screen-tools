import { CameraOff, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CameraOverlayControls, overlayOf, overlayStyle } from '@/components/camera-overlay-controls';
import { DesktopScene } from '@/components/desktop-scene';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { captureCamera } from '@/lib/capture';
import { CAMERA_RESOLUTIONS, type Settings } from '@/lib/settings';

/**
 * A large preview of the camera overlay: the real camera over a made-up desktop,
 * with the overlay settings beside it so changes show straight away.
 */
export function CameraPreviewDialog({
  open,
  onOpenChange,
  settings,
  onLive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  /** Called once the camera shows a picture. */
  onLive?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:flex-row">
        {/* Only mounted while open, so the camera is released on close. */}
        {open && <Stage settings={settings} onLive={onLive} />}
        <aside className="flex max-h-[50%] w-full shrink-0 flex-col border-t md:max-h-none md:w-96 md:border-t-0 md:border-l">
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <div className="space-y-1 pr-8">
              <DialogTitle>Camera preview</DialogTitle>
              <DialogDescription>
                Your camera over a sample screen. Changes here are saved and used in your next recording.
              </DialogDescription>
            </div>
            <CameraOverlayControls settings={settings} idPrefix="live-" compact />
          </div>
          <div className="border-t p-4">
            <DialogClose render={<Button className="w-full" />}>Done</DialogClose>
          </div>
        </aside>
      </DialogContent>
    </Dialog>
  );
}

type CameraState = { status: 'starting' } | { status: 'live'; stream: MediaStream } | { status: 'error'; message: string };

function Stage({ settings, onLive }: { settings: Settings; onLive?: () => void }) {
  const camera = useCamera(settings);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current && camera.status === 'live') video.current.srcObject = camera.stream;
  }, [camera]);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-neutral-950 p-4 md:p-6" style={{ containerType: 'size' }}>
      {/* The largest 16:9 frame that fits the space. */}
      <div
        className="relative overflow-hidden rounded-lg shadow-2xl"
        style={{ width: 'min(100cqw, calc(100cqh * 16 / 9))', aspectRatio: '16 / 9' }}
      >
        <DesktopScene className="absolute inset-0 size-full" />
        <div
          className="absolute overflow-hidden bg-neutral-800 transition-[left,top,width,height] duration-200"
          style={overlayStyle(overlayOf(settings))}
        >
          {camera.status === 'live' ? (
            <video
              ref={video}
              autoPlay
              muted
              playsInline
              onPlaying={onLive}
              className="absolute inset-0 size-full object-cover"
              // Zoom and mirror around the centre, as the recording does.
              style={{ transform: `scale(${settings.cameraZoom})${settings.cameraMirror ? ' scaleX(-1)' : ''}` }}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center text-xs text-neutral-300">
              {camera.status === 'starting' ? (
                <Loader2 className="size-6 animate-spin" />
              ) : (
                <>
                  <CameraOff className="size-6" />
                  <span className="line-clamp-3">{camera.message}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Opens the preferred camera at the chosen resolution; stops it on unmount or when those change. */
function useCamera(settings: Settings): CameraState {
  const [state, setState] = useState<CameraState>({ status: 'starting' });
  const { cameraId, cameraResolution, frameRate } = settings;

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | undefined;
    setState({ status: 'starting' });
    const { width, height } = CAMERA_RESOLUTIONS.find((r) => r.id === cameraResolution) ?? CAMERA_RESOLUTIONS[0];
    captureCamera(cameraId, width, height, frameRate).then(
      (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        setState({ status: 'live', stream: s });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraId, cameraResolution, frameRate]);

  return state;
}
