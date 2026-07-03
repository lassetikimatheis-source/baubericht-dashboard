-- Idempotente Migration fuer kontrollierten JSON/localStorage Import.
-- Keine bestehenden Daten werden geloescht oder ueberschrieben.
-- Nach Ausfuehrung im Supabase SQL Editor die App neu laden, damit der PostgREST
-- Schema Cache die neuen Spalten kennt. Falls noetig Vercel/Deployment neu laden.

create extension if not exists "pgcrypto";

alter table public.objects add column if not exists local_object_id text;
alter table public.objects add column if not exists source_object_id text;
alter table public.objects add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.projects add column if not exists local_project_id text;
alter table public.projects add column if not exists source_project_id text;
alter table public.projects add column if not exists local_object_id text;
alter table public.projects add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.documents add column if not exists local_document_id text;
alter table public.documents add column if not exists source_document_id text;
alter table public.documents add column if not exists local_object_id text;
alter table public.documents add column if not exists local_project_id text;
alter table public.documents add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.cost_items add column if not exists local_cost_item_id text;
alter table public.cost_items add column if not exists local_document_id text;
alter table public.cost_items add column if not exists local_object_id text;
alter table public.cost_items add column if not exists local_project_id text;
alter table public.cost_items add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.assignments add column if not exists local_assignment_id text;
alter table public.assignments add column if not exists local_object_id text;
alter table public.assignments add column if not exists local_document_id text;
alter table public.assignments add column if not exists local_project_id text;
alter table public.assignments add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.assignments alter column id set default gen_random_uuid();

alter table public.entrances add column if not exists local_entrance_id text;
alter table public.entrances add column if not exists local_object_id text;
alter table public.entrances add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.object_images add column if not exists local_image_id text;
alter table public.object_images add column if not exists local_object_id text;
alter table public.object_images add column if not exists metadata jsonb default '{}'::jsonb;

create index if not exists idx_objects_local_object_id on public.objects (local_object_id);
create index if not exists idx_objects_source_object_id on public.objects (source_object_id);

create index if not exists idx_projects_local_project_id on public.projects (local_project_id);
create index if not exists idx_projects_source_project_id on public.projects (source_project_id);
create index if not exists idx_projects_local_object_id on public.projects (local_object_id);

create index if not exists idx_documents_local_document_id on public.documents (local_document_id);
create index if not exists idx_documents_source_document_id on public.documents (source_document_id);
create index if not exists idx_documents_local_object_id on public.documents (local_object_id);
create index if not exists idx_documents_local_project_id on public.documents (local_project_id);

create index if not exists idx_cost_items_local_cost_item_id on public.cost_items (local_cost_item_id);
create index if not exists idx_cost_items_local_document_id on public.cost_items (local_document_id);
create index if not exists idx_cost_items_local_object_id on public.cost_items (local_object_id);
create index if not exists idx_cost_items_local_project_id on public.cost_items (local_project_id);

create index if not exists idx_assignments_local_assignment_id on public.assignments (local_assignment_id);
create index if not exists idx_assignments_local_object_id on public.assignments (local_object_id);
create index if not exists idx_assignments_local_document_id on public.assignments (local_document_id);
create index if not exists idx_assignments_local_project_id on public.assignments (local_project_id);

create index if not exists idx_entrances_local_entrance_id on public.entrances (local_entrance_id);
create index if not exists idx_entrances_local_object_id on public.entrances (local_object_id);

create index if not exists idx_object_images_local_image_id on public.object_images (local_image_id);
create index if not exists idx_object_images_local_object_id on public.object_images (local_object_id);
