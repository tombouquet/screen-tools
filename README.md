# Screen Tools

Chrome and Firefox extension that records your screen, a window, a tab or your camera, with microphone and system audio, and takes annotated screenshots. Free, no sign-up, no watermark. Nothing leaves your computer unless you connect Google Drive, Dropbox or your own upload server and upload a file. Tabs and system audio are Chrome only; see [Firefox](docs/firefox.md) for the other differences.

- **Help:** the question mark in the header opens Help, with an animated walk-through of each task and answers to common questions. Home shows the three steps to get started.
- **Toolbar popup:** one click to start recording the screen, the camera or both, or to take a screenshot. A Microphone switch turns the mic on or off for the next recording, and leaves system audio as it was.
- **Countdown and quick stop:** recording starts after a 3-second countdown, shown in the recorder and on the toolbar icon. While recording, the icon shows `REC`; click it to stop.
- **Screenshots:** capture a selected area, the visible area or the full page. Each opens in an editor with arrows, rectangles, ellipses, pen, highlighter, text, pixelate and crop, with undo. Download as PNG or JPG, or copy to the clipboard. Turn on **Copy screenshots to the clipboard** in Settings to have each new one copied as soon as it's taken, ready to paste. Saved at native resolution by default, or capped at 2560, 1920 or 1280 px wide in Settings. The latest 10 are kept. Full page scrolls the window; click the toolbar icon or press Esc to stop early and keep what's captured so far, and it stops by itself if you switch tabs. Click the icon or press Esc to cancel selecting an area. Pages that scroll an inner panel (Gmail and many web apps) capture only what's visible. Chrome blocks screenshots of its own pages and the Web Store.
- **Capture:** only screen (whole screen, a window or a Chrome tab), only camera, or screen with a camera overlay.
- **Audio:** none, microphone, system audio, or both mixed.
- **Camera overlay:** pick the corner, size, shape (squircle by default, rectangle or circle), zoom and mirroring.
- **Autosave:** recordings are written to disk every 5 seconds while you record, and the latest 5 are kept, so a crash or closed window loses at most a few seconds.
- **Formats:** MP4 by default, or WebM, at 15, 24, 30 (default) or 60 fps, with the screen captured at native size (default), 4K, 1440p, 1080p, 720p or 480p. Set in Settings; the New recording page only asks what to capture and which audio.
- **Save options:** pick a file name and a size when you save: the original, or a smaller copy from presets that show the estimated file size up front. Suggested when a video is over 25 MB. Compression runs on your computer and the original is kept. Turn the dialog off to save straight away.
- **Cloud uploads:** upload a recording or screenshot to Google Drive or Dropbox, and copy a share link in one click. Connect an account in Settings first. Share links are on by default and the choice is remembered. Files go to a Screen Tools folder in your Drive, or `Apps/Screen Tools` in your Dropbox, and the extension can't see anything else there.
- **Share link in one click:** **Share link** in the screenshot editor, or the link button on a screenshot in Screenshots, uploads it to the service you used last (or the first one connected) and copies the share link when it's done. With nothing connected, it points you to Settings.
- **Upload servers:** add your own server in Settings by URL, and uploads to it get a public link. Any server that hands out an upload URL and a link works; see [Upload servers](docs/guides/upload-servers.md) for what it needs.
- **Light and dark themes.**

## Privacy

Recordings, screenshots and settings stay in the extension's storage on your computer. There are no analytics and no servers of ours.

Uploads are optional. When you click **Connect** in Settings, Chrome asks you to allow access to that service's API sites (`googleapis.com` for Google Drive, `dropboxapi.com` for Dropbox). These are optional permissions: the extension doesn't ask for them at install, only for the service you connect. After that, files go straight from your browser to your own account, and only when you upload them. Adding an upload server asks for access to that server's host only. **Disconnect** deletes the stored sign-in and revokes it. See the [privacy policy](PRIVACY.md).

## Install

1. Download `screen-tools-vX.Y.Z.zip` from the [latest release](https://github.com/tombouquet/screen-tools/releases/latest) and unzip it into a folder you'll keep.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the folder.

Click the toolbar icon to start a recording or take a screenshot, and click it again to stop a recording. A home page with a quick start opens in a new tab after installing.

## Updating

Chrome doesn't update unpacked extensions on its own. To update, download the new zip from the [latest release](https://github.com/tombouquet/screen-tools/releases/latest), unzip it over your current folder, and click the reload button on `chrome://extensions`.

The home page opens after every version change. You can open it from the logo, Help from the question mark, and the full changelog, with what's new in each version, from the version number next to the title.

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

### Firefox

Needs Firefox 140 or later.

```sh
pnpm dev:firefox    # opens Firefox with the extension loaded and hot reload
pnpm build:firefox  # production build in .output/firefox-mv3
pnpm zip:firefox    # zipped build plus the sources zip addons.mozilla.org asks for, in .output/
```

To try a production build, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick `.output/firefox-mv3/manifest.json`. Firefox removes temporary add-ons when it closes.

The Chrome Web Store images are built from screenshots of the extension on made-up data: `pnpm screenshots` captures them and `pnpm showcase` composes the upload-ready images in `out/showcase/`. See [Listing screenshots](docs/guides/listing-screenshots.md) and [Listing image style](docs/reference/listing-image-style.md).

Uploads need OAuth apps for Google Drive and Dropbox, with their IDs in `.env.local`. A build without them works, with Connect turned off. See [Cloud connections](docs/guides/cloud-connections.md).

Built with [WXT](https://wxt.dev), React, TypeScript, Tailwind CSS v4 and shadcn/ui.

## Releasing

Releases are cut by [Release Please](https://github.com/googleapis/release-please) from [Conventional Commits](https://www.conventionalcommits.org/) on `main`. Don't bump the version by hand.

1. Merge `feat:` / `fix:` PRs into `main`. Release Please keeps a "chore(main): release x.y.z" PR open that bumps `package.json` (WXT copies it into the manifest) and adds the new `CHANGELOG.md` section. `feat` bumps the minor version and `fix` the patch.
2. Merge that PR when you want to ship. It tags `vX.Y.Z`, creates the GitHub release with the changelog as its notes, then builds the extension and attaches `screen-tools-vX.Y.Z.zip` (Chrome) and `screen-tools-vX.Y.Z-firefox.zip`. Installed copies update when their users download the new zip.

Keep **immutable releases** off in the repo settings. Release Please publishes the release before the zip is built, and GitHub rejects uploads to an immutable release, so the release ships without a zip. v1.0.0 hit this and has no zip; use v1.0.1 or later.
