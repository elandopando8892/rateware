alter table public.shipper_opportunities
  add column if not exists rfx_project_id uuid references public.rfx_projects(id) on delete set null;

create unique index if not exists shipper_opportunities_owner_rfx_project_unique_idx
  on public.shipper_opportunities (owner_email, rfx_project_id)
  where rfx_project_id is not null;

create index if not exists shipper_opportunities_owner_rfx_project_idx
  on public.shipper_opportunities (owner_email, rfx_project_id, updated_at desc)
  where rfx_project_id is not null;
