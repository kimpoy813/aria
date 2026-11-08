# Deploying Aria on Render + Supabase

Two services, one job each:

```
phone / browser
      │
      ▼
Render  ── aria (Node) ── serves the React build + /api
      │
      ▼
Supabase ── Postgres ─── users, teams, songs, lineups
```

Render runs the app. Supabase stores the data, so nothing is lost when Render
redeploys or spins the free instance down. The browser never talks to Supabase
directly — the API holds the service role key and is the only gatekeeper, which
keeps team codes and ownership rules working exactly as they do locally.

---

## Step 1 — Create the Supabase database

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick a name, a
   strong database password, and the region closest to your Render region
   (Singapore in `render.yaml`).
2. Wait for provisioning, then open **SQL Editor → New query**.
3. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and press
   **Run**. It creates four tables, indexes, and turns on Row Level Security. It
   is idempotent, so running it twice is harmless.
4. Open **Project Settings → API** and copy three values:
   - **Project URL** — `https://<project-ref>.supabase.co`
   - **publishable / anon** key (`SUPABASE_ANON_KEY`, safe in the browser — used by Google sign-in)
   - **service_role** secret key (`SUPABASE_SERVICE_ROLE_KEY`, under *Project API keys*, click reveal)

> Never put the `service_role` key in the frontend. It bypasses RLS by design
> and is only safe on the server (`SUPABASE_SERVICE_ROLE_KEY`), while the
> `anon` / publishable key (`SUPABASE_ANON_KEY`) is safe for browser OAuth.

The schema also works on any plain Postgres (Neon, RDS, a VPS) if you point
`SUPABASE_URL` at a PostgREST/Supabase-compatible endpoint later.

## Step 1b — Turn on Google sign-in (Supabase Auth)

Email + password work as soon as Supabase is connected. Google needs a few
clicks in two consoles.

