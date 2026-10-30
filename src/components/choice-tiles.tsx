import type { LucideIcon } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

export interface Choice<T extends string> {
  value: T;
  label: string;
  icons: LucideIcon[];
  disabled?: boolean;
  hint?: string;
}

/** A row of large single-choice tiles, each with icons above a label. */
export function ChoiceTiles<T extends string>({
  label,
  value,
  onChange,
  choices,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  choices: Choice<T>[];
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      // Single-select: clicking the chosen tile again would empty the group, so ignore that.
      onValueChange={(next) => next[0] && onChange(next[0] as T)}
      className="grid w-full gap-3"
      style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}
    >
      {choices.map((choice) => (
        <ToggleGroupItem
          key={choice.value}
          value={choice.value}
          disabled={choice.disabled}
          title={choice.hint}
          className={cn(
            'h-auto flex-col gap-2 rounded-lg! border px-2 py-4 text-sm font-medium',
            'data-pressed:border-primary data-pressed:bg-primary/5 data-pressed:ring-primary data-pressed:ring-1',
          )}
        >
          <span className="flex items-center gap-1 [&_svg]:size-6!">
            {choice.icons.map((Icon, i) => (
              <Icon key={i} />
            ))}
          </span>
          {choice.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
