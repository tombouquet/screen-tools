import type { ComponentType } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface SelectOption<T extends string = string> {
  label: string;
  value: T;
  disabled?: boolean;
  /** Shown before the label, in the list and in the closed select. */
  icon?: ComponentType<{ className?: string }>;
}

/**
 * The shadcn Base UI select pattern: one `items` array is handed to <Select> (so the
 * trigger shows the label) and mapped into the items inside a group.
 */
export function OptionSelect<T extends string>({
  id,
  items,
  value,
  onValueChange,
  placeholder,
  className,
}: {
  id?: string;
  items: SelectOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Select items={items} value={value} onValueChange={(next) => next !== null && onValueChange(next as T)}>
      <SelectTrigger id={id} className={cn('w-full', className)}>
        {items.some((item) => item.icon) ? (
          <SelectValue placeholder={placeholder}>
            {(selected: T | null) => {
              const item = items.find((i) => i.value === selected);
              return item ? <OptionLabel item={item} /> : placeholder;
            }}
          </SelectValue>
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
              <OptionLabel item={item} />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function OptionLabel({ item }: { item: SelectOption }) {
  const Icon = item.icon;
  return (
    <>
      {Icon && <Icon className="size-4 shrink-0" />}
      {item.label}
    </>
  );
}
