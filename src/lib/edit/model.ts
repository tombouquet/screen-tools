// The editor's edit list. An edit is a row of clips, each from one source video. A clip
// is a run of segments: ranges of its source, in order. Cutting removes parts of
// segments, and trimming moves a clip's first start or last end. Sources are never
// changed; everything here is pure, so undo is keeping the previous list.
//
// The export copies the compressed frames as they are, so a segment can only start on a
// keyframe (the frames after one depend on it). Every change that makes a new segment
// start moves that start back to the keyframe before it, using `Snap`, so the timeline
// and preview show what the export writes.

export interface Segment {
  /** Seconds into the source. Always on a keyframe, so the export can copy from it. */
  start: number;
  end: number;
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

/** The keyframe of a source at or before a time, in seconds into the source. */
export type Snap = (sourceId: string, sourceTime: number) => number;

let nextId = 0;
export const newId = () => `${Date.now().toString(36)}-${(nextId++).toString(36)}`;

export const segmentLength = (segment: Segment) => segment.end - segment.start;
export const clipLength = (clip: Clip) => clip.segments.reduce((sum, s) => sum + segmentLength(s), 0);
export const editLength = (edit: Edit) => edit.reduce((sum, c) => sum + clipLength(c), 0);

export function newClip(sourceId: string, durationS: number): Clip {
  return { id: newId(), sourceId, segments: [{ start: 0, end: durationS }] };
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
  return { placed: hit, sourceTime: hit.segment.start + offset };
}

/** The time in the edited result that shows a source time of a segment. */
export const resultTime = (placed: PlacedSegment, sourceTime: number) =>
  placed.at + sourceTime - placed.segment.start;

/**
 * Where a cut ending at this time of the result really ends: the part after it starts on
 * the keyframe at or before it (or where its segment starts).
 */
export function snapCutEnd(edit: Edit, time: number, snap: Snap): number {
  const hit = locate(edit, time);
  if (!hit) return time;
  const { placed } = hit;
  if (time >= placed.at + placed.length - 1e-6) return time;
  return resultTime(placed, Math.max(placed.segment.start, snap(placed.clip.sourceId, hit.sourceTime)));
}

/** Drops empty clips and slivers, and joins neighbours that run on. */
function tidy(edit: Edit): Edit {
  return edit
    .map((clip) => ({
      ...clip,
      segments: clip.segments
        .filter((s) => s.end - s.start >= MIN_SEGMENT_S / 2)
        .reduce<Segment[]>((joined, segment) => {
          const last = joined.at(-1);
          if (last && Math.abs(last.end - segment.start) < 1e-6) joined[joined.length - 1] = { ...last, end: segment.end };
          else joined.push(segment);
          return joined;
        }, []),
    }))
    .filter((clip) => clip.segments.length);
}

/**
 * Splits the clip at the keyframe at or before `time` into two clips, so either side can
 * be moved or deleted. Unchanged when there's no keyframe between the clip's start and `time`.
 */
export function splitClipAt(edit: Edit, time: number, snap: Snap): Edit {
  const at = snapCutEnd(edit, time, snap);
  const starts = clipStarts(edit);
  const index = edit.findIndex((clip, i) => at > starts[i]! + MIN_SEGMENT_S && at < starts[i]! + clipLength(clip) - MIN_SEGMENT_S);
  if (index < 0) return edit;
  const clip = edit[index]!;
  let pos = starts[index]!;
  const before: Segment[] = [];
  const after: Segment[] = [];
  for (const segment of clip.segments) {
    const length = segmentLength(segment);
    if (pos + length <= at + 1e-6) before.push(segment);
    else if (pos >= at - 1e-6) after.push(segment);
    else {
      const sourceAt = segment.start + (at - pos);
      before.push({ start: segment.start, end: sourceAt });
      after.push({ start: sourceAt, end: segment.end });
    }
    pos += length;
  }
  if (!before.length || !after.length) return edit;
  return [
    ...edit.slice(0, index),
    { ...clip, segments: before },
    { id: newId(), sourceId: clip.sourceId, segments: after },
    ...edit.slice(index + 1),
  ];
}

/**
 * Removes a range of the result. The part after the cut starts on a keyframe, so the cut
 * may end earlier than asked; where no keyframe falls inside, nothing is cut.
 */
export function cutRange(edit: Edit, range: Range, snap: Snap): Edit {
  let at = 0;
  return tidy(
    edit.map((clip) => ({
      ...clip,
      segments: clip.segments.flatMap((segment) => {
        const segmentAt = at;
        at += segmentLength(segment);
        const from = Math.max(range.start, segmentAt);
        const to = Math.min(range.end, at);
        if (to - from < MIN_SEGMENT_S / 2) return [segment];
        const cutStart = segment.start + (from - segmentAt);
        const cutEnd = segment.start + (to - segmentAt);
        const kept: Segment[] = [];
        if (cutStart - segment.start >= MIN_SEGMENT_S / 2) kept.push({ start: segment.start, end: cutStart });
        if (segment.end - cutEnd >= MIN_SEGMENT_S / 2) {
          const resume = Math.max(segment.start, snap(clip.sourceId, cutEnd));
          if (resume - cutStart < MIN_SEGMENT_S / 2) return [segment];
          kept.push({ start: resume, end: segment.end });
        }
        return kept;
      }),
    })),
  );
}

export const removeClip = (edit: Edit, clipId: string) => edit.filter((c) => c.id !== clipId);

export function moveClip(edit: Edit, clipId: string, toIndex: number): Edit {
  const from = edit.findIndex((c) => c.id === clipId);
  if (from < 0) return edit;
  const next = [...edit];
  const [clip] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, clip!);
  return next;
}

