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
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
