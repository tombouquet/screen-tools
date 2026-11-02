import { Minus, Plus } from 'lucide-react';
import { Field, SwitchField } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { overlayBox, type CameraOverlay } from '@/lib/compositor';
import {
  CAMERA_POSITIONS,
  CAMERA_SHAPES,
  CAMERA_SIZES,
  updateSettings,
  type CameraPosition,
  type CameraShape,
  type CameraSize,
  type Settings,
} from '@/lib/settings';
import { SQUIRCLE_CLIP_PATH } from '@/lib/squircle';
import { cn } from '@/lib/utils';

const POSITION_LABELS: Record<CameraPosition, string> = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
};
const SIZE_LABELS: Record<CameraSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };
const SHAPE_LABELS: Record<CameraShape, string> = { squircle: 'Squircle', default: 'Rectangle', circle: 'Circle' };

// The overlay is laid out on a 1080p frame, as the recording compositor does, then drawn in percentages.
const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;

export const overlayOf = (settings: Settings): CameraOverlay => ({
  position: settings.cameraPosition,
  size: settings.cameraSize,
  shape: settings.cameraShape,
  zoom: settings.cameraZoom,
  mirror: settings.cameraMirror,
});

/** Where the overlay sits in a 16:9 frame, as CSS percentages, plus its outline. */
export function overlayStyle(overlay: CameraOverlay): React.CSSProperties {
  const box = overlayBox(overlay, FRAME_WIDTH, FRAME_HEIGHT);
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  return {
    left: pct(box.x, FRAME_WIDTH),
    top: pct(box.y, FRAME_HEIGHT),
    width: pct(box.width, FRAME_WIDTH),
    height: pct(box.height, FRAME_HEIGHT),
    borderRadius: overlay.shape === 'circle' ? '9999px' : undefined,
    clipPath: overlay.shape === 'squircle' ? SQUIRCLE_CLIP_PATH : undefined,
  };
}

/**
 * Position, size, shape, zoom and mirror for the camera overlay, as segmented buttons
 * with small glyphs. Changes save straight away. `idPrefix` keeps ids unique when the
 * preview's copy is open over the settings page; `compact` suits its narrow side panel.
 */
export function CameraOverlayControls({
  settings,
  idPrefix = '',
  compact = false,
}: {
  settings: Settings;
  idPrefix?: string;
  compact?: boolean;
}) {
  return (
    <div className="space-y-5">
      <Field label="Position">
        <GlyphButtons<CameraPosition>
          label="Position"
          columns={compact ? 2 : 4}
          value={settings.cameraPosition}
          onChange={(cameraPosition) => updateSettings({ cameraPosition })}
          options={CAMERA_POSITIONS.map((position) => ({
            value: position,
            label: POSITION_LABELS[position],
            glyph: <PositionGlyph position={position} />,
          }))}
        />
      </Field>
      <Field label="Size">
          <GlyphButtons<CameraSize>
            label="Size"
            value={settings.cameraSize}
            onChange={(cameraSize) => updateSettings({ cameraSize })}
            options={CAMERA_SIZES.map((size) => ({
              value: size,
              label: SIZE_LABELS[size],
              glyph: <SizeGlyph size={size} />,
            }))}
          />
        </Field>
        <Field label="Shape">
          <GlyphButtons<CameraShape>
            label="Shape"
            value={settings.cameraShape}
            onChange={(cameraShape) => updateSettings({ cameraShape })}
            options={CAMERA_SHAPES.map((shape) => ({
              value: shape,
              label: SHAPE_LABELS[shape],
              glyph: <ShapeGlyph shape={shape} />,
            }))}
          />
        </Field>
      <div className={cn('grid gap-5', !compact && 'sm:grid-cols-2 sm:items-start')}>
        <ZoomField
          id={`${idPrefix}zoom`}
          value={settings.cameraZoom}
          onChange={(cameraZoom) => updateSettings({ cameraZoom })}
        />
        <SwitchField
          id={`${idPrefix}mirror`}
          label="Mirror camera image"
          description="Shows you as you'd see yourself in a mirror."
          checked={settings.cameraMirror}
          onChange={(cameraMirror) => updateSettings({ cameraMirror })}
        />
      </div>
    </div>
  );
}

