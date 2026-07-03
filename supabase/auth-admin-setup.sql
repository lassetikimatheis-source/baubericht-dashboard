-- PARIBUS Baukosten Tool: Auth, Rollen, Freischaltung und Activity Log
-- In Supabase SQL Editor ausfuehren. Danach den ersten Owner unten per E-Mail setzen.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'viewer' check (role in ('owner', 'admin', 'editor', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'active', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  action text not null,
  area text not null,
  target_type text,
  target_id text,
  target_label text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (lower(email));
create index if not exists profiles_role_status_idx on public.profiles (role, status);
create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_user_id_idx on public.activity_logs (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    'viewer',
    'pending'
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and status = 'active';
$$;

create or replace function public.current_profile_status()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select status from public.profiles where id = auth.uid();
$$;

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

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and status = 'active' and role = 'owner');
$$;

alter table public.profiles enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "profiles select self or admin" on public.profiles;
create policy "profiles select self or admin"
on public.profiles for select
using (id = auth.uid() or public.can_admin_users());

drop policy if exists "profiles insert own pending" on public.profiles;
create policy "profiles insert own pending"
on public.profiles for insert
with check (id = auth.uid() and role = 'viewer' and status = 'pending');

drop policy if exists "profiles update self login" on public.profiles;
create policy "profiles update self login"
on public.profiles for update
using (
  id = auth.uid()
  or public.is_owner()
  or (public.can_admin_users() and role <> 'owner')
)
with check (
  public.is_owner()
  or (
    public.can_admin_users()
    and coalesce(role, 'viewer') <> 'owner'
  )
  or id = auth.uid()
);

drop policy if exists "profiles delete owner only" on public.profiles;
create policy "profiles delete owner only"
on public.profiles for delete
using (public.is_owner());

drop policy if exists "activity select admin" on public.activity_logs;
create policy "activity select admin"
on public.activity_logs for select
using (public.can_admin_users());

drop policy if exists "activity insert active" on public.activity_logs;
create policy "activity insert active"
on public.activity_logs for insert
with check (auth.uid() = user_id and public.is_active_user());

-- RLS fuer bestehende Fachdatentabellen: Viewer lesen, editor/admin/owner schreiben.
alter table if exists public.objects enable row level security;
alter table if exists public.documents enable row level security;
alter table if exists public.cost_items enable row level security;
alter table if exists public.projects enable row level security;
alter table if exists public.assignments enable row level security;

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

drop policy if exists "projects active read" on public.projects;
create policy "projects active read" on public.projects for select using (public.is_active_user());
drop policy if exists "projects editor write" on public.projects;
create policy "projects editor write" on public.projects for all using (public.can_edit_data()) with check (public.can_edit_data());

drop policy if exists "assignments active read" on public.assignments;
create policy "assignments active read" on public.assignments for select using (public.is_active_user());
drop policy if exists "assignments editor write" on public.assignments;
create policy "assignments editor write" on public.assignments for all using (public.can_edit_data()) with check (public.can_edit_data());

-- Ersten Owner setzen: E-Mail ersetzen und einmal ausfuehren.
-- update public.profiles
-- set role = 'owner', status = 'active'
-- where lower(email) = lower('DEINE_EMAIL@FIRMA.DE');
