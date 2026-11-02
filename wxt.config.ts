import tailwindcss from '@tailwindcss/vite';
import { existsSync } from 'node:fs';
import { defineConfig } from 'wxt';

// WXT hands .env files to the app code but not to this config, so read .env.local here
// for WXT_EXTENSION_KEY. A variable already set in the shell wins.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const name = 'Screen Tools';
const description =
  'Record your screen, a window, a tab or your camera, and take annotated screenshots. Free, no sign-up, no watermark.';
// Firefox's screen picker has no tabs.
const firefoxDescription =
  'Record your screen, a window or your camera, and take annotated screenshots. Free, no sign-up, no watermark.';
const optionsPage = 'app.html#/settings';

// Only asked for when someone connects an upload service in Settings. Required
// permissions would make the browser disable the extension on update until accepted.
const uploadPermissions = {
  optional_permissions: ['identity'],
  // Every connector's `hosts` (src/lib/connectors/google-drive.ts and dropbox.ts).
  // Keep in step: Connect can only request origins listed here.
  optional_host_permissions: [
    'https://www.googleapis.com/*',
    'https://oauth2.googleapis.com/*',
    'https://api.dropboxapi.com/*',
    'https://content.dropboxapi.com/*',
    // Upload servers are whatever URL someone types in Settings; only that server's
    // host is asked for, when it's added (src/lib/connectors/upload-server.ts).
    'http://*/*',
    'https://*/*',
  ],
};

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // WXT builds Firefox as MV2 by default, which has no chrome.action.
  manifestVersion: 3,
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) =>
    browser === 'firefox'
      ? {
          name,
          description: firefoxDescription,
          // Firefox has no desktopCapture; the recorder uses getDisplayMedia instead.
          permissions: ['storage', 'notifications', 'activeTab', 'scripting'],
          ...uploadPermissions,
          // Firefox only lets a page write to the clipboard without a click with this, so
          // it's asked for when "Copy screenshots to the clipboard" is turned on.
          optional_permissions: [...uploadPermissions.optional_permissions, 'clipboardWrite'],
          action: { default_title: name },
          // Firefox ignores options_page.
          options_ui: { page: optionsPage, open_in_tab: true },
          browser_specific_settings: {
            gecko: {
              id: 'screen-tools@pipelabs.com.au',
              // 140 is the first with data_collection_permissions (and the current ESR). It also covers WebCodecs for compression (130).
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {
          name,
          description,
          minimum_chrome_version: '116',
          permissions: ['desktopCapture', 'storage', 'notifications', 'activeTab', 'scripting'],
          ...uploadPermissions,
          action: { default_title: name },
          options_page: optionsPage,
          // The store listing's public key, so unpacked dev builds get the same extension ID
          // (and so the same OAuth redirect URL) as the published one.
          ...(process.env.WXT_EXTENSION_KEY ? { key: process.env.WXT_EXTENSION_KEY } : {}),
        },
});
