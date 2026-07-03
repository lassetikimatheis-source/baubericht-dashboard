-- Idempotente RLS-Reparatur fuer JSON/localStorage Import.
-- Ziel: active owner/admin/editor duerfen lesen und schreiben,
-- active viewer duerfen lesen, pending/blocked duerfen keine App-Daten lesen/schreiben.
-- Keine bestehenden Daten werden geloescht.

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.can_edit_data()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and status = 'active'
      and role in ('owner', 'admin', 'editor')
  );
$$;

create or replace function public.can_admin_users()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and status = 'active'
      and role in ('owner', 'admin')
  );
$$;

grant usage on schema public to anon, authenticated;
grant execute on function public.is_active_user() to anon, authenticated;
grant execute on function public.can_edit_data() to anon, authenticated;
grant execute on function public.can_admin_users() to anon, authenticated;

grant select, insert, update, delete on table public.objects to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.documents to authenticated;
grant select, insert, update, delete on table public.cost_items to authenticated;
grant select, insert, update, delete on table public.assignments to authenticated;
grant select, insert, update, delete on table public.entrances to authenticated;
grant select, insert, update, delete on table public.object_images to authenticated;
grant select, insert, update, delete on table public.trades to authenticated;
grant select, insert, update, delete on table public.companies to authenticated;
grant select, insert, update, delete on table public.document_types to authenticated;
grant select, insert, update, delete on table public.units to authenticated;

alter table public.objects enable row level security;
alter table public.projects enable row level security;
alter table public.documents enable row level security;
alter table public.cost_items enable row level security;
alter table public.assignments enable row level security;
alter table public.entrances enable row level security;
alter table public.object_images enable row level security;
alter table public.trades enable row level security;
alter table public.companies enable row level security;
alter table public.document_types enable row level security;
alter table public.units enable row level security;

drop policy if exists "objects active read" on public.objects;
drop policy if exists "objects editor write" on public.objects;
drop policy if exists "objects_select_anon" on public.objects;
drop policy if exists "objects_insert_anon" on public.objects;
drop policy if exists "objects_update_anon" on public.objects;
drop policy if exists "objects_delete_anon" on public.objects;
create policy "objects active read"
  on public.objects for select
  to authenticated
  using (public.is_active_user());
create policy "objects editor insert"
  on public.objects for insert
  to authenticated
  with check (public.can_edit_data());
create policy "objects editor update"
  on public.objects for update
  to authenticated
  using (public.can_edit_data())
  with check (public.can_edit_data());
create policy "objects editor delete"
  on public.objects for delete
  to authenticated
  using (public.can_edit_data());

drop policy if exists "projects active read" on public.projects;
drop policy if exists "projects editor write" on public.projects;
create policy "projects active read"
  on public.projects for select
  to authenticated
  using (public.is_active_user());
create policy "projects editor insert"
  on public.projects for insert
  to authenticated
  with check (public.can_edit_data());
create policy "projects editor update"
  on public.projects for update
  to authenticated
  using (public.can_edit_data())
  with check (public.can_edit_data());
create policy "projects editor delete"
  on public.projects for delete
  to authenticated
  using (public.can_edit_data());

drop policy if exists "documents active read" on public.documents;
drop policy if exists "documents editor write" on public.documents;
create policy "documents active read"
  on public.documents for select
  to authenticated
  using (public.is_active_user());
create policy "documents editor insert"
  on public.documents for insert
  to authenticated
  with check (public.can_edit_data());
create policy "documents editor update"
  on public.documents for update
  to authenticated
  using (public.can_edit_data())
  with check (public.can_edit_data());
create policy "documents editor delete"
  on public.documents for delete
  to authenticated
  using (public.can_edit_data());

drop policy if exists "cost_items active read" on public.cost_items;
drop policy if exists "cost_items editor write" on public.cost_items;
create policy "cost_items active read"
  on public.cost_items for select
  to authenticated
  using (public.is_active_user());
create policy "cost_items editor insert"
  on public.cost_items for insert
  to authenticated
  with check (public.can_edit_data());
