-- Procurement review is intentionally separate from carrier-submitted offers.
-- A shortlist decision is not an award and never promotes a rate to Rateware.

create table if not exists public.rfx_ratebook_quote_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ratebook_id uuid not null references public.rfx_ratebooks(id) on delete cascade,
  package_lane_id uuid not null references public.rfx_package_lanes(id) on delete cascade,
  quote_id uuid not null references public.rfx_ratebook_carrier_quotes(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  owner_email text,
  organization_id text,
  decision text not null default 'pending' check (decision in ('pending', 'shortlisted', 'not_selected')),
  decision_note text,
  decided_at timestamptz,
  decided_by_email text,
  metadata jsonb not null default '{}'::jsonb,
  unique (quote_id)
);

create index if not exists rfx_ratebook_quote_reviews_lane_idx
  on public.rfx_ratebook_quote_reviews (ratebook_id, package_lane_id, decision, updated_at desc);
create index if not exists rfx_ratebook_quote_reviews_vendor_idx
  on public.rfx_ratebook_quote_reviews (vendor_id, decision, updated_at desc);

-- Decisions are workspace-scoped and must only be made through rateware-api.
alter table public.rfx_ratebook_quote_reviews enable row level security;