/** A row of joined single-choice buttons, each with a small glyph before its label. */
function GlyphButtons<T extends string>({
  label,
  value,
  onChange,
  options,
  columns = options.length,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; glyph: React.ReactNode }[];
  columns?: number;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="outline"
      value={[value]}
      // Single-select: clicking the chosen button again would empty the group, so ignore that.
      onValueChange={(next) => next[0] && onChange(next[0] as T)}
      className="grid w-full gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="text-muted-foreground data-pressed:border-primary data-pressed:bg-primary/5 data-pressed:text-foreground data-pressed:ring-primary h-9 min-w-0 gap-1.5 px-2 data-pressed:ring-1"
        >
          {option.glyph}
          <span className="truncate">{option.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** A tiny screen outline with the camera in one corner. */
function PositionGlyph({ position }: { position: CameraPosition }) {
  return (
    <span className="relative block h-3.5 w-5 shrink-0 rounded-[2px] border border-current opacity-80">
      <span
        className={cn(
          'absolute size-1 rounded-[1px] bg-current',
          position.startsWith('top') ? 'top-px' : 'bottom-px',
          position.endsWith('left') ? 'left-px' : 'right-px',
        )}
      />
    </span>
  );
}

const SIZE_GLYPH: Record<CameraSize, string> = { small: 'size-1.5', medium: 'size-2', large: 'size-2.5' };

/** A tiny screen outline with the camera drawn at that size. */
function SizeGlyph({ size }: { size: CameraSize }) {
  return (
    <span className="relative block h-3.5 w-5 shrink-0 rounded-[2px] border border-current opacity-80">
      <span className={cn('absolute right-px bottom-px rounded-[1px] bg-current', SIZE_GLYPH[size])} />
    </span>
  );
}

function ShapeGlyph({ shape }: { shape: CameraShape }) {
  return (
    <span
      className={cn('block shrink-0 bg-current opacity-80', shape === 'default' ? 'h-2.5 w-[18px] rounded-[2px]' : 'size-3.5')}
      style={{
        borderRadius: shape === 'circle' ? '9999px' : undefined,
        clipPath: shape === 'squircle' ? SQUIRCLE_CLIP_PATH : undefined,
      }}
    />
  );
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
const ZOOM_MARKS = [1, 1.25, 1.5, 1.75, 2];
// Steps of 0.1 drift in floating point (1.2000000000000002), so round to one place.
const roundZoom = (n: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n * 10) / 10));

function ZoomField({ id, value, onChange }: { id: string; value: number; onChange: (zoom: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>Zoom</Label>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground rounded-sm px-1 text-sm tabular-nums disabled:pointer-events-none"
          onClick={() => onChange(ZOOM_MIN)}
          disabled={value === ZOOM_MIN}
          title="Reset to 1×"
        >
          {value.toFixed(1)}×
        </button>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Zoom out"
          disabled={value <= ZOOM_MIN}
          onClick={() => onChange(roundZoom(value - ZOOM_STEP))}
        >
          <Minus />
        </Button>
        <div className="flex-1 space-y-1.5">
          <Slider
            id={id}
            aria-label="Camera zoom"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={ZOOM_STEP}
            value={value}
            onValueChange={(v) => onChange(roundZoom(typeof v === 'number' ? v : v[0]!))}
          />
          <div className="text-muted-foreground flex justify-between text-[10px] tabular-nums">
            {ZOOM_MARKS.map((mark) => (
              <span key={mark}>{mark}×</span>
            ))}
          </div>
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Zoom in"
          disabled={value >= ZOOM_MAX}
          onClick={() => onChange(roundZoom(value + ZOOM_STEP))}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}
