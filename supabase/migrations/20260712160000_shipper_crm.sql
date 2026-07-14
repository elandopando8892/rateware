create table if not exists public.shippers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  shipper_name text not null,
  legal_name text,
  domain text,
  website text,
  logo_url text,
  industry text,
  status text not null default 'prospect'
    check (status in ('prospect', 'active', 'inactive', 'archived')),
  relationship_stage text not null default 'target'
    check (relationship_stage in ('target', 'qualified', 'customer', 'at_risk', 'inactive')),
  segment text,
  revenue_tier text,
  account_owner_email text,
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  headquarters_city text,
  headquarters_state text,
  headquarters_country text,
  tags text[] not null default '{}'::text[],
  notes text,
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.shipper_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  shipper_id uuid not null references public.shippers(id) on delete cascade,
  contact_name text not null,
  title text,
  department text,
  email text,
  phone text,
  whatsapp_phone text,
  preferred_channel text,
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.shipper_locations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  shipper_id uuid not null references public.shippers(id) on delete cascade,
  location_name text not null,
  location_type text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state_code text,
  country_code text,
  postal_code text,
  market text,
  region text,
  contact_name text,
  contact_email text,
  contact_phone text,
  operating_hours text,
  appointment_required boolean not null default false,
  handling_type text,
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.shipper_lanes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  shipper_id uuid not null references public.shippers(id) on delete cascade,
  lane_name text,
  origin text not null,
  origin_postal_code text,
  origin_state_code text,
  origin_market text,
  origin_region text,
  destination text not null,
  destination_postal_code text,
  destination_state_code text,
  destination_market text,
  destination_region text,
  equipment text,
  trailer text,
  configuration text,
  operation text,
  service text,
  weekly_volume numeric,
  current_rate numeric,
  currency text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.shipper_rfis (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  shipper_id uuid not null references public.shippers(id) on delete cascade,
  rfi_name text not null,
  external_reference text,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'in_progress', 'submitted', 'approved', 'archived')),
  due_date date,
  source_url text,
  response jsonb not null default '{}'::jsonb,
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.shipper_opportunities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  shipper_id uuid not null references public.shippers(id) on delete cascade,
  opportunity_name text not null,
  stage text not null default 'identified'
    check (stage in ('identified', 'discovery', 'rfi', 'rfx', 'proposal', 'negotiation', 'won', 'lost', 'archived')),
  probability numeric not null default 0 check (probability >= 0 and probability <= 100),
  estimated_value numeric,
  currency text,
  estimated_weekly_volume numeric,
  target_margin numeric,
  due_date date,
  next_action text,
  account_owner_email text,
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists shippers_owner_updated_idx
  on public.shippers (owner_email, updated_at desc);
create index if not exists shippers_owner_status_idx
  on public.shippers (owner_email, status, relationship_stage);
create index if not exists shippers_owner_name_idx
  on public.shippers (owner_email, lower(shipper_name));
create unique index if not exists shippers_owner_domain_unique_idx
  on public.shippers (owner_email, lower(domain))
  where domain is not null and btrim(domain) <> '' and status <> 'archived';

create index if not exists shipper_contacts_owner_shipper_idx
  on public.shipper_contacts (owner_email, shipper_id, is_primary desc, contact_name);
create index if not exists shipper_locations_owner_shipper_idx
  on public.shipper_locations (owner_email, shipper_id, location_name);
create index if not exists shipper_lanes_owner_shipper_idx
  on public.shipper_lanes (owner_email, shipper_id, status, updated_at desc);
create index if not exists shipper_rfis_owner_shipper_idx
  on public.shipper_rfis (owner_email, shipper_id, status, updated_at desc);
create index if not exists shipper_opportunities_owner_shipper_idx
  on public.shipper_opportunities (owner_email, shipper_id, stage, updated_at desc);

alter table public.shippers enable row level security;
alter table public.shipper_contacts enable row level security;
alter table public.shipper_locations enable row level security;
alter table public.shipper_lanes enable row level security;
alter table public.shipper_rfis enable row level security;
alter table public.shipper_opportunities enable row level security;

create policy "workspace users can manage shippers"
  on public.shippers for all to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  )
  with check (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  );
create policy "workspace users can manage shipper contacts"
  on public.shipper_contacts for all to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  )
  with check (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  );
create policy "workspace users can manage shipper locations"
  on public.shipper_locations for all to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  )
  with check (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  );
create policy "workspace users can manage shipper lanes"
  on public.shipper_lanes for all to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  )
  with check (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  );
create policy "workspace users can manage shipper rfis"
  on public.shipper_rfis for all to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  )
  with check (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  );
create policy "workspace users can manage shipper opportunities"
  on public.shipper_opportunities for all to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  )
  with check (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  );
