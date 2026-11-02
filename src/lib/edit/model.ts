// The editor's edit list. An edit is a row of clips, each from one source video. A clip
// is a run of segments: ranges of its source, in order, each played at a speed. Cutting
// removes parts of segments, speeding up splits them and sets a speed, and trimming
// moves a clip's first start or last end. Sources are never changed; everything here
// is pure, so undo is keeping the previous list.

export interface Segment {
  /** Seconds into the source. */
  start: number;
  end: number;
  /** 1 plays at normal speed; above 1 is sped up (and muted). */
  speed: number;
}

export interface Clip {
  id: string;
  sourceId: string;
  segments: Segment[];
}

export type Edit = Clip[];

/** A range of the edited result, in seconds. */
export interface Range {
  start: number;
  end: number;
}

/** Shorter pieces than this are dropped rather than kept as slivers. */
export const MIN_SEGMENT_S = 0.05;

let nextId = 0;
export const newId = () => `${Date.now().toString(36)}-${(nextId++).toString(36)}`;

export const segmentLength = (segment: Segment) => (segment.end - segment.start) / segment.speed;
export const clipLength = (clip: Clip) => clip.segments.reduce((sum, s) => sum + segmentLength(s), 0);
export const editLength = (edit: Edit) => edit.reduce((sum, c) => sum + clipLength(c), 0);

export function newClip(sourceId: string, durationS: number): Clip {
  return { id: newId(), sourceId, segments: [{ start: 0, end: durationS, speed: 1 }] };
}

/** Where each segment sits in the edited result. */
export interface PlacedSegment {
  clip: Clip;
  clipIndex: number;
  segment: Segment;
  segmentIndex: number;
  /** Seconds into the edited result. */
  at: number;
  length: number;
}

export function placeSegments(edit: Edit): PlacedSegment[] {
  const placed: PlacedSegment[] = [];
  let at = 0;
  edit.forEach((clip, clipIndex) =>
    clip.segments.forEach((segment, segmentIndex) => {
      const length = segmentLength(segment);
      placed.push({ clip, clipIndex, segment, segmentIndex, at, length });
      at += length;
    }),
  );
  return placed;
}

/** Where each clip starts in the edited result. */
export function clipStarts(edit: Edit): number[] {
  let at = 0;
  return edit.map((clip) => {
    const start = at;
    at += clipLength(clip);
    return start;
  });
}

/** The segment playing at a time of the edited result, and the matching source time. */
export function locate(edit: Edit, time: number): { placed: PlacedSegment; sourceTime: number } | undefined {
  const placed = placeSegments(edit);
  if (!placed.length) return undefined;
  const hit = placed.find((p) => time < p.at + p.length) ?? placed.at(-1)!;
  const offset = Math.min(Math.max(0, time - hit.at), hit.length);
  return { placed: hit, sourceTime: hit.segment.start + offset * hit.segment.speed };
}

/** The time in the edited result that shows a source time of a segment. */
export const resultTime = (placed: PlacedSegment, sourceTime: number) =>
  placed.at + (sourceTime - placed.segment.start) / placed.segment.speed;

/** Splits segments at these result times, so a range lines up with segment edges. */
function splitAt(edit: Edit, times: number[]): Edit {
  let at = 0;
  return edit.map((clip) => ({
    ...clip,
    segments: clip.segments.flatMap((segment) => {
      const length = segmentLength(segment);
      const cuts = times.filter((t) => t > at + MIN_SEGMENT_S / 2 && t < at + length - MIN_SEGMENT_S / 2).sort((a, b) => a - b);
      const startAt = at;
      at += length;
      if (!cuts.length) return [segment];
      const points = [segment.start, ...cuts.map((t) => segment.start + (t - startAt) * segment.speed), segment.end];
      return points.slice(1).map((end, i) => ({ start: points[i]!, end, speed: segment.speed }));
    }),
  }));
}

/** Applies `change` to every segment inside a range of the result, splitting at its edges. */
function changeRange(edit: Edit, range: Range, change: (segment: Segment) => Segment | null): Edit {
  const split = splitAt(edit, [range.start, range.end]);
  let at = 0;
  return tidy(
    split.map((clip) => ({
      ...clip,
      segments: clip.segments.flatMap((segment) => {
        const length = segmentLength(segment);
        const mid = at + length / 2;
        at += length;
        if (mid < range.start || mid > range.end) return [segment];
        const changed = change(segment);
        return changed ? [changed] : [];
      }),
    })),
  );
}

