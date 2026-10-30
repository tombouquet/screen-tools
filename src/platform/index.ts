// The browser this build is for. WXT sets the flag at build time, so each build
// only bundles its own implementation.
import { chromePlatform } from './chrome';
import { firefoxPlatform } from './firefox';
import type { Platform } from './types';

export type { Platform, PlatformCapabilities, ScreenCapture, ScreenCaptureProvider, Size } from './types';

export const platform: Platform = import.meta.env.FIREFOX ? firefoxPlatform : chromePlatform;
