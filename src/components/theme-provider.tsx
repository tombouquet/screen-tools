import { useLayoutEffect, useSyncExternalStore } from 'react';
import { useSettings } from '@/hooks/use-settings';
import { getSettings, updateSettings, type Theme } from '@/lib/settings';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const subscribeSystem = (listener: () => void) => {
  darkQuery.addEventListener('change', listener);
  return () => darkQuery.removeEventListener('change', listener);
};

const resolve = (theme: Theme, systemDark: boolean): 'light' | 'dark' =>
  theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

function applyTheme(resolved: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}

// Applied when this module loads, before React's first paint, so dark mode doesn't
// start light and fade over (buttons transition their colours).
applyTheme(resolve(getSettings().theme, darkQuery.matches));

export function useTheme() {
  const { theme } = useSettings();
  const systemDark = useSyncExternalStore(subscribeSystem, () => darkQuery.matches);
  const resolvedTheme = resolve(theme, systemDark);
  return { theme, resolvedTheme, setTheme: (next: Theme) => updateSettings({ theme: next }) };
}

/** Puts the `dark` class on <html> to match the chosen theme. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  useLayoutEffect(() => applyTheme(resolvedTheme), [resolvedTheme]);
  return children;
}
