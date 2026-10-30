import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

const name = 'Screen Tools';
const description =
  'Record your screen, a window, a tab or your camera, and take annotated screenshots. Free, no sign-up, no watermark.';
// Firefox's screen picker has no tabs.
const firefoxDescription =
  'Record your screen, a window or your camera, and take annotated screenshots. Free, no sign-up, no watermark.';
const optionsPage = 'app.html#/settings';

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
          action: { default_title: name },
          options_page: optionsPage,
        },
});
