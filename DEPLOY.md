# Deploying Aria on Render

Aria is one Node service that serves **both** the API and the built React app on a single port, so
it needs exactly one Render web service — no separate static site, no CORS setup.

| Setting | Value |
| --- | --- |
| Environment | Node |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| Port | Render provides `PORT`; the server reads it and binds `0.0.0.0` |

The server picks up `dist/` automatically when it exists, sends `index.html` for app routes (so
`/lineups`, `/teams` and `/s/<token>` survive a refresh), and falls back to the JSON API under
`/api`.

---

## Option A — Blueprint (fastest)

`render.yaml` is already in the repo.

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**.
3. Pick the repository, confirm the `aria` service, click **Apply**.
4. Wait for the first build; your app is live at `https://<service-name>.onrender.com`.

## Option B — Manual web service

1. Render dashboard → **New → Web Service** → connect the repository.
2. Set **Build Command** to `npm ci && npm run build`.
3. Set **Start Command** to `npm start`.
4. Health check path: `/api/health`.
5. **Create Web Service**.

Either way, the first boot seeds the demo team `ARIA-123` with six songs and three lineups.

---

## Persistence — read this before sharing the link

Render's **free** instances have an **ephemeral filesystem**. Aria stores its data in a JSON file
(`server/data.json`) by default, so on a free instance:

- data survives while the instance runs,
- data is **lost on every deploy or restart**, and the store re-seeds to the demo state.

That is fine for a demo. To keep real teams, songs and lineups:

1. Upgrade the service to a paid plan (disks are not available on free).
2. Add a **disk**: mount path `/var/data`, any size (1 GB is plenty).
3. Add an environment variable `ARIA_DATA_DIR` = `/var/data`.
4. Redeploy.

In `render.yaml` those three lines are already written out — just uncomment the `ARIA_DATA_DIR`
env var and the `disk:` block. After that, the startup log confirms the location:

```
Aria API listening on http://0.0.0.0:10000
Store: /var/data/data.json
```

If you see `Store: /opt/render/project/src/server/data.json`, the disk is not wired up yet and data
will reset on the next deploy.

## Notes

- **Node version** is pinned with `.node-version` (22) and the `NODE_VERSION` env var in the
  blueprint, so Render matches what the app was built against.
- **Cold starts**: free instances sleep after inactivity; the first request afterwards takes a few
  seconds. The health check path keeps Render's own probes cheap.
- **Share links** are absolute URLs built from the page origin, so they work on the Render domain
  with no extra configuration.
- **Not handled**: there is no login system — a visitor's identity is a name stored in their
  browser's `localStorage`. Team codes are the only access control. That is fine for a small group,
  but do not treat team codes as secrets for sensitive material.
- **Backup**: with a disk attached, `data.json` is a single file you can copy off the disk at any
  time. Without one, expect a reset.
