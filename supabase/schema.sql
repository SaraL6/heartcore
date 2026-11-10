-- heartcore database schema.
-- Run this once in your Supabase project: Dashboard → SQL Editor → paste → Run.
-- It is safe to run again.

-- ---------- tables ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_.]{3,24}$'),
  bio text not null default '' check (char_length(bio) <= 160),
  created_at timestamptz not null default now()
);

-- One row per picture: either something a member uploaded, or a picture from
-- an outside image API that somebody hearted or saved.
create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  url text not null check (url ~ '^https?://' and char_length(url) <= 1000),
  thumb text check (thumb is null or (thumb ~ '^https?://' and char_length(thumb) <= 1000)),
  width int,
  height int,
  caption text not null default '' check (char_length(caption) <= 300),
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  credit text,
  source_url text,
  license text,
  provider text not null default 'upload',
  provider_id text,
  uploader_id uuid references public.profiles on delete set null,
  heart_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (provider, provider_id)
);
create index if not exists images_uploader_idx on public.images (uploader_id, created_at desc);
create index if not exists images_created_idx on public.images (created_at desc);

create table if not exists public.hearts (
  user_id uuid not null references public.profiles on delete cascade,
  image_id uuid not null references public.images on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, image_id)
);
create index if not exists hearts_recent_idx on public.hearts (user_id, created_at desc);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);
create index if not exists collections_user_idx on public.collections (user_id);

create table if not exists public.collection_images (
  collection_id uuid not null references public.collections on delete cascade,
  image_id uuid not null references public.images on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, image_id)
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles on delete cascade,
  following_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists follows_following_idx on public.follows (following_id);

-- ---------- functions and triggers ----------

-- Give every new account a profile. The username comes from the sign-up form;
-- if it is missing, invalid or taken, fall back to a generated one.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  wanted text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  candidate text;
begin
  if wanted !~ '^[a-z0-9_.]{3,24}$' then wanted := 'dreamer'; end if;
  candidate := wanted;
  for i in 1..5 loop
    begin
      insert into public.profiles (id, username) values (new.id, candidate);
      return new;
    exception when unique_violation then
      candidate := left(wanted, 18) || '_' || substr(md5(random()::text), 1, 5);
    end;
  end loop;
  raise exception 'could not create a profile';
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.bump_heart_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.images set heart_count = heart_count + 1 where id = new.image_id;
  else
    update public.images set heart_count = greatest(heart_count - 1, 0) where id = old.image_id;
  end if;
  return null;
end $$;

drop trigger if exists hearts_count on public.hearts;
create trigger hearts_count after insert or delete on public.hearts
  for each row execute function public.bump_heart_count();

-- Record a picture from an outside image API (once) and return its id, so it
-- can be hearted or put in a collection.
create or replace function public.save_external_image(
  p_provider text, p_provider_id text, p_url text, p_thumb text, p_width int, p_height int,
  p_caption text, p_tags text[], p_credit text, p_source_url text, p_license text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_provider is null or p_provider = 'upload' or coalesce(p_provider_id, '') = '' then
    raise exception 'not an external image';
  end if;
  insert into public.images (provider, provider_id, url, thumb, width, height, caption, tags, credit, source_url, license)
  values (p_provider, p_provider_id, p_url, p_thumb, p_width, p_height,
          left(coalesce(p_caption, ''), 300), coalesce(p_tags[1:12], '{}'), p_credit, p_source_url, p_license)
  on conflict (provider, provider_id) do update set provider = excluded.provider
  returning id into result;
  return result;
end $$;

revoke execute on function public.save_external_image from public, anon;
grant execute on function public.save_external_image to authenticated;

-- ---------- row level security ----------
-- Everything is public to read (it's a social site); you can only change your own stuff.

alter table public.profiles enable row level security;
alter table public.images enable row level security;
alter table public.hearts enable row level security;
alter table public.collections enable row level security;
alter table public.collection_images enable row level security;
alter table public.follows enable row level security;

drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select using (true);
drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "read images" on public.images;
create policy "read images" on public.images for select using (true);
drop policy if exists "post images" on public.images;
create policy "post images" on public.images for insert to authenticated
  with check (provider = 'upload' and uploader_id = auth.uid() and heart_count = 0);
drop policy if exists "delete own images" on public.images;
create policy "delete own images" on public.images for delete to authenticated
  using (provider = 'upload' and uploader_id = auth.uid());

drop policy if exists "read hearts" on public.hearts;
create policy "read hearts" on public.hearts for select using (true);
drop policy if exists "heart" on public.hearts;
create policy "heart" on public.hearts for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "unheart" on public.hearts;
create policy "unheart" on public.hearts for delete to authenticated using (user_id = auth.uid());

drop policy if exists "read collections" on public.collections;
create policy "read collections" on public.collections for select using (true);
drop policy if exists "manage own collections" on public.collections;
create policy "manage own collections" on public.collections for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "read collection images" on public.collection_images;
create policy "read collection images" on public.collection_images for select using (true);
drop policy if exists "manage own collection images" on public.collection_images;
create policy "manage own collection images" on public.collection_images for all to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid()));

drop policy if exists "read follows" on public.follows;
create policy "read follows" on public.follows for select using (true);
drop policy if exists "follow" on public.follows;
create policy "follow" on public.follows for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists "unfollow" on public.follows;
create policy "unfollow" on public.follows for delete to authenticated using (follower_id = auth.uid());

-- The profile id and heart counts are never edited directly by members.
revoke update on public.profiles from anon, authenticated;
grant update (username, bio) on public.profiles to authenticated;
revoke update on public.images from anon, authenticated;

-- ---------- storage for uploads ----------

insert into storage.buckets (id, name, public) values ('images', 'images', true)
on conflict (id) do nothing;

drop policy if exists "upload to own folder" on storage.objects;
create policy "upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "delete own uploads" on storage.objects;
create policy "delete own uploads" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
