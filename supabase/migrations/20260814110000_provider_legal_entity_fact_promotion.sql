-- Provider Service Build 24: reviewed facts with provenance and guarded supersession.
create table if not exists public.provider_legal_entity_fact_promotions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  review_id uuid not null,
  expected_review_revision integer not null,
  promotion_status text not null default 'pending',
  promoted_fact_count integer not null default 0,
  unchanged_fact_count integer not null default 0,
  conflict_fact_count integer not null default 0,
  promoted_by_actor_id text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint provider_entity_fact_promotions_entity_fkey foreign key (organization_id,legal_entity_id)
    references public.legal_entities(organization_id,id) on delete restrict,
  constraint provider_entity_fact_promotions_review_fkey foreign key (organization_id,review_id)
    references public.provider_entity_document_reviews(organization_id,id) on delete restrict,
  constraint provider_entity_fact_promotions_review_unique unique (organization_id,review_id),
  constraint provider_entity_fact_promotions_revision_check check (expected_review_revision>0),
  constraint provider_entity_fact_promotions_status_check check (promotion_status in ('pending','applied','conflict','failed')),
  constraint provider_entity_fact_promotions_counts_check check (promoted_fact_count>=0 and unchanged_fact_count>=0 and conflict_fact_count>=0),
  constraint provider_entity_fact_promotions_actor_check check (btrim(promoted_by_actor_id)<>'')
);

create table if not exists public.provider_legal_entity_facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  field_code text not null,
  fact_value jsonb not null,
  fact_value_sha256 text not null,
  sensitivity text not null,
  fact_status text not null default 'current',
  source_review_id uuid not null,
  source_review_field_id uuid not null,
  source_promotion_id uuid not null,
  effective_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by_fact_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint provider_legal_entity_facts_org_id_unique unique (organization_id,id),
  constraint provider_legal_entity_facts_entity_fkey foreign key (organization_id,legal_entity_id)
    references public.legal_entities(organization_id,id) on delete restrict,
  constraint provider_legal_entity_facts_review_fkey foreign key (organization_id,source_review_id)
    references public.provider_entity_document_reviews(organization_id,id) on delete restrict,
  constraint provider_legal_entity_facts_field_fkey foreign key (organization_id,source_review_field_id)
    references public.provider_entity_document_review_fields(organization_id,id) on delete restrict,
  constraint provider_legal_entity_facts_promotion_fkey foreign key (source_promotion_id)
    references public.provider_legal_entity_fact_promotions(id) on delete restrict,
  constraint provider_legal_entity_facts_superseded_fkey foreign key (organization_id,superseded_by_fact_id)
    references public.provider_legal_entity_facts(organization_id,id) on delete restrict,
  constraint provider_legal_entity_facts_code_check check (field_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_legal_entity_facts_hash_check check (fact_value_sha256 ~ '^[0-9a-f]{64}$'),
  constraint provider_legal_entity_facts_sensitivity_check check (sensitivity in ('public','internal','confidential','restricted','highly_restricted')),
  constraint provider_legal_entity_facts_status_check check (fact_status in ('current','superseded','withdrawn')),
  constraint provider_legal_entity_facts_supersession_check
    check ((fact_status='current' and superseded_at is null and superseded_by_fact_id is null)
      or fact_status<>'current')
);
create unique index if not exists provider_legal_entity_facts_current_unique
  on public.provider_legal_entity_facts (organization_id,legal_entity_id,field_code)
  where fact_status='current';
create index if not exists provider_legal_entity_facts_history_idx
  on public.provider_legal_entity_facts (organization_id,legal_entity_id,field_code,effective_at desc);

create table if not exists public.provider_legal_entity_fact_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  fact_id uuid,
  promotion_id uuid not null references public.provider_legal_entity_fact_promotions(id) on delete restrict,
  event_type text not null,
  field_code text not null,
  actor_id text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint provider_legal_entity_fact_events_entity_fkey foreign key (organization_id,legal_entity_id)
    references public.legal_entities(organization_id,id) on delete restrict,
  constraint provider_legal_entity_fact_events_fact_fkey foreign key (organization_id,fact_id)
    references public.provider_legal_entity_facts(organization_id,id) on delete restrict,
  constraint provider_legal_entity_fact_events_type_check check (event_type in ('fact_promoted','fact_unchanged','fact_superseded','fact_conflict','field_withheld')),
  constraint provider_legal_entity_fact_events_code_check check (field_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_legal_entity_fact_events_actor_check check (btrim(actor_id)<>'')
);
alter table public.provider_legal_entity_fact_promotions enable row level security;
alter table public.provider_legal_entity_facts enable row level security;
alter table public.provider_legal_entity_fact_events enable row level security;
revoke all on table public.provider_legal_entity_fact_promotions from public,anon,authenticated,service_role;
revoke all on table public.provider_legal_entity_facts from public,anon,authenticated,service_role;
revoke all on table public.provider_legal_entity_fact_events from public,anon,authenticated,service_role;
