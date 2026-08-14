-- Provider Service Build 5: explainable provider-resolution candidates.

create table if not exists public.provider_communication_match_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  thread_id uuid not null,
  legal_entity_id uuid not null,
  provider_relationship_id uuid not null,
  match_basis text not null,
  confidence numeric not null,
  candidate_status text not null default 'candidate',
  evidence jsonb not null default '{}'::jsonb,
  evaluated_by text not null default 'system',
  evaluated_at timestamptz not null default now(),
  resolved_by_user_id text,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_communication_match_candidates_org_id_unique unique (organization_id, id),
  constraint provider_communication_match_candidates_thread_fkey
    foreign key (organization_id, thread_id, legal_entity_id)
    references public.provider_communication_threads(organization_id, id, legal_entity_id)
    on delete cascade,
  constraint provider_communication_match_candidates_relationship_fkey
    foreign key (organization_id, provider_relationship_id, legal_entity_id)
    references public.provider_relationships(organization_id, id, legal_entity_id)
    on delete restrict,
  constraint provider_communication_match_candidates_unique
    unique (organization_id, thread_id, provider_relationship_id, match_basis),
  constraint provider_communication_match_candidates_basis_check
    check (match_basis in ('existing_thread', 'exact_email', 'verified_contact', 'email_domain', 'legal_name', 'mc', 'dot', 'ein', 'rfc', 'phone', 'address')),
  constraint provider_communication_match_candidates_confidence_check
    check (confidence >= 0 and confidence <= 1),
  constraint provider_communication_match_candidates_status_check
    check (candidate_status in ('candidate', 'selected', 'rejected', 'expired')),
  constraint provider_communication_match_candidates_evaluator_check
    check (evaluated_by in ('system', 'agent', 'integration', 'user')),
  constraint provider_communication_match_candidates_resolved_check check (
    candidate_status not in ('selected', 'rejected')
    or (
      resolved_at is not null
      and nullif(btrim(coalesce(resolved_by_user_id, '')), '') is not null
    )
  )
);

create index if not exists provider_communication_match_candidates_thread_idx
  on public.provider_communication_match_candidates (thread_id, candidate_status, confidence desc, created_at desc);
