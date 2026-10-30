import {
  Circle,
  Copy,
  Crop,
  Download,
  Grid3x3,
  Highlighter,
  MoveUpRight,
  Pencil,
  Redo2,
  RotateCcw,
  Square,
  Type,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { OptionSelect } from '@/components/option-select';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBeforeUnload } from '@/hooks/use-before-unload';
import { useSettings } from '@/hooks/use-settings';
import {
  COLORS,
  STROKE_SIZES,
  baseStroke,
  flatten,
  fontFor,
  rectFrom,
  render,
  viewRect,
  type Doc,
  type Point,
  type Rect,
  type Shape,
  type Tool,
} from '@/lib/annotate';
import { updateScreenshot, type Screenshot } from '@/lib/db';
import { downloadBlob } from '@/lib/download';
import { screenshotFileName } from '@/lib/formats';
import { updateSettings, type ImageFormat } from '@/lib/settings';
import { cn } from '@/lib/utils';

const TOOLS: { tool: Tool; label: string; icon: LucideIcon }[] = [
  { tool: 'arrow', label: 'Arrow', icon: MoveUpRight },
  { tool: 'rect', label: 'Rectangle', icon: Square },
  { tool: 'ellipse', label: 'Ellipse', icon: Circle },
  { tool: 'pen', label: 'Pen', icon: Pencil },
  { tool: 'highlighter', label: 'Highlighter', icon: Highlighter },
  { tool: 'text', label: 'Text', icon: Type },
  { tool: 'blur', label: 'Blur (pixelate)', icon: Grid3x3 },
  { tool: 'crop', label: 'Crop', icon: Crop },
];

const FORMAT_OPTIONS: { value: ImageFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
];

const mimeOf = (format: ImageFormat) => (format === 'png' ? 'image/png' : 'image/jpeg');
const isMod = (event: KeyboardEvent) => event.metaKey || event.ctrlKey;

// The stage's p-4 on both sides, and room for the page footer under it.
const STAGE_PADDING = 32;
const FOOTER_SPACE = 40;
/** Taller than this (height ÷ width) is a full-page shot: fit the width and scroll. */
const TALL_RATIO = 2;

/**
 * The preview's CSS width; its height follows, keeping the aspect ratio. It's never
 * bigger than the captured page looked on screen, and shrinks to fit the window.
 */
function fitWidth(view: Rect, stage: { width: number; height: number }): number {
  const actual = view.width / (window.devicePixelRatio || 1);
  const byHeight = view.height / view.width > TALL_RATIO ? Infinity : (stage.height * view.width) / view.height;
  return Math.max(160, Math.min(actual, stage.width, byHeight));
}

/** Smaller than this in image pixels is a stray click, not a shape. */
const MIN_DRAG = 4;

interface TextDraft {
  at: Point;
  value: string;
}

/**
 * Draw on a screenshot, crop it, then download or copy it. Downloading or copying
 * also stores the edited image back in place of the screenshot.
 */
