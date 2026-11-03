import { useEffect, useSyncExternalStore } from 'react';

// Whether the page on screen wants the full-width, full-height layout, like the
// screenshot editor and a single recording. A page asks for it with `useWideLayout`.
let wide = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Call in a page that fills the window; the layout goes back when it unmounts. */
export function useWideLayout(on = true): void {
  useEffect(() => {
    if (!on) return;
    wide++;
    notify();
    return () => {
      wide--;
      notify();
    };
  }, [on]);
}

export function useIsWide(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => wide > 0,
  );
}
