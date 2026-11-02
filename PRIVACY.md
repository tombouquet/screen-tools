# Privacy policy

Screen Tools is a Chrome extension that records your screen and takes screenshots. This policy explains what it does with your data.

Last updated: 3 November 2026.

## Recordings and screenshots

Recordings, screenshots and settings are stored on your computer, in the extension's own browser storage. They are not sent anywhere unless you upload them.

## Google Drive and Dropbox

Uploading is optional. It only happens after you connect an account in Settings and choose to upload a file.

When you connect Google Drive or Dropbox:

- You sign in on Google's or Dropbox's own page. Screen Tools never sees your password.
- The extension receives an access token (and, for Dropbox, a refresh token) and keeps it in the browser's local extension storage on your computer. It also keeps your account name and email address, to show which account is connected.
- The extension uploads only the recordings and screenshots you choose to upload, straight from your browser to your own account.
- On Google Drive, it can only see and change files it created itself (the `drive.file` permission). Uploads go to a Screen Tools folder.
- On Dropbox, it can only use its own app folder, `Apps/Screen Tools`.
- It makes a file viewable by anyone with the link only when you ask for a share link.

Screen Tools does not read, list or download any other files in your Google Drive or Dropbox.

## Upload servers

You can also add an upload server of your own, or one run by your team, in Settings. When you upload to one:

- The file goes to the addresses that server gives, along with its name, type and size. That server's operator, not Screen Tools, decides how it's stored and who can see it.
- Every upload to an upload server gets a public link.
- The server's URL and any access token you enter are kept in the browser's local extension storage on your computer, and the token is only sent to that URL.
- **Remove** in Settings forgets the server and gives back its host permission. Files already uploaded stay on the server.

## Transcription

Transcribing a video is optional and happens on your computer:

- The speech model (OpenAI's Whisper, in the version published by the Hugging Face `onnx-community`) runs inside the browser. Your video and its sound are not sent anywhere.
- The first time you click **Transcribe**, the extension asks for access to `huggingface.co` and `hf.co` and downloads the model from there. This is an optional permission, asked for only then. Hugging Face sees a normal download from your browser, with your IP address, like any download; it doesn't receive your video or audio.
- The model is kept in the extension's browser storage on your computer, so later transcriptions don't download it again and work offline.
- A recording's transcript is stored with the recording in the extension's storage and deleted with it. A transcript of a video opened in the player is only kept while that page is open.
- **Delete downloaded model** in Settings → Transcription removes the model and gives back the Hugging Face permission.

## What we don't do

- No analytics, tracking or advertising.
- No servers of ours. Your files and tokens go only between your browser and Google, Dropbox or an upload server you added.
- No online speech recognition. Transcripts are made on your computer.
- We don't sell, share or transfer your data to anyone.

## Disconnecting

Click **Disconnect** next to the account in Screen Tools Settings. This deletes the stored tokens from your computer and asks the service to revoke them.

You can also remove access from the service's side at any time:

- Google: [Third-party apps and services](https://myaccount.google.com/connections) in your Google Account.
- Dropbox: [Connected apps](https://www.dropbox.com/account/connected_apps) in your Dropbox settings.

Files you've already uploaded stay in your account until you delete them there.

## Google API Services

Screen Tools' use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## Contact

Questions about this policy: [open an issue on GitHub](https://github.com/tombouquet/screen-tools/issues).
