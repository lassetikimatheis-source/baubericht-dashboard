-- PARIBUS Baukosten Tool: public.profiles pruefen/anlegen und Owner-Profil setzen
-- Direkt im Supabase SQL Editor ausfuehren.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text default 'viewer',
  status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_login_at timestamptz
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists role text default 'viewer',
  add column if not exists status text default 'pending',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists last_login_at timestamptz;

alter table public.profiles
  alter column role set default 'viewer',
  alter column status set default 'pending',
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.profiles enable row level security;

drop policy if exists "profiles select self" on public.profiles;
create policy "profiles select self"
on public.profiles for select
using (id = auth.uid());

drop policy if exists "profiles update own login fields" on public.profiles;
create policy "profiles update own login fields"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

insert into public.profiles (
  id,
  email,
  full_name,
  role,
  status,
  created_at,
  updated_at
)
values (
  'f836bcdc-28af-4103-ab9b-9e37678a3e73',
  'lassetikimatheis@icloud.com',
  'Lasse Tiki Matheis',
  'owner',
  'active',
  now(),
  now()
)
on conflict (id) do update
set email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    status = excluded.status,
    updated_at = now();

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.can_edit_data()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and status = 'active' and role in ('owner', 'admin', 'editor'));
$$;

create or replace function public.can_admin_users()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and status = 'active' and role in ('owner', 'admin'));
$$;

alter table if exists public.projects enable row level security;
alter table if exists public.objects enable row level security;
alter table if exists public.documents enable row level security;
alter table if exists public.cost_items enable row level security;
alter table if exists public.trades enable row level security;
alter table if exists public.companies enable row level security;
alter table if exists public.document_types enable row level security;
alter table if exists public.units enable row level security;
alter table if exists public.entrances enable row level security;
alter table if exists public.assignments enable row level security;
alter table if exists public.object_images enable row level security;

drop policy if exists "projects active read" on public.projects;
create policy "projects active read" on public.projects for select using (public.is_active_user());
drop policy if exists "projects editor write" on public.projects;
create policy "projects editor write" on public.projects for all using (public.can_edit_data()) with check (public.can_edit_data());

drop policy if exists "objects active read" on public.objects;
create policy "objects active read" on public.objects for select using (public.is_active_user());
drop policy if exists "objects editor write" on public.objects;
create policy "objects editor write" on public.objects for all using (public.can_edit_data()) with check (public.can_edit_data());

drop policy if exists "documents active read" on public.documents;
create policy "documents active read" on public.documents for select using (public.is_active_user());
drop policy if exists "documents editor write" on public.documents;
create policy "documents editor write" on public.documents for all using (public.can_edit_data()) with check (public.can_edit_data());

drop policy if exists "cost_items active read" on public.cost_items;
create policy "cost_items active read" on public.cost_items for select using (public.is_active_user());
drop policy if exists "cost_items editor write" on public.cost_items;
create policy "cost_items editor write" on public.cost_items for all using (public.can_edit_data()) with check (public.can_edit_data());

drop policy if exists "trades active read" on public.trades;
create policy "trades active read" on public.trades for select using (public.is_active_user());
drop policy if exists "trades editor write" on public.trades;
create policy "trades editor write" on public.trades for all using (public.can_edit_data()) with check (public.can_edit_data());

drop policy if exists "companies active read" on public.companies;
create policy "companies active read" on public.companies for select using (public.is_active_user());
drop policy if exists "companies editor write" on public.companies;
create policy "companies editor write" on public.companies for all using (public.can_edit_data()) with check (public.can_edit_data());

drop policy if exists "document_types active read" on public.document_types;
create policy "document_types active read" on public.document_types for select using (public.is_active_user());
drop policy if exists "document_types editor write" on public.document_types;
create policy "document_types editor write" on public.document_types for all using (public.can_edit_data()) with check (public.can_edit_data());

drop policy if exists "units active read" on public.units;
create policy "units active read" on public.units for select using (public.is_active_user());
drop policy if exists "units editor write" on public.units;
create policy "units editor write" on public.units for all using (public.can_edit_data()) with check (public.can_edit_data());

drop policy if exists "entrances active read" on public.entrances;
create policy "entrances active read" on public.entrances for select using (public.is_active_user());
drop policy if exists "entrances editor write" on public.entrances;
create policy "entrances editor write" on public.entrances for all using (public.can_edit_data()) with check (public.can_edit_data());

drop policy if exists "assignments active read" on public.assignments;
create policy "assignments active read" on public.assignments for select using (public.is_active_user());
drop policy if exists "assignments editor write" on public.assignments;
create policy "assignments editor write" on public.assignments for all using (public.can_edit_data()) with check (public.can_edit_data());

drop policy if exists "object_images active read" on public.object_images;
create policy "object_images active read" on public.object_images for select using (public.is_active_user());
drop policy if exists "object_images editor write" on public.object_images;
create policy "object_images editor write" on public.object_images for all using (public.can_edit_data()) with check (public.can_edit_data());