create policy "cost_items editor update"
  on public.cost_items for update
  to authenticated
  using (public.can_edit_data())
  with check (public.can_edit_data());
create policy "cost_items editor delete"
  on public.cost_items for delete
  to authenticated
  using (public.can_edit_data());

drop policy if exists "assignments active read" on public.assignments;
drop policy if exists "assignments editor write" on public.assignments;
create policy "assignments active read"
  on public.assignments for select
  to authenticated
  using (public.is_active_user());
create policy "assignments editor insert"
  on public.assignments for insert
  to authenticated
  with check (public.can_edit_data());
create policy "assignments editor update"
  on public.assignments for update
  to authenticated
  using (public.can_edit_data())
  with check (public.can_edit_data());
create policy "assignments editor delete"
  on public.assignments for delete
  to authenticated
  using (public.can_edit_data());

drop policy if exists "entrances active read" on public.entrances;
drop policy if exists "entrances editor write" on public.entrances;
create policy "entrances active read"
  on public.entrances for select
  to authenticated
  using (public.is_active_user());
create policy "entrances editor insert"
  on public.entrances for insert
  to authenticated
  with check (public.can_edit_data());
create policy "entrances editor update"
  on public.entrances for update
  to authenticated
  using (public.can_edit_data())
  with check (public.can_edit_data());
create policy "entrances editor delete"
  on public.entrances for delete
  to authenticated
  using (public.can_edit_data());

drop policy if exists "object_images active read" on public.object_images;
drop policy if exists "object_images editor write" on public.object_images;
create policy "object_images active read"
  on public.object_images for select
  to authenticated
  using (public.is_active_user());
create policy "object_images editor insert"
  on public.object_images for insert
  to authenticated
  with check (public.can_edit_data());
create policy "object_images editor update"
  on public.object_images for update
  to authenticated
  using (public.can_edit_data())
  with check (public.can_edit_data());
create policy "object_images editor delete"
  on public.object_images for delete
  to authenticated
  using (public.can_edit_data());

drop policy if exists "trades active read" on public.trades;
drop policy if exists "trades editor write" on public.trades;
create policy "trades active read"
  on public.trades for select
  to authenticated
  using (public.is_active_user());
create policy "trades editor insert"
  on public.trades for insert
  to authenticated
  with check (public.can_edit_data());
create policy "trades editor update"
  on public.trades for update
  to authenticated
  using (public.can_edit_data())
  with check (public.can_edit_data());
create policy "trades editor delete"
  on public.trades for delete
  to authenticated
  using (public.can_edit_data());

drop policy if exists "companies active read" on public.companies;
drop policy if exists "companies editor write" on public.companies;
create policy "companies active read"
  on public.companies for select
  to authenticated
  using (public.is_active_user());
create policy "companies editor insert"
  on public.companies for insert
  to authenticated
  with check (public.can_edit_data());
create policy "companies editor update"
  on public.companies for update
  to authenticated
  using (public.can_edit_data())
  with check (public.can_edit_data());
create policy "companies editor delete"
  on public.companies for delete
  to authenticated
  using (public.can_edit_data());

drop policy if exists "document_types active read" on public.document_types;
drop policy if exists "document_types editor write" on public.document_types;
create policy "document_types active read"
  on public.document_types for select
  to authenticated
  using (public.is_active_user());
create policy "document_types editor insert"
  on public.document_types for insert
  to authenticated
  with check (public.can_edit_data());
create policy "document_types editor update"
  on public.document_types for update
  to authenticated
  using (public.can_edit_data())
  with check (public.can_edit_data());
create policy "document_types editor delete"
  on public.document_types for delete
  to authenticated
  using (public.can_edit_data());

drop policy if exists "units active read" on public.units;
drop policy if exists "units editor write" on public.units;
create policy "units active read"
  on public.units for select
  to authenticated
  using (public.is_active_user());
create policy "units editor insert"
  on public.units for insert
  to authenticated
  with check (public.can_edit_data());
create policy "units editor update"
  on public.units for update
  to authenticated
  using (public.can_edit_data())
  with check (public.can_edit_data());
create policy "units editor delete"
  on public.units for delete
  to authenticated
  using (public.can_edit_data());
