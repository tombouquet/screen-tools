import { ShieldAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { OptionSelect, type SelectOption } from '@/components/option-select';
import { Button } from '@/components/ui/button';
import { navigate } from '@/hooks/use-route';
import { cn } from '@/lib/utils';

/** The title and one-line summary at the top of a settings section. */
export function SectionHeader({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <header className="flex items-start gap-3">
      <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
        <Icon className="size-5" />
      </span>
      <div className="space-y-0.5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </header>
  );
}

/** A bordered group of related settings, with an optional heading. */
export function SettingGroup({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('bg-card space-y-5 rounded-xl border p-5', className)}>
      {(title || description) && (
        <div className="space-y-1">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          {description && <p className="text-muted-foreground text-xs">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

/** One setting: what it is and why you'd change it on the left, the control on the right. */
export function SettingRow({
  id,
  label,
  description,
  children,
}: {
  id?: string;
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_minmax(0,16rem)] sm:items-center sm:gap-6">
      <div className="space-y-1">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
      {children}
    </div>
  );
}

// The device selects use a stand-in value for "system default", stored as ''.
const DEFAULT_DEVICE = 'default-device';

export function DeviceSelect({
  id,
  devices,
  value,
  onChange,
}: {
  id: string;
  devices: MediaDeviceInfo[];
  value: string;
  onChange: (deviceId: string) => void;
}) {
  const items: SelectOption[] = [
    { value: DEFAULT_DEVICE, label: 'System default' },
    ...devices.map((device, i) => ({ value: device.deviceId, label: device.label || `Device ${i + 1}` })),
  ];
  return (
    <OptionSelect
      id={id}
      items={items}
      value={value || DEFAULT_DEVICE}
      onValueChange={(v) => onChange(v === DEFAULT_DEVICE ? '' : v)}
    />
  );
}

/** Shown on the camera and microphone sections while the browser hasn't allowed that device. */
export function AccessNotice({ device }: { device: 'camera' | 'microphone' }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <ShieldAlert className="size-5 shrink-0 text-amber-600" />
      <p className="min-w-48 flex-1">
        Screen Tools can't use your {device} yet. Allow access so you can preview and record it.
      </p>
      <Button size="sm" variant="outline" onClick={() => navigate('/settings/get-started')}>
        Allow access
      </Button>
    </div>
  );
}