/**
 * Moves a clip's start (`edge` 'start') or end in its source, keeping at least a sliver.
 * The start lands on the keyframe at or before `sourceTime`.
 */
export function trimClip(edit: Edit, clipId: string, edge: 'start' | 'end', sourceTime: number, sourceDuration: number, snap: Snap): Edit {
  return edit.map((clip) => {
    if (clip.id !== clipId) return clip;
    const segments = [...clip.segments];
    if (edge === 'start') {
      const first = segments[0]!;
      const start = Math.min(snap(clip.sourceId, Math.min(Math.max(0, sourceTime), first.end - MIN_SEGMENT_S)), first.end - MIN_SEGMENT_S);
      segments[0] = { ...first, start: Math.max(0, start) };
    } else {
      const last = segments.at(-1)!;
      segments[segments.length - 1] = { ...last, end: Math.max(Math.min(sourceDuration, sourceTime), last.start + MIN_SEGMENT_S) };
    }
    return { ...clip, segments };
  });
}

/**
 * Cuts the parts of every clip from `sourceId` that fall in these source ranges (e.g. its
 * quiet stretches). Each range ends at the keyframe at or before its end; a range with no
 * keyframe inside is left alone.
 */
export function cutSourceRanges(edit: Edit, sourceId: string, ranges: Range[], snap: Snap): Edit {
  return tidy(
    edit.map((clip) => {
      if (clip.sourceId !== sourceId) return clip;
      return {
        ...clip,
        segments: clip.segments.flatMap((segment) => {
          const inside = ranges
            .map((r) => ({
              start: Math.max(r.start, segment.start),
              end: r.end < segment.end ? snap(sourceId, r.end) : segment.end,
            }))
            .filter((r) => r.end - r.start >= MIN_SEGMENT_S)
            .sort((a, b) => a.start - b.start);
          if (!inside.length) return [segment];
          const out: Segment[] = [];
          let cursor = segment.start;
          for (const r of inside) {
            if (r.start > cursor) out.push({ start: cursor, end: r.start });
            cursor = Math.max(cursor, r.end);
          }
          if (cursor < segment.end) out.push({ start: cursor, end: segment.end });
          return out;
        }),
      };
    }),
  );
}

/** The parts of a source range that are in the edit, as result ranges. */
export function visibleRanges(edit: Edit, sourceId: string, range: Range): Range[] {
  return placeSegments(edit).flatMap((p) => {
    if (p.clip.sourceId !== sourceId) return [];
    const start = Math.max(range.start, p.segment.start);
    const end = Math.min(range.end, p.segment.end);
    if (end - start < MIN_SEGMENT_S) return [];
    return [{ start: resultTime(p, start), end: resultTime(p, end) }];
  });
}
