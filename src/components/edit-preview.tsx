import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { editLength, locate, placeSegments, type Edit } from '@/lib/edit/model';
import type { EditSource } from '@/lib/edit/source';

/** How close to a segment's end playback moves on to the next one. */
const END_SLACK_S = 1 / 60;

/**
 * Plays the edited result before it's exported: one video element per source, with
 * the one in use shown. Playback jumps over cut parts, like the export.
 */
export function useEditPreview(edit: Edit, sources: Map<string, EditSource>) {
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const [active, setActive] = useState<string>();
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const placed = useMemo(() => placeSegments(edit), [edit]);
  const total = useMemo(() => editLength(edit), [edit]);
  // The segment playing now, as an index into `placed`.
  const index = useRef(0);
  const live = useRef({ placed, total, time });
  live.current = { placed, total, time };

  const urls = useMemo(() => {
    const map = new Map<string, string>();
    for (const source of sources.values()) map.set(source.id, URL.createObjectURL(source.previewBlob));
    return map;
  }, [sources]);
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);


  const pauseAll = () => videos.current.forEach((v) => v.pause());

  /** Shows the frame at a time of the result. */
  const seek = useCallback(
    (to: number, keepPlaying = false) => {
      const { placed: list, total: length } = live.current;
      const clamped = Math.max(0, Math.min(length, to));
      setTime(clamped);
      const hit = locate(edit, clamped);
      if (!hit) return;
      index.current = list.findIndex((p) => p.clip.id === hit.placed.clip.id && p.segmentIndex === hit.placed.segmentIndex);
      const id = hit.placed.clip.sourceId;
      const video = videos.current.get(id);
      setActive(id);
      videos.current.forEach((v, key) => key !== id && v.pause());
      if (!video) return;
      const target = Math.min(hit.sourceTime, hit.placed.segment.end - END_SLACK_S);
      video.currentTime = target;
      // Now and then a seek stalls; asking again gets it going.
      window.setTimeout(() => {
        if (video.seeking && Math.abs(video.currentTime - target) < 0.01) video.currentTime = target;
      }, 1000);
      if (keepPlaying) void video.play().catch(() => setPlaying(false));
    },
    [edit],
  );

  const pause = useCallback(() => {
    pauseAll();
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    const { time: now, total: length } = live.current;
    if (!length) return;
    seek(now >= length - 0.05 ? 0 : now, true);
    setPlaying(true);
  }, [seek]);

  // Follow the playing video, and move on at the end of each segment.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const { placed: list, total: length } = live.current;
      const current = list[index.current];
      const video = current && videos.current.get(current.clip.sourceId);
      if (!current || !video) return setPlaying(false);
      const t = video.currentTime;
      if (t >= current.segment.end - END_SLACK_S || video.ended) {
        const next = list[index.current + 1];
        if (!next) {
          pauseAll();
          setPlaying(false);
          setTime(length);
          return;
        }
        index.current++;
        const nextVideo = videos.current.get(next.clip.sourceId);
        const runsOn = next.clip.sourceId === current.clip.sourceId && Math.abs(next.segment.start - t) < 0.1;
        if (!runsOn && nextVideo) {
          if (nextVideo !== video) video.pause();
          nextVideo.currentTime = next.segment.start;
          setActive(next.clip.sourceId);
          void nextVideo.play().catch(() => setPlaying(false));
        }
        setTime(next.at);
      } else {
        setTime(current.at + Math.max(0, t - current.segment.start));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // An edit while playing changes what plays next: carry on from the same point.
  useEffect(() => {
    seek(Math.min(live.current.time, total), playing);
  }, [edit]);

  const element = (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
      {[...sources.values()].map((source) => (
        <video
          key={source.id}
          ref={(node) => {
            if (node) videos.current.set(source.id, node);
            else videos.current.delete(source.id);
          }}
          src={urls.get(source.id)}
          preload="auto"
          muted={muted}
          playsInline
          onLoadedData={() => {
            // A seek made before the video had loaded may not stick: show the right frame now.
            const current = placed[index.current]?.clip.sourceId ?? placed[0]?.clip.sourceId;
            if (current === source.id && !playing) seek(live.current.time);
          }}
          className={source.id === active ? 'absolute inset-0 size-full object-contain' : 'hidden'}
        />
      ))}
      {total === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Everything is cut out.</p>
      )}
    </div>
  );

  return { element, time, total, playing, play, pause, seek, muted, setMuted };
}
