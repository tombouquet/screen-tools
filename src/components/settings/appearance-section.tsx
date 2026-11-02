import { Monitor, Moon, Palette, Sun } from 'lucide-react';
import { ChoiceTiles } from '@/components/choice-tiles';
import { useTheme } from '@/components/theme-provider';
import { SectionHeader, SettingGroup } from '@/components/settings/layout';
import type { Theme } from '@/lib/settings';

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="space-y-6">
      <SectionHeader icon={Palette} title="Appearance" description="How Screen Tools looks." />
      <SettingGroup title="Theme">
        <ChoiceTiles<Theme>
          label="Theme"
          value={theme}
          onChange={setTheme}
          choices={[
            { value: 'light', label: 'Light', icons: [Sun], visual: <ThemeSwatch light /> },
            { value: 'dark', label: 'Dark', icons: [Moon], visual: <ThemeSwatch /> },
            { value: 'system', label: 'System', icons: [Monitor], visual: <ThemeSwatch split />, description: 'Matches your computer' },
          ]}
        />
      </SettingGroup>
    </div>
  );
}

/** A tiny window in the light or dark palette; `split` shows half of each. */
function ThemeSwatch({ light, split }: { light?: boolean; split?: boolean }) {
  const window = (isLight: boolean) => (
    <span className={`flex h-full flex-col gap-[8%] p-[8%] ${isLight ? 'bg-white' : 'bg-neutral-900'}`}>
      <span className={`h-[14%] w-1/2 rounded-full ${isLight ? 'bg-neutral-800' : 'bg-neutral-100'}`} />
      <span className={`h-[10%] w-3/4 rounded-full ${isLight ? 'bg-neutral-300' : 'bg-neutral-600'}`} />
      <span className={`h-[10%] w-2/3 rounded-full ${isLight ? 'bg-neutral-300' : 'bg-neutral-600'}`} />
      <span className="mt-auto h-[18%] w-1/3 self-end rounded bg-red-500" />
    </span>
  );
  return (
    <span className="relative block aspect-video w-full overflow-hidden rounded-md border shadow-sm">
      {split ? (
        <span className="grid h-full grid-cols-2">
          <span className="overflow-hidden">{window(true)}</span>
          <span className="overflow-hidden">{window(false)}</span>
        </span>
      ) : (
        window(Boolean(light))
      )}
    </span>
  );
}
