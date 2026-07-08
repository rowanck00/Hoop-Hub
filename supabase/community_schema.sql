-- Hoop Hub account/profile/community tables
-- Run this once in Supabase Dashboard > SQL Editor.

create table if not exists public.hh_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text unique,
  display_name text,
  avatar_url text,
  first_name text,
  last_name text,
  position text,
  grad_year text,
  height text,
  weight text,
  wingspan text,
  vertical text,
  bio text,
  is_public boolean not null default true,
  strengths text,
  weaknesses text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hh_gamedata (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.hh_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  video_url text,
  video_id text,
  reply_to uuid references public.hh_posts(id) on delete cascade,
  quoted_post_id uuid references public.hh_posts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hh_post_likes (
  post_id uuid not null references public.hh_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists hh_posts_user_id_created_at_idx on public.hh_posts(user_id, created_at desc);
create index if not exists hh_posts_reply_to_idx on public.hh_posts(reply_to);
create index if not exists hh_post_likes_post_id_idx on public.hh_post_likes(post_id);

alter table public.hh_profiles enable row level security;
alter table public.hh_gamedata enable row level security;
alter table public.hh_posts enable row level security;
alter table public.hh_post_likes enable row level security;

drop policy if exists "public can read public profiles" on public.hh_profiles;
create policy "public can read public profiles"
on public.hh_profiles for select
using (is_public = true or auth.uid() = user_id);

drop policy if exists "users manage own profile" on public.hh_profiles;
create policy "users manage own profile"
on public.hh_profiles for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users read own gamedata" on public.hh_gamedata;
create policy "users read own gamedata"
on public.hh_gamedata for select
using (auth.uid() = user_id);

drop policy if exists "users manage own gamedata" on public.hh_gamedata;
create policy "users manage own gamedata"
on public.hh_gamedata for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "everyone reads posts" on public.hh_posts;
create policy "everyone reads posts"
on public.hh_posts for select
using (true);

drop policy if exists "signed in users create own posts" on public.hh_posts;
create policy "signed in users create own posts"
on public.hh_posts for insert
with check (auth.uid() = user_id);

drop policy if exists "users update own posts" on public.hh_posts;
create policy "users update own posts"
on public.hh_posts for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users delete own posts" on public.hh_posts;
create policy "users delete own posts"
on public.hh_posts for delete
using (auth.uid() = user_id);

drop policy if exists "everyone reads likes" on public.hh_post_likes;
create policy "everyone reads likes"
on public.hh_post_likes for select
using (true);

drop policy if exists "signed in users like as self" on public.hh_post_likes;
create policy "signed in users like as self"
on public.hh_post_likes for insert
with check (auth.uid() = user_id);

drop policy if exists "users remove own likes" on public.hh_post_likes;
create policy "users remove own likes"
on public.hh_post_likes for delete
using (auth.uid() = user_id);
