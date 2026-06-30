alter table public.objects enable row level security;

create unique index if not exists objects_object_number_unique
  on public.objects (object_number)
  where object_number is not null;

drop policy if exists "objects_select_anon" on public.objects;
create policy "objects_select_anon"
  on public.objects
  for select
  to anon
  using (true);

drop policy if exists "objects_insert_anon" on public.objects;
create policy "objects_insert_anon"
  on public.objects
  for insert
  to anon
  with check (true);

drop policy if exists "objects_update_anon" on public.objects;
create policy "objects_update_anon"
  on public.objects
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists "objects_delete_anon" on public.objects;
create policy "objects_delete_anon"
  on public.objects
  for delete
  to anon
  using (true);
