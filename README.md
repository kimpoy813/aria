# Aria

A content-aware music recommender for building set lineups. Paste lyrics part by part, let the
NLP pass name the song's **class/message**, then drag those same parts into a sequence. Teams join
with a code and share songs and lineups. A **Least Recently Used** engine makes sure you do not keep
repeating the same lineup.

Mobile-first. White canvas with a calm green accent. Light and dark mode.
The logo (`src/components/Logo.tsx`, artwork in `public/logo.svg`) is used in the header, on the
landing screen and on the public share page.

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

### 3. Teams, sharing and copying

`Teams`

- **Create a team** and get a code, or **join with a code** (the demo team is `ARIA-123`).
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

One Node service serves the API and the app together — see **[DEPLOY.md](DEPLOY.md)** for Render
(blueprint or manual, plus the persistent-disk step so data survives deploys).

The API stores its data in `server/data.json` (git-ignored, created on first run and seeded with the
demo team `ARIA-123`). `npm run dev` proxies `/api` from Vite to the API, so the browser only ever
talks to one origin.

## Layout

```
server/index.js          API: users, teams + join codes, songs, lineups, sharing, LRU stamps
src/lib/nlp.ts           lyric classifier: lexicons, themes, tone, per-part signals, message
src/lib/lru.ts           LRU ordering, sequence resolution, tempo mix, time helpers
src/lib/store.tsx        app state, theme (light/dark), session
src/pages/               Landing, Songs, SongForm, SongDetail, Lineups, Builder, LineupView, Teams, Shared
src/components/Logo.tsx  the Aria mark (logo, wordmark, landing hero)
public/logo.svg          the same artwork as a standalone file / favicon
src/styles.css           design tokens for both themes and the mobile-first layout
```

## Try it in a minute

1. Open the app, enter a name, then join team **ARIA-123** on the Teams tab.
2. Add a song: title, then Verse, Chorus, Bridge — one at a time — and hit **Generate class &
   message**.
3. Go to **Lineups → Build a lineup**, filter by a class, and drag in a slow verse and a fast chorus
   from two songs. Save.
4. Open **Share → Create & share link**, then open the link: that lineup is now the most recently
   used one, and a different lineup is suggested.