/** Drops empty clips and slivers, and joins neighbours that run on at the same speed. */
function tidy(edit: Edit): Edit {
  return edit
    .map((clip) => ({
      ...clip,
      segments: clip.segments
        .filter((s) => s.end - s.start >= MIN_SEGMENT_S / 2)
        .reduce<Segment[]>((joined, segment) => {
          const last = joined.at(-1);
          if (last && last.speed === segment.speed && Math.abs(last.end - segment.start) < 1e-6) {
            joined[joined.length - 1] = { ...last, end: segment.end };
          } else joined.push(segment);
          return joined;
        }, []),
    }))
    .filter((clip) => clip.segments.length);
}

/** Splits the clip at the playhead into two clips, so either side can be moved or deleted. */
export function splitClipAt(edit: Edit, time: number): Edit {
  const starts = clipStarts(edit);
  const index = edit.findIndex((clip, i) => time > starts[i]! + MIN_SEGMENT_S && time < starts[i]! + clipLength(clip) - MIN_SEGMENT_S);
  if (index < 0) return edit;
  const [clip] = splitAt([edit[index]!], [time - starts[index]!]);
  const at = time - starts[index]!;
  let pos = 0;
  const before: Segment[] = [];
  const after: Segment[] = [];
  for (const segment of clip!.segments) {
    (pos + segmentLength(segment) / 2 < at ? before : after).push(segment);
    pos += segmentLength(segment);
  }
  if (!before.length || !after.length) return edit;
  return [
    ...edit.slice(0, index),
    { ...clip!, segments: before },
    { id: newId(), sourceId: clip!.sourceId, segments: after },
    ...edit.slice(index + 1),
  ];
}

export const cutRange = (edit: Edit, range: Range) => changeRange(edit, range, () => null);

export const setSpeed = (edit: Edit, range: Range, speed: number) =>
  changeRange(edit, range, (segment) => ({ ...segment, speed }));

export const removeClip = (edit: Edit, clipId: string) => edit.filter((c) => c.id !== clipId);

export function moveClip(edit: Edit, clipId: string, toIndex: number): Edit {
  const from = edit.findIndex((c) => c.id === clipId);
  if (from < 0) return edit;
  const next = [...edit];
  const [clip] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, clip!);
  return next;
}

/** Moves a clip's start (`edge` 'start') or end in its source, keeping at least a sliver. */
export function trimClip(edit: Edit, clipId: string, edge: 'start' | 'end', sourceTime: number, sourceDuration: number): Edit {
  return edit.map((clip) => {
    if (clip.id !== clipId) return clip;
    const segments = [...clip.segments];
    if (edge === 'start') {
      const first = segments[0]!;
      segments[0] = { ...first, start: Math.min(Math.max(0, sourceTime), first.end - MIN_SEGMENT_S) };
    } else {
      const last = segments.at(-1)!;
      segments[segments.length - 1] = { ...last, end: Math.max(Math.min(sourceDuration, sourceTime), last.start + MIN_SEGMENT_S) };
    }
    return { ...clip, segments };
  });
}

/**
 * Applies a change to the parts of every clip from `sourceId` that fall in these source
 * ranges (e.g. its silent stretches), at whatever speed they're at now.
 */
export function changeSourceRanges(edit: Edit, sourceId: string, ranges: Range[], speed: number | null): Edit {
  return tidy(
    edit.map((clip) => {
      if (clip.sourceId !== sourceId) return clip;
      return {
        ...clip,
        segments: clip.segments.flatMap((segment) => {
          const inside = ranges
            .map((r) => ({ start: Math.max(r.start, segment.start), end: Math.min(r.end, segment.end) }))
            .filter((r) => r.end - r.start >= MIN_SEGMENT_S)
            .sort((a, b) => a.start - b.start);
          if (!inside.length) return [segment];
          const out: Segment[] = [];
          let cursor = segment.start;
          for (const r of inside) {
            if (r.start > cursor) out.push({ ...segment, start: cursor, end: r.start });
            if (speed !== null) out.push({ start: r.start, end: r.end, speed });
            cursor = r.end;
          }
          if (cursor < segment.end) out.push({ ...segment, start: cursor });
          return out;
        }),
      };
    }),
  );
}

/** The parts of a source range that are in the edit at normal speed, as result ranges. */
export function visibleRanges(edit: Edit, sourceId: string, range: Range): Range[] {
  return placeSegments(edit).flatMap((p) => {
    if (p.clip.sourceId !== sourceId || p.segment.speed !== 1) return [];
    const start = Math.max(range.start, p.segment.start);
    const end = Math.min(range.end, p.segment.end);
    if (end - start < MIN_SEGMENT_S) return [];
    return [{ start: resultTime(p, start), end: resultTime(p, end) }];
  });
}
