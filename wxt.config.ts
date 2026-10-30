import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Screen Recorder',
    description:
      'Record your screen, a window, a tab or your camera. Free, no sign-up, no watermark, unlimited recordings.',
    minimum_chrome_version: '116',
    permissions: ['desktopCapture', 'storage', 'notifications', 'alarms', 'activeTab', 'scripting'],
    action: { default_title: 'Screen Recorder' },
    options_page: 'app.html#/settings',
  },
});
