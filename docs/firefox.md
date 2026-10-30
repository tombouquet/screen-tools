# Firefox

The Firefox build (`pnpm build:firefox`, Firefox 140+) has the same pages and features, with these differences:

- No system or tab audio: Firefox's screen picker can't share audio, so the System + Mic. and System options are hidden and a stored choice that includes system audio falls back to microphone or none.
- Screen picked through the standard `getDisplayMedia` picker, which offers whole screens and windows only, no tabs.
- Recording from the toolbar menu opens the recorder with the source already picked and waits for a click on Start recording. Firefox only opens the screen picker from a click in the page, so it can't start straight away like Chrome does. The countdown runs after you pick what to share.
- MP4 is the default where Firefox's `MediaRecorder` can record it; otherwise recordings are WebM and MP4 shows as not supported. Compression uses WebCodecs (Firefox 130+); the minimum is 140, the first version that reads the data collection consent AMO requires.
- Screenshots work the same way (selected area, visible area, full page, from the toolbar menu's `activeTab` grant). Firefox blocks them on its own pages (`about:` pages, addons.mozilla.org, reader view) and some others, and shows a notification saying so.
- Settings open in a tab from the add-on's Options in `about:addons` (`options_ui` with `open_in_tab`), since Firefox ignores `options_page`.
- Permissions: the Chrome set minus `desktopCapture`, which Firefox doesn't have.
