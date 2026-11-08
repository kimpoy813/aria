# Google Play Store Setup Guide for Aria

Phase 2 (app-side & server-side Play Store readiness) is already built into this repository. Below are the exact URLs, icons, and environment variables ready for **PWABuilder** and **Google Play Console**.

---

## 1. Ready-Made Files & URLs in Aria

Once Aria is deployed over HTTPS (for example `https://your-aria.onrender.com`):

| Play Console / PWABuilder Field | Value in Aria |
| :--- | :--- |
| **Web App Manifest** | `https://<your-domain>/manifest.webmanifest` |
| **Service Worker** | `https://<your-domain>/sw.js` |
| **Privacy Policy URL** | `https://<your-domain>/privacy` |
| **Account Deletion Instructions URL** | `https://<your-domain>/privacy#account-deletion` |
| **Digital Asset Links** | `https://<your-domain>/.well-known/assetlinks.json` |
| **512×512 Store Listing App Icon** | `public/icons/playstore-icon-512.png` |
| **In-App Account Deletion** | **Sign in → Top-right Avatar → Delete account** (`/delete-account`) |

---

## 2. Package Aria into an `.aab` (PWABuilder)

1. Deploy the latest `main` branch to your HTTPS domain.
2. Open **[pwabuilder.com](https://www.pwabuilder.com/)**, enter `https://<your-domain>`, and click **Start**.
3. Click **Package for stores → Android → Generate Package**:
   - **Package ID**: `app.aria.lineups` *(or your preferred reverse-domain ID, e.g. `com.kimpoy813.aria`)*
   - **App name / Short name**: `Aria`
   - **Signing key**: Choose **New** and download the `.zip`.
4. Save **`signing.keystore`** and **`signing-key-info.txt`** somewhere safe — you will need them for every future update.

---

## 3. Enable Full-Screen Mode (Remove Browser Bar)

In your Render dashboard (**Environment** tab), set these two environment variables — no code edits needed:

- `ANDROID_PACKAGE_NAME`: Your Android package ID (e.g. `app.aria.lineups`)
- `ANDROID_SHA256_FINGERPRINTS`: Comma-separated SHA-256 certificate fingerprints:
  1. The SHA-256 fingerprint inside PWABuilder's `assetlinks.json`
  2. Google Play's **App signing key certificate SHA-256** (found in **Play Console → Setup → App signing** after you upload your first `.aab`)

Example:
```text
AA:BB:CC:...:99, 11:22:33:...:FF
```

Verify at `https://<your-domain>/.well-known/assetlinks.json`.

---

## 4. Play Console Declarations Cheat Sheet

- **Privacy policy**: `https://<your-domain>/privacy`
- **App access**: Choose *"All or some functionality is restricted"* and create one test account (email + password) for the Google reviewer.
- **Ads**: *No, my app does not contain ads.*
- **Target audience**: `13–15`, `16–17`, `18 and over`.
- **Data safety**:
  - **Personal info**: Name, Email address *(Collected, App functionality & Account management, Not shared with third parties)*
  - **App activity / User content**: Songs, lyrics, lineups *(Collected, App functionality)*
  - **Encrypted in transit**: *Yes*
  - **Account deletion URL**: `https://<your-domain>/privacy#account-deletion` *(in-app deletion is inside **Account → Delete account** once signed in)*
