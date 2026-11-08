# Aria

A content-aware music recommender for building set lineups. Paste lyrics part by part, let the
NLP pass name the song's **class/message**, then drag those same parts into a sequence. Teams join
with a code and share songs and lineups. A **Least Recently Used** engine makes sure you do not keep
repeating the same lineup.

Mobile-first. White canvas with a calm green accent. Light and dark mode.
The logo (`src/components/Logo.tsx`, artwork in `public/logo.svg`) is a beamed double-note on a green
tile, used in the header, on the sign-in card, in onboarding and on the public share page. A single
`<Icon name="…">` set (`src/components/Icon.tsx`) draws every icon in the app on one 24-unit grid with
one stroke weight.

---

## The three parts

### 1. Song details + NLP class/message

`Songs → + Add a song`

- Title, artist, and **lyrics added one part at a time** — Verse, Chorus, Bridge, Pre-Chorus,
  Intro, Outro, Refrain, or Other. Each part gets its own label and can be reordered or duplicated.
- **Generate class & message** runs the NLP pass on the finished lyrics and returns:
  - a **class** — Love, Faith, Hope, Longing, Grief, Heartbreak, Joy, Freedom, Home, Gratitude,
    Wonder, Courage (or *Reflection* when the lyrics carry no strong signal),
  - a **message** written from the matched theme, the tone, and the strongest images,
  - a **confidence** score, the competing theme signals, extracted keywords, and a suggested tempo.
- Every part is classified too, so a part can carry a different tint from the song as a whole.

How it works (`src/lib/nlp.ts`, no external API): the lyrics are normalised and stemmed, scored
against per-theme weighted lexicons plus multi-word phrase cues, and combined with a small
sentiment and energy lexicon. Confidence blends theme share, signal density, and how far the top
theme leads the runner-up.

### 2. Lineup creation, by part

`Lineups → Build a lineup`

- The **song library** is searchable by title, artist, or a word of lyric, and filterable by class —
  pick **Love** and every love song comes up, ready for a love-themed set.
- **Tap any part** to add it to the sequence, or **hold and drag** a part onto the sequence to drop
  it exactly where you want. Parts can be mixed freely: the chorus of one song, the bridge of
  another.
- The sequence is fully editable: drag the handle to reorder, use the arrows, repeat any part as
  many times as you like, or remove it.
- A guard rail enforces the brief: **at least 2 parts from at least 2 songs, including one fast and
  one slow track.** The counter row shows fast/slow/song totals live.
- Saving opens a read-only lineup page: the sequence in order, with the full lyrics of each part.

### 0. Accounts

Create an account with email + password, or **continue with Google**. Forgot your
password? There is a reset link flow. Every request is identified by a verified
token, so the API never trusts a user id sent by the browser.

Auth runs on Supabase in production (`ARIA_AUTH=supabase`) and on local accounts
in development (`ARIA_AUTH=demo`, no cloud account needed — Google and emailed
resets need Supabase). See [DEPLOY.md](DEPLOY.md).

### 3. Teams, sharing and copying

`Teams`

- **Create a team** and get an invite code (`ARIA-000`), or **join with a code** shared by a teammate.
- Shared songs and shared lineups live in the team area. Anyone in the team can **copy a song** into
  their own library, or **copy a lineup** — the songs it needs come with it, so a teammate can open
  it immediately.
- Copying never edits someone else's work: a teammate who opens another person's lineup and saves it
  gets their own labelled copy.
- **Share a lineup** two ways: a view-only link, or straight into a team.

## The LRU behaviour

Aria's rule from the brief: **a lineup counts as used when its link is shared.**

- Sharing a link stamps `lastUsedAt` and bumps the use count.
- So does sending a lineup to a team, and so does someone opening a share link.
- `Lineups` is ordered by least recently used first, and the top card is the **suggested** lineup,
  with how long ago it was used.
- In the builder, the same suggestion appears as **"Use its sequence"** — start from the set used
  longest ago instead of repeating a recent one. Lineups that were never used sort first.
- Each lineup shows its own LRU rank and the freshest alternative.

## The public lineup page

Opening `/s/:token` shows a **view-only** page for anyone, signed in or not:

- the lineup name, class and owner,
- every part in order — song title, part name (verse / chorus / bridge), and the **full lyrics**,
- repeated parts are collapsed into one block marked `×3`,
- no numbers, no editing controls, no nav — just lyrics, title and part,
- lyrics sit on one straight line each, horizontally scrollable inside the page's own column,
- "Copy" puts the whole lineup as text on the clipboard.

## Running it

```bash
npm install
npm run dev      # API on :5174, app on :5173
```

```bash
npm run build    # type-check + production bundle
npm start        # serve the built app and the API from :5174
```

### Deploying

One Node service serves the API and the app together, and **Supabase (Postgres)** holds the data so
nothing is lost on redeploy — see **[DEPLOY.md](DEPLOY.md)** for the full Render + Supabase walkthrough.

Storage is pluggable (`server/storage.js`):

| `ARIA_STORAGE` | Where data lives |
| --- | --- |
| *(unset)* | Supabase if `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, else a local JSON file |
| `file` | `server/data.json` — the default for `npm run dev` |
| `supabase` | Postgres through the Supabase service role key |

The schema is in [`supabase/schema.sql`](supabase/schema.sql). Run
`npm run test:supabase` to verify the whole path against a real Postgres before deploying — no
Supabase account needed.

In local file mode, the API stores its data in `server/data.json` (git-ignored, created on first
run with an empty store). `npm run dev` proxies `/api` from Vite to the API, so the browser only
ever talks to one origin.

## Layout

```
server/index.js          API: users, teams + join codes, songs, lineups, sharing, LRU stamps
server/auth.js           auth drivers: Supabase Auth, or local demo accounts
server/storage.js        storage drivers: local JSON file or Supabase Postgres
supabase/schema.sql      tables, indexes and RLS for Supabase (paste into SQL Editor)
scripts/test-auth.mjs      end-to-end check of both auth drivers
scripts/test-supabase.mjs  end-to-end check of the Supabase path on a real Postgres
src/lib/nlp.ts           lyric classifier: lexicons, themes, tone, per-part signals, message
src/lib/lru.ts           LRU ordering, sequence resolution, tempo mix, time helpers
src/lib/store.tsx        app state, theme (light/dark), session, onboarding flag
src/pages/               Auth, Onboarding, Songs, SongForm, SongDetail, Lineups, Builder, LineupView, Teams, Shared
src/components/Icon.tsx  the one icon set (24-unit grid, 1.8 stroke, currentColor)
src/components/Logo.tsx  the Aria mark (logo, wordmark, hero)
public/logo.svg          the same artwork as a standalone file / favicon
src/styles.css           design tokens for both themes and the mobile-first layout
```

## Try it in a minute

0. Sign in with Google or create an account to take the interactive four-step tour. Replay it any
   time from the account sheet (**How Aria works**).
1. Add your first song — paste full lyrics to split automatically, or enter Verse, Chorus, and
   Bridge parts — and click **Generate class & message**.
2. Add a second song with the opposite tempo (one Fast, one Slow).
3. Go to **Lineups → New lineup**, drag or tap parts from your songs into the sequence, and save.
4. Open **Share**, copy or send the public lyric sheet link, and watch the least-recently-used
   rotation update automatically.
