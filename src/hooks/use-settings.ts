import { useSyncExternalStore } from 'react';
import { getSettings, subscribeSettings } from '@/lib/settings';

export function useSettings() {
  return useSyncExternalStore(subscribeSettings, getSettings);
}
