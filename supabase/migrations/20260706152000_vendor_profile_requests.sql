create table if not exists public.vendor_profile_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  request_token text not null default md5(random()::text || clock_timestamp()::text),
  status text not null default 'active'
    check (status in ('active', 'viewed', 'submitted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  viewed_at timestamptz,
  submitted_at timestamptz,
  submitted_contact jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  constraint vendor_profile_requests_token_unique unique (request_token)
);

create index if not exists vendor_profile_requests_owner_idx
  on public.vendor_profile_requests (owner_email, created_at desc);

create index if not exists vendor_profile_requests_vendor_idx
  on public.vendor_profile_requests (vendor_id, created_at desc);

create index if not exists vendor_profile_requests_token_idx
  on public.vendor_profile_requests (request_token);

alter table public.vendor_profile_requests enable row level security;

create policy "authenticated users can read vendor profile requests"
  on public.vendor_profile_requests for select
  to authenticated
  using (true);
