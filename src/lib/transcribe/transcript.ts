// A timed transcript and the file formats it exports to.

export interface TranscriptSegment {
  /** Seconds from the start of the video. */
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  segments: TranscriptSegment[];
  /** The model size that made it, e.g. 'base'. */
  model: string;
  /** Whisper's code for the spoken language, as picked in Settings or detected. */
  language: string;
  /** ISO date. */
  date: string;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** 3725.5 → 01:02:05.500, with `,` before the milliseconds for SRT. */
function timestamp(seconds: number, separator: '.' | ','): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms % 1000, 3)}`;
}

/** Cue text can't hold a blank line or `-->`, which would end or break the cue. */
const cueText = (text: string) => text.replace(/\s*\n\s*/g, ' ').replace(/-->/g, '->').trim();

export function toVtt(segments: TranscriptSegment[]): string {
  const cues = segments.map((s) => `${timestamp(s.start, '.')} --> ${timestamp(s.end, '.')}\n${cueText(s.text)}`);
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

export function toSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((s, i) => `${i + 1}\n${timestamp(s.start, ',')} --> ${timestamp(s.end, ',')}\n${cueText(s.text)}\n`)
    .join('\n');
}

/** Plain text, one segment per line. */
export function toText(segments: TranscriptSegment[]): string {
  return segments.map((s) => s.text.trim()).join('\n') + '\n';
}

/** The segment playing at `time`: the last one that has started, unless it already ended. */
export function segmentAt(segments: TranscriptSegment[], time: number): number {
  let low = 0;
  let high = segments.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (segments[mid]!.start <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found >= 0 && time < segments[found]!.end ? found : -1;
}
