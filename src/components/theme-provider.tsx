import { useEffect, useSyncExternalStore } from 'react';
import { useSettings } from '@/hooks/use-settings';
import { updateSettings, type Theme } from '@/lib/settings';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const subscribeSystem = (listener: () => void) => {
  darkQuery.addEventListener('change', listener);
  return () => darkQuery.removeEventListener('change', listener);
};

export function useTheme() {
  const { theme } = useSettings();
  const systemDark = useSyncExternalStore(subscribeSystem, () => darkQuery.matches);
  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  return { theme, resolvedTheme, setTheme: (next: Theme) => updateSettings({ theme: next }) };
}

/** Puts the `dark` class on <html> to match the chosen theme. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);
  return children;
}
