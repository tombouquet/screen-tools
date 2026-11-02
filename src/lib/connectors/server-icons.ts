// Icons people can pick for an upload server, so each one is easy to tell apart in lists.
import {
  Box,
  Briefcase,
  Building2,
  Cloud,
  Database,
  Folder,
  Globe,
  HardDrive,
  House,
  Rocket,
  Server,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export const SERVER_ICONS = {
  server: { label: 'Server', icon: Server },
  cloud: { label: 'Cloud', icon: Cloud },
  'hard-drive': { label: 'Drive', icon: HardDrive },
  database: { label: 'Database', icon: Database },
  folder: { label: 'Folder', icon: Folder },
  box: { label: 'Box', icon: Box },
  globe: { label: 'Globe', icon: Globe },
  building: { label: 'Office', icon: Building2 },
  house: { label: 'Home', icon: House },
  briefcase: { label: 'Work', icon: Briefcase },
  rocket: { label: 'Rocket', icon: Rocket },
  zap: { label: 'Bolt', icon: Zap },
} as const satisfies Record<string, { label: string; icon: LucideIcon }>;

export type ServerIconId = keyof typeof SERVER_ICONS;
export const DEFAULT_SERVER_ICON: ServerIconId = 'server';

export const isServerIcon = (id: unknown): id is ServerIconId => typeof id === 'string' && id in SERVER_ICONS;

/** The icon for a saved server; servers saved before icons existed get the default. */
export const serverIcon = (id: unknown): LucideIcon => SERVER_ICONS[isServerIcon(id) ? id : DEFAULT_SERVER_ICON].icon;
