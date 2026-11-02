# Upload servers

Screen Tools can upload recordings and screenshots to your own server, as long as the server can hand out an upload URL and a public link for each file. This guide is for whoever runs that server: it's everything the server has to do.

People add a server in **Settings → Connections → Add upload server**, with a name, the server's upload URL and, if the server wants one, an access token. After that it shows up as a destination in the save dialog and the screenshot upload dialog.

## How an upload works

Each upload is two requests:

1. Screen Tools asks your **upload URL** where to put the file.
2. It sends the file to the address your server answered with, then shows the public link.

Your server never has to receive the file itself. The address in step 2 can be your server, a storage bucket's pre-signed URL, or anywhere else that takes a `PUT`.

## Step 1: ask for an upload

```http
POST <upload URL>
Content-Type: application/json
Authorization: Bearer <access token>

{
  "filename": "Screen recording 2026-11-02 at 10.15.00.mp4",
  "contentType": "video/mp4",
  "size": 48213504
}
```

- `Authorization` is only sent when the user entered an access token.
- `filename` is the name the user picked, with its extension. It can contain spaces and non-ASCII characters.
- `contentType` is the file's media type: `video/mp4`, `video/webm`, `image/png` or `image/jpeg`.
- `size` is the file size in bytes.

Answer with `200` and JSON:

```json
{
  "uploadUrl": "https://storage.example.com/a1b2c3/recording.mp4?signature=…",
  "publicUrl": "https://files.example.com/a1b2c3/recording.mp4",
  "headers": { "x-example-header": "value" }
}
```

| Field | Required | What it is |
| --- | --- | --- |
| `uploadUrl` | Yes | Where Screen Tools sends the file in step 2. `http` or `https`. |
| `publicUrl` | Yes | The link people share. Anyone with it should be able to open the file once the upload finishes. |
| `headers` | No | Extra request headers for step 2, as string values. `Content-Type` is always sent, so leave it out. |

Any other fields are ignored.

### Errors

Send a JSON body with an `error` field to have your message shown to the user, for example `{ "error": "Uploads are limited to 2 GB." }`.

| Status | What Screen Tools does |
| --- | --- |
| `401`, `403` | Stops and asks the user to check the access token. |
| `413` | Stops and says the file is too big. |
| `429`, `5xx` | Tries again up to three times, waiting longer each time. |
| Any other `4xx` | Stops and shows the error. |

## Step 2: send the file

```http
PUT <uploadUrl>
Content-Type: <contentType from step 1>
<any headers from step 1>

<the file's bytes>
```

The file goes in one request, without the access token. Any `2xx` answer means the upload is done.

If the `PUT` fails with `403`, `408`, `429` or a `5xx`, or the connection drops, Screen Tools starts again from step 1 and asks for a new upload URL. Uploads aren't resumed partway through, so a retry sends the whole file again.

## Requirements

- **Upload URL reachable from the user's browser.** It can be on a private network or a VPN, as long as the user's computer can reach it. When the server is added, Screen Tools checks that it answers any request (a `HEAD` to the upload URL), and the browser asks the user to allow access to that host.
- **Cross-origin `PUT` allowed on `uploadUrl`.** Step 2 comes from the extension, not from a page on your site. If `uploadUrl` is on a different host from the upload URL, that host has to allow `PUT` with a `Content-Type` header (and any `headers` you send) from any origin, via CORS. Most storage buckets have a CORS setting for this. If `uploadUrl` is on the same host as the upload URL, nothing extra is needed.
- **`uploadUrl` valid long enough to start.** A few minutes is plenty: the `PUT` starts straight after step 1.
- **Large files.** Recordings can be several gigabytes. Make sure whatever sits behind `uploadUrl` accepts the sizes you expect, or answer step 1 with `413` and a message.
- **Unguessable public links.** Every upload gets a public link, and there's no switch to turn it off for upload servers. Put a long random ID in `publicUrl` so links can't be guessed.
- **HTTPS.** Use `https` for anything with an access token. Over `http`, the token and the file travel unencrypted.

## Try it with curl

These two requests are what Screen Tools sends, so a server that passes them will work:

```sh
curl -sS -X POST "$UPLOAD_URL" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"filename":"test.png","contentType":"image/png","size":1234}'

curl -sS -X PUT "<uploadUrl from the answer>" \
  -H 'Content-Type: image/png' \
  --data-binary @test.png
```

Then open the `publicUrl` from the first answer in a private window.
