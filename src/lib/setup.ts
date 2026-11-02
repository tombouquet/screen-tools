// First-run checklist progress on the Settings page: which checks the user has done.
// Kept apart from Settings, since it records what happened rather than a preference.
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'setup';
const CHANGE_EVENT = 'setup-change';

export interface SetupProgress {
  /** The camera showed a picture in the camera preview. */
  cameraChecked: boolean;
  /** The microphone test picked up sound. */
  micChecked: boolean;
}

const EMPTY: SetupProgress = { cameraChecked: false, micChecked: false };
let cache: SetupProgress | undefined;

function read(): SetupProgress {
  if (!cache) {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      cache = { cameraChecked: raw.cameraChecked === true, micChecked: raw.micChecked === true };
    } catch {
      cache = { ...EMPTY };
    }
  }
  return cache;
}

export function markSetup(patch: Partial<SetupProgress>): void {
  const current = read();
  if (Object.entries(patch).every(([k, v]) => current[k as keyof SetupProgress] === v)) return;
  cache = { ...current, ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cache = undefined;
    listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useSetup(): SetupProgress {
  return useSyncExternalStore(subscribe, read);
}
