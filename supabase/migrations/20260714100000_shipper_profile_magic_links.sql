-- Public Shipper Profile links update the existing Shipper CRM account. They are
-- intentionally separate from the internal drawer so there is one account source of truth.
create table if not exists public.shipper_profile_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  shipper_id uuid not null references public.shippers(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'active'
    check (status in ('active', 'viewed', 'submitted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  viewed_at timestamptz,
  submitted_at timestamptz,
  submitted_contact jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists shipper_profile_requests_owner_shipper_idx
  on public.shipper_profile_requests (owner_email, shipper_id, created_at desc);
create index if not exists shipper_profile_requests_token_hash_idx
  on public.shipper_profile_requests (token_hash);

create table if not exists public.shipper_profile_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_email text not null,
  organization_id text,
  shipper_id uuid not null references public.shippers(id) on delete cascade,
  request_id uuid not null references public.shipper_profile_requests(id) on delete cascade,
  submitted_contact jsonb not null default '{}'::jsonb,
  patch jsonb not null default '{}'::jsonb
);

create index if not exists shipper_profile_submissions_owner_shipper_idx
  on public.shipper_profile_submissions (owner_email, shipper_id, created_at desc);

alter table public.shipper_profile_requests enable row level security;
alter table public.shipper_profile_submissions enable row level security;

create policy "workspace users can read shipper profile requests"
  on public.shipper_profile_requests for select to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or organization_id = coalesce(auth.jwt() ->> 'organization_id', '')
  );

create policy "workspace users can read shipper profile submissions"
  on public.shipper_profile_submissions for select to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or organization_id = coalesce(auth.jwt() ->> 'organization_id', '')
  );
