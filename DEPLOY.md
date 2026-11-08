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
4. Open **Project Settings → API** and copy two values:
   - **Project URL** — `https://<project-ref>.supabase.co`
   - **service_role** secret key (under *Project API keys*, click reveal)

> **Never** use the `anon` key here, and never put the service role key in the
> frontend. It bypasses RLS by design and is only safe on the server.

The schema also works on any plain Postgres (Neon, RDS, a VPS) if you point
`SUPABASE_URL` at a PostgREST/Supabase-compatible endpoint later.

## Step 2 — Deploy on Render

### Blueprint (fastest)

1. Push this repo to GitHub.
2. Render → **New → Blueprint** → pick the repository → **Apply**.
3. When prompted for the two `sync: false` variables, paste the **Project URL**
   and the **service_role** key from step 1.
4. Deploy. First boot creates the demo team `ARIA-123` and its six songs.

### Manual web service

| Setting | Value |
| --- | --- |
| Environment | Node |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| `ARIA_STORAGE` | `supabase` |
| `SUPABASE_URL` | your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | your service role key |

Render provides `PORT`; the server reads it and binds `0.0.0.0`. Because the
build output is served by the same process, app routes like `/lineups` and
`/s/<token>` work on a hard refresh.

## Step 3 — Confirm it is actually using Supabase

Open the Render **Logs** tab. On boot you should see:

```
[aria] storage: supabase → https://<project-ref>.supabase.co
Aria API listening on http://0.0.0.0:10000
Store: https://<project-ref>.supabase.co (Postgres via service role)
```

If you instead see `[aria] storage: file → …`, the two Supabase variables are
missing (or spelled differently) and the app is writing to a throwaway file.

Then prove persistence end to end:

1. Open the site, enter a name, join team `ARIA-123`.
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
npm run test:supabase
```

This starts a **real Postgres** (PGlite, compiled to WASM, in-process), applies
`supabase/schema.sql` exactly as you would paste it, then boots the actual API
with the Supabase driver and checks 30 assertions: seeding only on an empty
store, rows landing in Postgres, jsonb parts, the LRU clock being stamped on
share, never-used lineups outranking recently-used ones, and data reloading
intact from a fresh store. It needs no Supabase account and no network.

## Local development

```bash
npm run dev          # file driver, data in server/data.json
```

To develop against your real Supabase project, export the two variables and use
`ARIA_STORAGE=supabase` — but prefer a **second, empty Supabase project** for
this, since `npm run dev` writes to whatever database it is pointed at.

## Notes and limits

- **Free Render instances sleep** after inactivity; the first request afterwards
  takes a few seconds. Supabase free projects also pause after long inactivity —
  both wake up on the next request.
- **Chattiness**: every save rewrites the touched tables. Fine at this scale; if
  you grow past a few thousand songs, switch `persist()` to per-record upserts.
- **Security model**: there is no login. A visitor's identity is a name kept in
  `localStorage`, and team codes are the only access control. RLS is on with no
  policies, so the anon key can read nothing — but a share link is public by
  design for anyone holding the token. Do not store sensitive material.
- **Backups** are Supabase's job now: use **Database → Backups** in the
  dashboard, or `pg_dump` with the connection string from **Project Settings →
  Database**.
- **Migrations**: `schema.sql` is additive and idempotent. When you change a
  column later, add a new numbered file (`supabase/002_....sql`) rather than
  editing the original, so both your project and fresh installs converge.
