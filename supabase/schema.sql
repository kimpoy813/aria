-- Aria schema for Supabase (Postgres).
--
-- Run this once in the Supabase dashboard → SQL Editor → New query → paste → Run.
-- Safe to run again: every statement is idempotent.
--
-- Design notes
--   * The API talks to Postgres with the SERVICE ROLE key and enforces ownership
--     and team membership itself, so Row Level Security stays on with no public
--     policies: exposing these tables to the anon key does nothing.
--   * No extensions are required.
--   * Timestamps are epoch milliseconds (bigint) to match the app's model.
--   * Nested, read-as-a-block data (parts, items, members, analysis) is jsonb.
--     Song parts and lineup items are only ever read or replaced as a whole, so
--     jsonb keeps the schema simple without losing anything the app needs.

-- ---------------------------------------------------------------- users

create table if not exists public.users (
  id          text primary key,
  name        text not null,
  is_demo     boolean not null default false,
  created_at  bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at  bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- ---------------------------------------------------------------- teams

create table if not exists public.teams (
  id          text primary key,
  name        text not null,
  code        text not null unique,
  owner_id    text not null references public.users (id) on delete cascade,
  members     jsonb not null default '[]'::jsonb,
  created_at  bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at  bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists teams_code_idx on public.teams (code);

-- ---------------------------------------------------------------- songs

create table if not exists public.songs (
  id              text primary key,
  title           text not null,
  artist          text not null default 'Unknown artist',
  tempo           text not null default 'slow' check (tempo in ('fast', 'slow')),
  theme           text not null default '',
  parts           jsonb not null default '[]'::jsonb,
  analysis        jsonb,
  lyrics          text not null default '',
  owner_id        text not null references public.users (id) on delete cascade,
  owner_name      text not null default '',
  team_id         text references public.teams (id) on delete set null,
  source_song_id  text,
  copied_from     text,
  created_at      bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at      bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists songs_owner_idx on public.songs (owner_id);
create index if not exists songs_team_idx on public.songs (team_id);

-- ---------------------------------------------------------------- lineups

create table if not exists public.lineups (
  id                text primary key,
  name              text not null,
  theme             text not null default '',
  owner_id          text not null references public.users (id) on delete cascade,
  owner_name        text not null default '',
  team_id           text references public.teams (id) on delete set null,
  items             jsonb not null default '[]'::jsonb,
  share_token       text unique,
  source_lineup_id  text,
  copied_from       text,
  last_used_at      bigint,                       -- the LRU clock
  use_count         integer not null default 0,
  last_used_reason  text,
  created_at        bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at        bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists lineups_owner_idx on public.lineups (owner_id);
create index if not exists lineups_team_idx on public.lineups (team_id);
create index if not exists lineups_share_token_idx on public.lineups (share_token);
create index if not exists lineups_last_used_idx on public.lineups (last_used_at);

-- ---------------------------------------------------------------- RLS

alter table public.users   enable row level security;
alter table public.teams   enable row level security;
alter table public.songs   enable row level security;
alter table public.lineups enable row level security;

-- No policies are defined on purpose. The anon and authenticated keys therefore
-- cannot read or write anything; only the service role (which bypasses RLS) can.
-- The Aria API is the single gatekeeper and needs no further grants.

-- Handy for a shared project: keeps the demo seed stable across deploys.

-- ---------------------------------------------------------------- checks

-- Confirm the four tables exist:
--   select table_name from information_schema.tables
--   where table_schema = 'public' order by table_name;
--
-- Watch the LRU clock move (after sharing a lineup link):
--   select name, last_used_at, use_count, last_used_reason
--   from public.lineups order by last_used_at nulls first;
