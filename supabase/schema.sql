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
  email       text,
  role        text not null default 'user',
  suspended   boolean not null default false,
  is_demo     boolean not null default false,
  created_at  bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at  bigint not null default (extract(epoch from now()) * 1000)::bigint
);

alter table public.users add column if not exists email text;
alter table public.users add column if not exists role text not null default 'user';
alter table public.users add column if not exists suspended boolean not null default false;

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

-- ---------------------------------------------------------------- system_settings

create table if not exists public.system_settings (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- ---------------------------------------------------------------- RLS

alter table public.users           enable row level security;
alter table public.teams           enable row level security;
alter table public.songs           enable row level security;
alter table public.lineups         enable row level security;
alter table public.system_settings enable row level security;

-- No direct table policies are defined on purpose, so anon and authenticated
-- clients cannot directly query or dump tables via PostgREST.
-- When SUPABASE_SERVICE_ROLE_KEY is set, the Aria server persists with the
-- service role (which bypasses RLS). When SUPABASE_SERVICE_ROLE_KEY is omitted
-- (e.g., anon-only Render deploys), Aria persists each signed-in user's songs,
-- lineups, and teams through the strict auth.uid()-scoped RPC functions below.

do $aria_rpc$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then

    execute $fn$
      create or replace function public.aria_caller_id()
      returns text
      language sql
      stable
      security definer
      set search_path = public
      as $body$
        select case
          when auth.uid() is not null then 'sb_' || auth.uid()::text
          else null
        end;
      $body$;

      create or replace function public.aria_load_caller_state()
      returns jsonb
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        v_uid text := public.aria_caller_id();
        v_team_ids text[];
        v_teammate_ids text[];
        v_ref_song_ids text[];
        v_users jsonb;
        v_teams jsonb;
        v_songs jsonb;
        v_lineups jsonb;
        v_settings jsonb;
      begin
        if v_uid is null then
          raise exception 'Authentication required';
        end if;

        select coalesce(array_agg(t.id), array[]::text[])
          into v_team_ids
          from public.teams t
         where t.owner_id = v_uid
            or exists (
                 select 1
                   from jsonb_array_elements(coalesce(t.members, '[]'::jsonb)) m
                  where m->>'userId' = v_uid
               );

        select coalesce(array_agg(distinct uid_val), array[]::text[])
          into v_teammate_ids
          from (
            select t.owner_id as uid_val
              from public.teams t
             where t.id = any(v_team_ids)
            union
            select m->>'userId' as uid_val
              from public.teams t,
                   jsonb_array_elements(coalesce(t.members, '[]'::jsonb)) m
             where t.id = any(v_team_ids)
               and m->>'userId' is not null
          ) sub
         where uid_val is not null and uid_val <> v_uid;

        select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
          into v_teams
          from public.teams t
         where t.id = any(v_team_ids);

        select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
          into v_lineups
          from public.lineups l
         where l.owner_id = v_uid
            or l.owner_id = any(v_teammate_ids)
            or (l.team_id is not null and l.team_id = any(v_team_ids));

        select coalesce(array_agg(distinct item->>'songId'), array[]::text[])
          into v_ref_song_ids
          from public.lineups l,
               jsonb_array_elements(coalesce(l.items, '[]'::jsonb)) item
         where (
                 l.owner_id = v_uid
                 or l.owner_id = any(v_teammate_ids)
                 or (l.team_id is not null and l.team_id = any(v_team_ids))
               )
           and item->>'songId' is not null;

        select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
          into v_songs
          from public.songs s
         where s.owner_id = v_uid
            or s.owner_id = any(v_teammate_ids)
            or (s.team_id is not null and s.team_id = any(v_team_ids))
            or s.id = any(v_ref_song_ids);

        select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
          into v_users
          from public.users u
         where u.id = v_uid
            or u.id = any(v_teammate_ids);

        select s.data
          into v_settings
          from public.system_settings s
         where s.id = 'global'
         limit 1;

        return jsonb_build_object(
          'users', v_users,
          'teams', v_teams,
          'songs', v_songs,
          'lineups', v_lineups,
          'settings', v_settings
        );
      end;
      $body$;

      create or replace function public.aria_sync_caller_state(
        p_user jsonb,
        p_songs jsonb default '[]'::jsonb,
        p_lineups jsonb default '[]'::jsonb
      )
      returns jsonb
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        v_uid text := public.aria_caller_id();
        v_now bigint := (extract(epoch from now()) * 1000)::bigint;
        v_keep_songs text[] := array[]::text[];
        v_keep_lineups text[] := array[]::text[];
        v_song jsonb;
        v_lineup jsonb;
        v_team_id text;
      begin
        if v_uid is null then
          raise exception 'Authentication required';
        end if;

        insert into public.users (id, name, email, updated_at)
        values (
          v_uid,
          coalesce(nullif(trim(p_user->>'name'), ''), 'Listener'),
          nullif(trim(p_user->>'email'), ''),
          v_now
        )
        on conflict (id) do update set
          name = excluded.name,
          email = coalesce(excluded.email, public.users.email),
          updated_at = v_now;

        for v_song in select * from jsonb_array_elements(coalesce(p_songs, '[]'::jsonb))
        loop
          if coalesce(v_song->>'id', '') <> '' then
            v_keep_songs := array_append(v_keep_songs, v_song->>'id');
            v_team_id := nullif(v_song->>'teamId', '');
            if v_team_id is not null and not exists (select 1 from public.teams where id = v_team_id) then
              v_team_id := null;
            end if;

            insert into public.songs (
              id, title, artist, tempo, theme, parts, analysis, lyrics,
              owner_id, owner_name, team_id, source_song_id, copied_from,
              created_at, updated_at
            )
            values (
              v_song->>'id',
              coalesce(v_song->>'title', ''),
              coalesce(nullif(v_song->>'artist', ''), 'Unknown artist'),
              case when v_song->>'tempo' = 'fast' then 'fast' else 'slow' end,
              coalesce(v_song->>'theme', ''),
              coalesce(v_song->'parts', '[]'::jsonb),
              case when jsonb_typeof(v_song->'analysis') = 'null' then null else v_song->'analysis' end,
              coalesce(v_song->>'lyrics', ''),
              v_uid,
              coalesce(v_song->>'ownerName', coalesce(p_user->>'name', '')),
              v_team_id,
              nullif(v_song->>'sourceSongId', ''),
              nullif(v_song->>'copiedFrom', ''),
              coalesce((v_song->>'createdAt')::bigint, v_now),
              coalesce((v_song->>'updatedAt')::bigint, v_now)
            )
            on conflict (id) do update set
              title = excluded.title,
              artist = excluded.artist,
              tempo = excluded.tempo,
              theme = excluded.theme,
              parts = excluded.parts,
              analysis = excluded.analysis,
              lyrics = excluded.lyrics,
              owner_name = excluded.owner_name,
              team_id = excluded.team_id,
              source_song_id = excluded.source_song_id,
              copied_from = excluded.copied_from,
              updated_at = excluded.updated_at
            where public.songs.owner_id = v_uid;
          end if;
        end loop;

        delete from public.songs
         where owner_id = v_uid
           and not (id = any(v_keep_songs));

        for v_lineup in select * from jsonb_array_elements(coalesce(p_lineups, '[]'::jsonb))
        loop
          if coalesce(v_lineup->>'id', '') <> '' then
            v_keep_lineups := array_append(v_keep_lineups, v_lineup->>'id');
            v_team_id := nullif(v_lineup->>'teamId', '');
            if v_team_id is not null and not exists (select 1 from public.teams where id = v_team_id) then
              v_team_id := null;
            end if;

            insert into public.lineups (
              id, name, theme, owner_id, owner_name, team_id, items,
              share_token, source_lineup_id, copied_from,
              last_used_at, use_count, last_used_reason,
              created_at, updated_at
            )
            values (
              v_lineup->>'id',
              coalesce(v_lineup->>'name', ''),
              coalesce(v_lineup->>'theme', ''),
              v_uid,
              coalesce(v_lineup->>'ownerName', coalesce(p_user->>'name', '')),
              v_team_id,
              coalesce(v_lineup->'items', '[]'::jsonb),
              nullif(v_lineup->>'shareToken', ''),
              nullif(v_lineup->>'sourceLineupId', ''),
              nullif(v_lineup->>'copiedFrom', ''),
              case when v_lineup->>'lastUsedAt' is not null then (v_lineup->>'lastUsedAt')::bigint else null end,
              coalesce((v_lineup->>'useCount')::integer, 0),
              nullif(v_lineup->>'lastUsedReason', ''),
              coalesce((v_lineup->>'createdAt')::bigint, v_now),
              coalesce((v_lineup->>'updatedAt')::bigint, v_now)
            )
            on conflict (id) do update set
              name = excluded.name,
              theme = excluded.theme,
              owner_name = excluded.owner_name,
              team_id = excluded.team_id,
              items = excluded.items,
              share_token = excluded.share_token,
              source_lineup_id = excluded.source_lineup_id,
              copied_from = excluded.copied_from,
              last_used_at = excluded.last_used_at,
              use_count = excluded.use_count,
              last_used_reason = excluded.last_used_reason,
              updated_at = excluded.updated_at
            where public.lineups.owner_id = v_uid;
          end if;
        end loop;

        delete from public.lineups
         where owner_id = v_uid
           and not (id = any(v_keep_lineups));

        return jsonb_build_object('ok', true);
      end;
      $body$;

      create or replace function public.aria_team_op(
        p_op text,
        p_team jsonb default null,
        p_code text default null,
        p_team_id text default null,
        p_member_name text default null
      )
      returns jsonb
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        v_uid text := public.aria_caller_id();
        v_now bigint := (extract(epoch from now()) * 1000)::bigint;
        v_row public.teams%rowtype;
        v_members jsonb;
      begin
        if v_uid is null then
          raise exception 'Authentication required';
        end if;

        if p_op = 'create' then
          insert into public.users (id, name, updated_at)
          values (v_uid, coalesce(nullif(p_member_name, ''), 'Listener'), v_now)
          on conflict (id) do nothing;

          insert into public.teams (id, name, code, owner_id, members, created_at, updated_at)
          values (
            p_team->>'id',
            coalesce(p_team->>'name', ''),
            upper(coalesce(p_team->>'code', '')),
            v_uid,
            coalesce(p_team->'members', '[]'::jsonb),
            coalesce((p_team->>'createdAt')::bigint, v_now),
            v_now
          )
          on conflict (id) do update set
            name = excluded.name,
            members = excluded.members,
            updated_at = v_now
          where public.teams.owner_id = v_uid
          returning * into v_row;

          return to_jsonb(v_row);

        elsif p_op = 'join' then
          insert into public.users (id, name, updated_at)
          values (v_uid, coalesce(nullif(p_member_name, ''), 'Listener'), v_now)
          on conflict (id) do nothing;

          select * into v_row
            from public.teams
           where upper(code) = upper(trim(coalesce(p_code, '')))
           limit 1;

          if not found then
            return null;
          end if;

          if not exists (
            select 1
              from jsonb_array_elements(coalesce(v_row.members, '[]'::jsonb)) m
             where m->>'userId' = v_uid
          ) then
            v_members := coalesce(v_row.members, '[]'::jsonb) || jsonb_build_array(
              jsonb_build_object(
                'userId', v_uid,
                'name', coalesce(nullif(p_member_name, ''), 'Member'),
                'role', 'member',
                'joinedAt', v_now
              )
            );
            update public.teams
               set members = v_members,
                   updated_at = v_now
             where id = v_row.id
             returning * into v_row;
          end if;

          return to_jsonb(v_row);

        elsif p_op = 'leave' then
          select * into v_row from public.teams where id = p_team_id limit 1;
          if not found then
            return jsonb_build_object('ok', true);
          end if;

          select coalesce(jsonb_agg(m), '[]'::jsonb)
            into v_members
            from jsonb_array_elements(coalesce(v_row.members, '[]'::jsonb)) m
           where m->>'userId' <> v_uid;

          if jsonb_array_length(v_members) = 0 then
            update public.songs set team_id = null where team_id = v_row.id;
            update public.lineups set team_id = null where team_id = v_row.id;
            delete from public.teams where id = v_row.id;
          else
            if v_row.owner_id = v_uid then
              v_members := jsonb_set(v_members, '{0,role}', '"owner"'::jsonb);
              update public.teams
                 set owner_id = v_members->0->>'userId',
                     members = v_members,
                     updated_at = v_now
               where id = v_row.id;
            else
              update public.teams
                 set members = v_members,
                     updated_at = v_now
               where id = v_row.id;
            end if;
          end if;

          return jsonb_build_object('ok', true);

        elsif p_op = 'stamp_lineup' then
          update public.lineups
             set last_used_at = v_now,
                 use_count = coalesce(use_count, 0) + 1,
                 last_used_reason = coalesce(p_code, 'shared_to_team'),
                 team_id = coalesce(nullif(p_team_id, ''), team_id),
                 updated_at = v_now
           where id = (p_team->>'id')
             and (
               owner_id = v_uid
               or exists (
                 select 1 from public.teams t
                  where (
                          t.owner_id = v_uid
                          or exists (
                            select 1 from jsonb_array_elements(coalesce(t.members, '[]'::jsonb)) m1
                             where m1->>'userId' = v_uid
                          )
                        )
                    and (
                          t.owner_id = public.lineups.owner_id
                          or t.id = public.lineups.team_id
                          or exists (
                            select 1 from jsonb_array_elements(coalesce(t.members, '[]'::jsonb)) m2
                             where m2->>'userId' = public.lineups.owner_id
                          )
                        )
               )
             );
          return jsonb_build_object('ok', true);

        elsif p_op = 'delete_account' then
          for v_row in
            select * from public.teams t
             where t.owner_id = v_uid
                or exists (
                     select 1 from jsonb_array_elements(coalesce(t.members, '[]'::jsonb)) m
                      where m->>'userId' = v_uid
                   )
          loop
            select coalesce(jsonb_agg(m), '[]'::jsonb)
              into v_members
              from jsonb_array_elements(coalesce(v_row.members, '[]'::jsonb)) m
             where m->>'userId' <> v_uid;

            if jsonb_array_length(v_members) = 0 then
              delete from public.teams where id = v_row.id;
            elsif v_row.owner_id = v_uid then
              v_members := jsonb_set(v_members, '{0,role}', '"owner"'::jsonb);
              update public.teams
                 set owner_id = v_members->0->>'userId',
                     members = v_members,
                     updated_at = v_now
               where id = v_row.id;
            else
              update public.teams
                 set members = v_members,
                     updated_at = v_now
               where id = v_row.id;
            end if;
          end loop;

          delete from public.users where id = v_uid;
          return jsonb_build_object('ok', true);
        end if;

        return jsonb_build_object('ok', false);
      end;
      $body$;

      create or replace function public.aria_get_shared_lineup(p_token text)
      returns jsonb
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        v_clean text := regexp_replace(trim(coalesce(p_token, '')), '[.,;:!?)]+$', '');
        v_now bigint := (extract(epoch from now()) * 1000)::bigint;
        v_lineup public.lineups%rowtype;
        v_song_ids text[];
        v_songs jsonb;
      begin
        if v_clean = '' then
          return null;
        end if;

        select * into v_lineup
          from public.lineups
         where share_token = trim(p_token)
            or share_token = v_clean
         limit 1;

        if not found then
          return null;
        end if;

        update public.lineups
           set last_used_at = v_now,
               use_count = coalesce(use_count, 0) + 1,
               last_used_reason = 'link_opened'
         where id = v_lineup.id
         returning * into v_lineup;

        select coalesce(array_agg(distinct item->>'songId'), array[]::text[])
          into v_song_ids
          from jsonb_array_elements(coalesce(v_lineup.items, '[]'::jsonb)) item
         where item->>'songId' is not null;

        select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
          into v_songs
          from public.songs s
         where s.id = any(v_song_ids);

        return jsonb_build_object(
          'lineup', to_jsonb(v_lineup),
          'songs', v_songs
        );
      end;
      $body$;

      revoke all on function public.aria_caller_id() from public;
      revoke all on function public.aria_load_caller_state() from public;
      revoke all on function public.aria_sync_caller_state(jsonb, jsonb, jsonb) from public;
      revoke all on function public.aria_team_op(text, jsonb, text, text, text) from public;
      revoke all on function public.aria_get_shared_lineup(text) from public;

      grant execute on function public.aria_caller_id() to authenticated, service_role;
      grant execute on function public.aria_load_caller_state() to authenticated, service_role;
      grant execute on function public.aria_sync_caller_state(jsonb, jsonb, jsonb) to authenticated, service_role;
      grant execute on function public.aria_team_op(text, jsonb, text, text, text) to authenticated, service_role;
      grant execute on function public.aria_get_shared_lineup(text) to anon, authenticated, service_role;
    $fn$;

  end if;
end;
$aria_rpc$;

-- ---------------------------------------------------------------- checks

-- Confirm the four tables exist:
--   select table_name from information_schema.tables
--   where table_schema = 'public' order by table_name;
--
-- Watch the LRU clock move (after sharing a lineup link):
--   select name, last_used_at, use_count, last_used_reason
--   from public.lineups order by last_used_at nulls first;
