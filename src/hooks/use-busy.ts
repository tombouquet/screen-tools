import { useSyncExternalStore } from 'react';

// Whether a recording is in progress, so the layout can lock navigation meanwhile.
let busy = false;
const listeners = new Set<() => void>();

export function setBusy(next: boolean): void {
  if (busy === next) return;
  busy = next;
  listeners.forEach((l) => l());
}

export function useBusy(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => busy,
  );
}
