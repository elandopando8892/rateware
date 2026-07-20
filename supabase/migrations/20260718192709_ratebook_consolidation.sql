-- Consolidated Ratebook layer for RFx Process packages.
-- A Ratebook is a curated operational view over an RFx package. It deliberately
-- reuses rfx_lane_vendors invitation tokens so carrier access remains one
-- private Bid Room per carrier, instead of creating a second bid portal.

alter table public.rfx_lanes
  add column if not exists source_rfx_demand_lane_id uuid references public.rfx_demand_lanes(id) on delete set null;

create index if not exists rfx_lanes_source_rfx_demand_lane_id_idx
  on public.rfx_lanes(source_rfx_demand_lane_id);

create table if not exists public.rfx_ratebooks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  organization_id text,
  project_id uuid not null references public.rfx_projects(id) on delete cascade,
  rfx_package_id uuid not null references public.rfx_packages(id) on delete cascade,
  rfx_event_id uuid references public.rfx_events(id) on delete set null,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'ready', 'shared', 'archived')),
  lane_count integer not null default 0,
  shared_carrier_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  unique(owner_email, rfx_package_id)
);

create index if not exists rfx_ratebooks_owner_updated_idx
  on public.rfx_ratebooks(owner_email, updated_at desc);
create index if not exists rfx_ratebooks_project_idx
  on public.rfx_ratebooks(project_id);
create index if not exists rfx_ratebooks_event_idx
  on public.rfx_ratebooks(rfx_event_id);

create table if not exists public.rfx_ratebook_shares (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  organization_id text,
  ratebook_id uuid not null references public.rfx_ratebooks(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  primary_rfx_lane_vendor_id uuid references public.rfx_lane_vendors(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived', 'revoked')),
  last_viewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(ratebook_id, vendor_id)
);

create index if not exists rfx_ratebook_shares_ratebook_idx
  on public.rfx_ratebook_shares(ratebook_id, status);
create index if not exists rfx_ratebook_shares_vendor_idx
  on public.rfx_ratebook_shares(vendor_id, status);

alter table public.rfx_ratebooks enable row level security;
alter table public.rfx_ratebook_shares enable row level security;

drop policy if exists "authenticated users can access ratebooks" on public.rfx_ratebooks;
create policy "authenticated users can access ratebooks"
  on public.rfx_ratebooks for all to authenticated
  using (lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "authenticated users can access ratebook shares" on public.rfx_ratebook_shares;
create policy "authenticated users can access ratebook shares"
  on public.rfx_ratebook_shares for all to authenticated
  using (lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', '')));
