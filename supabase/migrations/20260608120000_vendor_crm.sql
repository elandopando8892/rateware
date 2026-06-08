create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  vendor_name text not null,
  legal_name text,
  domain text,
  contact_name text,
  primary_email text,
  secondary_emails text[] not null default '{}',
  whatsapp_phone text,
  preferred_channel text not null default 'email' check (preferred_channel in ('email', 'whatsapp', 'portal')),
  status text not null default 'active' check (status in ('active', 'invited', 'blocked', 'inactive')),
  notes text,
  source text not null default 'manual',
  constraint vendors_name_or_domain_unique unique (vendor_name, domain)
);

alter table public.vendors
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists vendor_name text,
  add column if not exists legal_name text,
  add column if not exists domain text,
  add column if not exists contact_name text,
  add column if not exists primary_email text,
  add column if not exists secondary_emails text[] default '{}',
  add column if not exists whatsapp_phone text,
  add column if not exists preferred_channel text default 'email',
  add column if not exists status text default 'active',
  add column if not exists notes text,
  add column if not exists source text default 'manual';

alter table public.raw_uploads
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null;

alter table public.rate_staging
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null;

create index if not exists vendors_created_at_idx on public.vendors (created_at desc);
create index if not exists vendors_vendor_name_idx on public.vendors (vendor_name);
create index if not exists vendors_domain_idx on public.vendors (domain);
create index if not exists vendors_status_idx on public.vendors (status);
create index if not exists raw_uploads_vendor_id_idx on public.raw_uploads (vendor_id);
create index if not exists rate_staging_vendor_id_idx on public.rate_staging (vendor_id);

alter table public.vendors enable row level security;

create policy "authenticated users can read vendors"
  on public.vendors for select
  to authenticated
  using (true);
