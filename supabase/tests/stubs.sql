-- Minimal stand-ins for what a Supabase project provides (auth, storage and
-- the anon/authenticated roles), so schema.sql can be loaded into a plain
-- Postgres for testing.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema public, auth, storage to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

-- Test helpers. They run as whoever calls them, so row-level security applies.
create function public.t_refused(q text, label text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    raise notice 'ok - refused: %', label;
    return;
  end;
  raise exception 'FAILED - should have been refused: %', label;
end $$;

create function public.t_rows(q text, expected int, label text) returns void language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  if n <> expected then raise exception 'FAILED - % (affected % rows, expected %)', label, n, expected; end if;
  raise notice 'ok - %', label;
end $$;

create function public.t_is(q text, expected text, label text) returns void language plpgsql as $$
declare got text;
begin
  execute q into got;
  if got is distinct from expected then raise exception 'FAILED - % (got %, expected %)', label, got, expected; end if;
  raise notice 'ok - %', label;
end $$;
