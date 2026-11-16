# Android download

The `/app` page serves an Android package. By default the server **mirrors** the build shared
from Google Drive (`ARIA_APK_ID`, default `1SGc2Cz7QMnWHHnlejpMcuOANEJzT7VwJ`) into
`<ARIA_DATA_DIR>/apk-cache/aria.apk` on first request and serves it from there — so the download
button works without any binary in this repo.

Prefer a local file? Put it here as `aria.apk` (a local file always wins) or point
`ARIA_APK_FILE` at it. `ARIA_APK_MIRROR=off` disables the Drive mirror.

- Drop the signed build here as **`aria.apk`** and it appears on `/app` as a working download
  (`/downloads/aria.apk`, counted, with size and SHA-256 read from the file).
- Put a different file elsewhere and point **`ARIA_APK_FILE`** at it instead.
- Optional overrides: **`ARIA_APK_VERSION`**, **`ARIA_APK_NOTES`**, **`ARIA_APK_SHA256`**
  (set this last one when the file lives on a read-only disk).

While no file is present, `/app` shows the Add to Home Screen path instead, so the page is never a
dead end. Build the package with PWABuilder — see `PLAYSTORE.md` for the exact steps.
