# Parity with the original extension

Reference: "Screen Recorder" by Erich Behrens (scre.io), v3.3.1, Chrome Web Store id `hniebljpgcogalllopnjokppmgbhaden`. Behaviour below was read from the published package; no code or assets were copied.

## Shell

| Original | This rebuild |
| --- | --- |
| Toolbar click opens an 800×690 popup window with the app | Toolbar click opens a menu: record screen, camera or both (opens a 960×780 window centred over the current Chrome window, or focuses the open one, and starts), or take a screenshot |
| Options page is the app's `#/settings` route | Same |
| Permissions: `desktopCapture` only | Adds `activeTab` and `scripting` for screenshots, plus `storage`, and `notifications` for screenshot errors |
| Settings in `localStorage` | Same |
| 51 languages | English only |

## Recorder (`#/`)

- Step 1, "What do you want to capture?": Only Screen, Only Camera, Screen + Camera.
- Step 2, "Record audio?": None, Microphone, System + Mic., System. System options need the screen.
- Start Recording, then Stop and Pause/Resume while recording; live preview of the composited output.
- After stopping: preview with Save (download) and New. New with an unsaved video warns "Do you want to save your video before proceeding?".
- Leaving the page while recording or with an unsaved video triggers the browser's unsaved-changes prompt.
- Screen picked through `chrome.desktopCapture.chooseDesktopMedia(["screen","window","tab","audio"])`.
- Mic and system audio mixed through one `AudioContext` destination.
- All video sources drawn onto a canvas at a fixed rate (original: 25 fps; here a setting, 15/24/30/60, default 30). The draw loop is driven by a silent `AudioContext` oscillator so it keeps running when the window is in the background, then captured with `canvas.captureStream()`.
- Camera overlay (Screen + Camera): position (four corners, 20 px margin), size (small 360, medium 480, large 640 px wide, 16:9), shape (default, circle, square), zoom 1–2×, mirror (default on). Camera only: camera fills the canvas at the camera's resolution.
- Missing camera, microphone or system audio show error notifications.

## Storage and autosave

- IndexedDB `videos` + `video_chunks` stores; the original writes a chunk every 10 s. This rebuild writes one every 5 s, so a crash loses at most 5 s.
- Keeps the latest 5 recordings; the oldest is deleted when a new one starts.

## Latest Videos (`#/videos/:id?`)

- Lists the latest 5 recordings by date; open one to play, Save or Delete (with confirmation).

## Player (`#/player`)

- Drag and drop (or click) a local video file to play it, make it seekable and save it.

## Settings (`#/settings`)

- Recording permission check for camera and microphone (granted, partial, denied, error).
- Video: preferred camera, camera resolution (1080p, 720p, 480p, 360p, 240p), optimise video (make seekable), camera position/size/shape/zoom/mirror.
- Audio: preferred microphone.

## Differences

- Original had paid "premium" overlay customisation and a watermark on Screen + Camera. Everything here is free with no watermark.
- Added: a 3-second countdown before recording starts (in the recorder and on the toolbar badge; Cancel stops it), and while recording the toolbar icon shows `REC` and a click on it stops the recording instead of opening the menu.
- Added: MP4 output, the default (H.264 + AAC; falls back to WebM where Chrome can't record MP4), light/dark/system theme, recording timer.
- Screen resolution setting (native default, 4K, 1440p, 1080p, 720p, 480p); the original always captured at native size.
- Camera overlay sizes are a share of the frame instead of fixed pixels, one step bigger than the original (at 1080p: small 480, medium 640, large 864 px wide), with a 24 px margin at 1080p. The square shape is a squircle, and is the default.
- Save dialog (a setting, on by default): file name plus size, either the original or a compressed copy at one of four presets (High quality 1080p, Balanced 720p, Small 720p, Smallest 480p), each with an estimated file size. Compression runs in the browser with Mediabunny and WebCodecs and the stored recording is never replaced. Videos over 25 MB get a notice that opens the dialog with a smaller size picked. The original always saved `screen-capture.webm` with no dialog; with the setting off this saves the original straight away with a dated name.
- Optimise video defaults to on (the original defaulted to off); writing the duration header is cheap.
- "Optimise" uses `fix-webm-duration` (writes the missing duration header) instead of `ts-ebml` cue rebuilding. Applies to WebM only; MP4 doesn't need it.
- Added: screenshots (selected area, visible area, full page) with an annotation editor and a list of the latest 10. Not in the original.
- Dropped: cookie consent banner and "Just updated" changelog modal (no analytics here).
