import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

export interface Choice<T extends string> {
  value: T;
  label: string;
  /** Icons shown above the label. */
  icons?: LucideIcon[];
  /** A picture of the choice, shown above the label instead of icons. */
  visual?: ReactNode;
  /** A short line under the label. */
  description?: string;
  disabled?: boolean;
  hint?: string;
}

/** A row of large single-choice tiles, each with icons or a picture above a label. */
export function ChoiceTiles<T extends string>({
  label,
  value,
  onChange,
  choices,
  columns = choices.length,
  size = 'default',
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  choices: Choice<T>[];
  /** Tiles per row; defaults to all in one row. */
  columns?: number;
  size?: 'default' | 'sm';
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      // Single-select: clicking the chosen tile again would empty the group, so ignore that.
      onValueChange={(next) => next[0] && onChange(next[0] as T)}
      className={cn('grid w-full', size === 'sm' ? 'gap-2' : 'gap-3')}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {choices.map((choice) => (
        <ToggleGroupItem
          key={choice.value}
          value={choice.value}
          disabled={choice.disabled}
          title={choice.hint}
          className={cn(
            'h-auto min-w-0 flex-col rounded-lg! border font-medium whitespace-normal',
            size === 'sm' ? 'gap-1.5 p-2 text-xs' : 'gap-2 px-2 py-4 text-sm',
            choice.visual && size !== 'sm' && 'p-3',
            'data-pressed:border-primary data-pressed:bg-primary/5 data-pressed:ring-primary data-pressed:ring-1',
          )}
        >
          {choice.visual ?? (
            <span className="flex items-center gap-1 [&_svg]:size-6!">
              {choice.icons?.map((Icon, i) => (
                <Icon key={i} />
              ))}
            </span>
          )}
          <span>{choice.label}</span>
          {choice.description && (
            <span className="text-muted-foreground -mt-1 text-xs font-normal">{choice.description}</span>
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
