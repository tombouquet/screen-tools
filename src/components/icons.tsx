import { createLucideIcon } from 'lucide-react';

/** A monitor with the camera bubble in its corner, like the overlay in a recording. */
export const MonitorCamera = createLucideIcon('monitor-camera', [
  ['rect', { width: '20', height: '14', x: '2', y: '3', rx: '2', key: 'screen' }],
  ['path', { d: 'M8 21h8', key: 'base' }],
  ['path', { d: 'M12 17v4', key: 'stand' }],
  ['circle', { cx: '16.5', cy: '11.5', r: '2.5', key: 'camera' }],
]);
