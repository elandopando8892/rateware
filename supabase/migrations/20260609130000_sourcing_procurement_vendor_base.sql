alter table public.vendors
  add column if not exists base_stage text not null default 'sourcing',
  add column if not exists archived_at timestamptz,
  add column if not exists source_spreadsheet_url text,
  add column if not exists source_spreadsheet_id text,
  add column if not exists source_sheet_gid text,
  add column if not exists source_sheet_name text,
  add column if not exists source_row_number integer,
  add column if not exists source_row_hash text,
  add column if not exists last_synced_at timestamptz,
  add column if not exists sync_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.vendors'::regclass
      and conname = 'vendors_base_stage_check'
  ) then
    alter table public.vendors
      add constraint vendors_base_stage_check
      check (base_stage in ('sourcing', 'procurement', 'archived'));
  end if;
end $$;

create index if not exists vendors_base_stage_idx on public.vendors (base_stage);
create index if not exists vendors_source_sheet_idx on public.vendors (source_spreadsheet_id, source_sheet_gid);
