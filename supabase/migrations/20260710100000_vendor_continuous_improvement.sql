create table if not exists public.vendor_value_scorecards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  tier text not null default 'tactical' check (tier in ('watchlist', 'tactical', 'strategic', 'collaborative')),
  value_score numeric not null default 0 check (value_score >= 0 and value_score <= 100),
  operational_score numeric not null default 0 check (operational_score >= 0 and operational_score <= 100),
  commercial_score numeric not null default 0 check (commercial_score >= 0 and commercial_score <= 100),
  financial_score numeric not null default 0 check (financial_score >= 0 and financial_score <= 100),
  compliance_score numeric not null default 0 check (compliance_score >= 0 and compliance_score <= 100),
  technology_score numeric not null default 0 check (technology_score >= 0 and technology_score <= 100),
  relationship_score numeric not null default 0 check (relationship_score >= 0 and relationship_score <= 100),
  attributes jsonb not null default '{}'::jsonb,
  notes text,
  last_scored_at timestamptz default now(),
  constraint vendor_value_scorecards_owner_vendor_unique unique (owner_email, vendor_id)
);

create table if not exists public.vendor_improvement_cases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  title text not null,
  description text,
  case_type text not null default 'service_quality'
    check (case_type in ('service_quality', 'cost_variance', 'capacity_commitment', 'compliance', 'documentation', 'technology', 'claims', 'billing', 'communication', 'strategic_growth')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'define', 'measure', 'analyze', 'improve', 'control', 'resolved', 'archived')),
  methodology text not null default 'dmaic' check (methodology in ('dmaic', '8d', 'capa', 'kaizen', 'a3')),
  tier_at_open text check (tier_at_open is null or tier_at_open in ('watchlist', 'tactical', 'strategic', 'collaborative')),
  target_tier text check (target_tier is null or target_tier in ('watchlist', 'tactical', 'strategic', 'collaborative')),
  vendor_request text,
  owner_notes text,
  root_cause text,
  containment_action text,
  corrective_action text,
  preventive_action text,
  success_metric text,
  due_date date,
  closed_at timestamptz,
  source text not null default 'manual',
  source_ref text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists vendor_value_scorecards_owner_tier_idx
  on public.vendor_value_scorecards (owner_email, tier, value_score desc);

create index if not exists vendor_value_scorecards_vendor_idx
  on public.vendor_value_scorecards (vendor_id);

create index if not exists vendor_improvement_cases_owner_status_idx
  on public.vendor_improvement_cases (owner_email, status, updated_at desc);

create index if not exists vendor_improvement_cases_vendor_idx
  on public.vendor_improvement_cases (vendor_id, status);

create index if not exists vendor_improvement_cases_due_idx
  on public.vendor_improvement_cases (owner_email, due_date)
  where status not in ('resolved', 'archived');

alter table public.vendor_value_scorecards enable row level security;
alter table public.vendor_improvement_cases enable row level security;

create policy "authenticated users can manage vendor value scorecards"
  on public.vendor_value_scorecards for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can manage vendor improvement cases"
  on public.vendor_improvement_cases for all
  to authenticated
  using (true)
  with check (true);
