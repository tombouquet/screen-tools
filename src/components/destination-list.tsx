import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { Connector, ConnectorId } from '@/lib/connectors/types';
import { cn } from '@/lib/utils';

/** Where to save or upload to, as a list with one row per destination, like the Uploads settings. */
export function DestinationList({
  label,
  destinations,
  value,
  onChange,
  disabled,
}: {
  label: string;
  destinations: Pick<Connector, 'id' | 'name' | 'description' | 'icon'>[];
  value: ConnectorId;
  onChange: (id: ConnectorId) => void;
  disabled?: boolean;
}) {
  return (
    <RadioGroup
      aria-label={label}
      value={value}
      onValueChange={(next) => onChange(next as ConnectorId)}
      disabled={disabled}
      className="gap-0 divide-y overflow-hidden rounded-lg border"
    >
      {destinations.map((d) => {
        const selected = d.id === value;
        return (
          <label
            key={d.id}
            className={cn(
              'flex cursor-pointer items-center gap-3 p-3 transition-colors',
              selected ? 'bg-primary/5' : 'hover:bg-muted/50',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <RadioGroupItem value={d.id} />
            <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
              <d.icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1 space-y-0.5">
              <span className="block text-sm font-medium">{d.name}</span>
              <span className="text-muted-foreground block text-xs">{d.description}</span>
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
