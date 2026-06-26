-- PARIBUS Baukosten Analyse: zentrale Persistenz fuer geteilte Links.
-- In Supabase SQL Editor ausfuehren und danach die Env-Variablen in Vercel setzen.

create table if not exists public.objects (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.entrances (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.object_images (
  id bigint generated always as identity primary key,
  object_id text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists object_images_object_id_idx on public.object_images (object_id);

insert into storage.buckets (id, name, public)
values ('paribus-files', 'paribus-files', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read paribus files" on storage.objects;
create policy "Public read paribus files"
on storage.objects for select
using (bucket_id = 'paribus-files');

