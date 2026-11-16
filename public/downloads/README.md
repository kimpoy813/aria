# Android download

The `/app` page serves an APK from this folder.

- Drop the signed build here as **`aria.apk`** and it appears on `/app` as a working download
  (`/downloads/aria.apk`, counted, with size and SHA-256 read from the file).
- Put a different file elsewhere and point **`ARIA_APK_FILE`** at it instead.
- Optional overrides: **`ARIA_APK_VERSION`**, **`ARIA_APK_NOTES`**, **`ARIA_APK_SHA256`**
  (set this last one when the file lives on a read-only disk).

While no file is present, `/app` shows the Add to Home Screen path instead, so the page is never a
dead end. Build the package with PWABuilder — see `PLAYSTORE.md` for the exact steps.