**In Google Cloud Console**
1. [console.cloud.google.com](https://console.cloud.google.com) → create or pick a project.
2. **APIs & Services → OAuth consent screen** → External → fill in the app name and
   your email → save. Add yourself under **Test users** while it stays in testing.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   → Application type **Web application**.
4. Under **Authorized redirect URIs** add exactly:
   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```
5. Copy the **Client ID** and **Client secret**.

**In Supabase**
1. **Authentication → Providers → Google** → enable it → paste the Client ID and
   secret → **Save**.
2. **Authentication → URL Configuration**:
   - **Site URL**: `https://<your-service>.onrender.com`
   - **Redirect URLs**, add both:
     ```
     https://<your-service>.onrender.com/
     https://<your-service>.onrender.com/reset
     http://localhost:5173/**
     ```
     (the last one is for `npm run dev`)

The app asks Google to redirect back to the site root for sign-in and to
`/reset` for password recovery, so those two must be allowed.

**Emailed password resets** use Supabase's built-in mailer. It is rate-limited and
fine for trying things out; for real traffic set **Authentication → Emails → SMTP
Settings** to your own provider so reset mail is reliable.

## Step 2 — Deploy on Render

### Blueprint (fastest)

1. Push this repo to GitHub.
2. Render → **New → Blueprint** → pick the repository → **Apply**.
3. When prompted for `SUPABASE_SERVICE_ROLE_KEY` (`sync: false`), paste the
   **service_role** key from step 1 (`SUPABASE_URL` and `SUPABASE_ANON_KEY`
   are pre-configured in `render.yaml` and can be overridden in the dashboard).
4. Deploy. Every new account starts with a clean personal library.

### Manual web service

| Setting | Value |
| --- | --- |
| Environment | Node |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| `ARIA_STORAGE` | `supabase` |
| `ARIA_AUTH` | `supabase` |
| `SUPABASE_URL` | your project URL |
| `SUPABASE_ANON_KEY` | your **anon** key (public, used by the browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | your **service role** key (server only) |

Render provides `PORT`; the server reads it and binds `0.0.0.0`. Because the
build output is served by the same process, app routes like `/lineups` and
`/s/<token>` work on a hard refresh.

## Step 3 — Confirm it is actually using Supabase

Open the Render **Logs** tab. On boot you should see:

```
[aria] storage: supabase → https://<project-ref>.supabase.co
[aria] auth: supabase → https://<project-ref>.supabase.co
Aria API listening on http://0.0.0.0:10000
Store: https://<project-ref>.supabase.co (Postgres via service role)
```

If you instead see `[aria] storage: file → …`, the two Supabase variables are
missing (or spelled differently) and the app is writing to a throwaway file.

Then prove persistence end to end:

1. Open the site and sign in with Google or create an account.
2. Add a song with a verse and a chorus, save it.
3. In Supabase → **Table Editor**, open `songs`: your row is there, with the
   parts visible inside the `parts` column as JSON.
4. In Render, **Manual Deploy → Deploy latest commit** (a full restart).
5. Reload the site: you are still signed in and the song is still there.

## How the storage layer chooses a driver

`server/storage.js` implements two drivers behind one interface:

| `ARIA_STORAGE` | Behaviour |
| --- | --- |
| *(unset)* | Supabase when `SUPABASE_URL` + a service key are present, otherwise file |
| `file` | JSON file at `ARIA_DATA_DIR/data.json` (default `server/data.json`) |
| `supabase` | Postgres through `@supabase/supabase-js` with the service role key |

The API keeps working against in-memory arrays and mirrors them to the driver
after each change (writes are debounced ~60 ms and serialised so two quick taps
cannot interleave). That is why every existing route behaves identically on both
drivers.

Persistence strategy: each save **upserts every row** and then **prunes rows that
no longer exist** in memory, so deletes propagate. Row counts here are tiny (a
handful of songs and lineups), so the simplicity is worth more than a bespoke
diff — and the smoke test below asserts the round trip.

## Verify before you deploy

```bash
npm run test:auth        # both auth drivers: register, login, reset, isolation
npm run test:supabase    # storage round trip against real Postgres
```

This starts a **real Postgres** (PGlite, compiled to WASM, in-process), applies
`supabase/schema.sql` exactly as you would paste it, then boots the actual API
with the Supabase driver and checks 30 assertions: seeding only on an empty
store, rows landing in Postgres, jsonb parts, the LRU clock being stamped on
share, never-used lineups outranking recently-used ones, and data reloading
intact from a fresh store. It needs no Supabase account and no network.

## Authentication

`server/auth.js` has two drivers behind one set of endpoints:

| `ARIA_AUTH` | Behaviour |
| --- | --- |
| *(unset)* | Supabase when `SUPABASE_URL` + a service key exist, otherwise demo |
| `supabase` | Supabase Auth: email + password, **Google**, emailed password resets |
| `demo` | Local accounts: scrypt-hashed passwords, session tokens, in-UI reset links |

Demo mode exists so the app runs with no cloud account. It deliberately has no
Google button — OAuth needs a provider — and instead of emailing a reset link it
shows the link once in the UI. Both drivers behave identically everywhere else.

Endpoints: `GET /api/auth/config`, `GET /api/auth/session`, `POST /api/auth/register`,
`POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/forgot`,
`POST /api/auth/reset`, `POST /api/auth/password`. Every other route requires
`Authorization: Bearer <token>`.

## Local development

```bash
npm run dev          # demo accounts + file storage, no Supabase needed
```

To use your real Supabase Auth locally, set `ARIA_AUTH=supabase` plus
`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` — and add
`http://localhost:5173/**` to the Supabase redirect URLs.

To develop against your real Supabase project, export the two variables and use
`ARIA_STORAGE=supabase` — but prefer a **second, empty Supabase project** for
this, since `npm run dev` writes to whatever database it is pointed at.

## Notes and limits

- **Free Render instances sleep** after inactivity; the first request afterwards
  takes a few seconds. Supabase free projects also pause after long inactivity —
  both wake up on the next request.
- **Chattiness**: every save rewrites the touched tables. Fine at this scale; if
  you grow past a few thousand songs, switch `persist()` to per-record upserts.
- **Accounts**: every request is identified by a verified token — Supabase's
  access token in production, an Aria session token in demo mode. The API never
  trusts an id from the request body, so one account cannot act as another.
  Team codes still gate team membership, and a share link is public by design for
  anyone holding the token.
- **RLS**: enabled with no policies, so the anon key cannot read the data tables
  directly. Only the server's service role key can — which is why it must never
  reach the browser.
- **Backups** are Supabase's job now: use **Database → Backups** in the
  dashboard, or `pg_dump` with the connection string from **Project Settings →
  Database**.
- **Migrations**: `schema.sql` is additive and idempotent. When you change a
  column later, add a new numbered file (`supabase/002_....sql`) rather than
  editing the original, so both your project and fresh installs converge.
