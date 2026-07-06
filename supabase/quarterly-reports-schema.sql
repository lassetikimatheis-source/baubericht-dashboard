create extension if not exists pgcrypto;

create table if not exists public.funds (
  id uuid primary key default gen_random_uuid(),
  fund_name text not null,
  fund_number text not null,
  company text,
  contact_person text,
  status text not null default 'aktiv',
  remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funds_fund_number_unique unique (fund_number),
  constraint funds_fund_name_not_empty check (length(trim(fund_name)) > 0),
  constraint funds_fund_number_not_empty check (length(trim(fund_number)) > 0)
);

create table if not exists public.quarterly_reports (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id) on delete restrict,
  quarter text not null,
  report_year integer not null,
  reporting_date date not null,
  status text not null default 'Entwurf',
  version text not null default '1.0',
  editor text,
  last_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quarterly_reports_quarter_check check (quarter in ('Q1', 'Q2', 'Q3', 'Q4')),
  constraint quarterly_reports_year_check check (report_year between 2000 and 2100),
  constraint quarterly_reports_unique_version unique (fund_id, quarter, report_year, reporting_date, version)
);

create table if not exists public.quarterly_report_files (
  id uuid primary key default gen_random_uuid(),
  quarterly_report_id uuid not null references public.quarterly_reports(id) on delete cascade,
  fund_id uuid not null references public.funds(id) on delete restrict,
  file_type text not null,
  file_name text not null,
  upload_date timestamptz not null default now(),
  assigned_quarter text not null,
  assigned_year integer not null,
  sheet_name text,
  relevant_cells_columns text,
  import_status text not null default 'offen',
  error_log text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quarterly_report_files_type_check check (file_type in ('Mieterliste', 'Verkehrswerte/VKW', 'CapEx/TDREV', 'Budget', 'Leerstand', 'Sonstige')),
  constraint quarterly_report_files_quarter_check check (assigned_quarter in ('Q1', 'Q2', 'Q3', 'Q4')),
  constraint quarterly_report_files_name_not_empty check (length(trim(file_name)) > 0),
  constraint quarterly_report_files_unique unique (quarterly_report_id, file_type, file_name)
);

create table if not exists public.quarterly_report_powerbi_links (
  id uuid primary key default gen_random_uuid(),
  quarterly_report_id uuid not null references public.quarterly_reports(id) on delete cascade,
  fund_id uuid not null references public.funds(id) on delete restrict,
  workspace text not null,
  report_dashboard text not null,
  dataset text not null,
  metric text not null,
  source_cell text,
  reporting_date date not null,
  value text,
  is_manual_override boolean not null default false,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quarterly_report_powerbi_metric_not_empty check (length(trim(metric)) > 0)
);

create table if not exists public.quarterly_report_values (
  id uuid primary key default gen_random_uuid(),
  quarterly_report_id uuid not null references public.quarterly_reports(id) on delete cascade,
  fund_id uuid not null references public.funds(id) on delete restrict,
  source_type text not null,
  source_id uuid,
  value_key text not null,
  value_label text,
  value_text text,
  value_number numeric,
  value_date date,
  unit text,
  is_manual_override boolean not null default false,
  checked_by text,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quarterly_report_values_source_type_check check (source_type in ('excel', 'powerbi', 'manual', 'mapping')),
  constraint quarterly_report_values_key_not_empty check (length(trim(value_key)) > 0),
  constraint quarterly_report_values_unique unique (quarterly_report_id, value_key)
);

create table if not exists public.quarterly_report_audit_log (
  id uuid primary key default gen_random_uuid(),
  quarterly_report_id uuid references public.quarterly_reports(id) on delete cascade,
  fund_id uuid references public.funds(id) on delete restrict,
  action text not null,
  area text not null,
  target_type text,
  target_id uuid,
  message text,
  details jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  constraint quarterly_report_audit_action_not_empty check (length(trim(action)) > 0)
);

create index if not exists funds_status_idx on public.funds(status);
create index if not exists quarterly_reports_fund_period_idx on public.quarterly_reports(fund_id, report_year, quarter);
create index if not exists quarterly_report_files_report_idx on public.quarterly_report_files(quarterly_report_id, fund_id);
create index if not exists quarterly_report_powerbi_report_idx on public.quarterly_report_powerbi_links(quarterly_report_id, fund_id);
create unique index if not exists quarterly_report_powerbi_unique_idx on public.quarterly_report_powerbi_links(quarterly_report_id, metric, coalesce(source_cell, ''));
create index if not exists quarterly_report_values_report_idx on public.quarterly_report_values(quarterly_report_id, fund_id);
create index if not exists quarterly_report_audit_report_idx on public.quarterly_report_audit_log(quarterly_report_id, fund_id);

alter table public.funds enable row level security;
alter table public.quarterly_reports enable row level security;
alter table public.quarterly_report_files enable row level security;
alter table public.quarterly_report_powerbi_links enable row level security;
alter table public.quarterly_report_values enable row level security;
alter table public.quarterly_report_audit_log enable row level security;

insert into public.funds (fund_name, fund_number, company, status, remark)
values
  ('Fonds 9', '9', 'Paribus', 'aktiv', 'Initialer Quartalsbericht-Fonds'),
  ('Fonds 22', '22', 'Paribus', 'aktiv', 'PowerBI-Beispielwerte G23, K23, M23, O23'),
  ('PAIF 1', 'PAIF 1', 'Paribus', 'aktiv', 'Initialer Quartalsbericht-Fonds'),
  ('PAIF 2', 'PAIF 2', 'Paribus', 'aktiv', 'Initialer Quartalsbericht-Fonds')
on conflict (fund_number) do update
set
  fund_name = excluded.fund_name,
  company = coalesce(public.funds.company, excluded.company),
  status = coalesce(public.funds.status, excluded.status),
  remark = coalesce(public.funds.remark, excluded.remark),
  updated_at = now();
