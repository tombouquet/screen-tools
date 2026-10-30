# Screen Tools

Chrome extension that records your screen, a window, a tab or your camera, with microphone and system audio, and takes annotated screenshots. Free, no sign-up, no watermark, and nothing leaves your computer.

The recorder is a rebuild of the [Screen Recorder](https://chromewebstore.google.com/detail/screen-recorder/hniebljpgcogalllopnjokppmgbhaden) extension with the same features and a [shadcn/ui](https://ui.shadcn.com) design. See [docs/parity.md](docs/parity.md) for what matches the original and what's different.

- **Toolbar popup:** one click to start recording the screen, the camera or both, or to take a screenshot.
- **Screenshots:** capture a selected area, the visible area or the full page. Each opens in an editor with arrows, rectangles, ellipses, pen, highlighter, text, pixelate and crop, with undo. Download as PNG or JPG, or copy to the clipboard. Saved at native resolution by default, or capped at 2560, 1920 or 1280 px wide in Settings. The latest 10 are kept. Full page scrolls the window, so pages that scroll an inner panel (Gmail and many web apps) capture only what's visible. Chrome blocks screenshots of its own pages and the Web Store.
- **Capture:** only screen (whole screen, a window or a Chrome tab), only camera, or screen with a camera overlay.
- **Audio:** none, microphone, system audio, or both mixed.
- **Camera overlay:** pick the corner, size, shape (squircle by default, rectangle or circle), zoom and mirroring.
- **Autosave:** recordings are written to disk every 5 seconds while you record, and the latest 5 are kept, so a crash or closed window loses at most a few seconds.
- **Formats:** MP4 by default, or WebM, at 15, 24, 30 (default) or 60 fps, with the screen captured at native size (default), 4K, 1440p, 1080p, 720p or 480p.
- **Player:** skip back and forward, and drop in any video file to play it or make an old WebM recording seekable.
- **Save options:** pick a file name and a size when you save: the original, or a smaller copy from presets that show the estimated file size up front. Suggested when a video is over 25 MB. Compression runs on your computer and the original is kept. Turn the dialog off to save straight away.
- **Light and dark themes.**

## Install

1. Download `screen-tools-vX.Y.Z.zip` from the [latest release](https://github.com/tombouquet/screen-tools/releases/latest) and unzip it into a folder you'll keep.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the folder.

Click the toolbar icon to start a recording or take a screenshot. The changelog opens in a new tab after installing.

## Updating

Chrome doesn't update unpacked extensions on its own, so the extension checks the latest GitHub release every hour and when you open the recorder. When a newer version is out you get a `↑` badge on the toolbar icon, one desktop notification, and a banner in the recorder. To update:

1. Download the new zip from the release and unzip it over your current folder.
2. Click **Reload extension** in the banner, or the reload button on `chrome://extensions`.

The changelog opens after every version change. You can also open it from the version number next to the title.

## Development

Needs Node 26+ and pnpm.

```sh
pnpm install
pnpm dev       # opens Chrome with the extension loaded and hot reload
pnpm compile   # typecheck
pnpm build     # production build in .output/chrome-mv3
pnpm zip       # zipped build in .output/
```

To try a production build, load `.output/chrome-mv3` with **Load unpacked**. `node scripts/make-icons.mjs` redraws the icons in `public/icon/`.

Built with [WXT](https://wxt.dev), React, TypeScript, Tailwind CSS v4 and shadcn/ui.

## Releasing

Releases are cut by [Release Please](https://github.com/googleapis/release-please) from [Conventional Commits](https://www.conventionalcommits.org/) on `main`. Don't bump the version by hand.

1. Merge `feat:` / `fix:` PRs into `main`. Release Please keeps a "chore(main): release x.y.z" PR open that bumps `package.json` (WXT copies it into the manifest) and adds the new `CHANGELOG.md` section. `feat` bumps the minor version and `fix` the patch.
2. Merge that PR when you want to ship. It tags `vX.Y.Z`, creates the GitHub release with the changelog as its notes, then builds the extension and attaches `screen-tools-vX.Y.Z.zip`. Installed copies see the update at their next check.

The first release will be v1.0.0.