export function ScreenshotEditor({
  screenshot,
  onSaved,
  onRevert,
}: {
  screenshot: Screenshot;
  onSaved: (patch: Partial<Screenshot>) => void;
  onRevert: () => void;
}) {
  const settings = useSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<ImageBitmap>();
  const [history, setHistory] = useState<{ docs: Doc[]; index: number }>({ docs: [{ shapes: [] }], index: 0 });
  const [exported, setExported] = useState<Doc>();
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState(COLORS[0]!);
  const [sizeStep, setSizeStep] = useState(1);
  const [draft, setDraft] = useState<Shape>();
  const [cropDraft, setCropDraft] = useState<{ from: Point; to: Point }>();
  const [text, setText] = useState<TextDraft>();
  const [busy, setBusy] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<{ width: number; height: number }>();

  // The room the preview has: the stage's width, and the window below its top edge.
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const measure = () => {
      const { top } = element.getBoundingClientRect();
      setStage({ width: element.clientWidth - STAGE_PADDING, height: window.innerHeight - top - STAGE_PADDING - FOOTER_SPACE });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const doc = history.docs[history.index]!;
  const canUndo = history.index > 0;
  const canRedo = history.index < history.docs.length - 1;
  const dirty = history.index > 0 && doc !== exported;
  useBeforeUnload(dirty);

  useEffect(() => {
    let cancelled = false;
    let bitmap: ImageBitmap | undefined;
    void createImageBitmap(screenshot.blob).then((loaded) => {
      bitmap = loaded;
      if (cancelled) loaded.close();
      else setImage(loaded);
    });
    return () => {
      cancelled = true;
      bitmap?.close();
    };
  }, [screenshot.blob]);

  const size = image ? baseStroke(image.width) * STROKE_SIZES[sizeStep]! : 2;
  const view = image ? viewRect(image, doc) : undefined;

  // Redraw on every change; the shapes are cheap to draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || !view) return;
    canvas.width = Math.round(view.width);
    canvas.height = Math.round(view.height);
    const context = canvas.getContext('2d')!;
    render(context, image, doc, draft);
    if (cropDraft) drawCropOverlay(context, rectFrom(cropDraft.from, cropDraft.to), view);
  }, [image, doc, draft, cropDraft, view?.x, view?.y, view?.width, view?.height]);

  const push = (next: Doc) =>
    setHistory((h) => ({ docs: [...h.docs.slice(0, h.index + 1), next], index: h.index + 1 }));
  const undo = () => setHistory((h) => ({ ...h, index: Math.max(0, h.index - 1) }));
  const redo = () => setHistory((h) => ({ ...h, index: Math.min(h.docs.length - 1, h.index + 1) }));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea')) return;
      const key = event.key.toLowerCase();
      if (isMod(event) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (isMod(event) && key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Pointer position in image pixels. */
  const toImage = (event: React.PointerEvent): Point => {
    const canvas = canvasRef.current!;
    const box = canvas.getBoundingClientRect();
    return {
      x: view!.x + ((event.clientX - box.left) * canvas.width) / box.width,
      y: view!.y + ((event.clientY - box.top) * canvas.height) / box.height,
    };
  };

  /** CSS pixels per image pixel, for placing the text box over the canvas. */
  const cssScale = () => {
    const canvas = canvasRef.current;
    return canvas ? canvas.getBoundingClientRect().width / canvas.width : 1;
  };

  // Enter and the blur that follows both commit, so the second call must find nothing.
  const textRef = useRef<TextDraft>(undefined);
  textRef.current = text;
  const commitText = () => {
    const current = textRef.current;
    textRef.current = undefined;
    setText(undefined);
    if (current?.value.trim()) {
      push({ ...doc, shapes: [...doc.shapes, { kind: 'text', at: current.at, text: current.value, color, size }] });
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || !image) return;
    const p = toImage(event);
    if (tool === 'text') {
      // With a text box open, this click only closes it (its blur commits the text).
      if (!text) setText({ at: p, value: '' });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === 'crop') setCropDraft({ from: clampTo(p, view!), to: clampTo(p, view!) });
    else if (tool === 'pen' || tool === 'highlighter') setDraft({ kind: tool, points: [p], color, size });
    else if (tool === 'blur') setDraft({ kind: 'blur', from: p, to: p });
    else setDraft({ kind: tool, from: p, to: p, color, size });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draft && !cropDraft) return;
    const p = toImage(event);
    if (cropDraft) setCropDraft({ ...cropDraft, to: clampTo(p, view!) });
    else if (draft?.kind === 'pen' || draft?.kind === 'highlighter') setDraft({ ...draft, points: [...draft.points, p] });
    else if (draft && 'to' in draft) setDraft({ ...draft, to: p });
  };

  const onPointerUp = () => {
    if (cropDraft) {
      const r = rectFrom(cropDraft.from, cropDraft.to);
      if (r.width >= MIN_DRAG && r.height >= MIN_DRAG) push({ ...doc, crop: roundRect(r) });
      setCropDraft(undefined);
      return;
    }
    if (!draft) return;
    const tiny = 'to' in draft && Math.hypot(draft.to.x - draft.from.x, draft.to.y - draft.from.y) < MIN_DRAG;
    if (!tiny) push({ ...doc, shapes: [...doc.shapes, draft] });
    setDraft(undefined);
  };

  /** Stores the flattened PNG in place of the screenshot and marks it saved. */
  const persist = async () => {
    if (!image) return;
    const png = await flatten(image, doc, 'image/png');
    const edited = screenshot.edited || doc.shapes.length > 0 || Boolean(doc.crop);
    const patch = { blob: png, width: Math.round(viewRect(image, doc).width), height: Math.round(viewRect(image, doc).height), edited, saved: true };
    await updateScreenshot(screenshot.id, patch);
    setExported(doc);
    // The editor keeps drawing on the image it loaded, so only the flags go up.
    onSaved({ edited, saved: true });
  };

  const download = async () => {
    if (!image) return;
    setBusy(true);
    try {
      const format = settings.imageFormat;
      const blob = await flatten(image, doc, mimeOf(format));
      downloadBlob(blob, screenshotFileName(new Date(screenshot.date), format));
      await persist();
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!image) return;
    setBusy(true);
    try {
      // Handing over the promise keeps the click's user activation for the clipboard.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': flatten(image, doc, 'image/png') })]);
      toast.success('Copied to clipboard');
      await persist();
    } catch (error) {
      console.error(error);
      toast.error("Couldn't copy the image", { description: 'Download it instead.' });
    } finally {
      setBusy(false);
    }
  };

  const scale = cssScale();
  const displayWidth = view && stage ? fitWidth(view, stage) : undefined;

  return (
    <div className="space-y-3">
      <div className="bg-card flex flex-wrap items-center gap-2 rounded-lg border p-2">
        <ToggleGroup aria-label="Tool" value={[tool]} onValueChange={(next) => next[0] && setTool(next[0] as Tool)} spacing={1}>
          {TOOLS.map(({ tool: value, label, icon: Icon }) => (
            <Tooltip key={value}>
              <TooltipTrigger render={<ToggleGroupItem value={value} aria-label={label} size="sm" />}>
                <Icon />
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Colour">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              onClick={() => setColor(c)}
              className={cn(
                'size-5 rounded-full border border-black/20 transition-shadow',
                color === c && 'ring-ring ring-offset-background ring-2 ring-offset-1',
              )}
              style={{ background: c }}
            />
          ))}
        </div>
        <Separator orientation="vertical" className="h-6" />
        <ToggleGroup
          aria-label="Size"
          value={[String(sizeStep)]}
          onValueChange={(next) => next[0] && setSizeStep(Number(next[0]))}
          spacing={1}
        >
          {STROKE_SIZES.map((_, i) => (
            <ToggleGroupItem key={i} value={String(i)} aria-label={['Thin', 'Medium', 'Thick'][i]} size="sm">
              <span className="rounded-full bg-current" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Separator orientation="vertical" className="h-6" />
        <IconButton label="Undo (⌘Z)" disabled={!canUndo} onClick={undo}>
          <Undo2 />
        </IconButton>
        <IconButton label="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redo}>
          <Redo2 />
        </IconButton>
        {screenshot.edited && (
          <IconButton label="Revert to original" onClick={onRevert}>
            <RotateCcw />
          </IconButton>
        )}
        <div className="ml-auto flex items-center gap-2">
          <OptionSelect
            className="w-20"
            items={FORMAT_OPTIONS}
            value={settings.imageFormat}
            onValueChange={(imageFormat) => updateSettings({ imageFormat })}
          />
          <Button variant="outline" disabled={!image || busy} onClick={() => void copy()}>
            <Copy /> Copy
          </Button>
          <Button disabled={!image || busy} onClick={() => void download()}>
            <Download /> Download
          </Button>
        </div>
      </div>

      <div ref={stageRef} className="bg-muted/50 flex justify-center overflow-auto rounded-lg border p-4">
        <div className="relative">
          <canvas
            ref={canvasRef}
            className={cn('block h-auto max-w-full shadow-md', tool === 'text' ? 'cursor-text' : 'cursor-crosshair')}
            style={{ touchAction: 'none', width: displayWidth }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
          {text && view && (
            <input
              autoFocus
              value={text.value}
              onChange={(event) => setText({ ...text, value: event.target.value })}
              onBlur={commitText}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitText();
                else if (event.key === 'Escape') {
                  textRef.current = undefined;
                  setText(undefined);
                }
              }}
              placeholder="Type, then Enter"
              className="absolute min-w-32 border border-dashed border-current bg-transparent px-0 outline-none"
              style={{
                left: (text.at.x - view.x) * scale,
                top: (text.at.y - view.y) * scale,
                color,
                font: fontFor(size * scale),
                lineHeight: 1,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" disabled={disabled} onClick={onClick} aria-label={label} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Dims everything outside the crop being dragged. `r` is in image pixels. */
function drawCropOverlay(context: CanvasRenderingContext2D, r: Rect, view: Rect) {
  const x = r.x - view.x;
  const y = r.y - view.y;
  const { width, height } = context.canvas;
  context.save();
  context.fillStyle = 'rgba(0,0,0,0.5)';
  context.fillRect(0, 0, width, y);
  context.fillRect(0, y + r.height, width, height - y - r.height);
  context.fillRect(0, y, x, r.height);
  context.fillRect(x + r.width, y, width - x - r.width, r.height);
  context.strokeStyle = '#ffffff';
  context.lineWidth = Math.max(1, width / 800);
  context.setLineDash([6, 4].map((n) => n * context.lineWidth));
  context.strokeRect(x, y, r.width, r.height);
  context.restore();
}

const clampTo = (p: Point, r: Rect): Point => ({
  x: Math.min(r.x + r.width, Math.max(r.x, p.x)),
  y: Math.min(r.y + r.height, Math.max(r.y, p.y)),
});

const roundRect = (r: Rect): Rect => ({
  x: Math.round(r.x),
  y: Math.round(r.y),
  width: Math.round(r.width),
  height: Math.round(r.height),
});
