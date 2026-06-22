create table if not exists public.interpretation_memory (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text,
  owner_email text,
  scope text not null default 'global' check (scope in ('global', 'vendor', 'rfx', 'upload')),
  vendor_id uuid references public.vendors(id) on delete set null,
  vendor_domain text,
  rfx_hint text,
  raw_upload_id uuid references public.raw_uploads(id) on delete cascade,
  title text not null,
  instruction text not null,
  active boolean not null default true,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists interpretation_memory_owner_idx on public.interpretation_memory (owner_email, active, scope);
create index if not exists interpretation_memory_vendor_idx on public.interpretation_memory (vendor_id, vendor_domain);
create index if not exists interpretation_memory_rfx_idx on public.interpretation_memory (rfx_hint);

alter table public.interpretation_memory enable row level security;

create policy "authenticated users can read interpretation memory"
  on public.interpretation_memory for select
  to authenticated
  using (true);

insert into public.interpretation_memory (owner_email, scope, title, instruction)
values
  (null, 'global', 'Ignore shipper templates', 'Only extract the carrier submitted proposal/rates. Ignore heymarksman.com, Marksman, and shipper template/layout rows.'),
  (null, 'global', 'Roundtrip explicit only', 'Roundtrip only when RT, Round Trip, Roundtrip, or viaje redondo is explicitly stated. Otherwise use One Way.'),
  (null, 'global', 'Mexico operating perspective', 'Use Mexico operating perspective: MX to US/CA is D2D Export, US/CA to MX is D2D Import.'),
  (null, 'global', 'Extract every priced row', 'Re-read every visible table row and priced cell. Do not summarize by state, market, or destination group.')
on conflict do nothing;
