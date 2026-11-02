// The Player opens a dropped-in file in the editor. A File can't go in the route, so it's
// handed over here, in memory: a reload of the editor loses it, like the Player does.
import { navigate } from '@/hooks/use-route';

let pending: File | undefined;

export function openFileInEditor(file: File): void {
  pending = file;
  navigate('/editor');
}

/** The file the Player last handed over, if any. */
export const pendingEditorFile = () => pending;
