# Firefox

The Firefox build (`pnpm build:firefox`, Firefox 140+) has the same pages and features, with these differences:

- No system or tab audio: Firefox's screen picker can't share audio, so the System + Mic. and System options are hidden and a stored choice that includes system audio falls back to microphone or none.
- Screen picked through the standard `getDisplayMedia` picker, which offers whole screens and windows only, no tabs.
- Recording from the toolbar menu opens the recorder with the source already picked and waits for a click on Start recording. Firefox only opens the screen picker from a click in the page, so it can't start straight away like Chrome does. The countdown runs after you pick what to share.
- MP4 is the default where Firefox's `MediaRecorder` can record it; otherwise recordings are WebM and MP4 shows as not supported. Compression uses WebCodecs (Firefox 130+); the minimum is 140, the first version that reads the data collection consent AMO requires.
- Screenshots work the same way (selected area, visible area, full page, from the toolbar menu's `activeTab` grant). Firefox blocks them on its own pages (`about:` pages, addons.mozilla.org, reader view) and some others, and shows a notification saying so.
- Copying without a click needs Firefox's `clipboardWrite` permission. It's optional: turning on **Copy screenshots to the clipboard** in Settings asks for it, and the setting stays off if you say no (or turns off if you take it away in `about:addons`). Chrome doesn't need it, as a focused page can write to the clipboard there.
- **Share link** copies the link when the upload ends. Without `clipboardWrite`, Firefox may refuse to copy that long after the click; the toast then has a **Copy link** button instead.
- Settings open in a tab from the add-on's Options in `about:addons` (`options_ui` with `open_in_tab`), since Firefox ignores `options_page`.
- Transcription runs on the processor (WebAssembly) only. Firefox's WebGPU is new and not on every system, so the graphics card path is turned off (`webGpuTranscription` in `src/platform/firefox.ts`) and transcribing is slower than in Chrome on a machine with a good graphics card. Everything else is the same: the model download asks for the Hugging Face hosts, the model is kept in the extension's Cache storage, and captions use a normal WebVTT track.
- Permissions: the Chrome set minus `desktopCapture`, which Firefox doesn't have, plus the optional `clipboardWrite` above.
