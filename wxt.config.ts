import tailwindcss from '@tailwindcss/vite';
import { existsSync } from 'node:fs';
import { defineConfig } from 'wxt';

// WXT hands .env files to the app code but not to this config, so read .env.local here
// for WXT_EXTENSION_KEY. A variable already set in the shell wins.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Screen Tools',
    description:
      'Record your screen, a window, a tab or your camera, and take annotated screenshots. Free, no sign-up, no watermark.',
    minimum_chrome_version: '116',
    permissions: ['desktopCapture', 'storage', 'notifications', 'activeTab', 'scripting'],
    // Only asked for when someone connects an upload service in Settings. Required
    // permissions would make Chrome disable the extension on update until accepted.
    optional_permissions: ['identity'],
    // Every connector's `hosts` (src/lib/connectors/google-drive.ts and dropbox.ts).
    // Keep in step: Connect can only request origins listed here.
    optional_host_permissions: [
      'https://www.googleapis.com/*',
      'https://oauth2.googleapis.com/*',
      'https://api.dropboxapi.com/*',
      'https://content.dropboxapi.com/*',
    ],
    action: { default_title: 'Screen Tools' },
    options_page: 'app.html#/settings',
    // The store listing's public key, so unpacked dev builds get the same extension ID
    // (and so the same OAuth redirect URL) as the published one.
    ...(process.env.WXT_EXTENSION_KEY ? { key: process.env.WXT_EXTENSION_KEY } : {}),
  },
});
